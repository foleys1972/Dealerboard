const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
} = require('../databaseService');
const { SubscriberApiError } = require('./errors');
const { createSessionId, resolveUsernames, resolveUserDisplay } = require('./helpers');

async function initiateGroupCall(body) {
  const {
    lineId,
    lineType,
    mode,
    initiatorUserId,
    initiatorRegion,
    targetUsers,
  } = body || {};

  if (!lineId || !lineType || !mode || !initiatorUserId || !targetUsers || !Array.isArray(targetUsers)) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  if (!['FIRST_ANSWER', 'REMAIN_GROUP'].includes(mode)) {
    throw new SubscriberApiError(400, 'Invalid mode. Must be FIRST_ANSWER or REMAIN_GROUP');
  }

  const sessionId = createSessionId();
  const lineConfig = await getLineConfiguration(lineId);
  const timeout = lineConfig?.callTimeout || 30;
  const ringTimeout = lineConfig?.ringTimeout || 60;

  await createCallSession({
    sessionId,
    lineId,
    lineType,
    groupMode: mode,
    initiatorUserId,
    status: 'pending',
    participants: [],
    invitedNoAnswer: targetUsers.map((userId) => ({ userId, status: 'pending' })),
    sessionMetadata: { initiatorRegion, timeout, ringTimeout },
  });

  return {
    sessionId,
    topology: 'pending',
    mode,
    targetCount: targetUsers.length,
    timeout,
    instruction: 'wait-for-answers',
  };
}

async function answerGroupCall(body, socketHandler) {
  const { sessionId, answerUserId, answerRegion, answerTimestamp } = body || {};

  if (!sessionId || !answerUserId) {
    throw new SubscriberApiError(400, 'Missing required fields');
  }

  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const mode = session.groupMode;
  const participants = Array.isArray(session.participants) ? session.participants : [];
  const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];
  const metadata = session.sessionMetadata || {};

  const updatedInvited = invitedNoAnswer.filter((inv) => inv.userId !== answerUserId);
  const answerOrder = participants.length + 1;

  participants.push({
    userId: answerUserId,
    region: answerRegion,
    role: answerOrder === 1 ? 'first-answerer' : 'participant',
    answerOrder,
    joinTime: answerTimestamp || new Date().toISOString(),
  });

  if (mode === 'FIRST_ANSWER' && answerOrder === 1) {
    await updateCallSession(sessionId, {
      status: 'active',
      firstAnswererUserId: answerUserId,
      participants,
      invitedNoAnswer: updatedInvited,
      topologyType: 'P2P',
    });

    if (socketHandler) {
      const answerUser = await resolveUserDisplay(answerUserId);
      const targetUsernames = await resolveUsernames(updatedInvited.map((inv) => inv.userId));

      socketHandler.emitGroupCallAnswered(
        sessionId,
        answerUser.username,
        answerUser.displayName,
        targetUsernames
      );
    }

    return {
      mode: 'FIRST_ANSWER',
      firstAnswerer: true,
      topology: 'P2P',
      instruction: {
        type: 'establish-p2p',
        withUserId: session.initiator_user_id,
      },
      cancelOthers: true,
      otherParticipants: updatedInvited.map((inv) => inv.userId),
    };
  }

  if (mode === 'REMAIN_GROUP') {
    const currentParticipantCount = participants.length;
    let topology = 'P2P';
    let instruction = {
      type: 'establish-p2p',
      withUserId: session.initiator_user_id,
    };
    let participantsToMigrate = [];
    let topologyChange = false;

    if (currentParticipantCount === 3) {
      topology = 'single-room';
      topologyChange = true;
      instruction = {
        type: 'join-room',
        roomId: null,
        matrixHomeserver: metadata.initiatorRegion || 'US',
      };
      participantsToMigrate = participants.slice(0, 2).map((p) => ({
        userId: p.userId,
        action: 'leave-p2p-join-room',
      }));
    }

    await updateCallSession(sessionId, {
      status: 'active',
      participants,
      invitedNoAnswer: updatedInvited,
      topologyType: topology,
    });

    if (socketHandler) {
      const joinedUser = await resolveUserDisplay(answerUserId);

      socketHandler.emitGroupCallParticipantJoined(
        sessionId,
        joinedUser.username,
        joinedUser.displayName,
        currentParticipantCount,
        topologyChange,
        topology,
        instruction.roomId || null
      );
    }

    return {
      mode: 'REMAIN_GROUP',
      answerNumber: answerOrder,
      currentParticipants: currentParticipantCount,
      topology,
      instruction,
      participantsToMigrate: participantsToMigrate.length > 0 ? participantsToMigrate : undefined,
      awaitingAnswers: updatedInvited.map((inv) => inv.userId),
    };
  }

  throw new SubscriberApiError(400, 'Unsupported group call mode');
}

async function cancelGroupCall(body) {
  const { sessionId } = body || {};

  if (!sessionId) {
    throw new SubscriberApiError(400, 'Missing sessionId');
  }

  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];
  const participants = Array.isArray(session.participants) ? session.participants : [];

  const cancelledParticipants = [
    ...invitedNoAnswer.map((inv) => inv.userId),
    ...participants.map((p) => p.userId).filter((id) => id !== session.initiatorUserId),
  ];

  await updateCallSession(sessionId, { status: 'cancelled' });

  return {
    success: true,
    sessionId,
    cancelledParticipants: [...new Set(cancelledParticipants)],
  };
}

async function getGroupCallStatus(sessionId) {
  const session = await getCallSession(sessionId);
  if (!session) {
    throw new SubscriberApiError(404, 'Session not found');
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];

  return {
    sessionId: session.sessionId,
    lineId: session.lineId,
    mode: session.groupMode,
    initiator: session.initiatorUserId,
    targetUsers: [
      ...participants.map((p) => p.userId),
      ...invitedNoAnswer.map((inv) => inv.userId),
    ],
    answers: participants.map((p, idx) => ({
      userId: p.userId,
      timestamp: p.joinTime,
      order: p.answerOrder || idx + 1,
    })),
    noAnswers: invitedNoAnswer.map((inv) => inv.userId),
    topology: session.topologyType,
    currentParticipants: participants.length,
    status: session.status,
  };
}

module.exports = {
  initiateGroupCall,
  answerGroupCall,
  cancelGroupCall,
  getGroupCallStatus,
};
