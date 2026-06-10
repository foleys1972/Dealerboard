# Build script for TradeCom React Client (PowerShell version)
# This script builds the React client for production

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TradeCom React Client Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "[DEBUG] Script directory: $ScriptDir" -ForegroundColor Gray
Write-Host "[DEBUG] Current directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

# Check if client directory exists
if (-not (Test-Path "client")) {
    Write-Host "[ERROR] client directory not found!" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Expected structure:" -ForegroundColor Yellow
    Write-Host "  C:\Projects\intercom\" -ForegroundColor Yellow
    Write-Host "  C:\Projects\intercom\build-client.ps1" -ForegroundColor Yellow
    Write-Host "  C:\Projects\intercom\client\" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Found client directory" -ForegroundColor Green
Write-Host ""

# Change to client directory
Set-Location "client"
Write-Host "[DEBUG] Changed to: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

# Check Node.js
Write-Host "[1/5] Checking Node.js installation..." -ForegroundColor Cyan
$nodeVersion = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeVersion) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to get Node.js version" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Node.js found: $nodeVer" -ForegroundColor Green
Write-Host ""

# Check npm
Write-Host "[2/5] Checking npm installation..." -ForegroundColor Cyan
$npmVersion = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmVersion) {
    Write-Host "[ERROR] npm is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$npmVer = npm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to get npm version" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] npm found: $npmVer" -ForegroundColor Green
Write-Host ""

# Check/Install dependencies
Write-Host "[3/5] Checking dependencies..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    Write-Host "This may take several minutes..." -ForegroundColor Yellow
    Write-Host ""
    
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] Failed to install dependencies (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "Please check the error messages above." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
    Write-Host "[OK] Dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[OK] Dependencies found (node_modules exists)" -ForegroundColor Green
    Write-Host ""
}

# Clean previous build
Write-Host "[4/5] Cleaning previous build..." -ForegroundColor Cyan
if (Test-Path "build") {
    Write-Host "[INFO] Removing existing build directory..." -ForegroundColor Yellow
    Remove-Item -Path "build" -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path "build") {
        Write-Host "[WARN] Failed to completely remove build directory" -ForegroundColor Yellow
        Write-Host "Continuing anyway..." -ForegroundColor Yellow
    } else {
        Write-Host "[OK] Previous build cleaned" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] No previous build found" -ForegroundColor Green
}
Write-Host ""

# Build the React app
Write-Host "[5/5] Building React application..." -ForegroundColor Cyan
Write-Host "This may take a few minutes..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Starting build process..." -ForegroundColor Yellow
Write-Host ""

npm run build
$buildExit = $LASTEXITCODE

if ($buildExit -ne 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "[ERROR] Build failed with exit code: $buildExit" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error messages above." -ForegroundColor Yellow
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  - Missing dependencies: Run 'npm install' manually" -ForegroundColor Yellow
    Write-Host "  - Syntax errors in React code" -ForegroundColor Yellow
    Write-Host "  - Out of memory: Close other applications" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit $buildExit
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "[OK] Build process completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Verify build
if (-not (Test-Path "build")) {
    Write-Host "[ERROR] Build directory was not created!" -ForegroundColor Red
    Write-Host "The build process may have failed silently." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Build directory created: $(Get-Location)\build" -ForegroundColor Green
Write-Host ""

if (-not (Test-Path "build\index.html")) {
    Write-Host "[ERROR] index.html not found in build directory!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Listing files in build directory:" -ForegroundColor Yellow
    if (Test-Path "build") {
        Get-ChildItem "build" | Select-Object Name
    }
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] index.html created successfully" -ForegroundColor Green
Write-Host ""

# Check for static directory
if (Test-Path "build\static") {
    Write-Host "[OK] static/ directory exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] static/ directory not found" -ForegroundColor Yellow
}
Write-Host ""

# Get build size
Write-Host "Calculating build size..." -ForegroundColor Cyan
$buildSize = (Get-ChildItem -Path "build" -Recurse -File | Measure-Object -Property Length -Sum).Sum
if ($buildSize) {
    $buildSizeMB = [math]::Round($buildSize / 1MB, 2)
    Write-Host "Build size: $buildSizeMB MB ($buildSize bytes)" -ForegroundColor Green
} else {
    Write-Host "Build size: Unable to calculate" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "[SUCCESS] Build complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Build output: $(Get-Location)\build" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now start the server." -ForegroundColor Green
Write-Host ""

# Ask if user wants to open the build folder
$openFolder = Read-Host "Open build folder? (Y/N)"
if ($openFolder -eq "Y" -or $openFolder -eq "y") {
    Start-Process explorer.exe -ArgumentList "$(Get-Location)\build"
}

Write-Host ""
Write-Host "Script finished successfully!" -ForegroundColor Green
Read-Host "Press Enter to exit"

