const logger = require('../../utils/logger');
const { createPlainTransport, getOrCreateRouter, trackProducer } = require('../mediaSoupService');const {
  getAnnouncedIp,
  parseAudioMedia,
  buildAudioOffer,
  buildRtpParametersForCodec,
  negotiateCodec,
} = require('./sipSdp');

/** callId -> { plainTransport, routerScopeId, producer, consumer, lineId } */
const sessions = new Map();

function getAnnouncedListenIp() {
  const announced = getAnnouncedIp();
  return {
    ip: '0.0.0.0',
    announcedIp: announced || undefined,
  };
}

/**
 * Reserve MediaSoup PlainTransport and build SDP offer for a SIP call leg.
 */
async function allocateCallMedia({ lineId, callId, routerScopeId }) {
  if (!callId || !routerScopeId) {
    throw new Error('allocateCallMedia requires callId and routerScopeId');
  }

  if (sessions.has(callId)) {
    await releaseCallMedia(callId);
  }

  const plainTransport = await createPlainTransport(routerScopeId, {
    listenIp: getAnnouncedListenIp(),
    rtcpMux: true,
    comedia: true,
  });

  const mediaIp = getAnnouncedIp() || plainTransport.tuple.localIp;
  const mediaPort = plainTransport.tuple.localPort;
  const localSdp = buildAudioOffer({ ip: mediaIp, port: mediaPort });

  sessions.set(callId, {
    lineId: String(lineId),
    callId: String(callId),
    routerScopeId,
    plainTransport,
    producer: null,
    consumer: null,
    localSdp,
    mediaIp,
    mediaPort,
  });

  logger.info('SIP call media allocated', {
    lineId,
    callId,
    routerScopeId,
    mediaIp,
    mediaPort,
  });

  return { localSdp, mediaIp, mediaPort, plainTransport };
}

/**
 * Connect PlainTransport to remote SDP endpoint and inject RTP into the line router.
 */
async function activateCallMedia(callId, remoteSdp) {
  const session = sessions.get(String(callId));
  if (!session) {
    throw new Error(`No SIP media session for call ${callId}`);
  }

  const remote = parseAudioMedia(remoteSdp);
  if (!remote.ip || !remote.port) {
    throw new Error('Remote SDP missing audio connection address');
  }

  const { plainTransport } = session;
  await plainTransport.connect({
    ip: remote.ip,
    port: remote.port,
  });

  const negotiated = negotiateCodec(['PCMU', 'PCMA'], remote);
  const rtpParameters = buildRtpParametersForCodec(
    negotiated.codec,
    negotiated.payloadType,
    undefined
  );

  if (session.producer) {
    try { session.producer.close(); } catch {}
    session.producer = null;
  }

  const producer = await plainTransport.produce({
    kind: 'audio',
    rtpParameters,
    appData: {
      source: 'sip-leg',
      lineId: session.lineId,
      callId: String(callId),
      groupId: session.routerScopeId,
    },
  });

  session.producer = producer;
  trackProducer(producer, session.routerScopeId);
  session.remoteMedia = remote;  session.negotiatedCodec = negotiated;

  logger.info('SIP call media activated', {
    callId,
    remoteIp: remote.ip,
    remotePort: remote.port,
    codec: negotiated.codec,
    payloadType: negotiated.payloadType,
    producerId: producer.id,
  });

  return { producer, remote, negotiated };
}

/**
 * Attach downlink: route an existing router producer (e.g. WPF mic) to the SBC via PlainTransport consumer.
 */
async function attachUplinkProducer(callId, sourceProducerId) {
  const session = sessions.get(String(callId));
  if (!session?.plainTransport || !sourceProducerId) return null;

  if (session.consumer) {
    try { session.consumer.close(); } catch {}
    session.consumer = null;
  }

  const router = await getOrCreateRouter(session.routerScopeId);
  if (!router) {
    throw new Error(`Router not found for ${session.routerScopeId}`);
  }

  const consumer = await session.plainTransport.consume({
    producerId: sourceProducerId,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  session.consumer = consumer;
  logger.info('SIP uplink consumer attached', { callId, consumerId: consumer.id, sourceProducerId });
  return consumer;
}

async function releaseCallMedia(callId) {
  const session = sessions.get(String(callId));
  if (!session) return;

  try {
    const { stopLineAudioBridge } = require('./sipLineAudioBridge');
    await stopLineAudioBridge(callId);
  } catch {}
  try {
    if (session.consumer) session.consumer.close();
  } catch {}
  try {
    if (session.producer) session.producer.close();
  } catch {}
  try {
    if (session.plainTransport) session.plainTransport.close();
  } catch {}

  sessions.delete(String(callId));
  logger.info('SIP call media released', { callId });
}

function getCallMediaSession(callId) {
  return sessions.get(String(callId)) || null;
}

function listCallMediaSessionsForRouter(routerScopeId) {
  const out = [];
  for (const [callId, session] of sessions.entries()) {
    if (session.routerScopeId === routerScopeId) {
      out.push({ callId, session });
    }
  }
  return out;
}

module.exports = {
  allocateCallMedia,
  activateCallMedia,
  attachUplinkProducer,
  releaseCallMedia,
  getCallMediaSession,
  listCallMediaSessionsForRouter,
};