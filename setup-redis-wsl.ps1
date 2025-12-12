# Setup Redis in WSL Ubuntu
# Run this script after Ubuntu is installed and configured

Write-Host "Setting up Redis in WSL Ubuntu..." -ForegroundColor Cyan

# Check if Ubuntu is installed
$ubuntuInstalled = wsl -l -v | Select-String "Ubuntu"
if (-not $ubuntuInstalled) {
    Write-Host "Ubuntu is not installed. Installing..." -ForegroundColor Yellow
    wsl --install Ubuntu --web-download
    Write-Host "Please complete Ubuntu setup (create username/password), then run this script again." -ForegroundColor Yellow
    exit
}

Write-Host "Installing Redis in Ubuntu..." -ForegroundColor Green

# Install Redis in WSL
wsl -d Ubuntu -e bash -c "sudo apt-get update && sudo apt-get install -y redis-server"

# Configure Redis to listen on all interfaces (so Windows can connect)
Write-Host "Configuring Redis to listen on all interfaces..." -ForegroundColor Green
wsl -d Ubuntu -e bash -c "sudo sed -i 's/bind 127.0.0.1/bind 0.0.0.0/' /etc/redis/redis.conf"

# Start Redis service
Write-Host "Starting Redis service..." -ForegroundColor Green
wsl -d Ubuntu -e bash -c "sudo service redis-server start"

# Set Redis to start automatically
wsl -d Ubuntu -e bash -c "sudo systemctl enable redis-server"

# Get WSL IP address (needed for Windows to connect)
$wslIp = wsl -d Ubuntu -e hostname -I | ForEach-Object { $_.Trim().Split()[0] }
Write-Host "WSL IP Address: $wslIp" -ForegroundColor Cyan

# Test Redis connection
Write-Host "Testing Redis connection..." -ForegroundColor Green
$testResult = wsl -d Ubuntu -e redis-cli ping
if ($testResult -eq "PONG") {
    Write-Host "✅ Redis is running successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Update your .env file with:" -ForegroundColor Yellow
    Write-Host "REDIS_HOST=$wslIp" -ForegroundColor White
    Write-Host "REDIS_PORT=6379" -ForegroundColor White
} else {
    Write-Host "❌ Redis test failed. Please check the installation." -ForegroundColor Red
}

Write-Host ""
Write-Host "Note: WSL IP may change on reboot. To make it permanent, consider:" -ForegroundColor Yellow
Write-Host "1. Using port forwarding from Windows to WSL" -ForegroundColor White
Write-Host "2. Installing Memurai (Windows-native Redis) instead" -ForegroundColor White

