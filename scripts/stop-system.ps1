# Stop TradePulse System
# This script stops all running TradePulse processes

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TradePulse System Shutdown Script    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop Node.js processes (backend and frontend)
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow

$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    foreach ($process in $nodeProcesses) {
        try {
            $processPath = $process.Path
            if ($processPath -like "*intercom*" -or $processPath -like "*TradePulse*") {
                Write-Host "  Stopping process: $($process.Id) - $($process.ProcessName)" -ForegroundColor Gray
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            # Process may have already terminated
        }
    }
    Write-Host "✓ Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "  No Node.js processes found" -ForegroundColor Gray
}

Write-Host ""

# Stop React development server
Write-Host "Stopping React development server..." -ForegroundColor Yellow
$reactProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*react-scripts*" -or $_.CommandLine -like "*webpack*"
}
if ($reactProcesses) {
    foreach ($process in $reactProcesses) {
        try {
            Write-Host "  Stopping React process: $($process.Id)" -ForegroundColor Gray
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        } catch {
            # Process may have already terminated
        }
    }
    Write-Host "✓ React server stopped" -ForegroundColor Green
} else {
    Write-Host "  No React processes found" -ForegroundColor Gray
}

Write-Host ""

# Stop .NET client
Write-Host "Stopping .NET client..." -ForegroundColor Yellow
$dotnetProcesses = Get-Process -Name "TradePulse" -ErrorAction SilentlyContinue
if ($dotnetProcesses) {
    foreach ($process in $dotnetProcesses) {
        try {
            Write-Host "  Stopping .NET client: $($process.Id)" -ForegroundColor Gray
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        } catch {
            # Process may have already terminated
        }
    }
    Write-Host "✓ .NET client stopped" -ForegroundColor Green
} else {
    Write-Host "  No .NET client processes found" -ForegroundColor Gray
}

Write-Host ""

# Kill processes on common ports
Write-Host "Checking ports..." -ForegroundColor Yellow

$ports = @(3000, 3001, 5000, 5001)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($connection in $connections) {
            try {
                $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "  Stopping process on port $port : $($process.ProcessName) ($($process.Id))" -ForegroundColor Gray
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                }
            } catch {
                # Process may have already terminated
            }
        }
    }
}

Write-Host "✓ Port cleanup completed" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

