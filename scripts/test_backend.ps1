# Direct Trader Communications - Backend Testing Script (PowerShell)
# This script starts the backend API server for testing

Write-Host "🐍 Testing Backend API..." -ForegroundColor Green
Write-Host ""

# Navigate to backend directory
Set-Location "Backend\API"

# Activate virtual environment
Write-Host "📦 Activating Python virtual environment..." -ForegroundColor Yellow
& "venv\Scripts\Activate.ps1"

# Start the API server
Write-Host "🚀 Starting backend API server..." -ForegroundColor Green
Write-Host "   API will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   Health check: http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "   API docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the server
python main.py
