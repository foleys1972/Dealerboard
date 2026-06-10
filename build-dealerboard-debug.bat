@echo off
REM Build script for TradePulse Dealerboard WPF Client (Debug)
REM This script builds a debug version for development

setlocal enabledelayedexpansion

echo ========================================
echo TradePulse Dealerboard Client Builder (Debug)
echo ========================================
echo.

REM Get the script directory (root folder)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM Configuration
set PROJECT_NAME=TradePulse.Dealerboard.Client
set PROJECT_PATH=TradePulse.Client\%PROJECT_NAME%\%PROJECT_NAME%.csproj
set OUTPUT_DIR=TradePulse.Client\bin\DealerboardDebug
set RUNTIME=win-x64
set CONFIGURATION=Debug

echo Building %PROJECT_NAME% (Debug)...
echo Project: %PROJECT_PATH%
echo Output: %OUTPUT_DIR%
echo Runtime: %RUNTIME%
echo Configuration: %CONFIGURATION%
echo.

REM Clean previous build
echo Cleaning previous build...
if exist "%OUTPUT_DIR%" (
    rmdir /s /q "%OUTPUT_DIR%"
)
echo.

REM Restore NuGet packages
echo Restoring NuGet packages...
dotnet restore "%PROJECT_PATH%"
if errorlevel 1 (
    echo ERROR: Failed to restore packages
    pause
    exit /b 1
)
echo.

REM Build the project
echo Building project...
dotnet build "%PROJECT_PATH%" --configuration %CONFIGURATION% --no-restore
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo.

REM Publish (not self-contained for debug, faster builds)
echo Publishing debug version...
dotnet publish "%PROJECT_PATH%" ^
    --configuration %CONFIGURATION% ^
    --runtime %RUNTIME% ^
    --output "%OUTPUT_DIR%" ^
    --self-contained false ^
    --no-restore

if errorlevel 1 (
    echo ERROR: Publish failed
    pause
    exit /b 1
)
echo.

REM Check if executable was created
set EXE_NAME=TradePulseDealerboard.exe
if exist "%OUTPUT_DIR%\%EXE_NAME%" (
    echo.
    echo ========================================
    echo Build Successful!
    echo ========================================
    echo.
    echo Executable location: %OUTPUT_DIR%\%EXE_NAME%
    echo.
    echo NOTE: This is a debug build. .NET Runtime must be installed.
    echo.
    
    REM Ask if user wants to open the output folder
    set /p OPEN_FOLDER="Open output folder? (Y/N): "
    if /i "!OPEN_FOLDER!"=="Y" (
        explorer "%SCRIPT_DIR%%OUTPUT_DIR%"
    )
) else (
    echo.
    echo ERROR: Executable not found at %OUTPUT_DIR%\%EXE_NAME%
    echo.
    pause
    exit /b 1
)

echo.
echo Build complete!
pause

