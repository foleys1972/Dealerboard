const { getUserByIdOrUsername } = require('../../services/databaseService');
const logger = require('../../utils/logger');

async function hydrateParticipants(participantIds = []) {
  const uniqueIds = Array.from(new Set(participantIds));
  const participants = await Promise.all(
    uniqueIds.map(async (participantId) => {
      try {
        const user = await getUserByIdOrUsername(participantId);
        if (user) {
          return {
            id: user.id,
            username: user.username,
            name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
            role: user.role,
            status: user.status || 'offline',
            extension: user.extension || null,
          };
        }
      } catch (error) {
        logger.warn(`Failed to hydrate participant ${participantId}: ${error.message}`);
      }
      return {
        id: participantId,
        username: participantId,
        name: 'Unknown User',
        role: 'unknown',
        status: 'offline',
      };
    })
  );
  return participants;
}

module.exports = { hydrateParticipants };
