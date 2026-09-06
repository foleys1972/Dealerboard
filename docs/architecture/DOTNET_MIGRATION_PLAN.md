# .NET Client Migration Plan

## Executive Summary

**Recommendation: Start with Intercom-Only .NET Client**

Migrate the React web client to a .NET desktop application, starting with audio-only intercom functionality. This reduces complexity and allows faster delivery of core features.

---

## Migration Strategy

### Phase 1: Intercom-Only .NET Client (MVP) ⭐ **START HERE**

**Scope:**
- ✅ Audio calls only (1-to-1, hunt groups, conferences)
- ✅ Socket.IO client for real-time signaling
- ✅ Basic UI (contacts, favorites, call controls)
- ✅ DND, call forwarding
- ✅ IPTV stream monitoring
- ❌ No video/WebRTC (add in Phase 2)
- ❌ No messaging/dealerboard (add in Phase 3)

**Technology Stack:**
- **Framework:** .NET 8 WPF or MAUI (Windows-first)
- **Socket.IO:** SocketIOClient.NET
- **Audio:** NAudio for audio capture/playback
- **UI:** Modern WPF with Material Design or MAUI

**Timeline:** 4-6 weeks

---

### Phase 2: Add Video Support

**Scope:**
- WebRTC integration (Pion or native .NET WebRTC)
- Video calls (1-to-1, conferences)
- Screen sharing
- Camera controls

**Timeline:** 6-8 weeks (after Phase 1 stable)

---

### Phase 3: Additional Features

**Scope:**
- Messaging (Matrix integration)
- Dealerboard
- Admin features
- Full feature parity with React client

**Timeline:** 8-12 weeks

---

## Why .NET?

### Advantages:
1. **Native Performance**
   - Better audio latency
   - Lower CPU usage
   - Native Windows integration

2. **Enterprise Ready**
   - Windows-first deployment
   - Better security controls
   - Easier IT deployment (MSI installers)

3. **Developer Experience**
   - Strong typing (C#)
   - Better debugging
   - Rich ecosystem

4. **Integration**
   - Easy Windows service integration
   - System tray support
   - Windows notifications

### Disadvantages:
1. **Cross-Platform**
   - WPF: Windows only
   - MAUI: Cross-platform but newer/less mature

2. **WebRTC**
   - Less mature .NET WebRTC libraries
   - May need Pion or native interop

3. **Development Time**
   - Initial migration takes time
   - Need to rebuild UI components

---

## Why Intercom-Only First?

### Benefits:
1. **Faster Delivery**
   - 4-6 weeks vs 12+ weeks for full feature set
   - Get core functionality working quickly

2. **Lower Risk**
   - Simpler architecture
   - Fewer moving parts
   - Easier to debug

3. **Validate Architecture**
   - Test .NET + Node.js backend integration
   - Validate Socket.IO communication
   - Ensure audio quality meets requirements

4. **Incremental Migration**
   - Users can use intercom while you build video
   - Less disruption
   - Can run both clients in parallel

---

## Technical Architecture

### .NET Client Structure

```
TradePulse.Client/
├── TradePulse.Client.Core/          # Shared business logic
│   ├── Services/
│   │   ├── SocketService.cs        # Socket.IO client
│   │   ├── AudioService.cs         # NAudio audio handling
│   │   ├── CallService.cs          # Call management
│   │   └── AuthService.cs          # Authentication
│   ├── Models/
│   │   ├── User.cs
│   │   ├── Call.cs
│   │   └── Group.cs
│   └── Stores/
│       └── AppState.cs             # State management
│
├── TradePulse.Client.WPF/           # WPF UI (or MAUI)
│   ├── Views/
│   │   ├── MainWindow.xaml
│   │   ├── CallView.xaml
│   │   └── ContactsView.xaml
│   ├── ViewModels/
│   │   ├── MainViewModel.cs
│   │   └── CallViewModel.cs
│   └── Controls/
│       ├── CallButton.xaml
│       └── AudioControls.xaml
│
└── TradePulse.Client.Tests/          # Unit tests
```

### Key Dependencies

```xml
<PackageReference Include="SocketIOClient" Version="3.1.0" />
<PackageReference Include="NAudio" Version="2.2.1" />
<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
<PackageReference Include="Microsoft.Extensions.Logging" Version="8.0.0" />
<PackageReference Include="CommunityToolkit.Mvvm" Version="8.2.2" />
```

---

## Migration Steps

### Step 1: Setup .NET Project (Week 1)
- [ ] Create .NET 8 WPF/MAUI project
- [ ] Setup dependency injection
- [ ] Configure logging
- [ ] Setup project structure

### Step 2: Socket.IO Integration (Week 1-2)
- [ ] Implement Socket.IO client service
- [ ] Handle connection/disconnection
- [ ] Implement authentication flow
- [ ] Test with existing Node.js backend

### Step 3: Audio System (Week 2-3)
- [ ] Implement NAudio audio capture
- [ ] Implement audio playback
- [ ] Audio routing (mixer, volume control)
- [ ] Test audio quality/latency

### Step 4: Call Management (Week 3-4)
- [ ] 1-to-1 calls
- [ ] Hunt group calls
- [ ] Conference calls
- [ ] Call state management

### Step 5: UI Implementation (Week 4-5)
- [ ] Main window layout
- [ ] Contacts/favorites list
- [ ] Call controls
- [ ] Settings panel

### Step 6: Testing & Polish (Week 5-6)
- [ ] Integration testing
- [ ] Performance optimization
- [ ] UI polish
- [ ] Documentation

---

## Backend Compatibility

### Current Backend (Node.js)
- ✅ **No changes needed** - Socket.IO server works with any client
- ✅ REST API works with any HTTP client
- ✅ WebRTC signaling works the same way

### Socket.IO Events (Unchanged)

**Client → Server:**
- `authenticate` - User authentication
- `call` - Initiate call
- `answer` - Answer incoming call
- `hangup` - End call
- `mute` - Mute/unmute
- `join-room` - Join conference

**Server → Client:**
- `auth-success` - Authentication successful
- `incoming-call` - Incoming call notification
- `call-connected` - Call established
- `call-ended` - Call terminated
- `participant-joined` - Conference participant joined

---

## Audio Architecture

### NAudio Audio Pipeline

```
Microphone Input
    ↓
NAudio WaveInEvent
    ↓
Audio Processing (Echo cancellation, noise suppression)
    ↓
Socket.IO (send to server)
    ↓
Server → Other clients
    ↓
NAudio WaveOutEvent
    ↓
Speaker Output
```

### Audio Codecs
- **Primary:** Opus (via NAudio codec support)
- **Fallback:** PCM 16-bit, 48kHz
- **IPTV:** G.711, G.722 (as configured)

---

## UI Framework Decision

### Option 1: WPF (Recommended for Windows)
**Pros:**
- Mature, stable
- Rich UI capabilities
- Excellent Windows integration
- Large ecosystem

**Cons:**
- Windows only
- Older technology

### Option 2: MAUI (Cross-platform)
**Pros:**
- Cross-platform (Windows, Mac, Linux)
- Modern framework
- Single codebase

**Cons:**
- Newer, less mature
- Smaller ecosystem
- May have platform-specific issues

**Recommendation:** Start with **WPF** for faster delivery, migrate to MAUI later if cross-platform needed.

---

## Testing Strategy

### Unit Tests
- Socket.IO service
- Audio service
- Call state management
- Business logic

### Integration Tests
- End-to-end call flow
- Hunt group behavior
- Conference calls
- IPTV streaming

### Performance Tests
- Audio latency (< 50ms target)
- CPU usage (< 5% idle, < 20% during call)
- Memory usage (< 200MB)

---

## Deployment

### Installation
- MSI installer (Windows)
- Auto-update mechanism
- System tray integration
- Startup on login option

### Configuration
- Server URL configuration
- Audio device selection
- User preferences
- Favorites sync

---

## Risk Mitigation

### Risk 1: Audio Quality Issues
**Mitigation:**
- Use proven NAudio library
- Test with various audio devices
- Implement audio quality monitoring

### Risk 2: Socket.IO Compatibility
**Mitigation:**
- Use official SocketIOClient.NET
- Test with existing backend early
- Maintain protocol compatibility

### Risk 3: Development Timeline
**Mitigation:**
- Start with MVP (intercom-only)
- Incremental feature addition
- Parallel development (React + .NET)

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Audio calls working (1-to-1, hunt, conference)
- ✅ Socket.IO connection stable
- ✅ Audio quality acceptable (< 50ms latency)
- ✅ UI functional and polished
- ✅ Can replace React client for intercom use cases

### Metrics:
- Audio latency: < 50ms
- Call setup time: < 2 seconds
- CPU usage: < 20% during call
- Memory usage: < 200MB
- Connection stability: > 99.9%

---

## Next Steps

1. **Decision:** Approve .NET migration plan
2. **Setup:** Create .NET project structure
3. **POC:** Build minimal Socket.IO + audio proof of concept
4. **Validate:** Test with existing backend
5. **Develop:** Follow migration steps above

---

## Questions to Answer

1. **WPF or MAUI?** → Start with WPF for speed
2. **Timeline pressure?** → Intercom-only first
3. **Feature priority?** → Audio calls > Video > Messaging
4. **Deployment target?** → Windows only or cross-platform?
5. **React client?** → Keep for web access, .NET for desktop

---

## Conclusion

**Start with intercom-only .NET client** to:
- Deliver faster (4-6 weeks vs 12+ weeks)
- Reduce complexity
- Validate architecture
- Build incrementally

Add video and other features in subsequent phases once the foundation is solid.

