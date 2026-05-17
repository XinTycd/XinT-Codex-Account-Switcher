$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distPath = Join-Path $projectRoot 'dist'
$tempOutput = Join-Path $env:TEMP 'xint-codex-account-switcher-installer-build'
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$artifactName = "XinT-Codex-Account-Switcher-v$($packageJson.version).exe"

Get-Process -ErrorAction SilentlyContinue |
  Where-Object {
    ($_.ProcessName -eq 'XinT Codex Account Switcher') -or
    ($_.Path -and $_.Path.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase))
  } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Milliseconds 500

if (Test-Path -LiteralPath $distPath) {
  Remove-Item -LiteralPath $distPath -Recurse -Force
}

if (Test-Path -LiteralPath $tempOutput) {
  Remove-Item -LiteralPath $tempOutput -Recurse -Force
}

New-Item -ItemType Directory -Path $distPath | Out-Null
New-Item -ItemType Directory -Path $tempOutput | Out-Null

Push-Location $projectRoot
try {
  & npx electron-builder --win nsis "--config.directories.output=$tempOutput"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$builtArtifact = Join-Path $tempOutput $artifactName
if (!(Test-Path -LiteralPath $builtArtifact)) {
  throw "Expected artifact not found: $builtArtifact"
}

Copy-Item -LiteralPath $builtArtifact -Destination (Join-Path $distPath $artifactName) -Force

Get-ChildItem -LiteralPath $distPath -File | Select-Object Name, Length, LastWriteTime
