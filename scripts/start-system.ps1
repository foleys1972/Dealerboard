# Start TradeCom System (Frontend + Backend)
# This script starts both the React frontend and Node.js backend

param(
    [switch]$BackendOnly = $false,
    [switch]$FrontendOnly = $false,
    [switch]$DotNetClient = $false,
    [switch]$WithDb = $false,
    [string]$PostgresServiceName = "",
    [string]$RedisServiceName = "",
    [int]$BackendPort = 5000,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TradeCom System Startup Script      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# Check if Node.js is installed
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
    Write-Host "X Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "OK Node.js found: $nodeVersion" -ForegroundColor Green

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($null -eq $npmCmd) {
    Write-Host "X npm not found!" -ForegroundColor Red
    exit 1
}
$npmVersion = npm --version
Write-Host "OK npm found: $npmVersion" -ForegroundColor Green

# Check if .NET is installed (if running .NET client)
if ($DotNetClient) {
    $dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $dotnetCmd) {
        Write-Host "X .NET SDK not found!" -ForegroundColor Red
        Write-Host "Please install .NET 8 SDK from https://dotnet.microsoft.com/download" -ForegroundColor Red
        exit 1
    }
    $dotnetVersion = dotnet --version
    Write-Host "OK .NET SDK found: $dotnetVersion" -ForegroundColor Green
}

Write-Host ""

# Function to check if port is in use
function Test-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet -ErrorAction SilentlyContinue
        return $connection
    } catch {
        return $false
    }
}

function Read-DotEnvFile {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trim = $line.Trim()
        if (-not $trim) { continue }
        if ($trim.StartsWith('#')) { continue }
        $idx = $trim.IndexOf('=')
        if ($idx -lt 1) { continue }
        $k = $trim.Substring(0, $idx).Trim()
        $v = $trim.Substring($idx + 1).Trim()
        if ($k) { $map[$k] = $v }
    }
    return $map
}

function Start-WindowsServiceIfStopped {
    param(
        [string]$ServiceName,
        [string]$Label
    )

    if (-not $ServiceName) { return $false }

    try {
        $svc = Get-Service -Name $ServiceName -ErrorAction Stop
        if ($svc.Status -ne 'Running') {
            Write-Host "Starting $Label service: $ServiceName" -ForegroundColor Yellow
            Start-Service -Name $ServiceName -ErrorAction Stop
        } else {
            Write-Host "$Label service already running: $ServiceName" -ForegroundColor Green
        }
        return $true
    } catch {
        return $false
    }
}

function Start-LocalDependencies {
    param(
        [string]$PostgresServiceName,
        [string]$RedisServiceName
    )

    Write-Host "Starting local dependencies (no Docker)..." -ForegroundColor Cyan

    $pgStarted = $false
    $redisStarted = $false

    if ($PostgresServiceName) {
        $pgStarted = Start-WindowsServiceIfStopped -ServiceName $PostgresServiceName -Label 'Postgres'
    } else {
        foreach ($candidate in @('postgresql-x64-16','postgresql-x64-15','postgresql-x64-14','postgresql-x64-13','PostgreSQL','postgresql')) {
            if (Start-WindowsServiceIfStopped -ServiceName $candidate -Label 'Postgres') { $pgStarted = $true; break }
        }
    }

    if ($RedisServiceName) {
        $redisStarted = Start-WindowsServiceIfStopped -ServiceName $RedisServiceName -Label 'Redis'
    } else {
        foreach ($candidate in @('MemuraiDeveloper','Redis','RedisServer')) {
            if (Start-WindowsServiceIfStopped -ServiceName $candidate -Label 'Redis') { $redisStarted = $true; break }
        }
    }

    if (-not $pgStarted) {
        Write-Host "WARNING: Could not start Postgres as a Windows service automatically (service name may differ)." -ForegroundColor Yellow
    }
    if (-not $redisStarted) {
        Write-Host "WARNING: Could not start Redis as a Windows service automatically (service name may differ)." -ForegroundColor Yellow
    }

    Write-Host "Waiting for Postgres (5432) and Redis (6379)..." -ForegroundColor Yellow
    $timeoutSeconds = 60
    $elapsed = 0
    while ($elapsed -lt $timeoutSeconds) {
        $pgReady = Test-Port -Port 5432
        $redisReady = Test-Port -Port 6379
        if ($pgReady -and $redisReady) {
            Write-Host "OK Dependencies are ready" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
        $elapsed += 1
    }

    Write-Host "WARNING: Dependencies did not become ready within $timeoutSeconds seconds" -ForegroundColor Yellow
    return $false
}

# Function to wait for service to be ready
function Wait-ForService {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30,
        [string]$ServiceName = "Service"
    )
    
    $elapsed = 0
    $interval = 1
    
    Write-Host "Waiting for $ServiceName to be ready..." -ForegroundColor Yellow
    
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "OK $ServiceName is ready!" -ForegroundColor Green
                return $true
            }
        } catch {
            # Service not ready yet
        }
        
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "WARNING: $ServiceName did not become ready within $TimeoutSeconds seconds" -ForegroundColor Yellow
    return $false
}

# Start Backend
if (-not $FrontendOnly) {
    Write-Host "Starting Backend Server..." -ForegroundColor Cyan
    Write-Host "=========================" -ForegroundColor Cyan
    
    $backendPath = Join-Path $rootDir "server"
    if (-not (Test-Path $backendPath)) {
        Write-Host "X Backend directory not found: $backendPath" -ForegroundColor Red
        exit 1
    }
    
    # Check if backend port is in use
    if (Test-Port -Port $BackendPort) {
        Write-Host "WARNING: Port $BackendPort is already in use" -ForegroundColor Yellow
        Write-Host "  Backend may already be running" -ForegroundColor Yellow
    } else {
        # Check for .env file
        $envFile = Join-Path $backendPath ".env"
        if (-not (Test-Path $envFile)) {
            Write-Host "WARNING: .env file not found in server directory" -ForegroundColor Yellow
            Write-Host "  Creating from template (if exists)..." -ForegroundColor Yellow
        }
        
        if ($WithDb) {
            $null = Start-LocalDependencies -PostgresServiceName $PostgresServiceName -RedisServiceName $RedisServiceName
        }

        $serverEnvPath = Join-Path $backendPath ".env"
        $serverEnv = Read-DotEnvFile -Path $serverEnvPath

        $postgresHost = $serverEnv['POSTGRES_HOST']
        $postgresPort = $serverEnv['POSTGRES_PORT']
        $postgresDb = $serverEnv['POSTGRES_DB']
        $postgresUser = $serverEnv['POSTGRES_USER']
        $postgresPassword = $serverEnv['POSTGRES_PASSWORD']
        $postgresSsl = $serverEnv['POSTGRES_SSL']

        $redisHost = $serverEnv['REDIS_HOST']
        $redisPort = $serverEnv['REDIS_PORT']
        $redisPassword = $serverEnv['REDIS_PASSWORD']
        $redisDb = $serverEnv['REDIS_DB']

        if ($WithDb) {
            if (-not $postgresHost) { $postgresHost = 'localhost' }
            if (-not $postgresPort) { $postgresPort = '5432' }
            if (-not $postgresDb) { $postgresDb = 'trading_intercom' }
            if (-not $postgresUser) { $postgresUser = 'intercom_app' }
            if (-not $postgresPassword) { $postgresPassword = 'intercom' }
            if (-not $postgresSsl) { $postgresSsl = 'false' }
            if (-not $redisHost) { $redisHost = 'localhost' }
            if (-not $redisPort) { $redisPort = '6379' }
            if (-not $redisDb) { $redisDb = '0' }
        }

        $redisEnabledLine = ""
        if ($WithDb) {
            $redisEnabledLine = "`$env:REDIS_ENABLED = 'true'"
        }

        # Start backend in new window
        $backendScript = @"
cd `"$backendPath`"
`$env:PORT = $BackendPort
`$env:POSTGRES_HOST = `"$postgresHost`"
`$env:POSTGRES_PORT = `"$postgresPort`"
`$env:POSTGRES_DB = `"$postgresDb`"
`$env:POSTGRES_USER = `"$postgresUser`"
`$env:POSTGRES_PASSWORD = `"$postgresPassword`"
`$env:POSTGRES_SSL = `"$postgresSsl`"
`$env:REDIS_HOST = `"$redisHost`"
`$env:REDIS_PORT = `"$redisPort`"
`$env:REDIS_PASSWORD = `"$redisPassword`"
`$env:REDIS_DB = `"$redisDb`"
$redisEnabledLine
node index.js
pause
"@
        
        $backendScriptPath = Join-Path $env:TEMP "start-backend.ps1"
        $backendScript | Out-File -FilePath $backendScriptPath -Encoding UTF8
        
        Start-Process powershell.exe -ArgumentList "-NoExit", "-File", $backendScriptPath -WindowStyle Normal
        
        Write-Host "OK Backend server starting..." -ForegroundColor Green
        Write-Host "  URL: http://localhost:$BackendPort" -ForegroundColor Gray
        
        # Wait for backend to be ready
        Start-Sleep -Seconds 3
        Wait-ForService -Url "http://localhost:$BackendPort/api/health" -ServiceName "Backend" -TimeoutSeconds 30
    }
    
    Write-Host ""
}

# Start Frontend (React)
if (-not $BackendOnly) {
    Write-Host "Starting Frontend (React)..." -ForegroundColor Cyan
    Write-Host "============================" -ForegroundColor Cyan
    
    $frontendPath = Join-Path $rootDir "client"
    if (-not (Test-Path $frontendPath)) {
        Write-Host "X Frontend directory not found: $frontendPath" -ForegroundColor Red
        exit 1
    }
    
    # Check if frontend port is in use
    if (Test-Port -Port $FrontendPort) {
        Write-Host "WARNING: Port $FrontendPort is already in use" -ForegroundColor Yellow
        Write-Host "  Frontend may already be running" -ForegroundColor Yellow
    } else {
        # Check if node_modules exists
        $nodeModulesPath = Join-Path $frontendPath "node_modules"
        if (-not (Test-Path $nodeModulesPath)) {
            Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
            Set-Location $frontendPath
            npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Host "X Failed to install dependencies!" -ForegroundColor Red
                exit 1
            }
            Write-Host "OK Dependencies installed" -ForegroundColor Green
        }
        
        # Start frontend in new window
        $frontendScript = @"
cd `"$frontendPath`"
`$env:PORT = $FrontendPort
`$env:REACT_APP_API_URL = "http://localhost:$BackendPort"
npm start
pause
"@
        
        $frontendScriptPath = Join-Path $env:TEMP "start-frontend.ps1"
        $frontendScript | Out-File -FilePath $frontendScriptPath -Encoding UTF8
        
        Start-Process powershell.exe -ArgumentList "-NoExit", "-File", $frontendScriptPath -WindowStyle Normal
        
        Write-Host "OK Frontend starting..." -ForegroundColor Green
        Write-Host "  URL: http://localhost:$FrontendPort" -ForegroundColor Gray
        Write-Host "  (This may take 30-60 seconds to compile)" -ForegroundColor Gray
    }
    
    Write-Host ""
}

# Start .NET Client
if ($DotNetClient) {
    Write-Host "Starting .NET Client..." -ForegroundColor Cyan
    Write-Host "======================" -ForegroundColor Cyan
    
    $clientPath = Join-Path $rootDir "TradePulse.Client\TradePulse.Client.WPF"
    if (-not (Test-Path $clientPath)) {
        Write-Host "X .NET client directory not found: $clientPath" -ForegroundColor Red
        Write-Host "  Run build-dotnet.ps1 first to build the client" -ForegroundColor Yellow
    } else {
        # Check if client is built
        $exePath = Join-Path $clientPath "bin\Debug\net8.0-windows\TradePulse.exe"
        if (-not (Test-Path $exePath)) {
            $exePath = Join-Path $clientPath "bin\Release\net8.0-windows\TradePulse.exe"
        }
        
        if (Test-Path $exePath) {
            Start-Process $exePath
            Write-Host "OK .NET client starting..." -ForegroundColor Green
        } else {
            Write-Host "X .NET client executable not found!" -ForegroundColor Red
            Write-Host "  Run build-dotnet.ps1 first to build the client" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
}

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  System Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not $FrontendOnly) {
    Write-Host "Backend:  http://localhost:$BackendPort" -ForegroundColor White
}

if (-not $BackendOnly) {
    Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor White
}

if ($DotNetClient) {
    Write-Host ".NET Client: Running" -ForegroundColor White
}

Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Close the PowerShell windows to stop the services" -ForegroundColor Gray
Write-Host ""

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 10
    }
} catch {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Yellow
}
