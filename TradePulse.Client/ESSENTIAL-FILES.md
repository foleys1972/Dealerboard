# Essential Files to Run TradePulse.exe

## Quick Reference

To run `TradePulse.exe`, you need all files in:
```
TradePulse.Client.WPF\bin\Release\net8.0-windows\
```

**Essential file types:**
- ✅ `TradePulse.exe` - Main executable
- ✅ `*.dll` - All DLL files (dependencies)
- ✅ `*.json` - Configuration files (appsettings.json, *.deps.json, *.runtimeconfig.json)
- ✅ `icon.ico` - Application icon
- ✅ `runtimes/` folder - Native runtime libraries (if present)

**NOT needed:**
- ❌ `*.pdb` - Debug symbols (moved to temp folder)
- ❌ `*.cache` - Build cache (moved to temp folder)
- ❌ `obj/` folder - Build intermediates (moved to temp folder)

## File List

After running `organize-build-files.ps1`, the build output contains:

### Core Application (3 files)
- `TradePulse.exe` (584 KB)
- `TradePulse.dll` (495 KB)
- `TradePulse.Client.Core.dll` (95 KB)

### Configuration Files (3 files)
- `appsettings.json` (141 bytes)
- `TradePulse.deps.json` (135 KB)
- `TradePulse.runtimeconfig.json` (458 bytes)

### Icon
- `icon.ico` (432 KB)

### Dependency DLLs (~50+ files)
All DLLs from:
- Material Design libraries
- Socket.IO client
- NAudio
- Microsoft.Extensions.*
- CommunityToolkit.Mvvm
- .NET runtime libraries

**Total essential files: ~60+ files**
**Total size: ~15-20 MB** (approximate, excluding .NET runtime if framework-dependent)

## Distribution

To distribute to another machine:

1. **Option 1: Framework-Dependent** (requires .NET 8.0 Runtime)
   - Copy entire `bin\Release\net8.0-windows\` folder
   - User must install .NET 8.0 Runtime

2. **Option 2: Self-Contained** (includes .NET runtime)
   ```powershell
   dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false
   ```
   - Larger file size (~80-100 MB)
   - No .NET runtime installation required

## Running the Application

```powershell
cd TradePulse.Client.WPF\bin\Release\net8.0-windows
.\TradePulse.exe
```

Or from project root:
```powershell
.\TradePulse.Client.WPF\bin\Release\net8.0-windows\TradePulse.exe
```

