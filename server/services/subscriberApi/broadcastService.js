const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
} = require('../databaseService');
const { SubscriberApiError } = require('./errors');
const { createSessionId, resolveUsernames, resolveUserDisplay } = require('./helpers');

async function activateBroadcast(body, socketHandler) {
  const { lineId, lineType, activatorUserId, activatorRegion } = body || {};

  if (!lineId || !lineType || !activatorUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const line = await getLineConfiguration(lineId);
  if (!line || line.lineType !== 'BROADCAST') {
    throw new SubscriberApiError(404, 'Broadcast line not found');
  }

  const roomId = line.persistentRoomId;
  const authorizedParticipants = Array.isArray(line.targetParticipants)
    ? line.targetParticipants
    : [];

  const sessionId = createSessionId();

  await createCallSession({
    sessionId,
    lineId,
    lineType,
    broadcastActivatorUserId: activatorUserId,
    broadcastRoomId: roomId,
    initiatorUserId: activatorUserId,
    status: 'active',
    participants: [{
      userId: activatorUserId,
      role: 'activator',
      joinTime: new Date().toISOString(),
    }],
    topologyType: 'broadcast',
  });

  if (socketHandler) {
    const activatorUser = await resolveUserDisplay(activatorUserId);
    const authorizedUsernames = await resolveUsernames(authorizedParticipants);

    socketHandler.emitBroadcastActivated(
      lineId,
      sessionId,
      activatorUser.username,
      activatorUser.displayName,
      roomId,
      authorizedUsernames
    );
  }

  return {
    sessionId,
    lineId,
    roomId,
    authorizedParticipants,
    instruction: {
      type: 'join-room',
      roomId,
    },
  };
}

async function joinBroadcast(body, socketHandler) {
  const { sessionId, lineId, joiningUserId, joiningRegion } = body || {};

  if (!sessionId || !lineId || !joiningUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const session = await getCallSession(sessionId);
  if (!session || session.lineType !== 'BROADCAST') {
    throw new SubscriberApiError(404, 'Broadcast session not found');
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];

  participants.push({
    userId: joiningUserId,
    region: joiningRegion,
    role: 'participant',
    joinTime: new Date().toISOString(),
  });

  await updateCallSession(sessionId, { participants });

  if (socketHandler) {
    const joinedUser = await resolveUserDisplay(joiningUserId);

    socketHandler.emitBroadcastParticipantJoined(
      sessionId,
      lineId,
      joinedUser.username,
      joinedUser.displayName,
      participants.length
    );
  }

  return {
    success: true,
    roomId: session.broadcastRoomId,
    currentParticipants: participants.length,
    instruction: {
      type: 'join-room',
      roomId: session.broadcastRoomId,
    },
  };
}

async function leaveBroadcast(body, socketHandler) {
  const { sessionId, lineId, leavingUserId } = body || {};

  if (!sessionId || !leavingUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const participants = Array.isArray(session.participants)
    ? session.participants.filter((p) => p.userId !== leavingUserId)
    : [];

  await updateCallSession(sessionId, { participants });

  if (socketHandler) {
    const leftUser = await resolveUserDisplay(leavingUserId);

    socketHandler.emitBroadcastParticipantLeft(
      sessionId,
      lineId,
      leftUser.username,
      leftUser.displayName,
      participants.length
    );
  }

  return {
    success: true,
    currentParticipants: participants.length,
    broadcastStillActive: participants.length > 0,
  };
}

async function closeBroadcast(body, socketHandler) {
  const { sessionId, lineId, closerUserId } = body || {};

  if (!sessionId || !closerUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const participantsKicked = participants
    .filter((p) => p.userId !== closerUserId)
    .map((p) => p.userId);

  await updateCallSession(sessionId, { status: 'ended' });

  if (socketHandler) {
    const closerUser = await resolveUserDisplay(closerUserId);
    const participantsKickedUsernames = await resolveUsernames(participantsKicked);

    socketHandler.emitBroadcastClosed(
      sessionId,
      lineId,
      closerUser.username,
      participantsKickedUsernames
    );
  }

  return {
    success: true,
    participantsKicked,
    broadcastClosed: true,
  };
}

module.exports = {
  activateBroadcast,
  joinBroadcast,
  leaveBroadcast,
  closeBroadcast,
};
