# Busy Call Handling Feature

## Overview
Users can now configure whether to accept incoming calls when they're already on a call.

---

## User Settings

### 1. Block Calls When Busy
**Setting**: `blockCallsWhenBusy`  
**Default**: `false` (accepts calls)  
**Type**: Boolean

When enabled:
- ✅ User will **not** receive incoming calls while already on a call
- ✅ Caller receives "busy" error message (1-to-1 calls only)
- ✅ Admin can still override (emergency access)

### 2. Allow Multiple Calls
**Setting**: `allowMultipleCalls`  
**Default**: `true`  
**Type**: Boolean

When enabled:
- ✅ User can be on multiple calls simultaneously
- ✅ Subject to `maxSimultaneousCalls` limit

When disabled:
- ❌ User can only be on 1 call at a time
- ✅ Additional calls are blocked

### 3. Maximum Simultaneous Calls
**Setting**: `maxSimultaneousCalls`  
**Default**: `3`  
**Range**: 1-10

Limits how many calls a user can be on at once.

---

## Behavior

### 1-to-1 Calls (Direct)

**Scenario**: User A calls User B who is already on a call

**If User B has `blockCallsWhenBusy = true`:**
```
✅ User B is protected from interruption
📞 User A sees: "User is on another call and not accepting new calls"
🔊 User A hears busy tone
```

**If User B has `allowMultipleCalls = false`:**
```
✅ User B already on their max (1 call)
📞 User A sees: "User is on 1 calls (maximum: 1)"
🔊 User A hears busy tone
```

**If User B has reached `maxSimultaneousCalls`:**
```
✅ User B is at their limit (e.g., 3 calls)
📞 User A sees: "User is on 3 calls (maximum: 3)"
🔊 User A hears busy tone
```

**If Admin calls:**
```
⚠️ Admin overrides busy status
✅ Call connects anyway
📢 User B sees: "ADMIN OVERRIDE - You are busy but admin is connecting"
🔊 Emergency alert sound plays
```

---

### Group Calls (Broadcast)

**Scenario**: User A calls Group (5 members), 2 members are busy

**Behavior:**
```
✅ Connection sent to ALL 5 members
📞 3 available members connect
❌ 2 busy members silently skipped
🔇 NO busy tone to caller
✅ Caller sees: "Connected to 3 people"
```

**Why silent skip?**
- Group calls are broadcasts
- Some members being busy is normal/expected
- Caller cares about who connects, not who doesn't
- Avoids noisy error messages
- Clean user experience

**Result:**
- Group call succeeds with available members
- Busy members don't interrupt their existing calls
- No error notifications clutter the UI
- Smooth experience for everyone

---

## Database Schema

### User Model (`server/models/User.js`)

```javascript
settings: {
  // Block incoming calls when already in a call
  blockCallsWhenBusy: {
    type: Boolean,
    default: false
  },
  
  // Allow multiple simultaneous calls
  allowMultipleCalls: {
    type: Boolean,
    default: true
  },
  
  // Maximum simultaneous calls (if allowMultipleCalls is true)
  maxSimultaneousCalls: {
    type: Number,
    default: 3,
    min: 1,
    max: 10
  }
}
```

---

## Usage in React

### Hook: `useInstantIntercom`

```javascript
import { useInstantIntercom } from './hooks/useInstantIntercom';

function MyComponent() {
  const {
    blockCallsWhenBusy,
    allowMultipleCalls,
    maxSimultaneousCalls,
    setBlockCallsWhenBusy,
    setAllowMultipleCalls,
    setMaxSimultaneousCalls
  } = useInstantIntercom();

  return (
    <div>
      {/* Toggle: Block calls when busy */}
      <label>
        <input
          type="checkbox"
          checked={blockCallsWhenBusy}
          onChange={(e) => setBlockCallsWhenBusy(e.target.checked)}
        />
        Block incoming calls when I'm busy
      </label>

      {/* Toggle: Allow multiple calls */}
      <label>
        <input
          type="checkbox"
          checked={allowMultipleCalls}
          onChange={(e) => setAllowMultipleCalls(e.target.checked)}
        />
        Allow multiple simultaneous calls
      </label>

      {/* Slider: Max calls */}
      {allowMultipleCalls && (
        <div>
          <label>Maximum simultaneous calls: {maxSimultaneousCalls}</label>
          <input
            type="range"
            min="1"
            max="10"
            value={maxSimultaneousCalls}
            onChange={(e) => setMaxSimultaneousCalls(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  );
}
```

---

## User Scenarios

### Scenario 1: Trader Wants Focus
**Need**: Trader wants to focus on one call at a time

**Settings:**
- `blockCallsWhenBusy = true`
- `allowMultipleCalls = false`

**Result:**
- Only 1 call at a time
- All other callers get busy tone
- Clean, focused communication

---

### Scenario 2: Manager Needs Flexibility
**Need**: Manager wants to juggle multiple conversations

**Settings:**
- `blockCallsWhenBusy = false`
- `allowMultipleCalls = true`
- `maxSimultaneousCalls = 5`

**Result:**
- Can be on up to 5 calls simultaneously
- Accepts new calls while already talking
- Full multitasking capability

---

### Scenario 3: Emergency Override
**Need**: Admin needs to reach someone urgently

**Action:** Admin calls user who is busy

**Result:**
- ⚠️ Call connects despite busy status
- 🔊 Emergency alert plays
- 📢 Special notification shown
- ✅ User can still reject if needed

---

## Error Messages

### Caller Receives (1-to-1 only):

**DND:**
```
🔕 User has Do Not Disturb enabled
```

**Busy:**
```
📞 User is on another call
```

**Max Calls:**
```
📵 User has reached maximum calls
```

### Recipient Receives:

**Admin Override (DND):**
```
⚠️ ADMIN OVERRIDE - Emergency Connection
```

**Admin Override (Busy):**
```
⚠️ ADMIN OVERRIDE - You are busy but admin is connecting
You have 2 active call(s)
```

---

## Backend Helper Functions

### Check if User is in Call
```javascript
isUserInCall(userId)
// Returns: boolean
```

### Get Call Count
```javascript
getUserCallCount(userId)
// Returns: number (0-10)
```

### Get Active Calls
```javascript
getUserActiveCalls(userId)
// Returns: Array of call objects
```

---

## Testing Checklist

### Basic Functionality
- [ ] User enables "Block when busy"
- [ ] Second caller gets busy message
- [ ] User disables "Block when busy"
- [ ] Second caller connects successfully

### Multiple Calls
- [ ] User sets max to 3
- [ ] First 3 calls connect
- [ ] 4th caller gets "max reached" message
- [ ] User ends 1 call
- [ ] 4th caller can now connect

### Group Calls
- [ ] Call group with 5 members
- [ ] 2 members busy (blocked)
- [ ] 3 members connect
- [ ] NO busy error shown to caller
- [ ] Call succeeds with 3 participants

### Admin Override
- [ ] User busy and blocking calls
- [ ] Admin calls user
- [ ] Call connects with override notification
- [ ] User sees alert with call count
- [ ] User can still disconnect

---

## API Endpoints (Future)

To save settings to database:

```javascript
PUT /api/user/settings/call-handling
{
  "blockCallsWhenBusy": true,
  "allowMultipleCalls": true,
  "maxSimultaneousCalls": 3
}
```

To get current settings:

```javascript
GET /api/user/settings/call-handling
```

---

## Summary

✅ **Implemented:**
- Block calls when busy (user setting)
- Multiple simultaneous calls (user setting)
- Max call limit (configurable 1-10)
- Admin override for emergencies
- Silent skip for group calls
- Busy tone for 1-to-1 calls

✅ **Key Differences:**
- **1-to-1**: Caller gets busy error/tone
- **Group**: Busy members silently skipped
- **Admin**: Always connects with override

✅ **User Control:**
- Full control over availability
- Flexible settings per user
- Can change anytime
- Persists across sessions (when saved to DB)

---

## Future Enhancements

1. **Auto-mode**: Automatically block calls when on important call
2. **Priority callers**: Whitelist specific users who can always connect
3. **Time-based**: Block calls during specific hours
4. **Smart routing**: Forward to colleague when busy
5. **Call waiting**: Queue instead of block

---

**Feature Status: ✅ COMPLETE**

Ready to use! Settings available in `useInstantIntercom` hook.

