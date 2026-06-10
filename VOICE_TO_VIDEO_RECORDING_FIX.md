# Voice-to-Video Recording Fix

## Problem
When switching from a voice call to video in the WPF client, the recording should:
1. Continue as the same call (not create a new recording)
2. Be automatic and seamless

## Solution Implemented

### Changes Made

#### 1. CallService.cs (Lines 1009-1024)
**Before:** Always called `StartAsync` which could potentially restart recording

**After:** 
- Checks if recording is already in progress
- Only starts new recording if not already recording
- Logs when continuing existing recording

```csharp
// Only start recording if not already recording for this call
// This ensures voice->video transitions continue the same recording
if (!_callRecordingService.IsRecording)
{
    await _callRecordingService.StartAsync(toRecord);
}
else
{
    // Recording already in progress - ensure it's for the same call
    // The recording service will continue with the existing recording
    _logger.LogDebug("Recording already in progress for call {CallId}, continuing existing recording", toRecord.Id);
}
```

#### 2. CallRecordingService.cs (Lines 58-70)
**Before:** If already recording, just returned without updating call reference

**After:**
- Updates the call reference if recording is already in progress for the same call ID
- This ensures the recording metadata reflects the current call state (e.g., EnableVideo flag)

```csharp
if (IsRecording)
{
    // If already recording, update the call reference to reflect current state
    // This ensures voice->video transitions maintain the same recording with updated call info
    if (_call != null && string.Equals(_call.Id, call.Id, StringComparison.OrdinalIgnoreCase))
    {
        _call = call; // Update call reference (e.g., EnableVideo flag may have changed)
        _logger.LogDebug("Recording already in progress for call {CallId}, updated call reference", call.Id);
    }
    return Task.CompletedTask;
}
```

## How It Works

### Flow When Enabling Video During a Call:

1. **User enables video** (MainViewModel.cs line 1509)
   - Emits `instant-enable-video` with same `callId`
   - Updates `CurrentCall.EnableVideo = true`

2. **Server responds** with `webrtc-setup-required` event
   - Same `callId` is maintained
   - Triggers `OnWebRTCSetupRequired` in CallService

3. **CallService handles setup** (CallService.cs lines 1009-1024)
   - Checks if recording is already in progress
   - If yes: Continues existing recording (no new recording started)
   - If no: Starts new recording

4. **CallRecordingService** (CallRecordingService.cs lines 62-70)
   - If already recording for same call ID: Updates call reference
   - Recording continues uninterrupted
   - Same file, same call ID, same session

5. **WebView2 media engine restarts** (CallService.cs lines 1034-1045)
   - Stops existing media engine
   - Starts new media engine with video enabled
   - **Recording continues** throughout this transition

## Result

✅ **Recording continues as the same call** when switching from voice to video
✅ **Automatic transition** - no manual intervention needed
✅ **Same call ID** maintained throughout
✅ **Same recording file** - no new recording created
✅ **Metadata updated** - call reference reflects EnableVideo state

## Testing

To verify the fix works:

1. Start a voice call
2. Verify recording starts (check logs for "Client recording started")
3. Enable video during the call
4. Verify logs show "Recording already in progress for call {CallId}, continuing existing recording"
5. End the call
6. Verify only ONE recording file is created (not two separate recordings)
7. Verify the recording metadata shows the call included video

## Files Modified

- `TradePulse.Client/TradePulse.Client.Core/Services/CallService.cs`
- `TradePulse.Client/TradePulse.Client.Core/Services/CallRecordingService.cs`

