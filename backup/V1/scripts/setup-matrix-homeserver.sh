#!/bin/bash

# Matrix Homeserver Setup Script for TradePulse
# This script sets up a Matrix Synapse homeserver for federation

set -e

echo "Setting up Matrix Homeserver for TradePulse..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3 first."
    exit 1
fi

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv matrix-env
source matrix-env/bin/activate

# Install Synapse
echo "Installing Matrix Synapse..."
pip install --upgrade pip
pip install matrix-synapse[all]

# Generate configuration
echo "Generating Synapse configuration..."
python -m synapse.app.homeserver --server-name trading-intercom.local --config-path homeserver.yaml --generate-config --report-stats=no

# Update configuration with our settings
echo "Updating configuration..."
cat >> homeserver.yaml << EOF

# TradePulse specific configuration
server_name: "trading-intercom.local"
public_baseurl: "https://trading-intercom.local:8448"
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client, federation]
        compress: false

# Database configuration
database:
  name: sqlite3
  args:
    database: /path/to/homeserver.db

# Federation
federation_domain_whitelist:
  - "trading-intercom.local"
  - "trading-intercom-2.local"
  - "trading-intercom-3.local"

# Registration
registration_shared_secret: "trading-intercom-registration-secret"

# App service
app_service_config_files:
  - "trading-intercom-appservice.yaml"

# Logging
log_config: "logging.yaml"

# Media
media_store_path: "/path/to/media"

# User directory
user_directory:
  enabled: true
  search_all_users: true

# Rate limiting
rc_message:
  per_second: 0.2
  burst_count: 10

rc_registration:
  per_second: 0.17
  burst_count: 3

rc_login:
  address:
    per_second: 0.17
    burst_count: 3
  account:
    per_second: 0.17
    burst_count: 3
  failed_attempts:
    per_second: 0.17
    burst_count: 3
EOF

echo "Matrix Homeserver setup complete!"
echo "To start the homeserver, run:"
echo "  source matrix-env/bin/activate"
echo "  synctl start"
echo ""
echo "To create a user, run:"
echo "  register_new_matrix_user -c homeserver.yaml http://localhost:8008"
