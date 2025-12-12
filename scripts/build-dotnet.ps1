# Build TradePulse .NET Client
# This script builds the .NET WPF client application

param(
    [string]$Configuration = "Release",
    [switch]$Clean = $false,
    [switch]$Restore = $true,
    [switch]$Test = $false
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TradePulse .NET Client Build Script  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .NET SDK is installed
Write-Host "Checking .NET SDK..." -ForegroundColor Yellow
$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($null -eq $dotnetCmd) {
    Write-Host "X .NET SDK not found!" -ForegroundColor Red
    Write-Host "Please install .NET 8 SDK from https://dotnet.microsoft.com/download" -ForegroundColor Red
    exit 1
}

$dotnetVersion = dotnet --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "X .NET SDK not found!" -ForegroundColor Red
    Write-Host "Please install .NET 8 SDK from https://dotnet.microsoft.com/download" -ForegroundColor Red
    exit 1
}
Write-Host "OK .NET SDK found: $dotnetVersion" -ForegroundColor Green

# Navigate to .NET client directory
$clientPath = Join-Path $PSScriptRoot "..\TradePulse.Client"
if (-not (Test-Path $clientPath)) {
    Write-Host "X TradePulse.Client directory not found at: $clientPath" -ForegroundColor Red
    exit 1
}

Set-Location $clientPath
Write-Host "Working directory: $clientPath" -ForegroundColor Gray
Write-Host ""

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    dotnet clean --configuration $Configuration
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X Clean failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK Clean completed" -ForegroundColor Green
    Write-Host ""
}

# Restore packages
if ($Restore) {
    Write-Host "Restoring NuGet packages..." -ForegroundColor Yellow
    dotnet restore
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X Restore failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK Packages restored" -ForegroundColor Green
    Write-Host ""
}

# Build solution
Write-Host "Building solution (Configuration: $Configuration)..." -ForegroundColor Yellow
dotnet build --configuration $Configuration --no-restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "OK Build completed successfully" -ForegroundColor Green
Write-Host ""

# Run tests if requested
if ($Test) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    dotnet test --configuration $Configuration --no-build --verbosity normal
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X Tests failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK All tests passed" -ForegroundColor Green
    Write-Host ""
}

# Show output location
$outputPath = Join-Path $clientPath "TradePulse.Client.WPF\bin\$Configuration\net8.0-windows"
if (Test-Path $outputPath) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Build Output Location:" -ForegroundColor Cyan
    Write-Host "  $outputPath" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # List output files
    $exeFile = Get-ChildItem -Path $outputPath -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($exeFile) {
        Write-Host "Executable: $($exeFile.Name)" -ForegroundColor Green
        $sizeMB = [math]::Round($exeFile.Length / 1MB, 2)
        Write-Host "Size: $sizeMB MB" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Build completed successfully! OK" -ForegroundColor Green
