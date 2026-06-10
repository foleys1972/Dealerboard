const logger = require('../../utils/logger');
const { getProducersByGroup, getOrCreateRouter, trackProducer } = require('../mediaSoupService');
const { getAudioTranscodingService } = require('../audioTranscodingService');
const { getCallMediaSession, listCallMediaSessionsForRouter } = require('./sipLineMedia');
const { buildRtpParametersForCodec } = require('./sipSdp');

/** callId -> bridge runtime state */
const bridges = new Map();

function buildOpusRtpParameters(ssrc) {
  return {
    codecs: [{
      mimeType: 'audio/opus',
      payloadType: 111,
      clockRate: 48000,
      channels: 2,
      parameters: { minptime: 10, useinbandfec: 1 },
    }],
    headerExtensions: [],
    encodings: [{ ssrc }],
    rtcp: { cname: `sip-relay-${ssrc}` },
  };
}

function parseRtpPacket(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const cc = buffer[0] & 0x0f;
  const x = (buffer[0] & 0x10) !== 0;
  let headerLen = 12 + cc * 4;
  if (x && buffer.length >= headerLen + 4) {
    const extLenWords = (buffer[headerLen + 2] << 8) | buffer[headerLen + 3];
    headerLen += 4 + extLenWords * 4;
  }
  if (buffer.length <= headerLen) return null;
  return {
    payloadType: buffer[1] & 0x7f,
    payload: buffer.slice(headerLen),
  };
}

function buildRtpPacket(payload, payloadType, sequence, timestamp, ssrc, marker = false) {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = (marker ? 0x80 : 0) | (payloadType & 0x7f);
  header.writeUInt16BE(sequence & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, payload]);
}

function isWpfMicProducer(producer, excludeIds = new Set()) {
  if (!producer || producer.kind !== 'audio') return false;
  if (excludeIds.has(producer.id)) return false;
  const app = producer.appData || {};
  if (app.source === 'sip-leg' || app.source === 'sip-relay' || app.source === 'sip-uplink-relay') {
    return false;
  }
  return app.source === 'plain-transport' || app.client === 'wpf';
}

function findWpfMicProducerId(routerScopeId, excludeIds = new Set()) {
  const producers = getProducersByGroup(routerScopeId);
  const candidates = producers.filter((p) => isWpfMicProducer(p, excludeIds));
  if (!candidates.length) return null;
  return candidates[candidates.length - 1].id;
}

function closeResource(resource) {
  try {
    if (resource) resource.close();
  } catch {}
}

async function closeUplinkResources(bridge) {
  if (!bridge) return;
  closeResource(bridge.wpfToSipConsumer);
  closeResource(bridge.wpfToSipRelayProducer);
  closeResource(bridge.wpfToSipDirectTransport);
  closeResource(bridge.pcmuDirectTransport);
  closeResource(bridge.sipUplinkPlainConsumer);
  bridge.wpfToSipConsumer = null;
  bridge.wpfToSipRelayProducer = null;
  bridge.wpfToSipDirectTransport = null;
  bridge.pcmuDirectTransport = null;
  bridge.sipUplinkPlainConsumer = null;
  bridge.attachedMicProducerId = null;
}

async function closeBridgeResources(bridge) {
  if (!bridge) return;
  closeResource(bridge.sipToOpusConsumer);
  closeResource(bridge.sipToOpusRelayProducer);
  closeResource(bridge.sipToOpusDirectTransport);
  await closeUplinkResources(bridge);
}

async function stopLineAudioBridge(callId) {
  const bridge = bridges.get(String(callId));
  if (!bridge) return;
  await closeBridgeResources(bridge);
  bridges.delete(String(callId));
  logger.info('SIP line audio bridge stopped', { callId });
}

async function startSipToOpusRelay(callId) {
  const session = getCallMediaSession(callId);
  if (!session?.producer?.id || !session.routerScopeId || !session.remoteMedia) return null;

  const existing = bridges.get(String(callId));
  if (existing?.sipToOpusRelayProducer) return existing.sipToOpusRelayProducer;

  const router = await getOrCreateRouter(session.routerScopeId);
  if (!router) return null;

  const transcoding = getAudioTranscodingService();
  const sipCodec = session.negotiatedCodec?.codec || 'PCMU';
  const relaySsrc = Math.floor(Math.random() * 0xffffffff);

  const directTransport = await router.createDirectTransport();
  const sipConsumer = await directTransport.consume({
    producerId: session.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true,
  });

  const relayProducer = await directTransport.produce({
    kind: 'audio',
    rtpParameters: buildOpusRtpParameters(relaySsrc),
    appData: {
      source: 'sip-relay',
      lineId: session.lineId,
      callId: String(callId),
      groupId: session.routerScopeId,
    },
  });
  trackProducer(relayProducer, session.routerScopeId);

  let outSeq = 0;
  let outTs = 0;

  sipConsumer.on('rtp', async (rtpPacket) => {
    try {
      const parsed = parseRtpPacket(rtpPacket);
      if (!parsed?.payload?.length) return;

      const pcm48k = await transcoding.transcodeSIPToMediaSoup(parsed.payload, sipCodec);
      const frameBytes = 960 * 2;
      const mono48k = pcm48k.length >= frameBytes ? pcm48k.slice(0, frameBytes) : pcm48k;
      const opusPayload = await transcoding.encodeOpus(mono48k, 48000, 1);
      relayProducer.send(buildRtpPacket(opusPayload, 111, outSeq, outTs, relaySsrc));
      outSeq = (outSeq + 1) & 0xffff;
      outTs = (outTs + 960) >>> 0;
    } catch (error) {
      logger.debug('SIP→Opus relay packet failed', { callId, error: error?.message || error });
    }
  });

  await sipConsumer.resume();

  const bridge = existing || {};
  bridge.sipToOpusConsumer = sipConsumer;
  bridge.sipToOpusRelayProducer = relayProducer;
  bridge.sipToOpusDirectTransport = directTransport;
  bridges.set(String(callId), bridge);

  logger.info('SIP→Opus relay started for line call', {
    callId,
    sipProducerId: session.producer.id,
    relayProducerId: relayProducer.id,
  });

  return relayProducer;
}

async function startOpusToSipUplink(callId, wpfProducerId) {
  const session = getCallMediaSession(callId);
  if (!session?.plainTransport || !wpfProducerId || !session.remoteMedia) return null;

  const existing = bridges.get(String(callId));
  if (existing?.wpfToSipRelayProducer && existing.attachedMicProducerId === wpfProducerId) {
    return existing.wpfToSipRelayProducer;
  }

  if (existing) {
    await closeUplinkResources(existing);
  }

  const router = await getOrCreateRouter(session.routerScopeId);
  if (!router) return null;

  const transcoding = getAudioTranscodingService();
  const sipCodec = session.negotiatedCodec?.codec || 'PCMU';
  const sipPayloadType = session.negotiatedCodec?.payloadType || 0;
  const uplinkSsrc = Math.floor(Math.random() * 0xffffffff);

  const opDirect = await router.createDirectTransport();
  const wpfConsumer = await opDirect.consume({
    producerId: wpfProducerId,
    rtpCapabilities: router.rtpCapabilities,
    paused: true,
  });

  const pcmDirect = await router.createDirectTransport();
  const pcmuProducer = await pcmDirect.produce({
    kind: 'audio',
    rtpParameters: buildRtpParametersForCodec(sipCodec, sipPayloadType, uplinkSsrc),
    appData: {
      source: 'sip-uplink-relay',
      callId: String(callId),
      lineId: session.lineId,
      groupId: session.routerScopeId,
    },
  });
  trackProducer(pcmuProducer, session.routerScopeId);

  if (session.consumer) {
    closeResource(session.consumer);
    session.consumer = null;
  }

  const sipUplinkConsumer = await session.plainTransport.consume({
    producerId: pcmuProducer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });
  session.consumer = sipUplinkConsumer;

  let outSeq = 0;
  let outTs = 0;

  wpfConsumer.on('rtp', async (rtpPacket) => {
    try {
      const parsed = parseRtpPacket(rtpPacket);
      if (!parsed?.payload?.length) return;

      const pcm48k = await transcoding.rtpPayloadToPCM(parsed.payload, 'OPUS', {
        sampleRate: 48000,
        channels: 2,
      });
      const pcmuPayload = await transcoding.transcodeMediaSoupToSIP(pcm48k, sipCodec);
      pcmuProducer.send(buildRtpPacket(pcmuPayload, sipPayloadType, outSeq, outTs, uplinkSsrc));
      outSeq = (outSeq + 1) & 0xffff;
      outTs = (outTs + 160) >>> 0;
    } catch (error) {
      logger.debug('Opus→SIP uplink packet failed', { callId, error: error?.message || error });
    }
  });

  await wpfConsumer.resume();

  const bridge = existing || {};
  bridge.wpfToSipConsumer = wpfConsumer;
  bridge.wpfToSipRelayProducer = pcmuProducer;
  bridge.wpfToSipDirectTransport = opDirect;
  bridge.pcmuDirectTransport = pcmDirect;
  bridge.sipUplinkPlainConsumer = sipUplinkConsumer;
  bridge.attachedMicProducerId = wpfProducerId;
  bridges.set(String(callId), bridge);

  logger.info('Opus→SIP uplink relay started', {
    callId,
    wpfProducerId,
    pcmuProducerId: pcmuProducer.id,
    codec: sipCodec,
  });

  return pcmuProducer;
}

async function syncLineCallAudio(callId) {
  const session = getCallMediaSession(callId);
  if (!session?.routerScopeId || !session.remoteMedia) {
    return { callId, synced: false };
  }

  const exclude = new Set();
  if (session.producer?.id) exclude.add(session.producer.id);
  const relayId = bridges.get(String(callId))?.sipToOpusRelayProducer?.id;
  if (relayId) exclude.add(relayId);

  try {
    await startSipToOpusRelay(callId);
  } catch (error) {
    logger.warn('Failed to start SIP→Opus relay', { callId, error: error?.message || error });
  }

  const micProducerId = findWpfMicProducerId(session.routerScopeId, exclude);
  if (micProducerId) {
    try {
      await startOpusToSipUplink(callId, micProducerId);
    } catch (error) {
      logger.warn('Failed to start Opus→SIP uplink', { callId, micProducerId, error: error?.message || error });
    }
  }

  const state = bridges.get(String(callId));
  return {
    callId,
    synced: true,
    micProducerId: micProducerId || null,
    hasSipRelay: Boolean(state?.sipToOpusRelayProducer),
    hasUplink: Boolean(state?.wpfToSipRelayProducer),
  };
}

async function onLineRouterProducerCreated(routerScopeId, producerId) {
  if (!routerScopeId || !producerId) return;

  const producers = getProducersByGroup(routerScopeId);
  const producer = producers.find((p) => p.id === producerId);
  if (!isWpfMicProducer(producer)) return;

  for (const { callId, session } of listCallMediaSessionsForRouter(routerScopeId)) {
    if (!session?.remoteMedia) continue;
    const exclude = new Set([session.producer?.id].filter(Boolean));
    if (!isWpfMicProducer(producer, exclude)) continue;
    try {
      await syncLineCallAudio(callId);
    } catch (error) {
      logger.warn('Line audio resync failed after producer created', {
        callId,
        producerId,
        error: error?.message || error,
      });
    }
  }
}

module.exports = {
  parseRtpPacket,
  buildRtpPacket,
  isWpfMicProducer,
  findWpfMicProducerId,
  startSipToOpusRelay,
  startOpusToSipUplink,
  syncLineCallAudio,
  stopLineAudioBridge,
  onLineRouterProducerCreated,
};
