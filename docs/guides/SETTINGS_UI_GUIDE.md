# Settings UI - User Guide

## Overview
The Settings page now includes comprehensive controls for instant intercom behavior.

---

## New Settings Sections

### 1. 🎙️ Instant Intercom Mode

```
┌────────────────────────────────────────────┐
│ 🎙️ Instant Intercom Mode                  │
├────────────────────────────────────────────┤
│                                            │
│ Audio Mode                                 │
│ ┌────────────────────────────────────────┐ │
│ │ [▼] Always On (Hot Mic)                │ │
│ │     Push to Talk (Spacebar)            │ │
│ └────────────────────────────────────────┘ │
│ ℹ️ Your microphone is always active when  │
│    connected                               │
│                                            │
│ Auto-Disconnect After Silence              │
│ ├────────●─────────────────────────┤      │
│ 5s                                   60s   │
│ ℹ️ Automatically disconnect after 10      │
│    seconds of silence                      │
└────────────────────────────────────────────┘
```

**Controls:**
- **Audio Mode**: Choose Always On or Push-to-Talk
- **Auto-Disconnect**: Slider from 5 to 60 seconds

---

### 2. 📞 Call Availability

```
┌────────────────────────────────────────────┐
│ 📞 Call Availability                       │
├────────────────────────────────────────────┤
│                                            │
│ [☐] Block incoming calls when I'm on a    │
│     call                                   │
│ ℹ️ ✅ You can receive multiple calls      │
│    simultaneously                          │
│                                            │
│ [☑] Allow multiple simultaneous calls     │
│                                            │
│ Maximum Simultaneous Calls: 3              │
│ ├────●──────────────────────────────┤     │
│ 1                                    10    │
│ ℹ️ You can be on up to 3 calls at once    │
│                                            │
│ ╔══════════════════════════════════════╗  │
│ ║ ℹ️ Note: Group calls will connect to ║  │
│ ║ available members only. Busy members  ║  │
│ ║ are silently skipped without error    ║  │
│ ║ messages.                             ║  │
│ ╚══════════════════════════════════════╝  │
└────────────────────────────────────────────┘
```

**Controls:**
- **Block when busy**: Checkbox to refuse calls
- **Allow multiple**: Checkbox for multi-call capability
- **Max calls**: Slider from 1 to 10

**Smart UI:**
- If "Block when busy" is ON → Other options hidden (not needed)
- If "Allow multiple" is OFF → Max calls slider hidden

---

## Setting Combinations

### Profile 1: Focus Mode (Single Call)
```
✅ Block incoming calls when I'm on a call
❌ Allow multiple simultaneous calls
   Max: 1
```
**Result**: Only 1 call at a time, others get busy tone

---

### Profile 2: Flexible Mode (Multi-tasking)
```
❌ Block incoming calls when I'm on a call
✅ Allow multiple simultaneous calls
   Max: 5
```
**Result**: Up to 5 simultaneous calls

---

### Profile 3: Limited Multi-tasking
```
❌ Block incoming calls when I'm on a call
✅ Allow multiple simultaneous calls
   Max: 2
```
**Result**: Up to 2 calls, then busy tone

---

## User Experience Examples

### Example 1: Trader in Focus Mode

**Settings:**
```
Block when busy: ON
Always On mode
Auto-disconnect: 10s
```

**Scenario:**
```
1. Trader on call with Manager
2. Admin tries to call
3. Result: 
   - Regular user: "User is busy" ❌
   - Admin: "ADMIN OVERRIDE" ⚠️ connects anyway
```

---

### Example 2: Manager in Multi-Call Mode

**Settings:**
```
Block when busy: OFF
Allow multiple: ON
Max calls: 5
```

**Scenario:**
```
1. Manager on 2 calls
2. Third caller connects ✅
3. Fourth caller connects ✅
4. Fifth caller connects ✅
5. Sixth caller: "User at max calls" ❌
```

---

### Example 3: Group Call (Any Settings)

**Scenario:**
```
1. Call "FX Desk" group (5 traders)
2. Trader A: Available ✅ Connects
3. Trader B: Busy 📞 Silently skipped
4. Trader C: Available ✅ Connects
5. Trader D: DND 🔕 Silently skipped
6. Trader E: Available ✅ Connects

Result: "Connected to 3 people" 
NO busy errors shown!
```

---

## Settings Page Layout

```
┌──────────────────────────────────────────────────┐
│ Settings                                    [×]  │
│ Configure your intercom system preferences      │
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌─────────────────┐  ┌─────────────────┐       │
│ │ 🎤 Audio        │  │ 🎙️ Instant      │       │
│ │ Settings        │  │ Intercom Mode   │       │
│ │                 │  │                 │       │
│ │ [☑] Enable Mic  │  │ Audio Mode      │       │
│ │                 │  │ [▼] Always On   │       │
│ │ Volume: 80%     │  │                 │       │
│ │ ▬▬▬▬▬●▬▬▬▬     │  │ Auto-Disconnect │       │
│ │                 │  │ ▬▬▬●▬▬▬▬▬▬     │       │
│ │ [☑] Noise Sup.  │  │ 10 seconds      │       │
│ │ [☑] Echo Cancel │  │                 │       │
│ │                 │  │                 │       │
│ │ [Test Mic]      │  │                 │       │
│ └─────────────────┘  └─────────────────┘       │
│                                                  │
│ ┌─────────────────┐  ┌─────────────────┐       │
│ │ 📞 Call         │  │ 🌐 Connection   │       │
│ │ Availability    │  │ Settings        │       │
│ │                 │  │                 │       │
│ │ [☐] Block when  │  │ Status: 🟢 OK   │       │
│ │     busy        │  │                 │       │
│ │                 │  │ [☑] Auto        │       │
│ │ [☑] Allow       │  │     Reconnect   │       │
│ │     multiple    │  │                 │       │
│ │                 │  │ Timeout: 30s    │       │
│ │ Max: 3 calls    │  │                 │       │
│ │ ▬▬●▬▬▬▬▬▬▬     │  │                 │       │
│ │                 │  │                 │       │
│ │ ℹ️ Group calls  │  │                 │       │
│ │ skip busy users │  │                 │       │
│ └─────────────────┘  └─────────────────┘       │
│                                                  │
│ [Save Settings] [Reset to Defaults]            │
└──────────────────────────────────────────────────┘
```

---

## Accessing Settings

### From User Interface:
```
1. Click [⚙️] icon in header
2. Settings page opens
3. Adjust preferences
4. Click "Save Settings"
```

### From Admin Dashboard:
```
1. Click [⚙️] icon
2. Same settings available
3. Admins have same personal settings as users
```

---

## Setting Persistence

**Where Settings Are Saved:**
1. **Browser LocalStorage** (immediate)
2. **Backend API** (when implemented)
3. **MongoDB Database** (future)

**Settings persist across:**
- ✅ Page refreshes
- ✅ Browser restarts
- ✅ Login/logout (if saved to backend)
- ✅ Different devices (if saved to backend)

---

## Mobile Responsive

On mobile devices:
- Cards stack vertically
- Sliders become touch-friendly
- Text sizes adjust
- Touch-optimized controls

---

## Keyboard Shortcuts (Future)

Suggested hotkeys for settings:
- **Ctrl+,** - Open settings
- **Ctrl+Shift+B** - Toggle block when busy
- **Ctrl+Shift+M** - Toggle intercom mode
- **Esc** - Close settings

---

## API Integration (To Implement)

### Save Settings Endpoint:
```javascript
PUT /api/user/settings

Body:
{
  "intercomMode": "always-on",
  "autoDisconnectSeconds": 10,
  "blockCallsWhenBusy": false,
  "allowMultipleCalls": true,
  "maxSimultaneousCalls": 3
}
```

### Get Settings Endpoint:
```javascript
GET /api/user/settings

Response:
{
  "success": true,
  "settings": {
    "intercomMode": "always-on",
    "autoDisconnectSeconds": 10,
    "blockCallsWhenBusy": false,
    "allowMultipleCalls": true,
    "maxSimultaneousCalls": 3
  }
}
```

---

## Testing Checklist

### UI Tests
- [ ] Settings page loads without errors
- [ ] All toggles work
- [ ] Sliders update values
- [ ] Dropdowns change options
- [ ] "Save Settings" button works
- [ ] "Reset to Defaults" button works
- [ ] Settings persist after page refresh

### Functional Tests
- [ ] Enable "Block when busy" → Busy caller gets error
- [ ] Disable "Block when busy" → Busy caller connects
- [ ] Set max to 2 → Third caller blocked
- [ ] Change intercom mode → Mode updates
- [ ] Adjust auto-disconnect → Timer updates

### Integration Tests
- [ ] Settings sync with backend
- [ ] Settings load on login
- [ ] Multiple devices show same settings
- [ ] Admin override works regardless of settings

---

## Visual Feedback

### When Setting Changes:
```
🟡 Yellow dot appears on Save button
"You have unsaved changes"
```

### When Saving:
```
⏳ Save button shows spinner
"Saving..."
✅ Green notification
"Settings saved successfully"
```

### When Resetting:
```
⚠️ Confirmation dialog
"Are you sure you want to reset all settings?"
[Cancel] [Reset]
```

---

## Tooltips (Future Enhancement)

Add helpful tooltips:
- Hover over "Block when busy" → "Refuses 1-to-1 calls, group calls still work"
- Hover over "Max calls" → "Admin calls always connect"
- Hover over "Auto-disconnect" → "Any sound resets the timer"

---

## Summary

✅ **Created:**
- Full Settings UI with 2 new sections
- Instant Intercom Mode controls
- Call Availability controls
- Smart conditional UI
- Helpful info messages

✅ **Features:**
- Choose Always On or Push-to-Talk
- Set auto-disconnect timer (5-60s)
- Block calls when busy
- Control multiple simultaneous calls
- Set max call limit (1-10)

✅ **User-Friendly:**
- Clear labels and descriptions
- Visual feedback
- Smart hiding of irrelevant options
- Helpful note about group calls

**Settings UI is complete!** Users can now control all call handling behavior. 🎉

