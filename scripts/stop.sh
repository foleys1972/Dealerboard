#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESSES_FILE="$SCRIPT_DIR/.processes.txt"

echo "========================================"
echo "Stopping Trading Intercom System"
echo "========================================"
echo

STOPPED=0

# Check if processes file exists
if [ -f "$PROCESSES_FILE" ]; then
    echo "[INFO] Reading process information..."
    cat "$PROCESSES_FILE"
    echo
    
    # Extract PIDs from file
    BACKEND_PID=$(grep "Backend PID:" "$PROCESSES_FILE" | awk '{print $3}')
    FRONTEND_PID=$(grep "Frontend PID:" "$PROCESSES_FILE" | awk '{print $3}')
else
    echo "[INFO] No processes file found. Attempting to stop by process name..."
    BACKEND_PID=""
    FRONTEND_PID=""
fi

# Stop backend
if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[INFO] Stopping backend server (PID: $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null
    sleep 1
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[OK] Backend stopped"
        STOPPED=$((STOPPED + 1))
    else
        echo "[WARN] Backend did not stop, forcing termination..."
        kill -9 "$BACKEND_PID" 2>/dev/null
        STOPPED=$((STOPPED + 1))
    fi
else
    # Try to find and stop by process name
    BACKEND_PIDS=$(pgrep -f "server/index.js" 2>/dev/null)
    if [ -n "$BACKEND_PIDS" ]; then
        echo "[INFO] Found backend processes: $BACKEND_PIDS"
        for pid in $BACKEND_PIDS; do
            kill "$pid" 2>/dev/null
            STOPPED=$((STOPPED + 1))
        done
        echo "[OK] Backend stopped"
    else
        echo "[WARN] Backend process not found or already stopped"
    fi
fi

# Stop frontend
if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "[INFO] Stopping frontend (PID: $FRONTEND_PID)..."
    kill "$FRONTEND_PID" 2>/dev/null
    sleep 1
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "[OK] Frontend stopped"
        STOPPED=$((STOPPED + 1))
    else
        echo "[WARN] Frontend did not stop, forcing termination..."
        kill -9 "$FRONTEND_PID" 2>/dev/null
        STOPPED=$((STOPPED + 1))
    fi
else
    # Try to find and stop React dev server
    FRONTEND_PIDS=$(pgrep -f "react-scripts start" 2>/dev/null)
    if [ -n "$FRONTEND_PIDS" ]; then
        echo "[INFO] Found frontend processes: $FRONTEND_PIDS"
        for pid in $FRONTEND_PIDS; do
            kill "$pid" 2>/dev/null
            STOPPED=$((STOPPED + 1))
        done
        echo "[OK] Frontend stopped"
    else
        echo "[WARN] Frontend process not found or already stopped"
    fi
fi

# Clean up process files
if [ -f "$PROCESSES_FILE" ]; then
    rm -f "$PROCESSES_FILE"
    echo "[OK] Cleaned up process files"
fi

echo
if [ $STOPPED -gt 0 ]; then
    echo "========================================"
    echo "System Stopped Successfully!"
    echo "========================================"
    echo "Stopped $STOPPED process(es)"
else
    echo "========================================"
    echo "No Running Processes Found"
    echo "========================================"
    echo "The system appears to be already stopped."
fi
echo
