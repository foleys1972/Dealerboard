#!/bin/bash

echo "Starting Trading Intercom System in Development Mode..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo "Warning: Redis is not running"
    echo "Please start Redis server before running the application"
    echo "You can install Redis with:"
    echo "  Ubuntu/Debian: sudo apt-get install redis-server"
    echo "  macOS: brew install redis"
    echo "  Or download from https://redis.io/download"
    echo
    echo "Starting without Redis (some features may not work)..."
    echo
fi

# Create .env file if it doesn't exist
if [ ! -f "server/.env" ]; then
    echo "Creating .env file from template..."
    cp "env.example" "server/.env"
    echo "Please edit server/.env file with your configuration"
    echo
fi

# Start backend server
echo "Starting backend server..."
cd server
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "Starting frontend..."
cd ../client
npm start &
FRONTEND_PID=$!

echo
echo "Trading Intercom System is starting..."
echo
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo "Federation: ws://localhost:3002"
echo
echo "Press Ctrl+C to stop all services..."

# Function to cleanup on exit
cleanup() {
    echo
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "Services stopped."
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for processes
wait
