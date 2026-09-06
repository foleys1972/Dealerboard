# Manual Redis Setup Options

## Option 1: Memurai (Recommended - Windows Native)

Memurai is a Windows-native Redis-compatible server. The automatic installation failed, so here's how to install it manually:

### Steps:
1. **Download Memurai Developer Edition:**
   - Visit: https://www.memurai.com/get-memurai
   - Download the Windows installer (MSI)

2. **Install Memurai:**
   - Run the downloaded `.msi` file
   - Follow the installation wizard
   - Choose "Install as Windows Service" (recommended)
   - Complete the installation

3. **Verify Installation:**
   ```powershell
   # Check if Memurai service is running
   Get-Service MemuraiDeveloper
   
   # Check if port 6379 is listening
   netstat -ano | findstr 6379
   ```

4. **Update .env:**
   ```
   REDIS_ENABLED=true
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

## Option 2: Redis via WSL (Linux)

We've installed Ubuntu in WSL. To complete Redis setup:

### Steps:
1. **Complete Ubuntu Setup:**
   ```powershell
   wsl -d Ubuntu
   ```
   - Create a username and password when prompted
   - Exit: `exit`

2. **Run the setup script:**
   ```powershell
   cd C:\Projects\intercom
   .\setup-redis-wsl.ps1
   ```

3. **Get WSL IP and update .env:**
   ```powershell
   # Get WSL IP
   wsl -d Ubuntu -e hostname -I
   ```
   
   Update `.env`:
   ```
   REDIS_ENABLED=true
   REDIS_HOST=<WSL_IP_ADDRESS>
   REDIS_PORT=6379
   ```

   **Note:** WSL IP changes on reboot. To fix this, set up port forwarding or use `localhost` with port forwarding.

## Option 3: Docker (Alternative)

If you have Docker Desktop installed:

```powershell
docker run -d -p 6379:6379 --name redis redis:latest
```

Then use in `.env`:
```
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Recommended: Memurai

For production-like testing, **Memurai** is recommended because:
- ✅ Native Windows service
- ✅ No IP address issues
- ✅ Better performance
- ✅ Easier to manage

After installing any option, restart your server:
```powershell
cd C:\Projects\intercom
npm run dev
```

