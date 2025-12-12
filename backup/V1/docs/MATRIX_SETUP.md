# Matrix Federation Setup Guide

This guide explains how to set up Matrix federation for TradePulse to enable load distribution and resilience across multiple servers.

## Overview

Matrix federation allows multiple TradePulse servers to communicate with each other, providing:
- **Load Distribution**: Spread users across multiple servers
- **Resilience**: If one server fails, others continue operating
- **Scalability**: Add more servers as user base grows
- **Geographic Distribution**: Deploy servers in different regions

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TradePulse    │    │   TradePulse    │    │   TradePulse    │
│   Server 1      │◄──►│   Server 2      │◄──►│   Server 3      │
│   (Primary)     │    │   (Secondary)   │    │   (Secondary)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Matrix Server  │    │  Matrix Server  │    │  Matrix Server  │
│  (trading-1)    │◄──►│  (trading-2)    │◄──►│  (trading-3)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- PostgreSQL 13+
- Redis 6+

## Quick Start

### 1. Start Matrix Services

```bash
# Start Matrix homeserver and supporting services
docker-compose -f docker-compose.matrix.yml up -d

# Check status
docker-compose -f docker-compose.matrix.yml ps
```

### 2. Configure Environment

```bash
# Copy environment template
cp env.example .env

# Edit .env file
nano .env
```

Set these Matrix variables:
```env
MATRIX_ENABLED=true
MATRIX_SERVER_URL=http://localhost:8008
MATRIX_FEDERATION_ENABLED=true
MATRIX_FEDERATION_SERVERS=http://trading-intercom-2.local:8008,http://trading-intercom-3.local:8008
MATRIX_APPSERVICE_ENABLED=true
MATRIX_APPSERVICE_URL=http://localhost:9000
MATRIX_APPSERVICE_TOKEN=trading-intercom-token
```

### 3. Start TradePulse Server

```bash
# Install dependencies
npm install

# Start server
npm start
```

### 4. Test Integration

```bash
# Run Matrix integration tests
node scripts/test-matrix-integration.js
```

## Manual Setup

### 1. Install Matrix Synapse

```bash
# Create virtual environment
python3 -m venv matrix-env
source matrix-env/bin/activate

# Install Synapse
pip install matrix-synapse[all]

# Generate configuration
python -m synapse.app.homeserver --server-name trading-intercom.local --config-path homeserver.yaml --generate-config
```

### 2. Configure Synapse

Edit `homeserver.yaml`:

```yaml
server_name: "trading-intercom.local"
public_baseurl: "https://trading-intercom.local:8448"

listeners:
  - port: 8008
    tls: false
    type: http
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client, federation]
        compress: false

database:
  name: sqlite3
  args:
    database: /path/to/homeserver.db

federation_domain_whitelist:
  - "trading-intercom.local"
  - "trading-intercom-2.local"
  - "trading-intercom-3.local"

registration_shared_secret: "trading-intercom-registration-secret"

app_service_config_files:
  - "trading-intercom-appservice.yaml"
```

### 3. Start Synapse

```bash
# Start Synapse
synctl start

# Check status
synctl status
```

## Federation Configuration

### 1. Server Discovery

Each server needs to be discoverable by others:

```yaml
# In homeserver.yaml
federation_domain_whitelist:
  - "trading-intercom.local"
  - "trading-intercom-2.local"
  - "trading-intercom-3.local"
```

### 2. DNS Configuration

Set up DNS records for each server:

```
# A records
trading-intercom.local        A   192.168.1.100
trading-intercom-2.local      A   192.168.1.101
trading-intercom-3.local      A   192.168.1.102

# SRV records for federation
_matrix._tcp.trading-intercom.local     SRV 10 0 8448 trading-intercom.local
_matrix._tcp.trading-intercom-2.local   SRV 10 0 8448 trading-intercom-2.local
_matrix._tcp.trading-intercom-3.local   SRV 10 0 8448 trading-intercom-3.local
```

### 3. SSL/TLS Certificates

Each server needs valid SSL certificates:

```bash
# Generate self-signed certificates for testing
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=trading-intercom.local"
```

## App Service Integration

### 1. App Service Configuration

Create `trading-intercom-appservice.yaml`:

```yaml
id: "trading-intercom"
url: "http://localhost:9000"
as_token: "trading-intercom-token"
hs_token: "trading-intercom-homeserver-token"

namespaces:
  users:
    - regex: "@trading-intercom_.*"
      exclusive: true
  rooms:
    - regex: "#trading-group-.*"
      exclusive: true
    - regex: "#trading-broadcast-.*"
      exclusive: true
    - regex: "#trading-private-.*"
      exclusive: true
```

### 2. Start App Service

```bash
# Start TradePulse server (includes AppService)
npm start
```

## Testing Federation

### 1. Create Test Users

```bash
# On server 1
register_new_matrix_user -c homeserver.yaml http://localhost:8008

# On server 2
register_new_matrix_user -c homeserver2.yaml http://localhost:8009
```

### 2. Test Cross-Server Communication

```bash
# Run integration tests
node scripts/test-matrix-integration.js
```

### 3. Monitor Federation

```bash
# Check federation status
curl http://localhost:5000/api/matrix/status
```

## Scaling Configuration

### 1. Load Balancing

Use nginx or HAProxy to distribute load:

```nginx
upstream trading_intercom {
    server trading-intercom-1.local:5000;
    server trading-intercom-2.local:5000;
    server trading-intercom-3.local:5000;
}

server {
    listen 80;
    location / {
        proxy_pass http://trading_intercom;
    }
}
```

### 2. Database Clustering

Configure PostgreSQL replication:

```yaml
# Master database
postgres_master:
  image: postgres:13
  environment:
    POSTGRES_REPLICATION_MODE: master
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: replicator_password

# Slave databases
postgres_slave:
  image: postgres:13
  environment:
    POSTGRES_REPLICATION_MODE: slave
    POSTGRES_MASTER_HOST: postgres_master
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: replicator_password
```

### 3. Redis Clustering

Set up Redis cluster:

```yaml
redis_cluster:
  image: redis:6-alpine
  command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000
  ports:
    - "7000-7005:7000-7005"
```

## Monitoring and Maintenance

### 1. Health Checks

```bash
# Check server health
curl http://localhost:5000/health

# Check Matrix status
curl http://localhost:5000/api/matrix/status
```

### 2. Log Monitoring

```bash
# View Matrix logs
docker-compose -f docker-compose.matrix.yml logs -f synapse

# View TradePulse logs
npm run logs
```

### 3. Performance Monitoring

Monitor key metrics:
- Matrix room count
- Active user count
- Federation connection status
- Database performance
- Redis memory usage

## Troubleshooting

### Common Issues

1. **Federation not working**
   - Check DNS resolution
   - Verify SSL certificates
   - Check firewall settings

2. **App Service not connecting**
   - Verify tokens match
   - Check network connectivity
   - Review app service logs

3. **Database connection issues**
   - Check PostgreSQL status
   - Verify connection strings
   - Review database logs

### Debug Commands

```bash
# Test Matrix federation
curl -X GET "http://localhost:8008/_matrix/federation/v1/version"

# Check app service registration
curl -X GET "http://localhost:8008/_matrix/client/r0/appservice/registration"

# Test user creation
curl -X POST "http://localhost:8008/_matrix/client/r0/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass","auth":{"type":"m.login.dummy"}}'
```

## Security Considerations

1. **Use strong passwords** for all services
2. **Enable SSL/TLS** for all communications
3. **Restrict network access** to federation ports
4. **Regular security updates** for all components
5. **Monitor access logs** for suspicious activity

## Next Steps

1. Set up monitoring and alerting
2. Configure automated backups
3. Implement disaster recovery procedures
4. Set up CI/CD for deployments
5. Plan for geographic distribution
