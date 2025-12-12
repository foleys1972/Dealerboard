# TradePulse Tray Launcher (PowerShell)
# This opens the web client in a persistent, always-ready window

Write-Host "Starting TradePulse in Tray Mode..." -ForegroundColor Cyan

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$launcherPath = Join-Path $PSScriptRoot "tray-launcher.html"

# Check which browser is available
if (Test-Path $chromePath) {
    $browserPath = $chromePath
    Write-Host "Using Chrome..." -ForegroundColor Green
} elseif (Test-Path $edgePath) {
    $browserPath = $edgePath
    Write-Host "Using Edge..." -ForegroundColor Green
} else {
    Write-Host "ERROR: Chrome or Edge not found!" -ForegroundColor Red
    Write-Host "Please install Chrome or Edge, or update the browser path in this script." -ForegroundColor Yellow
    pause
    exit
}

# Launch browser in app mode
$launcherUrl = "file:///$($launcherPath.Replace('\', '/'))"
Start-Process $browserPath -ArgumentList "--app=$launcherUrl"

Write-Host ""
Write-Host "✓ TradePulse is now running!" -ForegroundColor Green
Write-Host "  Look for the floating icon in the bottom-right corner." -ForegroundColor Cyan
Write-Host "  Click the icon to open/minimize the intercom." -ForegroundColor Cyan
Write-Host ""
Write-Host "To close completely, close the browser window." -ForegroundColor Yellow

