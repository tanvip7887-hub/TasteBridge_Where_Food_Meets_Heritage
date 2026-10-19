[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Backup', 'Restore')]
    [string] $Mode,

    [string] $PgBinDirectory,
    [string] $BackupDirectory,
    [string] $ArchivePath,
    [string] $ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Run in PowerShell 7. This script intentionally has no migration, drop, reset,
# overwrite, or automatic failed-database cleanup operation.
$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$script:BackendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$script:EnvPath = Join-Path $script:BackendRoot '.env'
$script:SourceDatabase = 'tastebridge'
$script:RequiredPort = 5432
$script:RequiredPostgresMajor = 18
$script:LongOperationTimeoutSeconds = 28800 # Eight hours; timeout preserves artifacts and never cleans up a partial operation.
$script:KnownMigrationNames = @()
$script:RepositoryModelTables = @()
$script:MigrationSqlByName = @{}
$script:MigrationChecksumByName = @{}
$script:PgTools = @{}
$script:NativeDirectoryType = $null
$script:Connection = $null
$script:PassFile = $null
$script:WorkDirectory = $null
$script:RestoreTarget = $null

function Stop-Safely([string] $Message) {
    throw $Message
}

function Test-PathWithin {
    param([string] $Path, [string] $Root)

    $pathFull = [IO.Path]::GetFullPath($Path)
    $rootFull = [IO.Path]::GetFullPath($Root)
    $relative = [IO.Path]::GetRelativePath($rootFull, $pathFull)
    return -not (
        [IO.Path]::IsPathRooted($relative) -or
        $relative -eq '..' -or
        $relative.StartsWith('..' + [IO.Path]::DirectorySeparatorChar, [StringComparison]::Ordinal) -or
        $relative.StartsWith('..' + [IO.Path]::AltDirectorySeparatorChar, [StringComparison]::Ordinal)
    )
}

function Resolve-ContainedPath {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][string] $Root)

    $pathFull = [IO.Path]::GetFullPath($Path)
    if (-not (Test-PathWithin -Path $pathFull -Root $Root)) {
        Stop-Safely 'The selected backup path escapes the configured backup directory.'
    }
    if ($pathFull -eq [IO.Path]::GetFullPath($Root)) {
        Stop-Safely 'A backup file path cannot be the backup directory itself.'
    }
    return $pathFull
}

function Assert-NoReparsePointInPath {
    param([Parameter(Mandatory)][string] $Path)

    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    if ([string]::IsNullOrWhiteSpace($root) -or $root.StartsWith('\\', [StringComparison]::Ordinal)) {
        Stop-Safely 'UNC and unmapped paths are not allowed for backup or restore artifacts.'
    }

    $cursor = $root
    $tail = $full.Substring($root.Length).Split([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringSplitOptions]::RemoveEmptyEntries)
    foreach ($part in $tail) {
        $cursor = Join-Path $cursor $part
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Stop-Safely "Reparse point detected in protected path: $cursor"
            }
        }
    }
}

function Assert-RepositoryInventory {
    $migrationRoot = Join-Path $script:BackendRoot 'prisma/migrations'
    $migrationDirectories = @(Get-ChildItem -LiteralPath $migrationRoot -Directory | Sort-Object -Property Name)
    if ($migrationDirectories.Count -eq 0) { Stop-Safely 'No Prisma migration directories were found.' }
    $names = [Collections.Generic.List[string]]::new()
    $sqlByName = @{}
    $checksumByName = @{}
    foreach ($directory in $migrationDirectories) {
        if ($directory.Name -notmatch '^\d{14}_[a-z0-9_]+$') { Stop-Safely "Unexpected migration directory name: $($directory.Name)" }
        $migrationFile = Join-Path $directory.FullName 'migration.sql'
        if (-not (Test-Path -LiteralPath $migrationFile -PathType Leaf)) { Stop-Safely "Migration SQL is missing: $($directory.Name)" }
        $names.Add($directory.Name)
        $sqlByName[$directory.Name] = [IO.File]::ReadAllText($migrationFile)
        $checksumByName[$directory.Name] = (Get-FileHash -LiteralPath $migrationFile -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    if (@($names | Select-Object -Unique).Count -ne $names.Count) { Stop-Safely 'Duplicate Prisma migration directory names were found.' }

    $lockPath = Join-Path $migrationRoot 'migration_lock.toml'
    if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf) -or
        (Get-Content -LiteralPath $lockPath -Raw) -notmatch '(?m)^provider\s*=\s*"postgresql"\s*$') {
        Stop-Safely 'The Prisma migration provider is missing or is not PostgreSQL.'
    }

    $schemaPath = Join-Path $script:BackendRoot 'prisma/schema.prisma'
    $schema = Get-Content -LiteralPath $schemaPath -Raw
    if ([regex]::IsMatch($schema, '(?m)^\s*@@(?:map|schema)\b')) { Stop-Safely 'Prisma model mappings are present; table inventory requires review.' }
    $models = @([regex]::Matches($schema, '(?m)^model\s+(\w+)\s*\{') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -CaseSensitive)
    if ($models.Count -eq 0 -or @($models | Select-Object -Unique).Count -ne $models.Count -or $models -contains '_prisma_migrations') {
        Stop-Safely 'Prisma model names are empty, duplicated, or conflict with the migration-history table.'
    }
    $script:KnownMigrationNames = @($names)
    $script:RepositoryModelTables = @($models)
    $script:MigrationSqlByName = $sqlByName
    $script:MigrationChecksumByName = $checksumByName
}

function Assert-LocalFixedPath {
    param([Parameter(Mandatory)][string] $Path)

    Assert-NoReparsePointInPath -Path $Path
    $fullPath = [IO.Path]::GetFullPath($Path)
    foreach ($syncVariable in @('OneDrive', 'OneDriveCommercial', 'OneDriveConsumer')) {
        $syncRoot = [Environment]::GetEnvironmentVariable($syncVariable)
        if ($syncRoot -and (Test-PathWithin -Path $fullPath -Root $syncRoot)) {
            Stop-Safely 'Known OneDrive-synchronized paths are not accepted for backup or PostgreSQL data.'
        }
    }
    if (($fullPath -split '[\\/]') -contains 'OneDrive') { Stop-Safely 'Known OneDrive-synchronized paths are not accepted.' }
    $root = [IO.Path]::GetPathRoot($fullPath)
    try { $drive = [IO.DriveInfo]::new($root) } catch { Stop-Safely 'Cannot map the path to a local Windows volume.' }
    if (-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed) {
        Stop-Safely 'Backup and PostgreSQL data paths must map to a ready local fixed volume.'
    }
    return $drive
}

function Set-And-AssertPrivateAcl {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][bool] $IsDirectory)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $identity) { Stop-Safely 'Cannot determine the current Windows user SID.' }
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existing) }
    $inheritance = if ($IsDirectory) {
        [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    } else { [Security.AccessControl.InheritanceFlags]::None }
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl

    $verified = Get-Acl -LiteralPath $Path
    $rules = @($verified.Access)
    if ($rules.Count -ne 1 -or
        $rules[0].IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value -or
        $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        ($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl -or
        $rules[0].IsInherited) {
        Stop-Safely "ACL verification failed for: $Path"
    }
}

function New-DirectoryAtomically {
    param([Parameter(Mandatory)][string] $Path)
    if (-not $script:NativeDirectoryType) {
        $existingType = [AppDomain]::CurrentDomain.GetAssemblies() | ForEach-Object { $_.GetType('TasteBridgeBackup.NativeDirectory', $false) } | Where-Object { $_ } | Select-Object -First 1
        if ($existingType) { $script:NativeDirectoryType = $existingType }
    }
    if (-not $script:NativeDirectoryType) {
        $script:NativeDirectoryType = Add-Type -PassThru -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace TasteBridgeBackup {
    public static class NativeDirectory {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CreateDirectoryW(string path, IntPtr securityAttributes);
    }
}
'@ -ErrorAction Stop
    }
    $method = $script:NativeDirectoryType.GetMethod('CreateDirectoryW')
    $created = [bool]$method.Invoke($null, [object[]]@($Path, [IntPtr]::Zero))
    if ($created) { return $true }
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($code -eq 183) { return $false }
    throw [ComponentModel.Win32Exception]::new($code, 'Could not create protected directory.')
}

function New-PrivateRunDirectory {
    param([Parameter(Mandatory)][string] $Parent)

    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        $candidate = Join-Path $Parent ('tastebridge-run-' + [Guid]::NewGuid().ToString('N'))
        if (-not (New-DirectoryAtomically -Path $candidate)) { continue }
        try { Set-And-AssertPrivateAcl -Path $candidate -IsDirectory $true }
        catch { Write-Warning "New run directory was preserved after ACL failure: $candidate"; throw }
        return $candidate
    }
    Stop-Safely 'Could not allocate a unique run directory. Nothing was overwritten.'
}

function Assert-FilePrivateAcl {
    param([Parameter(Mandatory)][string] $Path)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $Path
    $rules = @($acl.Access)
    if ($rules.Count -ne 1 -or
        $rules[0].IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value -or
        $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        ($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        Stop-Safely "File ACL verification failed for: $Path"
    }
}

function Set-And-AssertBackupRootAcl {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][bool] $Created)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $identity) { Stop-Safely 'Cannot determine the current Windows user SID.' }
    $allowedSids = @($identity.Value, 'S-1-5-18', 'S-1-5-32-544')
    if ($Created) {
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($existing in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existing) }
        $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
        foreach ($sid in $allowedSids) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sid),
                [Security.AccessControl.FileSystemRights]::FullControl,
                $inheritance,
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow
            )
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $Path -AclObject $acl
    }

    $verified = Get-Acl -LiteralPath $Path
    $rules = @($verified.Access)
    $actualSids = @($rules | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
    $expectedSids = @($allowedSids | Sort-Object -Unique)
    if (($actualSids -join '|') -cne ($expectedSids -join '|') -or $rules.Count -ne $expectedSids.Count) {
        Stop-Safely "Backup directory ACL is not limited to the current user, LocalSystem, and Administrators: $Path"
    }
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $expectedSids -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) {
            Stop-Safely "Backup directory ACL contains an unexpected or insufficient rule: $Path"
        }
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string] $Executable,
        [Parameter(Mandatory)][string[]] $Arguments,
        [string] $InputText,
        [ValidateRange(1, 86400)][int] $TimeoutSeconds = 1800,
        [switch] $QuietDiagnostics
    )

    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Executable
    $start.WorkingDirectory = $script:BackendRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $start.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $start.RedirectStandardInput = $null -ne $InputText
    foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
    if ($script:PassFile) { $start.Environment['PGPASSFILE'] = $script:PassFile }
    if ($script:Connection) { $start.Environment['PGUSER'] = $script:Connection.Username }
    [void]$start.Environment.Remove('PGPASSWORD')
    [void]$start.Environment.Remove('PGSERVICE')
    [void]$start.Environment.Remove('PGSERVICEFILE')
    [void]$start.Environment.Remove('PGOPTIONS')
    [void]$start.Environment.Remove('PGHOSTADDR')
    $start.Environment['PGCONNECT_TIMEOUT'] = '10'
    $start.Environment['PGCLIENTENCODING'] = 'UTF8'

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    $started = $false
    $stdoutTask = $null
    $stderrTask = $null
    try {
        if (-not $process.Start()) { Stop-Safely "Could not start native process: $Executable" }
        $started = $true
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if ($null -ne $InputText) {
            $process.StandardInput.Write($InputText)
            $process.StandardInput.Close()
        }

        $exited = if ($TimeoutSeconds -gt 0) { $process.WaitForExit($TimeoutSeconds * 1000) } else { $process.WaitForExit(); $true }
        if (-not $exited) {
            try { $process.Kill($true) } catch { Stop-Safely "Timed out and could not terminate process tree for ${Executable}: $($_.Exception.GetType().Name)" }
            if (-not $process.WaitForExit(15000)) { Stop-Safely "Timed out process is still running: $Executable" }
            if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask), 15000)) { Stop-Safely "Timed out process output did not close: $Executable" }
            Stop-Safely "Native process timed out after $TimeoutSeconds seconds: $Executable"
        }
        if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask), 30000)) {
            try { if (-not $process.HasExited) { $process.Kill($true) } } catch { }
            if ($process.HasExited) { try { [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask), 15000) } catch { } }
            Stop-Safely "Native process output did not close: $Executable"
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($script:Connection -and $script:Connection.Password) {
            $stderr = $stderr.Replace($script:Connection.Password, '[REDACTED]')
            $stdout = $stdout.Replace($script:Connection.Password, '[REDACTED]')
        }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
    } catch {
        if ($started -and -not $process.HasExited) {
            try {
                $process.Kill($true)
                if (-not $process.WaitForExit(15000)) { Write-Warning "Could not confirm process termination: $Executable" }
            } catch { Write-Warning "Could not terminate process tree for $Executable; inspect it manually." }
        }
        throw
    } finally {
        $process.Dispose()
    }
}

function Assert-NativeSuccess {
    param([Parameter(Mandatory)] $Result, [Parameter(Mandatory)][string] $Operation)
    if ($Result.ExitCode -ne 0) {
        $detail = if ($Result.Stderr.Trim()) { $Result.Stderr.Trim() } else { $Result.Stdout.Trim() }
        if ($detail.Length -gt 6000) { $detail = $detail.Substring(0, 6000) + ' [truncated]' }
        Stop-Safely "$Operation failed with exit code $($Result.ExitCode). $detail"
    }
}

function Get-DatabaseUrlFromDotEnv {
    if (-not (Test-Path -LiteralPath $script:EnvPath -PathType Leaf)) { Stop-Safely 'backend/.env is missing.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $parser = "const fs=require('fs');const d=require('dotenv').parse(fs.readFileSync(process.argv[1]));if(!d.DATABASE_URL)process.exit(4);process.stdout.write(JSON.stringify(d.DATABASE_URL));"
    $result = Invoke-Native -Executable $node -Arguments @('-e', $parser, $script:EnvPath) -TimeoutSeconds 15 -QuietDiagnostics
    if ($result.ExitCode -ne 0) { Stop-Safely 'Could not read DATABASE_URL from backend/.env with dotenv. Credentials were not displayed.' }
    try { return [string](ConvertFrom-Json -InputObject $result.Stdout -NoEnumerate) } catch { Stop-Safely 'DATABASE_URL could not be parsed from backend/.env.' }
}

function ConvertFrom-JsonElement {
    param([Parameter(Mandatory)][System.Text.Json.JsonElement] $Element)
    switch ($Element.ValueKind) {
        'Object' {
            $result = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
            foreach ($property in $Element.EnumerateObject()) {
                if ($result.ContainsKey($property.Name)) { Stop-Safely "Duplicate JSON property '$($property.Name)' is not allowed." }
                $result.Add($property.Name, (ConvertFrom-JsonElement -Element $property.Value))
            }
            return $result
        }
        'Array' {
            $items = [Collections.Generic.List[object]]::new()
            foreach ($item in $Element.EnumerateArray()) { $items.Add((ConvertFrom-JsonElement -Element $item)) }
            return ,$items.ToArray()
        }
        'String' { return $Element.GetString() }
        'Number' {
            $longValue = 0L
            if ($Element.TryGetInt64([ref]$longValue)) { return $longValue }
            $decimalValue = 0D
            if ($Element.TryGetDecimal([ref]$decimalValue)) { return $decimalValue }
            Stop-Safely 'Manifest contains a number outside the supported integer/decimal range.'
        }
        'True' { return $true }
        'False' { return $false }
        'Null' { return $null }
        default { Stop-Safely 'Manifest contains an unsupported JSON value.' }
    }
}

function ConvertFrom-JsonPreservingTypes {
    param([Parameter(Mandatory)][string] $Json)
    $document = [System.Text.Json.JsonDocument]::Parse($Json)
    try { return ConvertFrom-JsonElement -Element $document.RootElement } finally { $document.Dispose() }
}

function ConvertFrom-PostgresUrl {
    param([Parameter(Mandatory)][string] $DatabaseUrl)

    try { $uri = [Uri]::new($DatabaseUrl, [UriKind]::Absolute) } catch { Stop-Safely 'DATABASE_URL is not a valid absolute URI.' }
    if ($uri.Scheme -notin @('postgres', 'postgresql') -or $uri.Fragment -or $uri.Query) {
        Stop-Safely 'Only a plain postgres/postgresql URL without query or fragment options is supported.'
    }
    $hostName = $uri.DnsSafeHost.Trim('[',']').ToLowerInvariant()
    if ($hostName -notin @('localhost', '127.0.0.1', '::1')) { Stop-Safely 'DATABASE_URL host is not an explicit loopback address.' }
    $port = if ($uri.IsDefaultPort -or $uri.Port -lt 0) { 5432 } else { $uri.Port }
    if ($port -ne $script:RequiredPort) { Stop-Safely 'DATABASE_URL must use local PostgreSQL port 5432.' }
    $database = [Uri]::UnescapeDataString($uri.GetComponents([UriComponents]::Path, [UriFormat]::UriEscaped).TrimStart('/'))
    if ($database -ne $script:SourceDatabase) { Stop-Safely "DATABASE_URL must name the source database '$($script:SourceDatabase)' for backup credentials." }
    $userinfo = $uri.GetComponents([UriComponents]::UserInfo, [UriFormat]::UriEscaped)
    $colon = $userinfo.IndexOf(':')
    if ($colon -le 0) { Stop-Safely 'DATABASE_URL must include a username and password.' }
    $username = [Uri]::UnescapeDataString($userinfo.Substring(0, $colon))
    $password = [Uri]::UnescapeDataString($userinfo.Substring($colon + 1))
    if ([string]::IsNullOrWhiteSpace($username) -or $username.Contains("`r") -or $username.Contains("`n") -or $username.Contains('*') -or
        $password.Contains("`r") -or $password.Contains("`n") -or $username.Contains([char]0) -or $password.Contains([char]0)) {
        Stop-Safely 'DATABASE_URL credentials are empty or contain unsupported line breaks.'
    }
    return [pscustomobject]@{ Host = $hostName; Port = $port; Database = $database; Username = $username; Password = $password }
}

function Escape-PgPassField([string] $Value) {
    return $Value.Replace('\', '\\').Replace(':', '\:')
}

function New-ProtectedPassFile {
    param([string[]] $AdditionalDatabases = @())
    $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    Assert-LocalFixedPath -Path $temp | Out-Null
    $path = Join-Path $temp ('tb-pgpass-' + [Guid]::NewGuid().ToString('N') + '.conf')
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    try {
        Set-And-AssertPrivateAcl -Path $path -IsDirectory $false
        Assert-FilePrivateAcl -Path $path
        $databases = @($script:Connection.Database) + @($AdditionalDatabases) | Select-Object -Unique
        $lines = foreach ($database in $databases) {
            '{0}:{1}:{2}:{3}:{4}' -f (Escape-PgPassField $script:Connection.Host), $script:Connection.Port, (Escape-PgPassField $database), (Escape-PgPassField $script:Connection.Username), (Escape-PgPassField $script:Connection.Password)
        }
        [IO.File]::WriteAllText($path, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
        Assert-FilePrivateAcl -Path $path
        $script:PassFile = $path
    } catch {
        try { [IO.File]::Delete($path) } catch { }
        throw
    }
}

function Remove-OwnedPassFile {
    if ($script:PassFile -and (Test-Path -LiteralPath $script:PassFile -PathType Leaf)) {
        try { [IO.File]::Delete($script:PassFile) } catch { Write-Warning "Could not remove this run's protected temporary credential file: $($script:PassFile)" }
    }
    $script:PassFile = $null
}

function Initialize-PostgresTools {
    $toolDirectory = $null
    foreach ($name in @('psql.exe', 'pg_dump.exe', 'pg_restore.exe')) {
        $tool = $null
        if ($PgBinDirectory) {
            $tool = Join-Path ([IO.Path]::GetFullPath($PgBinDirectory)) $name
        } else {
            $command = Get-Command $name -ErrorAction SilentlyContinue
            if ($command) { $tool = $command.Source }
            else {
                $standardPath = Join-Path $env:ProgramFiles (Join-Path 'PostgreSQL\18\bin' $name)
                if (Test-Path -LiteralPath $standardPath -PathType Leaf) { $tool = $standardPath }
            }
        }
        if (-not $tool -or -not (Test-Path -LiteralPath $tool -PathType Leaf)) { Stop-Safely "PostgreSQL client tool was not found: $name. Supply -PgBinDirectory." }
        $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($tool))
        if ($toolDirectory -and $directory -ine $toolDirectory) { Stop-Safely 'PostgreSQL client tools resolve from different installation directories.' }
        $toolDirectory = $directory
        $result = Invoke-Native -Executable $tool -Arguments @('--version') -TimeoutSeconds 15
        Assert-NativeSuccess -Result $result -Operation "$name version check"
        if ($result.Stdout -notmatch '\(PostgreSQL\)\s+18\.\d+') { Stop-Safely "$name must be PostgreSQL major version 18; the minor release is not pinned." }
        $script:PgTools[$name] = $tool
    }
}

function Invoke-PsqlRaw {
    param([string] $Database, [string] $Sql, [int] $TimeoutSeconds = 60)
    $args = @('-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-w', '-h', $script:Connection.Host, '-p', "$($script:Connection.Port)", '-d', $Database)
    $result = Invoke-Native -Executable $script:PgTools['psql.exe'] -Arguments $args -InputText $Sql -TimeoutSeconds $TimeoutSeconds
    Assert-NativeSuccess -Result $result -Operation "psql query against '$Database'"
    return $result.Stdout.Trim()
}

function Invoke-PsqlVerified {
    param([string] $Database, [string] $Sql, [int] $TimeoutSeconds = 60)
    [void](Get-Identity -ExpectedDatabase $Database)
    return Invoke-PsqlRaw -Database $Database -Sql $Sql -TimeoutSeconds $TimeoutSeconds
}

function Get-Identity {
    param([string] $ExpectedDatabase)
    $sql = "SELECT current_database() || '|' || current_user || '|' || coalesce(host(inet_server_addr()),'')|| '|' || coalesce(inet_server_port()::text,'') || '|' || current_setting('server_version_num') || '|' || current_setting('server_version');`n"
    $line = Invoke-PsqlRaw -Database $ExpectedDatabase -Sql $sql -TimeoutSeconds 30
    $parts = $line -split '\|', 6
    if ($parts.Count -ne 6 -or $parts[0] -ne $ExpectedDatabase -or $parts[1] -ne $script:Connection.Username -or $parts[3] -ne "$($script:RequiredPort)") {
        Stop-Safely "PostgreSQL identity did not match expected database '$ExpectedDatabase' and local port 5432."
    }
    if ($parts[2] -notin @('127.0.0.1', '::1')) { Stop-Safely 'Connected PostgreSQL server address is not loopback.' }
    $serverVersionNum = 0
    if (-not [int]::TryParse($parts[4], [ref]$serverVersionNum) -or [math]::Floor($serverVersionNum / 10000) -ne $script:RequiredPostgresMajor) {
        Stop-Safely 'Connected PostgreSQL server is not major version 18.'
    }
    if ($parts[5] -notmatch '^18\.\d+') { Stop-Safely 'Connected PostgreSQL server version string is not major version 18.' }
    return [pscustomobject]@{ Database = $parts[0]; User = $parts[1]; ServerAddress = $parts[2]; Port = [int]$parts[3]; ServerVersionNum = $serverVersionNum; ServerVersion = $parts[5] }
}

function Get-ExpectedTableInventory {
    param([object[]] $MigrationRows)

    if ($MigrationRows.Count -gt $script:KnownMigrationNames.Count) { Stop-Safely 'Applied migration history exceeds the repository chain.' }
    $expected = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($model in $script:RepositoryModelTables) { [void]$expected.Add($model) }
    [void]$expected.Add('_prisma_migrations')

    # The current Prisma schema includes models introduced by pending migrations.
    # Reverse only unambiguous additive CREATE TABLE statements to derive the
    # expected table inventory at this database's applied migration prefix.
    for ($index = $script:KnownMigrationNames.Count - 1; $index -ge $MigrationRows.Count; $index--) {
        $migrationName = $script:KnownMigrationNames[$index]
        $sql = $script:MigrationSqlByName[$migrationName]
        if ([regex]::IsMatch($sql, '(?im)^\s*(?:DROP\s+TABLE\b|ALTER\s+TABLE\b[^;]*\bRENAME\s+TO\b)')) {
            Stop-Safely "Cannot derive a historical table inventory across destructive or rename SQL in $migrationName; review the verification procedure."
        }
        $createStatements = [regex]::Matches($sql, '(?im)^\s*CREATE\s+TABLE\b')
        $createMatches = [regex]::Matches($sql, '(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?"(?<table>[^"]+)"')
        if ($createStatements.Count -ne $createMatches.Count) {
            Stop-Safely "Cannot parse every CREATE TABLE statement in pending migration $migrationName; review the verification procedure."
        }
        foreach ($match in $createMatches) {
            $table = $match.Groups['table'].Value
            if (-not $expected.Remove($table)) {
                Stop-Safely "Migration $migrationName creates '$table', which is not represented by the current Prisma model inventory."
            }
        }
    }
    return @($expected | Sort-Object -CaseSensitive)
}

function Get-TableInventory {
    param([string] $Database, [string[]] $ExpectedTables)
    $sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;`n"
    $raw = Invoke-PsqlVerified -Database $Database -Sql $sql -TimeoutSeconds 120
    $names = @($raw -split '\r?\n' | Where-Object { $_ })
    $expected = @($ExpectedTables | Sort-Object -Unique -CaseSensitive)
    $actual = @($names | Sort-Object -Unique)
    $difference = @(Compare-Object -ReferenceObject $expected -DifferenceObject $actual -CaseSensitive)
    if ($difference.Count -gt 0 -or $names.Count -ne $expected.Count) {
        Stop-Safely "Public table inventory differs from the preflighted $($expected.Count)-table schema. Expected: $($expected -join ', '). Found: $($actual -join ', ')."
    }
    return $actual
}

function Get-TableRowCounts {
    param([string] $Database, [string[]] $Tables)
    $sql = @'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT %L || chr(124) || count(*)::text FROM %I.%I;', table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
COMMIT;
'@
    $raw = Invoke-PsqlVerified -Database $Database -Sql $sql -TimeoutSeconds 1800
    $map = [ordered]@{}
    foreach ($line in @($raw -split '\r?\n' | Where-Object { $_ })) {
        if ($line -notmatch '^([^|]+)\|(\d+)$') { Stop-Safely 'Could not parse all-table row-count output.' }
        $name = $Matches[1]
        $count = 0L
        if (-not [long]::TryParse($Matches[2], [ref]$count) -or $map.Contains($name)) { Stop-Safely 'Invalid or duplicate table row count.' }
        $map[$name] = $count
    }
    if ((@($map.Keys | Sort-Object -CaseSensitive) -join '|') -cne (@($Tables | Sort-Object -CaseSensitive) -join '|')) {
        Stop-Safely 'Row-count results do not cover every expected public table exactly once.'
    }
    return $map
}

function Get-TableDataHashes {
    param([string] $Database, [string[]] $Tables)

    # Hash the canonical JSON representation of every public-table row, sorted
    # by its complete JSON value. Control separators are safe because JSON
    # escapes control characters occurring inside field values.
    $sql = @'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format(
  'SELECT %L || chr(30) || coalesce(string_agg(row_to_json(t)::text, chr(31) ORDER BY row_to_json(t)::text), '''') || chr(30) FROM %I.%I t;',
  table_name, table_schema, table_name
)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
COMMIT;
'@
    $raw = Invoke-PsqlVerified -Database $Database -Sql $sql -TimeoutSeconds 1800
    $hashes = [ordered]@{}
    foreach ($line in @($raw -split '\r?\n' | Where-Object { $_ })) {
        $parts = $line.Split([char]30)
        if ($parts.Count -ne 3 -or $parts[2] -cne '' -or [string]::IsNullOrWhiteSpace($parts[0]) -or $hashes.Contains($parts[0])) {
            Stop-Safely 'Could not parse the table-data fingerprint output.'
        }
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($parts[1])
        $hashes[$parts[0]] = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    }
    if ((@($hashes.Keys | Sort-Object -CaseSensitive) -join '|') -cne (@($Tables | Sort-Object -CaseSensitive) -join '|')) {
        Stop-Safely 'Table-data fingerprints do not cover every expected public table exactly once.'
    }
    return $hashes
}

function Get-MigrationHistory {
    param([string] $Database)
    $sql = @'
SELECT json_build_object(
  'migration_name', migration_name,
  'checksum', checksum,
  'started_at', started_at::text,
  'finished_at', finished_at::text,
  'rolled_back_at', rolled_back_at::text,
  'applied_steps_count', applied_steps_count
)::text
FROM "_prisma_migrations"
ORDER BY migration_name, started_at;
'@
    $raw = Invoke-PsqlVerified -Database $Database -Sql $sql -TimeoutSeconds 60
    $lines = @($raw -split '\r?\n' | Where-Object { $_ })
    $rows = [Collections.Generic.List[object]]::new()
    foreach ($line in $lines) {
        try { $row = ConvertFrom-JsonPreservingTypes -Json $line } catch { Stop-Safely 'Prisma migration history is not valid JSON.' }
        if (-not $row.migration_name -or $row.checksum -notmatch '^[A-Fa-f0-9]{64}$' -or $null -eq $row.finished_at -or $null -ne $row.rolled_back_at) {
            Stop-Safely 'Migration history contains an incomplete, failed, or rolled-back migration; manual review is required.'
        }
        if ($script:KnownMigrationNames -cnotcontains $row.migration_name) { Stop-Safely 'Database migration history contains a migration absent from this checked-in chain.' }
        $migrationFile = Join-Path $script:BackendRoot ("prisma/migrations/{0}/migration.sql" -f $row.migration_name)
        if (-not (Test-Path -LiteralPath $migrationFile -PathType Leaf) -or
            (Get-FileHash -LiteralPath $migrationFile -Algorithm SHA256).Hash -ine $row.checksum) {
            Stop-Safely "Applied migration checksum does not match the checked-in SQL: $($row.migration_name)"
        }
        $rows.Add($row)
    }
    if ($rows.Count -eq 0 -or $rows.Count -gt $script:KnownMigrationNames.Count) { Stop-Safely 'Migration history is empty or longer than the checked-in migration chain.' }
    $expectedPrefix = @($script:KnownMigrationNames | Select-Object -First $rows.Count | Sort-Object -CaseSensitive)
    $actualNames = @($rows | ForEach-Object { $_.migration_name } | Sort-Object -CaseSensitive)
    if (($expectedPrefix -join '|') -cne ($actualNames -join '|')) { Stop-Safely 'Applied migrations are not a contiguous prefix of the checked-in migration chain.' }
    foreach ($row in $rows) {
        $steps = 0
        if (-not [int]::TryParse([string]$row.applied_steps_count, [ref]$steps) -or $steps -lt 0) {
            Stop-Safely "Migration applied_steps_count is invalid: $($row.migration_name)"
        }
    }
    return @($rows)
}

function Get-DatabaseSize {
    param([string] $Database)
    $value = Invoke-PsqlVerified -Database $Database -Sql 'SELECT pg_database_size(current_database())::text;' -TimeoutSeconds 60
    $size = 0L
    if (-not [long]::TryParse($value, [ref]$size) -or $size -le 0) { Stop-Safely 'Could not validate database size for disk-space planning.' }
    return $size
}

function Normalize-SchemaDump {
    param([Parameter(Mandatory)][string] $Text)

    $value = $Text -replace "`r`n", "`n" -replace "`r", "`n"
    $restrict = [regex]::Matches($value, '(?m)^\\restrict ([A-Za-z0-9_-]+)\s*$')
    $unrestrict = [regex]::Matches($value, '(?m)^\\unrestrict ([A-Za-z0-9_-]+)\s*$')
    if ($restrict.Count -ne 1 -or $unrestrict.Count -ne 1 -or $restrict[0].Groups[1].Value -ne $unrestrict[0].Groups[1].Value -or $restrict[0].Index -gt 4096 -or $unrestrict[0].Index -lt ($value.Length - 4096)) {
        Stop-Safely 'Schema dump restrict wrapper did not match the expected single outer pair.'
    }
    $restrictRegex = [regex]::new('(?m)^\\restrict [A-Za-z0-9_-]+\s*$')
    $unrestrictRegex = [regex]::new('(?m)^\\unrestrict [A-Za-z0-9_-]+\s*$')
    $value = $restrictRegex.Replace($value, '\restrict TasteBridgeFingerprintKey', 1)
    $value = $unrestrictRegex.Replace($value, '\unrestrict TasteBridgeFingerprintKey', 1)
    $dumpedOn = [regex]::Matches($value, '(?m)^-- Dumped on:.*$')

if ($dumpedOn.Count -gt 1 -or
    ($dumpedOn.Count -eq 1 -and $dumpedOn[0].Index -gt 4096)) {
    Stop-Safely 'Schema dump timestamp header was ambiguous or misplaced.'
}

if ($dumpedOn.Count -eq 1) {
    $dumpedRegex = [regex]::new('(?m)^-- Dumped on:.*$')
    $value = $dumpedRegex.Replace(
        $value,
        '-- Dumped on: normalized for comparison',
        1
    )
}
    return $value
}

function Get-SchemaFingerprint {
    param([string] $Database, [string] $Destination)
    if (Test-Path -LiteralPath $Destination) { Stop-Safely "Refusing to overwrite schema dump: $Destination" }
    $reservation = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $reservation.Dispose()
    Assert-FilePrivateAcl -Path $Destination
    [void](Get-Identity -ExpectedDatabase $Database)
    $arguments = @('--schema-only', '--no-owner', '--no-acl', '--file', $Destination, '-h', $script:Connection.Host, '-p', "$($script:Connection.Port)", '-d', $Database)
    $result = Invoke-Native -Executable $script:PgTools['pg_dump.exe'] -Arguments $arguments -TimeoutSeconds $script:LongOperationTimeoutSeconds
    Assert-NativeSuccess -Result $result -Operation "Schema dump for '$Database'"
    if (-not (Test-Path -LiteralPath $Destination -PathType Leaf)) { Stop-Safely 'Schema dump did not produce its expected file.' }
    Assert-FilePrivateAcl -Path $Destination
    $normalized = Normalize-SchemaDump -Text ([IO.File]::ReadAllText($Destination))
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($normalized)
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Get-Snapshot {
    param([string] $Database, [string] $Label)
    $identity = Get-Identity -ExpectedDatabase $Database
    $history = @(Get-MigrationHistory -Database $Database)
    $expectedTables = @(Get-ExpectedTableInventory -MigrationRows $history)
    $tables = @(Get-TableInventory -Database $Database -ExpectedTables $expectedTables)
    $counts = Get-TableRowCounts -Database $Database -Tables $tables
    $dataHashes = Get-TableDataHashes -Database $Database -Tables $tables
    $size = Get-DatabaseSize -Database $Database
    $schemaHash = Get-SchemaFingerprint -Database $Database -Destination (Join-Path $script:WorkDirectory "$Label-schema.sql")
    $pending = @($script:KnownMigrationNames | Select-Object -Skip $history.Count)
    return [ordered]@{
        publicTables = $tables
        tableRowCounts = $counts
        tableDataSha256 = $dataHashes
        migrationRows = $history
        pendingMigrationNames = $pending
        databaseSizeBytes = $size
        schemaSha256 = $schemaHash
        serverVersion = $identity.ServerVersion
    }
}

function Assert-SnapshotsEqual {
    param($Left, $Right, [string] $Message)
    $leftJson = ConvertTo-Json -InputObject $Left -Depth 20 -Compress
    $rightJson = ConvertTo-Json -InputObject $Right -Depth 20 -Compress
    if ($leftJson -cne $rightJson) { Stop-Safely $Message }
}

function Assert-SourceSnapshotsStable {
    param($Before, $After)
    $left = [ordered]@{
        publicTables = $Before.publicTables
        tableRowCounts = $Before.tableRowCounts
        tableDataSha256 = $Before.tableDataSha256
        migrationRows = $Before.migrationRows
        schemaSha256 = $Before.schemaSha256
        serverVersion = $Before.serverVersion
    }
    $right = [ordered]@{
        publicTables = $After.publicTables
        tableRowCounts = $After.tableRowCounts
        tableDataSha256 = $After.tableDataSha256
        migrationRows = $After.migrationRows
        schemaSha256 = $After.schemaSha256
        serverVersion = $After.serverVersion
    }
    Assert-SnapshotsEqual -Left $left -Right $right -Message 'Pre/post table counts, migration history, or schema differ. Preserve artifacts and investigate.'
}

function Get-ServerDataDirectory {
    param([string] $Database)
    $path = Invoke-PsqlVerified -Database $Database -Sql "SHOW data_directory;`n" -TimeoutSeconds 30
    if ([string]::IsNullOrWhiteSpace($path)) { Stop-Safely 'PostgreSQL data directory was not returned.' }
    $path = [IO.Path]::GetFullPath($path.Trim())
    $drive = Assert-LocalFixedPath -Path $path
    $customTablespaces = Invoke-PsqlVerified -Database $Database -Sql "SELECT count(*)::text FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global');`n" -TimeoutSeconds 30
    if ($customTablespaces -cne '0') { Stop-Safely 'Custom PostgreSQL tablespaces require a separate capacity review; stopping safely.' }
    return [pscustomobject]@{ Path = $path; Drive = $drive }
}

function Assert-BackupDiskSpace {
    param([long] $DatabaseSizeBytes, [string] $BackupDirectory)
    $backupDrive = Assert-LocalFixedPath -Path $BackupDirectory
    $backupNeed = [long]([math]::Ceiling($DatabaseSizeBytes * 1.5) + 268435456)
    if ($backupDrive.AvailableFreeSpace -lt $backupNeed) { Stop-Safely 'Insufficient verified local space for the backup archive and working files.' }
}

function Assert-RestoreDiskSpace {
    param([string] $MaintenanceDatabase, [long] $DatabaseSizeBytes)
    $server = Get-ServerDataDirectory -Database $MaintenanceDatabase
    $restoreNeed = [long]([math]::Ceiling($DatabaseSizeBytes * 1.2) + 268435456)
    if ($server.Drive.AvailableFreeSpace -lt $restoreNeed) { Stop-Safely 'Insufficient verified local free space for a disposable restore.' }
}

function Write-JsonCreateNew {
    param([string] $Path, [object] $Value)
    if (Test-Path -LiteralPath $Path) { Stop-Safely "Refusing to overwrite: $Path" }
    $json = ConvertTo-Json -InputObject $Value -Depth 24
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + "`n")
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    Assert-FilePrivateAcl -Path $Path
}

function Get-RequiredProperty {
    param([Collections.IDictionary] $Object, [string] $Name)
    if (-not $Object.Contains($Name)) { Stop-Safely "Manifest is missing required property '$Name'." }
    return $Object[$Name]
}

function Assert-ExactKeys {
    param([Collections.IDictionary] $Object, [string[]] $Keys, [string] $Label)
    $actual = @($Object.Keys | ForEach-Object { [string]$_ } | Sort-Object -CaseSensitive)
    $expected = @($Keys | Sort-Object -CaseSensitive)
    if (($actual -join '|') -cne ($expected -join '|')) { Stop-Safely "$Label has missing or unexpected properties." }
}

function Convert-ManifestInt64 {
    param([object] $Value, [string] $Label, [long] $Minimum = 0)
    if ($Value -is [bool] -or $Value -isnot [ValueType]) { Stop-Safely "$Label must be an integer." }
    try { $decimal = [decimal]$Value } catch { Stop-Safely "$Label must be an integer." }
    if ([decimal]::Truncate($decimal) -ne $decimal -or $decimal -lt $Minimum -or $decimal -gt [long]::MaxValue) { Stop-Safely "$Label is outside its accepted integer range." }
    return [long]$decimal
}

function Assert-Manifest {
    param([string] $ManifestFile, [string] $ArchiveFile)

    $root = Split-Path -Parent ([IO.Path]::GetFullPath($ArchiveFile))
    $manifestFull = Resolve-ContainedPath -Path $ManifestFile -Root $root
    $archiveFull = Resolve-ContainedPath -Path $ArchiveFile -Root $root
    if ([IO.Path]::GetDirectoryName($manifestFull) -cne [IO.Path]::GetDirectoryName($archiveFull) -or
        [IO.Path]::GetFileName($manifestFull) -cne ([IO.Path]::GetFileName($archiveFull) + '.manifest.json')) {
        Stop-Safely 'Manifest and archive filenames or directories do not match the required pairing.'
    }
    Assert-NoReparsePointInPath -Path $manifestFull
    Assert-NoReparsePointInPath -Path $archiveFull
    if (-not (Test-Path -LiteralPath $manifestFull -PathType Leaf) -or -not (Test-Path -LiteralPath $archiveFull -PathType Leaf)) {
        Stop-Safely 'Manifest or archive file is missing.'
    }
    Assert-FilePrivateAcl -Path $manifestFull
    Assert-FilePrivateAcl -Path $archiveFull
    try { $m = ConvertFrom-JsonPreservingTypes -Json ([IO.File]::ReadAllText($manifestFull)) } catch { Stop-Safely 'Manifest JSON is invalid.' }
    if ($m -isnot [Collections.IDictionary]) { Stop-Safely 'Manifest root must be a JSON object.' }
    Assert-ExactKeys -Object $m -Keys @('format', 'createdAtUtc', 'source', 'archive') -Label 'Manifest'
    if ($m.format -notin @('TasteBridgeBackupV1', 'TasteBridgeBackupV2')) { Stop-Safely 'Unsupported backup manifest format.' }
    $created = [DateTimeOffset]::MinValue
    if ($m.createdAtUtc -isnot [string] -or -not [DateTimeOffset]::TryParse($m.createdAtUtc, [ref]$created) -or $created.Offset -ne [TimeSpan]::Zero) { Stop-Safely 'Manifest createdAtUtc must be a valid UTC timestamp string.' }

    $source = $m.source
    $archive = $m.archive
    if ($source -isnot [Collections.IDictionary] -or $archive -isnot [Collections.IDictionary]) { Stop-Safely 'Manifest source and archive entries must be objects.' }
    $sourceKeys = @('database', 'host', 'port', 'serverMajor', 'serverVersion', 'publicTables', 'tableRowCounts', 'migrationRows', 'databaseSizeBytes', 'schemaSha256')
    if ($m.format -ceq 'TasteBridgeBackupV2') { $sourceKeys += @('tableDataSha256', 'repositoryMigrations', 'pendingMigrationNames') }
    Assert-ExactKeys -Object $source -Keys $sourceKeys -Label 'Manifest source'
    Assert-ExactKeys -Object $archive -Keys @('fileName', 'sha256', 'lengthBytes', 'tocEntries') -Label 'Manifest archive'
    if ($source.database -isnot [string] -or $source.host -isnot [string] -or
        $source.database -cne $script:SourceDatabase -or $source.host -notin @('localhost','127.0.0.1','::1') -or
        (Convert-ManifestInt64 $source.port 'source.port' 1) -ne $script:RequiredPort -or
        (Convert-ManifestInt64 $source.serverMajor 'source.serverMajor' 1) -ne $script:RequiredPostgresMajor -or
        $source.serverVersion -isnot [string] -or $source.serverVersion -notmatch '^18\.\d+') {
        Stop-Safely 'Manifest source identity is not the expected local PostgreSQL 18 tastebridge database.'
    }
    if ($archive.fileName -isnot [string] -or $archive.fileName -cne [IO.Path]::GetFileName($archiveFull) -or
        $archive.fileName -notmatch '^tastebridge_\d{8}_\d{6}_[a-f0-9]{32}\.dump$') {
        Stop-Safely 'Manifest archive filename is invalid or does not match the selected archive.'
    }
    foreach ($hash in @($archive.sha256, $source.schemaSha256)) {
        if ($hash -isnot [string] -or $hash -notmatch '^[A-Fa-f0-9]{64}$') { Stop-Safely 'Manifest SHA-256 value is malformed.' }
    }
    [void](Convert-ManifestInt64 $archive.lengthBytes 'archive.lengthBytes' 1)
    [void](Convert-ManifestInt64 $archive.tocEntries 'archive.tocEntries' 1)
    [void](Convert-ManifestInt64 $source.databaseSizeBytes 'source.databaseSizeBytes' 1)

    if ($source.publicTables -isnot [array] -or $source.tableRowCounts -isnot [Collections.IDictionary] -or $source.migrationRows -isnot [array]) {
        Stop-Safely 'Manifest table, count, or migration collection has the wrong JSON type.'
    }
    $tables = @($source.publicTables)
    $nonString = @($tables | Where-Object { $_ -isnot [string] })
    if ($nonString.Count -gt 0) { Stop-Safely 'Manifest publicTables contains a non-string table name.' }
    $sortedTables = @($tables | Sort-Object -Unique -CaseSensitive)
    if ((@($source.tableRowCounts.Keys | Sort-Object -CaseSensitive) -join '|') -cne ($sortedTables -join '|')) { Stop-Safely 'Manifest row-count keys do not match publicTables.' }
    foreach ($key in $source.tableRowCounts.Keys) { [void](Convert-ManifestInt64 $source.tableRowCounts[$key] "row count for $key") }
    if ($m.format -ceq 'TasteBridgeBackupV2') {
        if ($source.tableDataSha256 -isnot [Collections.IDictionary] -or
            (@($source.tableDataSha256.Keys | Sort-Object -CaseSensitive) -join '|') -cne ($sortedTables -join '|')) {
            Stop-Safely 'V2 manifest row-data hash keys do not match publicTables.'
        }
        foreach ($hash in $source.tableDataSha256.Values) {
            if ($hash -isnot [string] -or $hash -notmatch '^[A-Fa-f0-9]{64}$') { Stop-Safely 'V2 manifest contains a malformed table-data SHA-256.' }
        }
    }
    if ($source.migrationRows.Count -eq 1 -and $source.migrationRows[0] -is [array]) {
        $inner = $source.migrationRows[0]
        if ($inner.Count -eq 0) {
            Stop-Safely 'Manifest migration history legacy wrapper is empty.'
        }
        foreach ($element in $inner) {
            if ($null -eq $element -or $element -isnot [Collections.IDictionary]) {
                Stop-Safely 'Each migration row in legacy manifest must be a JSON object.'
            }
        }
        $source['migrationRows'] = @($inner)
    }
    $migrationNames = [Collections.Generic.List[string]]::new()
    foreach ($row in $source.migrationRows) {
        if ($row -isnot [Collections.IDictionary]) { Stop-Safely 'Each migration row must be a JSON object.' }
        $migrationRowKeys = @('migration_name','checksum','started_at','finished_at','rolled_back_at')
        if ($m.format -ceq 'TasteBridgeBackupV2') { $migrationRowKeys += 'applied_steps_count' }
        Assert-ExactKeys -Object $row -Keys $migrationRowKeys -Label 'Migration row'
        if ($row.migration_name -isnot [string] -or $script:KnownMigrationNames -cnotcontains $row.migration_name -or
            $row.checksum -isnot [string] -or $row.checksum -notmatch '^[A-Fa-f0-9]{64}$') { Stop-Safely 'Migration row name or checksum is invalid.' }
        $migrationFile = Join-Path $script:BackendRoot ("prisma/migrations/{0}/migration.sql" -f $row.migration_name)
        if (-not (Test-Path -LiteralPath $migrationFile -PathType Leaf) -or
            (Get-FileHash -LiteralPath $migrationFile -Algorithm SHA256).Hash -ine $row.checksum) {
            Stop-Safely "Manifest migration checksum does not match checked-in SQL: $($row.migration_name)"
        }
        if ($migrationNames.Contains($row.migration_name)) { Stop-Safely 'Manifest contains duplicate migration rows.' }
        $migrationNames.Add($row.migration_name)
        foreach ($field in @('started_at','finished_at','rolled_back_at')) {
            if ($null -ne $row[$field]) {
                $parsed = [DateTimeOffset]::MinValue
                if ($row[$field] -isnot [string] -or -not [DateTimeOffset]::TryParse($row[$field], [ref]$parsed)) { Stop-Safely "Migration $field must be a nullable timestamp string." }
            }
        }
        if ($null -eq $row.finished_at -or $null -ne $row.rolled_back_at) { Stop-Safely 'Manifest contains unfinished or rolled-back migration history.' }
        if ($m.format -ceq 'TasteBridgeBackupV2') { [void](Convert-ManifestInt64 $row.applied_steps_count "applied_steps_count for $($row.migration_name)") }
    }
    if ($migrationNames.Count -eq 0 -or $migrationNames.Count -gt $script:KnownMigrationNames.Count) { Stop-Safely 'Manifest migration history is empty or exceeds the known chain.' }
    $expectedMigrationPrefix = @($script:KnownMigrationNames | Select-Object -First $migrationNames.Count | Sort-Object -CaseSensitive)
    $actualMigrationNames = @($migrationNames | Sort-Object -CaseSensitive)
    if (($expectedMigrationPrefix -join '|') -cne ($actualMigrationNames -join '|')) { Stop-Safely 'Manifest migration rows are not a contiguous prefix of the checked-in chain.' }
    if ($m.format -ceq 'TasteBridgeBackupV2') {
        if ($source.repositoryMigrations -isnot [array] -or $source.pendingMigrationNames -isnot [array]) {
            Stop-Safely 'V2 manifest repository and pending migration inventories must be arrays.'
        }
        $repositoryNames = [Collections.Generic.List[string]]::new()
        $repositoryChecksums = [Collections.Generic.List[string]]::new()
        foreach ($entry in $source.repositoryMigrations) {
            if ($entry -isnot [Collections.IDictionary]) { Stop-Safely 'V2 repository migration entries must be objects.' }
            Assert-ExactKeys -Object $entry -Keys @('migration_name','checksum') -Label 'Repository migration entry'
            $position = $repositoryNames.Count
            if ($position -ge $script:KnownMigrationNames.Count -or $entry.migration_name -cne $script:KnownMigrationNames[$position] -or
                $entry.checksum -isnot [string] -or $entry.checksum -notmatch '^[A-Fa-f0-9]{64}$' -or
                $entry.checksum -ine $script:MigrationChecksumByName[$entry.migration_name]) {
                Stop-Safely 'V2 repository migration inventory differs from the current repository chain.'
            }
            $repositoryNames.Add($entry.migration_name)
            $repositoryChecksums.Add($entry.checksum)
        }
        if ($repositoryNames.Count -lt $migrationNames.Count) { Stop-Safely 'V2 repository chain is shorter than its applied migration history.' }
        for ($index = 0; $index -lt $migrationNames.Count; $index++) {
            if ($source.migrationRows[$index].migration_name -cne $repositoryNames[$index] -or
                $source.migrationRows[$index].checksum -ine $repositoryChecksums[$index]) {
                Stop-Safely 'V2 applied migration rows do not match the recorded repository chain.'
            }
        }
        $expectedPending = @($repositoryNames | Select-Object -Skip $migrationNames.Count)
        $actualPending = @($source.pendingMigrationNames | Where-Object { $_ -is [string] })
        if ($actualPending.Count -ne $source.pendingMigrationNames.Count -or ($expectedPending -join '|') -cne ($actualPending -join '|')) {
            Stop-Safely 'V2 pending migration list does not match the applied prefix and repository chain.'
        }
    }
    $expectedManifestTables = @(Get-ExpectedTableInventory -MigrationRows @($source.migrationRows))
    if ($sortedTables.Count -ne $expectedManifestTables.Count -or
        ($sortedTables -join '|') -cne (@($expectedManifestTables | Sort-Object -CaseSensitive) -join '|')) {
        Stop-Safely 'Manifest table inventory does not match the recorded applied migration prefix.'
    }
    if ((Get-FileHash -LiteralPath $archiveFull -Algorithm SHA256).Hash -ine $archive.sha256) { Stop-Safely 'Archive SHA-256 does not match the manifest.' }
    if ((Get-Item -LiteralPath $archiveFull).Length -ne (Convert-ManifestInt64 $archive.lengthBytes 'archive.lengthBytes' 1)) { Stop-Safely 'Archive length does not match the manifest.' }
    return [pscustomobject]@{ Manifest = $m; Archive = $archiveFull; ManifestPath = $manifestFull }
}

function Get-ArchiveTocCount {
    param([string] $ArchiveFile)
    $result = Invoke-Native -Executable $script:PgTools['pg_restore.exe'] -Arguments @('--list', $ArchiveFile) -TimeoutSeconds 300
    Assert-NativeSuccess -Result $result -Operation 'Archive readability check'
    $count = @($result.Stdout -split '\r?\n' | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+\s+' }).Count
    if ($count -le 0) { Stop-Safely 'Archive TOC is empty or unreadable.' }
    return $count
}

function Assert-RestoreIntegrity {
    param([string] $Database)
    $sql = @'
SELECT
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype IN ('f','c') AND NOT c.convalidated)::text
  || '|' ||
  (SELECT count(*) FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND (NOT i.indisvalid OR NOT i.indisready))::text;
'@
    $parts = (Invoke-PsqlVerified -Database $Database -Sql $sql -TimeoutSeconds 60) -split '\|'
    if ($parts.Count -ne 2 -or $parts[0] -ne '0' -or $parts[1] -ne '0') { Stop-Safely 'Restored database has unvalidated constraints or invalid indexes.' }
}

function Get-RestoreDatabaseName {
    $suffix = [Guid]::NewGuid().ToString('N')
    return ('tastebridge_restore_{0}_{1}' -f (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'), $suffix.Substring(0,16)).ToLowerInvariant()
}

function Assert-DatabaseAbsent {
    param([string] $Name)
    if ($Name -ceq $script:SourceDatabase -or $Name -notmatch '^tastebridge_restore_[a-z0-9_]{1,40}$') { Stop-Safely 'Restore target name is not an allowed disposable name.' }
    [void](Get-Identity -ExpectedDatabase 'postgres')
    $escaped = $Name.Replace("'", "''")
    $exists = Invoke-PsqlVerified -Database 'postgres' -Sql "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_database WHERE datname='$escaped') THEN 'yes' ELSE 'no' END;`n" -TimeoutSeconds 30
    if ($exists -cne 'no') { Stop-Safely 'Generated restore database already exists. No database was changed.' }
}

function Assert-DatabaseCreationPrivilege {
    [void](Get-Identity -ExpectedDatabase 'postgres')
    $canCreate = Invoke-PsqlVerified -Database 'postgres' -Sql "SELECT CASE WHEN r.rolcreatedb OR r.rolsuper THEN 'yes' ELSE 'no' END FROM pg_roles r WHERE r.rolname=current_user;`n" -TimeoutSeconds 30
    if ($canCreate -cne 'yes') { Stop-Safely 'Connected PostgreSQL role lacks CREATEDB permission; no database was created.' }
}

function Invoke-Backup {
    if (-not $BackupDirectory) { Stop-Safely 'Backup mode requires an explicit -BackupDirectory outside the repository.' }
    if ($ArchivePath -or $ManifestPath) { Stop-Safely 'Backup mode accepts -BackupDirectory only; archive filenames are generated uniquely.' }
    if (-not [IO.Path]::IsPathRooted($BackupDirectory)) { Stop-Safely 'BackupDirectory must be an absolute local filesystem path.' }
    $databaseUrl = Get-DatabaseUrlFromDotEnv
    $script:Connection = ConvertFrom-PostgresUrl -DatabaseUrl $databaseUrl
    $databaseUrl = $null
    Initialize-PostgresTools

    $backupRoot = [IO.Path]::GetFullPath($BackupDirectory)
    Assert-LocalFixedPath -Path $backupRoot | Out-Null
    if (Test-PathWithin -Path $backupRoot -Root $script:ProjectRoot) { Stop-Safely 'Backup directory resolves inside the repository.' }
    $backupRootExists = Test-Path -LiteralPath $backupRoot
    if ($backupRootExists) {
        if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { Stop-Safely 'Backup output path is not a directory.' }
        Assert-NoReparsePointInPath -Path $backupRoot
        Set-And-AssertBackupRootAcl -Path $backupRoot -Created $false
    } else {
        $parent = Split-Path -Parent $backupRoot
        if (-not (Test-Path -LiteralPath $parent -PathType Container)) { Stop-Safely 'Backup directory parent must already exist.' }
    }

    Write-Host "Read-only backup source: $($script:Connection.Host):$($script:Connection.Port)/$($script:SourceDatabase). Backup location: $backupRoot"
    $confirmation = Read-Host "Type BACKUP tastebridge to create a protected backup"
    if ($confirmation -cne 'BACKUP tastebridge') { Stop-Safely 'Backup was not confirmed; no backup directory or file was created.' }
    Write-Host 'Write-quiescence required: stop the TasteBridge backend, workers, Prisma Studio, scheduled jobs, scripts, and manual database writers. Keep them stopped through both metadata captures and pg_dump. Row-content fingerprints supplement but do not replace quiescence.'
    $quiescence = Read-Host 'After stopping all writers, type WRITES QUIESCED tastebridge'
    if ($quiescence -cne 'WRITES QUIESCED tastebridge') { Stop-Safely 'Write quiescence was not confirmed; no backup directory or file was created.' }
    if (-not (Test-Path -LiteralPath $backupRoot)) {
        if (-not (New-DirectoryAtomically -Path $backupRoot)) { Stop-Safely 'Backup root appeared during creation; no existing directory was changed.' }
        Set-And-AssertBackupRootAcl -Path $backupRoot -Created $true
    }
    if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { Stop-Safely 'Backup root is not a directory.' }
    Assert-NoReparsePointInPath -Path $backupRoot
    Set-And-AssertBackupRootAcl -Path $backupRoot -Created $false
    Assert-NoReparsePointInPath -Path $backupRoot
    $script:WorkDirectory = New-PrivateRunDirectory -Parent $backupRoot
    New-ProtectedPassFile
    [void](Get-Identity -ExpectedDatabase $script:SourceDatabase)
    $pre = Get-Snapshot -Database $script:SourceDatabase -Label 'source-before'
    Assert-BackupDiskSpace -DatabaseSizeBytes $pre.databaseSizeBytes -BackupDirectory $script:WorkDirectory
    Write-Host "Verified source identity: loopback PostgreSQL $($script:Connection.Host):$($script:Connection.Port), database '$($script:SourceDatabase)' with $($pre.publicTables.Count) public tables; server $($pre.serverVersion)."
    if ($pre.pendingMigrationNames.Count -gt 0) {
        Write-Warning "The archive will represent the current pre-migration database. Repository migrations pending on this source: $($pre.pendingMigrationNames -join ', ')"
    } else {
        Write-Host 'The source has no pending repository migrations.'
    }

    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss')
    $id = [Guid]::NewGuid().ToString('N')
    $base = "tastebridge_${stamp}_${id}"
    $archiveFinal = Join-Path $script:WorkDirectory ($base + '.dump')
    $manifestFinal = $archiveFinal + '.manifest.json'
    $archiveTemp = Join-Path $script:WorkDirectory ($base + '.partial.dump')
    $manifestTemp = Join-Path $script:WorkDirectory ($base + '.partial.manifest.json')
    foreach ($p in @($archiveFinal,$manifestFinal,$archiveTemp,$manifestTemp)) { if (Test-Path -LiteralPath $p) { Stop-Safely 'A generated backup path already exists; nothing was overwritten.' } }

    # This script-owned CreateNew reservation is intentionally truncated by pg_dump -f.
    $reservation = [IO.File]::Open($archiveTemp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $reservation.Dispose()
    Assert-FilePrivateAcl -Path $archiveTemp
    $dumpArgs = @('--format=custom','--no-owner','--no-acl','--file',$archiveTemp,'-h',$script:Connection.Host,'-p',"$($script:Connection.Port)",'-d',$script:SourceDatabase)
    $dumpResult = Invoke-Native -Executable $script:PgTools['pg_dump.exe'] -Arguments $dumpArgs -TimeoutSeconds $script:LongOperationTimeoutSeconds
    Assert-NativeSuccess -Result $dumpResult -Operation 'pg_dump'
    if (-not (Test-Path -LiteralPath $archiveTemp -PathType Leaf) -or (Get-Item -LiteralPath $archiveTemp).Length -le 0) { Stop-Safely 'pg_dump did not produce a nonempty custom archive.' }
    Assert-FilePrivateAcl -Path $archiveTemp
    $tocCount = Get-ArchiveTocCount -ArchiveFile $archiveTemp
    $archiveHash = (Get-FileHash -LiteralPath $archiveTemp -Algorithm SHA256).Hash.ToLowerInvariant()
    $archiveLength = (Get-Item -LiteralPath $archiveTemp).Length
    $post = Get-Snapshot -Database $script:SourceDatabase -Label 'source-after'
    Assert-SourceSnapshotsStable -Before $pre -After $post

    $manifest = [ordered]@{
        format = 'TasteBridgeBackupV2'
        createdAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        source = [ordered]@{
            database = $script:SourceDatabase
            host = $script:Connection.Host
            port = $script:Connection.Port
            serverMajor = $script:RequiredPostgresMajor
            serverVersion = $post.serverVersion
            publicTables = @($post.publicTables)
            tableRowCounts = $post.tableRowCounts
            tableDataSha256 = $post.tableDataSha256
            migrationRows = @($post.migrationRows)
            repositoryMigrations = @($script:KnownMigrationNames | ForEach-Object {
                [ordered]@{ migration_name = $_; checksum = $script:MigrationChecksumByName[$_] }
            })
            pendingMigrationNames = @($post.pendingMigrationNames)
            databaseSizeBytes = [math]::Max($pre.databaseSizeBytes, $post.databaseSizeBytes)
            schemaSha256 = $post.schemaSha256
        }
        archive = [ordered]@{ fileName = [IO.Path]::GetFileName($archiveFinal); sha256 = $archiveHash; lengthBytes = $archiveLength; tocEntries = $tocCount }
    }
    # The snapshot stores actual server version text; the guard constrains only major version 18.
    Write-JsonCreateNew -Path $manifestTemp -Value $manifest
    [IO.File]::Move($manifestTemp, $manifestFinal)
    [IO.File]::Move($archiveTemp, $archiveFinal)
    Assert-FilePrivateAcl -Path $manifestFinal
    Assert-FilePrivateAcl -Path $archiveFinal
    if ((Get-FileHash -LiteralPath $archiveFinal -Algorithm SHA256).Hash -ine $archiveHash) { Stop-Safely 'Published archive digest mismatch; files were retained.' }
    Write-Output "BACKUP VERIFIED: $archiveFinal"
    Write-Output "MANIFEST: $manifestFinal"
    Write-Output "SHA256: $archiveHash"
}

function Invoke-Restore {
    if (-not $BackupDirectory) { Stop-Safely 'Restore mode requires an explicit -BackupDirectory containing the selected archive and manifest.' }
    if (-not $ArchivePath -or -not $ManifestPath) { Stop-Safely 'Restore mode requires -ArchivePath and -ManifestPath.' }
    if (-not [IO.Path]::IsPathRooted($BackupDirectory)) { Stop-Safely 'BackupDirectory must be an absolute local filesystem path.' }
    $databaseUrl = Get-DatabaseUrlFromDotEnv
    $script:Connection = ConvertFrom-PostgresUrl -DatabaseUrl $databaseUrl
    $databaseUrl = $null
    Initialize-PostgresTools

    $backupRoot = [IO.Path]::GetFullPath($BackupDirectory)
    Assert-LocalFixedPath -Path $backupRoot | Out-Null
    if (Test-PathWithin -Path $backupRoot -Root $script:ProjectRoot) { Stop-Safely 'Backup directory resolves inside the repository.' }
    if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { Stop-Safely 'The selected backup root does not exist.' }
    Assert-NoReparsePointInPath -Path $backupRoot
    Set-And-AssertBackupRootAcl -Path $backupRoot -Created $false

    $archiveFull = [IO.Path]::GetFullPath($ArchivePath)
    $manifestFull = [IO.Path]::GetFullPath($ManifestPath)
    $archiveFull = Resolve-ContainedPath -Path $archiveFull -Root $backupRoot
    $manifestFull = Resolve-ContainedPath -Path $manifestFull -Root $backupRoot
    Assert-LocalFixedPath -Path $backupRoot | Out-Null
    Assert-NoReparsePointInPath -Path $backupRoot
    $verified = Assert-Manifest -ManifestFile $manifestFull -ArchiveFile $archiveFull
    if ($verified.Manifest.format -ceq 'TasteBridgeBackupV2' -and $verified.Manifest.source.pendingMigrationNames.Count -gt 0) {
        Write-Warning "This archive represents a schema before these repository migrations: $($verified.Manifest.source.pendingMigrationNames -join ', ')"
    }
    if ($verified.Manifest.source.host -cne $script:Connection.Host -or
        (Convert-ManifestInt64 $verified.Manifest.source.port 'source.port' 1) -ne $script:Connection.Port) {
        Stop-Safely 'Manifest server address does not match the currently configured loopback PostgreSQL target.'
    }
    $toc = Get-ArchiveTocCount -ArchiveFile $verified.Archive
    if ($toc -ne (Convert-ManifestInt64 $verified.Manifest.archive.tocEntries 'archive.tocEntries' 1)) { Stop-Safely 'Archive TOC count differs from the manifest.' }
    $expectedLength = Convert-ManifestInt64 $verified.Manifest.archive.lengthBytes 'archive.lengthBytes' 1
    if ((Get-Item -LiteralPath $verified.Archive).Length -ne $expectedLength) { Stop-Safely 'Archive changed after manifest validation.' }

    $script:WorkDirectory = New-PrivateRunDirectory -Parent $backupRoot
    $restoreName = Get-RestoreDatabaseName
    $script:RestoreTarget = $restoreName
    New-ProtectedPassFile -AdditionalDatabases @('postgres', $restoreName)
    [void](Get-Identity -ExpectedDatabase $script:SourceDatabase)
    [void](Get-Identity -ExpectedDatabase 'postgres')
    Assert-DatabaseAbsent -Name $restoreName
    Assert-DatabaseCreationPrivilege
    Assert-RestoreDiskSpace -MaintenanceDatabase 'postgres' -DatabaseSizeBytes (Convert-ManifestInt64 $verified.Manifest.source.databaseSizeBytes 'source.databaseSizeBytes' 1)
    Write-Host "Database action: CREATE DATABASE '$restoreName' on loopback PostgreSQL $($script:Connection.Host):$($script:Connection.Port), connected maintenance database 'postgres'. No existing database will be dropped or reused."
    $confirmCreate = Read-Host "Type CREATE $restoreName to create this disposable restore database"
    if ($confirmCreate -cne "CREATE $restoreName") { Stop-Safely 'Restore database creation was not confirmed.' }

    [void](Get-Identity -ExpectedDatabase 'postgres')
    $createSql = 'CREATE DATABASE "' + $restoreName + '" TEMPLATE template0;'
    [void](Invoke-PsqlRaw -Database 'postgres' -Sql $createSql -TimeoutSeconds 60)
    [void](Get-Identity -ExpectedDatabase $restoreName)
    Write-Host "Database action: restore '$([IO.Path]::GetFileName($verified.Archive))' into '$restoreName' on loopback PostgreSQL $($script:Connection.Host):$($script:Connection.Port). The original '$($script:SourceDatabase)' database is not the restore target."
    Write-Warning 'Only restore a trusted TasteBridge backup. A PostgreSQL archive can contain SQL that executes during restore.'
    $confirmRestore = Read-Host "Type RESTORE $restoreName to restore this archive"
    if ($confirmRestore -cne "RESTORE $restoreName") { Stop-Safely "Restore not confirmed. Empty disposable database '$restoreName' was preserved; no drop was attempted." }

    [void](Get-Identity -ExpectedDatabase $restoreName)
    $restoreArgs = @('--single-transaction','--exit-on-error','--no-owner','--no-privileges','--host',$script:Connection.Host,'--port',"$($script:Connection.Port)",'--dbname',$restoreName,$verified.Archive)
    $restoreResult = Invoke-Native -Executable $script:PgTools['pg_restore.exe'] -Arguments $restoreArgs -TimeoutSeconds $script:LongOperationTimeoutSeconds
    Assert-NativeSuccess -Result $restoreResult -Operation 'pg_restore'

    $actual = Get-Snapshot -Database $restoreName -Label 'restored'
    Assert-SnapshotsEqual -Left $verified.Manifest.source.publicTables -Right $actual.publicTables -Message 'Restored table names differ from backup manifest.'
    Assert-SnapshotsEqual -Left $verified.Manifest.source.tableRowCounts -Right $actual.tableRowCounts -Message 'Restored table row counts differ from backup manifest.'
    $actualMigrationRows = @($actual.migrationRows)
    if ($verified.Manifest.format -ceq 'TasteBridgeBackupV1') {
        $actualMigrationRows = @($actual.migrationRows | ForEach-Object {
            [ordered]@{
                migration_name = $_.migration_name
                checksum = $_.checksum
                started_at = $_.started_at
                finished_at = $_.finished_at
                rolled_back_at = $_.rolled_back_at
            }
        })
    }
    Assert-SnapshotsEqual -Left $verified.Manifest.source.migrationRows -Right $actualMigrationRows -Message 'Restored Prisma migration history differs from backup manifest.'
    if ($verified.Manifest.format -ceq 'TasteBridgeBackupV2') {
        Assert-SnapshotsEqual -Left $verified.Manifest.source.tableDataSha256 -Right $actual.tableDataSha256 -Message 'Restored table contents differ from the backup manifest.'
    }
    if ($verified.Manifest.source.schemaSha256 -cne $actual.schemaSha256) { Stop-Safely 'Restored schema fingerprint differs from backup manifest.' }
    Assert-RestoreIntegrity -Database $restoreName
    Write-Output "RESTORE VERIFIED: $restoreName"
    Write-Output "DATABASE PRESERVED for manual inspection: $restoreName"
}

try {
    if ($PSVersionTable.PSVersion.Major -lt 7) { Stop-Safely 'PowerShell 7 or later is required.' }
    if (-not (Test-Path -LiteralPath $script:BackendRoot -PathType Container) -or -not (Test-Path -LiteralPath $script:EnvPath -PathType Leaf)) {
        Stop-Safely 'Expected TasteBridge backend project or backend/.env was not found.'
    }
    Assert-RepositoryInventory
    if ($Mode -eq 'Backup') { Invoke-Backup } else { Invoke-Restore }
} catch {
    if ($script:WorkDirectory) { Write-Warning "Run artifacts were preserved at: $script:WorkDirectory" }
    if ($script:RestoreTarget) { Write-Warning "Disposable restore target may exist and was not dropped: $script:RestoreTarget. Verify its state manually before retrying." }
    throw
} finally {
    Remove-OwnedPassFile
}
