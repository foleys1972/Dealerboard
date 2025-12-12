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
const locationRoutes = require('./locationRoutes');
const { router: authRoutes } = require('./authRoutes');

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
// Location routes (admin only)
router.use('/locations', locationRoutes);

function setupRoutes(app) {
  app.use('/api', router);
}

module.exports = router;
module.exports.setupRoutes = setupRoutes;
