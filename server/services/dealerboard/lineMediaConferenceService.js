const logger = require('../../utils/logger');
const { getProducersByGroup, pipeProducerToRouter, closePipePair } = require('../mediaSoupService');
const { scopeLineMediaGroupId } = require('./lineMediaService');

/** sorted pair key -> { pipes: Array, lineIds: [a,b] } */
const activeConferences = new Map();

function conferenceKey(lineIdA, lineIdB) {
  const a = String(lineIdA);
  const b = String(lineIdB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isConferenceProducer(producer) {
  if (!producer || producer.kind !== 'audio') return false;
  const source = producer.appData?.source;
  return source !== 'sip-uplink-relay';
}

async function pipeLineAudioToLine(sourceLineId, targetLineId) {
  const sourceScope = scopeLineMediaGroupId(sourceLineId);
  const targetScope = scopeLineMediaGroupId(targetLineId);
  const producers = getProducersByGroup(sourceScope).filter(isConferenceProducer);
  const pipes = [];

  for (const producer of producers) {
    try {
      const pair = await pipeProducerToRouter(sourceScope, producer.id, targetScope);
      if (pair) {
        pipes.push({
          sourceLineId: String(sourceLineId),
          targetLineId: String(targetLineId),
          producerId: producer.id,
          ...pair,
        });
      }
    } catch (error) {
      logger.warn('Failed to pipe producer for line conference', {
        sourceLineId,
        targetLineId,
        producerId: producer.id,
        error: error?.message || error,
      });
    }
  }

  return pipes;
}

async function bridgeLinesForConference(lineIdA, lineIdB) {
  const key = conferenceKey(lineIdA, lineIdB);
  const existing = activeConferences.get(key);

  const pipesAtoB = await pipeLineAudioToLine(lineIdA, lineIdB);
  const pipesBtoA = await pipeLineAudioToLine(lineIdB, lineIdA);
  const newPipes = [...pipesAtoB, ...pipesBtoA];

  if (existing) {
    const seen = new Set(
      existing.pipes.map((p) => `${p.sourceLineId}:${p.targetLineId}:${p.producerId}`)
    );
    for (const pipe of newPipes) {
      const pipeKey = `${pipe.sourceLineId}:${pipe.targetLineId}:${pipe.producerId}`;
      if (seen.has(pipeKey)) continue;
      seen.add(pipeKey);
      existing.pipes.push(pipe);
    }
    activeConferences.set(key, existing);

    if (newPipes.length > 0) {
      logger.info('Line conference media bridge extended', {
        lineIdA,
        lineIdB,
        addedPipes: newPipes.length,
        totalPipes: existing.pipes.length,
      });
    }

    return existing;
  }

  const session = {
    key,
    lineIds: [String(lineIdA), String(lineIdB)],
    pipes: newPipes,
    createdAt: new Date(),
  };

  activeConferences.set(key, session);

  logger.info('Line conference media bridge established', {
    lineIdA,
    lineIdB,
    pipeCount: session.pipes.length,
  });

  return session;
}

async function teardownConferenceForLine(lineId) {
  const id = String(lineId);
  const keysToRemove = [];

  for (const [key, session] of activeConferences.entries()) {
    if (!session.lineIds.includes(id)) continue;
    for (const pipe of session.pipes) {
      try {
        await closePipePair(pipe);
      } catch (error) {
        logger.debug('Failed closing conference pipe', error?.message || error);
      }
    }
    keysToRemove.push(key);
  }

  for (const key of keysToRemove) {
    activeConferences.delete(key);
    logger.info('Line conference torn down', { key, lineId: id });
  }

  return keysToRemove.length;
}

function getActiveConferenceForLine(lineId) {
  const id = String(lineId);
  for (const session of activeConferences.values()) {
    if (session.lineIds.includes(id)) return session;
  }
  return null;
}

module.exports = {
  conferenceKey,
  bridgeLinesForConference,
  teardownConferenceForLine,
  getActiveConferenceForLine,
};
