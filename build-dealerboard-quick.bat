@echo off
REM Quick build script for TradePulse Dealerboard WPF Client
REM Builds without publishing (faster, for development)

setlocal enabledelayedexpansion

echo ========================================
echo TradePulse Dealerboard Client Quick Build
echo ========================================
echo.

REM Get the script directory (root folder)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM Configuration
set PROJECT_NAME=TradePulse.Dealerboard.Client
set PROJECT_PATH=TradePulse.Client\%PROJECT_NAME%\%PROJECT_NAME%.csproj
set CONFIGURATION=Release

echo Building %PROJECT_NAME%...
echo Project: %PROJECT_PATH%
echo Configuration: %CONFIGURATION%
echo.

REM Build the project (no publish, faster)
echo Building project...
dotnet build "%PROJECT_PATH%" --configuration %CONFIGURATION%

if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build Successful!
echo ========================================
echo.
echo Output location: TradePulse.Client\%PROJECT_NAME%\bin\%CONFIGURATION%\net8.0-windows\
echo.
echo NOTE: This is a quick build. Use build-dealerboard.bat for a self-contained executable.
echo.

pause

