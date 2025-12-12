@echo off
echo Starting Trading Intercom System in Development Mode...
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
    echo Warning: Redis is not running
    echo Please start Redis server before running the application
    echo You can download Redis from https://redis.io/download
    echo.
    echo Starting without Redis (some features may not work)...
    echo.
)

REM Create .env file if it doesn't exist
if not exist "server\.env" (
    echo Creating .env file from template...
    copy "env.example" "server\.env"
    echo Please edit server\.env file with your configuration
    echo.
)

REM Start backend server
echo Starting backend server...
cd server
start "Trading Intercom Backend" cmd /k "npm run dev"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo Starting frontend...
cd ..\client
start "Trading Intercom Frontend" cmd /k "npm start"

echo.
echo Trading Intercom System is starting...
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo Federation: ws://localhost:3002
echo.
echo Press any key to exit...
pause >nul
