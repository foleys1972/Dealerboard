const logger = require('../../utils/logger');
const { getActiveTravelOverrideForUser } = require('../../db/auth/travelOverrides');
const { getLocationSubscriberRouting } = require('../../db/locations/subscriberAssignments');
const { pickSubscriber } = require('./subscriberSelection');

async function getActiveTravelOverride(userId) {
  if (!userId) return null;
  try {
    return await getActiveTravelOverrideForUser(userId);
  } catch (e) {
    logger.warn('Failed to read travel override:', e.message);
    return null;
  }
}

async function getLocationSubscriberAssignment(locationId) {
  if (!locationId) return null;
  try {
    return await getLocationSubscriberRouting(locationId);
  } catch (e) {
    logger.warn('Failed to read location subscriber assignment:', e.message);
    return null;
  }
}

async function applyRoutingToUserData(userData, dbUser) {
  if (!userData || !dbUser) return userData;

  const homeLocationId = dbUser.locationId || dbUser.location_id || null;
  userData.locationId = homeLocationId;

  const override = dbUser.id ? await getActiveTravelOverride(dbUser.id) : null;
  const routingLocationId = override?.travelLocationId || homeLocationId;
  const recordingOriginLocationId = override?.forceOrigin ? routingLocationId : homeLocationId;

  userData.routingLocationId = routingLocationId;
  userData.recordingOriginLocationId = recordingOriginLocationId;

  if (override) {
    userData.travelOverride = {
      travelLocationId: override.travelLocationId,
      forceOrigin: override.forceOrigin,
      startsAt: override.startsAt,
      expiresAt: override.expiresAt,
    };
  }

  if (routingLocationId) {
    const assignment = await getLocationSubscriberAssignment(routingLocationId);
    if (assignment) {
      userData.subscriberRouting = assignment;

      // Load-aware selection: prefer the primary subscriber, but overflow to the
      // secondary when the primary is busy. The client connects to
      // recommendedSubscriberUrl (clientRoutingService). Only consider a
      // candidate if its subscriber is currently connected.
      try {
        const primary = assignment.primary && assignment.primary.status === 'connected'
          ? assignment.primary : null;
        const secondary = assignment.secondary && assignment.secondary.status === 'connected'
          ? assignment.secondary : null;

        const choice = pickSubscriber({ primary, secondary });
        if (choice?.serverUrl) {
          userData.recommendedSubscriberUrl = choice.serverUrl;
          userData.subscriberRoutingDecision = choice.reason;
        }
      } catch (e) {
        logger.warn('Load-aware subscriber selection failed:', e.message);
      }
    }
  }

  return userData;
}

module.exports = {
  getActiveTravelOverride,
  getLocationSubscriberAssignment,
  applyRoutingToUserData,
};
