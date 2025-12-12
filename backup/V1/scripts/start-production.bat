@echo off
echo Starting Trading Intercom System in Production Mode...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Redis is running
redis-cli ping >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Redis is not running
    echo Please start Redis server before running the application
    echo You can download Redis from https://redis.io/download
    pause
    exit /b 1
)

REM Build frontend
echo Building frontend...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo Error: Failed to build frontend
    pause
    exit /b 1
)

REM Start backend server
echo Starting backend server...
cd ..\server
start "Trading Intercom Backend" cmd /k "npm start"

echo.
echo Trading Intercom System is starting in production mode...
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo Federation: ws://localhost:3002
echo.
echo Press any key to exit...
pause >nul
