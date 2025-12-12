# TradePulse - Video & Audio Intercom System

## Yes, This is BOTH Video AND Audio! 📹🎤

TradePulse is a **full video and audio intercom system**, not just audio.

---

## Supported Communication Types

### 1. **Audio-Only Calls** 🎤
- Voice-only 1-to-1 calls
- Hunt group calls (audio)
- Broadcast monitoring (audio)
- IPTV audio streams

**Use Case:** Quick check-ins, trading floor communication, broadcast listening

---

### 2. **Video + Audio Calls** 📹
- HD video calls (up to 1080p)
- Video hunt groups
- Video conferences
- Screen sharing

**Use Case:** Face-to-face meetings, visual collaboration, executive calls

---

### 3. **Flexible Mode Switching** 🔄
Users can:
- Start with audio, add video later
- Start with video, turn off camera
- Switch between modes during call
- Screen share while on audio/video

---

## Video Capabilities

### Resolutions Supported:
- **480p** (SD) - Low bandwidth
- **720p** (HD) - Standard
- **1080p** (Full HD) - High quality

### Frame Rates:
- **15 fps** - Low bandwidth
- **30 fps** - Standard (default)
- **60 fps** - Smooth motion (high bandwidth)

### Features:
- ✅ Camera on/off toggle
- ✅ Multiple camera support (front/back/external)
- ✅ Camera preview before joining
- ✅ Virtual backgrounds (blur/replace)
- ✅ Picture-in-picture mode
- ✅ Grid view (conference mode)
- ✅ Active speaker detection
- ✅ Screen sharing
- ✅ Recording (audio + video separately)

---

## Audio Capabilities

### Codecs Supported:
- **Opus** - High quality, low latency (default)
- **G.722** - Wideband audio (trading standard)
- **G.711** - Standard telephony
- **PCM** - Raw audio

### Features:
- ✅ Echo cancellation
- ✅ Noise suppression
- ✅ Auto gain control
- ✅ Multiple microphone support
- ✅ Multiple speaker/headset support
- ✅ Volume meters
- ✅ Mute/unmute
- ✅ Push-to-talk (PTT)
- ✅ Individual broadcast volume control

---

## User Controls

### During a Call:

```
┌─────────────────────────────────────┐
│  📹 Video Call - John Smith         │
├─────────────────────────────────────┤
│  [Video Feed]                       │
│                                     │
│  ┌─────┐  Your Camera (PiP)        │
│  └─────┘                            │
├─────────────────────────────────────┤
│  [🎥]  [🎤]  [🖥️]  [📞]            │
│ Video  Mute Screen  End             │
└─────────────────────────────────────┘
```

**Controls:**
- 🎥 **Video**: Toggle camera on/off
- 🎤 **Mute**: Toggle microphone on/off
- 🖥️ **Screen**: Share your screen
- 📞 **End**: Hang up call
- ⚙️ **Settings**: Change camera/mic/speaker

---

## Call Types with Video/Audio Options

### 1-to-1 Direct Calls:
```
Audio Only:      [📞] Call John Smith
Video + Audio:   [📹] Video Call John Smith
```

### Hunt Group Calls:
```
Audio Hunt:      [📞] Call FX Desk
Video Hunt:      [📹] Video Call FX Desk
```
**Note:** First person to answer determines if video is active

### Conference Calls:
```
Audio Conference:  [📞] Join Sales Meeting (audio)
Video Conference:  [📹] Join Sales Meeting (video)
```
**Features:**
- Up to 50 participants
- Grid view (4x4, 5x5, etc.)
- Active speaker highlight
- Screen sharing
- Individual mute controls
- Recording each participant

### Broadcast Monitoring:
```
Audio Broadcast:   [🎧] Monitor FX Desk (audio only)
Video Broadcast:   [📹] Monitor Trading Floor (video + audio)
IPTV Stream:       [📺] Market Data Feed (audio/video)
```

---

## User Settings

### Video Settings:
```javascript
{
  "video": {
    "cameraId": "default",           // Selected camera
    "resolution": "720p",            // 480p, 720p, 1080p
    "frameRate": 30,                 // 15, 30, 60
    "autoStart": false,              // Video on by default?
    "virtualBackground": false,
    "backgroundBlur": false
  }
}
```

### Audio Settings:
```javascript
{
  "audio": {
    "microphoneId": "default",       // Selected microphone
    "speakerId": "default",          // Selected speaker/headset
    "echoCancellation": true,
    "noiseSuppression": true,
    "autoGainControl": true,
    "voiceActivityDetection": true
  }
}
```

---

## WebRTC Configuration

### MediaSoup SFU (Selective Forwarding Unit):
- **Audio tracks**: Opus codec, 48kHz, stereo
- **Video tracks**: VP8/VP9/H.264, adaptive bitrate
- **Screen sharing**: VP8, 15fps, optimized for text
- **Network adaptation**: Automatic quality adjustment

### Quality Modes:

**Low Bandwidth:**
- Video: 480p @ 15fps
- Audio: Opus @ 24kbps
- Total: ~300 kbps per participant

**Standard:**
- Video: 720p @ 30fps
- Audio: Opus @ 64kbps
- Total: ~1.5 Mbps per participant

**High Quality:**
- Video: 1080p @ 30fps
- Audio: Opus @ 128kbps
- Total: ~3 Mbps per participant

---

## UI Examples

### Video Call Interface:
```
┌──────────────────────────────────────────┐
│ 📹 Video Call - Executive Team           │
├──────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │ Sarah   │  │ Mike    │  │ Lisa    │  │
│  │ (CFO)   │  │ (CEO)   │  │ (COO)   │  │
│  └─────────┘  └─────────┘  └─────────┘  │
│                                          │
│  ┌─────────┐  ← You (PiP)                │
│  │ Your    │                             │
│  │ Camera  │                             │
│  └─────────┘                             │
├──────────────────────────────────────────┤
│  [🎥ON] [🎤OFF] [🖥️Share] [👥Layout] [📞]│
└──────────────────────────────────────────┘
```

### Audio-Only Call Interface:
```
┌──────────────────────────────────────────┐
│ 📞 Call - FX Desk                        │
├──────────────────────────────────────────┤
│                                          │
│        John Smith (Trader)               │
│        Connected - 00:02:34              │
│                                          │
│        ═════════════════                 │
│        Audio Level: ▓▓▓▓▓▓▓░░░          │
│        ═════════════════                 │
│                                          │
├──────────────────────────────────────────┤
│         [🎤Mute]  [📞End Call]           │
└──────────────────────────────────────────┘
```

---

## Recording Both Audio and Video

### Separate Track Recording:
```
Conference Call Recording:
├─ video_participant_1.webm (John's video)
├─ audio_participant_1.opus (John's audio)
├─ video_participant_2.webm (Sarah's video)
├─ audio_participant_2.opus (Sarah's audio)
├─ screen_share.webm (Mike's screen)
└─ metadata.json (timing, participants, etc.)
```

### Playback Options:
- **Mixed view**: All participants in grid
- **Speaker view**: Active speaker + thumbnails
- **Individual tracks**: Review each participant separately
- **Screen share overlay**: Picture-in-picture mode

---

## Bandwidth Requirements

### Per Participant:

**Audio Only:**
- Opus codec: 24-128 kbps
- Recommended: 100 kbps

**Video + Audio:**
- 480p: ~500 kbps
- 720p: ~1.5 Mbps
- 1080p: ~3 Mbps

**Conference (5 participants):**
- Audio only: ~500 kbps total
- Video 720p: ~7.5 Mbps total

### Network QoS:
- Audio: DSCP EF (Expedited Forwarding)
- Video: DSCP AF41 (Assured Forwarding)
- Priority: Audio > Video > Signaling

---

## Browser Compatibility

### Full Support (Audio + Video):
- ✅ Chrome 100+
- ✅ Edge 100+
- ✅ Firefox 100+
- ✅ Safari 15+
- ✅ Opera 85+

### WebRTC APIs Used:
- `getUserMedia()` - Camera/mic access
- `getDisplayMedia()` - Screen sharing
- `RTCPeerConnection` - WebRTC connections
- `MediaStream` - Audio/video streams

---

## Device Requirements

### Minimum:
- **CPU**: Dual-core 2GHz
- **RAM**: 4GB
- **Network**: 5 Mbps down, 2 Mbps up
- **Camera**: 480p webcam
- **Audio**: Built-in mic/speakers

### Recommended:
- **CPU**: Quad-core 3GHz
- **RAM**: 8GB
- **Network**: 25 Mbps down, 10 Mbps up
- **Camera**: 1080p webcam
- **Audio**: USB headset/speakerphone

---

## Trading Floor Typical Setup

### Trader Workstation:
- **Audio**: USB headset (primary communication)
- **Video**: 1080p webcam (face-to-face calls)
- **Monitors**: 4-6 displays (trading platforms + intercom)
- **Network**: Dedicated VLAN, QoS enabled

### Manager Station:
- **Audio**: Desktop speakerphone
- **Video**: 4K webcam (conference calls)
- **Monitors**: 2-3 displays
- **Screen Share**: For presentations/reviews

---

## Default Behavior

### When User Clicks "Call":
1. **Audio-only call starts** (fastest connection)
2. User can enable video anytime during call
3. Other party sees request to enable video

### When User Clicks "Video Call":
1. **Camera preview shown** before connecting
2. User can adjust camera/lighting
3. Video + audio call starts
4. Can switch to audio-only during call

---

## Admin Configuration

### Set Default Call Type per Group:
```json
{
  "groupId": "fx-desk",
  "defaultCallType": "audio",  // or "video"
  "allowVideoUpgrade": true,
  "videoQuality": "720p"
}
```

### Force Video for Certain Groups:
```json
{
  "groupId": "executive-team",
  "defaultCallType": "video",
  "requireVideo": true,        // Must have video
  "videoQuality": "1080p"
}
```

---

## Summary

✅ **Full video and audio support**
✅ **User choice**: Audio-only or video+audio
✅ **Flexible**: Switch modes during call
✅ **HD quality**: Up to 1080p video
✅ **Conference**: Up to 50 video participants
✅ **Screen sharing**: Present to team
✅ **Recording**: Both audio and video tracks
✅ **Broadcast**: Audio and video monitoring
✅ **IPTV**: Multicast audio/video streams

**This is a complete video and audio intercom system for modern trading floors!** 📹🎤

