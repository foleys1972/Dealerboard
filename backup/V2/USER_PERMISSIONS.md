# User Permissions & Access Control

## Overview

TradePulse implements role-based access control (RBAC) to ensure regular users cannot access administrative functions.

---

## Roles

### 1. **User** (Standard Trading Floor User)
Default role for all traders and staff.

### 2. **Admin** (System Administrator)
IT staff and compliance officers only.

---

## User Capabilities ✅

### Calling Features:
- ✅ Make **direct 1-to-1 calls**
- ✅ Call **hunt groups** (shared lines)
- ✅ Receive incoming calls
- ✅ Transfer calls
- ✅ Hold/resume calls
- ✅ Mute/unmute microphone

### Broadcast Monitoring:
- ✅ Monitor **multiple broadcasts simultaneously** (10+)
- ✅ Adjust **individual volume** for each broadcast
- ✅ Turn broadcast monitors **ON/OFF**
- ✅ See who is speaking on broadcasts
- ✅ Listen to broadcasts while on calls

### Personal Settings:
- ✅ Set **Do Not Disturb** (DND)
- ✅ Configure **Call Forward** (to extension or voicemail)
- ✅ Set presence status (Available, Busy, Away, DND)
- ✅ View personal call history
- ✅ Adjust audio/video preferences

---

## User Restrictions ❌

### Administrative Functions:
- ❌ **Cannot create hunt groups**
- ❌ **Cannot delete hunt groups**
- ❌ **Cannot add/remove users**
- ❌ **Cannot access admin panel**
- ❌ **Cannot manage system settings**

### Recordings & Compliance:
- ❌ **Cannot access call recordings**
- ❌ **Cannot download recordings**
- ❌ **Cannot delete recordings**
- ❌ **Cannot view compliance data**
- ❌ **Cannot access audit logs**

### Federation & Infrastructure:
- ❌ **Cannot manage federation settings**
- ❌ **Cannot configure Matrix servers**
- ❌ **Cannot view server status**
- ❌ **Cannot manage SIP gateways**

---

## Feature Comparison

| Feature | User | Admin |
|---------|------|-------|
| **Direct Calls** | ✅ | ✅ |
| **Hunt Group Calls** | ✅ | ✅ |
| **Monitor Broadcasts** | ✅ (10+) | ✅ |
| **Individual Volume Control** | ✅ | ✅ |
| **Do Not Disturb** | ✅ | ✅ |
| **Call Forward** | ✅ | ✅ |
| **Set Status** | ✅ | ✅ |
| **Create Groups** | ❌ | ✅ |
| **Delete Groups** | ❌ | ✅ |
| **Manage Users** | ❌ | ✅ |
| **Access Recordings** | ❌ | ✅ |
| **Delete Recordings** | ❌ | ✅ |
| **Admin Panel** | ❌ | ✅ |
| **Compliance Dashboard** | ❌ | ✅ |
| **Federation Management** | ❌ | ✅ |
| **System Settings** | ❌ | ✅ |

---

## User Interface

### User View (Default):
```
┌─────────────────────────────────────┐
│ 🎙️ TradePulse                      │
│                        [Settings]   │
├─────────────────────────────────────┤
│ Quick Actions:                      │
│ [DND] [Call Forward] [10 Monitors]  │
├─────────────────────────────────────┤
│ Broadcast Monitors:                 │
│ ┌─────────────────────────────────┐ │
│ │ FX Desk          [ON]  ████ 80% │ │
│ │ Trading Floor    [OFF]           │ │
│ │ Sales Desk       [ON]  ████ 60% │ │
│ │ Management       [ON]  ████ 90% │ │
│ │ ... (6 more)                     │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Hunt Groups:                        │
│ ┌─────────────────────────────────┐ │
│ │ FX Desk (3/5 available)     [📞]│ │
│ │ Sales Team (6/8 available)  [📞]│ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Direct Contacts:                    │
│ ┌─────────────────────────────────┐ │
│ │ 🟢 John Smith - Ext 1001    [📞]│ │
│ │ 🔴 Sarah Johnson - Ext 1002 [📞]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**No Admin buttons, no recordings access, no group management.**

---

## Broadcast Monitoring Details

### Capabilities:
- **Simultaneous monitors**: 10+ broadcasts
- **Individual volume**: 0-100% per broadcast
- **Visual indicators**: See who's speaking
- **Persistent**: Monitors stay active across sessions
- **While on calls**: Can monitor broadcasts during calls

### Example:
```javascript
Broadcast Monitors:
┌────────────────────────────────────────┐
│ FX Desk            [ON]  ████████ 80% │
│ Trading Floor      [OFF]               │
│ Sales Desk         [ON]  ██████ 60%   │
│ Management         [ON]  █████████ 90% │
│ Compliance         [ON]  ███████ 70%  │
│ IT Support         [OFF]               │
│ Risk Management    [ON]  ██████ 60%   │
│ Operations         [OFF]               │
│ Emergency          [ON]  ██████████ 100%│
│ Global Trading     [ON]  ████████ 75% │
└────────────────────────────────────────┘
Currently monitoring: 7 broadcasts
```

---

## DND & Call Forward

### Do Not Disturb:
- **Effect**: Blocks all incoming calls
- **Status**: Shows as "DND" to other users
- **Broadcasts**: Still can monitor broadcasts
- **Toggle**: One-click ON/OFF

### Call Forward:
- **Options**:
  - Forward to extension
  - Forward to voicemail
  - Forward to external number
- **Conditions**:
  - Immediate forward
  - Forward when busy
  - Forward when no answer (timeout)
- **Status**: Visible to admins only (for troubleshooting)

---

## Security & Compliance

### What Users CAN'T Do:
1. ❌ Delete or tamper with recordings
2. ❌ Hide call history (admins see all)
3. ❌ Disable recording
4. ❌ Access other users' call logs
5. ❌ Modify system configurations
6. ❌ Create backdoor access

### What's Always Recorded:
- ✅ All calls (direct and hunt group)
- ✅ All broadcast transmissions
- ✅ Call metadata (time, duration, participants)
- ✅ DND and call forward settings changes
- ✅ Login/logout events

---

## Backend API Protection

### Protected Admin Endpoints:

```javascript
// ❌ Users CANNOT access these:
POST   /api/groups/create          // Create hunt group
DELETE /api/groups/:id             // Delete hunt group
GET    /api/recordings             // List recordings
GET    /api/recordings/:id         // Get recording
DELETE /api/recordings/:id         // Delete recording
GET    /api/admin/users            // User management
POST   /api/admin/users            // Create user
GET    /api/compliance/reports     // Compliance data
POST   /api/federation/servers     // Federation config
```

### User Allowed Endpoints:

```javascript
// ✅ Users CAN access these:
POST   /api/call/direct            // Make direct call
POST   /api/call/hunt              // Call hunt group
POST   /api/broadcast/monitor      // Toggle broadcast monitor
PUT    /api/broadcast/:id/volume   // Adjust volume
PUT    /api/user/dnd               // Set DND
PUT    /api/user/forward           // Set call forward
PUT    /api/user/status            // Set presence status
GET    /api/user/history/personal  // Own call history
```

### Middleware Protection:

```javascript
const { adminOnly, requirePermission } = require('../middleware/roleCheck');

// Admin-only route
router.post('/groups/create', adminOnly, createGroup);

// Permission-based route
router.get('/recordings', requirePermission('ACCESS_RECORDINGS'), getRecordings);
```

---

## Default User Configuration

When a new user account is created:

```javascript
{
  "role": "user",              // Default role
  "permissions": {
    "makeDirectCall": true,
    "makeHuntCall": true,
    "monitorBroadcasts": true,
    "adjustVolume": true,
    "setDND": true,
    "setCallForward": true,
    // Admin permissions: false
    "createGroups": false,
    "accessRecordings": false,
    "adminPanel": false
  },
  "settings": {
    "maxBroadcasts": 10,       // Can monitor 10+ broadcasts
    "dnd": false,
    "callForward": {
      "enabled": false,
      "destination": null
    }
  }
}
```

---

## Assigning Admin Role

**Only via backend (secure):**

```javascript
// In database or admin CLI tool
const user = await User.findById(userId);
user.role = 'admin';
await user.save();
```

**NOT via UI** - Users cannot promote themselves.

---

## Audit Trail

All actions are logged:

```
[2025-11-06 20:15:32] User user-001 set DND to ON
[2025-11-06 20:16:45] User user-001 enabled call forward to ext 1099
[2025-11-06 20:17:12] User user-001 started monitoring broadcast: FX Desk
[2025-11-06 20:17:30] User user-001 adjusted FX Desk volume to 75%
[2025-11-06 20:18:00] User user-001 initiated hunt call to Sales Team
[2025-11-06 20:18:05] ⚠️ User user-001 DENIED access to /api/recordings (permission: ACCESS_RECORDINGS)
```

---

## Implementation Status

### ✅ Completed:
- User interface without admin features
- 10+ broadcast monitors with individual volume
- DND and call forward controls
- Backend role middleware
- Permission checking

### 🚧 To Implement:
- WebRTC call integration
- Socket.IO real-time broadcast streaming
- Database user role persistence
- Admin dashboard (separate UI)
- LDAP/AD integration for role assignment

---

## Testing User Permissions

### Test Scenarios:

1. **✅ User makes direct call** → Should succeed
2. **✅ User adjusts broadcast volume** → Should succeed
3. **✅ User sets DND** → Should succeed
4. **❌ User tries GET /api/recordings** → Should get 403 Forbidden
5. **❌ User tries POST /api/groups/create** → Should get 403 Forbidden
6. **❌ User accesses /admin in UI** → Route doesn't exist for users

---

## Summary

**Users can:**
- ✅ Make and receive calls
- ✅ Monitor 10+ broadcasts with individual volume control
- ✅ Set DND and call forwarding
- ✅ Manage personal settings

**Users cannot:**
- ❌ Create/delete groups
- ❌ Access recordings
- ❌ Access admin functions
- ❌ Manage other users
- ❌ View compliance data

This ensures **trading floor users** have full communication capabilities while maintaining **security and compliance** through strict access controls.

