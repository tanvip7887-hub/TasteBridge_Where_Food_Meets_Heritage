[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This runner is deliberately opt-in and never drops databases. It reads the
# existing DATABASE_URL only to derive the local connection credentials. Every
# actual connection is forced to 127.0.0.1:5432 and to postgres or one of the
# two explicitly named scratch databases below.
$StageDatabase = 'tastebridge_fssai_stage15_20261014'
$ReplayDatabase = 'tastebridge_fssai_full_replay_20261014'
$NeverTargetDatabase = 'tastebridge'
$ExpectedHost = '127.0.0.1'
$ExpectedPort = 5432
$ExpectedUser = 'postgres'

$Migrations = @(
    '20261005093743_init_core_database',
    '20261005165133_add_pending_registration',
    '20261013120000_reconcile_prisma_schema',
    '20261014120000_add_cook_fssai_review_notifications',
    '20261015120000_add_fssai_workflow'
)

function Stop-Safely([string]$Message) {
    throw "STOPPED SAFELY: $Message"
}

function Get-DatabaseUrlFromEnvironmentOrFile {
    $value = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($value)) {
        return $value.Trim()
    }

    $envFile = Join-Path (Get-Location).Path '.env'
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
        Stop-Safely "DATABASE_URL is not set in this PowerShell process and $envFile was not found. Run this script from backend after configuring the local .env."
    }

    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if (-not $line) {
        Stop-Safely "No DATABASE_URL entry was found in $envFile."
    }

    $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        Stop-Safely 'DATABASE_URL is empty.'
    }
    return $value
}

function Get-PsqlExecutable {
    $command = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $knownPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (Test-Path -LiteralPath $knownPath -PathType Leaf) { return $knownPath }
    Stop-Safely 'psql.exe was not found on PATH or in the PostgreSQL 18 default install directory.'
}

function Get-PrismaExecutable {
    $command = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    if (-not $command) { Stop-Safely 'npx.cmd was not found on PATH.' }
    return $command.Source
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$ExpectedDatabase,
        [string]$Sql,
        [string]$File
    )

    if ($Database -ne $ExpectedDatabase -or $Database -eq $NeverTargetDatabase) {
        Stop-Safely "Refusing psql operation: requested database '$Database' does not equal the expected disposable target '$ExpectedDatabase'."
    }
    if ([string]::IsNullOrWhiteSpace($Sql) -eq [string]::IsNullOrWhiteSpace($File)) {
        Stop-Safely 'Supply exactly one of -Sql or -File to Invoke-Psql.'
    }

    $psqlArgs = @('-X', '--no-password', '--set=ON_ERROR_STOP=1', '--dbname', $Database)
    if ($Sql) { $psqlArgs += @('--command', $Sql) }
    if ($File) { $psqlArgs += @('--file', $File) }

    $output = & $script:PsqlExe @psqlArgs 2>&1
    $exitCode = $LASTEXITCODE
    foreach ($line in $output) { Write-Host $line }
    if ($exitCode -ne 0) {
        Stop-Safely "psql failed with exit code $exitCode for database '$Database'. No later stage will run."
    }
    return $output
}

function Set-PgDatabase {
    param([Parameter(Mandatory = $true)][string]$Database)
    if ($Database -eq $NeverTargetDatabase) {
        Stop-Safely "Refusing to select the protected development database '$NeverTargetDatabase'."
    }
    $script:ActiveDatabase = $Database
    $script:ActiveDatabaseUrl = New-DatabaseUrl $Database
    $env:PGDATABASE = $Database
    $env:DATABASE_URL = $script:ActiveDatabaseUrl
}

function Get-Identity {
    param([Parameter(Mandatory = $true)][string]$Database)
    $query = "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text, '') || '|' || COALESCE(inet_server_port()::text, '') || '|' || current_setting('server_version');"
    $rows = Invoke-Psql -Database $Database -ExpectedDatabase $Database -Sql $query
    $identity = @($rows | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^\w+\|' }) | Select-Object -Last 1
    if (-not $identity) { Stop-Safely "Could not read PostgreSQL identity for '$Database'." }
    $parts = $identity -split '\|', 5
    if ($parts.Count -ne 5) { Stop-Safely "PostgreSQL identity response was malformed for '$Database'." }
    return [pscustomobject]@{
        Database = $parts[0]
        User = $parts[1]
        Address = $parts[2]
        Port = $parts[3]
        Version = $parts[4]
    }
}

function Assert-Identity {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][bool]$RequireLocalTestServer
    )
    $identity = Get-Identity $Database
    Write-Host "Verified PostgreSQL identity: database=$($identity.Database); user=$($identity.User); server=$($identity.Address):$($identity.Port); version=$($identity.Version)"

    if ($identity.Database -ne $Database -or $identity.User -ne $ExpectedUser) {
        Stop-Safely "Connected identity did not match the expected database/user for '$Database'."
    }
    if ($RequireLocalTestServer -and ($identity.Address -notin @('127.0.0.1', '127.0.0.1/32') -or $identity.Port -ne "$ExpectedPort")) {
        Stop-Safely "Connected server was not $ExpectedHost`:$ExpectedPort."
    }
    return $identity
}

function New-DatabaseUrl([string]$Database) {
    if ($Database -eq $NeverTargetDatabase) {
        Stop-Safely "Refusing to construct a connection URL for '$NeverTargetDatabase'."
    }
    $builder = [System.UriBuilder]::new($script:SourceUri)
    # Force Prisma through the same explicit IPv4 loopback endpoint used by psql,
    # even when the existing .env uses the equivalent hostname "localhost".
    $builder.Host = $ExpectedHost
    $builder.Port = $ExpectedPort
    $builder.Path = "/$Database"
    return $builder.Uri.AbsoluteUri
}

function Invoke-Prisma {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & $script:NpxExecutable @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Stop-Safely "Prisma command failed with exit code $($exitCode): npx prisma $($Arguments -join ' ')"
    }
}

$backendDirectory = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $backendDirectory 'prisma7.config.ts') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $backendDirectory 'prisma\schema.prisma') -PathType Leaf)) {
    Stop-Safely 'Run this script with the current directory set to the TasteBridge backend directory.'
}

$fixtureFile = Join-Path $backendDirectory 'prisma\test-fixtures\fssai_migration_fixtures.sql'
$assertionFile = Join-Path $backendDirectory 'prisma\test-fixtures\verify_fssai_migration.sql'
if (-not (Test-Path -LiteralPath $fixtureFile -PathType Leaf) -or -not (Test-Path -LiteralPath $assertionFile -PathType Leaf)) {
    Stop-Safely 'The expected fixture or assertion SQL file is missing.'
}

$migrationFiles = foreach ($migration in $Migrations) {
    $file = Join-Path $backendDirectory "prisma\migrations\$migration\migration.sql"
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        Stop-Safely "Expected migration file is missing: $migration/migration.sql"
    }
    $file
}

$rawSourceUrl = Get-DatabaseUrlFromEnvironmentOrFile
try { $script:SourceUri = [System.Uri]::new($rawSourceUrl) }
catch { Stop-Safely 'DATABASE_URL is not a valid PostgreSQL URL; its value is deliberately not printed.' }

if ($script:SourceUri.Scheme -notin @('postgresql', 'postgres')) {
    Stop-Safely 'DATABASE_URL must use the postgresql:// or postgres:// scheme.'
}
if ($script:SourceUri.Host -notin @($ExpectedHost, 'localhost', '::1') -or $script:SourceUri.Port -ne $ExpectedPort) {
    Stop-Safely "DATABASE_URL must identify the confirmed local endpoint $ExpectedHost`:$ExpectedPort. Its value is deliberately not printed."
}
if ($script:SourceUri.AbsolutePath.Trim('/') -ne $NeverTargetDatabase) {
    Stop-Safely "The source DATABASE_URL must name the expected existing development database '$NeverTargetDatabase'; no connection to that database will be made."
}

$userInfo = $script:SourceUri.GetComponents([System.UriComponents]::UserInfo, [System.UriFormat]::UriEscaped)
$userInfoParts = $userInfo -split ':', 2
$pgUser = [System.Uri]::UnescapeDataString($userInfoParts[0])
if ($pgUser -ne $ExpectedUser) {
    Stop-Safely "DATABASE_URL user must be '$ExpectedUser' as independently confirmed by the user; found a different or absent user."
}
$pgPassword = ''
if ($userInfoParts.Count -eq 2) {
    $pgPassword = [System.Uri]::UnescapeDataString($userInfoParts[1])
}

$sslMode = 'prefer'
if ($script:SourceUri.Query -match '(?:\?|&)sslmode=([^&]+)') {
    $sslMode = [System.Uri]::UnescapeDataString($Matches[1])
}

$oldEnvironment = @{}
foreach ($name in @('DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGCONNECT_TIMEOUT', 'PGDATABASE')) {
    $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    $script:PsqlExe = Get-PsqlExecutable
    $script:NpxExecutable = Get-PrismaExecutable
    $env:PGHOST = $ExpectedHost
    $env:PGPORT = "$ExpectedPort"
    $env:PGUSER = $pgUser
    $env:PGPASSWORD = $pgPassword
    $env:PGSSLMODE = $sslMode
    $env:PGCONNECT_TIMEOUT = '5'

    Write-Host 'FSSAI migration verification: using only the local endpoint and explicit scratch database names.'
    Write-Host "Scratch database A: $StageDatabase"
    Write-Host "Scratch database B: $ReplayDatabase"
    Write-Host "Development database '$NeverTargetDatabase' is explicitly excluded. No automatic cleanup is implemented."

    # Provisioning connection uses the built-in postgres maintenance DB, never tastebridge.
    Set-PgDatabase 'postgres'
    $adminIdentity = Assert-Identity -Database 'postgres' -RequireLocalTestServer $true
    $roleInfoRows = Invoke-Psql -Database 'postgres' -ExpectedDatabase 'postgres' -Sql "SELECT rolcreatedb::text || '|' || rolsuper::text FROM pg_roles WHERE rolname = current_user;"
    $roleInfo = @($roleInfoRows | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^(true|false)\|(true|false)$' }) | Select-Object -Last 1
    if (-not $roleInfo) { Stop-Safely 'Could not confirm database-creation permission for the authenticated role.' }
    $roleBits = $roleInfo -split '\|'
    if ($roleBits[0] -ne 'true' -and $roleBits[1] -ne 'true') {
        Stop-Safely "Authenticated role '$ExpectedUser' lacks CREATEDB/superuser permission. No scratch database has been created."
    }

    $existingRows = Invoke-Psql -Database 'postgres' -ExpectedDatabase 'postgres' -Sql "SELECT datname FROM pg_database WHERE datname IN ('$StageDatabase', '$ReplayDatabase') ORDER BY datname;"
    $existingNames = @($existingRows | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -in @($StageDatabase, $ReplayDatabase) })
    if ($existingNames.Count -gt 0) {
        Stop-Safely "Scratch database name(s) already exist: $($existingNames -join ', '). Nothing was dropped or reused. Review and remove them manually only after explicit confirmation, then rerun."
    }

    # CREATE DATABASE A is the real permission test. No migrations start unless
    # it succeeds and the connection to A is positively identified.
    Assert-Identity -Database 'postgres' -RequireLocalTestServer $true | Out-Null
    Invoke-Psql -Database 'postgres' -ExpectedDatabase 'postgres' -Sql "CREATE DATABASE `"$StageDatabase`";" | Out-Null
    Set-PgDatabase $StageDatabase
    Assert-Identity -Database $StageDatabase -RequireLocalTestServer $true | Out-Null

    Write-Host "`n=== Stage A: migrations 1-3 and 14, synthetic fixtures, migration 15, assertions ==="
    foreach ($migrationIndex in @(0, 1, 2, 3)) {
        $migrationName = $Migrations[$migrationIndex]
        Assert-Identity -Database $StageDatabase -RequireLocalTestServer $true | Out-Null
        Write-Host "Applying $migrationName"
        Invoke-Psql -Database $StageDatabase -ExpectedDatabase $StageDatabase -File $migrationFiles[$migrationIndex] | Out-Null
    }

    Assert-Identity -Database $StageDatabase -RequireLocalTestServer $true | Out-Null
    Write-Host 'Loading synthetic legacy FSSAI fixtures'
    Invoke-Psql -Database $StageDatabase -ExpectedDatabase $StageDatabase -File $fixtureFile | Out-Null

    Assert-Identity -Database $StageDatabase -RequireLocalTestServer $true | Out-Null
    Write-Host "Applying $($Migrations[4])"
    Invoke-Psql -Database $StageDatabase -ExpectedDatabase $StageDatabase -File $migrationFiles[4] | Out-Null

    Assert-Identity -Database $StageDatabase -RequireLocalTestServer $true | Out-Null
    Write-Host 'Running post-migration FSSAI assertions'
    Invoke-Psql -Database $StageDatabase -ExpectedDatabase $StageDatabase -File $assertionFile | Out-Null
    Write-Host 'STAGE A PASSED: migration 15 fixture assertions completed successfully.'

    # Verify the second name again immediately before creation. It must still be absent.
    Set-PgDatabase 'postgres'
    Assert-Identity -Database 'postgres' -RequireLocalTestServer $true | Out-Null
    $replayExistsRows = Invoke-Psql -Database 'postgres' -ExpectedDatabase 'postgres' -Sql "SELECT count(*)::text FROM pg_database WHERE datname = '$ReplayDatabase';"
    $replayExists = @($replayExistsRows | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -match '^\d+$' }) | Select-Object -Last 1
    if ($replayExists -ne '0') { Stop-Safely "Scratch database '$ReplayDatabase' appeared before creation. Nothing was dropped or reused." }
    Assert-Identity -Database 'postgres' -RequireLocalTestServer $true | Out-Null
    Invoke-Psql -Database 'postgres' -ExpectedDatabase 'postgres' -Sql "CREATE DATABASE `"$ReplayDatabase`";" | Out-Null

    Set-PgDatabase $ReplayDatabase
    Assert-Identity -Database $ReplayDatabase -RequireLocalTestServer $true | Out-Null
    Write-Host "`n=== Stage B: full empty-database Prisma replay ==="
    Push-Location $backendDirectory
    try {
        Assert-Identity -Database $ReplayDatabase -RequireLocalTestServer $true | Out-Null
        Write-Host 'Running npx.cmd prisma migrate deploy'
        Invoke-Prisma @('prisma', 'migrate', 'deploy')

        Assert-Identity -Database $ReplayDatabase -RequireLocalTestServer $true | Out-Null
        Write-Host 'Running npx.cmd prisma migrate status'
        Invoke-Prisma @('prisma', 'migrate', 'status')

        Assert-Identity -Database $ReplayDatabase -RequireLocalTestServer $true | Out-Null
        Write-Host 'Comparing the replayed database with prisma/schema.prisma (exit code 0 means no diff)'
        Invoke-Prisma @('prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code')
    }
    finally {
        Pop-Location
    }

    Write-Host "`nVERIFICATION PASSED: both test stages completed. Scratch databases remain for review: $StageDatabase, $ReplayDatabase"
    Write-Host 'No database cleanup was performed.'
}
finally {
    foreach ($name in $oldEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process')
    }
}
