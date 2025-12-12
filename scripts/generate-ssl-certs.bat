@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Generating SSL Certificates for Development
echo ========================================
echo.

REM Set project root directory (one level up from scripts)
set PROJECT_ROOT=%~dp0..
cd /d "%PROJECT_ROOT%"

REM Check if mkcert exists in project root
if exist "%PROJECT_ROOT%\mkcert.exe" (
    echo [INFO] Found mkcert.exe in project root
    set MKCERT=%PROJECT_ROOT%\mkcert.exe
) else (
    echo [ERROR] mkcert.exe not found in project root
    echo Please download mkcert from https://github.com/FiloSottile/mkcert/releases
    echo Or use: certutil or OpenSSL to generate certificates
    pause
    exit /b 1
)

REM Install local CA if not already installed
echo [INFO] Installing local CA...
"%MKCERT%" -install
if %errorlevel% neq 0 (
    echo [WARN] Failed to install local CA (may already be installed)
)

REM Generate certificates in project root (where server expects them)
echo [INFO] Generating certificates in project root...
cd /d "%PROJECT_ROOT%"
"%MKCERT%" -key-file dev-key.pem -cert-file dev-cert.pem localhost 127.0.0.1 ::1 192.168.1.41
set CERT_EXIT_CODE=%errorlevel%

REM Check if certificate files were actually created
if exist "%PROJECT_ROOT%\dev-cert.pem" if exist "%PROJECT_ROOT%\dev-key.pem" (
    echo.
    echo ========================================
    echo SSL Certificates Generated Successfully!
    echo ========================================
    echo.
    echo Files created in project root:
    echo   - %PROJECT_ROOT%\dev-cert.pem
    echo   - %PROJECT_ROOT%\dev-key.pem
    echo.
    echo Certificates are valid for:
    echo   - localhost
    echo   - 127.0.0.1
    echo   - ::1 (IPv6 localhost)
    echo   - 192.168.1.41
    echo.
    echo Server will now use HTTPS when these files are present.
    echo.
    exit /b 0
) else (
    echo [ERROR] Failed to generate certificates
    echo Certificate files were not created.
    echo.
    if %CERT_EXIT_CODE% neq 0 (
        echo mkcert returned exit code: %CERT_EXIT_CODE%
        echo.
        echo Please check:
        echo   1. mkcert.exe is the correct version for your system
        echo   2. You have permissions to write to the project root
        echo   3. Local CA is properly installed
    )
    pause
    exit /b 1
)

pause

