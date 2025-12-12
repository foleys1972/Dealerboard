# Instant Intercom System Specification

## Overview
This system provides **instant audio connections** with no ringing or answer delays - like a trading floor hoot line or emergency intercom.

---

## ✅ Implemented (Data Models)

### User Audio Settings
Added to `server/models/User.js`:

```javascript
settings: {
  audio: {
    intercomMode: 'always-on' | 'push-to-talk',  // User choice
    autoDisconnectSeconds: 10                      // Auto-disconnect after silence
  }
}
```

### Group Conference Settings
Added to `server/models/GroupCall.js`:

```javascript
conferenceSettings: {
  instantConnect: true,        // No ringing, immediate connection
  dropTo1to1: false           // Drop to 1-to-1 or keep full conference
}
```

---

## 📋 Core Requirements

### 1. Connection Behavior
- ✅ **Instant connection** - no ringing, no answer button
- ✅ **Notification beep** on connect (need to add audio file)
- ✅ **Auto-disconnect** after 10 seconds of silence
- ✅ **User can close/reject** at any time
- ✅ **Call logging** - all connections recorded

### 2. Audio Modes (User Configurable)
**Always-On Mode:**
- Microphone always active when connected
- Continuous 2-way audio
- Like an always-hot intercom

**Push-to-Talk (PTT) Mode:**
- Hold spacebar/button to transmit
- Release to mute
- Like a walkie-talkie

### 3. Group Broadcast
When calling a group:
- Connects to **ALL** members instantly
- No sequential ringing
- Broadcast audio to everyone

**Two modes:**
- **Full Conference**: All members hear each other
- **Drop to 1-to-1**: Connect only with first responder

### 4. Visual Indicators
- 🔴 **"On Air" red light** when actively connected
- 🎤 **Microphone indicator** (when transmitting in PTT mode)
- 👥 **Participant count** in group calls
- ⏱️ **Connection timer**

### 5. DND & Override
- Users can enable **Do Not Disturb**
- Blocks incoming connections
- **Admin override** - admins can bypass DND in emergencies

---

## 🚀 Implementation Plan

### Phase 1: Core WebRTC Instant Connection (NEXT)
**Files to update:**
- `server/socketHandlers.js` - instant connection signaling
- `client/src/hooks/useWebRTC.js` - client WebRTC logic
- `server/services/mediaSoupService.js` - SFU setup

**Logic:**
```javascript
// Traditional flow (REMOVE):
1. Send call request
2. Ring recipient
3. Wait for answer
4. Establish WebRTC

// New instant flow (IMPLEMENT):
1. Send instant-connect request
2. Play notification beep on both sides
3. Establish WebRTC immediately (no wait)
4. Start audio streaming
```

### Phase 2: Audio Modes
**Always-On:**
- Start transmitting immediately on connect
- Continuous audio stream

**Push-to-Talk:**
- Listen for spacebar/button hold
- Toggle microphone track enabled/disabled
- Visual indicator when transmitting

### Phase 3: Silence Detection & Auto-Disconnect
**Algorithm:**
```javascript
1. Monitor audio levels on both sides
2. If both silent for 10 seconds:
   - Show warning: "Auto-disconnect in 3... 2... 1..."
   - Close connection
3. Any audio activity resets timer
```

### Phase 4: Visual Indicators
**UI Components:**
- `<OnAirIndicator />` - Red pulsing light
- `<PTTButton />` - Spacebar prompt
- `<ConnectionTimer />` - Call duration
- `<ParticipantList />` - Who's connected

### Phase 5: Notification Sound
**Implementation:**
```javascript
// Add to public/sounds/
- connection-beep.mp3 (short beep)
- disconnection-beep.mp3 (different tone)

// Play on events:
- onConnect: play connection-beep
- onDisconnect: play disconnection-beep
```

### Phase 6: Call Logging
**Database:**
```javascript
CallLog {
  callId: String,
  type: 'instant-intercom',
  initiator: userId,
  participants: [userId],
  startTime: Date,
  endTime: Date,
  duration: Number,
  disconnectReason: 'user' | 'silence' | 'error'
}
```

### Phase 7: Admin Override
**Logic:**
```javascript
// When admin calls user with DND:
if (targetUser.dnd && caller.role === 'admin') {
  // Bypass DND
  sendNotification(targetUser, {
    message: "ADMIN OVERRIDE - Emergency Connection",
    priority: 'high'
  });
  establishConnection();
}
```

---

## 🎯 User Flows

### Flow 1: Direct Instant Call
```
1. Admin clicks "Call Trader1"
2. No ringing - connection establishes immediately
3. Both hear notification beep
4. Audio is live (always-on or PTT based on settings)
5. Red "On Air" light shows on both sides
6. Either person can click "Disconnect"
7. Or auto-disconnect after 10 sec silence
8. Connection logged to database
```

### Flow 2: Group Broadcast (Full Conference)
```
1. Manager clicks "Call FX Desk" (5 traders)
2. All 5 traders hear beep immediately
3. Connections establish to all 5
4. Manager sees: "Connected to 5 people"
5. All can hear Manager
6. All can talk back and hear each other
7. Anyone can disconnect themselves
8. Manager can end for everyone
```

### Flow 3: Group Broadcast (Drop to 1-to-1)
```
1. Manager clicks "Call FX Desk" (5 traders)
2. All 5 traders hear beep
3. First trader to respond: others disconnect
4. Manager now 1-to-1 with that trader
5. Standard instant connection from here
```

### Flow 4: Incoming Connection with DND
```
1. Trader1 has DND enabled
2. Regular user tries to call: BLOCKED
   - Caller sees: "Trader1 is DND"
3. Admin tries to call: OVERRIDE
   - Trader1 hears beep
   - Sees: "ADMIN OVERRIDE - Emergency"
   - Connection established
```

---

## 🔧 Technical Architecture

### WebRTC Flow
```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Caller     │         │   Server    │         │  Recipient  │
│   Client    │         │  (Socket.IO)│         │   Client    │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │                       │
       │ instant-connect       │                       │
       ├──────────────────────>│                       │
       │                       │ instant-connect       │
       │                       ├──────────────────────>│
       │                       │                       │
       │                       │ connection-accepted   │
       │                       │<──────────────────────┤
       │ connection-accepted   │                       │
       │<──────────────────────┤                       │
       │                       │                       │
       │ webrtc-offer          │                       │
       ├──────────────────────>│                       │
       │                       │ webrtc-offer          │
       │                       ├──────────────────────>│
       │                       │                       │
       │                       │ webrtc-answer         │
       │                       │<──────────────────────┤
       │ webrtc-answer         │                       │
       │<──────────────────────┤                       │
       │                       │                       │
       │<══════════════════════════════════════════════>│
       │           Audio Streaming (immediate)          │
       │<══════════════════════════════════════════════>│
```

### Socket.IO Events
```javascript
// Client → Server
socket.emit('instant-connect', { targetUserId, groupId });
socket.emit('instant-accept', { callId });
socket.emit('instant-reject', { callId, reason });
socket.emit('instant-disconnect', { callId });
socket.emit('ptt-start', { callId });
socket.emit('ptt-stop', { callId });

// Server → Client
socket.on('instant-incoming', { callId, callerId, callerName });
socket.on('instant-connected', { callId, participants });
socket.on('instant-disconnected', { callId, reason });
socket.on('silence-warning', { callId, secondsRemaining });
```

---

## 📱 UI Components Needed

### 1. Settings Panel
```jsx
<AudioModeSelector>
  <Radio value="always-on">Always On (Hot Mic)</Radio>
  <Radio value="push-to-talk">Push to Talk</Radio>
</AudioModeSelector>

<AutoDisconnectSlider>
  <Label>Auto-disconnect after silence</Label>
  <Slider min={5} max={60} value={10} />
  <Text>10 seconds</Text>
</AutoDisconnectSlider>
```

### 2. Active Call UI
```jsx
<InstantCallUI>
  <OnAirIndicator pulsing={true} />
  <ConnectionInfo>
    <ParticipantCount>5 people</ParticipantCount>
    <Timer>00:42</Timer>
  </ConnectionInfo>
  
  {mode === 'ptt' && (
    <PTTButton>
      <Kbd>SPACE</Kbd> Hold to Talk
    </PTTButton>
  )}
  
  <DisconnectButton onClick={disconnect}>
    End Connection
  </DisconnectButton>
</InstantCallUI>
```

### 3. Incoming Connection
```jsx
<IncomingConnection>
  <Avatar>{caller.name}</Avatar>
  <Text>{caller.name} connected</Text>
  <OnAirIndicator />
  <RejectButton onClick={reject}>
    Disconnect
  </RejectButton>
</IncomingConnection>
```

---

## 🎵 Audio Files Needed

Create in `client/public/sounds/`:
- `connection-beep.mp3` - Short beep (300ms)
- `disconnection-beep.mp3` - Different tone (300ms)
- `silence-warning.mp3` - Alert tone (500ms)
- `admin-override.mp3` - Urgent tone (500ms)

---

## ✅ Testing Checklist

### Basic Functionality
- [ ] Instant connection establishes without ringing
- [ ] Notification beep plays on both sides
- [ ] Audio streams immediately
- [ ] Visual "On Air" indicator appears
- [ ] Auto-disconnect after 10 seconds silence
- [ ] User can disconnect manually
- [ ] Call is logged to database

### Audio Modes
- [ ] Always-On mode: mic always active
- [ ] PTT mode: spacebar to transmit
- [ ] Settings persist across sessions

### Group Behavior
- [ ] All group members receive connection
- [ ] Full conference: all hear each other
- [ ] Drop to 1-to-1: only first responder connects

### DND & Override
- [ ] DND blocks regular connections
- [ ] Admin can override DND
- [ ] Emergency notification shows

### Edge Cases
- [ ] Multiple simultaneous connections
- [ ] Network disconnection handling
- [ ] Browser permissions denied
- [ ] Audio device not found

---

## 🚦 Current Status

✅ **Completed:**
- Data models (User settings, Group settings)
- Specification document

🚧 **In Progress:**
- Core instant connection logic

⏳ **Next Up:**
- Socket.IO event handlers
- WebRTC instant establish
- Notification sounds
- Visual indicators

---

## 📞 Questions Answered

1. **Connection rejection**: ✅ Yes - users can close calls
2. **Visual indicator**: ✅ Yes - red "On Air" light
3. **Auto-disconnect**: ✅ Yes - 10 seconds silence
4. **Call history**: ✅ Yes - all logged
5. **Privacy mode**: ✅ Yes - DND mode
6. **Emergency override**: ✅ Yes - admins bypass DND
7. **Conference behavior**: ✅ Configurable - full OR drop-to-1-to-1

---

## 🎯 Next Steps

Ready to implement Phase 1: **Core WebRTC Instant Connection**

This will give you:
- Working instant connections
- No ringing delays
- Immediate 2-way audio
- Basic disconnect

After that works, we'll add:
- Notification sounds
- Visual indicators
- Auto-disconnect
- PTT mode
- Call logging

**Ready to proceed?**

