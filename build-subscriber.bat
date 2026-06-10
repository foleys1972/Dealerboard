@echo off
setlocal enabledelayedexpansion

if not defined TI_DEBUG set "TI_DEBUG=1"
if /i "%TI_DEBUG%"=="1" echo on

REM Build a deployable subscriber bundle for Windows.
REM Output: dist\subscriber\ (portable folder)

echo.
echo ============================================
echo  Trading Intercom - Build Subscriber Bundle
echo ============================================
echo.

set "ROOT=%~dp0"
set "DIST=%ROOT%dist\subscriber"
set "TOOLNODE=%ROOT%tools\node20"
set "OFFLINE=%ROOT%tools\offline"

echo ROOT=%ROOT%
echo DIST=%DIST%
echo.

REM Prefer portable offline Node 20 if present
set "NODEEXE="
set "NPMCMD="
set "NPXCMD="
if exist "%TOOLNODE%\node.exe" (
  set "NODEEXE=%TOOLNODE%\node.exe"
  set "NPMCMD=%TOOLNODE%\npm.cmd"
  set "NPXCMD=%TOOLNODE%\npx.cmd"
)

REM Fallback to system Node (online/dev machines)
if not defined NODEEXE (
  for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODEEXE set "NODEEXE=%%I"
)
if not defined NPMCMD (
  for /f "delims=" %%I in ('where npm 2^>nul') do if not defined NPMCMD set "NPMCMD=%%I"
)
if not defined NPXCMD (
  for /f "delims=" %%I in ('where npx 2^>nul') do if not defined NPXCMD set "NPXCMD=%%I"
)

REM Check Node.js
if not defined NODEEXE (
  echo Error: Node.js not found.
  echo For offline builds: place portable Node 20 under: %TOOLNODE%\
  echo Expected files: node.exe, npm.cmd, npx.cmd
  exit /b 1
)
for /f "delims=" %%V in ('"%NODEEXE%" --version 2^>nul') do set "NODEVER=%%V"
if errorlevel 1 (
  echo Error: Failed to run Node at: %NODEEXE%
  exit /b 1
)
echo Node: %NODEVER%

REM Check npm
if not defined NPMCMD (
  echo Error: npm is not available.
  exit /b 1
)
for /f "delims=" %%V in ('"%NPMCMD%" --version 2^>nul') do set "NPMVER=%%V"
if errorlevel 1 (
  echo Error: Failed to run npm at: %NPMCMD%
  exit /b 1
)
echo npm: %NPMVER%
echo.

if exist "%DIST%" echo Removing existing dist folder: %DIST%
if exist "%DIST%" rmdir /s /q "%DIST%"

mkdir "%DIST%" >nul 2>&1
if errorlevel 1 (
  echo Error: Failed to create dist folder.
  echo Check permissions and whether another process is locking: %DIST%
  exit /b 1
)

REM Offline: ensure node_modules exists (optional vendor zip)
if not exist "%ROOT%node_modules\pkg" (
  if exist "%OFFLINE%\node_modules.zip" (
    echo Extracting offline node_modules from: %OFFLINE%\node_modules.zip
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\ensure-node_modules.ps1" -RepoRoot "%ROOT%"
    if errorlevel 1 (
      echo Error: Failed extracting node_modules from offline zip.
      exit /b 1
    )
  )
)

REM Ensure pkg is available locally (no npx downloads on offline build servers)
if not exist "%ROOT%node_modules\.bin\pkg.cmd" (
  echo.
  echo ============================================
  echo  Offline prerequisites missing
  echo ============================================
  echo.
  echo This build server cannot download npm packages.
  echo To build subscriber.exe you must provide pre-installed npm dependencies.
  echo.
  echo Do this once on a CONNECTED machine ^(Node 20 LTS recommended^):
  echo   1^) cd %ROOT%
  echo   2^) npm install
  echo   3^) verify: node_modules\.bin\pkg.cmd exists
  echo   4^) zip the entire node_modules folder to:
  echo      %OFFLINE%\node_modules.zip
  echo.
  echo Then copy %OFFLINE%\node_modules.zip to this build server and re-run build-subscriber.bat.
  echo.
  exit /b 1
)

echo Building subscriber.exe (embedded Node runtime)...
if not exist "%ROOT%subscriber-bootstrap.js" (
  echo Error: Missing subscriber-bootstrap.js at repo root.
  echo This file is required to build subscriber.exe.
  exit /b 1
)
call "%ROOT%node_modules\.bin\pkg.cmd" "%ROOT%subscriber-bootstrap.js" --targets node18-win-x64 --output "%DIST%\subscriber.exe"
if errorlevel 1 (
  echo Error: Failed building subscriber.exe using pkg.
  echo Ensure node_modules are present ^(offline zip^) or run npm install on a connected machine and re-zip node_modules.
  exit /b 1
)

echo Copying server sources...
mkdir "%DIST%\server" >nul 2>&1
xcopy "%ROOT%server\*" "%DIST%\server\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo Error: Failed copying server folder.
  exit /b 1
)

echo Copying root package.json...
copy /Y "%ROOT%package.json" "%DIST%\package.json" >nul

REM One-button installer (PowerShell)
if exist "%ROOT%subscriber-installer\install-subscriber.ps1" (
  echo Copying install-subscriber.ps1...
  copy /Y "%ROOT%subscriber-installer\install-subscriber.ps1" "%DIST%\install-subscriber.ps1" >nul
  > "%DIST%\install-subscriber.cmd" echo @echo off
  >> "%DIST%\install-subscriber.cmd" echo powershell -NoProfile -ExecutionPolicy Bypass -File "%%%%~dp0install-subscriber.ps1"
)

REM Always generate an installer script so target machines have a consistent setup entrypoint.
REM If node_modules exists, include it (offline deploy). Otherwise, target will run install-deps.cmd.
if exist "%ROOT%node_modules" goto :has_node_modules
goto :no_node_modules

:has_node_modules
echo Copying root node_modules - this may take a while...
xcopy "%ROOT%node_modules\*" "%DIST%\node_modules\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo Error: Failed copying node_modules.
  exit /b 1
)

echo Creating install-deps.cmd for the target machine.
> "%DIST%\install-deps.cmd" echo @echo off
>> "%DIST%\install-deps.cmd" echo setlocal
>> "%DIST%\install-deps.cmd" echo echo Installing server dependencies...
>> "%DIST%\install-deps.cmd" echo if exist "package-lock.json" ^(
>> "%DIST%\install-deps.cmd" echo   npm ci --omit=dev
>> "%DIST%\install-deps.cmd" echo ^) else ^(
>> "%DIST%\install-deps.cmd" echo   npm install --production
>> "%DIST%\install-deps.cmd" echo ^)
>> "%DIST%\install-deps.cmd" echo if errorlevel 1 ^(
>> "%DIST%\install-deps.cmd" echo   echo Failed to install dependencies.
>> "%DIST%\install-deps.cmd" echo   exit /b 1
>> "%DIST%\install-deps.cmd" echo ^)
>> "%DIST%\install-deps.cmd" echo echo Done.
goto :after_node_modules

:no_node_modules
echo NOTE: node_modules not found at repo root.
echo Creating install-deps.cmd for the target machine.
> "%DIST%\install-deps.cmd" echo @echo off
>> "%DIST%\install-deps.cmd" echo setlocal
>> "%DIST%\install-deps.cmd" echo echo Installing server dependencies...
>> "%DIST%\install-deps.cmd" echo if exist "package-lock.json" ^(
>> "%DIST%\install-deps.cmd" echo   npm ci --omit=dev
>> "%DIST%\install-deps.cmd" echo ^) else ^(
>> "%DIST%\install-deps.cmd" echo   npm install --production
>> "%DIST%\install-deps.cmd" echo ^)
>> "%DIST%\install-deps.cmd" echo if errorlevel 1 ^(
>> "%DIST%\install-deps.cmd" echo   echo Failed to install dependencies.
>> "%DIST%\install-deps.cmd" echo   exit /b 1
>> "%DIST%\install-deps.cmd" echo ^)
>> "%DIST%\install-deps.cmd" echo echo Done.

:after_node_modules

REM Create a subscriber config template (server.env)
> "%DIST%\server.env.example" echo # Subscriber instance configuration
>> "%DIST%\server.env.example" echo # IMPORTANT: set PUBLISHER_URL to the publisher server using HTTPS or HTTP
>> "%DIST%\server.env.example" echo SERVER_ROLE=subscriber
>> "%DIST%\server.env.example" echo ENABLE_PUBLISHER=false
>> "%DIST%\server.env.example" echo ENABLE_SUBSCRIBER=true
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Unique ID per subscriber - change this
>> "%DIST%\server.env.example" echo SERVER_ID=subscriber-01
>> "%DIST%\server.env.example" echo SERVER_NAME=Subscriber 01
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Publisher connection
>> "%DIST%\server.env.example" echo PUBLISHER_URL=https://192.168.1.41:5000
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Port this subscriber listens on
>> "%DIST%\server.env.example" echo # Recommended range for subscriber instances: 5100-5500
>> "%DIST%\server.env.example" echo PORT=5101
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Networking
>> "%DIST%\server.env.example" echo LISTEN_IP=0.0.0.0
>> "%DIST%\server.env.example" echo ANNOUNCED_IP=127.0.0.1
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # SSL cert/key optional
>> "%DIST%\server.env.example" echo #SSL_CERT_FILE=dev-cert.pem
>> "%DIST%\server.env.example" echo #SSL_KEY_FILE=dev-key.pem
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Main database Postgres - REQUIRED for standalone mode
>> "%DIST%\server.env.example" echo # Use ONE option: DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
>> "%DIST%\server.env.example" echo #DATABASE_URL=postgresql://user:password@192.168.1.41:5432/intercom
>> "%DIST%\server.env.example" echo #PGHOST=192.168.1.41
>> "%DIST%\server.env.example" echo #PGPORT=5432
>> "%DIST%\server.env.example" echo #PGUSER=intercom
>> "%DIST%\server.env.example" echo #PGPASSWORD=change_me
>> "%DIST%\server.env.example" echo #PGDATABASE=intercom
>> "%DIST%\server.env.example" echo.
>> "%DIST%\server.env.example" echo # Redis connection must be reachable
>> "%DIST%\server.env.example" echo #REDIS_URL=redis://127.0.0.1:6379

REM Copy default TLS cert/key into bundle (so HTTPS can work out of the box)
if exist "%ROOT%dev-cert.pem" (
  echo Copying dev-cert.pem...
  copy /Y "%ROOT%dev-cert.pem" "%DIST%\dev-cert.pem" >nul
)
if exist "%ROOT%dev-key.pem" (
  echo Copying dev-key.pem...
  copy /Y "%ROOT%dev-key.pem" "%DIST%\dev-key.pem" >nul
)

REM Copy NSSM into bundle if available locally
if exist "%ROOT%nssm-2.24\win64\nssm.exe" (
  echo Copying NSSM win64 into bundle...
  copy /Y "%ROOT%nssm-2.24\win64\nssm.exe" "%DIST%\nssm.exe" >nul
) else if exist "%ROOT%nssm-2.24\win32\nssm.exe" (
  echo Copying NSSM win32 into bundle...
  copy /Y "%ROOT%nssm-2.24\win32\nssm.exe" "%DIST%\nssm.exe" >nul
)

REM Include React build if present so the web portal can be served directly from this subscriber
if exist "%ROOT%client\build" goto :has_client_build
goto :no_client_build

:has_client_build
echo Copying client\build - web portal...
mkdir "%DIST%\client" >nul 2>&1
xcopy "%ROOT%client\build\*" "%DIST%\client\build\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo Error: Failed copying client\build.
  exit /b 1
)
goto :after_client_build

:no_client_build
echo NOTE: client\build not found. Web portal will return 503 until built.
> "%DIST%\build-web-portal.cmd" echo @echo off
>> "%DIST%\build-web-portal.cmd" echo setlocal
>> "%DIST%\build-web-portal.cmd" echo echo Building web portal...
>> "%DIST%\build-web-portal.cmd" echo pushd "%%%%~dp0..\\..\\client" ^>nul
>> "%DIST%\build-web-portal.cmd" echo call npm install
>> "%DIST%\build-web-portal.cmd" echo if %%%%errorlevel%%%% neq 0 ^(
>> "%DIST%\build-web-portal.cmd" echo   echo Failed: npm install
>> "%DIST%\build-web-portal.cmd" echo   popd ^>nul
>> "%DIST%\build-web-portal.cmd" echo   exit /b 1
>> "%DIST%\build-web-portal.cmd" echo ^)
>> "%DIST%\build-web-portal.cmd" echo call npm run build
>> "%DIST%\build-web-portal.cmd" echo if %%%%errorlevel%%%% neq 0 ^(
>> "%DIST%\build-web-portal.cmd" echo   echo Failed: npm run build
>> "%DIST%\build-web-portal.cmd" echo   popd ^>nul
>> "%DIST%\build-web-portal.cmd" echo   exit /b 1
>> "%DIST%\build-web-portal.cmd" echo ^)
>> "%DIST%\build-web-portal.cmd" echo popd ^>nul
>> "%DIST%\build-web-portal.cmd" echo echo Done. Re-run build-subscriber.bat to include the web portal.

:after_client_build

REM Create start scripts
> "%DIST%\start-subscriber.cmd" echo @echo off
>> "%DIST%\start-subscriber.cmd" echo setlocal
>> "%DIST%\start-subscriber.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\start-subscriber.cmd" echo echo Starting subscriber...
>> "%DIST%\start-subscriber.cmd" echo if not exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\start-subscriber.cmd" echo   echo Missing server.env. Copy server.env.example to server.env and edit it.
>> "%DIST%\start-subscriber.cmd" echo   exit /b 1
>> "%DIST%\start-subscriber.cmd" echo ^)
>> "%DIST%\start-subscriber.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\start-subscriber.cmd" echo "%%%%ROOT%%%%subscriber.exe"

REM Windows Service scripts (NSSM-based)
> "%DIST%\install-service.cmd" echo @echo off
>> "%DIST%\install-service.cmd" echo setlocal enabledelayedexpansion
>> "%DIST%\install-service.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\install-service.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo REM Require admin
>> "%DIST%\install-service.cmd" echo net session ^>nul 2^>^&1
>> "%DIST%\install-service.cmd" echo if %%%%errorlevel%%%% neq 0 ^(
>> "%DIST%\install-service.cmd" echo   echo Please run this as Administrator.
>> "%DIST%\install-service.cmd" echo   exit /b 1
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo if not exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\install-service.cmd" echo   echo Missing server.env. Run edit-config.cmd first.
>> "%DIST%\install-service.cmd" echo   exit /b 1
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo if not exist "%%%%ROOT%%%%subscriber.exe" ^(
>> "%DIST%\install-service.cmd" echo   echo Missing subscriber.exe. Re-run build-subscriber.bat.
>> "%DIST%\install-service.cmd" echo   exit /b 1
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo if not exist "%%%%ROOT%%%%logs" mkdir "%%%%ROOT%%%%logs" ^>nul 2^>^&1
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo REM Locate NSSM
>> "%DIST%\install-service.cmd" echo set NSSM=
>> "%DIST%\install-service.cmd" echo if exist "%%%%ROOT%%%%nssm.exe" set NSSM=%%%%ROOT%%%%nssm.exe
>> "%DIST%\install-service.cmd" echo if not defined NSSM ^(
>> "%DIST%\install-service.cmd" echo   echo Missing nssm.exe in the bundle root.
>> "%DIST%\install-service.cmd" echo   echo Download NSSM and place nssm.exe next to this script.
>> "%DIST%\install-service.cmd" echo   exit /b 1
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo REM Determine service name from SERVER_ID in server.env
>> "%DIST%\install-service.cmd" echo set SERVER_ID=
>> "%DIST%\install-service.cmd" echo for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\install-service.cmd" echo   if /i "%%%%A"=="SERVER_ID" set SERVER_ID=%%%%B
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo if not defined SERVER_ID set SERVER_ID=subscriber
>> "%DIST%\install-service.cmd" echo set SERVICE_NAME=TradingIntercomSubscriber-!SERVER_ID!
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo echo Installing service: !SERVICE_NAME!
>> "%DIST%\install-service.cmd" echo "!NSSM!" install "!SERVICE_NAME!" "%%%%ROOT%%%%subscriber.exe"
>> "%DIST%\install-service.cmd" echo if %%%%errorlevel%%%% neq 0 exit /b 1
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppDirectory "%%%%ROOT%%%%"
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppStdout "%%%%ROOT%%%%logs\service-stdout.log"
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppStderr "%%%%ROOT%%%%logs\service-stderr.log"
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppRotateFiles 1
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppRotateOnline 1
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" AppRotateSeconds 86400
>> "%DIST%\install-service.cmd" echo "!NSSM!" set "!SERVICE_NAME!" Start SERVICE_AUTO_START
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo REM Best-effort firewall rule for configured PORT
>> "%DIST%\install-service.cmd" echo set PORT=
>> "%DIST%\install-service.cmd" echo for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\install-service.cmd" echo   if /i "%%%%A"=="PORT" set PORT=%%%%B
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo if defined PORT ^(
>> "%DIST%\install-service.cmd" echo   for /f "tokens=*" %%%%P in ^("!PORT!"^) do set PORT=%%%%P
>> "%DIST%\install-service.cmd" echo   echo Adding firewall rule for TCP !PORT! (web portal/API)...
>> "%DIST%\install-service.cmd" echo   netsh advfirewall firewall add rule name="!SERVICE_NAME! - TCP !PORT!" dir=in action=allow protocol=TCP localport=!PORT! ^>nul 2^>^&1
>> "%DIST%\install-service.cmd" echo ^) else ^(
>> "%DIST%\install-service.cmd" echo   echo PORT not found in server.env; skipping firewall rule.
>> "%DIST%\install-service.cmd" echo ^)
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo echo Starting service...
>> "%DIST%\install-service.cmd" echo "!NSSM!" start "!SERVICE_NAME!"
>> "%DIST%\install-service.cmd" echo.
>> "%DIST%\install-service.cmd" echo echo Done.
>> "%DIST%\install-service.cmd" echo echo Web portal should be reachable at: http(s)://^<server-ip^>:^<PORT^>/
>> "%DIST%\install-service.cmd" echo endlocal

> "%DIST%\uninstall-service.cmd" echo @echo off
>> "%DIST%\uninstall-service.cmd" echo setlocal enabledelayedexpansion
>> "%DIST%\uninstall-service.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\uninstall-service.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\uninstall-service.cmd" echo.
>> "%DIST%\uninstall-service.cmd" echo net session ^>nul 2^>^&1
>> "%DIST%\uninstall-service.cmd" echo if %%%%errorlevel%%%% neq 0 ^(
>> "%DIST%\uninstall-service.cmd" echo   echo Please run this as Administrator.
>> "%DIST%\uninstall-service.cmd" echo   exit /b 1
>> "%DIST%\uninstall-service.cmd" echo ^)
>> "%DIST%\uninstall-service.cmd" echo.
>> "%DIST%\uninstall-service.cmd" echo set NSSM=
>> "%DIST%\uninstall-service.cmd" echo if exist "%%%%ROOT%%%%nssm.exe" set NSSM=%%%%ROOT%%%%nssm.exe
>> "%DIST%\uninstall-service.cmd" echo if not defined NSSM ^(
>> "%DIST%\uninstall-service.cmd" echo   echo Missing nssm.exe in the bundle root.
>> "%DIST%\uninstall-service.cmd" echo   exit /b 1
>> "%DIST%\uninstall-service.cmd" echo ^)
>> "%DIST%\uninstall-service.cmd" echo.
>> "%DIST%\uninstall-service.cmd" echo set SERVER_ID=
>> "%DIST%\uninstall-service.cmd" echo if exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\uninstall-service.cmd" echo   for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\uninstall-service.cmd" echo     if /i "%%%%A"=="SERVER_ID" set SERVER_ID=%%%%B
>> "%DIST%\uninstall-service.cmd" echo   ^)
>> "%DIST%\uninstall-service.cmd" echo ^)
>> "%DIST%\uninstall-service.cmd" echo if not defined SERVER_ID set SERVER_ID=subscriber
>> "%DIST%\uninstall-service.cmd" echo set SERVICE_NAME=TradingIntercomSubscriber-!SERVER_ID!
>> "%DIST%\uninstall-service.cmd" echo.
>> "%DIST%\uninstall-service.cmd" echo echo Stopping service (if running): !SERVICE_NAME!
>> "%DIST%\uninstall-service.cmd" echo "!NSSM!" stop "!SERVICE_NAME!" ^>nul 2^>^&1
>> "%DIST%\uninstall-service.cmd" echo echo Removing service: !SERVICE_NAME!
>> "%DIST%\uninstall-service.cmd" echo "!NSSM!" remove "!SERVICE_NAME!" confirm
>> "%DIST%\uninstall-service.cmd" echo.
>> "%DIST%\uninstall-service.cmd" echo echo Done.
>> "%DIST%\uninstall-service.cmd" echo endlocal

> "%DIST%\service-status.cmd" echo @echo off
>> "%DIST%\service-status.cmd" echo setlocal enabledelayedexpansion
>> "%DIST%\service-status.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\service-status.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\service-status.cmd" echo set SERVER_ID=
>> "%DIST%\service-status.cmd" echo if exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\service-status.cmd" echo   for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\service-status.cmd" echo     if /i "%%%%A"=="SERVER_ID" set SERVER_ID=%%%%B
>> "%DIST%\service-status.cmd" echo   ^)
>> "%DIST%\service-status.cmd" echo ^)
>> "%DIST%\service-status.cmd" echo if not defined SERVER_ID set SERVER_ID=subscriber
>> "%DIST%\service-status.cmd" echo set SERVICE_NAME=TradingIntercomSubscriber-!SERVER_ID!
>> "%DIST%\service-status.cmd" echo.
>> "%DIST%\service-status.cmd" echo sc query "!SERVICE_NAME!"
>> "%DIST%\service-status.cmd" echo endlocal

> "%DIST%\service-start.cmd" echo @echo off
>> "%DIST%\service-start.cmd" echo setlocal enabledelayedexpansion
>> "%DIST%\service-start.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\service-start.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\service-start.cmd" echo set NSSM=
>> "%DIST%\service-start.cmd" echo if exist "%%%%ROOT%%%%nssm.exe" set NSSM=%%%%ROOT%%%%nssm.exe
>> "%DIST%\service-start.cmd" echo if not defined NSSM ^(
>> "%DIST%\service-start.cmd" echo   echo Missing nssm.exe in the bundle root.
>> "%DIST%\service-start.cmd" echo   exit /b 1
>> "%DIST%\service-start.cmd" echo ^)
>> "%DIST%\service-start.cmd" echo set SERVER_ID=
>> "%DIST%\service-start.cmd" echo if exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\service-start.cmd" echo   for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\service-start.cmd" echo     if /i "%%%%A"=="SERVER_ID" set SERVER_ID=%%%%B
>> "%DIST%\service-start.cmd" echo   ^)
>> "%DIST%\service-start.cmd" echo ^)
>> "%DIST%\service-start.cmd" echo if not defined SERVER_ID set SERVER_ID=subscriber
>> "%DIST%\service-start.cmd" echo set SERVICE_NAME=TradingIntercomSubscriber-!SERVER_ID!
>> "%DIST%\service-start.cmd" echo "!NSSM!" start "!SERVICE_NAME!"
>> "%DIST%\service-start.cmd" echo endlocal

> "%DIST%\service-stop.cmd" echo @echo off
>> "%DIST%\service-stop.cmd" echo setlocal enabledelayedexpansion
>> "%DIST%\service-stop.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\service-stop.cmd" echo cd /d "%%%%ROOT%%%%"
>> "%DIST%\service-stop.cmd" echo set NSSM=
>> "%DIST%\service-stop.cmd" echo if exist "%%%%ROOT%%%%nssm.exe" set NSSM=%%%%ROOT%%%%nssm.exe
>> "%DIST%\service-stop.cmd" echo if not defined NSSM ^(
>> "%DIST%\service-stop.cmd" echo   echo Missing nssm.exe in the bundle root.
>> "%DIST%\service-stop.cmd" echo   exit /b 1
>> "%DIST%\service-stop.cmd" echo ^)
>> "%DIST%\service-stop.cmd" echo set SERVER_ID=
>> "%DIST%\service-stop.cmd" echo if exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\service-stop.cmd" echo   for /f "usebackq tokens=1,* delims==" %%%%A in ^("%%%%ROOT%%%%server.env"^) do ^(
>> "%DIST%\service-stop.cmd" echo     if /i "%%%%A"=="SERVER_ID" set SERVER_ID=%%%%B
>> "%DIST%\service-stop.cmd" echo   ^)
>> "%DIST%\service-stop.cmd" echo ^)
>> "%DIST%\service-stop.cmd" echo if not defined SERVER_ID set SERVER_ID=subscriber
>> "%DIST%\service-stop.cmd" echo set SERVICE_NAME=TradingIntercomSubscriber-!SERVER_ID!
>> "%DIST%\service-stop.cmd" echo "!NSSM!" stop "!SERVICE_NAME!"
>> "%DIST%\service-stop.cmd" echo endlocal

> "%DIST%\edit-config.cmd" echo @echo off
>> "%DIST%\edit-config.cmd" echo setlocal
>> "%DIST%\edit-config.cmd" echo set ROOT=%%%%~dp0
>> "%DIST%\edit-config.cmd" echo echo Preparing subscriber env...
>> "%DIST%\edit-config.cmd" echo if not exist "%%%%ROOT%%%%server.env" ^(
>> "%DIST%\edit-config.cmd" echo   copy /Y "%%%%ROOT%%%%server.env.example" "%%%%ROOT%%%%server.env" ^>nul
>> "%DIST%\edit-config.cmd" echo   echo Created server.env from example. Please edit it now.
>> "%DIST%\edit-config.cmd" echo ^)
>> "%DIST%\edit-config.cmd" echo notepad "%%%%ROOT%%%%server.env"

echo.
echo Done.
echo Output folder:
echo   %DIST%
echo.
echo Next steps on the target machine:
echo  1^) Copy the dist\subscriber folder
echo  2^) Run edit-config.cmd and set SERVER_ID, PORT, PUBLISHER_URL, ANNOUNCED_IP
echo  3^) If node_modules was not included, run install-deps.cmd
echo  4^) For service mode: copy nssm.exe into the folder and run install-service.cmd (Admin)
echo  5^) Or run start-subscriber.cmd
echo.

endlocal
exit /b 0
