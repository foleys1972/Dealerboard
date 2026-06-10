@echo off
setlocal enabledelayedexpansion

REM ========================================
REM UC Sentinel Builder (Windows)
REM Produces: uc-sentinel\dist\uc-sentinel.exe
REM ========================================

cd /d "%~dp0"

echo ========================================
echo UC Sentinel EXE Builder
echo ========================================

if not exist "uc-sentinel\package.json" (
  echo ERROR: uc-sentinel\package.json not found. Are you in the intercom repo root?
  exit /b 1
)

echo Installing dependencies...
pushd "uc-sentinel"
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo ERROR: npm install failed
  popd
  exit /b 1
)

echo Building uc-sentinel.exe...
call npm run build:exe
if errorlevel 1 (
  echo ERROR: build:exe failed
  popd
  exit /b 1
)
popd

echo.
echo DONE.
echo Output:
echo   uc-sentinel\dist\uc-sentinel.exe
echo   uc-sentinel\dist\uc-sentinel.env.example
echo.
echo Next:
echo - Copy the dist folder to the target server
echo - Create a .env file (copy uc-sentinel.env.example)
echo - Apply uc-sentinel\schema.sql to Postgres
echo - Run uc-sentinel.exe

exit /b 0


