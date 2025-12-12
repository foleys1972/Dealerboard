# Hunt Group vs. Conference Call Configuration

## Overview

TradePulse supports two distinct group calling modes that can be configured by administrators:

### 1. **Hunt Mode** (Default)
Race condition - first person to answer gets a 1-to-1 call

### 2. **Conference Mode**
All who answer join a multi-party conference

---

## Hunt Mode (1-to-Many → 1-to-1)

### Behavior:
```
Caller initiates hunt call
    ↓
All group members' phones ring 🔔🔔🔔
    ↓
First person answers ✅
    ↓
All other phones stop ringing ❌❌
    ↓
1-to-1 call between caller and answerer
```

### Example:
```
Manager calls "FX Desk" hunt group (5 traders)
  → Trader A's phone rings 🔔
  → Trader B's phone rings 🔔
  → Trader C's phone rings 🔔
  → Trader D's phone rings 🔔
  → Trader E's phone rings 🔔
  
  → Trader B answers first ✅
  
  → Everyone else stops ringing ❌❌❌❌
  
Result: Manager talks 1-on-1 with Trader B
```

### Configuration:
```javascript
{
  "callMode": "hunt",
  "huntSettings": {
    "strategy": "simultaneous",      // or "sequential"
    "ringTimeout": 30000,             // 30 seconds
    "cancelOthersOnAnswer": true      // Stop others when answered
  }
}
```

### Strategy Options:

**Simultaneous** (default):
- All members ring at once
- Race to answer

**Sequential**:
- Ring members in priority order
- Next person rings if timeout
- Like an escalation chain

---

## Conference Mode (1-to-Many → N-to-N)

### Behavior:
```
Caller initiates conference call
    ↓
All group members' phones ring 🔔🔔🔔
    ↓
Member A answers → Joins conference ✅
Member B answers → Joins conference ✅
Member C answers → Joins conference ✅
    ↓
Everyone hears everyone
Multi-party conference call
```

### Example:
```
Manager calls "Executive Team" conference group
  → VP Sales rings 🔔
  → VP Operations rings 🔔
  → CFO rings 🔔
  
  → VP Sales answers → Joins ✅
  → CFO answers → Joins ✅
  → VP Operations doesn't answer
  
Result: Manager + VP Sales + CFO in 3-way conference
```

### Configuration:
```javascript
{
  "callMode": "conference",
  "conferenceSettings": {
    "maxParticipants": 50,      // Max conference size
    "autoRecord": true,          // Always record
    "waitForHost": false,        // Start without host
    "muteOnJoin": false          // Join unmuted
  }
}
```

---

## Comparison Table

| Feature | Hunt Mode | Conference Mode |
|---------|-----------|-----------------|
| **Purpose** | Reach ANY available person | Talk to MULTIPLE people |
| **Ringing** | All ring | All ring |
| **First Answer** | Becomes 1-to-1 | Joins conference |
| **Second Answer** | Too late (call active) | Joins conference |
| **Result** | 1-to-1 call | Multi-party conference |
| **Use Case** | "Get me someone NOW!" | "Team discussion" |
| **Recording** | 1-to-1 stream | Multi-track mixing |
| **Cancel Others** | Yes ✅ | No ❌ |

---

## Admin Configuration

### Creating a Hunt Group:

```bash
POST /api/admin/groups/create
```

```json
{
  "groupId": "fx-desk-hunt",
  "name": "FX Desk",
  "description": "FX Trading Desk - Hunt Line",
  "callMode": "hunt",
  "huntSettings": {
    "strategy": "simultaneous",
    "ringTimeout": 30000,
    "cancelOthersOnAnswer": true
  },
  "members": [
    { "userId": "trader-001", "priority": 1 },
    { "userId": "trader-002", "priority": 1 },
    { "userId": "trader-003", "priority": 2 }
  ]
}
```

### Creating a Conference Group:

```bash
POST /api/admin/groups/create
```

```json
{
  "groupId": "executive-conference",
  "name": "Executive Team",
  "description": "Executive Team Conference",
  "callMode": "conference",
  "conferenceSettings": {
    "maxParticipants": 10,
    "autoRecord": true,
    "waitForHost": true,
    "muteOnJoin": false
  },
  "members": [
    { "userId": "ceo-001", "isHost": true },
    { "userId": "cfo-001", "isHost": false },
    { "userId": "vp-sales-001", "isHost": false }
  ]
}
```

---

## User Experience

### From User's Perspective:

**Hunt Group:**
```
User clicks "Call FX Desk"
  → Shows: "Calling FX Desk (3 available)"
  → Waiting for first answer...
  → Connected to: John Smith
```

**Conference Group:**
```
User clicks "Call Executive Team"
  → Shows: "Starting conference..."
  → Participants joining:
    ✅ Sarah (CFO)
    ⏳ Mike (VP Sales) - ringing
    ✅ Lisa (COO)
  → 3 participants in conference
```

---

## Switching Between Modes

### Can admin change mode after creation?

**Yes!** Groups can be reconfigured:

```bash
PUT /api/admin/groups/{groupId}
```

```json
{
  "callMode": "conference"  // Switch from hunt to conference
}
```

**Warning:** Changing mode affects all future calls to this group.

---

## Advanced: Hybrid Mode (Future Enhancement)

### Start as Hunt, Escalate to Conference:

```javascript
{
  "callMode": "hybrid",
  "hybridSettings": {
    "startAs": "hunt",              // First answer → 1-to-1
    "allowEscalation": true,        // Can add others
    "escalateButton": true,         // UI button to add participants
    "autoEscalateAfter": null       // or time in ms
  }
}
```

**Use case:**
1. Hunt call finds first available trader
2. Trader realizes they need help
3. Clicks "Add Participant" 
4. Call becomes conference with additional traders

---

## IPTV Multicast Integration

### Groups can subscribe to IPTV streams:

```json
{
  "groupId": "market-data-hoot",
  "name": "Market Data Hoot",
  "callMode": "broadcast",          // One-way broadcast
  "iptvStream": {
    "enabled": true,
    "multicastAddress": "239.1.1.10",
    "port": 5004,
    "codec": "G.722",
    "ssrc": "12345678",
    "description": "Live market data audio feed"
  }
}
```

**Users can monitor IPTV streams just like broadcasts!**

---

## User Search & Favorites

### Users can search all groups:

```bash
GET /api/favorites/search?query=FX&type=groups
```

**Returns:**
```json
{
  "groups": [
    {
      "id": "fx-desk-hunt",
      "name": "FX Desk",
      "type": "hunt",
      "memberCount": 5,
      "hasIPTV": false
    },
    {
      "id": "fx-market-data",
      "name": "FX Market Data",
      "type": "conference",
      "memberCount": 0,
      "hasIPTV": true
    }
  ]
}
```

### Add to favorites:

```bash
POST /api/favorites/groups
```

```json
{
  "groupId": "fx-desk-hunt",
  "nickname": "My FX Team"
}
```

**Favorites appear at top of user's call list for quick access!**

---

## Implementation Checklist

### ✅ Backend Completed:
- [x] GroupCall model with hunt/conference modes
- [x] UserFavorites model
- [x] IPTV stream service (multicast UDP)
- [x] Favorites API routes
- [x] IPTV API routes
- [x] Search functionality

### 🚧 To Implement:
- [ ] WebRTC hunt call logic (cancel others on answer)
- [ ] WebRTC conference mixing (MediaSoup SFU)
- [ ] IPTV → WebRTC bridge
- [ ] User interface for search & favorites
- [ ] Admin UI for group configuration
- [ ] Real-time group member availability
- [ ] Call statistics and analytics

---

## Testing Examples

### Test Hunt Mode:

```javascript
// Create hunt group
const huntGroup = {
  groupId: 'test-hunt',
  callMode: 'hunt',
  members: ['user1', 'user2', 'user3']
};

// Initiate call
socket.emit('call:hunt', { groupId: 'test-hunt' });

// Simulate answers:
// user2 answers first → call connects to user2
// user1, user3 calls cancelled automatically
```

### Test Conference Mode:

```javascript
// Create conference group
const confGroup = {
  groupId: 'test-conf',
  callMode: 'conference',
  members: ['user1', 'user2', 'user3']
};

// Initiate call
socket.emit('call:conference', { groupId: 'test-conf' });

// Simulate answers:
// user1 answers → joins conference
// user3 answers → joins conference (now 3-way)
// user2 doesn't answer → not in conference
```

### Test IPTV Stream:

```javascript
// Subscribe to multicast stream
fetch('/api/iptv/subscribe', {
  method: 'POST',
  body: JSON.stringify({
    streamId: 'market-data',
    multicastAddress: '239.1.1.10',
    port: 5004,
    codec: 'G.722'
  })
});

// Stream audio packets bridge to WebRTC
// Users hear broadcast in real-time
```

---

## Summary

- **Hunt Mode**: Race to answer, first wins, becomes 1-to-1
- **Conference Mode**: All answers join, multi-party conference
- **Admin Configurable**: Each group has its own mode
- **User Search**: Find and favorite groups easily
- **IPTV Support**: Subscribe to multicast audio streams
- **Flexible**: Modes can be changed anytime by admins

This gives trading floors the flexibility they need for different communication scenarios while maintaining simplicity for end users.

