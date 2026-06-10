param(
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$nodeDir = Join-Path $RepoRoot 'tools\node20'
$offlineDir = Join-Path $RepoRoot 'tools\offline'

if (Test-Path (Join-Path $nodeDir 'node.exe')) {
  Write-Host "Node20 already present: $nodeDir"
  exit 0
}

if (-not (Test-Path $offlineDir)) {
  throw "Missing offline folder: $offlineDir"
}

$zip = Get-ChildItem -Path $offlineDir -Filter 'node-v20.*-win-x64.zip' -File | Sort-Object Name -Descending | Select-Object -First 1
if (-not $zip) {
  throw "Missing Node 20 zip. Place node-v20.x.y-win-x64.zip in $offlineDir"
}

Write-Host "Extracting portable Node from $($zip.FullName) ..."
if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
New-Item -ItemType Directory -Path $nodeDir | Out-Null

$temp = Join-Path $env:TEMP ('ti-node20-' + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $temp | Out-Null
Expand-Archive -Path $zip.FullName -DestinationPath $temp -Force

$extracted = Get-ChildItem -Path $temp -Directory | Select-Object -First 1
if (-not $extracted) { throw "Failed to extract Node zip" }

Copy-Item -Path (Join-Path $extracted.FullName '*') -Destination $nodeDir -Recurse -Force
Remove-Item -Recurse -Force $temp

if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
  throw "Node extraction finished but node.exe not found in $nodeDir"
}

Write-Host "Node20 ready: $nodeDir"
