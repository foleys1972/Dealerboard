# Uninstall TradePulse from Auto-Startup

Write-Host "TradePulse Auto-Startup Uninstaller" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "TradePulse.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "✓ TradePulse removed from startup" -ForegroundColor Green
    Write-Host "  It will no longer launch automatically on login." -ForegroundColor Gray
} else {
    Write-Host "TradePulse is not currently set to auto-start." -ForegroundColor Yellow
}

Write-Host ""
pause

