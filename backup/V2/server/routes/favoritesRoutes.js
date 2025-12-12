const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Placeholder favorites routes.
 * TODO: Implement actual persistence layer once UserFavorites is migrated to Postgres.
 */

router.get('/', (req, res) => {
  logger.warn('Favorites endpoint called but not implemented');
  res.status(501).json({ error: 'Favorites API not implemented yet' });
});

module.exports = router;

