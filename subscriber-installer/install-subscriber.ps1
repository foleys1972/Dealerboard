param(
  [string]$ServerId,
  [string]$ServerName,
  [string]$PublisherUrl,
  [int]$Port,
  [string]$AnnouncedIp,
  [string]$ListenIp,
  [string]$RedisUrl,
  [string]$SiteIds,
  [switch]$Force,
  [switch]$NoFirewallRule
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Please run this installer as Administrator.'
  }
}

function Read-EnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $path) {
    $trim = $line.Trim()
    if (-not $trim) { continue }
    if ($trim.StartsWith('#')) { continue }
    $idx = $trim.IndexOf('=')
    if ($idx -lt 1) { continue }
    $k = $trim.Substring(0, $idx).Trim()
    $v = $trim.Substring($idx + 1).Trim()
    if ($k) { $map[$k] = $v }
  }
  return $map
}

function Write-EnvFile([string]$path, [hashtable]$values) {
  $lines = @()
  foreach ($k in $values.Keys) {
    $lines += "$k=$($values[$k])"
  }
  $lines | Set-Content -LiteralPath $path -Encoding ascii
}

function Prompt-IfMissing([string]$label, [string]$currentValue, [switch]$Required) {
  if ($Force -or -not $currentValue) {
    $val = Read-Host $label
    if ($Required -and -not $val) {
      throw "Missing required value: $label"
    }
    return $val
  }
  return $currentValue
}

Assert-Admin

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$subscriberExe = Join-Path $root 'subscriber.exe'
$nssmExe = Join-Path $root 'nssm.exe'
$envPath = Join-Path $root 'server.env'
$envExample = Join-Path $root 'server.env.example'
$logsDir = Join-Path $root 'logs'

if (-not (Test-Path $subscriberExe)) { throw "Missing subscriber.exe at $subscriberExe" }
if (-not (Test-Path $nssmExe)) { throw "Missing nssm.exe at $nssmExe" }

if (-not (Test-Path $envPath)) {
  if (Test-Path $envExample) {
    Copy-Item -LiteralPath $envExample -Destination $envPath -Force
  } else {
    New-Item -ItemType File -Path $envPath -Force | Out-Null
  }
}

$existing = Read-EnvFile $envPath

if (-not $ListenIp) { $ListenIp = $existing['LISTEN_IP'] }
if (-not $ListenIp) { $ListenIp = '0.0.0.0' }

if (-not $ServerId) { $ServerId = $existing['SERVER_ID'] }
$ServerId = Prompt-IfMissing 'SERVER_ID (unique per subscriber, e.g. subscriber-01)' $ServerId -Required

if (-not $ServerName) { $ServerName = $existing['SERVER_NAME'] }
if (-not $ServerName) { $ServerName = $ServerId }

if (-not $PublisherUrl) { $PublisherUrl = $existing['PUBLISHER_URL'] }
$PublisherUrl = Prompt-IfMissing 'PUBLISHER_URL (publisher base url, e.g. https://192.168.1.41:5000)' $PublisherUrl -Required

if (-not $Port) {
  $p = $existing['PORT']
  if ($p) { $Port = [int]$p }
}
if (-not $Port) { $Port = 5101 }
if ($Force) {
  $p2 = Read-Host "PORT (subscriber listen port) [$Port]"
  if ($p2) { $Port = [int]$p2 }
}

if (-not $AnnouncedIp) { $AnnouncedIp = $existing['ANNOUNCED_IP'] }
$AnnouncedIp = Prompt-IfMissing 'ANNOUNCED_IP (IP clients use to reach this subscriber)' $AnnouncedIp -Required

if (-not $RedisUrl) { $RedisUrl = $existing['REDIS_URL'] }
if (-not $SiteIds) { $SiteIds = $existing['SITE_IDS'] }

$values = @{
  'SERVER_ROLE'       = 'subscriber'
  'ENABLE_PUBLISHER'  = 'false'
  'ENABLE_SUBSCRIBER' = 'true'
  'SERVER_ID'         = $ServerId
  'SERVER_NAME'       = $ServerName
  'PUBLISHER_URL'     = $PublisherUrl
  'PORT'              = "$Port"
  'LISTEN_IP'         = $ListenIp
  'ANNOUNCED_IP'      = $AnnouncedIp
}

if ($RedisUrl) { $values['REDIS_URL'] = $RedisUrl }
if ($SiteIds) { $values['SITE_IDS'] = $SiteIds }

Write-Host "Writing $envPath"
Write-EnvFile $envPath $values

if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

$serviceName = "TradingIntercomSubscriber-$ServerId"
Write-Host "Installing Windows service: $serviceName"

& $nssmExe install $serviceName $subscriberExe | Out-Null
& $nssmExe set $serviceName AppDirectory $root | Out-Null
& $nssmExe set $serviceName AppStdout (Join-Path $logsDir 'service-stdout.log') | Out-Null
& $nssmExe set $serviceName AppStderr (Join-Path $logsDir 'service-stderr.log') | Out-Null
& $nssmExe set $serviceName AppRotateFiles 1 | Out-Null
& $nssmExe set $serviceName AppRotateOnline 1 | Out-Null
& $nssmExe set $serviceName AppRotateSeconds 86400 | Out-Null
& $nssmExe set $serviceName Start SERVICE_AUTO_START | Out-Null

if (-not $NoFirewallRule) {
  try {
    $ruleName = "$serviceName - TCP $Port"
    & netsh advfirewall firewall add rule name=$ruleName dir=in action=allow protocol=TCP localport=$Port | Out-Null
  } catch {
    Write-Warning "Failed to add firewall rule: $($_.Exception.Message)"
  }
}

Write-Host 'Starting service...'
& $nssmExe start $serviceName | Out-Null

Write-Host 'Service status:'
& sc.exe query $serviceName

Write-Host "Logs: $logsDir"
Write-Host "Web portal/API should be reachable at: http(s)://$AnnouncedIp:$Port/"
