[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory "..\..")).Path
$configPath = Join-Path $projectRoot "contracts\launch-config.json"
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json

$originalPath = $env:Path
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    $userProfileDirectory = [Environment]::GetFolderPath("UserProfile")
    $bundledNodeDirectory = Join-Path $userProfileDirectory ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
    $bundledNodePath = Join-Path $bundledNodeDirectory "node.exe"
    if (-not (Test-Path -LiteralPath $bundledNodePath)) {
        throw "Node.js was not found in PATH or in the bundled Codex runtime."
    }
    $env:Path = "$bundledNodeDirectory;$env:Path"
}

$ownerAddress = [string]$config.deployment.ownerAddress
$treasuryAddress = [string]$config.treasury.address
$tokenUri = [string]$config.deployment.tokenURI
$chainId = [string]$config.deployment.testnetV4ChainId

if (-not $ownerAddress) { throw "The testnet owner address is missing from launch-config.json." }
if (-not $treasuryAddress) { throw "The treasury address is missing from launch-config.json." }
if (-not $tokenUri) { throw "The metadata token URI is missing from launch-config.json." }
if ($chainId -ne "943") { throw "The configured Testnet V4 chain ID must be 943." }

$environmentNames = @(
    "RPC_URL",
    "EXPECTED_CHAIN_ID",
    "OWNER_ADDRESS",
    "TREASURY_ADDRESS",
    "TOKEN_URI",
    "DEPLOYER_PRIVATE_KEY"
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

$secureKey = Read-Host "Enter the dedicated TESTNET wallet private key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$locationPushed = $false

try {
    $env:RPC_URL = "https://rpc.v4.testnet.pulsechain.com"
    $env:EXPECTED_CHAIN_ID = $chainId
    $env:OWNER_ADDRESS = $ownerAddress
    $env:TREASURY_ADDRESS = $treasuryAddress
    $env:TOKEN_URI = $tokenUri
    $env:DEPLOYER_PRIVATE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)

    Push-Location $projectRoot
    $locationPushed = $true

    $derivedAddress = & pnpm exec node --input-type=module -e "import { Wallet } from 'ethers'; process.stdout.write(new Wallet(process.env.DEPLOYER_PRIVATE_KEY).address);"
    if ($LASTEXITCODE -ne 0) { throw "Unable to validate the testnet private key." }
    if (-not [string]::Equals($derivedAddress, $ownerAddress, [StringComparison]::OrdinalIgnoreCase)) {
        throw "The entered private key belongs to $derivedAddress, not the configured owner $ownerAddress. Deployment stopped."
    }

    Write-Host "Validated testnet deployer: $derivedAddress"
    Write-Host "Treasury: $treasuryAddress"
    Write-Host "Metadata: $tokenUri"
    Write-Host "Testnet mint price: 0.1 tPLS"

    & pnpm contract:deploy
    if ($LASTEXITCODE -ne 0) { throw "The testnet deployment failed." }
}
finally {
    if ($locationPushed) { Pop-Location }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $env:Path = $originalPath
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
    }
}
