# Technical Specification Review: Matrix-Based Global Soft Dealerboard

## Executive Summary

This document reviews the provided technical specification against the current codebase implementation, highlighting conflicts, gaps, and required changes before any modifications are made.

**Review Date:** 2025-11-18  
**Specification Version:** 1.0  
**Codebase:** Trading Intercom System

---

## 1. Architecture Conflicts & Gaps

### 1.1 Current vs. Specified Architecture

**Specification States:**
- Three-tier architecture: Publishers/Subscribers/Orchestrator → Matrix Homeservers → Web Clients
- Subscriber service manages call routing, topology decisions, and group call modes
- Matrix homeservers are federated across regions (US, UK, APAC)

**Current Implementation:**
- ✅ Subscriber service exists (`server/services/subscriberService.js`)
- ✅ Orchestrator service exists (`server/services/orchestratorService.js`)
- ✅ Publisher/Subscriber pattern exists (`server/services/publisherSubscriberService.js`)
- ✅ Matrix homeserver support exists (`server/services/matrixService.js`)
- ✅ Federation service exists (`server/services/federationService.js`)
- ⚠️ **GAP**: Subscriber service currently handles WebSocket connections to publishers but doesn't have the group call management endpoints specified

**Conflicts:**
- ❌ **CONFLICT**: Spec says "Subscriber does NOT manage Zoom/Teams calls" but current system may have mixed responsibilities
- ❌ **GAP**: No `/api/subscriber/group/*` endpoints exist (required per spec section 7.1)
- ❌ **GAP**: No `/api/subscriber/broadcast/*` endpoints exist (required per spec section 7.2)
- ❌ **GAP**: No `/api/subscriber/call/initiate` endpoint exists (required per spec section 5.1)

---

## 2. Communication Modes: Current vs. Specified

### 2.1 Mode Comparison

| Mode | Spec Status | Current Status | Notes |
|------|-------------|----------------|-------|
| **Intercom (1:1)** | ✅ Specified | ⚠️ Partial | Uses Matrix but may not have Subscriber routing |
| **Group Call - First-Answer** | ✅ Specified | ⚠️ Partial | GroupService has `callMode: 'hunt'` (similar concept) but no FIRST_ANSWER mode |
| **Group Call - Remain-Group** | ✅ Specified | ⚠️ Partial | GroupService has `callMode: 'conference'` but behavior differs |
| **Broadcast (Hoot)** | ✅ Specified | ✅ Exists | GroupService has broadcast/hoot functionality |
| **ARD** | ✅ Specified | ✅ Exists | `dealerboard_private_wires` table has `mode: 'ARD'` |
| **MRD** | ✅ Specified | ✅ Exists | `dealerboard_private_wires` table has `mode: 'MRD'` |
| **Zoom** | ✅ Specified | ✅ Exists | Zoom integration exists |
| **Teams** | ✅ Specified | ✅ Exists | Teams integration exists |

### 2.2 Detailed Mode Conflicts

#### Intercom Mode

**Spec Requirements:**
- Always 1:1 (two participants only)
- Purple/violet color scheme
- Quick double-beep ring tone (`intercom-ring.mp3`)
- Manual answer required
- Automatic answer with announcement & visual notification ❗ (conflicting requirement)

**Current Implementation:**
- ✅ 1:1 calls supported via Matrix/WebRTC
- ❓ Color scheme not verified in UI
- ❓ Ring tone not verified
- ⚠️ **CONFLICT**: Spec says both "manual answer required" AND "automatic answer with announcement" - needs clarification

#### Group Call - First-Answer Mode

**Spec Requirements:**
- Mode: `FIRST_ANSWER`
- First person to answer connects 1:1 with initiator
- Others' alerts cancelled immediately
- Teal/cyan color scheme
- Triple-beep ring tone (`group-ring.mp3`)

**Current Implementation:**
- ⚠️ GroupService uses `callMode: 'hunt'` (similar but different terminology)
- ⚠️ `socketHandlers.js` line 694 has `'firstResponder1to1'` mode (similar concept)
- ❌ **GAP**: No explicit `FIRST_ANSWER` constant or mode
- ❌ **GAP**: No alert cancellation logic for non-answerers
- ❌ **GAP**: No Subscriber API endpoint `/api/subscriber/group/initiate`
- ❌ **GAP**: No Subscriber API endpoint `/api/subscriber/group/answer`

#### Group Call - Remain-Group Mode

**Spec Requirements:**
- Mode: `REMAIN_GROUP`
- All who answer join conference
- P2P initially, escalates to room on 3rd participant
- Teal/cyan color scheme

**Current Implementation:**
- ✅ GroupService has `callMode: 'conference'` (similar concept)
- ❌ **GAP**: No explicit `REMAIN_GROUP` constant
- ❌ **GAP**: Topology logic may not match spec (spec says P2P initially, room on 3rd)
- ❌ **GAP**: No Subscriber coordination for sequential answers

#### Broadcast Mode

**Spec Requirements:**
- Persistent Matrix rooms (always exist)
- PTT mode or Open Mic mode
- Green color scheme
- Rapid beeping (`broadcast-ring.mp3`)
- Manual join (not auto-answer)

**Current Implementation:**
- ✅ GroupService has `hootState` and `startHoot()`/`stopHoot()` methods
- ✅ PTT functionality exists (`addHootListener`)
- ❌ **GAP**: No verification that rooms are persistent (vs. dynamic)
- ❌ **GAP**: No `/api/subscriber/broadcast/*` endpoints
- ❓ Color scheme not verified

#### ARD/MRD Modes

**Spec Requirements:**
- ARD: Blue color, urgent double-ring, high-priority
- MRD: Orange color, standard ring, general purpose
- Both: Video supported for 1:1 internal calls

**Current Implementation:**
- ✅ Database supports ARD/MRD in `dealerboard_private_wires.mode`
- ❌ **GAP**: No color scheme verification in UI
- ❌ **GAP**: Ring tones not verified
- ❓ Video support not verified

---

## 3. Database Schema Conflicts

### 3.1 Spec Requirements vs. Current Schema

**Spec Section 14.1: Line Configuration Table**

**Spec Requires:**
```sql
CREATE TABLE line_configurations (
  line_id VARCHAR(255) PRIMARY KEY,
  line_type VARCHAR(50) NOT NULL,  -- INTERCOM, GROUP, BROADCAST, ARD, MRD
  label VARCHAR(255) NOT NULL,
  group_mode VARCHAR(50),  -- FIRST_ANSWER, REMAIN_GROUP
  broadcast_mode VARCHAR(50),  -- PTT, OPEN_MIC
  ...
)
```

**Current Schema:**
- ✅ `dealerboard_private_wires` table exists with `mode` (ARD, MRD, HOOT)
- ✅ `dealerboard_button_assignments` table exists
- ❌ **GAP**: No unified `line_configurations` table
- ❌ **GAP**: No `group_mode` field for FIRST_ANSWER vs REMAIN_GROUP
- ❌ **GAP**: Group call lines not stored in dealerboard tables (stored in `groups` table instead)

**Spec Section 14.2: Call Session Table**

**Spec Requires:**
```sql
CREATE TABLE call_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  group_mode VARCHAR(50),  -- FIRST_ANSWER, REMAIN_GROUP
  first_answerer_user_id VARCHAR(255),
  ...
)
```

**Current Implementation:**
- ❌ **GAP**: No `call_sessions` table exists
- ⚠️ Sessions may be tracked in memory or different tables
- ❌ **GAP**: No `first_answerer_user_id` tracking

**Spec Section 14.3: Recording Metadata Extensions**

**Spec Requires:**
- `group_call_mode` field (FIRST_ANSWER, REMAIN_GROUP)
- `broadcast_mode` field (PTT, OPEN_MIC)
- `invited_no_answer` JSON field for group calls

**Current Implementation:**
- ✅ `recordings` table exists (need to verify schema matches)
- ❌ **GAP**: Schema verification needed

---

## 4. API Endpoint Gaps

### 4.1 Missing Subscriber API Endpoints

**Spec Section 7.1 - Group Call Endpoints:**
- ❌ `POST /api/subscriber/group/initiate` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/group/answer` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/group/cancel` - **NOT IMPLEMENTED**
- ❌ `GET /api/subscriber/group/status/{sessionId}` - **NOT IMPLEMENTED**

**Spec Section 7.2 - Broadcast Endpoints:**
- ❌ `POST /api/subscriber/broadcast/activate` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/broadcast/join` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/broadcast/leave` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/broadcast/close` - **NOT IMPLEMENTED**

**Spec Section 5.1 - Standard Call Endpoints:**
- ❌ `POST /api/subscriber/call/initiate` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/call/answer` - **NOT IMPLEMENTED**
- ❌ `POST /api/subscriber/call/join` - **NOT IMPLEMENTED**

**Current Routes:**
- ✅ `/api/groups/*` exists (but different purpose - Matrix group management)
- ✅ `/api/dealerboard/*` exists (line configuration, not call routing)
- ✅ Subscriber routes exist but only for subscriber management (CRUD), not call routing

---

## 5. WebSocket Event Gaps

### 5.1 Missing WebSocket Events

**Spec Section 7.3 Requires:**
- ❌ `group-call-answered` event - **NOT IMPLEMENTED**
- ❌ `group-call-participant-joined` event - **NOT IMPLEMENTED**
- ❌ `group-call-no-answer` event - **NOT IMPLEMENTED**
- ❌ `group-call-cancelled` event - **NOT IMPLEMENTED**
- ❌ `broadcast-activated` event - **NOT IMPLEMENTED**
- ❌ `broadcast-participant-joined` event - **NOT IMPLEMENTED**
- ❌ `broadcast-closed` event - **NOT IMPLEMENTED**
- ❌ `ptt-transmit-start` / `ptt-transmit-end` events - **NOT IMPLEMENTED**

**Current Implementation:**
- ✅ Socket.IO handlers exist (`server/socketHandlers.js`)
- ⚠️ Need to verify if these specific events are emitted

---

## 6. Terminology Conflicts

### 6.1 Mode Naming

| Spec Term | Current Term | Status |
|-----------|--------------|--------|
| `FIRST_ANSWER` | `hunt` / `firstResponder1to1` | ❌ **CONFLICT** - Need standardization |
| `REMAIN_GROUP` | `conference` | ❌ **CONFLICT** - Need standardization |
| `BROADCAST` | `hoot` / `broadcast` | ⚠️ Mixed usage |
| `INTERCOM` | (not explicitly named) | ❌ **GAP** - No explicit constant |

### 6.2 Database Field Names

- **Spec**: `line_type` (INTERCOM, GROUP, BROADCAST, ARD, MRD)
- **Current**: `mode` in `dealerboard_private_wires` (ARD, MRD, HOOT)
- **Conflicts:**
  - Spec separates INTERCOM, GROUP, BROADCAST as distinct types
  - Current system uses HOOT for broadcasts
  - Current system doesn't distinguish INTERCOM vs GROUP in dealerboard tables

---

## 7. Client-Side Implementation Gaps

### 7.1 Missing UI Components

**Spec Section 10.1 Requires:**
- ❌ `<group-call-button>` Web Component - **NOT FOUND** (React components instead)
- ❌ `<broadcast-button>` Web Component - **NOT FOUND**
- ❌ `<call-alert-group>` Component - **NOT FOUND**
- ❌ `<broadcast-notification>` Component - **NOT FOUND**
- ❌ `<ptt-button>` Component - **NOT FOUND**

**Current Implementation:**
- ✅ `<LineButton>` exists (React component, not Web Component)
- ✅ Dealerboard UI exists (`DealerboardTab.js`)
- ⚠️ **ARCHITECTURE CONFLICT**: Spec says "Vanilla JavaScript with Web Components" but current is React

### 7.2 Missing Client-Side Managers

**Spec Section 13.1 Requires:**
- ❌ `group-call-manager.js` - **NOT FOUND**
- ❌ `broadcast-manager.js` - **NOT FOUND** (hoot functionality exists in GroupService server-side)

**Current Implementation:**
- ✅ `useWebRTC` hook exists (MediaSoup integration)
- ✅ `useSocket` hook exists
- ❌ **GAP**: No dedicated group call manager on client

---

## 8. Critical Implementation Gaps

### 8.1 Group Call - First-Answer Mode Logic

**Missing:**
1. Subscriber API to initiate group call
2. Simultaneous Matrix invite sending
3. Race condition detection (who answered first)
4. Alert cancellation for non-answerers
5. WebSocket events for cancellation
6. "Answered by X" notification display

### 8.2 Group Call - Remain-Group Mode Logic

**Missing:**
1. Sequential answer tracking
2. Topology transition logic (P2P → room on 3rd answer)
3. Participant migration (leave P2P, join room)
4. No-answer timeout handling per participant
5. Session state management in Subscriber

### 8.3 Broadcast Mode

**Missing:**
1. Subscriber API endpoints
2. Persistent room verification (vs. dynamic creation)
3. Activation notification via WebSocket
4. Manual join flow (not auto-answer)
5. PTT client-side implementation (exists server-side but may not be exposed)

### 8.4 Topology Decision Logic

**Spec Section 6.1:**
- Topology decision matrix for 2, 3+, single-region, multi-region
- Subscriber should make topology decisions

**Current:**
- ⚠️ Topology logic may exist in MediaSoup/WebRTC services
- ❌ **GAP**: No centralized Subscriber topology decision engine as described

---

## 9. Recording Gaps

### 9.1 Metadata Extensions

**Spec Requires:**
- `groupCallMode` field (FIRST_ANSWER, REMAIN_GROUP)
- `broadcastMode` field (PTT, OPEN_MIC)
- `invitedButNoAnswer` array for group calls
- `firstAnswerer` field
- `answerOrder` for each participant

**Current:**
- ✅ Recording service exists
- ❌ **GAP**: Schema verification needed to confirm all metadata fields exist

---

## 10. Architecture Decisions Required

### 10.1 Client Technology Stack

**Spec Says:**
> "Vanilla JavaScript with Web Components architecture"

**Current:**
- React with functional components and hooks
- Styled Components (not Web Components)

**Decision Required:**
- ❓ Should we refactor to Web Components?
- ❓ Or update spec to reflect React architecture?

### 10.2 Database: MongoDB vs. PostgreSQL

**Spec References:**
- Section 14 mentions JSON schema examples (MongoDB-style)

**Current:**
- PostgreSQL with JSONB columns
- `GroupCall.js` model uses Mongoose (MongoDB), but main database is PostgreSQL

**Conflict:**
- ❌ **CONFLICT**: `server/models/GroupCall.js` uses Mongoose (MongoDB) but system uses PostgreSQL
- ❌ **CONFLICT**: Group call configuration should be in PostgreSQL, not MongoDB

### 10.3 Subscriber Service Role

**Spec Says:**
> "Subscriber/Orchestrator Service... Does NOT manage Zoom/Teams calls (only Matrix calls)"

**Current:**
- Subscriber service exists but unclear if it handles call routing as specified
- Need verification of responsibilities

---

## 11. Required Changes Summary

### 11.1 High Priority (Blocking Implementation)

1. **Create Subscriber API Routes:**
   - `/api/subscriber/group/*` endpoints
   - `/api/subscriber/broadcast/*` endpoints
   - `/api/subscriber/call/*` endpoints

2. **Database Schema Updates:**
   - Create `line_configurations` table OR extend existing tables
   - Create `call_sessions` table
   - Add `group_mode` field (FIRST_ANSWER vs REMAIN_GROUP)
   - Add `broadcast_mode` field (PTT vs OPEN_MIC)

3. **Standardize Mode Constants:**
   - Replace `'hunt'` with `'FIRST_ANSWER'`
   - Replace `'conference'` with `'REMAIN_GROUP'` (or keep both for compatibility)
   - Add `'INTERCOM'` constant

4. **Group Call Logic:**
   - Implement first-answer race condition detection
   - Implement alert cancellation for non-answerers
   - Implement sequential answer tracking for remain-group

5. **WebSocket Events:**
   - Implement all group call events
   - Implement all broadcast events

### 11.2 Medium Priority (Functionality Gaps)

1. **Client-Side Components:**
   - Group call button component
   - Broadcast button component
   - Group call alert component
   - PTT button component

2. **Topology Management:**
   - Centralize topology decision logic in Subscriber
   - Implement P2P → room migration

3. **UI Polish:**
   - Color schemes per mode (purple, teal, green, blue, orange)
   - Ring tone files (`intercom-ring.mp3`, `group-ring.mp3`, etc.)

### 11.3 Low Priority (Enhancements)

1. **Documentation:**
   - API documentation updates
   - User training materials

2. **Testing:**
   - Group call test scenarios (spec section 15)
   - Broadcast test scenarios

---

## 12. Questions & Clarifications Needed

1. **Intercom Mode:** Spec says both "manual answer required" AND "automatic answer with announcement" - which is correct?

2. **Database:** Should we use existing `groups` table or create new `line_configurations` table? Spec shows unified table but current has separate tables.

3. **MongoDB vs PostgreSQL:** `GroupCall.js` model uses Mongoose but system is PostgreSQL - should we remove MongoDB dependency?

4. **Client Architecture:** Spec says "Vanilla JavaScript with Web Components" but codebase is React - should spec be updated or codebase refactored?

5. **Subscriber Service Scope:** Verify that Subscriber should handle ALL Matrix call routing as described, or if some logic should remain in Matrix/WebRTC services.

6. **Terminology:** Should we standardize on spec terms (FIRST_ANSWER, REMAIN_GROUP) or keep current terms (hunt, conference)?

---

## 13. Compatibility Notes

### 13.1 Backward Compatibility Concerns

- Existing `callMode: 'hunt'` groups would need migration to `FIRST_ANSWER`
- Existing `callMode: 'conference'` groups would need migration to `REMAIN_GROUP`
- Database schema changes may require migration scripts

### 13.2 Integration Points

- Matrix homeserver federation (already exists)
- MediaSoup WebRTC (already exists)
- Recording service (already exists, may need metadata extensions)
- Socket.IO handlers (already exists, needs new events)

---

## 14. Recommendations

1. **Agree on Architecture First:**
   - React vs Web Components
   - PostgreSQL schema design
   - Subscriber service scope

2. **Implement in Phases:**
   - Phase 1: Database schema updates
   - Phase 2: Subscriber API endpoints
   - Phase 3: Group call logic (first-answer)
   - Phase 4: Group call logic (remain-group)
   - Phase 5: Broadcast enhancements
   - Phase 6: Client UI updates

3. **Maintain Existing Functionality:**
   - Don't break existing broadcast/hoot functionality
   - Keep ARD/MRD working during transition
   - Ensure backward compatibility where possible

---

**END OF REVIEW**

This review identifies major gaps that need to be addressed before implementing the specification. The core architecture exists but the specific API endpoints, mode constants, and client components need to be created or updated to match the specification.
