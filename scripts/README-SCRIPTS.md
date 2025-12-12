# TradePulse PowerShell Scripts

This directory contains PowerShell scripts for building and managing the TradePulse system.

## Available Scripts

### Build Scripts

#### `build-dotnet.ps1`
Builds the .NET WPF client application.

**Usage:**
```powershell
# Build in Release mode (default)
.\scripts\build-dotnet.ps1

# Build in Debug mode
.\scripts\build-dotnet.ps1 -Configuration Debug

# Clean and rebuild
.\scripts\build-dotnet.ps1 -Clean

# Build and run tests
.\scripts\build-dotnet.ps1 -Test

# All options
.\scripts\build-dotnet.ps1 -Configuration Release -Clean -Test
```

**Parameters:**
- `-Configuration` - Build configuration (Debug/Release, default: Release)
- `-Clean` - Clean before building
- `-Restore` - Restore NuGet packages (default: true)
- `-Test` - Run tests after building

**Output:**
- Builds all projects in the solution
- Output location: `TradePulse.Client\TradePulse.Client.WPF\bin\{Configuration}\net8.0-windows\`

---

### System Management Scripts

#### `start-system.ps1`
Starts both the React frontend and Node.js backend servers.

**Usage:**
```powershell
# Start both frontend and backend
.\scripts\start-system.ps1

# Start only backend
.\scripts\start-system.ps1 -BackendOnly

# Start only frontend
.\scripts\start-system.ps1 -FrontendOnly

# Start with .NET client
.\scripts\start-system.ps1 -DotNetClient

# Custom ports
.\scripts\start-system.ps1 -BackendPort 5000 -FrontendPort 3000
```

**Parameters:**
- `-BackendOnly` - Start only the backend server
- `-FrontendOnly` - Start only the frontend server
- `-DotNetClient` - Also start the .NET WPF client
- `-BackendPort` - Backend server port (default: 5000)
- `-FrontendPort` - Frontend server port (default: 3000)

**Features:**
- Checks prerequisites (Node.js, .NET SDK)
- Checks if ports are already in use
- Installs dependencies if needed
- Waits for services to be ready
- Opens services in separate windows

**Service URLs:**
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

---

#### `stop-system.ps1`
Stops all running TradePulse processes.

**Usage:**
```powershell
.\scripts\stop-system.ps1
```

**What it does:**
- Stops all Node.js processes (backend/frontend)
- Stops React development server
- Stops .NET client processes
- Cleans up processes on common ports (3000, 5000, etc.)

---

## Quick Start

### 1. Build .NET Client
```powershell
cd C:\Projects\intercom
.\scripts\build-dotnet.ps1
```

### 2. Start System
```powershell
# Start everything
.\scripts\start-system.ps1 -DotNetClient

# Or start separately
.\scripts\start-system.ps1 -BackendOnly
.\scripts\start-system.ps1 -FrontendOnly
.\scripts\start-system.ps1 -DotNetClient
```

### 3. Stop System
```powershell
.\scripts\stop-system.ps1
```

---

## Prerequisites

### For .NET Client
- .NET 8 SDK
- Visual Studio 2022 or VS Code (optional)

### For System Startup
- Node.js (v16 or higher)
- npm (comes with Node.js)

---

## Troubleshooting

### Build Issues

**Error: .NET SDK not found**
- Install .NET 8 SDK from https://dotnet.microsoft.com/download
- Verify with: `dotnet --version`

**Error: NuGet restore failed**
- Check internet connection
- Try: `dotnet nuget locals all --clear`
- Then: `dotnet restore`

**Error: Build failed**
- Check for compilation errors in output
- Try cleaning: `.\scripts\build-dotnet.ps1 -Clean`

### Startup Issues

**Error: Port already in use**
- Stop existing services: `.\scripts\stop-system.ps1`
- Or use different ports: `-BackendPort 5001 -FrontendPort 3001`

**Error: Node.js not found**
- Install Node.js from https://nodejs.org/
- Verify with: `node --version`

**Error: Dependencies not installed**
- The script will auto-install, but you can manually run:
  ```powershell
  cd client
  npm install
  ```

**Backend not starting**
- Check if MongoDB/Redis are required (may be optional)
- Check server logs in the backend window
- Verify .env file exists in server directory

**Frontend not compiling**
- Check for errors in the frontend window
- Try clearing cache: `cd client && npm start -- --reset-cache`
- Reinstall dependencies: `cd client && rm -rf node_modules && npm install`

---

## Examples

### Development Workflow

```powershell
# 1. Build .NET client
.\scripts\build-dotnet.ps1 -Configuration Debug

# 2. Start backend
.\scripts\start-system.ps1 -BackendOnly

# 3. Wait for backend to be ready, then start frontend
.\scripts\start-system.ps1 -FrontendOnly

# 4. Start .NET client
.\scripts\start-system.ps1 -DotNetClient
```

### Production Build

```powershell
# Build release version
.\scripts\build-dotnet.ps1 -Configuration Release -Clean

# Output will be in:
# TradePulse.Client\TradePulse.Client.WPF\bin\Release\net8.0-windows\
```

### Testing

```powershell
# Build and test
.\scripts\build-dotnet.ps1 -Test
```

---

## Notes

- Scripts use PowerShell 5.1+ (Windows 10/11)
- Services run in separate windows for easy monitoring
- Ports are checked before starting to avoid conflicts
- Dependencies are auto-installed if missing
- Scripts are idempotent (safe to run multiple times)

---

## Integration with CI/CD

These scripts can be used in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Build .NET Client
  run: .\scripts\build-dotnet.ps1 -Configuration Release

- name: Run Tests
  run: .\scripts\build-dotnet.ps1 -Test
```

---

## See Also

- `DOTNET_MIGRATION_PLAN.md` - Migration plan
- `QUICK_START.md` - Quick start guide
- `AUDIO_ROUTING.md` - Audio routing documentation

