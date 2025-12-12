# TradePulse .NET Client - Quick Start

## Setup Instructions

### 1. Prerequisites
- Install [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 or VS Code with C# extension

### 2. Restore and Build

```powershell
cd TradePulse.Client
dotnet restore
dotnet build
```

### 3. Configure Server URL

Edit `TradePulse.Client.WPF/App.xaml.cs` and update the server URL:

```csharp
services.AddHttpClient<IAuthService, AuthService>(client =>
{
    client.BaseAddress = new Uri("http://localhost:5000"); // Change this
    client.Timeout = TimeSpan.FromSeconds(30);
});
```

### 4. Run the Application

```powershell
cd TradePulse.Client.WPF
dotnet run
```

Or open the solution in Visual Studio and press F5.

## Default Login

Use the same credentials as the React client:
- **Username:** `admin`
- **Password:** `TradePulse2025!`

## Project Structure

```
TradePulse.Client/
├── TradePulse.Client.Core/          # Core library
│   ├── Models/                      # Data models (User, Call, Group, etc.)
│   └── Services/                   # Business services
│       ├── SocketService.cs        # Socket.IO client
│       ├── AudioService.cs        # NAudio audio handling
│       ├── CallService.cs          # Call management
│       └── AuthService.cs          # Authentication
│
├── TradePulse.Client.WPF/          # WPF application
│   ├── Views/                      # XAML UI
│   │   ├── LoginWindow.xaml
│   │   └── MainWindow.xaml
│   └── ViewModels/                 # MVVM view models
│       ├── LoginViewModel.cs
│       └── MainViewModel.cs
│
└── TradePulse.Client.Tests/        # Unit tests
```

## Current Status

### ✅ Completed
- Project structure and solution
- Core models (User, Call, Group, Favorite, etc.)
- Socket.IO service implementation
- Audio service with NAudio
- Call service
- Authentication service
- Basic WPF UI structure (Login + Main window)
- MVVM view models
- Dependency injection setup

### ⏳ Next Steps
1. **Audio Routing**: Connect Socket.IO audio events to NAudio
2. **UI Polish**: Complete the main window UI
3. **Contacts List**: Load and display contacts/favorites
4. **Call UI**: Implement call controls and status display
5. **Error Handling**: Add proper error handling and user feedback
6. **Settings**: Add settings window for audio devices, server URL, etc.

## Testing

Run tests:
```powershell
cd TradePulse.Client.Tests
dotnet test
```

## Troubleshooting

### Build Errors
- Ensure .NET 8 SDK is installed: `dotnet --version` should show 8.x
- Restore packages: `dotnet restore`

### Connection Issues
- Verify Node.js server is running on port 5000
- Check firewall settings
- Verify server URL in `App.xaml.cs`

### Audio Issues
- Check microphone permissions in Windows Settings
- Verify audio devices are available
- Check NAudio device enumeration

## Development Notes

- Uses **CommunityToolkit.Mvvm** for MVVM pattern
- Uses **MaterialDesignThemes** for UI styling
- Socket.IO client uses polling transport initially (can upgrade to WebSocket)
- Audio uses 48kHz, 16-bit, stereo format
- All services are registered as singletons in DI container

## Next Phase: Video Support

Once intercom-only is working:
1. Add WebRTC library (Pion or native .NET)
2. Add video capture/playback
3. Extend CallService for video calls
4. Update UI for video display

