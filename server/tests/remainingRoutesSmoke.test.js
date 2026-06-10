/**
 * Compliance module load smoke test.
 * Run: node server/tests/complianceSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/compliance/index',
  '../routes/complianceRoutes',
  '../routes/compliance/shared',
  '../routes/compliance/status.routes',
  '../routes/compliance/actions.routes',
  '../routes/compliance/encryption.routes',
  '../routes/compliance/export.routes',
  '../routes/federation/index',
  '../routes/federationRoutes',
  '../routes/federation/peers.routes',
  '../routes/federation/sync.routes',
  '../routes/federation/messaging.routes',
  '../routes/federation/admin.routes',
  '../routes/zoom/index',
  '../routes/zoomRoutes',
  '../routes/zoom/auth.routes',
  '../routes/zoom/meetings.routes',
  '../routes/zoom/bridge.routes',
  '../routes/teams/index',
  '../routes/teamsRoutes',
  '../routes/teams/auth.routes',
  '../routes/teams/meetings.routes',
  '../routes/teams/bridge.routes',
  '../routes/userIntercom/index',
  '../routes/userIntercomRoutes',
  '../routes/userIntercom/routeHelpers',
  '../routes/userIntercom/grid.routes',
  '../routes/userIntercom/broadcast.routes',
  '../routes/userIntercom/config.routes',
  '../routes/adminStats/index',
  '../routes/adminStatsRoutes',
  '../routes/adminStats/health.routes',
  '../routes/adminStats/stats.routes',
  '../routes/adminStats/healthCheck.routes',
  '../routes/adminStats/sipHa.routes',
  '../routes/groupCalls/index',
  '../routes/groupCallRoutes',
  '../routes/groupCalls/routeHelpers',
  '../routes/groupCalls/initiate.routes',
  '../routes/groupCalls/answer.routes',
  '../routes/groupCalls/lifecycle.routes',
  '../routes/tenantAdmin/index',
  '../routes/tenantAdminRoutes',
  '../routes/tenantAdmin/routeHelpers',
  '../routes/tenantAdmin/settings.routes',
  '../routes/tenantAdmin/subTenants.routes',
  '../routes/tenantAdmin/users.routes',
  '../routes/tenantAdmin/relationships.routes',
  '../routes/agent/index',
  '../routes/agentRoutes',
  '../routes/agent/routeHelpers',
  '../routes/agent/service.routes',
  '../routes/directContacts/index',
  '../routes/directContactRoutes',
  '../routes/directContacts/contacts.routes',
  '../routes/notifications/index',
  '../routes/notificationRoutes',
  '../routes/notifications/routeHelpers',
  '../routes/notifications/feed.routes',
];

let passed = 0;
let failed = 0;

for (const mod of MODULES) {
  try {
    const loaded = require(mod);
    assert.ok(loaded);
    console.log(`  ok ${mod}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${mod}:`, e.message);
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
