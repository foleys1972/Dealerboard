const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Placeholder IPTV routes.
 * TODO: Back these endpoints with the IPTV stream service once implemented.
 */

router.get('/', (req, res) => {
  logger.warn('IPTV endpoint called but not implemented');
  res.status(501).json({ error: 'IPTV API not implemented yet' });
});

module.exports = router;

