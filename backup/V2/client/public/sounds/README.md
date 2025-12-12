# Audio Notification Files

## Required Sound Files

Place the following audio files in this directory:

### 1. `connection-beep.mp3`
- **Duration**: 200-300ms
- **Description**: Short, pleasant beep when instant connection establishes
- **Frequency**: 440-880 Hz (A4-A5)
- **Volume**: Moderate
- **Example**: "Ding" or "Boop" sound

### 2. `disconnection-beep.mp3`
- **Duration**: 200-300ms
- **Description**: Different tone when connection ends
- **Frequency**: 220-440 Hz (A3-A4) - Lower than connection
- **Volume**: Moderate
- **Example**: "Dong" or "Bop" sound (descending tone)

### 3. `silence-warning.mp3`
- **Duration**: 300-500ms
- **Description**: Alert sound for silence auto-disconnect warning
- **Frequency**: 880-1320 Hz (A5-E6)
- **Volume**: Louder to get attention
- **Example**: "Beep beep" or alert tone

### 4. `admin-override.mp3`
- **Duration**: 400-600ms
- **Description**: Urgent tone for admin emergency override
- **Frequency**: 1000-1500 Hz
- **Volume**: Loud
- **Pattern**: Double beep (urgent)
- **Example**: "BEEP BEEP" alarm-like sound

### 5. `ptt-start.mp3` (Optional)
- **Duration**: 50-100ms
- **Description**: Very short click when PTT activates
- **Example**: Radio "click" or "chirp"

### 6. `ptt-stop.mp3` (Optional)
- **Duration**: 50-100ms
- **Description**: Very short click when PTT deactivates
- **Example**: Radio "click" (can be same as start)

## Creating Sounds

### Method 1: Use Online Generators
- https://www.zapsplat.com/ (free sound effects)
- https://freesound.org/ (Creative Commons sounds)
- https://www.audacityteam.org/ (create custom beeps)

### Method 2: Use Audacity
```
1. Generate → Tone
2. Frequency: 440 Hz (or desired)
3. Duration: 0.2 seconds
4. Waveform: Sine wave
5. Apply fade in/out
6. Export as MP3
```

### Method 3: Use AI/Code
```javascript
// Use Web Audio API to generate and export
// See: audioNotifications.js fallback method
```

## Fallback Behavior

If sound files are not found, the system will use:
- **Web Audio API** to generate simple sine wave beeps
- **Mobile Vibration** on supported devices
- System will continue to function without files

## Volume Levels

All sounds should be:
- **Normalized** to prevent clipping
- **Consistent volume** across all files
- **Not too loud** - users work in open offices
- **Adjustable** in user settings (future feature)

## Format Requirements

- **Format**: MP3 (best browser compatibility)
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Bit Rate**: 128 kbps or higher
- **Channels**: Mono (stereo okay but not necessary)
- **File Size**: Keep under 50KB each

## Testing

After adding files, test with:
```javascript
import { audioNotifications } from './utils/audioNotifications';

// Test each sound
audioNotifications.playConnectionBeep();
audioNotifications.playDisconnectionBeep();
audioNotifications.playSilenceWarning();
audioNotifications.playAdminOverride();
```

## Copyright

Ensure all sound files are:
- Created by you, OR
- Licensed for commercial use, OR
- Public domain / Creative Commons

**Do not use copyrighted sounds without permission!**

