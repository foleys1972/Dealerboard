@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Starting Trading Intercom System
echo ========================================
echo.

REM Set project root and scripts directory
set PROJECT_ROOT=%~dp0..
set SCRIPTS_DIR=%~dp0

REM Check if already running
if exist "%SCRIPTS_DIR%.processes.txt" (
    echo Warning: Processes file exists. System may already be running.
    echo Use stop.bat to stop existing processes first.
    echo.
    choice /C YN /M "Continue anyway"
    if errorlevel 2 exit /b 1
    del /q "%SCRIPTS_DIR%.processes.txt" 2>nul
    del /q "%SCRIPTS_DIR%.backend_pid.txt" 2>nul
    del /q "%SCRIPTS_DIR%.frontend_pid.txt" 2>nul
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Redis is running (optional)
redis-cli ping >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Redis is not running (optional but recommended)
    echo Some features may not work without Redis
    echo.
)

REM Create .env file if it doesn't exist
if not exist "%PROJECT_ROOT%\server\.env" (
    echo [INFO] Creating .env file from template...
    if exist "%PROJECT_ROOT%\server\env.example" (
        copy "%PROJECT_ROOT%\server\env.example" "%PROJECT_ROOT%\server\.env" >nul
        echo Please edit server\.env file with your configuration
    )
    echo.
)

REM Create processes file
echo. > "%SCRIPTS_DIR%.processes.txt"

REM Create logs directory if it doesn't exist
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"

REM Start backend server
echo [INFO] Starting backend server...
cd /d "%PROJECT_ROOT%\server"

REM Use PowerShell to start process and get PID
powershell -Command "$proc = Start-Process -FilePath 'node' -ArgumentList 'index.js' -WindowStyle Minimized -RedirectStandardOutput '%PROJECT_ROOT%\logs\server.log' -RedirectStandardError '%PROJECT_ROOT%\logs\server-error.log' -PassThru; $proc.Id | Out-File -FilePath '%SCRIPTS_DIR%.backend_pid.txt' -Encoding ASCII -NoNewline"

REM Wait a moment for PID file to be created
timeout /t 2 /nobreak >nul

REM Read backend PID
if exist "%SCRIPTS_DIR%.backend_pid.txt" (
    set /p BACKEND_PID=<"%SCRIPTS_DIR%.backend_pid.txt"
    echo [OK] Backend started (PID: !BACKEND_PID!)
) else (
    echo [WARN] Could not capture backend PID
    set BACKEND_PID=
)

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo [INFO] Starting frontend...
cd /d "%PROJECT_ROOT%\client"

REM Use PowerShell to start React dev server and get PID
powershell -Command "$proc = Start-Process -FilePath 'npm' -ArgumentList 'start' -WindowStyle Minimized -RedirectStandardOutput '%PROJECT_ROOT%\logs\client.log' -RedirectStandardError '%PROJECT_ROOT%\logs\client-error.log' -PassThru; $proc.Id | Out-File -FilePath '%SCRIPTS_DIR%.frontend_pid.txt' -Encoding ASCII -NoNewline"

REM Wait a moment for PID file to be created
timeout /t 2 /nobreak >nul

REM Read frontend PID (note: npm start spawns child processes, so we track the parent)
if exist "%SCRIPTS_DIR%.frontend_pid.txt" (
    set /p FRONTEND_PID=<"%SCRIPTS_DIR%.frontend_pid.txt"
    echo [OK] Frontend started (PID: !FRONTEND_PID!)
) else (
    echo [WARN] Could not capture frontend PID
    set FRONTEND_PID=
)

REM Save process info (simple format without special characters that cause batch parsing issues)
echo Backend window: Trading Intercom Backend > "%SCRIPTS_DIR%.processes.txt"
echo Frontend window: Trading Intercom Frontend >> "%SCRIPTS_DIR%.processes.txt"
if defined BACKEND_PID echo Backend PID: !BACKEND_PID! >> "%SCRIPTS_DIR%.processes.txt"
if defined FRONTEND_PID echo Frontend PID: !FRONTEND_PID! >> "%SCRIPTS_DIR%.processes.txt"
REM Store timestamp as numeric format (YYYYMMDDHHMMSS) to avoid parsing issues
powershell -Command "[datetime]::Now.ToString('yyyyMMddHHmmss')" > "%SCRIPTS_DIR%.timestamp.tmp"
set /p TIMESTAMP=<"%SCRIPTS_DIR%.timestamp.tmp"
del "%SCRIPTS_DIR%.timestamp.tmp" >nul 2>&1
echo Started at: !TIMESTAMP! >> "%SCRIPTS_DIR%.processes.txt"

echo.
echo ========================================
echo System Started Successfully!
echo ========================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Logs:
echo   - Server: logs\server.log
echo   - Server Errors: logs\server-error.log
echo   - Client: logs\client.log
echo   - Client Errors: logs\client-error.log
echo.
echo To stop the system, run: scripts\stop.bat
echo.
echo Processes are running in minimized windows.
echo Check Task Manager or use stop.bat to stop them.
echo.
pause
