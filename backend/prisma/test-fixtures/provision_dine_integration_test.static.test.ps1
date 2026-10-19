$ErrorActionPreference = 'Stop'

$provisionerPath = Join-Path $PSScriptRoot 'provision_dine_integration_test.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($provisionerPath, [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Provisioner PowerShell syntax is invalid.' }
$provisionerText = Get-Content -LiteralPath $provisionerPath -Raw
if ([regex]::Matches($provisionerText, 'host\(inet_server_addr\(\)\)').Count -ne 2 -or $provisionerText.Contains('inet_server_addr()::text')) {
    throw 'Both identity queries must normalize inet_server_addr() with PostgreSQL host().'
}

# Load only the pure address-normalization function from the provisioner AST.
# Do not dot-source or execute the provisioning script.
$normalizer = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'ConvertTo-HostAddress'
}, $true)
if (-not $normalizer) { throw 'ConvertTo-HostAddress was not found in the provisioner.' }
Invoke-Expression $normalizer.Extent.Text

$validCases = @(
    @{ Input = '127.0.0.1'; Expected = '127.0.0.1'; Loopback = $true },
    @{ Input = '::1'; Expected = '::1'; Loopback = $true },
    @{ Input = '127.0.0.1/32'; Expected = '127.0.0.1'; Loopback = $true },
    @{ Input = '::1/128'; Expected = '::1'; Loopback = $true },
    @{ Input = '192.0.2.10'; Expected = '192.0.2.10'; Loopback = $false }
)
foreach ($case in $validCases) {
    $actual = ConvertTo-HostAddress $case.Input
    if ($actual -ne $case.Expected) { throw "Address normalization failed for '$($case.Input)' (actual '$actual')." }
    $isLoopback = [System.Net.IPAddress]::IsLoopback([System.Net.IPAddress]::Parse($actual))
    if ($isLoopback -ne $case.Loopback) { throw "Loopback classification failed for '$($case.Input)'." }
}

$invalidCases = @('', 'not-an-address', '127.0.0.1/31', '::1/64', '127.0.0.1/999', '::1/128/extra')
foreach ($inputAddress in $invalidCases) {
    if ($null -ne (ConvertTo-HostAddress $inputAddress)) { throw "Invalid address was accepted: '$inputAddress'." }
}

Write-Output 'Provisioner address static tests: PASS (IPv4, IPv6, prior CIDR forms, non-loopback, and invalid masks).'
