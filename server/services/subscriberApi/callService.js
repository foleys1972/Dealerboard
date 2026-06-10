const { createCallSession, getCallSession, updateCallSession } = require('../databaseService');
const { SubscriberApiError } = require('./errors');
const { createSessionId } = require('./helpers');

async function initiateCall(body) {
  const { lineId, lineType, initiatorUserId, targetUserId } = body || {};

  if (!lineId || !lineType || !initiatorUserId || !targetUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const sessionId = createSessionId();

  await createCallSession({
    sessionId,
    lineId,
    lineType,
    initiatorUserId,
    status: 'pending',
  });

  return {
    sessionId,
    topology: 'pending',
    instruction: 'wait-for-answer',
  };
}

async function answerCall(body) {
  const { sessionId, answerUserId, answerTimestamp } = body || {};

  if (!sessionId || !answerUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const initiatorUserId = session.initiatorUserId || session.initiator_user_id;

  if (initiatorUserId) {
    const hasInitiator = participants.some(
      (p) => String(p?.userId || '').toLowerCase() === String(initiatorUserId).toLowerCase()
    );
    if (!hasInitiator) {
      participants.push({
        userId: initiatorUserId,
        role: 'initiator',
        joinTime: session.startTime ? new Date(session.startTime).toISOString() : new Date().toISOString(),
      });
    }
  }

  participants.push({
    userId: answerUserId,
    role: 'answerer',
    joinTime: answerTimestamp || new Date().toISOString(),
  });

  const sessionMetadata = session.sessionMetadata || {};
  sessionMetadata.answeredAt = answerTimestamp || new Date().toISOString();

  await updateCallSession(sessionId, {
    status: 'active',
    firstAnswererUserId: answerUserId,
    participants,
    sessionMetadata,
    topologyType: 'P2P',
  });

  return {
    sessionId,
    topology: 'P2P',
    instruction: {
      type: 'establish-p2p',
      withUserId: session.initiator_user_id,
    },
  };
}

module.exports = {
  initiateCall,
  answerCall,
};
