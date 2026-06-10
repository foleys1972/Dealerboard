const logger = require('../../utils/logger');
const { getOrCreateRouter } = require('../mediaSoupService');

const LINE_MEDIA_GROUP_PREFIX = 'dealerboard-line:';

function buildLineMediaGroupId(lineId) {
  return `${LINE_MEDIA_GROUP_PREFIX}${String(lineId)}`;
}

function scopeMediaGroupId(mediaGroupId) {
  const tid = process.env.DEFAULT_TENANT_ID || 'tenant-default';
  const stid = process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
  const base = mediaGroupId || 'global';
  if (base.includes(':') && base.split(':').length >= 3) {
    return base;
  }
  return `${tid}:${stid}:${base}`;
}

function scopeLineMediaGroupId(lineId) {
  return scopeMediaGroupId(buildLineMediaGroupId(lineId));
}

/** Ensure the per-line MediaSoup router exists; returns the client-facing mediaGroupId. */
async function ensureLineMediaRouter(lineId) {
  const mediaGroupId = buildLineMediaGroupId(lineId);
  try {
    await getOrCreateRouter(scopeLineMediaGroupId(lineId));
  } catch (error) {
    logger.error('Failed to ensure MediaSoup router for dealerboard line', {
      lineId,
      mediaGroupId,
      error: error?.message || error,
    });
  }
  return mediaGroupId;
}

module.exports = {
  LINE_MEDIA_GROUP_PREFIX,
  buildLineMediaGroupId,
  scopeMediaGroupId,
  scopeLineMediaGroupId,
  ensureLineMediaRouter,
};
