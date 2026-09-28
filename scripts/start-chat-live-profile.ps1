$ErrorActionPreference = 'Stop'

# CHAT-LIVE-01 intentionally reuses the proven Upload/Migration L2 Chrome,
# Tampermonkey and managed profile launcher. The launcher rebuilds and
# reinstalls the current dist artifact without copying any production profile.
$launcher = Join-Path $PSScriptRoot 'start-upload-live-profile.ps1'
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Shared VGen live-profile launcher was not found: $launcher"
}

& $launcher
if ($LASTEXITCODE -ne 0) {
    throw 'Shared VGen live-profile launcher failed.'
}
