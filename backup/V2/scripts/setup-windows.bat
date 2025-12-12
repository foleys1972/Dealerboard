@echo off
echo Setting up Trading Intercom System on Windows...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Not running as administrator
    echo Some features may require administrator privileges
    echo.
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    echo Recommended version: Node.js 18 or higher
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not available
    echo Please reinstall Node.js with npm
    pause
    exit /b 1
)

echo npm version:
npm --version
echo.

REM Install Redis (if not installed)
redis-server --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Redis is not installed
    echo Please install Redis for Windows from:
    echo https://github.com/microsoftarchive/redis/releases
    echo Or use WSL2 with Ubuntu
    echo.
    echo For now, continuing without Redis...
    echo Some features may not work properly
    echo.
) else (
    echo Redis version:
    redis-server --version
    echo.
)

REM Create necessary directories
echo Creating directories...
if not exist "recordings" mkdir recordings
if not exist "compliance" mkdir compliance
if not exist "keys" mkdir keys
if not exist "logs" mkdir logs
echo Directories created.
echo.

REM Install dependencies
echo Installing dependencies...
call scripts\install-dependencies.bat
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist "server\.env" (
    echo Creating .env file...
    copy "env.example" "server\.env"
    echo.
    echo IMPORTANT: Please edit server\.env file with your configuration
    echo.
)

REM Set up Windows Firewall rules (optional)
echo Setting up Windows Firewall rules...
netsh advfirewall firewall add rule name="Trading Intercom Backend" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="Trading Intercom Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="Trading Intercom Federation" dir=in action=allow protocol=TCP localport=3002
echo Firewall rules added.
echo.

REM Create desktop shortcut
echo Creating desktop shortcut...
set "desktop=%USERPROFILE%\Desktop"
echo [InternetShortcut] > "%desktop%\Trading Intercom.url"
echo URL=http://localhost:3000 >> "%desktop%\Trading Intercom.url"
echo IconFile=%CD%\client\public\favicon.ico >> "%desktop%\Trading Intercom.url"
echo IconIndex=0 >> "%desktop%\Trading Intercom.url"
echo Desktop shortcut created.
echo.

echo Setup completed successfully!
echo.
echo Next steps:
echo 1. Edit server\.env file with your configuration
echo 2. Start Redis server (if installed)
echo 3. Run start-dev.bat to start the system
echo 4. Open http://localhost:3000 in your browser
echo.
echo Default users:
echo - Admin: username=admin, password=admin123
echo - Trader: username=trader, password=password
echo.
pause
