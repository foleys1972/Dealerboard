# Architecture Review: Federated Matrix Homeserver Proposal

## Current Architecture Analysis

### Current State:
1. **Single Matrix Homeserver**: One Matrix instance configured via environment variables
2. **FederationService**: Exists but is for inter-server WebSocket communication, NOT Matrix federation
3. **Subscribers Table**: Used for connecting to other intercom servers (not Matrix homeservers)
4. **Locations Table**: Exists but not used for geographic routing
5. **Room Creation**: Direct creation in MatrixService, no orchestration layer
6. **Participant Tracking**: Local per-server, no cross-region tracking
7. **User Assignment**: No geographic routing logic

## Proposed Architecture

```
Subscriber/Orchestrator Layer (Global)
  ↓
US Matrix ←→ UK Matrix ←→ APAC Matrix (Federated)
  ↓           ↓            ↓
US Clients   UK Clients   APAC Clients
```

## Required Changes - TODO List

### 1. **Orchestrator Service (NEW)**
**Priority: HIGH**
- Create new `orchestratorService.js` that acts as global coordination layer
- Responsibilities:
  - Room creation decision logic (which homeserver to create room on)
  - Geographic routing decisions (route users to nearest homeserver)
  - Cross-region participant tracking
  - Federation coordination between homeservers
- Database: New `orchestrator_config` table for global settings
- API: New `/api/orchestrator/*` routes

### 2. **Matrix Homeserver Registry (NEW)**
**Priority: HIGH**
- Database: New `matrix_homeservers` table:
  - `id`, `region` (US/UK/APAC), `server_name`, `base_url`, `federation_url`, 
  - `is_active`, `capacity`, `current_load`, `location_id`, `metadata`
- Service: `matrixHomeserverRegistry.js` to manage multiple homeserver connections
- Update MatrixService to support multiple homeserver clients (one per region)

### 3. **Geographic Routing Logic (NEW)**
**Priority: HIGH**
- Database: Add `region` field to `users` table (US/UK/APAC)
- Database: Add `region` field to `locations` table
- Service: `geographicRoutingService.js`:
  - Determine user's region based on location_id or explicit assignment
  - Route room creation requests to appropriate homeserver
  - Route user connections to nearest homeserver
- Client: Add region detection/selection in login/connection flow

### 4. **Matrix Federation Setup (MODIFY)**
**Priority: HIGH**
- Current: FederationService is for WebSocket inter-server communication
- Needed: True Matrix federation between homeservers
- Changes:
  - Configure Matrix homeservers to federate with each other
  - Update MatrixService to handle federated room creation
  - Ensure rooms created on one homeserver are accessible from others
  - Handle cross-homeserver user invitations

### 5. **Room Creation Orchestration (MODIFY)**
**Priority: HIGH**
- Current: `matrixService.createGroupRoom()` creates room directly
- Needed: Route through orchestrator for decision making
- Changes:
  - Orchestrator decides which homeserver to create room on
  - Consider factors: participant locations, homeserver load, latency
  - Create room on selected homeserver
  - Sync room metadata across homeservers if needed

### 6. **Participant Tracking (MODIFY)**
**Priority: MEDIUM**
- Current: Local tracking per server
- Needed: Cross-region participant tracking
- Changes:
  - Database: Track which homeserver each participant is connected to
  - Database: Track which homeserver each room exists on
  - Service: Aggregate participant lists across homeservers
  - API: Return unified participant list regardless of homeserver

### 7. **User-Homeserver Assignment (NEW)**
**Priority: MEDIUM**
- Database: Add `matrix_homeserver_id` to `users` table
- Database: Add `preferred_region` to `users` table
- Service: Auto-assign users to homeserver based on location/region
- Admin UI: Allow manual assignment/override
- Client: Connect to assigned homeserver on login

### 8. **Client Routing (MODIFY)**
**Priority: MEDIUM**
- Current: Client connects to single server
- Needed: Client routes to appropriate regional homeserver
- Changes:
  - Client detects/selects region on login
  - Client connects to regional Matrix homeserver
  - Client connects to regional intercom server (if separate)
  - Handle failover if regional server unavailable

### 9. **Subscriber/Orchestrator Integration (MODIFY)**
**Priority: MEDIUM**
- Current: Subscribers are for intercom server connections
- Needed: Subscribers could represent Matrix homeservers OR orchestrator nodes
- Changes:
  - Clarify subscriber role: intercom server vs Matrix homeserver
  - Or create separate `matrix_homeservers` table (preferred)
  - Orchestrator coordinates with all homeservers

### 10. **Database Schema Updates**
**Priority: HIGH**
- New tables:
  - `matrix_homeservers` (id, region, server_name, base_url, federation_url, is_active, capacity, current_load, location_id)
  - `matrix_room_assignments` (room_id, homeserver_id, created_at)
  - `user_homeserver_assignments` (user_id, homeserver_id, assigned_at, is_primary)
  - `orchestrator_config` (key, value, updated_at)
- Modify tables:
  - `users`: Add `region`, `matrix_homeserver_id`, `preferred_region`
  - `locations`: Add `region`
  - `matrix_chat_rooms`: Add `homeserver_id`, `region`

### 11. **API Changes**
**Priority: HIGH**
- New routes:
  - `/api/orchestrator/rooms/create` - Orchestrated room creation
  - `/api/orchestrator/routing/assign-homeserver` - Get user's assigned homeserver
  - `/api/orchestrator/participants/:roomId` - Cross-region participant list
  - `/api/matrix/homeservers` - List all homeservers
  - `/api/matrix/homeservers/:id/status` - Homeserver status
- Modify routes:
  - `/api/matrix/room` - Route through orchestrator
  - `/api/auth/login` - Return assigned homeserver info

### 12. **Configuration Changes**
**Priority: MEDIUM**
- Environment variables:
  - `ORCHESTRATOR_ENABLED=true`
  - `ORCHESTRATOR_URL` (if separate service)
  - `MATRIX_REGION` (US/UK/APAC)
  - `MATRIX_HOMESERVERS` (comma-separated list of homeserver URLs)
  - `MATRIX_FEDERATION_ENABLED=true` (already exists, needs proper setup)

### 13. **Client Changes**
**Priority: MEDIUM**
- Login flow:
  - Detect/select region
  - Get assigned homeserver from API
  - Connect to regional homeserver
  - Handle region switching
- UI:
  - Show current region/homeserver
  - Allow region selection (if user has access)
  - Show cross-region participant indicators

### 14. **Migration Strategy**
**Priority: LOW (but important)**
- Migration script to:
  - Assign existing users to regions based on location
  - Assign existing rooms to homeservers
  - Set up initial homeserver registry
  - Configure federation between homeservers

## Implementation Phases

### Phase 1: Foundation
1. Database schema updates
2. Matrix homeserver registry
3. Geographic routing service
4. User-homeserver assignment

### Phase 2: Orchestration
1. Orchestrator service
2. Room creation orchestration
3. Cross-region participant tracking

### Phase 3: Federation
1. Matrix federation setup
2. Cross-homeserver room access
3. Federated user invitations

### Phase 4: Client Integration
1. Client routing
2. Region detection/selection
3. UI updates

## Questions to Resolve

1. **Orchestrator Deployment**: 
   - Separate service or part of main server?
   - Single instance or distributed?

2. **Homeserver Management**:
   - Self-hosted Matrix servers or external?
   - How to provision/manage homeservers?

3. **Room Placement Strategy**:
   - Create on majority participant's region?
   - Create on lowest load homeserver?
   - Allow manual selection?

4. **Failover Strategy**:
   - What happens if regional homeserver is down?
   - Fallback to another region?

5. **Data Replication**:
   - Do we need cross-region data replication?
   - Or just federation for Matrix rooms?

6. **Subscriber vs Homeserver**:
   - Are subscribers the Matrix homeservers?
   - Or separate concept (intercom servers)?

## Estimated Complexity

- **High Complexity**: Orchestrator service, Matrix federation setup, geographic routing
- **Medium Complexity**: Database schema, API changes, client routing
- **Low Complexity**: UI updates, configuration

## Dependencies

- Matrix homeservers must be set up and federated
- DNS/network configuration for homeserver domains
- SSL certificates for homeserver domains
- Federation certificates for Matrix

