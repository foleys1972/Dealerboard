@echo off
echo Installing Trading Intercom System Dependencies...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Install backend dependencies
echo Installing backend dependencies...
cd server
npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install backend dependencies
    pause
    exit /b 1
)

REM Install frontend dependencies
echo Installing frontend dependencies...
cd ..\client
npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install frontend dependencies
    pause
    exit /b 1
)

echo.
echo Dependencies installed successfully!
echo.
echo Next steps:
echo 1. Configure your .env file in the server directory
echo 2. Start Redis server (if using Redis)
echo 3. Run start-dev.bat to start the system
echo.
pause
