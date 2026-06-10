const express = require('express');
const { setupRoutes } = require('../../routes');

/**
 * Minimal Express app with API routes mounted (no MediaSoup/DB bootstrap).
 */
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  setupRoutes(app);
  return app;
}

module.exports = { createTestApp };
