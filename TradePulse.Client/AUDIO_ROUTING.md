# Audio Routing Implementation

## Overview

The audio routing system connects Socket.IO real-time communication with NAudio for audio capture and playback, enabling bidirectional audio streaming during calls.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Audio Flow Diagram                        │
└─────────────────────────────────────────────────────────────┘

Microphone Input
    ↓
NAudio WaveInEvent (AudioService)
    ↓
AudioDataAvailable Event
    ↓
AudioStreamingService.OnAudioDataAvailable()
    ↓
Base64 Encode
    ↓
Socket.IO Emit "audio-data"
    ↓
    ↓ (Network)
    ↓
Socket.IO On "audio-data"
    ↓
AudioStreamingService.OnSocketAudioData()
    ↓
Base64 Decode
    ↓
NAudio PlayAudioAsync()
    ↓
BufferedWaveProvider
    ↓
WaveOutEvent
    ↓
Speaker Output
```

## Components

### 1. AudioService (NAudio)
- **Responsibility**: Audio capture and playback
- **Features**:
  - Microphone input via `WaveInEvent`
  - Speaker output via `WaveOutEvent` + `BufferedWaveProvider`
  - Volume control (input/output)
  - Mute functionality
  - Audio level monitoring

**Key Methods:**
- `StartRecordingAsync()` - Begin capturing microphone
- `StopRecordingAsync()` - Stop capturing
- `PlayAudioAsync(byte[])` - Play audio data
- `IsMuted` - Mute/unmute control

### 2. AudioStreamingService
- **Responsibility**: Bridge between Socket.IO and NAudio
- **Features**:
  - Manages audio streaming lifecycle
  - Handles audio data encoding/decoding (Base64)
  - Routes audio between Socket.IO and AudioService
  - Call-specific audio routing

**Key Methods:**
- `StartStreamingAsync(callId)` - Start audio stream for a call
- `StopStreamingAsync()` - Stop audio stream
- `SendAudioDataAsync(byte[])` - Send audio to server
- `SetVolume(float)` - Control output volume

### 3. CallService Integration
- **Responsibility**: Coordinate audio with call lifecycle
- **Integration Points**:
  - Starts audio streaming when call is answered
  - Stops audio streaming when call ends
  - Manages mute state during calls

## Audio Format

- **Sample Rate**: 48kHz
- **Bit Depth**: 16-bit
- **Channels**: Stereo (2 channels)
- **Buffer Size**: 20ms (low latency)
- **Encoding**: Base64 for Socket.IO transmission

## Data Flow

### Outgoing Audio (Microphone → Server)

1. **Capture**: `WaveInEvent` captures audio from microphone
2. **Event**: `AudioDataAvailable` event fires with raw PCM data
3. **Filter**: Check if muted or not streaming
4. **Encode**: Convert byte array to Base64 string
5. **Transmit**: Emit via Socket.IO `audio-data` event
6. **Payload**:
   ```json
   {
     "callId": "call-123",
     "audioData": "base64-encoded-audio...",
     "timestamp": "2024-01-01T12:00:00Z"
   }
   ```

### Incoming Audio (Server → Speaker)

1. **Receive**: Socket.IO `audio-data` event received
2. **Parse**: Deserialize JSON payload
3. **Validate**: Check callId matches current call
4. **Decode**: Convert Base64 string to byte array
5. **Buffer**: Add to `BufferedWaveProvider`
6. **Play**: `WaveOutEvent` plays audio to speaker

## Event Handlers

### Socket.IO Events

**Outgoing:**
- `audio-data` - Send audio data to server

**Incoming:**
- `audio-data` - Receive audio data from server
- `call-audio` - Alternative event name (for compatibility)

### NAudio Events

- `AudioDataAvailable` - Fires when microphone captures audio
- `AudioLevelChanged` - Fires when audio level changes (for visualization)

## Error Handling

### Buffer Overflow
- **Problem**: Too much audio data queued
- **Solution**: `AudioBufferManager` drops oldest frames
- **Logging**: Warning logged when overflow occurs

### Network Issues
- **Problem**: Socket.IO connection lost
- **Solution**: Audio streaming stops, call state updated
- **Recovery**: Reconnect socket, restart streaming

### Audio Device Issues
- **Problem**: Microphone/speaker unavailable
- **Solution**: Exception caught, logged, user notified
- **Fallback**: Graceful degradation, continue without audio

## Performance Considerations

### Latency
- **Target**: < 50ms end-to-end
- **Buffer Size**: 20ms buffers for low latency
- **Network**: Depends on Socket.IO transport (polling/WebSocket)

### CPU Usage
- **Target**: < 20% during active call
- **Optimization**: Async operations, buffered I/O
- **Monitoring**: Audio level calculation optimized

### Memory Usage
- **Target**: < 200MB total
- **Buffers**: 1 second audio buffer (48KB)
- **Queue**: Max 100 audio frames in queue

## Configuration

### Audio Settings
```csharp
// In AudioService
WaveFormat = new WaveFormat(48000, 16, 2); // 48kHz, 16-bit, stereo
BufferMilliseconds = 20; // 20ms buffers
```

### Buffer Settings
```csharp
// In AudioBufferManager
MaxBufferSize = 100; // Max frames in queue
TargetBufferSize = 20; // Target buffer level
```

## Testing

### Manual Testing
1. Start call between two clients
2. Speak into microphone
3. Verify audio plays on other end
4. Test mute functionality
5. Test volume control
6. Test call end (audio stops)

### Automated Testing
- Unit tests for audio encoding/decoding
- Integration tests for audio routing
- Performance tests for latency

## Troubleshooting

### No Audio Output
- Check Windows audio device permissions
- Verify `WaveOutEvent` is initialized
- Check `BufferedWaveProvider` has data
- Verify volume is not muted

### No Audio Input
- Check microphone permissions
- Verify `WaveInEvent` is recording
- Check `IsMuted` is false
- Verify audio device is selected

### Choppy Audio
- Check network latency
- Verify buffer is not underflowing
- Increase buffer size if needed
- Check CPU usage

### Audio Delay
- Check Socket.IO transport (use WebSocket if possible)
- Reduce buffer size
- Check network latency
- Verify audio processing is not blocking

## Future Enhancements

1. **Echo Cancellation**: Add AEC (Acoustic Echo Cancellation)
2. **Noise Suppression**: Add noise reduction
3. **Audio Codecs**: Support Opus, G.722 codecs
4. **Adaptive Bitrate**: Adjust quality based on network
5. **Audio Recording**: Record calls locally
6. **Multiple Devices**: Support multiple audio devices

## Integration with Backend

The backend (Node.js) should handle:
- Receiving `audio-data` events
- Routing audio to other participants
- Broadcasting audio in conferences
- Managing audio streams per call

**Backend Event Handling:**
```javascript
socket.on('audio-data', (data) => {
  // Route audio to other participants in the call
  const call = getCall(data.callId);
  call.participants.forEach(participant => {
    if (participant.socketId !== socket.id) {
      io.to(participant.socketId).emit('audio-data', data);
    }
  });
});
```

## Summary

The audio routing system provides:
- ✅ Bidirectional audio streaming
- ✅ Low latency (< 50ms target)
- ✅ Mute/unmute control
- ✅ Volume control
- ✅ Buffer management
- ✅ Error handling
- ✅ Integration with call lifecycle

The system is ready for intercom-only calls and can be extended for video support in Phase 2.

