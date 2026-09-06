# Implementation Proposal: Specification Alignment

**Date:** 2025-11-18  
**Based on:** User decisions and technical specification

---

## ✅ Confirmation: WebSocket Usage

**Current State:** User client ALREADY uses WebSocket (Socket.IO) for:
- Real-time events (profile updates, call alerts, notifications)
- Bidirectional communication with server
- Connection status monitoring

**Also Uses:** REST API (Axios) for:
- Data fetching (groups, users, dealerboard config)
- CRUD operations
- Authentication

**Conclusion:** ✅ Hybrid approach is correct and aligns with specification. Both REST and WebSocket are needed - REST for data operations, WebSocket for real-time events.

---

## 1. API Endpoints - Implementation Proposal

### 1.1 New Subscriber Routes File

**File:** `server/routes/subscriberCallRoutes.js`

**Endpoints to Add:**

```javascript
// Group Call Endpoints
POST /api/subscriber/group/initiate
POST /api/subscriber/group/answer
POST /api/subscriber/group/cancel
GET /api/subscriber/group/status/:sessionId

// Broadcast Endpoints
POST /api/subscriber/broadcast/activate
POST /api/subscriber/broadcast/join
POST /api/subscriber/broadcast/leave
POST /api/subscriber/broadcast/close

// Standard Call Endpoints
POST /api/subscriber/call/initiate
POST /api/subscriber/call/answer
POST /api/subscriber/call/join
POST /api/subscriber/call/leave
```

**Integration:**
- Add to `server/routes/index.js`
- Use existing `authenticateToken` middleware
- Store session state in Subscriber service or database

---

## 2. Terminology Standardization - Implementation Proposal

### 2.1 Constants File

**File:** `server/constants/callModes.js`

```javascript
// Group Call Modes
exports.GROUP_MODE_FIRST_ANSWER = 'FIRST_ANSWER';
exports.GROUP_MODE_REMAIN_GROUP = 'REMAIN_GROUP';

// Broadcast Modes
exports.BROADCAST_MODE_PTT = 'PTT';
exports.BROADCAST_MODE_OPEN_MIC = 'OPEN_MIC';

// Line Types
exports.LINE_TYPE_INTERCOM = 'INTERCOM';
exports.LINE_TYPE_GROUP = 'GROUP';
exports.LINE_TYPE_BROADCAST = 'BROADCAST';
exports.LINE_TYPE_ARD = 'ARD';
exports.LINE_TYPE_MRD = 'MRD';

// Legacy support (for backward compatibility)
exports.LEGACY_HUNT = 'hunt'; // Maps to FIRST_ANSWER
exports.LEGACY_CONFERENCE = 'conference'; // Maps to REMAIN_GROUP
```

### 2.2 Migration Strategy

1. **Add new constants alongside existing values**
2. **Create helper function to normalize modes:**
   ```javascript
   function normalizeCallMode(mode) {
     if (mode === 'hunt' || mode === 'firstResponder1to1') {
       return 'FIRST_ANSWER';
     }
     if (mode === 'conference') {
       return 'REMAIN_GROUP';
     }
     return mode; // Already normalized (FIRST_ANSWER, REMAIN_GROUP)
   }
   ```
3. **Update GroupService to accept both old and new modes**
4. **Database migration script to update existing records**
5. **Phase out legacy terms over time**

### 2.3 Files to Update

- `server/services/groupService.js` - Use normalized modes internally
- `server/socketHandlers.js` - Convert `firstResponder1to1` to `FIRST_ANSWER`
- `server/models/GroupCall.js` - Update enum values (if keeping MongoDB model)
- All API endpoints - Accept both, normalize internally

---

## 3. Database Schema Updates - Implementation Proposal

### 3.1 Recommendation: EXTEND Existing Tables

**Rationale:**
- Dealerboard tables already exist and are in use
- Creating new unified table would require complex migration
- Extending preserves existing data and relationships
- Can create views/helpers for unified access if needed

### 3.2 Schema Changes

#### A. Extend `groups` Table (for Matrix group calls)

```sql
-- Add group mode for group calls
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS group_mode VARCHAR(50) 
  CHECK (group_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP', 'hunt', 'conference'));

-- Add broadcast mode for broadcast/hoot groups
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS broadcast_mode VARCHAR(50) 
  CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC', 'ptt', 'open_mic'));

-- Add line type to distinguish INTERCOM vs GROUP vs BROADCAST
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS line_type VARCHAR(50) 
  DEFAULT 'GROUP' 
  CHECK (line_type IN ('INTERCOM', 'GROUP', 'BROADCAST'));

-- Add persistent room flag for broadcasts
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS is_persistent_room BOOLEAN 
  DEFAULT FALSE;

-- Add call timeout and ring timeout
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS call_timeout INT DEFAULT 30;
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS ring_timeout INT DEFAULT 60;

-- Add authorized initiators (JSONB array)
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS authorized_initiators JSONB DEFAULT '[]'::jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_groups_group_mode ON groups(group_mode);
CREATE INDEX IF NOT EXISTS idx_groups_line_type ON groups(line_type);
```

#### B. Extend `dealerboard_private_wires` Table (for ARD/MRD/HOOT)

```sql
-- Add line type (intercom lines can be stored here too)
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS line_type VARCHAR(50) 
  DEFAULT 'PRIVATE_WIRE'
  CHECK (line_type IN ('INTERCOM', 'ARD', 'MRD', 'HOOT', 'PRIVATE_WIRE'));

-- Add group mode if it's a group call line
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS group_mode VARCHAR(50) 
  CHECK (group_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP'));

-- Add broadcast mode if it's a broadcast line
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS broadcast_mode VARCHAR(50) 
  CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC'));

-- Add persistent room ID for broadcasts
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS persistent_room_id VARCHAR(255);

-- Add timeout settings
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS call_timeout INT DEFAULT 30;
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS ring_timeout INT DEFAULT 60;

-- Add authorized initiators
ALTER TABLE dealerboard_private_wires 
ADD COLUMN IF NOT EXISTS authorized_initiators JSONB DEFAULT '[]'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_private_wires_line_type ON dealerboard_private_wires(line_type);
CREATE INDEX IF NOT EXISTS idx_private_wires_group_mode ON dealerboard_private_wires(group_mode);
```

#### C. Create `call_sessions` Table

```sql
CREATE TABLE IF NOT EXISTS call_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  line_id VARCHAR(255) NOT NULL,
  line_type VARCHAR(50) NOT NULL 
    CHECK (line_type IN ('INTERCOM', 'GROUP', 'BROADCAST', 'ARD', 'MRD')),
  
  -- Group call specific
  group_mode VARCHAR(50) 
    CHECK (group_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP')),
  first_answerer_user_id VARCHAR(255),
  
  -- Broadcast specific
  broadcast_activator_user_id VARCHAR(255),
  broadcast_room_id VARCHAR(255),
  broadcast_mode VARCHAR(50) 
    CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC')),
  
  -- Common fields
  initiator_user_id VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ended', 'cancelled', 'timeout')),
  
  -- Topology
  topology_type VARCHAR(50) 
    CHECK (topology_type IN ('P2P', 'single-room', 'dual-room-bridge', 'broadcast')),
  
  -- Participants tracking
  participants JSONB DEFAULT '[]'::jsonb, -- Array of participant objects with join/leave times
  invited_no_answer JSONB DEFAULT '[]'::jsonb, -- Users who were invited but didn't answer
  
  -- Rooms and bridges
  rooms JSONB DEFAULT '[]'::jsonb, -- Matrix room IDs involved
  bridges JSONB DEFAULT '[]'::jsonb, -- Bridge IDs if dual-room topology
  
  -- Metadata
  session_metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_sessions_line_id ON call_sessions(line_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_initiator ON call_sessions(initiator_user_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_start_time ON call_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_line_type ON call_sessions(line_type);
```

#### D. Extend `recordings` Table

```sql
-- Add group call mode
ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS group_call_mode VARCHAR(50) 
  CHECK (group_call_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP'));

-- Add broadcast mode
ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS broadcast_mode VARCHAR(50) 
  CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC'));

-- Add invited but no answer array
ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS invited_no_answer JSONB DEFAULT '[]'::jsonb;

-- Add first answerer tracking
ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS first_answerer_user_id VARCHAR(255);

-- Add answer order for participants
-- (This can be in the participants JSONB array, but adding explicit field for queries)
ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS answer_order JSONB DEFAULT '[]'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recordings_group_call_mode ON recordings(group_call_mode);
CREATE INDEX IF NOT EXISTS idx_recordings_broadcast_mode ON recordings(broadcast_mode);
CREATE INDEX IF NOT EXISTS idx_recordings_first_answerer ON recordings(first_answerer_user_id);
```

### 3.3 Migration Script

**File:** `server/scripts/migrate-call-modes.js`

```javascript
// Migrates existing 'hunt' to 'FIRST_ANSWER' and 'conference' to 'REMAIN_GROUP'
// Runs automatically on server startup or can be run manually
```

---

## 4. Group Call Logic Implementation - Proposal

### 4.1 First-Answer Mode Logic

**Implementation:** `server/services/groupCallService.js`

**Key Features:**
1. **Session Creation:**
   - Create `call_sessions` record with `group_mode: 'FIRST_ANSWER'`
   - Track all target users in `invited_no_answer`
   - Set status to 'pending'

2. **Simultaneous Invites:**
   - Send Matrix invites to all targets simultaneously
   - Record invitation timestamp for each

3. **First Answer Detection:**
   - Listen for first `POST /api/subscriber/group/answer` call
   - Mark answerer in `call_sessions.first_answerer_user_id`
   - Update status to 'active'
   - Set topology to 'P2P'

4. **Alert Cancellation:**
   - Emit WebSocket `group-call-answered` event to non-answerers
   - Update `invited_no_answer` to remove answerer
   - Update status in `call_sessions`

5. **Notification:**
   - Show "Answered by [Name]" to cancelled participants
   - Auto-dismiss after 2 seconds

### 4.2 Remain-Group Mode Logic

**Implementation:** Same service, different mode handling

**Key Features:**
1. **Sequential Answer Tracking:**
   - Track each answer in `call_sessions.participants` array
   - Include `answerOrder` and `answerTimestamp`
   - Update participant count

2. **Topology Transitions:**
   - First answer: P2P (2 participants)
   - Second answer: Evaluate topology, create room if needed
   - Third+ answer: Add to existing room or create new room based on geography

3. **No-Answer Handling:**
   - Track timeout per participant
   - Move to `invited_no_answer` when timeout expires
   - Continue call with answered participants

4. **Room Creation:**
   - Use Subscriber topology decision logic (Section 6.1)
   - Create Matrix room when needed
   - Emit `topology-change` WebSocket event

### 4.3 Session State Management

**Store in:**
- Database: `call_sessions` table (persistent)
- Memory: Subscriber service Map (fast lookup)
- Both: Write-through cache pattern

---

## 5. WebSocket Events - Implementation Proposal

### 5.1 New Socket Events

**Add to:** `server/socketHandlers.js`

**Group Call Events:**
```javascript
// Emit when first person answers (first-answer mode)
socket.emit('group-call-answered', {
  event: 'group-call-answered',
  sessionId: 'uuid',
  answeredBy: '@user:matrix.hsbc',
  displayName: 'User Name',
  action: 'cancel-alert',
  targetUsers: ['@other1:matrix.hsbc', '@other2:matrix.hsbc']
});

// Emit when additional person answers (remain-group mode)
socket.emit('group-call-participant-joined', {
  event: 'group-call-participant-joined',
  sessionId: 'uuid',
  joinedUserId: '@user:matrix.hsbc',
  displayName: 'User Name',
  currentCount: 3,
  topologyChange: true,
  newTopology: 'single-room',
  roomId: '!room123:matrix.hsbc'
});

// Emit when participant doesn't answer (timeout)
socket.emit('group-call-no-answer', {
  event: 'group-call-no-answer',
  sessionId: 'uuid',
  userId: '@user:matrix.hsbc',
  reason: 'timeout'
});

// Emit when call is cancelled
socket.emit('group-call-cancelled', {
  event: 'group-call-cancelled',
  sessionId: 'uuid',
  reason: 'cancelled-by-initiator' | 'timeout' | 'no-answer'
});
```

**Broadcast Events:**
```javascript
// Emit when broadcast is activated
socket.emit('broadcast-activated', {
  event: 'broadcast-activated',
  lineId: 'broadcast-001',
  sessionId: 'uuid',
  activatedBy: '@user:matrix.hsbc',
  displayName: 'User Name',
  roomId: '!broadcast123:matrix.hsbc',
  targetUsers: ['@user1:matrix.hsbc', '@user2:matrix.hsbc']
});

// Emit when participant joins broadcast
socket.emit('broadcast-participant-joined', {
  event: 'broadcast-participant-joined',
  sessionId: 'uuid',
  lineId: 'broadcast-001',
  joinedUserId: '@user:matrix.hsbc',
  displayName: 'User Name',
  currentCount: 2
});

// Emit when broadcast is closed
socket.emit('broadcast-closed', {
  event: 'broadcast-closed',
  sessionId: 'uuid',
  lineId: 'broadcast-001',
  closedBy: '@user:matrix.hsbc',
  participantsKicked: ['@user1:matrix.hsbc', '@user2:matrix.hsbc']
});
```

**PTT Events:**
```javascript
// Emit when PTT button pressed
socket.emit('ptt-transmit-start', {
  event: 'ptt-transmit-start',
  sessionId: 'uuid',
  userId: '@user:matrix.hsbc',
  displayName: 'User Name',
  timestamp: 'ISO-8601'
});

// Emit when PTT button released
socket.emit('ptt-transmit-end', {
  event: 'ptt-transmit-end',
  sessionId: 'uuid',
  userId: '@user:matrix.hsbc',
  timestamp: 'ISO-8601'
});
```

### 5.2 Client-Side Event Handlers

**Update:** `client/src/hooks/useSocket.js` or create new handlers

**Add event listeners:**
- Group call events → Update UI alerts
- Broadcast events → Show notifications
- PTT events → Update UI indicators

---

## 6. Client Architecture: React → Web Components

### 6.1 ⚠️ CRITICAL DECISION WARNING

**Current:** React 18 with functional components, hooks, styled-components  
**Target:** Vanilla JavaScript with Web Components

**Impact:**
- Complete rewrite of client application
- Loss of React ecosystem (react-query, react-router, etc.)
- Major architectural change affecting all UI components
- Estimated effort: 2-4 weeks full-time development

**Recommendation:**
- ❓ **Question:** Is this migration necessary, or can we keep React and update spec?
- ✅ **Alternative:** Keep React, update spec to reflect React architecture (modern, maintained, widely used)

**If Proceeding:**
- Phase 1: Create Web Components alongside React
- Phase 2: Migrate components one by one
- Phase 3: Replace React with Web Components
- Phase 4: Remove React dependencies

### 6.2 Implementation Strategy (If Proceeding)

1. **Create Web Components:**
   - `<group-call-button>`
   - `<broadcast-button>`
   - `<call-alert-group>`
   - `<broadcast-notification>`
   - `<ptt-button>`

2. **Build in parallel:**
   - Keep React app running
   - Build Web Component versions
   - Test side-by-side

3. **Gradual migration:**
   - Dealerboard page first
   - Then other pages
   - Finally routing

---

## 7. Remove MongoDB Dependency

### 7.1 Current Issue

**File:** `server/models/GroupCall.js`
- Uses Mongoose (MongoDB ORM)
- System uses PostgreSQL

### 7.2 Action Items

1. **Delete or refactor:**
   - Option A: Delete `server/models/GroupCall.js` (if unused)
   - Option B: Refactor to PostgreSQL query functions

2. **Check dependencies:**
   ```bash
   npm uninstall mongoose
   ```

3. **Update imports:**
   - Remove any `require('mongoose')` or `require('./models/GroupCall')`
   - Replace with PostgreSQL queries using `databaseService`

### 7.3 Files to Check

- `server/services/groupService.js` - Check if uses GroupCall model
- Any route files importing GroupCall model
- Database service should handle all PostgreSQL operations

---

## 8. Database vs. Extend Decision

### 8.1 Recommendation: **EXTEND Existing Tables**

**Rationale:**
1. **Data Preservation:** Existing dealerboard configurations stay intact
2. **Relationship Integrity:** Foreign keys remain valid
3. **Less Migration Risk:** No complex data migration needed
4. **Flexibility:** Can add unified views/helpers later if needed
5. **Backward Compatibility:** Existing code continues to work

### 8.2 Proposed Structure

```
dealerboard_private_wires  → ARD, MRD, HOOT (external SIP lines)
  + line_type: 'ARD' | 'MRD' | 'HOOT'
  + group_mode: 'FIRST_ANSWER' | 'REMAIN_GROUP' (if group call)
  + broadcast_mode: 'PTT' | 'OPEN_MIC' (if broadcast)

groups                      → INTERCOM, GROUP, BROADCAST (internal Matrix calls)
  + line_type: 'INTERCOM' | 'GROUP' | 'BROADCAST'
  + group_mode: 'FIRST_ANSWER' | 'REMAIN_GROUP'
  + broadcast_mode: 'PTT' | 'OPEN_MIC'

call_sessions               → Runtime call tracking (new table)
  + Links to line_id (could be from either table)
  + Tracks session state, participants, topology

recordings                  → Recording metadata (extended)
  + group_call_mode, broadcast_mode fields
```

### 8.3 Helper Functions

Create unified access layer:

```javascript
// server/services/lineConfigService.js
class LineConfigService {
  // Get line config by ID (works for both private_wires and groups)
  async getLineConfig(lineId, lineType) {
    if (lineType === 'ARD' || lineType === 'MRD' || lineType === 'HOOT') {
      return await this.getPrivateWire(lineId);
    }
    return await this.getGroup(lineId);
  }
}
```

---

## 9. Implementation Order

### Phase 1: Database & Constants (Week 1)
1. Create constants file
2. Run database migrations
3. Create migration script for existing data
4. Remove MongoDB/Mongoose dependency

### Phase 2: Subscriber API Endpoints (Week 2)
1. Create `subscriberCallRoutes.js`
2. Implement group call endpoints
3. Implement broadcast endpoints
4. Implement standard call endpoints
5. Add to route index

### Phase 3: Group Call Logic (Week 3)
1. Create `groupCallService.js`
2. Implement first-answer mode
3. Implement remain-group mode
4. Add session state management
5. Add alert cancellation logic

### Phase 4: WebSocket Events (Week 4)
1. Add new socket events to `socketHandlers.js`
2. Implement event emission logic
3. Update client event handlers
4. Test real-time updates

### Phase 5: Client Updates (Week 5-6)
1. Create group call UI components
2. Create broadcast UI components
3. Update dealerboard to use new components
4. Add event handling

### Phase 6: Testing & Refinement (Week 7-8)
1. Test all call modes
2. Test topology transitions
3. Test alert cancellation
4. Performance optimization

---

## 10. Files to Create/Modify

### New Files:
- `server/routes/subscriberCallRoutes.js`
- `server/services/groupCallService.js`
- `server/constants/callModes.js`
- `server/scripts/migrate-call-modes.js`
- `server/services/lineConfigService.js` (optional helper)

### Files to Modify:
- `server/routes/index.js` - Add new routes
- `server/services/databaseService.js` - Add schema migrations
- `server/services/groupService.js` - Update to use new modes
- `server/socketHandlers.js` - Add new events
- `server/services/subscriberService.js` - Add call routing logic
- `server/models/GroupCall.js` - Delete or refactor to PostgreSQL
- `client/src/hooks/useSocket.js` - Add event handlers
- All components using call modes - Update to new constants

---

## 11. Questions & Confirmations

### 11.1 Architecture Decision
**Question:** React → Web Components migration
- ⚠️ **Major change** - confirm before proceeding
- Recommendation: Keep React, update spec

### 11.2 Database Strategy
**Decision:** ✅ EXTEND existing tables
- Confirmed: Extend `groups` and `dealerboard_private_wires`
- Add new `call_sessions` table
- Extend `recordings` table

### 11.3 Terminology
**Decision:** ✅ Use FIRST_ANSWER / REMAIN_GROUP
- Will add migration for backward compatibility
- Phase out 'hunt' / 'conference' over time

### 11.4 Intercom Mode
**Decision:** ✅ Automatic answer unless DND (Do Not Disturb) invoked
- Need to implement DND feature
- Automatic answer with announcement + visual notification

---

## 12. Next Steps

1. **Confirm React → Web Components migration** (major architectural decision)
2. **Approve database schema changes** (see Section 3)
3. **Review API endpoint design** (see Section 1)
4. **Approve implementation order** (see Section 9)

Once confirmed, I'll proceed with implementation in the order specified.

---

**END OF PROPOSAL**
