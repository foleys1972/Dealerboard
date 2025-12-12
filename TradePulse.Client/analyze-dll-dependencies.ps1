# Script to analyze which DLLs are actually needed at runtime
# Some DLLs might be optional or development-only

$ErrorActionPreference = "Continue"

Write-Host "=== Analyzing DLL Dependencies ===" -ForegroundColor Cyan

$buildOutputPath = "TradePulse.Client.WPF\bin\Release\net8.0-windows"

if (-not (Test-Path $buildOutputPath)) {
    Write-Host "ERROR: Build output not found. Please build first." -ForegroundColor Red
    exit 1
}

# Get all DLLs
$allDlls = Get-ChildItem -Path $buildOutputPath -Filter "*.dll" | Sort-Object Name

Write-Host "`nTotal DLLs found: $($allDlls.Count)" -ForegroundColor Yellow

# Categorize DLLs
$categories = @{
    "Core Application" = @()
    "Direct Dependencies" = @()
    "Microsoft.Extensions" = @()
    "Material Design" = @()
    "Socket.IO" = @()
    "NAudio" = @()
    "CodeAnalysis (Potentially Unnecessary)" = @()
    "Other" = @()
}

foreach ($dll in $allDlls) {
    $name = $dll.Name
    
    if ($name -like "TradePulse*") {
        $categories["Core Application"] += $dll
    }
    elseif ($name -like "*CodeAnalysis*" -or $name -like "*VisualBasic*") {
        $categories["CodeAnalysis (Potentially Unnecessary)"] += $dll
    }
    elseif ($name -like "Microsoft.Extensions.*") {
        $categories["Microsoft.Extensions"] += $dll
    }
    elseif ($name -like "*MaterialDesign*") {
        $categories["Material Design"] += $dll
    }
    elseif ($name -like "*Socket*" -or $name -like "*SocketIO*") {
        $categories["Socket.IO"] += $dll
    }
    elseif ($name -like "*NAudio*") {
        $categories["NAudio"] += $dll
    }
    elseif ($name -like "CommunityToolkit*" -or $name -like "Newtonsoft*" -or $name -like "Microsoft.Xaml*") {
        $categories["Direct Dependencies"] += $dll
    }
    else {
        $categories["Other"] += $dll
    }
}

# Display categorized DLLs
foreach ($category in $categories.Keys) {
    $dlls = $categories[$category]
    if ($dlls.Count -gt 0) {
        $totalSize = ($dlls | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "`n$category ($($dlls.Count) files, $([math]::Round($totalSize, 2)) MB):" -ForegroundColor Cyan
        foreach ($dll in $dlls) {
            $sizeKB = [math]::Round($dll.Length / 1KB, 1)
            Write-Host "  - $($dll.Name) ($sizeKB KB)" -ForegroundColor Gray
        }
    }
}

# Check for potentially unnecessary DLLs
Write-Host "`n=== Analysis ===" -ForegroundColor Yellow

$codeAnalysisDlls = $categories["CodeAnalysis (Potentially Unnecessary)"]
if ($codeAnalysisDlls.Count -gt 0) {
    Write-Host "`n⚠️  Potentially Unnecessary DLLs:" -ForegroundColor Yellow
    $totalSize = ($codeAnalysisDlls | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  CodeAnalysis DLLs ($($codeAnalysisDlls.Count) files, $([math]::Round($totalSize, 2)) MB)" -ForegroundColor Gray
    Write-Host "  These are typically build-time analyzers and may not be needed at runtime." -ForegroundColor Gray
    Write-Host "  However, removing them may cause runtime errors if they're referenced." -ForegroundColor Gray
    Write-Host "  Recommendation: Test the application without them before removing." -ForegroundColor Gray
}

Write-Host "`n=== Essential DLLs (DO NOT REMOVE) ===" -ForegroundColor Green
Write-Host "These DLLs are definitely required:" -ForegroundColor Gray
Write-Host "  - TradePulse.exe and TradePulse.dll (main application)" -ForegroundColor Gray
Write-Host "  - TradePulse.Client.Core.dll (core library)" -ForegroundColor Gray
Write-Host "  - All Material Design DLLs (UI framework)" -ForegroundColor Gray
Write-Host "  - All Socket.IO DLLs (real-time communication)" -ForegroundColor Gray
Write-Host "  - All NAudio DLLs (audio functionality)" -ForegroundColor Gray
Write-Host "  - Microsoft.Extensions.* DLLs (dependency injection, logging, configuration)" -ForegroundColor Gray
Write-Host "  - CommunityToolkit.Mvvm.dll (MVVM framework)" -ForegroundColor Gray
Write-Host "  - Newtonsoft.Json.dll (JSON serialization)" -ForegroundColor Gray
Write-Host "  - Microsoft.Xaml.Behaviors.dll (WPF behaviors)" -ForegroundColor Gray

Write-Host "`n=== Recommendation ===" -ForegroundColor Cyan
Write-Host "Most DLLs are required because of transitive dependencies." -ForegroundColor Gray
Write-Host "The .NET runtime will fail if a required DLL is missing." -ForegroundColor Gray
Write-Host "`nTo minimize size, consider:" -ForegroundColor Gray
Write-Host "  1. Publish as self-contained with trimming: dotnet publish -c Release -r win-x64 --self-contained true -p:PublishTrimmed=true" -ForegroundColor Gray
Write-Host "  2. Use single-file publishing: -p:PublishSingleFile=true" -ForegroundColor Gray
Write-Host "  3. Enable assembly trimming: -p:EnableCompressionInSingleFile=true" -ForegroundColor Gray

