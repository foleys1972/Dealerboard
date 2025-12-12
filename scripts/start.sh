#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROCESSES_FILE="$SCRIPT_DIR/.processes.txt"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "========================================"
echo "Starting Trading Intercom System"
echo "========================================"
echo

# Check if already running
if [ -f "$PROCESSES_FILE" ]; then
    echo "Warning: Processes file exists. System may already be running."
    echo "Use stop.sh to stop existing processes first."
    echo
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    rm -f "$PROCESSES_FILE"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Redis is running (optional)
if ! command -v redis-cli &> /dev/null || ! redis-cli ping &> /dev/null; then
    echo "[WARNING] Redis is not running (optional but recommended)"
    echo "Some features may not work without Redis"
    echo
fi

# Create .env file if it doesn't exist
if [ ! -f "$PROJECT_DIR/server/.env" ]; then
    echo "[INFO] Creating .env file from template..."
    if [ -f "$PROJECT_DIR/server/env.example" ]; then
        cp "$PROJECT_DIR/server/env.example" "$PROJECT_DIR/server/.env"
        echo "Please edit server/.env file with your configuration"
    fi
    echo
fi

# Start backend server
echo "[INFO] Starting backend server..."
cd "$PROJECT_DIR/server"
nohup node index.js > "$LOG_DIR/server.log" 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Verify backend is still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "[ERROR] Backend failed to start. Check logs/server.log for details."
    exit 1
fi

# Start frontend
echo "[INFO] Starting frontend..."
cd "$PROJECT_DIR/client"
nohup npm start > "$LOG_DIR/client.log" 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 2

# Save process info
cat > "$PROCESSES_FILE" << EOF
Backend PID: $BACKEND_PID
Frontend PID: $FRONTEND_PID
Started at: $(date)
EOF

echo
echo "========================================"
echo "System Started Successfully!"
echo "========================================"
echo
echo "Backend:  http://localhost:5000"
echo "Frontend: http://localhost:3000"
echo
echo "Process IDs:"
echo "  - Backend:  $BACKEND_PID"
echo "  - Frontend: $FRONTEND_PID"
echo
echo "Logs:"
echo "  - Server: $LOG_DIR/server.log"
echo "  - Client: $LOG_DIR/client.log"
echo
echo "To stop the system, run: ./scripts/stop.sh"
echo
