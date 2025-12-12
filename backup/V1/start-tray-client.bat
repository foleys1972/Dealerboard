@echo off
REM TradePulse Tray Launcher
REM This opens the web client in a persistent, always-ready window

echo Starting TradePulse in Tray Mode...

REM Launch Chrome in app mode with the tray launcher
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=file:///%~dp0tray-launcher.html --window-size=0,0 --window-position=-2000,-2000

echo TradePulse is now running in the system tray!
echo Look for the icon in the bottom-right corner.
echo.
echo Press any key to exit this window (TradePulse will keep running)...
pause > nul

