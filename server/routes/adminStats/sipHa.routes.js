const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../../utils/logger');
const { groupService } = require('../../services/groupService');
const { findUsers } = require('../../services/databaseService');
const { authenticateToken } = require('../authRoutes');
const { adminOnly } = require('../../middleware/roleCheck');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getArchiveHealth } = require('../../services/recordingArchiveService');
const { getRecordingReconcileHealth } = require('../../services/recordingReconcileService');
router.get('/sip-ha', authenticateToken, adminOnly, async (req, res) => {
  try {
    const lineOwnershipService = req.app?.locals?.lineOwnershipService;
    const sipGateway = req.app?.locals?.sipGateway;

    const sipHa = lineOwnershipService && typeof lineOwnershipService.getStatus === 'function'
      ? lineOwnershipService.getStatus()
      : {
          enabled: process.env.SIP_HA_ENABLED === 'true',
          initialized: false,
          note: 'LineOwnershipService not available on this node'
        };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      sipHa,
      sipGateway: {
        enabled: Boolean(sipGateway),
        haEnabled: Boolean(sipGateway?.haEnabled),
        activeUserAgents: sipGateway?.userAgents ? Array.from(sipGateway.userAgents.keys()) : [],
        sbcEndpoints: sipGateway?.getSbcStatusByLine?.() || {},
      }
    });
  } catch (error) {
    logger.error('SIP HA status error:', error);
    res.status(500).json({ error: error.message || 'Failed to load SIP HA status' });
  }
});

module.exports = router;
