#!/bin/bash

echo "Setting up Trading Intercom System on Linux..."
echo

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Warning: Running as root"
    echo "Consider running as a regular user for security"
    echo
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use your package manager:"
    echo "  Ubuntu/Debian: sudo apt-get install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    echo "  Arch: sudo pacman -S nodejs npm"
    echo "Recommended version: Node.js 18 or higher"
    exit 1
fi

echo "Node.js version:"
node --version
echo

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not available"
    echo "Please reinstall Node.js with npm"
    exit 1
fi

echo "npm version:"
npm --version
echo

# Install Redis
if ! command -v redis-server &> /dev/null; then
    echo "Installing Redis..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y redis-server
    elif command -v yum &> /dev/null; then
        sudo yum install -y redis
    elif command -v pacman &> /dev/null; then
        sudo pacman -S redis
    elif command -v brew &> /dev/null; then
        brew install redis
    else
        echo "Please install Redis manually from https://redis.io/download"
        echo "Continuing without Redis..."
    fi
else
    echo "Redis version:"
    redis-server --version
    echo
fi

# Start Redis service
if command -v systemctl &> /dev/null; then
    echo "Starting Redis service..."
    sudo systemctl start redis
    sudo systemctl enable redis
elif command -v service &> /dev/null; then
    echo "Starting Redis service..."
    sudo service redis start
fi

# Create necessary directories
echo "Creating directories..."
mkdir -p recordings compliance keys logs
echo "Directories created."
echo

# Install dependencies
echo "Installing dependencies..."
./scripts/install-dependencies.sh
if [ $? -ne 0 ]; then
    echo "Error: Failed to install dependencies"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f "server/.env" ]; then
    echo "Creating .env file..."
    cp "env.example" "server/.env"
    echo
    echo "IMPORTANT: Please edit server/.env file with your configuration"
    echo
fi

# Set up systemd service (optional)
if command -v systemctl &> /dev/null; then
    echo "Setting up systemd service..."
    sudo tee /etc/systemd/system/trading-intercom.service > /dev/null <<EOF
[Unit]
Description=Trading Intercom System
After=network.target redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    echo "Systemd service created. Use 'sudo systemctl start trading-intercom' to start"
    echo
fi

# Set up firewall rules (if ufw is available)
if command -v ufw &> /dev/null; then
    echo "Setting up firewall rules..."
    sudo ufw allow 3000/tcp comment "Trading Intercom Frontend"
    sudo ufw allow 3001/tcp comment "Trading Intercom Backend"
    sudo ufw allow 3002/tcp comment "Trading Intercom Federation"
    echo "Firewall rules added."
    echo
fi

# Create desktop shortcut
if [ -d "$HOME/Desktop" ]; then
    echo "Creating desktop shortcut..."
    cat > "$HOME/Desktop/trading-intercom.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Trading Intercom
Comment=Trading Intercom System
Exec=xdg-open http://localhost:3000
Icon=$PWD/client/public/favicon.ico
Terminal=false
Categories=Network;
EOF
    chmod +x "$HOME/Desktop/trading-intercom.desktop"
    echo "Desktop shortcut created."
    echo
fi

echo "Setup completed successfully!"
echo
echo "Next steps:"
echo "1. Edit server/.env file with your configuration"
echo "2. Start the system with: ./scripts/start-dev.sh"
echo "3. Open http://localhost:3000 in your browser"
echo
echo "Default users:"
echo "- Admin: username=admin, password=admin123"
echo "- Trader: username=trader, password=password"
echo
echo "To start as a service:"
echo "  sudo systemctl start trading-intercom"
echo "  sudo systemctl enable trading-intercom"
echo
