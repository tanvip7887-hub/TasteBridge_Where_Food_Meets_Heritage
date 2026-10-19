[CmdletBinding()]
param(
    [switch] $ConfirmProvisioning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This script creates a new local disposable database and deliberately never
# drops, resets, restores, or cleans a database. Run it only with the explicit
# -ConfirmProvisioning switch after reviewing the target printed by the script.
if (-not $ConfirmProvisioning) {
    throw 'No database was contacted. Re-run with -ConfirmProvisioning only after reviewing this script and its safeguards.'
}
if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'PowerShell 7 or newer is required for isolated child-process environments and argument handling.'
}

$BackendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$EnvPath = Join-Path $BackendRoot '.env'
$MigrationRoot = Join-Path $BackendRoot 'prisma/migrations'
$PrismaConfig = Join-Path $BackendRoot 'prisma7.config.ts'
$IntegrationTest = Join-Path $BackendRoot 'src/tests/dine-bookings-postgres.integration.test.js'
$ProtectedNames = @(
    'tastebridge',
    'tastebridge_restore_20261018061925_130a50c82c7c4a01',
    'tastebridge_dine_test_c03a1fd821794eb39796792fd6ebca9f'
)
$ExpectedHost = '127.0.0.1'
$ExpectedPort = 5432
$MaintenanceDatabase = 'postgres'
$FixtureTables = @(
    'User',
    'CookProfile',
    'Experience',
    'ExperienceMenuItem',
    'ExperienceSlot',
    'ExperienceBooking',
    'ExperiencePaymentAttempt',
    'ExperiencePaymentEvent',
    'ExperienceRefund',
    'Review',
    'UserNotification'
)

function Stop-Safely([string] $Message) {
    throw "STOPPED SAFELY: $Message"
}

function Get-SourceDatabaseUrl {
    if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
        Stop-Safely 'backend/.env is unavailable; no database connection was attempted.'
    }
    $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if (-not $line) { Stop-Safely 'backend/.env has no DATABASE_URL entry; no database connection was attempted.' }
    $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($value)) { Stop-Safely 'The configured database URL is empty.' }
    return $value
}

function ConvertTo-DatabaseUrl([Uri] $SourceUri, [string] $DatabaseName) {
    if ($DatabaseName -in $ProtectedNames -or $DatabaseName -notmatch '^tastebridge_dine_test_[a-f0-9]{32}$') {
        Stop-Safely "Refusing unsafe Dine test database name '$DatabaseName'."
    }
    $builder = [UriBuilder]::new($SourceUri)
    $builder.Host = $ExpectedHost
    $builder.Port = $ExpectedPort
    $builder.Path = "/$DatabaseName"
    return $builder.Uri.AbsoluteUri
}

function Quote-WindowsArgument([string] $Value) {
    # CRT-compatible quoting for arguments passed through cmd.exe to npx.cmd.
    $builder = [Text.StringBuilder]::new()
    [void] $builder.Append('"')
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            [void] $builder.Append(('\' * (($slashes * 2) + 1)))
            [void] $builder.Append('"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) { [void] $builder.Append(('\' * $slashes)); $slashes = 0 }
        [void] $builder.Append($character)
    }
    if ($slashes -gt 0) { [void] $builder.Append(('\' * ($slashes * 2))) }
    [void] $builder.Append('"')
    return $builder.ToString()
}

function Invoke-CapturedProcess {
    param(
        [Parameter(Mandatory)][string] $FileName,
        [Parameter(Mandatory)][string[]] $Arguments,
        [hashtable] $Environment = @{},
        [switch] $CommandScript
    )
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    if ($CommandScript) {
        $cmdExe = Join-Path $env:SystemRoot 'System32/cmd.exe'
        if (-not (Test-Path -LiteralPath $cmdExe -PathType Leaf)) { Stop-Safely 'cmd.exe is unavailable.' }
        $parts = @('call', (Quote-WindowsArgument $FileName))
        $parts += @($Arguments | ForEach-Object { Quote-WindowsArgument ([string] $_) })
        $startInfo.FileName = $cmdExe
        $startInfo.Arguments = '/d /v:off /s /c "' + ($parts -join ' ') + '"'
    }
    else {
        $startInfo.FileName = $FileName
        foreach ($argument in $Arguments) { [void] $startInfo.ArgumentList.Add([string] $argument) }
    }
    $startInfo.WorkingDirectory = $BackendRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) { $startInfo.Environment[[string] $key] = [string] $Environment[$key] }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { Stop-Safely "Could not start child process '$FileName'." }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = $stdoutTask.GetAwaiter().GetResult()
            StdErr = $stderrTask.GetAwaiter().GetResult()
        }
    }
    finally { $process.Dispose() }
}

function Protect-Output([string] $Text, [string] $RawUrl, [Uri] $SourceUri) {
    $safe = $Text.Replace($RawUrl, '<database-url-redacted>')
    $userInfo = $SourceUri.GetComponents([UriComponents]::UserInfo, [UriFormat]::UriEscaped)
    if ($userInfo) { $safe = $safe.Replace($userInfo, '<credentials-redacted>') }
    return ($safe -replace '(?i)(postgres(?:ql)?://)[^/@]+@', '$1<credentials-redacted>@')
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory)][string] $Database,
        [Parameter(Mandatory)][string] $Sql,
        [string] $HostName = $ExpectedHost,
        [switch] $SourceIdentity
    )
    if ($SourceIdentity) {
        if ($Database -ne 'tastebridge' -or $HostName -ne $SourceHost) {
            Stop-Safely 'The source-identity connection must use the configured tastebridge database endpoint.'
        }
    }
    elseif ($Database -notin @($MaintenanceDatabase, $TargetDatabase)) {
        Stop-Safely "Refusing psql target '$Database'; only the maintenance database or this run's new target is allowed."
    }
    $result = Invoke-CapturedProcess -FileName $PsqlExe -Arguments @(
        '-X', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
        '--host', $HostName, '--port', "$ExpectedPort", '--username', $PgUser, '--dbname', $Database,
        '--command', $Sql
    ) -Environment @{
        PGPASSWORD = $PgPassword
        PGSSLMODE = $SslMode
        PGCONNECT_TIMEOUT = '5'
    }
    if ($result.ExitCode -ne 0) {
        $safeError = Protect-Output ($result.StdErr + $result.StdOut) $RawSourceUrl $SourceUri
        Stop-Safely "psql failed for the verified target '$Database' with exit code $($result.ExitCode): $safeError"
    }
    return @($result.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Assert-ServerIdentity([string] $Database) {
    $rows = Invoke-Psql -Database $Database -Sql "SELECT current_database() || '|' || COALESCE(host(inet_server_addr()), '') || '|' || COALESCE(inet_server_port()::text, '') || '|' || current_setting('server_version_num') || '|' || (SELECT system_identifier::text FROM pg_control_system());"
    $parts = ($rows | Select-Object -Last 1) -split '\|', 5
    $serverAddress = if ($parts.Count -eq 5) { ConvertTo-HostAddress $parts[1] } else { $null }
    if ($parts.Count -ne 5 -or $parts[0] -ne $Database -or $serverAddress -ne $ExpectedHost -or $parts[2] -ne "$ExpectedPort" -or
        -not [System.Net.IPAddress]::IsLoopback([System.Net.IPAddress]::Parse($serverAddress))) {
        Stop-Safely "Connected PostgreSQL identity did not match '$Database' on $ExpectedHost`:$ExpectedPort."
    }
    if ([int] $parts[3] -lt 180000 -or [int] $parts[3] -ge 190000) {
        Stop-Safely 'The local PostgreSQL server is not version 18; no target migration or test was run.'
    }
    if ($parts[4] -ne $TrustedClusterIdentifier) {
        Stop-Safely "Connected database '$Database' belongs to a different PostgreSQL cluster than configured tastebridge; no migration or test was run."
    }
    Write-Host "Verified PostgreSQL target: database=$($parts[0]); server=$($parts[1]):$($parts[2]); PostgreSQL 18."
}

function ConvertTo-HostAddress([string] $AddressText) {
    if ([string]::IsNullOrWhiteSpace($AddressText)) { return $null }
    $pieces = $AddressText.Split('/')
    if ($pieces.Count -gt 2) { return $null }
    $address = $null
    if (-not [System.Net.IPAddress]::TryParse($pieces[0], [ref] $address)) { return $null }
    if ($pieces.Count -eq 2) {
        $prefixLength = 0
        $maximumPrefix = if ($address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) { 32 } else { 128 }
        if (-not [int]::TryParse($pieces[1], [ref] $prefixLength) -or $prefixLength -ne $maximumPrefix) { return $null }
    }
    return $address.ToString()
}

function Get-FixtureCounts([string] $Database) {
    $queries = foreach ($table in $FixtureTables) {
        "SELECT '$table' || '|' || count(*)::text FROM public.`"$table`""
    }
    $rows = Invoke-Psql -Database $Database -Sql ($queries -join ' UNION ALL ')
    return @($rows | ForEach-Object {
        $parts = $_ -split '\|', 2
        [pscustomobject]@{ Table = $parts[0]; Count = [int] $parts[1] }
    })
}

function Get-TapSummary([string] $Text) {
    # Node's TAP reporter emits one aggregate summary. Its test count includes
    # nested subtests, so compare aggregate pass/fail/skip/cancel/todo counts.
    foreach ($field in @('tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms')) {
        $linePattern = "(?m)^# $field(?:\s|$)"
        if ([regex]::Matches($Text, $linePattern).Count -ne 1) { return $null }
    }
    $pattern = '(?m)^# tests (\d+)\r?\n# suites (\d+)\r?\n# pass (\d+)\r?\n# fail (\d+)\r?\n# cancelled (\d+)\r?\n# skipped (\d+)\r?\n# todo (\d+)\r?\n# duration_ms ([0-9]+(?:\.[0-9]+)?)\s*$'
    $matches = [regex]::Matches($Text, $pattern)
    if ($matches.Count -ne 1) { return $null }
    $match = $matches[0]
    return [pscustomobject]@{
        Tests = [int] $match.Groups[1].Value
        Suites = [int] $match.Groups[2].Value
        Passed = [int] $match.Groups[3].Value
        Failed = [int] $match.Groups[4].Value
        Cancelled = [int] $match.Groups[5].Value
        Skipped = [int] $match.Groups[6].Value
        Todo = [int] $match.Groups[7].Value
    }
}

function Test-CleanTapSummary($Summary) {
    return ($null -ne $Summary -and $Summary.Tests -ge 1 -and $Summary.Passed -eq $Summary.Tests -and
        $Summary.Failed -eq 0 -and $Summary.Cancelled -eq 0 -and $Summary.Skipped -eq 0 -and $Summary.Todo -eq 0)
}

function Get-Template0Baseline {
    # Require an empty database-local object/data baseline after template0:
    # only standard schemas, the standard public schema owner, and no local
    # user-defined objects/configuration. Cluster-global roles and tablespaces
    # are outside a database's object inventory and are not counted here.
    $queries = @(
        "SELECT 'public_schema' || '|' || count(*)::text FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname = 'public' AND r.rolname = 'pg_database_owner'",
        "SELECT 'unexpected_schema' || '|' || count(*)::text FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')",
        "SELECT 'relations_public' || '|' || count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'",
        "SELECT 'routines_public' || '|' || count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'",
        "SELECT 'types_public' || '|' || count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'",
        "SELECT 'operators_public' || '|' || count(*)::text FROM pg_operator o JOIN pg_namespace n ON n.oid = o.oprnamespace WHERE n.nspname = 'public'",
        "SELECT 'opclasses_public' || '|' || count(*)::text FROM pg_opclass o JOIN pg_namespace n ON n.oid = o.opcnamespace WHERE n.nspname = 'public'",
        "SELECT 'opfamilies_public' || '|' || count(*)::text FROM pg_opfamily o JOIN pg_namespace n ON n.oid = o.opfnamespace WHERE n.nspname = 'public'",
        "SELECT 'collations_public' || '|' || count(*)::text FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'public'",
        "SELECT 'conversions_public' || '|' || count(*)::text FROM pg_conversion c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'",
        "SELECT 'text_search_public' || '|' || ((SELECT count(*) FROM pg_ts_config x JOIN pg_namespace n ON n.oid = x.cfgnamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_ts_dict x JOIN pg_namespace n ON n.oid = x.dictnamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_ts_parser x JOIN pg_namespace n ON n.oid = x.prsnamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_ts_template x JOIN pg_namespace n ON n.oid = x.tmplnamespace WHERE n.nspname = 'public'))::text",
        "SELECT 'extensions' || '|' || count(*)::text FROM pg_extension WHERE extname <> 'plpgsql'",
        "SELECT 'nonstandard_languages' || '|' || count(*)::text FROM pg_language WHERE lanname NOT IN ('internal', 'c', 'sql', 'plpgsql')",
        "SELECT 'foreign_data_objects' || '|' || ((SELECT count(*) FROM pg_foreign_data_wrapper) + (SELECT count(*) FROM pg_foreign_server) + (SELECT count(*) FROM pg_user_mapping))::text",
        "SELECT 'event_triggers' || '|' || count(*)::text FROM pg_event_trigger",
        "SELECT 'large_objects' || '|' || count(*)::text FROM pg_largeobject_metadata",
        "SELECT 'publications_subscriptions' || '|' || ((SELECT count(*) FROM pg_publication) + (SELECT count(*) FROM pg_subscription))::text",
        "SELECT 'default_privileges' || '|' || count(*)::text FROM pg_default_acl",
        "SELECT 'security_labels' || '|' || count(*)::text FROM pg_seclabel",
        "SELECT 'database_settings' || '|' || count(*)::text FROM pg_db_role_setting WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())"
    )
    return Invoke-Psql -Database $TargetDatabase -Sql ($queries -join ' UNION ALL ')
}

if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot 'prisma/schema.prisma') -PathType Leaf) -or
    -not (Test-Path -LiteralPath $PrismaConfig -PathType Leaf) -or
    -not (Test-Path -LiteralPath $IntegrationTest -PathType Leaf)) {
    Stop-Safely 'Required Prisma schema, Prisma 7 config, or Dine PostgreSQL integration test is missing.'
}

$migrationDirectories = @(Get-ChildItem -LiteralPath $MigrationRoot -Directory | Sort-Object Name)
if ($migrationDirectories.Count -eq 0) { Stop-Safely 'The authoritative Prisma migration directory is empty.' }
foreach ($directory in $migrationDirectories) {
    if ($directory.Name -notmatch '^\d{14}_[a-z0-9_]+$' -or
        -not (Test-Path -LiteralPath (Join-Path $directory.FullName 'migration.sql') -PathType Leaf)) {
        Stop-Safely "Invalid or incomplete Prisma migration directory: $($directory.Name)."
    }
}
$expectedMigrationNames = @($migrationDirectories | ForEach-Object { $_.Name })

$RawSourceUrl = Get-SourceDatabaseUrl
try { $SourceUri = [Uri]::new($RawSourceUrl) }
catch { Stop-Safely 'backend/.env DATABASE_URL is invalid; its value is not printed.' }
if ($SourceUri.Scheme -notin @('postgresql', 'postgres') -or
    $SourceUri.Host -notin @('localhost', '127.0.0.1', '::1') -or
    $SourceUri.Port -ne $ExpectedPort -or
    [Uri]::UnescapeDataString($SourceUri.AbsolutePath.Trim('/')) -ne 'tastebridge') {
    Stop-Safely 'backend/.env DATABASE_URL must identify tastebridge on local PostgreSQL port 5432; no connection was attempted.'
}
$userInfo = $SourceUri.GetComponents([UriComponents]::UserInfo, [UriFormat]::UriEscaped) -split ':', 2
$PgUser = [Uri]::UnescapeDataString($userInfo[0])
$PgPassword = if ($userInfo.Count -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { '' }
$SourceHost = $SourceUri.DnsSafeHost
$SslMode = 'prefer'
if ($SourceUri.Query -match '(?:\?|&)sslmode=([^&]+)') { $SslMode = [Uri]::UnescapeDataString($Matches[1]) }

$psqlCommand = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
if ($psqlCommand) { $PsqlExe = $psqlCommand.Source }
else {
    $knownPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (-not (Test-Path -LiteralPath $knownPsql -PathType Leaf)) { Stop-Safely 'psql.exe is unavailable on PATH and at the PostgreSQL 18 default path.' }
    $PsqlExe = $knownPsql
}
$npxCommand = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
if (-not $npxCommand) { Stop-Safely 'npx.cmd is unavailable; no database was created.' }
$NodeCommand = Get-Command 'node.exe' -ErrorAction SilentlyContinue
if (-not $NodeCommand) { Stop-Safely 'node.exe is unavailable; no database was created.' }

$TargetDatabase = "tastebridge_dine_test_$([Guid]::NewGuid().ToString('N'))"
if ($TargetDatabase -in $ProtectedNames -or $TargetDatabase.Length -gt 63) { Stop-Safely 'Generated target name failed its safety check.' }
$TargetUrl = ConvertTo-DatabaseUrl $SourceUri $TargetDatabase

Write-Host "Provisioning target: $TargetDatabase"
Write-Host "Maintenance target: $MaintenanceDatabase on $ExpectedHost`:$ExpectedPort (credentials omitted)."
Write-Host "Repository migrations to apply: $($expectedMigrationNames.Count) from prisma/migrations."
Write-Host 'Protected databases excluded: tastebridge, retained restore database, and existing Dine test database.'

# Establish the configured tastebridge cluster identity through its own
# read-only connection. Maintenance and new-target connections must match this
# stable identifier, not merely the loopback address and PostgreSQL version.
$sourceIdentityRows = Invoke-Psql -Database 'tastebridge' -HostName $SourceHost -SourceIdentity -Sql "SELECT current_database() || '|' || COALESCE(host(inet_server_addr()), '') || '|' || COALESCE(inet_server_port()::text, '') || '|' || current_setting('server_version_num') || '|' || (SELECT system_identifier::text FROM pg_control_system());"
$sourceIdentity = (($sourceIdentityRows | Select-Object -Last 1) -split '\|', 5)
if ($sourceIdentity.Count -ne 5 -or $sourceIdentity[0] -ne 'tastebridge' -or $sourceIdentity[2] -ne "$ExpectedPort" -or $sourceIdentity[4] -notmatch '^\d+$') {
    Stop-Safely 'Could not verify the configured tastebridge PostgreSQL cluster identity; no target was created.'
}
$sourceAddress = ConvertTo-HostAddress $sourceIdentity[1]
if (-not $sourceAddress -or -not [System.Net.IPAddress]::IsLoopback([System.Net.IPAddress]::Parse($sourceAddress))) {
    Stop-Safely 'Configured tastebridge did not resolve to a loopback PostgreSQL server; no target was created.'
}
if ([int] $sourceIdentity[3] -lt 180000 -or [int] $sourceIdentity[3] -ge 190000) {
    Stop-Safely 'Configured tastebridge is not PostgreSQL 18; no target was created.'
}
$TrustedClusterIdentifier = $sourceIdentity[4]
Write-Host 'Read-only reference connection verified: configured tastebridge on local PostgreSQL 18.'

# Maintenance and new-target connections are checked against the stable
# system_identifier from the configured tastebridge connection.
Assert-ServerIdentity $MaintenanceDatabase
$existing = Invoke-Psql -Database $MaintenanceDatabase -Sql "SELECT count(*)::text FROM pg_database WHERE datname = '$TargetDatabase';"
if (($existing | Select-Object -Last 1) -ne '0') { Stop-Safely 'Generated database name already exists; it will not be reused or modified.' }

# This is the first database write. A fresh target is created only after the
# opt-in, endpoint identity, and nonexistence checks all pass.
[void] (Invoke-Psql -Database $MaintenanceDatabase -Sql "CREATE DATABASE `"$TargetDatabase`" TEMPLATE template0;")
Assert-ServerIdentity $TargetDatabase
$baselineRows = Get-Template0Baseline
$baseline = @{}
foreach ($row in $baselineRows) {
    $parts = $row -split '\|', 2
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[a-z_]+$' -or $parts[1] -notmatch '^\d+$' -or $baseline.ContainsKey($parts[0])) {
        Stop-Safely 'Could not classify the template0 baseline query results; target is retained for inspection.'
    }
    $baseline[$parts[0]] = [int] $parts[1]
}
$expectedBaselineKeys = @('public_schema', 'unexpected_schema', 'relations_public', 'routines_public', 'types_public', 'operators_public', 'opclasses_public', 'opfamilies_public', 'collations_public', 'conversions_public', 'text_search_public', 'extensions', 'nonstandard_languages', 'foreign_data_objects', 'event_triggers', 'large_objects', 'publications_subscriptions', 'default_privileges', 'security_labels', 'database_settings')
if ($baseline.Count -ne $expectedBaselineKeys.Count -or @($expectedBaselineKeys | Where-Object { -not $baseline.ContainsKey($_) }).Count -gt 0 -or $baseline['public_schema'] -ne 1 -or @($expectedBaselineKeys | Where-Object { $_ -ne 'public_schema' -and $baseline[$_] -ne 0 }).Count -gt 0) {
    Stop-Safely 'New target does not match the verified empty template0 object baseline; target is retained for inspection.'
}
$migrationTable = Invoke-Psql -Database $TargetDatabase -Sql "SELECT CASE WHEN to_regclass('public.""_prisma_migrations""') IS NULL THEN 'absent' ELSE 'present' END;"
if (($migrationTable | Select-Object -Last 1) -ne 'absent') { Stop-Safely 'New target unexpectedly contains Prisma migration history; it is retained.' }
Write-Host 'Pre-migration baseline: database-local objects/data are empty (standard schemas only); cluster-global roles/tablespaces are outside this check; Prisma migration history absent.'

$childEnvironment = @{ DATABASE_URL = $TargetUrl; DINE_TEST_DATABASE_URL = $TargetUrl }
Write-Host "Applying repository migrations only to $TargetDatabase."
$migrationRun = Invoke-CapturedProcess -FileName $npxCommand.Source -Arguments @('prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts') -Environment $childEnvironment -CommandScript
$migrationOutput = Protect-Output ($migrationRun.StdOut + $migrationRun.StdErr) $RawSourceUrl $SourceUri
if ($migrationOutput) { Write-Host $migrationOutput.TrimEnd() }
if ($migrationRun.ExitCode -ne 0) { Stop-Safely "Prisma migrate deploy failed with exit code $($migrationRun.ExitCode). Target retained: $TargetDatabase." }

$statusRun = Invoke-CapturedProcess -FileName $npxCommand.Source -Arguments @('prisma', 'migrate', 'status', '--config', 'prisma7.config.ts') -Environment $childEnvironment -CommandScript
$statusOutput = Protect-Output ($statusRun.StdOut + $statusRun.StdErr) $RawSourceUrl $SourceUri
if ($statusOutput) { Write-Host $statusOutput.TrimEnd() }
if ($statusRun.ExitCode -ne 0) { Stop-Safely "Prisma migrate status failed with exit code $($statusRun.ExitCode). Target retained: $TargetDatabase." }

$history = Invoke-Psql -Database $TargetDatabase -Sql "SELECT migration_name || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'incomplete' END FROM public.""_prisma_migrations"" ORDER BY started_at, migration_name;"
$appliedNames = @($history | ForEach-Object {
    $parts = $_ -split '\|', 2
    if ($parts.Count -ne 2 -or $parts[1] -ne 'applied') { Stop-Safely 'Migration history contains an unfinished or rolled-back entry.' }
    $parts[0]
})
$unexpectedMigrations = @($appliedNames | Where-Object { $_ -notin $expectedMigrationNames })
$missingMigrations = @($expectedMigrationNames | Where-Object { $_ -notin $appliedNames })
if ($appliedNames.Count -ne $expectedMigrationNames.Count -or $unexpectedMigrations.Count -gt 0 -or $missingMigrations.Count -gt 0) {
    Stop-Safely "Target migration history does not exactly match repository inventory ($($appliedNames.Count)/$($expectedMigrationNames.Count)); target retained."
}
Write-Host "Migration status: $($appliedNames.Count)/$($expectedMigrationNames.Count) repository migrations applied; no pending, unfinished, or rolled-back entries."

$postMigrationBaseline = Get-FixtureCounts $TargetDatabase
if (@($postMigrationBaseline | Where-Object Count -ne 0).Count -gt 0) {
    Stop-Safely 'A migrated fixture table is non-empty before the test run; target retained.'
}

Write-Host "Running PostgreSQL Dine booking/payment-initiation integration suite against $TargetDatabase."
$testRun = Invoke-CapturedProcess -FileName $NodeCommand.Source -Arguments @('--test', '--test-reporter=tap', 'src/tests/dine-bookings-postgres.integration.test.js') -Environment $childEnvironment
$testOutput = Protect-Output ($testRun.StdOut + $testRun.StdErr) $RawSourceUrl $SourceUri
if ($testOutput) { Write-Host $testOutput.TrimEnd() }
$testSummary = Get-TapSummary $testOutput
Write-Host "Integration process exit code: $($testRun.ExitCode)."
if ($null -ne $testSummary) {
    Write-Host "TAP summary: tests=$($testSummary.Tests); passed=$($testSummary.Passed); failed=$($testSummary.Failed); cancelled=$($testSummary.Cancelled); skipped=$($testSummary.Skipped); todo=$($testSummary.Todo)."
}

$postTestCounts = Get-FixtureCounts $TargetDatabase
Write-Host 'Post-test fixture counts:'
foreach ($row in $postTestCounts) { Write-Host "  $($row.Table)=$($row.Count)" }
$leftovers = @($postTestCounts | Where-Object Count -ne 0)
if ($testRun.ExitCode -ne 0) {
    Stop-Safely "Integration suite failed (exit $($testRun.ExitCode)); target $TargetDatabase is retained, with post-test counts printed above."
}
if (-not (Test-CleanTapSummary $testSummary)) {
    Stop-Safely "Node test process did not report a complete all-passing TAP summary; target $TargetDatabase is retained."
}
if ($leftovers.Count -gt 0) {
    Stop-Safely "Integration test process succeeded but teardown left fixture rows; target $TargetDatabase is retained."
}

Write-Host "PASS: integration tests succeeded and all fixture tables are empty. Retained database: $TargetDatabase."
