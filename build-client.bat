@echo off
REM Build script for TradePulse React Client
REM This script builds the React client for production

REM Keep window open on errors
if not "%1"=="noerror" (
    cmd /c "%~f0" noerror %* 2>&1 | more
    if errorlevel 1 (
        echo.
        echo Script exited with error code: %ERRORLEVEL%
        pause
    )
    exit /b %ERRORLEVEL%
)

setlocal enabledelayedexpansion

REM Prevent exit on error
set "EXIT_CODE=0"

echo ========================================
echo TradePulse React Client Builder
echo ========================================
echo.

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
echo [DEBUG] Script directory: %SCRIPT_DIR%

REM Change to script directory
cd /d "%SCRIPT_DIR%" 2>nul
if errorlevel 1 (
    echo [ERROR] Failed to change to script directory: %SCRIPT_DIR%
    echo Current directory: %CD%
    echo.
    set "EXIT_CODE=1"
    goto :end
)

echo [DEBUG] Current directory: %CD%
echo.

REM Check if client directory exists
if not exist "client" (
    echo [ERROR] client directory not found!
    echo Current directory: %CD%
    echo.
    echo Expected structure:
    echo   C:\Projects\intercom\
    echo   C:\Projects\intercom\build-client.bat
    echo   C:\Projects\intercom\client\
    echo.
    set "EXIT_CODE=1"
    goto :end
)

echo [OK] Found client directory
echo.

REM Change to client directory
cd /d "%SCRIPT_DIR%client" 2>nul
if errorlevel 1 (
    echo [ERROR] Failed to change to client directory
    set "EXIT_CODE=1"
    goto :end
)

echo [DEBUG] Changed to: %CD%
echo.

REM Check Node.js
echo [1/5] Checking Node.js installation...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    set "EXIT_CODE=1"
    goto :end
)

for /f "delims=" %%V in ('node --version 2^>nul') do set "NODE_VERSION=%%V"
if errorlevel 1 (
    echo [ERROR] Failed to get Node.js version
    set "EXIT_CODE=1"
    goto :end
)
echo [OK] Node.js found: %NODE_VERSION%
echo.

REM Check npm
echo [2/5] Checking npm installation...
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed or not in PATH
    echo.
    set "EXIT_CODE=1"
    goto :end
)

for /f "delims=" %%V in ('npm --version 2^>nul') do set "NPM_VERSION=%%V"
if errorlevel 1 (
    echo [ERROR] Failed to get npm version
    set "EXIT_CODE=1"
    goto :end
)
echo [OK] npm found: %NPM_VERSION%
echo.

REM Check/Install dependencies
echo [3/5] Checking dependencies...
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    echo This may take several minutes...
    echo.
    
    call npm install
    set "INSTALL_EXIT=%ERRORLEVEL%"
    if !INSTALL_EXIT! neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies (exit code: !INSTALL_EXIT!)
        echo Please check the error messages above.
        echo.
        set "EXIT_CODE=1"
        goto :end
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
) else (
    echo [OK] Dependencies found (node_modules exists)
    echo.
)

REM Clean previous build
echo [4/5] Cleaning previous build...
if exist "build" (
    echo [INFO] Removing existing build directory...
    rmdir /s /q "build" 2>nul
    if exist "build" (
        echo [WARN] Failed to completely remove build directory
        echo Continuing anyway...
    ) else (
        echo [OK] Previous build cleaned
    )
) else (
    echo [OK] No previous build found
)
echo.

REM Build the React app
echo [5/5] Building React application...
echo This may take a few minutes...
echo.
echo Starting build process...
echo.

call npm run build
set "BUILD_EXIT=%ERRORLEVEL%"

if !BUILD_EXIT! neq 0 (
    echo.
    echo ========================================
    echo [ERROR] Build failed with exit code !BUILD_EXIT!
    echo ========================================
    echo.
    echo Please check the error messages above.
    echo Common issues:
    echo   - Missing dependencies: Run "npm install" manually
    echo   - Syntax errors in React code
    echo   - Out of memory: Close other applications
    echo.
    set "EXIT_CODE=!BUILD_EXIT!"
    goto :end
)

echo.
echo ========================================
echo [OK] Build process completed!
echo ========================================
echo.

REM Verify build
if not exist "build" (
    echo [ERROR] Build directory was not created!
    echo The build process may have failed silently.
    echo.
    set "EXIT_CODE=1"
    goto :end
)

echo [OK] Build directory created: %CD%\build
echo.

if not exist "build\index.html" (
    echo [ERROR] index.html not found in build directory!
    echo.
    echo Listing files in build directory:
    if exist "build" (
        dir /b build 2>nul
    )
    echo.
    set "EXIT_CODE=1"
    goto :end
)

echo [OK] index.html created successfully
echo.

REM Check for static directory
if exist "build\static" (
    echo [OK] static/ directory exists
) else (
    echo [WARN] static/ directory not found
)
echo.

REM Get build size
echo Calculating build size...
for /f "tokens=3" %%A in ('dir /s /-c build 2^>nul ^| find "File(s)"') do set "BUILD_SIZE=%%A"
if defined BUILD_SIZE (
    echo Build size: %BUILD_SIZE% bytes
) else (
    echo Build size: Unable to calculate
)
echo.

echo ========================================
echo [SUCCESS] Build complete!
echo ========================================
echo.
echo Build output: %CD%\build
echo.
echo You can now start the server.
echo.

REM Ask if user wants to open the build folder
set /p "OPEN_FOLDER=Open build folder? (Y/N): "
if /i "!OPEN_FOLDER!"=="Y" (
    start explorer "%CD%\build"
)

:end
echo.
echo Script finished with exit code: %EXIT_CODE%
echo.
pause
endlocal
exit /b %EXIT_CODE%
