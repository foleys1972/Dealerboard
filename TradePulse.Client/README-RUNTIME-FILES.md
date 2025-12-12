# TradePulse Runtime Files

## Files Required to Run the Executable

The following files are **essential** and must be present in the build output directory for the application to run:

### Core Application Files
- `TradePulse.exe` - Main executable (required)
- `TradePulse.Client.WPF.dll` - WPF application DLL (required)
- `TradePulse.Client.Core.dll` - Core library DLL (required)

### Configuration Files
- `appsettings.json` - Application configuration (required)
- `TradePulse.exe.config` - Application config (if present)
- `icon.ico` - Application icon (optional but recommended)

### Dependency DLLs
All `.dll` files in the output directory are required, including:
- Material Design libraries
- Socket.IO client libraries
- NAudio libraries
- .NET runtime libraries
- Microsoft.Extensions.* libraries
- CommunityToolkit.Mvvm
- And all other NuGet package dependencies

### Runtime Folders
- `runtimes/` folder (if present) - Contains native runtime libraries for different platforms

## Files NOT Required (Moved to temp folder)

The following files are **not needed** to run the application and can be moved to a temp folder:

- `*.pdb` - Debug symbol files (useful for debugging, but not required to run)
- `*.cache` - Build cache files
- `obj/` folder - Build intermediate files
- Source files (`.cs`, `.xaml`) - These are compiled into DLLs

## Running the Application

1. Build the application: `.\build-dotnet.ps1`
2. Organize files: `.\organize-build-files.ps1` (optional)
3. Run the executable: `TradePulse.Client.WPF\bin\Release\net8.0-windows\TradePulse.exe`

## Distribution

To distribute the application, you need to copy the entire `bin\Release\net8.0-windows` folder (after running organize-build-files.ps1 to remove non-essential files).

The user's machine must have:
- .NET 8.0 Runtime installed (unless you publish as self-contained)

Or you can publish as self-contained which includes the .NET runtime:
```
dotnet publish -c Release -r win-x64 --self-contained true
```

