# Next Steps: Implementation Roadmap

## ✅ Completed (Backend)

All backend infrastructure is complete:
- ✅ Database schema (call_sessions, recordings, line_configurations)
- ✅ Subscriber API routes (group calls, broadcasts, standard calls)
- ✅ WebSocket events (all event types implemented)
- ✅ Database helper functions (all CRUD operations)
- ✅ Recording service integration
- ✅ Terminology standardization (FIRST_ANSWER/REMAIN_GROUP)

## 🎯 Recommended Next Steps (Priority Order)

### 1. **Test Subscriber API Endpoints** (Quick Win - 1-2 hours)
**Why first:** Validate that all the backend work is functioning correctly before building client integration.

**Tasks:**
- Create test script or Postman collection
- Test all `/api/subscriber/*` endpoints
- Verify authentication works
- Test WebSocket events are emitted
- Validate database writes/reads

**Files to create:**
- `tests/subscriberApi.test.js` or Postman collection
- Test data setup scripts

---

### 2. **Update Existing Call Flows to Use Subscriber API** (Medium - 4-6 hours)
**Why:** Integrate the new subscriber API into existing call initiation flows so they benefit from the new session tracking.

**Tasks:**
- Find where calls are currently initiated (likely in socket handlers or call managers)
- Update to call `/api/subscriber/call/initiate` or `/api/subscriber/group/initiate`
- Pass `sessionId` to recording service
- Update call state management to track sessions

**Files to update:**
- `server/socketHandlers.js` - Call initiation handlers
- Any client-side call managers
- Recording service calls (already updated to accept sessionId)

---

### 3. **Client-Side Group Call Manager** (High Priority - 8-12 hours)
**Why:** This is core functionality per the spec. Users need to be able to initiate and manage group calls.

**Tasks:**
- Create `client/src/managers/groupCallManager.js`
- Implement FIRST_ANSWER mode logic
- Implement REMAIN_GROUP mode logic
- Handle WebSocket events (`group-call-answered`, `group-call-participant-joined`)
- Integrate with Matrix SDK for actual calls
- Handle alert cancellation for non-answerers

**Key Features:**
- Initiate group calls via subscriber API
- Track pending answers
- Handle first-answer race condition
- Manage topology transitions (P2P → room)
- Update UI when alerts are cancelled

---

### 4. **Client-Side Broadcast Manager** (High Priority - 6-8 hours)
**Why:** Broadcast functionality is a key feature for trading floor communications.

**Tasks:**
- Create `client/src/managers/broadcastManager.js`
- Implement broadcast activation
- Handle PTT mode (hold to talk)
- Manage persistent room joins
- Handle WebSocket events (`broadcast-activated`, `broadcast-participant-joined`)

**Key Features:**
- Activate broadcasts via subscriber API
- Join/leave broadcast rooms
- PTT button handling (mouse and keyboard)
- Visual indicators for who's transmitting

---

### 5. **React Components for Group Calls & Broadcasts** (Medium - 6-8 hours)
**Why:** Users need UI to interact with the new call types.

**Tasks:**
- Create `GroupCallButton` component
- Create `BroadcastButton` component
- Create `GroupCallAlert` component (with mode indicator)
- Create `BroadcastNotification` component
- Create `ParticipantListExtended` component
- Create `PTTButton` component
- Update existing call UI to show new call types

**Components needed:**
- `client/src/components/GroupCallButton/GroupCallButton.js`
- `client/src/components/BroadcastButton/BroadcastButton.js`
- `client/src/components/GroupCallAlert/GroupCallAlert.js`
- `client/src/components/BroadcastNotification/BroadcastNotification.js`
- `client/src/components/PTTButton/PTTButton.js`

---

### 6. **Admin UI for Line Configuration** (Medium - 4-6 hours)
**Why:** Admins need to configure group calls and broadcasts.

**Tasks:**
- Create admin interface for configuring group call lines
- Allow setting FIRST_ANSWER vs REMAIN_GROUP mode
- Configure participant lists
- Set timeouts
- Configure broadcast lines (PTT vs OPEN_MIC)
- Set authorized participants

**Files to create/update:**
- `client/src/components/AdminLineConfig/AdminLineConfig.js`
- Update existing admin interfaces

---

### 7. **Integration Testing** (Medium - 4-6 hours)
**Why:** Ensure everything works together end-to-end.

**Test Scenarios:**
1. Group call FIRST_ANSWER mode:
   - Initiate → All receive alerts → First answer → Others cancelled
2. Group call REMAIN_GROUP mode:
   - Initiate → Sequential answers → Room creation → All in conference
3. Broadcast:
   - Activate → Notifications → Join → PTT → Leave
4. Cross-region calls:
   - Test with users on different homeservers
5. Recording integration:
   - Verify recordings saved to database with correct metadata

---

### 8. **Documentation Updates** (Low Priority - 2-4 hours)
**Why:** Keep documentation in sync with implementation.

**Tasks:**
- Update API documentation
- Create user guide for group calls and broadcasts
- Update admin documentation
- Create migration guide for existing data

---

## Quick Start Options

### Option A: Test First (Recommended)
Start with testing the subscriber API to validate backend before building client.

### Option B: Client Integration First
Jump into building the group call manager if you want to see UI working quickly.

### Option C: Admin Tools First
Build the admin interface for configuring lines so you can set up test data easily.

---

## Estimated Timeline

- **Testing & Validation:** 2-4 hours
- **Client-Side Implementation:** 20-30 hours
- **Integration & Testing:** 8-12 hours
- **Documentation:** 2-4 hours

**Total:** ~32-50 hours for complete implementation

---

## Questions to Consider

1. **Subscriber Service:** Do you have a separate subscriber service that will call these APIs, or is the main server acting as both publisher and subscriber?

2. **Client Architecture:** The spec mentions "Vanilla JavaScript with Web Components" but the codebase is React. Should we:
   - Keep React and build React components?
   - Create Web Components that work with React?
   - Refactor to Vanilla JS (major undertaking)?

3. **Matrix Integration:** How should group calls integrate with Matrix? Should they:
   - Use Matrix rooms directly?
   - Use the subscriber service to manage Matrix?
   - Hybrid approach?

4. **Testing Priority:** Which is more important:
   - Backend API testing first?
   - End-to-end user flows?
   - Performance testing?

Let me know which direction you'd like to take next!

