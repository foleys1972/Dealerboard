# Script to organize build files - move non-essential files to temp folder
# Essential runtime files stay in the build output directory

$ErrorActionPreference = "Stop"

Write-Host "=== Organizing TradePulse Build Files ===" -ForegroundColor Cyan

$wpfProjectPath = "TradePulse.Client.WPF"
$buildOutputPath = Join-Path $wpfProjectPath "bin\Release\net8.0-windows"
$tempFolder = "temp"
$buildTempFolder = Join-Path $wpfProjectPath $tempFolder

# Check if build output exists
if (-not (Test-Path $buildOutputPath)) {
    Write-Host "ERROR: Build output directory not found: $buildOutputPath" -ForegroundColor Red
    Write-Host "Please build the project first using: .\build-dotnet.ps1" -ForegroundColor Yellow
    exit 1
}

# Create temp folder if it doesn't exist
if (-not (Test-Path $buildTempFolder)) {
    New-Item -ItemType Directory -Path $buildTempFolder -Force | Out-Null
    Write-Host "Created temp folder: $buildTempFolder" -ForegroundColor Green
}

# Files to keep (essential for running the app)
$keepFiles = @(
    "*.exe",           # Main executable
    "*.dll",           # All DLL dependencies
    "*.json",          # Configuration files (appsettings.json, etc.)
    "*.config",        # App config files
    "*.ico",           # Icon files
    "*.runtimes",      # Runtime folder (if self-contained)
    "runtimes"         # Runtime folder
)

# Files/folders to move to temp
$movePatterns = @(
    "*.pdb",           # Debug symbol files
    "*.cache",         # Cache files
    "*.cs",            # Source files (shouldn't be here, but just in case)
    "*.xaml",          # XAML files (compiled into DLL)
    "*.xaml.cs",       # Code-behind files
    "obj"              # Build intermediate files
)

Write-Host "`nMoving non-essential files to temp folder..." -ForegroundColor Yellow

$movedCount = 0

# Move files matching patterns
foreach ($pattern in $movePatterns) {
    $files = Get-ChildItem -Path $buildOutputPath -Filter $pattern -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $buildOutputFullPath = (Resolve-Path $buildOutputPath -ErrorAction SilentlyContinue).Path
        if (-not $buildOutputFullPath) {
            $buildOutputFullPath = (Get-Item $buildOutputPath).FullName
        }
        $relativePath = $file.FullName.Replace($buildOutputFullPath, "").TrimStart("\", "/")
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = $file.Name
        }
        $destPath = Join-Path $buildTempFolder $relativePath
        $destDir = Split-Path -Parent $destPath
        
        if (-not [string]::IsNullOrWhiteSpace($destDir) -and -not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        
        if (Test-Path $file.FullName) {
            Move-Item -Path $file.FullName -Destination $destPath -Force -ErrorAction SilentlyContinue
            $movedCount++
            Write-Host "  Moved: $($file.Name)" -ForegroundColor Gray
        }
    }
}

# Move obj folder from project root
$objPath = Join-Path $wpfProjectPath "obj"
if (Test-Path $objPath) {
    $objDest = Join-Path $buildTempFolder "obj"
    if (Test-Path $objDest) {
        Remove-Item -Path $objDest -Recurse -Force -ErrorAction SilentlyContinue
    }
    Move-Item -Path $objPath -Destination $objDest -Force -ErrorAction SilentlyContinue
    Write-Host "  Moved: obj folder" -ForegroundColor Gray
    $movedCount++
}

# List essential files that remain
Write-Host "`n=== Essential Runtime Files (kept in build output) ===" -ForegroundColor Green
$essentialFiles = Get-ChildItem -Path $buildOutputPath -File | 
    Where-Object { 
        $ext = $_.Extension.ToLower()
        $ext -eq ".exe" -or $ext -eq ".dll" -or $ext -eq ".json" -or $ext -eq ".config" -or $ext -eq ".ico"
    } | 
    Sort-Object Name

foreach ($file in $essentialFiles) {
    $sizeKB = [math]::Round($file.Length / 1KB, 2)
    Write-Host "  $($file.Name) ($sizeKB KB)" -ForegroundColor Cyan
}

# Count DLLs
$dllCount = (Get-ChildItem -Path $buildOutputPath -Filter "*.dll" -File).Count
Write-Host "`nTotal DLL dependencies: $dllCount" -ForegroundColor Cyan
Write-Host "Total files moved to temp: $movedCount" -ForegroundColor Yellow
Write-Host "`nTemp folder location: $buildTempFolder" -ForegroundColor Gray

# Create a README in temp folder explaining what's there
$readmePath = Join-Path $buildTempFolder "README.txt"
@"
This folder contains non-essential build files that were moved from the build output.

Files moved here:
- Debug symbol files (.pdb)
- Cache files (.cache)
- Build intermediate files (obj folder)
- Source files (if any)

These files are NOT needed to run the TradePulse executable.
You can safely delete this folder if you need to free up space.

To restore: Move files back from this folder to the original locations.
"@ | Out-File -FilePath $readmePath -Encoding UTF8

Write-Host "`n=== Organization Complete ===" -ForegroundColor Green
Write-Host "To run the app, use: $buildOutputPath\TradePulse.exe" -ForegroundColor Cyan

