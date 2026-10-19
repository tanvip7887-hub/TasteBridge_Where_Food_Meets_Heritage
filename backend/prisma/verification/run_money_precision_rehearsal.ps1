[CmdletBinding()]
param(
    [ValidateSet('Inspect', 'Rehearse', 'Cleanup')]
    [string]$Mode = 'Inspect',
    [string]$LegacyDatabaseName,
    [string]$ReplayDatabaseName,
    [string]$CleanupDatabaseName,
    [string]$ConfirmCleanupDatabaseName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProtectedDatabase = 'tastebridge'
$DatabasePrefix = 'tastebridge_money_'
$ExpectedHost = '127.0.0.1'
$ExpectedPort = 5432
$MaintenanceDatabase = 'postgres'
$TargetMigration = '20261015200000_convert_checkout_money_to_numeric'
$PredecessorMigration = '20261015190000_add_payment_foundation'
$OnlineCheckoutMigration = '20261015210000_online_payment_checkout_foundation'
$FulfillmentMigration = '20261015220000_checkout_fulfillment_snapshots'
$ReadyForPickupMigration = '20261016100000_add_ready_for_pickup_order_status'
$OrderHistoryMigration = '20261016110000_add_order_status_history'
$DeliveryAgentPayoutMigration = '20261017100000_add_delivery_agent_payout_details'
$LatestMigration = '20261017110000_add_delivery_agent_upi_account_holder_name'
$ExpectedLegacyFloatColumnCount = 16

function Stop-Safely([string]$Message) {
    throw "STOPPED SAFELY: $Message"
}

function Protect-OutputLine([string]$Line) {
    if ($script:RawDatabaseUrl) { $Line = $Line.Replace($script:RawDatabaseUrl, '<database-url-redacted>') }
    if ($script:SourceUri) {
        $uriCredentials = $script:SourceUri.GetComponents([System.UriComponents]::UserInfo, [System.UriFormat]::UriEscaped)
        if ($uriCredentials) { $Line = $Line.Replace($uriCredentials, '<credentials-redacted>') }
    }
    if ($script:ExpectedPassword) {
        $passwordVariants = @($script:ExpectedPassword, [System.Uri]::EscapeDataString($script:ExpectedPassword)) | Select-Object -Unique
        foreach ($passwordVariant in $passwordVariants) {
            if ($passwordVariant) { $Line = $Line.Replace($passwordVariant, '<redacted>') }
        }
    }
    return ($Line -replace '(?i)(postgres(?:ql)?://)[^/@]+@', '$1<credentials-redacted>@')
}

function Assert-SafeDatabaseName([string]$Name, [string]$Kind) {
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name -cnotmatch '^tastebridge_money_(legacy|replay)_[a-z0-9_]{6,24}$') {
        Stop-Safely "$Kind database name must be explicitly supplied and match tastebridge_money_(legacy|replay)_<6-24 lowercase letters, digits, or underscores>."
    }
    if ($Name -ceq $ProtectedDatabase -or $Name.Length -gt 63) {
        Stop-Safely "Refusing protected or overlong database name '$Name'."
    }
}

function Get-BackendDirectory {
    $candidate = (Get-Location).Path
    if ((Test-Path -LiteralPath (Join-Path $candidate 'prisma7.config.ts') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $candidate 'prisma\schema.prisma') -PathType Leaf)) {
        return $candidate
    }
    $candidate = Join-Path (Get-Location).Path 'backend'
    if ((Test-Path -LiteralPath (Join-Path $candidate 'prisma7.config.ts') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $candidate 'prisma\schema.prisma') -PathType Leaf)) {
        return $candidate
    }
    Stop-Safely 'Run from D:\tastebridge or D:\tastebridge\backend so the script can locate the backend Prisma configuration.'
}

function Get-DatabaseUrlWithoutPrintingIt([string]$BackendDirectory) {
    # Credentials must come from backend/.env. The interactive process may
    # already have DATABASE_URL retargeted to a disposable rehearsal database;
    # it is never used as the credential-source identity.
    $envFile = Join-Path $BackendDirectory '.env'
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
        Stop-Safely 'backend\.env does not exist; credential source must be the backend DATABASE_URL for tastebridge. The value will not be printed.'
    }
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if (-not $line) { Stop-Safely 'No DATABASE_URL entry exists in backend\.env. The value will not be printed.' }
    $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($value)) { Stop-Safely 'DATABASE_URL is empty. The value will not be printed.' }
    return $value
}

function Get-PsqlExecutable {
    $command = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $knownPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (Test-Path -LiteralPath $knownPath -PathType Leaf) { return $knownPath }
    Stop-Safely 'psql.exe is unavailable on PATH and at the PostgreSQL 18 default path.'
}

function Get-NpxExecutable {
    $command = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    Stop-Safely 'npx.cmd was not found on PATH.'
}

function ConvertTo-WindowsProcessArgument([string]$Value) {
    # ProcessStartInfo.Arguments is a command-line string on Windows PowerShell
    # 5.1 as well as newer versions. Quote each argument using the Windows CRT
    # parsing rules so spaces, embedded quotes, and trailing backslashes survive.
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $backslashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') {
            $backslashes++
            continue
        }
        if ($character -eq '"') {
            [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
            [void]$builder.Append('"')
            $backslashes = 0
            continue
        }
        if ($backslashes -gt 0) { [void]$builder.Append(('\' * $backslashes)) }
        [void]$builder.Append($character)
        $backslashes = 0
    }
    if ($backslashes -gt 0) { [void]$builder.Append(('\' * ($backslashes * 2))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Invoke-CapturedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$WindowsCommandScript
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    if ($WindowsCommandScript) {
        # Windows cannot start .cmd files directly with UseShellExecute=false.
        # Explicit CALL makes cmd.exe return from the batch shim before exiting.
        # Quote the script path and each argument, and wrap the whole command
        # for cmd.exe's /s /c parsing.
        $commandExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
        if (-not (Test-Path -LiteralPath $commandExe -PathType Leaf)) { Stop-Safely 'cmd.exe was not found at the Windows system path.' }
        $commandParts = @('call', (ConvertTo-WindowsProcessArgument $FileName))
        $commandParts += @($Arguments | ForEach-Object { ConvertTo-WindowsProcessArgument "$_" })
        $startInfo.FileName = $commandExe
        $startInfo.Arguments = '/d /v:off /s /c "' + ($commandParts -join ' ') + '"'
    }
    else {
        $startInfo.FileName = $FileName
        $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-WindowsProcessArgument "$_" }) -join ' ')
    }
    # Inherit the caller's environment (including the disposable DATABASE_URL)
    # and make the intended backend working directory explicit for Prisma CLI.
    $startInfo.WorkingDirectory = (Get-Location).ProviderPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { Stop-Safely "Could not start process '$FileName'." }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        while (-not $process.WaitForExit(15000)) {
            Write-Host "Still waiting for child process '$FileName' (elapsed $([int]$stopwatch.Elapsed.TotalSeconds)s); it remains active."
        }
        $stdoutText = $stdoutTask.GetAwaiter().GetResult()
        $stderrText = $stderrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }
    return [pscustomobject]@{ ExitCode = $exitCode; StdOutText = $stdoutText; StdErrText = $stderrText }
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$ExpectedDatabase,
        [string]$Sql,
        [string]$File,
        [switch]$AllowFailure
    )
    if ($Database -cne $ExpectedDatabase -or $Database -ceq $ProtectedDatabase) {
        Stop-Safely "Refusing psql operation: database '$Database' does not exactly match the permitted target '$ExpectedDatabase'."
    }
    if ([string]::IsNullOrWhiteSpace($Sql) -eq [string]::IsNullOrWhiteSpace($File)) {
        Stop-Safely 'Supply exactly one SQL command or SQL file to psql.'
    }

    $arguments = @('-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--dbname', $Database)
    if ($Sql) { $arguments += @('--command', $Sql) }
    if ($File) { $arguments += @('--file', $File) }
    # Native stderr is returned as text, never promoted to NativeCommandError.
    $captured = Invoke-CapturedProcess -FileName $script:PsqlExecutable -Arguments $arguments
    $stdoutText = $captured.StdOutText
    $stderrText = $captured.StdErrText
    $exitCode = $captured.ExitCode
    $stdoutLines = @($stdoutText -split "`r?`n" | Where-Object { $_ -ne '' } | ForEach-Object { Protect-OutputLine "$_" })
    $stderrLines = @($stderrText -split "`r?`n" | Where-Object { $_ -ne '' } | ForEach-Object { Protect-OutputLine "$_" })
    $lines = @($stdoutLines) + @($stderrLines)
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $lines | ForEach-Object { Write-Host $_ }
        Stop-Safely "psql failed with exit code $exitCode against '$Database'. No later stage will run."
    }
    return [pscustomobject]@{ ExitCode = $exitCode; StdOut = $stdoutLines; StdErr = $stderrLines; Lines = $lines }
}

function Get-DatabaseIdentity([string]$Database) {
    $sql = "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text, '') || '|' || COALESCE(inet_server_port()::text, '') || '|' || current_setting('server_version');"
    $result = Invoke-Psql -Database $Database -ExpectedDatabase $Database -Sql $sql
    $identityLine = @($result.Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[^|]+\|[^|]+\|' }) | Select-Object -Last 1
    if (-not $identityLine) { Stop-Safely "Could not establish PostgreSQL identity for '$Database'." }
    $parts = $identityLine -split '\|', 5
    if ($parts.Count -ne 5) { Stop-Safely "PostgreSQL returned a malformed identity for '$Database'." }
    return [pscustomobject]@{ Database = $parts[0]; User = $parts[1]; Address = $parts[2]; Port = $parts[3]; Version = $parts[4] }
}

function Assert-DatabaseIdentity {
    param([Parameter(Mandatory = $true)][string]$Database)
    $identity = Get-DatabaseIdentity $Database
    Write-Host "Verified connection: database=$($identity.Database); server=$($identity.Address):$($identity.Port); PostgreSQL=$($identity.Version)"
    if ($identity.Database -cne $Database) { Stop-Safely "Connected database '$($identity.Database)' differs from requested '$Database'." }
    if ($identity.Address -notin @('127.0.0.1', '127.0.0.1/32') -or $identity.Port -cne "$ExpectedPort") {
        Stop-Safely "Connected PostgreSQL server is not the required local endpoint $ExpectedHost`:$ExpectedPort."
    }
    if ($identity.User -cne $script:ExpectedUser) { Stop-Safely 'The authenticated PostgreSQL user differs from the credential URL user.' }
    return $identity
}

function Invoke-VerifiedPsqlWrite {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [string]$Sql,
        [string]$File
    )
    [void](Assert-DatabaseIdentity $Database)
    if ($Sql) { Write-Host "WRITE TARGET [$Database]: $Sql" }
    else { Write-Host "WRITE TARGET [$Database]: execute SQL file '$File'" }
    return Invoke-Psql -Database $Database -ExpectedDatabase $Database -Sql $Sql -File $File
}

function Get-ManifestPath([string]$DatabaseName) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        Stop-Safely 'LOCALAPPDATA is unavailable; rehearsal manifests cannot be safely recorded outside the repository.'
    }
    $manifestDirectory = Join-Path $env:LOCALAPPDATA 'TasteBridge\MoneyPrecisionRehearsals'
    return Join-Path $manifestDirectory "$DatabaseName.json"
}

function Write-DatabaseManifest([string]$DatabaseName, $Identity) {
    $manifestDirectory = Split-Path -Parent (Get-ManifestPath $DatabaseName)
    if (-not (Test-Path -LiteralPath $manifestDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $manifestDirectory | Out-Null
    }
    $manifestPath = Get-ManifestPath $DatabaseName
    if (Test-Path -LiteralPath $manifestPath) {
        Stop-Safely "A rehearsal manifest already exists for '$DatabaseName'; refusing to overwrite it."
    }
    [pscustomobject]@{
        database = $DatabaseName
        host = $ExpectedHost
        port = $ExpectedPort
        user = $Identity.User
        marker = [guid]::NewGuid().ToString('N')
        status = 'creation-intended'
        createdBy = 'run_money_precision_rehearsal.ps1'
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

function Mark-DatabaseManifestCreated([string]$DatabaseName, $Identity) {
    $manifestPath = Get-ManifestPath $DatabaseName
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Stop-Safely "Pre-creation manifest is missing for '$DatabaseName'; database state needs manual verification."
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.database -cne $DatabaseName -or $manifest.host -cne $ExpectedHost -or
        $manifest.port -ne $ExpectedPort -or $manifest.user -cne $Identity.User -or
        $manifest.status -cne 'creation-intended') {
        Stop-Safely "Pre-creation manifest identity is inconsistent for '$DatabaseName'."
    }
    $manifest.status = 'created'
    $temporaryPath = "$manifestPath.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        [System.IO.File]::WriteAllText($temporaryPath, ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $manifestPath -Force
    }
    finally { if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force } }
}

function Set-ConnectionEnvironment([string]$DatabaseName) {
    $builder = [System.UriBuilder]::new($script:SourceUri)
    $builder.Host = $ExpectedHost
    $builder.Port = $ExpectedPort
    $builder.Path = "/$DatabaseName"
    $env:DATABASE_URL = $builder.Uri.AbsoluteUri
    $env:PGHOST = $ExpectedHost
    $env:PGPORT = "$ExpectedPort"
    $env:PGUSER = $script:ExpectedUser
    $env:PGPASSWORD = $script:ExpectedPassword
    $env:PGSSLMODE = $script:SslMode
    $env:PGCONNECT_TIMEOUT = '5'
    $env:PGDATABASE = $DatabaseName
    # Prisma 7's config imports dotenv/config. Keep the explicitly set process
    # DATABASE_URL authoritative even if DOTENV_CONFIG_OVERRIDE was inherited.
    $env:DOTENV_CONFIG_OVERRIDE = 'false'
}

function Add-DatabaseOwnershipMarker([string]$DatabaseName) {
    $manifestPath = Get-ManifestPath $DatabaseName
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.database -cne $DatabaseName -or $manifest.status -cne 'creation-intended' -or
        [string]::IsNullOrWhiteSpace([string]$manifest.marker)) {
        Stop-Safely "Cannot mark '$DatabaseName'; its pre-creation manifest is absent or invalid."
    }
    [void](Assert-DatabaseIdentity $MaintenanceDatabase)
    $markerComment = "tastebridge-money-rehearsal:$($manifest.marker)"
    Write-Host "OWNERSHIP MARKER TARGET [$DatabaseName] (write via verified [$MaintenanceDatabase]): COMMENT ON DATABASE for safe later cleanup."
    [void](Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql "COMMENT ON DATABASE `"$DatabaseName`" IS '$markerComment';")
}

function Invoke-ExpectedMigrationFailure([string]$Database, [string]$ExpectedText) {
    [void](Assert-DatabaseIdentity $Database)
    Write-Host "EXPECTED FAILURE TEST TARGET [$Database]: execute '$TargetMigration' and require '$ExpectedText'."
    $result = Invoke-Psql -Database $Database -ExpectedDatabase $Database -File $script:MoneyMigrationFile -AllowFailure
    $combined = $result.Lines -join "`n"
    if ($result.ExitCode -eq 0) { Stop-Safely "The migration unexpectedly succeeded with the synthetic $ExpectedText value." }
    $result.Lines | ForEach-Object { Write-Host $_ }
    if ($combined -notmatch [regex]::Escape($ExpectedText)) {
        Stop-Safely "Migration failed, but not with the expected preflight message '$ExpectedText'. Treating this as a script or environment error."
    }

    [void](Assert-DatabaseIdentity $Database)
    $remainingFloatCount = (Invoke-Psql -Database $Database -ExpectedDatabase $Database -Sql $script:FloatColumnCountSql).Lines |
        ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1
    if ($remainingFloatCount -cne "$ExpectedLegacyFloatColumnCount") {
        Stop-Safely "Expected a full rollback with $ExpectedLegacyFloatColumnCount DOUBLE PRECISION columns; found '$remainingFloatCount'."
    }
    Write-Host "ROLLBACK CHECK PASSED: all $ExpectedLegacyFloatColumnCount targeted columns remain DOUBLE PRECISION."
}

function Invoke-Prisma([string]$Database, [string[]]$Arguments) {
    if ($Database -cne $script:ReplayDatabaseName) {
        Stop-Safely "Prisma is permitted only against the verified full-replay database '$($script:ReplayDatabaseName)'."
    }
    Set-ConnectionEnvironment $Database
    [void](Assert-DatabaseIdentity $Database)
    Write-Host "Prisma target database: $Database; credentials are not printed."
    $Arguments += @('--config', 'prisma7.config.ts')
    $captured = Invoke-CapturedProcess -FileName $script:NpxExecutable -Arguments $Arguments -WindowsCommandScript
    $outputLines = @($captured.StdOutText -split "`r?`n" | Where-Object { $_ -ne '' }) +
        @($captured.StdErrText -split "`r?`n" | Where-Object { $_ -ne '' })
    $outputLines | ForEach-Object { Write-Host (Protect-OutputLine "$_") }
    if ($captured.ExitCode -ne 0) {
        Stop-Safely "Prisma command failed with exit code $($captured.ExitCode): npx prisma $($Arguments -join ' ')"
    }
}

function Assert-ReadyForPickupEnum([string]$Database) {
    if ($Database -cne $script:ReplayDatabaseName) {
        Stop-Safely "OrderStatus enum verification is permitted only against the verified full-replay database '$($script:ReplayDatabaseName)'."
    }
    [void](Assert-DatabaseIdentity $Database)
    $sql = @'
SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_enum AS enum_value
    JOIN pg_catalog.pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    JOIN pg_catalog.pg_namespace AS enum_schema ON enum_schema.oid = enum_type.typnamespace
    WHERE enum_schema.nspname = 'public'
      AND enum_type.typname = 'OrderStatus'
      AND enum_value.enumlabel = 'READY_FOR_PICKUP'
)::text;
'@
    $result = Invoke-Psql -Database $Database -ExpectedDatabase $Database -Sql $sql
    $values = @($result.StdOut | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    if ($values.Count -ne 1 -or $values[0] -cne 'true') {
        Stop-Safely "READY_FOR_PICKUP was not found in public.OrderStatus on '$Database'."
    }
    Write-Host "ENUM ASSERTION PASSED: public.OrderStatus contains READY_FOR_PICKUP on '$Database'."
}

function Get-MoneyMigrationSql {
    return @'
-- Inputs around each half-paise boundary are intentionally offset from the
-- exact decimal tie. PostgreSQL documents DOUBLE PRECISION as inexact; casting
-- it to NUMERIC therefore cannot prove what legacy source decimal was entered.
-- The migration's NUMERIC round is away-from-zero at ties; these checks verify
-- robust values on both sides without making an unsupported exact-tie claim.
DO $$
DECLARE
    amount_field record;
    actual_type text;
    actual_precision integer;
    actual_scale integer;
BEGIN
    FOR amount_field IN
        SELECT * FROM (VALUES
            ('Dish', 'price', 14, 2),
            ('Order', 'subtotal', 14, 2), ('Order', 'deliveryFee', 14, 2),
            ('Order', 'platformFee', 14, 2), ('Order', 'totalAmount', 14, 2),
            ('Order', 'cookEarning', 14, 2), ('Order', 'deliveryEarning', 14, 2),
            ('Checkout', 'subtotal', 14, 2), ('Checkout', 'deliveryFee', 14, 2),
            ('Checkout', 'platformFee', 14, 2), ('Checkout', 'totalAmount', 14, 2),
            ('OrderItem', 'unitPrice', 14, 2), ('OrderItem', 'totalPrice', 14, 2),
            ('PlatformSettings', 'platformFeePercent', 7, 4),
            ('PlatformSettings', 'deliveryFeeBase', 14, 2),
            ('PaymentAttempt', 'amount', 14, 2)
        ) AS fields(table_name, column_name, precision_value, scale_value)
    LOOP
        SELECT data_type, numeric_precision, numeric_scale
          INTO actual_type, actual_precision, actual_scale
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = amount_field.table_name
           AND column_name = amount_field.column_name;
        IF actual_type IS DISTINCT FROM 'numeric'
           OR actual_precision IS DISTINCT FROM amount_field.precision_value
           OR actual_scale IS DISTINCT FROM amount_field.scale_value THEN
            RAISE EXCEPTION 'Unexpected type for %.%: %, precision %, scale %',
                amount_field.table_name, amount_field.column_name, actual_type, actual_precision, actual_scale;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Checkout_customerId_fkey')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Checkout_addressId_fkey')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_checkoutId_fkey')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAttempt_checkoutId_fkey')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAttemptEvent_paymentAttemptId_fkey') THEN
        RAISE EXCEPTION 'Expected checkout/payment foreign-key constraints are missing.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Checkout_customerId_idempotencyKey_key')
       OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PaymentAttempt_reference_key')
       OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PaymentAttempt_checkoutId_createdAt_idx')
       OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PaymentAttempt_status_expiresAt_idx') THEN
        RAISE EXCEPTION 'Expected checkout/payment indexes are missing.';
    END IF;
END $$;

DO $$
BEGIN
    IF (SELECT price FROM "Dish" WHERE id = 'money_zero') <> 0.00 THEN RAISE EXCEPTION 'zero conversion failed'; END IF;
    IF (SELECT price FROM "Dish" WHERE id = 'money_ordinary') <> 12.34 THEN RAISE EXCEPTION 'ordinary currency conversion failed'; END IF;
    IF (SELECT price FROM "Dish" WHERE id = 'money_positive_below') <> 1.00 THEN RAISE EXCEPTION 'positive value below the paise boundary did not round down'; END IF;
    IF (SELECT price FROM "Dish" WHERE id = 'money_positive_above') <> 1.01 THEN RAISE EXCEPTION 'positive value above the paise boundary did not round up'; END IF;
    IF (SELECT price FROM "Dish" WHERE id = 'money_negative_below') <> -1.00 THEN RAISE EXCEPTION 'negative value below the paise boundary did not round toward zero'; END IF;
    IF (SELECT price FROM "Dish" WHERE id = 'money_negative_above') <> -1.01 THEN RAISE EXCEPTION 'negative value above the paise boundary did not round away from zero'; END IF;
    IF (SELECT "deliveryFee" FROM "Order" WHERE id = 'money_negative_fee_order') <> 1.01 THEN RAISE EXCEPTION 'positive fee conversion failed'; END IF;
    IF (SELECT "platformFee" FROM "Order" WHERE id = 'money_negative_fee_order') <> -1.01 THEN RAISE EXCEPTION 'negative fee conversion failed'; END IF;
    IF (SELECT "platformFeePercent" FROM "PlatformSettings" WHERE id = 'default') <> 10.1256 THEN RAISE EXCEPTION 'four-place rate conversion failed'; END IF;
    IF (SELECT "deliveryFeeBase" FROM "PlatformSettings" WHERE id = 'default') <> 0.00 THEN RAISE EXCEPTION 'zero delivery fee conversion failed'; END IF;
    IF (SELECT amount FROM "PaymentAttempt" WHERE id = 'money_zero_attempt') <> 0.00 THEN RAISE EXCEPTION 'zero payment amount conversion failed'; END IF;
    IF (SELECT amount FROM "PaymentAttempt" WHERE id = 'money_main_attempt') <> 65.25 THEN RAISE EXCEPTION 'payment attempt amount conversion failed'; END IF;
    IF (SELECT "totalAmount" FROM "Checkout" WHERE id = 'money_checkout') <>
       (SELECT COALESCE(sum("totalAmount"), 0) FROM "Order" WHERE "checkoutId" = 'money_checkout') THEN
        RAISE EXCEPTION 'rounded checkout total does not reconcile with cook-specific order totals';
    END IF;
    IF (SELECT "totalAmount" FROM "Checkout" WHERE id = 'money_checkout') <> 65.25 THEN
        RAISE EXCEPTION 'unexpected multi-cook checkout total';
    END IF;
END $$;
'@
}

function Get-FixtureSql {
    return @'
INSERT INTO "User" (id, name, email, "passwordHash", "updatedAt") VALUES
    ('money_customer', 'Synthetic Customer', 'money.customer@example.invalid', 'not-a-real-password-hash', TIMESTAMP '2026-10-15 00:00:00'),
    ('money_cook_user_a', 'Synthetic Cook A', 'money.cook.a@example.invalid', 'not-a-real-password-hash', TIMESTAMP '2026-10-15 00:00:00'),
    ('money_cook_user_b', 'Synthetic Cook B', 'money.cook.b@example.invalid', 'not-a-real-password-hash', TIMESTAMP '2026-10-15 00:00:00');

INSERT INTO "CookProfile" (id, "userId", "businessName", "updatedAt") VALUES
    ('money_cook_a', 'money_cook_user_a', 'Synthetic Kitchen A', TIMESTAMP '2026-10-15 00:00:00'),
    ('money_cook_b', 'money_cook_user_b', 'Synthetic Kitchen B', TIMESTAMP '2026-10-15 00:00:00');

INSERT INTO "Dish" (id, "cookId", name, cuisine, price, "updatedAt") VALUES
    ('money_zero', 'money_cook_a', 'Synthetic Zero Dish', 'Test', 0, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_ordinary', 'money_cook_a', 'Synthetic Ordinary Dish', 'Test', 12.34, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_positive_below', 'money_cook_a', 'Synthetic Positive Below Boundary', 'Test', 1.0049, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_positive_above', 'money_cook_a', 'Synthetic Positive Above Boundary', 'Test', 1.0051, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_negative_below', 'money_cook_a', 'Synthetic Negative Below Boundary', 'Test', -1.0049, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_negative_above', 'money_cook_a', 'Synthetic Negative Above Boundary', 'Test', -1.0051, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_failure_probe', 'money_cook_b', 'Synthetic Failure Probe', 'Test', 2.00, TIMESTAMP '2026-10-15 00:00:00');

INSERT INTO "PlatformSettings" (id, "platformFeePercent", "deliveryFeeBase", "updatedAt")
VALUES ('default', 10.12556, 0, TIMESTAMP '2026-10-15 00:00:00');

INSERT INTO "Checkout" (id, "customerId", "idempotencyKey", "addressSnapshot", subtotal, "deliveryFee", "platformFee", "totalAmount")
VALUES ('money_checkout', 'money_customer', 'money-rehearsal-key', '{}'::jsonb, 55.00, 4.00, 6.25, 65.25);

INSERT INTO "Order" (id, "orderNumber", "customerId", "cookId", "checkoutId", subtotal, "deliveryFee", "platformFee", "totalAmount", "cookEarning", "deliveryEarning", "updatedAt") VALUES
    ('money_order_a', 'MONEY-REHEARSAL-A', 'money_customer', 'money_cook_a', 'money_checkout', 30.00, 2.00, 3.20, 35.20, 26.80, 2.00, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_order_b', 'MONEY-REHEARSAL-B', 'money_customer', 'money_cook_b', 'money_checkout', 25.00, 2.00, 3.05, 30.05, 21.95, 2.00, TIMESTAMP '2026-10-15 00:00:00'),
    ('money_negative_fee_order', 'MONEY-REHEARSAL-NEG', 'money_customer', 'money_cook_a', NULL, 0, 1.006, -1.006, 0, 0, 0, TIMESTAMP '2026-10-15 00:00:00');

INSERT INTO "OrderItem" (id, "orderId", "dishId", name, quantity, "unitPrice", "totalPrice") VALUES
    ('money_item_a', 'money_order_a', 'money_ordinary', 'Synthetic snapshot A', 3, 10.00, 30.00),
    ('money_item_b', 'money_order_b', 'money_zero', 'Synthetic snapshot B', 1, 25.00, 25.00);

INSERT INTO "PaymentAttempt" (id, "checkoutId", reference, amount, "expiresAt", "updatedAt") VALUES
    ('money_main_attempt', 'money_checkout', 'MONEY-REHEARSAL-REF', 65.25, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP),
    ('money_zero_attempt', 'money_checkout', 'MONEY-REHEARSAL-ZERO', 0, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP);
'@
}

function Get-FloatColumnCountSql {
    return @'
SELECT count(*)
FROM (VALUES
    ('Dish', 'price'),
    ('Order', 'subtotal'), ('Order', 'deliveryFee'), ('Order', 'platformFee'), ('Order', 'totalAmount'), ('Order', 'cookEarning'), ('Order', 'deliveryEarning'),
    ('Checkout', 'subtotal'), ('Checkout', 'deliveryFee'), ('Checkout', 'platformFee'), ('Checkout', 'totalAmount'),
    ('OrderItem', 'unitPrice'), ('OrderItem', 'totalPrice'),
    ('PlatformSettings', 'platformFeePercent'), ('PlatformSettings', 'deliveryFeeBase'),
    ('PaymentAttempt', 'amount')
) AS expected(table_name, column_name)
JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = expected.table_name
 AND c.column_name = expected.column_name
 AND c.data_type = 'double precision';
'@
}

function Write-TemporarySql([string]$Contents, [string]$Label) {
    $path = Join-Path $env:TEMP ("tastebridge-money-{0}-{1}.sql" -f $Label, [guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText($path, $Contents, [System.Text.UTF8Encoding]::new($false))
    return $path
}

function Assert-RehearsalSchemaFiles([string]$BackendDirectory) {
    $migrationDirectory = Join-Path $BackendDirectory 'prisma\migrations'
    $script:MigrationDirectories = @(Get-ChildItem -LiteralPath $migrationDirectory -Directory | Sort-Object Name)
    if ($script:MigrationDirectories.Count -lt 2) { Stop-Safely 'The migration directory is incomplete.' }
    if ($script:MigrationDirectories[-1].Name -cne $LatestMigration) { Stop-Safely "Expected $LatestMigration to be the latest migration directory for this rehearsal; inspect and update this script if a newer migration is added." }
    $requiredChain = @($PredecessorMigration, $TargetMigration, $OnlineCheckoutMigration, $FulfillmentMigration, $ReadyForPickupMigration, $OrderHistoryMigration, $DeliveryAgentPayoutMigration, $LatestMigration)
    $requiredIndexes = [System.Collections.Generic.List[int]]::new()
    for ($index = 0; $index -lt $script:MigrationDirectories.Count; $index++) {
        if ($script:MigrationDirectories[$index].Name -in $requiredChain) { $requiredIndexes.Add($index) }
    }
    if ($requiredIndexes.Count -ne $requiredChain.Count) {
        Stop-Safely 'One or more expected payment/fulfillment migrations are missing from the local chain.'
    }
    for ($index = 0; $index -lt $requiredChain.Count; $index++) {
        if ($script:MigrationDirectories[$requiredIndexes[$index]].Name -cne $requiredChain[$index]) {
            Stop-Safely "Payment migration order mismatch. Expected consecutive chain: $($requiredChain -join ' -> ')."
        }
        if ($index -gt 0 -and $requiredIndexes[$index] -ne ($requiredIndexes[$index - 1] + 1)) {
            Stop-Safely "Payment/fulfillment migrations must be consecutive in the inspected chain: $($requiredChain -join ' -> ')."
        }
    }
    foreach ($directory in $script:MigrationDirectories) {
        $migrationFile = Join-Path $directory.FullName 'migration.sql'
        if (-not (Test-Path -LiteralPath $migrationFile -PathType Leaf)) { Stop-Safely "Missing migration SQL: $migrationFile" }
    }
    $script:MoneyMigrationFile = Join-Path (Join-Path $migrationDirectory $TargetMigration) 'migration.sql'
    $script:MoneyMigrationText = Get-Content -LiteralPath $script:MoneyMigrationFile -Raw
    if ($script:MoneyMigrationText -notmatch '(?im)^\s*BEGIN\s*;' -or $script:MoneyMigrationText -notmatch '(?im)^\s*COMMIT\s*;') {
        Stop-Safely 'The target migration does not declare the expected transaction boundaries.'
    }
}

function Invoke-Inspection([string]$BackendDirectory) {
    Assert-RehearsalSchemaFiles $BackendDirectory
    Write-Host 'INSPECTION ONLY: no PostgreSQL connection, database creation, SQL execution, Prisma command, or cleanup will occur.'
    Write-Host "Backend: $BackendDirectory"
    Write-Host 'Repository migration order:'
    $script:MigrationDirectories | ForEach-Object { Write-Host "  $($_.Name)" }
    Write-Host "Target: $TargetMigration"
    Write-Host "Legacy money-conversion path: replay all migrations through $PredecessorMigration, apply synthetic DOUBLE PRECISION fixtures, then apply $TargetMigration and validate conversion/rollback assertions."
    Write-Host "Fresh empty replay path: npx prisma migrate deploy applies the complete chain through $LatestMigration, then migrate status and schema diff compare the result with schema.prisma."
    Write-Host "Payment, fulfillment, order-tracking, and delivery payout migration order: $PredecessorMigration -> $TargetMigration -> $OnlineCheckoutMigration -> $FulfillmentMigration -> $ReadyForPickupMigration -> $OrderHistoryMigration -> $DeliveryAgentPayoutMigration -> $LatestMigration"
    Write-Host 'Money precision check: NUMERIC(14,2) currencies; NUMERIC(7,4) rate. Synthetic rounding values straddle, but do not assert, exact DOUBLE PRECISION half-paise ties.'
    Write-Host 'Run -Mode Rehearse with two new explicit names to opt into database writes. This mode never targets tastebridge.'
}

function Invoke-Rehearsal([string]$BackendDirectory) {
    Assert-SafeDatabaseName $LegacyDatabaseName 'Legacy fixture'
    Assert-SafeDatabaseName $ReplayDatabaseName 'Full replay'
    if ($LegacyDatabaseName -ceq $ReplayDatabaseName) { Stop-Safely 'The legacy fixture and full replay databases must have distinct names.' }
    Assert-RehearsalSchemaFiles $BackendDirectory

    $script:PsqlExecutable = Get-PsqlExecutable
    $script:NpxExecutable = Get-NpxExecutable
    $rawUrl = Get-DatabaseUrlWithoutPrintingIt $BackendDirectory
    $script:RawDatabaseUrl = $rawUrl
    try { $script:SourceUri = [System.Uri]::new($rawUrl) }
    catch { Stop-Safely 'DATABASE_URL is invalid; its contents are deliberately not printed.' }
    if ($script:SourceUri.Scheme -notin @('postgresql', 'postgres')) { Stop-Safely 'DATABASE_URL must use postgresql:// or postgres://.' }
    if ($script:SourceUri.Host -notin @('127.0.0.1', 'localhost') -or $script:SourceUri.Port -ne $ExpectedPort) {
        Stop-Safely "DATABASE_URL must identify the reported local PostgreSQL endpoint $ExpectedHost`:$ExpectedPort. Its contents are not printed."
    }
    if ($script:SourceUri.AbsolutePath.Trim('/') -cne $ProtectedDatabase) {
        Stop-Safely "The credential source must be backend DATABASE_URL for '$ProtectedDatabase'; the script will not connect to it."
    }
    $userInfo = $script:SourceUri.GetComponents([System.UriComponents]::UserInfo, [System.UriFormat]::UriEscaped) -split ':', 2
    if (-not $userInfo[0]) { Stop-Safely 'DATABASE_URL must contain an authenticated PostgreSQL user.' }
    $script:ExpectedUser = [System.Uri]::UnescapeDataString($userInfo[0])
    $script:ExpectedPassword = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { '' }
    $script:SslMode = 'prefer'
    if ($script:SourceUri.Query -match '(?:\?|&)sslmode=([^&]+)') { $script:SslMode = [System.Uri]::UnescapeDataString($Matches[1]) }

    $script:ReplayDatabaseName = $ReplayDatabaseName
    $script:PendingManifestDatabaseNames = [System.Collections.Generic.List[string]]::new()
    $savedEnvironment = @{}
    foreach ($name in @('DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGCONNECT_TIMEOUT', 'PGDATABASE', 'DOTENV_CONFIG_OVERRIDE')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    $tempFiles = [System.Collections.Generic.List[string]]::new()
    try {
        Set-ConnectionEnvironment $MaintenanceDatabase
        Write-Host "READ-ONLY IDENTITY TARGET [$MaintenanceDatabase]: verify server, port, authenticated role, and connected database before any database write."
        $adminIdentity = Assert-DatabaseIdentity $MaintenanceDatabase
        $roleSql = "SELECT rolcreatedb::text || '|' || rolsuper::text FROM pg_roles WHERE rolname = current_user;"
        $roleResult = Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql $roleSql
        $roleLine = @($roleResult.Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(true|false)\|(true|false)$' }) | Select-Object -Last 1
        if (-not $roleLine) { Stop-Safely 'Could not establish whether the authenticated role can create disposable databases.' }
        $roleFlags = $roleLine -split '\|'
        if ($roleFlags[0] -ne 'true' -and $roleFlags[1] -ne 'true') {
            Stop-Safely 'The authenticated PostgreSQL role lacks CREATEDB/superuser permission. No database was created.'
        }

        $names = @($LegacyDatabaseName, $ReplayDatabaseName)
        $existingSql = "SELECT datname FROM pg_database WHERE datname IN ('$LegacyDatabaseName', '$ReplayDatabaseName') ORDER BY datname;"
        $existing = Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql $existingSql
        $existingNames = @($existing.Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -in $names })
        if ($existingNames.Count -gt 0) { Stop-Safely "Database(s) already exist; refusing reuse or overwrite: $($existingNames -join ', ')." }
        foreach ($name in $names) {
            if (Test-Path -LiteralPath (Get-ManifestPath $name)) { Stop-Safely "A rehearsal manifest already exists for '$name'; refusing to overwrite or reuse it." }
        }

        $fixtureFile = Write-TemporarySql (Get-FixtureSql) 'fixtures'; $tempFiles.Add($fixtureFile)
        $assertionFile = Write-TemporarySql (Get-MoneyMigrationSql) 'assertions'; $tempFiles.Add($assertionFile)
        $script:FloatColumnCountSql = Get-FloatColumnCountSql

        Write-Host "CREATE TARGET [$LegacyDatabaseName]: CREATE DATABASE from template0; existing databases will not be reused or dropped."
        Write-DatabaseManifest $LegacyDatabaseName $adminIdentity
        $script:PendingManifestDatabaseNames.Add($LegacyDatabaseName)
        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        [void](Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql "CREATE DATABASE `"$LegacyDatabaseName`" TEMPLATE template0 ENCODING 'UTF8';")
        Add-DatabaseOwnershipMarker $LegacyDatabaseName
        Set-ConnectionEnvironment $LegacyDatabaseName
        $legacyIdentity = Assert-DatabaseIdentity $LegacyDatabaseName
        Mark-DatabaseManifestCreated $LegacyDatabaseName $legacyIdentity
        $script:PendingManifestDatabaseNames.Remove($LegacyDatabaseName)

        Write-Host "STAGE A [$LegacyDatabaseName]: apply each predecessor migration as SQL through $PredecessorMigration."
        $targetIndex = -1
        for ($index = 0; $index -lt $script:MigrationDirectories.Count; $index++) {
            if ($script:MigrationDirectories[$index].Name -ceq $TargetMigration) { $targetIndex = $index; break }
        }
        for ($index = 0; $index -lt $targetIndex; $index++) {
            $directory = $script:MigrationDirectories[$index]
            [void](Invoke-VerifiedPsqlWrite -Database $LegacyDatabaseName -File (Join-Path $directory.FullName 'migration.sql'))
        }

        [void](Invoke-VerifiedPsqlWrite -Database $LegacyDatabaseName -File $fixtureFile)

        foreach ($invalidValue in @(
            [pscustomobject]@{ Label = 'NaN'; SqlValue = "'NaN'::double precision" },
            [pscustomobject]@{ Label = 'positive Infinity'; SqlValue = "'Infinity'::double precision" },
            [pscustomobject]@{ Label = 'negative Infinity'; SqlValue = "'-Infinity'::double precision" },
            [pscustomobject]@{ Label = 'positive out-of-range'; SqlValue = '1000000000000::double precision' },
            [pscustomobject]@{ Label = 'negative out-of-range'; SqlValue = '-1000000000000::double precision' }
        )) {
            Write-Host "Preparing synthetic $($invalidValue.Label) rejection case in '$LegacyDatabaseName'."
            # Pass quoted, case-sensitive PostgreSQL identifiers via a SQL file.
            # PowerShell's native --command argument serialization can strip the
            # embedded identifier quotes, turning "Dish" into the nonexistent dish.
            $invalidProbeFile = Write-TemporarySql "UPDATE `"Dish`" SET price = $($invalidValue.SqlValue) WHERE id = 'money_failure_probe';" 'invalid-probe'
            $tempFiles.Add($invalidProbeFile)
            [void](Invoke-VerifiedPsqlWrite -Database $LegacyDatabaseName -File $invalidProbeFile)
            Invoke-ExpectedMigrationFailure $LegacyDatabaseName 'Cannot convert Dish.price'
            $restoreProbeFile = Write-TemporarySql 'UPDATE "Dish" SET price = 2.00 WHERE id = ''money_failure_probe'';' 'restore-probe'
            $tempFiles.Add($restoreProbeFile)
            [void](Invoke-VerifiedPsqlWrite -Database $LegacyDatabaseName -File $restoreProbeFile)
        }

        [void](Invoke-VerifiedPsqlWrite -Database $LegacyDatabaseName -File $script:MoneyMigrationFile)
        [void](Assert-DatabaseIdentity $LegacyDatabaseName)
        Write-Host "ASSERTION TARGET [$LegacyDatabaseName]: verify rounded values, all money scales, preserved FK/index definitions, and multi-cook total reconciliation."
        $assertions = Invoke-Psql -Database $LegacyDatabaseName -ExpectedDatabase $LegacyDatabaseName -File $assertionFile
        $assertions.Lines | ForEach-Object { Write-Host $_ }
        Write-Host "STAGE A PASSED: conversion fixture assertions passed on '$LegacyDatabaseName'."

        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        Write-Host "CREATE TARGET [$ReplayDatabaseName]: CREATE a second empty database from template0 for the complete Prisma replay."
        Write-DatabaseManifest $ReplayDatabaseName $adminIdentity
        $script:PendingManifestDatabaseNames.Add($ReplayDatabaseName)
        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        [void](Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql "CREATE DATABASE `"$ReplayDatabaseName`" TEMPLATE template0 ENCODING 'UTF8';")
        Add-DatabaseOwnershipMarker $ReplayDatabaseName
        Set-ConnectionEnvironment $ReplayDatabaseName
        $replayIdentity = Assert-DatabaseIdentity $ReplayDatabaseName
        Mark-DatabaseManifestCreated $ReplayDatabaseName $replayIdentity
        $script:PendingManifestDatabaseNames.Remove($ReplayDatabaseName)

        Push-Location $BackendDirectory
        try {
            Write-Host "MIGRATION TARGET [$ReplayDatabaseName]: npx.cmd prisma migrate deploy"
            Invoke-Prisma $ReplayDatabaseName @('prisma', 'migrate', 'deploy')

            Write-Host "ENUM ASSERTION TARGET [$ReplayDatabaseName]: verify READY_FOR_PICKUP in public.OrderStatus."
            Assert-ReadyForPickupEnum $ReplayDatabaseName

            Write-Host "STATUS TARGET [$ReplayDatabaseName]: npx.cmd prisma migrate status"
            Invoke-Prisma $ReplayDatabaseName @('prisma', 'migrate', 'status')

            Write-Host "SCHEMA DIFF TARGET [$ReplayDatabaseName]: compare live disposable schema with prisma/schema.prisma."
            Invoke-Prisma $ReplayDatabaseName @('prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code')
        }
        finally { Pop-Location }

        Write-Host 'REHEARSAL PASSED. Both disposable databases are intentionally retained.'
        Write-Host "Legacy fixture database: $LegacyDatabaseName"
        Write-Host "Full replay database: $ReplayDatabaseName"
        Write-Host 'No cleanup was performed. Use a separate Cleanup invocation with the exact database name and typed confirmation if removal is later approved.'
    }
    finally {
        foreach ($pendingName in $script:PendingManifestDatabaseNames) {
            $pendingManifestPath = Get-ManifestPath $pendingName
            Write-Host "RECOVERY REQUIRED: failure occurred during creation/registration of '$pendingName'; no automatic drop was attempted. Pre-creation manifest: '$pendingManifestPath'. First connect read-only to the exact local server and confirm current_database()='postgres', address=$ExpectedHost, port=$ExpectedPort, database name='$pendingName', owner matches the manifest user, and database comment matches 'tastebridge-money-rehearsal:<manifest marker>'. If all checks match, run Cleanup mode with -CleanupDatabaseName and -ConfirmCleanupDatabaseName both exactly '$pendingName', then type the exact name when prompted. If the database does not exist, remove only this stale manifest after independently confirming absence. If it exists but owner/comment do not match or the marker write failed, do not use Cleanup: preserve the database and manifest and resolve ownership manually with the PostgreSQL administrator."
        }
        foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
        foreach ($file in $tempFiles) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
    }
}

function Invoke-ExplicitCleanup {
    Assert-SafeDatabaseName $CleanupDatabaseName 'Cleanup'
    if ($CleanupDatabaseName -cnotmatch '^tastebridge_money_(legacy|replay)_') {
        Stop-Safely 'Cleanup is limited to an explicitly named TasteBridge money rehearsal database.'
    }
    if ($ConfirmCleanupDatabaseName -cne $CleanupDatabaseName) {
        Stop-Safely 'Cleanup requires -ConfirmCleanupDatabaseName to exactly repeat -CleanupDatabaseName.'
    }
    $manifestPath = Get-ManifestPath $CleanupDatabaseName
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Stop-Safely "No script-created rehearsal manifest exists for '$CleanupDatabaseName'; refusing to delete it."
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.database -cne $CleanupDatabaseName -or $manifest.host -cne $ExpectedHost -or
        $manifest.port -ne $ExpectedPort -or [string]::IsNullOrWhiteSpace([string]$manifest.user) -or
        [string]::IsNullOrWhiteSpace([string]$manifest.marker) -or $manifest.status -notin @('creation-intended', 'created')) {
        Stop-Safely 'Cleanup manifest identity does not match the exact requested disposable database and local endpoint.'
    }

    $BackendDirectory = Get-BackendDirectory
    $script:PsqlExecutable = Get-PsqlExecutable
    $rawUrl = Get-DatabaseUrlWithoutPrintingIt $BackendDirectory
    $script:RawDatabaseUrl = $rawUrl
    try { $script:SourceUri = [System.Uri]::new($rawUrl) } catch { Stop-Safely 'DATABASE_URL is invalid; its contents are not printed.' }
    if ($script:SourceUri.Scheme -notin @('postgresql', 'postgres') -or
        $script:SourceUri.Host -notin @('127.0.0.1', 'localhost') -or
        $script:SourceUri.Port -ne $ExpectedPort -or
        $script:SourceUri.AbsolutePath.Trim('/') -cne $ProtectedDatabase) {
        Stop-Safely 'Credential source must identify the local TasteBridge development URL, which this script will not connect to.'
    }
    $userInfo = $script:SourceUri.GetComponents([System.UriComponents]::UserInfo, [System.UriFormat]::UriEscaped) -split ':', 2
    $script:ExpectedUser = [System.Uri]::UnescapeDataString($userInfo[0])
    if ($manifest.user -cne $script:ExpectedUser) {
        Stop-Safely 'Cleanup authenticated user differs from the user recorded when the disposable database was created.'
    }
    $script:ExpectedPassword = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { '' }
    $script:SslMode = 'prefer'
    if ($script:SourceUri.Query -match '(?:\?|&)sslmode=([^&]+)') { $script:SslMode = [System.Uri]::UnescapeDataString($Matches[1]) }

    $savedEnvironment = @{}
    foreach ($name in @('DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGCONNECT_TIMEOUT', 'PGDATABASE', 'DOTENV_CONFIG_OVERRIDE')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    try {
        Set-ConnectionEnvironment $MaintenanceDatabase
        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        $markerComment = "tastebridge-money-rehearsal:$($manifest.marker)"
        $identitySql = "SELECT pg_get_userbyid(datdba) || '|' || COALESCE(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = '$CleanupDatabaseName';"
        $databaseRecord = Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql $identitySql
        $recordLine = @($databaseRecord.Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\|' }) | Select-Object -Last 1
        if (-not $recordLine) { Stop-Safely "The exact manifest database '$CleanupDatabaseName' does not exist; nothing was deleted." }
        $recordParts = $recordLine -split '\|', 2
        if ($recordParts.Count -ne 2 -or $recordParts[0] -cne [string]$manifest.user -or $recordParts[1] -cne $markerComment) {
            Stop-Safely 'Database owner or ownership marker does not match the exact script manifest; refusing cleanup.'
        }
        $typed = Read-Host "Type the exact disposable database name to confirm deletion of only '$CleanupDatabaseName'"
        if ($typed -cne $CleanupDatabaseName) { Stop-Safely 'Typed cleanup confirmation did not match; nothing was deleted.' }

        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        $finalRecord = Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql $identitySql
        $finalLine = @($finalRecord.Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\|' }) | Select-Object -Last 1
        $finalParts = if ($finalLine) { $finalLine -split '\|', 2 } else { @() }
        if ($finalParts.Count -ne 2 -or $finalParts[0] -cne [string]$manifest.user -or $finalParts[1] -cne $markerComment) {
            Stop-Safely 'Database owner or ownership marker changed before cleanup; refusing to drop it.'
        }
        [void](Assert-DatabaseIdentity $MaintenanceDatabase)
        Write-Host "DESTRUCTIVE ACTION TARGET [$CleanupDatabaseName]: DROP DATABASE. Only this exact manifest-listed database will be deleted."
        [void](Invoke-Psql -Database $MaintenanceDatabase -ExpectedDatabase $MaintenanceDatabase -Sql "DROP DATABASE `"$CleanupDatabaseName`";")
        Remove-Item -LiteralPath $manifestPath -Force
        Write-Host "CLEANUP COMPLETE: deleted only '$CleanupDatabaseName'."
    }
    finally { foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') } }
}

$scriptPath = $MyInvocation.MyCommand.Path
$script:BackendDirectory = Get-BackendDirectory

switch ($Mode) {
    'Inspect' { Invoke-Inspection $script:BackendDirectory }
    'Rehearse' { Invoke-Rehearsal $script:BackendDirectory }
    'Cleanup' { Invoke-ExplicitCleanup }
}
