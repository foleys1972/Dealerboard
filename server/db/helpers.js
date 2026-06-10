const logger = require('../utils/logger');

// Helper function to parse JSONB fields safely
function parseJsonbField(value, fieldName) {
  try {
    if (!value) return {};
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value || {};
  } catch (e) {
    logger.warn(`Error parsing ${fieldName} JSONB:`, e);
    return {};
  }
}

module.exports = { parseJsonbField };
