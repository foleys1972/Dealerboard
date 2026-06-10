# TradePulse .NET Client

.NET 8 WPF desktop client for TradePulse intercom system.

## Project Structure

```
TradePulse.Client/
├── TradePulse.Client.Core/          # Core business logic
│   ├── Models/                     # Data models
│   └── Services/                   # Business services
├── TradePulse.Client.WPF/          # WPF UI application (Intercom Client)
│   ├── Views/                      # XAML views
│   └── ViewModels/                 # MVVM view models
├── TradePulse.Dealerboard.Client/  # WPF UI application (Dealerboard Client)
│   ├── Views/                      # XAML views
│   └── ViewModels/                 # MVVM view models
└── TradePulse.Client.Tests/        # Unit tests
```

## Features

### Phase 1: Intercom-Only (Current)
- ✅ Audio calls (1-to-1, hunt groups, conferences)
- ✅ Socket.IO real-time communication
- ✅ NAudio audio capture/playback
- ✅ User authentication
- ✅ Basic WPF UI

### Phase 2: Planned
- ⏳ Video support
- ⏳ Screen sharing
- ⏳ Advanced UI features

## Prerequisites

- .NET 8 SDK
- Visual Studio 2022 or VS Code
- Windows 10/11 (for WPF)

## Building

### Intercom Client

```bash
cd TradePulse.Client
dotnet restore
dotnet build
```

### Dealerboard Client

#### Quick Build (Development)
```bash
build-dealerboard-quick.bat
```
Builds the project without publishing (faster, requires .NET Runtime installed).

#### Debug Build
```bash
build-dealerboard-debug.bat
```
Builds a debug version with all dependencies (requires .NET Runtime installed).

#### Release Build (Self-Contained Executable)
```bash
build-dealerboard.bat
```
Builds a self-contained executable that includes the .NET Runtime. This creates a standalone `TradePulseDealerboard.exe` file that can run on any Windows machine without requiring .NET to be installed.

The executable will be created in: `bin\DealerboardRelease\TradePulseDealerboard.exe`

## Running

### Intercom Client
```bash
cd TradePulse.Client.WPF
dotnet run
```

### Dealerboard Client
```bash
cd TradePulse.Dealerboard.Client
dotnet run
```

Or run the executable directly:
```bash
bin\DealerboardRelease\TradePulseDealerboard.exe
```

## Configuration

Update the server URL in `App.xaml.cs`:
```csharp
client.BaseAddress = new Uri("http://localhost:5000");
```

Or configure via appsettings.json (to be added).

## Dependencies

- **SocketIOClient** - Socket.IO client for .NET
- **NAudio** - Audio capture and playback
- **CommunityToolkit.Mvvm** - MVVM helpers
- **MaterialDesignThemes** - Material Design UI

## Architecture

### Services
- `ISocketService` - Socket.IO communication
- `IAudioService` - Audio capture/playback
- `ICallService` - Call management
- `IAuthService` - Authentication

### Models
- `User` - User information
- `Call` - Call state and metadata
- `Group` - Hunt/conference groups
- `Favorite` - User favorites
- `IptvStream` - IPTV stream configuration

## Next Steps

1. Complete WPF UI implementation
2. Add audio routing between Socket.IO and NAudio
3. Implement call state management
4. Add favorites and contacts management
5. Add IPTV stream support

