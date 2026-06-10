# Intercom / Dealerboard – Live Handoff

This document is **live**. Keep it updated as development continues so a new agent can take over quickly.

## Changelog (newest first)

- **2026-01-06**
  - Documented the **two WPF clients** (Intercom-only vs Dealerboard+Intercom) and clarified that **both have full Intercom capability**.
  - Documented **Admin Portal ↔ WPF button layout parity** for Dealerboard (7×4 grid, 10 pages, `{button}-{page}` mapping).
  - Documented **Intercom button assignment storage strategy** in DB/API (page 0 mapping; `broadcast_id/group_id/contact_user_id`; `callMode=broadcast` filtering).
- **2026-01-07**
  - UC Sentinel: agreed **single global endpoint** for now; documented env vars + outbox delivery and alerting hooks.
  - Added Windows build path for UC Sentinel as a single executable via `build-uc-sentinel.bat` (bundles + packages `uc-sentinel.exe`).

## 1) What this system is

A SIP + WebRTC/Matrix “private wire” / dealerboard platform.

- **Dealerboard**: button-based UI for private wires, DDI (dial tone) lines, monitoring, speed dials.
- **Intercom groups**: group calls/hoots/broadcasts.
- **SIP gateway**: per-line SIP UAs, call lifecycle, DTMF digit sending, bridging to Matrix.
- **Publisher/Subscriber HA**: publisher coordinates database and global state; subscriber servers connect to publisher over WS.

## 2) Key architecture components (server)

- **Express API**
  - Entry: `server/index.js` mounts routes via `server/routes/index.js`
  - Dealerboard API: `server/routes/dealerboardRoutes.js`
  - System admin API: `server/routes/systemSettingsRoutes.js`
  - Intercom groups API: `server/routes/groupRoutes.js`

- **SIP subsystem**
  - `server/services/sipService.js`
    - `SIPGateway` loads lines from DB and creates a `SIPUserAgent` per line.
    - Handles making calls, DTMF, call state.
  - `server/services/sipMatrixBridge.js` bridges SIP RTP to Matrix rooms.

- **DB schema / migrations**
  - `server/services/databaseService.js` initializes tables and runs “create-if-not-exists” migrations.

- **Publisher/Subscriber**
  - `server/services/publisherSubscriberService.js`, `server/services/subscriberService.js`
  - Subscriber WS server:
    - Publisher exposes `/subscriber` WS endpoint for subscriber nodes.
  - Subscriber port pool:
    - Publisher allocates a unique port per subscriber from a configured pool.
    - Port allocations persist in DB (`subscriber_port_allocations`) and are visible on the subscriber record (`subscribers.connection_port`).

- **Redis**
  - `server/services/redisService.js`
  - Used for session/state and HA coordination.

## 3) Subscriber HA / Admin panel work (implemented)

### Admin UI panels

- **Subscriber Fleet / HA panel**
  - `client/src/components/AdminSubscriberFleet/AdminSubscriberFleet.js`
  - Wired into Admin Dashboard:
    - `client/src/pages/AdminDashboard/AdminDashboard.js`
  - Shows:
    - subscriber port allocations + live usage
    - node health (uses `/api/admin/health-check`)
    - orchestrator capacity/status (uses `/api/matrix/orchestrator/status`)
  - Action buttons (failover/failback/service control) currently placeholders until control-plane is implemented.

### Subscriber port pool + admin

- Port pool settings exposed via System Settings:
  - Backend:
    - `server/routes/systemSettingsRoutes.js`
  - UI:
    - `client/src/components/AdminSystemSettings/AdminSystemSettings.js`
- Publisher allocates a unique port per subscriber:
  - `server/services/publisherSubscriberService.js` `_allocateSubscriberPort()`

### Subscriber standalone DB configuration

- Subscriber nodes can be run with direct access to the primary Postgres DB for standalone operation.
- Example env template updated:
  - `build-subscriber.bat` now includes main DB connection variables in the generated `server.env.example` template.

### Location-based subscriber assignments (implemented)

Goal: route users to the correct subscriber pair based on location (primary/secondary), supporting travel overrides.

- DB:
  - `location_subscriber_assignments`
- Admin API:
  - `GET /api/locations/:id/subscriber-assignment`
  - `PUT /api/locations/:id/subscriber-assignment`
  - Implemented in `server/routes/locationRoutes.js`
- Admin UI:
  - `client/src/components/AdminSystemSettings/AdminSystemSettings.js`
  - Locations table has a “Subscriber Assignment” action to set primary/secondary subscribers per location.

### Per-user travel overrides (implemented)

Goal: allow ad-hoc per-user routing to a different location’s subscriber while optionally preserving recording origin.

- DB:
  - `user_travel_overrides`
- Admin API (platform_admin only):
  - `GET /api/platform-admin/travel-overrides` (activeOnly, username, userId filters)
  - `POST /api/platform-admin/travel-overrides` (creates new override and revokes any existing active override)
  - `POST /api/platform-admin/travel-overrides/:id/revoke`
  - Implemented in `server/routes/platformAdminRoutes.js`
- Admin UI (platform_admin only):
  - `client/src/components/AdminUserManagement/AdminUserManagement.js`
  - Per-user “Travel Override” action opens a modal to set/revoke an active override.

### Login routing fields / client routing behavior

- Auth responses augmented to include routing fields:
  - `server/routes/authRoutes.js` (login and `/me`)
  - Includes:
    - `locationId` (home)
    - `routingLocationId` (travel override if active, otherwise home)
    - `recordingOriginLocationId` (home by default; can be forced to travel location if `forceOrigin=true`)
    - `subscriberRouting` (primary/secondary subscriber endpoints for the routing location)
- Client routing prefers subscriber routing when present:
  - `client/src/services/clientRoutingService.js`
  - This avoids overwriting `matrixHomeserver` and keeps orchestrator routing intact.

### Publisher HA leader lock (schema only)

- DB:
  - `publisher_leader_lock` (DB lease/lock table)
- Endpoints + UI for promote/demote still pending.

## 3.2) Multi-site Subscriber HA + Cross-DC failover routing (in progress)

This is a **new requirement**: run subscriber services in HA pairs **per site/DC** and support cross-DC failover (whole-site and per-user/per-line overrides).

### Subscriber HA leader election (Redis lease per site)

- Implemented in subscriber build:
  - `dist/subscriber/server/services/subscriberHaService.js`
  - `dist/subscriber/server/index.js` initializes and exposes it via `app.locals.subscriberHaService`
- Environment variables:
  - `SITE_IDS=NYC-DC1,NYC-DC2` (subscriber process can participate in multiple sites)
  - `SERVER_ID=<unique node id>`
  - `SUBSCRIBER_HA_ENABLED` (default enabled; set to `false` to disable)
  - `SUBSCRIBER_HA_LEASE_TTL_MS` (default 15000)
  - `SUBSCRIBER_HA_POLL_INTERVAL_MS` (default 2000)
  - **Primary preference control (hybrid publisher/subscriber support):**
    - `SUBSCRIBER_HA_ACQUIRE_DELAY_MS`
      - `0` = attempt immediately (preferred primary)
      - higher values = wait before acquiring empty lease (backup / hybrid)
    - `SUBSCRIBER_HA_ACQUIRE_DELAY_JITTER_MS` (default 250)
- Redis keys:
  - `subscriber:ha:primary:<siteId>` (lease JSON: ownerServerId + fencingToken)
  - `subscriber:ha:fencing:<siteId>` (monotonic fencing token)

### Subscriber HA status endpoints

- `GET /api/admin/health-check` includes `health.subscriberHa`
- `GET /api/admin/ha-status` (admin-only) returns lightweight HA status

### Primary-only background loops gating (subscriber)

- `dist/subscriber/server/index.js` gates primary-only loops behind HA leadership:
  - recording archive retry loop
  - recording reconcile loop
- Shutdown hardening:
  - `dist/subscriber/server/index.js` stops `subscriberHaService` during graceful shutdown before Redis quit.

### Cross-DC failover routing primitives (schema + APIs)

Goal: allow failover at multiple levels:

- Whole-site failover: `NYC-DC1 -> NYC-DC2`
- Per-user failover override
- Per-line failover override

DB tables added in subscriber DB init (`dist/subscriber/server/services/databaseService.js`):

- `ha_service_sites`
- `ha_site_failover` (source_site_id -> target_site_id, revoke supported)
- `ha_entity_failover_overrides` (entity_type in `user|line`, entity_id, target_site_id, revoke supported)

Platform-admin APIs (subscriber build):

- Sites registry:
  - `GET /api/platform-admin/ha/sites`
  - `POST /api/platform-admin/ha/sites` (upsert)
- Site-wide failover:
  - `GET /api/platform-admin/ha/failover/sites`
  - `POST /api/platform-admin/ha/failover/sites` (set)
  - `POST /api/platform-admin/ha/failover/sites/revoke`
- Per-entity overrides:
  - `GET /api/platform-admin/ha/failover/overrides`
  - `POST /api/platform-admin/ha/failover/overrides` (set; revokes existing active override for entity)
  - `POST /api/platform-admin/ha/failover/overrides/:id/revoke`

Debug endpoint (platform-admin):

- `GET /api/platform-admin/ha/routing/user/:idOrUsername`
  - backed by `getEffectiveSiteForUser()` in `dist/subscriber/server/services/databaseService.js`
  - resolution precedence: user override -> site-wide mapping -> `users.site_id`

- `GET /api/platform-admin/ha/routing/line/:lineId`
  - backed by `getEffectiveSiteForLine()` in `dist/subscriber/server/services/databaseService.js`
  - supports BOTH `dealerboard_private_wires` and `dealerboard_ddi_lines`
  - resolution precedence: line override -> site-wide mapping -> line `site_id`

### Line routing enforcement (private wires + DDI)

Decision: cross-DC routing applies to **both**:

- `dealerboard_private_wires`
- `dealerboard_ddi_lines`

Implementation:

- DB: add `site_id` (home site) column to both line tables (migrated in `dist/subscriber/server/services/databaseService.js`).
- Enforced in SIP HA candidate selection:
  - `dist/subscriber/server/services/lineOwnershipService.js` filters candidate line IDs so the node only attempts to own lines whose **effectiveSiteId** matches `SITE_IDS`.
  - Effective site is computed as: per-line override -> site-wide failover -> home `site_id`.

### Traveller mode (location routing) vs cross-DC failover (site routing)

Potential conflict: traveller mode routes a user to a different **location** (`user_travel_overrides`) while cross-DC failover routes a user to a different **site/DC**.

Decision (proposed; implement consistently):

- Cross-DC routing decides **which site/DC owns the user/line** (authoritative for service ownership).
- Traveller mode remains **within-site location routing** and recording-origin rules.

Implementation note:

- Current login response (`dist/subscriber/server/routes/authRoutes.js`) already sets:
  - `routingLocationId` and `recordingOriginLocationId` based on travel override.
- Auth responses now also include:
  - `effectiveSiteId` (site/DC routing)
  - `homeSiteId`
  - `effectiveSiteSource` (`entity_override` | `site_failover` | `home`)
  and will log a warning when travel override is active while the user is failed over to a different site.

## 3.1) UC Trader / UC Sentinel (new; in progress)

UC Trader is the system name going forward.

UC Sentinel is a new deployable service intended to receive:

- audit logs
- alerts
- health checks (global + tenant/location scoped)
- voice recording validation checks (planned)
- call logging from turrets/subscribers (planned)

Key decisions:

- Delivery model: **Subscriber → UC Sentinel direct delivery** (avoids publisher becoming a global data concentrator).
- Data protection: **location-level** UC Sentinel endpoint configuration (residency by default).
  - **Current phase decision (2026-01-07)**: use **one global UC Sentinel endpoint** for all sites/locations (no per-location endpoint config yet).
- Global view: optional “single pane of glass” for alerts, configurable as:
  - a standalone aggregator, or
  - embedded into a designated UC Sentinel instance
  with residency-safe forwarding (rollups/redaction) by default.

Current implementation (skeleton):

- New folder: `uc-sentinel/` (separate deployable Node service)
  - `uc-sentinel/src/index.js`
  - `uc-sentinel/src/routes/ingest.js` (`/api/v1/ingest/audit|alerts|health`)
  - `uc-sentinel/src/routes/query.js` (starter `/api/v1/query/audit`)
  - `uc-sentinel/schema.sql` (Postgres tables)
  - Auth: `Authorization: Bearer <token>` backed by `sentinel_subscriber_tokens`

Intercom server integration (implemented):

- Delivery service: `server/services/ucSentinelDeliveryService.js`
- Outbox table: `uc_sentinel_outbox` (created in `server/services/databaseService.js`)
- Startup: subscriber nodes initialize delivery in `server/index.js`
- Emits:
  - **health** events periodically (includes outbox stats; can optionally include recording archive/reconcile health)
  - **audit** events (agent service control)
  - **alert** events (recording archive failures/backlog; archive/reconcile loop errors)

Env vars (global endpoint):

- `UC_SENTINEL_ENABLED=true`
- `UC_SENTINEL_URL=<global base url>` (e.g. `https://sentinel.example.com:8800`)
- `UC_SENTINEL_TOKEN=<bearer token>`
- Optional tuning:
  - `UC_SENTINEL_FLUSH_INTERVAL_MS` (default 5000)
  - `UC_SENTINEL_HEALTH_INTERVAL_MS` (default 30000)
  - `UC_SENTINEL_BATCH_SIZE` (default 50)
  - `UC_SENTINEL_MAX_ATTEMPTS` (default 25)
  - `UC_SENTINEL_INCLUDE_RECORDING_HEALTH=true` (adds archive scan details to health payload; potentially expensive)

Branding/assets:

- `UC.ico` and `uc.jpg` exist at repo root and are the new default assets for Windows EXEs and branding.

## 3.3) Reporting Server (planned)

The Reporting Server is a standalone service that provides:

- Call logging (metadata ingestion from dealerboard/subscriber/publisher)
- Recording validation / compliance checks (ensure each call has an associated recording + metadata)
- User/organization structure and authorization (users can access **only their own data** by default)
- Virtual Assistant (VA) query + enrichment (transcribe, summarize, playback)
- Control-plane integration back into Dealerboard for VA-triggered actions (e.g. “call John Smith”)

### Trust boundaries

- **Service-to-service ingestion (high trust)**
  - Dealerboard/subscriber publishes call metadata + recording notifications to Reporting Server.
  - Prefer mTLS and/or signed JWTs with per-node/per-site credentials.
  - Must be idempotent and auditable.

- **End-user query + VA (low trust)**
  - OIDC/JWT-based user auth (ideally reusing the existing Intercom identity).
  - Strict authorization: user can only view calls they own / participate in.

- **Action execution (safety critical)**
  - “Call X” requires permission checks, confirmation UX, and audit logs.
  - Reporting Server orchestrates; Dealerboard executes via a dedicated authenticated command channel.
  - Rhasspy handles wake-word / intent extraction on separate servers; Reporting Server enforces policy + execution.

### Proposed minimum data model (Postgres)

- **Tenancy / org structure**
  - `tenants` (or orgs)
  - `sites` (optional, if location/DC reporting boundaries are needed)
  - `users` (reference existing intercom user IDs; avoid duplicating auth)

- **Call tracking**
  - `calls`
    - `call_id` (UUID)
    - `call_reference` (stable correlation ID emitted by the calling system)
    - `initiator_user_id`
    - `direction`, `counterparty`, `line_id`, `session_id`, `subscriber_id`, `site_id`
    - `started_at`, `ended_at`, `duration_ms`
    - `metadata_json` (raw payload for forward compatibility)

- **Recording artifacts**
  - `recordings`
    - `recording_id` (UUID)
    - `call_id` (FK)
    - `storage_uri`, `sha256`, `size_bytes`, `codec`, `sample_rate`
    - `recorded_at`, `ingested_at`
    - `status` (`expected`, `present`, `missing`, `corrupt`, `archived`)

- **Reconciliation/audit timeline (append-only)**
  - `call_reconciliation_events`
    - `event_id` (UUID)
    - `call_id` (FK)
    - `type` (`call_metadata_received`, `recording_expected`, `recording_found`, `recording_missing`, `recording_verified`, `transcription_started`, ...)
    - `details_json`, `created_at`

- **Derived AI artifacts**
  - `transcripts` (Whisper output + metadata)
  - `summaries` (HF summary output + model metadata)
  - `va_command_audit` (who requested what action, when, outcome)

### Ingestion APIs (idempotent)

- `POST /api/v1/ingest/calls`
  - Upsert by `call_reference`.
  - Emit reconciliation event `call_metadata_received`.

- `POST /api/v1/ingest/recordings`
  - Link by `call_reference` or `call_id`.
  - Mark recording `present` and optionally verify existence/integrity.

- `POST /api/v1/admin/reconcile`
  - Force a scan for calls missing recordings after a configurable delay.

### VA behavior

- Queries like “what calls did I make last Tuesday” translate into DB queries scoped to the authenticated user.
- “Summarize call X” triggers an async pipeline:
  - Transcribe via Whisper
  - Summarize via HF model
  - Store derived artifacts and emit audit events
### Playback

- Prefer streaming endpoints or short-lived signed URLs.
- Never expose raw storage paths without auth checks.

### Open questions (must resolve before implementation)

- Identity: should Reporting Server validate existing Intercom JWTs directly?
- Correlation: what is the authoritative `call_reference` (`sessionId`, SIP Call-ID, `recordingId`, etc.)?
- Storage: where do recordings live (subscriber disk, file share, object storage) and how does Reporting Server access them?
- Multi-party calls: are calls owned by one user or shared among participants (requires `call_participants`)?
- Tech stack: Node/Express vs Python/FastAPI (Python is often easier for Whisper/HF pipelines).

### Call correlation contract (WPF ↔ server recordings)

Goal: Reporting Server must be able to match call metadata to recording artifacts reliably.

- Canonical call reference should be `callId` (the `instant-*` call id), and it must be present in:
  - call lifecycle events
  - recording upload metadata
  - archived recording metadata JSON

WPF implementation details:

- Model default:
  - `TradePulse.Client.Core/Models/Call.cs` sets `Call.Id` default to `Guid.NewGuid().ToString()`.
- Outgoing call UX:
  - `TradePulse.Client.Core/Services/CallService.cs` creates temporary calls with `Id = "pending"` for outgoing calls.
  - The backend is expected to provide the authoritative `callId` via Socket.IO events.
- Server-provided call id flow:
  - `TradePulse.Client.Core/Services/SocketService.cs` handles socket events:
    - `instant-incoming`, `instant-connected`, `instant-call-active`, etc.
  - These events populate `Call.Id` from payload `callId`/`id`, otherwise fall back to `Guid.NewGuid()`.
  - Example server-generated id: `instant-1765979995395-uaf06giid`.

Recording metadata (WPF):

- `TradePulse.Client.Core/Services/CallRecordingService.cs`
  - `captureMethod = "client-wav"` upload path includes `callId = call.Id`.
  - Chunked recording path uses `sessionId = call.Id` and includes `meta.callId = call.Id`.

Server recording intake notes:

- `server/routes/recordingRoutes.js` treats call correlation key as:
  - `meta.sessionId || meta.callId`
  and writes the recording metadata JSON (e.g. `<recordingId>.json`) containing the original `callId`.

Risks / requirements:

- If the client starts recording while `call.Id` is still `"pending"`, or if server socket payloads omit `callId`, correlation can break.
- Requirement: ensure server always emits `callId` in `instant-*` payloads, and ensure recording starts only after the authoritative `callId` is known (or is updated before final upload).

### Current state / next actions

- WPF is already sending `meta.callId = call.Id` for both WAV and chunked recordings.
- Server currently stores `callId` inside per-recording JSON metadata, but Reporting Server reconciliation will be easier if `callId` is also persisted as a first-class column in the main DB.
- Next work should focus on making `callId` durable and queryable end-to-end:
  - Ensure `callId` is always present in server call lifecycle events (`instant-*` socket payloads).
  - Ensure recording finalize/upload code paths persist `callId` (call reference) in the DB row for the recording/call session.
  - Ensure archived metadata JSON includes `callId` consistently (even for chunked finalize).

Likely touchpoints (verify in codebase):

- `server/routes/recordingRoutes.js`
  - On upload/finalize: extract `callId` from `meta.callId` (and/or `meta.sessionId`) and persist it.
  - Ensure the JSON metadata written/archived contains `callId`.
- `server/services/databaseService.js`
  - Add migration for a `call_id`/`call_reference` column on the relevant table(s), or add an association table keyed by `recording_id`.
  - Ensure indices exist to query recordings by `callId` efficiently.
- `server/socketHandlers.js` (or wherever `instant-*` events are emitted)
  - Ensure `callId` is always present in payloads.

## 4) Dial Plan system (implemented)

### Goal
Allow admins to define country-scoped dial plans for **incoming** and **outgoing** number transformations:

- Wildcard match
  - `X` = single digit
  - `*` = 0+ digits
- Transform
  - delete N leading digits
  - insert prefix

### DB tables
Added in `server/services/databaseService.js`:

- `countries (code, name, is_active, ...)`
- `dial_plans (id, country_code, direction, name, priority, is_active, ...)`
- `dial_plan_rules (id, dial_plan_id, pattern, delete_digits, insert_prefix, priority, is_active, ...)`
- `dealerboard_ddi_lines.country_code` (used to choose country dial plan for DDI dial tone)

### Service
- `server/services/dialPlanService.js`
  - `normalizeDigits()`
  - `applyDialPlan({ countryCode, direction, number })`

### Admin APIs
Implemented in `server/routes/systemSettingsRoutes.js` (platform_admin only):

- Countries
  - `GET /api/system/countries`
  - `POST /api/system/countries`
  - `DELETE /api/system/countries/:code`

- Dial plans
  - `GET /api/system/dial-plans?countryCode=..&direction=..`
  - `POST /api/system/dial-plans` (upsert)
  - `DELETE /api/system/dial-plans/:id`

- Dial plan rules
  - `GET /api/system/dial-plans/:id/rules`
  - `POST /api/system/dial-plans/:id/rules` (upsert; pass `id` to edit)
  - `DELETE /api/system/dial-plans/:id/rules/:ruleId`

### Admin UI
Implemented in `client/src/components/AdminSystemSettings/AdminSystemSettings.js`:

- New **System → Dial Plans** tab
  - Manage Countries
  - Manage Dial Plans
  - Manage Dial Plan Rules (Add / Edit+Save / Delete)

### Dealerboard integration
- DDI lines have `countryCode` in admin UI:
  - `client/src/components/AdminTelephone/AdminTelephone.js`

- Manual dialing first (dealerboard dial pad → backend):
  - Implemented in `server/routes/dealerboardRoutes.js`:
    - `POST /api/dealerboard/lines/:lineId/call` now:
      - for DDI lines: opens/reuses dial tone SIP call
      - applies outgoing dial plan based on `dealerboard_ddi_lines.country_code`
      - sends digits via DTMF

- Speed dial dialing:
  - Outgoing dial plan applied in speed-dial call flow in `server/routes/dealerboardRoutes.js`

### Known gaps / follow-ups
- Apply dial plan to any other outbound dialing flows if they exist.
- Implement **incoming** dial plan application in SIP INVITE inbound handling.

## 5) Dealerboard / Intercom user issue (fixed)

Problem: Adding dealerboard user `DB1` to an intercom group failed with `User not found`.

Fix: `server/routes/groupRoutes.js` now resolves participants via `getUserByIdOrUsername` so usernames work.

## 6) SIP HA fail-closed (implemented)

Goal: prevent split-brain when Redis is unavailable.

- `server/services/lineOwnershipService.js` updated to **drop all owned lines** / deactivate SIP UAs on Redis disconnect and avoid reconcile until Redis is healthy.

## 7) How to test dial plans quickly

1) In Admin Portal → System → Dial Plans
- Create/select Country (e.g. `UK`)
- Create Outgoing dial plan (e.g. `Default`)
- Add rule:
  - Pattern: `9XXXXXXXXXX`
  - Delete Digits: `1`
  - Insert Prefix: `00`

2) In Admin Portal → Telephone (DDI lines)
- Set the DDI line’s `countryCode = UK`

3) In Dealerboard
- Select that DDI line
- Manual dial digits beginning with `9...`
- Confirm the SBC receives digits transformed to `00...` with leading digit removed.

## 7.5) WPF clients + Admin Portal button layout (reference)

### WPF client split (agreed)

There are **two WPF executables** and both are **full Intercom clients**:

- **Intercom-only WPF client**
  - Project: `TradePulse.Client/TradePulse.Client.WPF/TradePulse.Client.WPF.csproj`
  - EXE/Assembly: `TradePulse`
  - Capability: **Intercom full capability**

- **Dealerboard + Intercom WPF client**
  - Project: `TradePulse.Client/TradePulse.Dealerboard.Client/TradePulse.Dealerboard.Client.csproj`
  - EXE/Assembly: `TradePulseDealerboard`
  - Capability: **Intercom full capability + Dealerboard UI** (buttons/pages/monitor/speaker panel/etc)

### Dealerboard WPF button mapping (must match in Admin Portal)

WPF dealerboard button surface is defined in `TradePulse.Client/TradePulse.Dealerboard.Client/MainWindow.xaml`:

- **Grid**: `UniformGrid Rows="4" Columns="7"` → **28 buttons**
- **Paging**: `MaxPages = 10` in `TradePulse.Client/TradePulse.Dealerboard.Client/ViewModels/MainViewModel.cs`
- **Button numbering**: `buttonNumber` is 1–28 (row-major) and WPF displays mapping as **`{buttonNumber}-{pageNumber}`**
  - Implemented by `DealerboardButtonViewModel.SetPageNumber(int pageNumber)`
  - Example: `1-1`, `28-10`

#### WPF Dealerboard layout “golden” sizing (2026-01-09)

Goal: the WPF Dealerboard client must match the reference screenshot proportions across laptop/desktop screen sizes (no overlaps, no required scrolling for Groups 9–10 / Direct Contacts 9–10).

Key layout constraints in `TradePulse.Client/TradePulse.Dealerboard.Client/MainWindow.xaml`:

- **Main content split** (`Grid.Row=1`):
  - Dealerboard area vs lower panels uses `RowDefinition Height="8*"` (top) and `Height="12*"` (bottom)
  - Dealerboard module `MinHeight="220"`
- **Dealerboard button cells**:
  - Button cell border `MinHeight="44"` (keeps buttons readable but prevents them dominating)
- **Bottom panels should NOT require scrolling** for Intercom Groups and Direct Contacts:
  - Bottom controls outer ScrollViewer removed (so Groups 1–10 and Direct Contacts 1–10 are always visible)
  - Intercom Groups buttons: `Height="28"` and `Margin` reduced (4px gap)
  - Direct Contacts rows: `Height="26"` and `Margin` reduced
- **Vertical spacing trims** (to avoid bottom clipping on shorter screens):
  - Header padding reduced (12)
  - Main content margin reduced (12)
  - Footer padding reduced (12,6)

If this ever regresses, re-apply the above values to quickly restore the “golden” layout.

Admin Portal parity:

- Admin UI component: `client/src/components/UserButtonLayout/UserButtonLayout.js`
- Dealerboard grid: **7×4**, pages **1–10**, and each button label displays **`{button}-{page}`** to match WPF.

### Admin Portal button changes → WPF visibility (sync notes)

WPF Dealerboard client reads assignments from:

- `GET /api/dealerboard/config/:userId` (WPF passes `CurrentUser.Id`; backend resolves username→DB id)

Notes:

- WPF supports assignment types: `privateWire`, `ddiLine`, `speedDial`, `broadcast`
- Per-button speed dial label override is stored in assignment `metadata.label`; WPF reads this and uses it as the display label.
- WPF includes a **Refresh** button (`⟳`) next to pagination to pull latest Admin Portal changes without restarting the client.

### Intercom button assignment storage (Admin Portal → backend → DB) (agreed)

Admin Portal config/assignment is driven via dealerboard endpoints:

- Load config: `GET /api/dealerboard/config/:userId` (`server/routes/dealerboardRoutes.js`)
- Assign: `POST /api/dealerboard/assignments`

To support Intercom button layouts in the same table as Dealerboard:

- Intercom assignments are stored in `dealerboard_button_assignments` using a **special page**: `page_number = 0`
- Intercom button numbering is mapped into a unique `button_number` range on page 0:
  - **Broadcast**: 1–8
  - **Group Calls**: 9–18 (offset +8)
  - **Direct Contacts**: 19–34 (offset +18)

Schema notes:

- Table created/migrated in `server/services/databaseService.js`
- Required columns for correctness (FK-safe):
  - `broadcast_id` → `groups(id)` (broadcast assignments)
  - `group_id` → `groups(id)` (groupCall assignments)
  - `contact_user_id` → `users(id)` (directContact assignments)

Filtering notes (broadcasts/groups dropdowns):

- `/api/groups` supports `callMode` query filtering in `server/routes/groupRoutes.js`
- Broadcast dropdown should use `callMode=broadcast` as the canonical filter (WPF/server model uses `callMode` for broadcast groups).

### Live TODOs for this thread (keep current)

- **(high, in_progress)** Ensure Intercom assign/clear works end-to-end (Admin Portal payload ↔ DB columns `broadcast_id/group_id/contact_user_id` ↔ config mapping)
- **(high, in_progress)** Ensure broadcasts + groups populate in Admin Portal dropdowns (`/api/groups?callMode=broadcast` + non-broadcast group filtering)
- **(medium, pending)** Update Admin Portal “clear” behavior for Intercom assignments (map section/button → `page_number=0` and unified button number)

## 8) Current TODO list (live)

Legend: `in_progress`, `pending`, `completed`

- **(high, in_progress)** Implement multi-site subscriber HA election service (SITE_IDS support, Redis lease per site, status endpoints)
- **(high, in_progress)** Wire HA role into primary-only gating for background loops (archive retry, recording reconcile, orchestrator write paths, etc.)
- **(high, completed)** Implement HA election preference/priority for hybrid publisher/subscriber nodes (prefer dedicated subscriber as primary; configurable via acquire delay)

- **(high, completed)** Cross-DC failover foundation: DB tables (`ha_service_sites`, `ha_site_failover`, `ha_entity_failover_overrides`) + platform-admin APIs to manage sites and set/revoke site/user/line overrides
- **(high, completed)** User effective-site resolver (Option A: `users.site_id`) + platform-admin debug endpoint `GET /api/platform-admin/ha/routing/user/:idOrUsername`
- **(high, completed)** Line routing enforcement (private wires + DDI): line `site_id`, `getEffectiveSiteForLine`, and HA-primary-only line ownership/state by effective site
- **(high, in_progress)** Resolve routing precedence/conflicts with traveller mode (`user_travel_overrides`) vs site failover overrides; document and implement consistent precedence

- **(high, completed)** Location → Site mapping (Option A): add `locations.site_id` and derive user/line home site from location; expose Site dropdown in Locations admin UI

- **(high, completed)** Admin portal: manage subscriber registry (`server_id` -> `server_url`) + per-site subscriber endpoint lists (primary + failovers) + integrate Subscriber Fleet under System

- **(high, in_progress)** Dedicated System → Sites UI panel + site-wide failover mapping UI (manage `ha_service_sites` + `ha_site_failover`)

- **(high, pending)** Implement publisher HA lease lock + manual promote/demote endpoints + UI
- **(high, in_progress)** Implement local agent control plane + wire Admin UI actions
- **(high, in_progress)** Harden control-plane UX/auth (service allowlist dropdown, per-subscriber tokens, audit log)

- **(high, pending)** Recording archiving: support multiple archive destinations per location (2-3), including retry/health, DPAPI encryption, and admin UI

- **(high, pending)** System → SIP: add SIP trunk management (CRUD) with all required trunk fields
- **(high, pending)** System → SIP: add DDI routing (routes) where a route can include multiple trunks for resiliency; allocate routes to DDI lines
- **(high, pending)** Dial plans: associate plans/rules to SIP routes (route selection from dial plan outcome)
- **(high, pending)** UC Sentinel: location-level endpoint configuration + Admin UI
- **(high, pending)** UC Sentinel: subscriber → sentinel direct delivery (buffer/retry + auth)
- **(high, pending)** UC Sentinel: optional global alerts view (standalone or embedded; rollups/redaction)
- **(high, pending)** Add admin-portal maintenance feature (TODO only): temporary move ownership of Private Wires and DDI lines to another subscriber with seamless bridge cutover

- **(medium, pending)** Document deployment/runbook updates

## 9) Recording Archiving + Compliance (in progress)

### Goal (Option A)
Recordings are always kept locally **and** copied to an archive destination on finalize, **per location**.

- Destinations supported:
  - SMB / UNC share
  - SFTP
  - S3 / S3-compatible (custom endpoint)

### Where the logic lives
- Archive + DPAPI helpers:
  - `server/services/recordingArchiveService.js`
  - `server/services/dpapiService.js`
- Hooked into finalize paths:
  - `server/routes/recordingRoutes.js` (upload + chunk finalize)
- Location config + test endpoint:
  - `server/routes/locationRoutes.js`
- Startup:
  - `server/index.js` starts archive retry loop

### Per-location configuration
- Stored on `locations.sftp_config` (JSON) but now supports a `type` + per-type nested config.
- S3 credentials are encrypted per-location using Windows DPAPI (PowerShell) and masked in UI.

### Local cap eviction
- Each location has `localCapGb` (default 10).
- Oldest-first eviction deletes **archived** recordings first.

### Eventual archive retry + health reporting
- A retry loop re-attempts archiving for recordings that failed.
- Health Check shows archive backlog + last retry run/error.

### Admin UI
- Location modal extended:
  - destination type selector
  - SMB/SFTP/S3 fields
  - `localCapGb`
  - "Test Archive Destination" button

## 10) MiFID: Per-user recording duration consistency (implemented)

Problem: The same 1:1 call produces two recordings (one per user) but durations can differ due to client-side stop timing.

Fix:
- On finalize, server prefers authoritative call-session timing when available.
- Background reconciliation loop (Option B): periodically corrects durations in both:
  - local JSON metadata
  - DB `recordings` row

Files:
- `server/services/recordingReconcileService.js` (new)
- `server/index.js` starts reconcile loop
- `server/routes/adminStatsRoutes.js` + `client/src/components/AdminHealthCheck/AdminHealthCheck.js` show reconcile health

Additionally:
- Archived metadata JSON now guarantees `endTime`:
  - derive `endTime = startTime + durationMs` if call session end time is not yet known.

## 11) Timezones (UTC storage + IANA per location) (implemented)

Requirement:
- Store timestamps in UTC.
- Add per-location timezone (IANA, e.g. `Europe/London`).
- UI should show both local time (location tz) and UTC.

Changes:
- DB: `locations.timezone` (default `UTC`) in `server/services/databaseService.js`
- API: Locations GET/POST/PUT include `timezone` in `server/routes/locationRoutes.js`
- Admin UI: Location modal includes timezone input in `client/src/components/AdminSystemSettings/AdminSystemSettings.js`
- Recordings:
  - `server/routes/recordingRoutes.js` enriches recordings with `recordingTimezone`
  - `client/src/components/AdminRecordings/AdminRecordings.js` shows Start Time in both local tz and UTC

Completed recently:
- **#18 (high, completed)** Dial Plans UI: edit/save rules without duplicate inserts.
- **#17 (high, completed)** Fix System Dial Plans tab blank (Card not defined).
- **#16 (high, completed)** Fix dealerboard usernames (e.g. DB1) not found when adding to intercom groups.
- **#5 (high, completed)** SIP ARD non-auto-answer + ring timeout configurable.

## 12) WPF chunked recordings: playback quality + call-end skew (in progress)

### Symptoms
- WPF client recordings were previously **slow/distorted** (WAV header format mismatch).
- Two endpoints on the same 1:1 call could have **different recording durations** (often ~10s skew) due to asymmetric stop timing.

### Current implementation notes
- WPF chunk uploads: `TradePulse.Client.Core/Services/CallRecordingService.cs`
  - Chunk session `sessionId` now prefers `call.Id` (fallback to random only if missing).
- Server emits end-call:
  - `server/socketHandlers.js` emits `instant-ended` with `endedAt` (UTC ISO) and persists the same timestamp as `call_sessions.end_time`.
- WPF hangup behavior:
  - `TradePulse.Client.Core/Services/CallService.cs` implements `HangupCallAsync` and `HangupAsync`.
  - `HangupAsync` emits hangup first and uses a short fallback stop (`hangup-timeout`) if no end event arrives.

### Recent build fix
- There was a transient build break where Hangup logic was accidentally inserted into `AnswerCallAsync`.
- Fixed by restoring method boundaries and re-adding `HangupAsync`.
- `ICallService` requires `HangupCallAsync(string)`; `CallService` now implements this via a wrapper that calls `HangupAsync`.

## 13) WPF broadcast monitoring mis-recording (in progress)

### Symptom
- WPF created broadcast recordings even when nobody spoke, and could capture/attribute 1:1 playback into broadcast recordings.

### Fix (partial)
- `TradePulse.Client.Core/Services/CallService.cs` `OnBroadcastPlaybackPcm(...)` now guards:
  - If a non-broadcast call is active, it stops any broadcast recording and ignores playback PCM for broadcast processing.

### VOX silence timeout (per location)
- Per-location setting: `locations.voice_vox_silence_seconds` (default 10)
- Admin UI: Location modal (`client/src/components/AdminSystemSettings/AdminSystemSettings.js`) exposes **Voice VOX Silence Seconds**
- API: `server/routes/locationRoutes.js` exposes `voiceVoxSilenceSeconds`
- WPF config: `server/routes/recordingRoutes.js` `/api/recordings/client-config` returns `recordings.voiceVoxSilenceSeconds` based on authenticated user's location.
- WPF behavior: `TradePulse.Client.Core/Services/CallService.cs` uses `ICallRecordingService.VoiceVoxSilenceSeconds` instead of hardcoded 10s.
- Startup refresh: both WPF apps call `ICallRecordingService.RefreshClientConfigAsync()` after login so VOX config is available immediately.

## 14) Next critical requirement: multi-line simultaneous recordings + per-call PTT/latch isolation (not implemented)

### Requirement
- Must be able to record multiple simultaneous lines/calls without audio bleed.
- PTT/Latch must be **per call/line**.
- Latch should only auto-engage for the **initiator/caller** (never the receiver).
- Broadcast PTT/Latch should remain **manual-only**.

### Why current WPF recording is not sufficient
- `MainViewModel` tracks a single `CurrentCall` and global `IsPttLatched`/`IsPttTransmitting`.
- `CallRecordingService` is still effectively single-session (single buffer/session tracking), even though `sessionId` now prefers `call.Id`.
- Any recording path that relies on shared playback/loopback cannot safely separate audio per call.

### Needed design direction
- Multi-session call state in UI and Core keyed by `callId` (and line/group where relevant).
- Recording sessions keyed by `callId`.
- Per-call PCM source from the media engine (decode/tap per call), not a shared loopback mix.

## 15) Voice-controlled dealerboard (Rhasspy) (planned)

### Project goals
- Voice-controlled dealerboard functionality.
- Keep voice processing internal to the network (privacy/security).
- Low latency user experience.
- Minimize external costs.

### Architecture overview
- **.NET Windows front-end**: capture microphone audio, UI feedback, execute dealerboard actions.
- **Rhasspy Linux back-end (Ubuntu)**: wake word ("Hey Kai"), speech-to-text, intent/slot recognition, command execution.

### Communication
- Prefer **gRPC** (streaming audio + strongly typed intents). REST is fallback.

### Implementation phases (high level)
1) Infrastructure: Ubuntu server + Rhasspy installed/configured for remote access.
2) Rhasspy: define intents/slots, train models, implement command execution + API integration.
3) .NET client: audio capture, gRPC/REST integration, UI feedback + dealerboard command wiring.
4) Integration/testing: end-to-end, latency tuning, UAT.
5) Deployment + maintenance.

### API contracts to define
- Call control (initiate, disconnect, forward, status)
- UI display updates (alerts/instructions/status banners)
- Dealerboard health metrics (CPU/memory/network/line status)
- Test call execution (trigger, TTS message delivery, result reporting)

### Recording fail-safes
- Implement recording fail-safes so Kai never directly controls recording service.

## 8) Notes / conventions

- Many endpoints accept either `req.user.id` or `req.user.userId` depending on auth token.
- Dial plan matching is digits-only after normalization (non-digits removed).

---

Last updated: 2026-01-03
