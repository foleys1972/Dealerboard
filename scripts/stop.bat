@echo off
setlocal enabledelayedexpansion

REM Set scripts directory
set SCRIPTS_DIR=%~dp0

echo ========================================
echo Stopping Trading Intercom System
echo ========================================
echo.

set STOPPED=0

REM Read PIDs from files if they exist
set BACKEND_PID=
set FRONTEND_PID=

if exist "%SCRIPTS_DIR%.backend_pid.txt" (
    set /p BACKEND_PID=<"%SCRIPTS_DIR%.backend_pid.txt"
)

if exist "%SCRIPTS_DIR%.frontend_pid.txt" (
    set /p FRONTEND_PID=<"%SCRIPTS_DIR%.frontend_pid.txt"
)

REM Check if processes file exists
if not exist "%SCRIPTS_DIR%.processes.txt" (
    echo [INFO] No processes file found. Attempting to stop by process name...
) else (
    echo [INFO] Processes file found. Stopping processes...
    REM Don't display file content to avoid batch parsing issues with special characters
)

REM Stop backend by PID first (if available)
if defined BACKEND_PID (
    echo [INFO] Stopping backend server (PID: !BACKEND_PID!)...
    taskkill /PID !BACKEND_PID! /T /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] Backend stopped
        set /a STOPPED+=1
        goto :backend_done
    )
)

REM Stop backend by window title
echo [INFO] Stopping backend server...
taskkill /FI "WINDOWTITLE eq Trading Intercom Backend*" /T /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Backend stopped
    set /a STOPPED+=1
) else (
    REM Try stopping node processes running server/index.js
    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /C:"node.exe"') do (
        wmic process where "ProcessId=%%~a" get CommandLine 2>nul | findstr /I /C:"server\\index.js" >nul 2>&1
        if !errorlevel! equ 0 (
            taskkill /PID %%~a /F >nul 2>&1
            if !errorlevel! equ 0 (
                echo [OK] Backend stopped (PID: %%~a)
                set /a STOPPED+=1
                goto :backend_done
            )
        )
    )
    echo [WARN] Backend process not found or already stopped
)
:backend_done

REM Stop frontend by PID first (if available)
if defined FRONTEND_PID (
    echo [INFO] Stopping frontend (PID: !FRONTEND_PID!)...
    taskkill /PID !FRONTEND_PID! /T /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] Frontend stopped
        set /a STOPPED+=1
        goto :frontend_done
    )
)

REM Stop frontend by window title
echo [INFO] Stopping frontend...
taskkill /FI "WINDOWTITLE eq Trading Intercom Frontend*" /T /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Frontend stopped
    set /a STOPPED+=1
) else (
    REM Try stopping React development server
    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /C:"node.exe"') do (
        wmic process where "ProcessId=%%~a" get CommandLine 2>nul | findstr /I /C:"react-scripts" >nul 2>&1
        if !errorlevel! equ 0 (
            taskkill /PID %%~a /F >nul 2>&1
            if !errorlevel! equ 0 (
                echo [OK] Frontend stopped (PID: %%~a)
                set /a STOPPED+=1
                goto :frontend_done
            )
        )
    )
    echo [WARN] Frontend process not found or already stopped
)
:frontend_done

REM Also stop any child processes (React dev server spawns children)
echo [INFO] Cleaning up child processes...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /C:"node.exe"') do (
    wmic process where "ProcessId=%%~a" get CommandLine 2>nul | findstr /I /C:"react-scripts" >nul 2>&1
    if !errorlevel! equ 0 (
        taskkill /PID %%~a /F >nul 2>&1
        if !errorlevel! equ 0 (
            echo [OK] Stopped React dev server child process: %%~a
            set /a STOPPED+=1
        )
    )
)

REM Clean up process files
if exist "%SCRIPTS_DIR%.processes.txt" (
    del /q "%SCRIPTS_DIR%.processes.txt" >nul 2>&1
    echo [OK] Cleaned up process files
)

if exist "%SCRIPTS_DIR%.backend_pid.txt" del /q "%SCRIPTS_DIR%.backend_pid.txt" >nul 2>&1
if exist "%SCRIPTS_DIR%.frontend_pid.txt" del /q "%SCRIPTS_DIR%.frontend_pid.txt" >nul 2>&1

echo.
if %STOPPED% gtr 0 (
    echo ========================================
    echo System Stopped Successfully!
    echo ========================================
    echo Stopped %STOPPED% process(es)
) else (
    echo ========================================
    echo No Running Processes Found
    echo ========================================
    echo The system appears to be already stopped.
)
echo.
pause
