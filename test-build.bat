@echo off
echo ========================================
echo Test Script - Finding where it fails
echo ========================================
echo.
echo Step 1: Checking current directory
echo Current directory: %CD%
echo.
pause

echo Step 2: Checking if client directory exists
if exist "client" (
    echo [OK] client directory found
) else (
    echo [ERROR] client directory NOT found
    pause
    exit /b 1
)
echo.
pause

echo Step 3: Changing to client directory
cd client
if errorlevel 1 (
    echo [ERROR] Failed to change directory
    pause
    exit /b 1
)
echo Current directory: %CD%
echo.
pause

echo Step 4: Checking Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)
echo [OK] Node.js found
node --version
echo.
pause

echo Step 5: Checking npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)
echo [OK] npm found
npm --version
echo.
pause

echo Step 6: Checking node_modules
if exist "node_modules" (
    echo [OK] node_modules exists
    echo Listing first few directories in node_modules...
    dir /b node_modules | findstr /n "^" | findstr "^[1-5]:"
) else (
    echo [INFO] node_modules not found - will need to install
    echo.
    echo Would you like to install dependencies now? (Y/N)
    set /p INSTALL_NOW="> "
    if /i "!INSTALL_NOW!"=="Y" (
        echo.
        echo Installing dependencies...
        call npm install
        echo.
        echo Install exit code: %ERRORLEVEL%
    )
)
echo.
echo Press any key to continue to build step...
pause >nul

echo.
echo Step 7: Running npm run build
echo This is where the actual build happens...
echo.
echo WARNING: This may take several minutes!
echo.
echo Press any key to start the build...
pause >nul

echo.
echo Starting build...
echo ========================================
echo.

call npm run build

echo.
echo ========================================
echo Build exit code: %ERRORLEVEL%
echo.

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Build completed successfully!
    echo.
    if exist "build\index.html" (
        echo [OK] index.html found in build directory
    ) else (
        echo [WARNING] index.html NOT found in build directory
    )
) else (
    echo [ERROR] Build failed with exit code %ERRORLEVEL%
    echo.
    echo Please check the error messages above.
)

echo.
echo All steps completed!
echo.
pause

