const express = require('express');
const router = express.Router();
const recordingRoutes = require('./recordingRoutes');
const webrtcRoutes = require('./webrtcRoutes');
const groupRoutes = require('./groupRoutes');
const matrixRoutes = require('./matrixRoutes');
const complianceRoutes = require('./complianceRoutes');
const federationRoutes = require('./federationRoutes');
const favoritesRoutes = require('./favoritesRoutes');
const iptvRoutes = require('./iptvRoutes');
const adminStatsRoutes = require('./adminStatsRoutes');
const directContactRoutes = require('./directContactRoutes');
const notificationRoutes = require('./notificationRoutes');
const systemSettingsRoutes = require('./systemSettingsRoutes');
const subscriberRoutes = require('./subscriberRoutes');
const subscriberApiRoutes = require('./subscriberApiRoutes');
const groupCallRoutes = require('./groupCallRoutes');
const locationRoutes = require('./locationRoutes');
const dealerboardRoutes = require('./dealerboardRoutes');
const zoomRoutes = require('./zoomRoutes');
const teamsRoutes = require('./teamsRoutes');
const userIntercomRoutes = require('./userIntercomRoutes');
const platformAdminRoutes = require('./platformAdminRoutes');
const tenantAdminRoutes = require('./tenantAdminRoutes');
const agentRoutes = require('./agentRoutes');
const authRoutesModule = require('./authRoutes');
const authRoutes = authRoutesModule.router || authRoutesModule;

// Mount recording routes
router.use('/recordings', recordingRoutes);

// Mount WebRTC routes
router.use('/webrtc', webrtcRoutes);

// Mount group routes
router.use('/groups', groupRoutes);

// Mount Matrix routes
router.use('/matrix', matrixRoutes);

// Mount compliance routes
router.use('/compliance', complianceRoutes);

// Mount federation routes
router.use('/federation', federationRoutes);

// Mount auth routes
router.use('/auth', authRoutes);

// Mount favorites routes (user can access)
router.use('/favorites', favoritesRoutes);

// Mount IPTV routes (user can access)
router.use('/iptv', iptvRoutes);

// Direct contacts routes
router.use('/direct-contacts', directContactRoutes);

// Notifications routes
router.use('/notifications', notificationRoutes);
// Mount admin stats routes (admin only)
router.use('/admin', adminStatsRoutes);
// System settings routes (admin only)
router.use('/system', systemSettingsRoutes);
// Subscriber routes (admin only)
router.use('/subscribers', subscriberRoutes);
// Subscriber API routes (for subscriber services to call)
router.use('/subscriber', subscriberApiRoutes);
// Group call routes (for web clients with JWT auth)
router.use('/group-calls', groupCallRoutes);
// Location routes (admin only)
router.use('/locations', locationRoutes);
// Dealerboard routes
router.use('/dealerboard', dealerboardRoutes);
// Zoom routes
router.use('/zoom', zoomRoutes);
// Teams routes
router.use('/teams', teamsRoutes);
// User intercom routes (grid configuration, etc.)
router.use('/user-intercom', userIntercomRoutes);

// Platform admin routes
router.use('/platform-admin', platformAdminRoutes);

// Tenant admin routes
router.use('/tenant-admin', tenantAdminRoutes);

// Local agent routes (subscriber-side remote control, protected by shared secret)
router.use('/agent', agentRoutes);

function setupRoutes(app) {
  app.use('/api', router);
}

module.exports = router;
module.exports.setupRoutes = setupRoutes;
