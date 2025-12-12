#!/bin/bash

echo "========================================"
echo "Generating SSL Certificates for Development"
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if mkcert exists
if command -v mkcert &> /dev/null; then
    echo "[INFO] Found mkcert"
    MKCERT="mkcert"
elif [ -f "$PROJECT_DIR/mkcert" ]; then
    echo "[INFO] Found mkcert in project root"
    MKCERT="$PROJECT_DIR/mkcert"
    chmod +x "$MKCERT"
else
    echo "[ERROR] mkcert not found"
    echo "Please install mkcert:"
    echo "  macOS: brew install mkcert"
    echo "  Linux: See https://github.com/FiloSottile/mkcert#installation"
    echo "Or download from: https://github.com/FiloSottile/mkcert/releases"
    exit 1
fi

# Install local CA if not already installed
echo "[INFO] Installing local CA..."
$MKCERT -install 2>/dev/null || echo "[WARN] Local CA may already be installed"

# Generate certificates for localhost and local IP in project root
echo "[INFO] Generating certificates in project root..."
cd "$PROJECT_DIR"

$MKCERT -key-file dev-key.pem -cert-file dev-cert.pem localhost 127.0.0.1 ::1 192.168.1.41

if [ $? -eq 0 ]; then
    echo
    echo "========================================"
    echo "SSL Certificates Generated Successfully!"
    echo "========================================"
    echo
    echo "Files created in project root:"
    echo "  - $PROJECT_DIR/dev-cert.pem"
    echo "  - $PROJECT_DIR/dev-key.pem"
    echo
    echo "Certificates are valid for:"
    echo "  - localhost"
    echo "  - 127.0.0.1"
    echo "  - ::1 (IPv6 localhost)"
    echo "  - 192.168.1.41"
    echo
    echo "Server will now use HTTPS when these files are present."
    echo
else
    echo "[ERROR] Failed to generate certificates"
    exit 1
fi

