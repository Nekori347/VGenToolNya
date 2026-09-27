$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'VGenToolNya-TM-L2-*' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $assetRoot) {
    throw 'Previous Migration Deployment L2 Chrome/Tampermonkey assets were not found.'
}

$chromePath = Join-Path $assetRoot.FullName 'chrome-for-testing\chrome-win64\chrome.exe'
$extensionPath = Join-Path $assetRoot.FullName 'tampermonkey'
$manifestPath = Join-Path $extensionPath 'manifest.json'

if (-not (Test-Path -LiteralPath $chromePath)) {
    throw "Chrome for Testing was not found: $chromePath"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Tampermonkey extension was not found: $extensionPath"
}

$previousLocation = Get-Location
Set-Location -LiteralPath $projectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'VGenToolNya build failed.' }

    $env:VGEN_NYA_TEST_ROOT = Join-Path $projectRoot 'staging\upload-live-test'
    $env:VGEN_NYA_CFT_CHROME = $chromePath
    $env:VGEN_NYA_TM_EXTENSION = $extensionPath
    $env:VGEN_NYA_LIVE_PORT = '9350'

    node scripts\tampermonkey-deployment-l2.mjs --prepare-upload-live
    if ($LASTEXITCODE -ne 0) { throw 'Upload Live Test Profile preparation failed.' }
} finally {
    Set-Location -LiteralPath $previousLocation.Path
}
