const crypto = require('crypto');
const { getUserById } = require('../databaseService');
const logger = require('../../utils/logger');

function createSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

async function resolveUsernames(userIds) {
  return Promise.all(
    (userIds || []).map(async (userId) => {
      try {
        const user = await getUserById(userId);
        return user?.username || userId;
      } catch (error) {
        logger.warn(`Failed to get username for userId ${userId}:`, error.message);
        return userId;
      }
    })
  );
}

async function resolveUserDisplay(userId) {
  const user = await getUserById(userId);
  return {
    userId,
    username: user?.username || userId,
    displayName: user?.displayName || user?.name || userId,
  };
}

module.exports = {
  createSessionId,
  resolveUsernames,
  resolveUserDisplay,
};
