@echo off
REM Quick build - minimal output, just runs the build

cd /d "%~dp0client"
if errorlevel 1 (
    echo ERROR: Could not change to client directory
    pause
    exit /b 1
)

echo Building React client...
echo.

npm run build

if errorlevel 1 (
    echo.
    echo Build failed with exit code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
if exist "build\index.html" (
    echo Build successful! index.html created.
) else (
    echo Build completed but index.html not found!
)

pause

