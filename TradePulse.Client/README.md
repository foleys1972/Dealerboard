# TradePulse .NET Client

.NET 8 WPF desktop client for TradePulse intercom system.

## Project Structure

```
TradePulse.Client/
├── TradePulse.Client.Core/          # Core business logic
│   ├── Models/                     # Data models
│   └── Services/                   # Business services
├── TradePulse.Client.WPF/          # WPF UI application
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

```bash
cd TradePulse.Client
dotnet restore
dotnet build
```

## Running

```bash
cd TradePulse.Client.WPF
dotnet run
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

