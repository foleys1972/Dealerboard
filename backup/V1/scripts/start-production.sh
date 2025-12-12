#!/bin/bash

echo "Starting Trading Intercom System in Production Mode..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo "Error: Redis is not running"
    echo "Please start Redis server before running the application"
    echo "You can install Redis with:"
    echo "  Ubuntu/Debian: sudo apt-get install redis-server"
    echo "  macOS: brew install redis"
    echo "  Or download from https://redis.io/download"
    exit 1
fi

# Build frontend
echo "Building frontend..."
cd client
npm run build
if [ $? -ne 0 ]; then
    echo "Error: Failed to build frontend"
    exit 1
fi

# Start backend server
echo "Starting backend server..."
cd ../server
npm start &
BACKEND_PID=$!

echo
echo "Trading Intercom System is starting in production mode..."
echo
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo "Federation: ws://localhost:3002"
echo
echo "Press Ctrl+C to stop the service..."

# Function to cleanup on exit
cleanup() {
    echo
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    echo "Services stopped."
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for processes
wait
