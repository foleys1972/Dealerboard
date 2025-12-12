# Install TradePulse to Auto-Start on Windows Login
# This adds TradePulse to your Windows Startup folder

Write-Host "TradePulse Auto-Startup Installer" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "TradePulse.lnk"
$targetScript = Join-Path $PSScriptRoot "start-tray-client.ps1"

# Check if already installed
if (Test-Path $shortcutPath) {
    Write-Host "TradePulse is already set to auto-start." -ForegroundColor Yellow
    $response = Read-Host "Do you want to reinstall it? (y/n)"
    if ($response -ne 'y') {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        pause
        exit
    }
    Remove-Item $shortcutPath -Force
}

# Create shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$targetScript`""
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.IconLocation = "shell32.dll,16"  # Phone icon
$Shortcut.Description = "TradePulse Intercom - Always Ready"
$Shortcut.Save()

Write-Host ""
Write-Host "✓ TradePulse installed to startup!" -ForegroundColor Green
Write-Host "  Location: $shortcutPath" -ForegroundColor Gray
Write-Host ""
Write-Host "TradePulse will now launch automatically when you log in to Windows." -ForegroundColor Cyan
Write-Host ""
Write-Host "To test it now, run: .\start-tray-client.ps1" -ForegroundColor Yellow
Write-Host "To uninstall, run: .\uninstall-startup.ps1" -ForegroundColor Yellow
Write-Host ""
pause

