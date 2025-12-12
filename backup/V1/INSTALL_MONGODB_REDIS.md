# MongoDB & Redis Installation Guide for Windows

## Quick Install Commands

### Option 1: Using winget (Recommended - Fastest)
```powershell
# Install MongoDB Community Server
winget install MongoDB.MongoDBServer

# Install Memurai (Redis for Windows)
winget install Memurai.MemuraiDeveloper
```

### Option 2: Manual Installation

#### MongoDB
1. Download MongoDB Community Server: https://www.mongodb.com/try/download/community
2. Run the installer
3. Choose "Complete" installation
4. Install as a Windows Service (default)

#### Redis (Memurai)
1. Download Memurai: https://www.memurai.com/get-memurai
2. Run the installer
3. Install as a Windows Service (default)

## After Installation

### Start Services

```powershell
# Start MongoDB
net start MongoDB

# Start Memurai (Redis)
net start MemuraiDeveloper
```

### Verify Services Are Running

```powershell
# Check MongoDB (should show port 27017)
netstat -ano | findstr 27017

# Check Redis/Memurai (should show port 6379)
netstat -ano | findstr 6379
```

### Update .env File

Update `C:\Projects\intercom\.env`:
```
MONGODB_ENABLED=true
MONGODB_URI=mongodb://localhost:27017/trading-intercom

REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Troubleshooting

### MongoDB Not Starting
```powershell
# Check MongoDB service status
Get-Service MongoDB

# View MongoDB logs
Get-Content "C:\Program Files\MongoDB\Server\*\log\mongod.log" -Tail 50
```

### Redis/Memurai Not Starting
```powershell
# Check Memurai service status
Get-Service MemuraiDeveloper

# Start manually if needed
net start MemuraiDeveloper
```

### Port Already in Use
If ports are already in use:
```powershell
# Find process using port 27017
netstat -ano | findstr 27017

# Find process using port 6379
netstat -ano | findstr 6379

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

## Testing Connection

After starting services, restart your server:
```powershell
cd C:\Projects\intercom
npm run dev
```

You should see:
- ✅ `Connected to MongoDB database`
- ✅ `Redis connected`
- ❌ No more "MongoDB disabled" or "Redis connection closed" warnings

