@echo off
REM Build script for TradePulse Dealerboard WPF Client
REM This script builds a self-contained executable for Windows

setlocal enabledelayedexpansion

echo ========================================
echo TradePulse Dealerboard Client Builder
echo ========================================
echo.

REM Get the script directory (root folder)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM Configuration
set PROJECT_NAME=TradePulse.Dealerboard.Client
set PROJECT_PATH=TradePulse.Client\%PROJECT_NAME%\%PROJECT_NAME%.csproj
set OUTPUT_DIR=TradePulse.Client\bin\DealerboardRelease
set RUNTIME=win-x64
set CONFIGURATION=Release

echo Building %PROJECT_NAME%...
echo Project: %PROJECT_PATH%
echo Output: %OUTPUT_DIR%
echo Runtime: %RUNTIME%
echo Configuration: %CONFIGURATION%
echo.

REM Clean previous build
echo Cleaning previous build...
set EXE_NAME=TradePulseDealerboard.exe
set EXE_PATH=%OUTPUT_DIR%\%EXE_NAME%

REM Check if exe is running and try to close it
echo Checking if %EXE_NAME% is running...
tasklist /FI "IMAGENAME eq %EXE_NAME%" 2>NUL | find /I /N "%EXE_NAME%">NUL
if not errorlevel 1 (
    echo %EXE_NAME% is currently running. Attempting to close it...
    taskkill /F /IM %EXE_NAME% 2>&1
    if errorlevel 1 (
        echo.
        echo ========================================
        echo WARNING: Could not automatically close %EXE_NAME%
        echo ========================================
        echo.
        echo Please manually close the application:
        echo 1. Close any TradePulseDealerboard windows
        echo 2. Or use Task Manager to end the process
        echo 3. Then run this script again
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
    echo Waiting for process to terminate...
    timeout /t 3 /nobreak >NUL
    
    REM Verify it's closed
    tasklist /FI "IMAGENAME eq %EXE_NAME%" 2>NUL | find /I /N "%EXE_NAME%">NUL
    if not errorlevel 1 (
        echo.
        echo ========================================
        echo ERROR: %EXE_NAME% is still running
        echo ========================================
        echo.
        echo Please manually close the application and try again.
        echo.
        pause
        exit /b 1
    )
    echo Process closed successfully.
)

REM Now try to delete the output directory
if exist "%OUTPUT_DIR%" (
    echo Removing old build files...
    rmdir /s /q "%OUTPUT_DIR%" 2>NUL
    if exist "%OUTPUT_DIR%" (
        echo WARNING: Could not fully remove %OUTPUT_DIR%
        echo Some files may be locked. Trying again after a short delay...
        timeout /t 2 /nobreak >NUL
        rmdir /s /q "%OUTPUT_DIR%" 2>NUL
        if exist "%OUTPUT_DIR%" (
            echo ERROR: Cannot remove %OUTPUT_DIR%. Please close any applications using files in this folder.
            pause
            exit /b 1
        )
    )
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

REM Publish as self-contained executable
echo Publishing self-contained executable...
dotnet publish "%PROJECT_PATH%" ^
    --configuration %CONFIGURATION% ^
    --runtime %RUNTIME% ^
    --output "%OUTPUT_DIR%" ^
    --self-contained true ^
    --no-restore ^
    /p:PublishSingleFile=true ^
    /p:IncludeNativeLibrariesForSelfExtract=true ^
    /p:EnableCompressionInSingleFile=true

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
    
    REM Get file size
    for %%A in ("%OUTPUT_DIR%\%EXE_NAME%") do (
        set SIZE=%%~zA
        set /a SIZE_MB=!SIZE!/1048576
        echo File size: !SIZE_MB! MB
    )
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

