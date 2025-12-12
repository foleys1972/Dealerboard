#!/bin/bash

echo "Installing Trading Intercom System Dependencies..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js version:"
node --version
echo

# Install backend dependencies
echo "Installing backend dependencies..."
cd server
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install backend dependencies"
    exit 1
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd ../client
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install frontend dependencies"
    exit 1
fi

echo
echo "Dependencies installed successfully!"
echo
echo "Next steps:"
echo "1. Configure your .env file in the server directory"
echo "2. Start Redis server (if using Redis)"
echo "3. Run ./scripts/start-dev.sh to start the system"
echo
