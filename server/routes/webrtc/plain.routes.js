const express = require('express');
const router = express.Router();
const {
  getRouter,
  getWorker,
  createGroupRouter,
  getOrCreateRouter,
  createWebRtcTransport,
  createPlainTransport,
  getTransportById,
  connectTransport,
  produceMedia,
  createConsumer,
  getRouterRtpCapabilities,
  getProducersByGroup,
  getGroupRouter,
  listGroupRouterIds,
  getSFUStats,
} = require('../../services/mediaSoupService');
const { audioRecordingService } = require('../../services/audioRecordingService');
const logger = require('../../utils/logger');
const { getScopedGroupId } = require('./routeHelpers');
router.post('/plain-produce', async (req, res) => {
  try {
    const { groupId, transportId, rtpParameters, appData = {} } = req.body || {};
    const targetGroupId = groupId || appData.groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);

    if (!transportId || !rtpParameters) {
      return res.status(400).json({ error: 'transportId and rtpParameters are required' });
    }

    await getOrCreateRouter(scopedGroupId);

    const producer = await produceMedia(transportId, 'audio', rtpParameters, {
      ...appData,
      groupId: scopedGroupId,
      userId: req.user?.id,
      source: 'plain-transport'
    });

    try {
      const { onLineRouterProducerCreated } = require('../../services/sip/sipLineAudioBridge');
      await onLineRouterProducerCreated(scopedGroupId, producer.id);
    } catch (hookError) {
      logger.debug('Line audio producer hook failed', hookError?.message || hookError);
    }

    res.json({
      id: producer.id,
      kind: producer.kind,
    });
  } catch (error) {
    logger.error('Failed to plain-produce:', error);
    res.status(500).json({ error: error.message || 'Failed to create plain producer' });
  }
});

// Create a consumer for a producer and send RTP back to the client using a connected PlainTransport (WPF downlink).
router.post('/plain-consume', async (req, res) => {
  try {
    const { groupId, producerId, ip, port, rtcpPort, comedia = false, rtcpMux = true } = req.body || {};
    const targetGroupId = groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);

    if (!producerId || !ip || !port) {
      return res.status(400).json({ error: 'producerId, ip and port are required' });
    }

    await getOrCreateRouter(scopedGroupId);

    // Create a downlink transport and connect it to the client endpoint.
    const downlinkTransport = await createPlainTransport(scopedGroupId, { comedia, rtcpMux });
    await downlinkTransport.connect({ ip, port, rtcpPort });

    // Use the router's negotiated RTP capabilities for this scoped group.
    // Hard-coding Opus params/payload types can cause mediasoup `canConsume` to fail.
    const routerRtpCapabilities = getRouterRtpCapabilities(scopedGroupId);
    const consumer = await createConsumer(scopedGroupId, downlinkTransport.id, producerId, routerRtpCapabilities);

    res.json({
      transport: {
        id: downlinkTransport.id,
        tuple: downlinkTransport.tuple,
        rtcpTuple: downlinkTransport.rtcpTuple,
        rtcpMux: downlinkTransport.rtcpMux,
        comedia: downlinkTransport.comedia,
      },
      consumer
    });
  } catch (error) {
    logger.error('Failed to plain-consume:', error);
    res.status(500).json({ error: error.message || 'Failed to create plain consumer' });
  }
});

// Create PlainTransport (RTP bridge for non-WebRTC endpoints like WPF)
router.post('/plain-transport', async (req, res) => {
  try {
    const { groupId, comedia = true, rtcpMux = true } = req.body || {};
    const targetGroupId = groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);
    await getOrCreateRouter(scopedGroupId);

    const transport = await createPlainTransport(scopedGroupId, { comedia, rtcpMux });

    res.json({
      id: transport.id,
      tuple: transport.tuple,
      rtcpTuple: transport.rtcpTuple,
      rtcpMux: transport.rtcpMux,
      comedia: transport.comedia,
    });
  } catch (error) {
    logger.error('Failed to create PlainTransport:', error);
    res.status(500).json({ error: error.message || 'Failed to create plain transport' });
  }
});

// Connect PlainTransport to a remote endpoint so MediaSoup can send RTP to the client.
// For uplink (client -> server) with comedia=true you typically don't need this, but it's
// required for downlink (server -> client).
router.post('/plain-transport/connect', async (req, res) => {
  try {
    const { transportId, ip, port, rtcpPort } = req.body;

    if (!transportId || !ip || !port) {
      return res.status(400).json({ error: 'transportId, ip and port are required' });
    }

    const transport = getTransportById(transportId);
    if (!transport || typeof transport.connect !== 'function') {
      return res.status(404).json({ error: 'Transport not found or not connectable' });
    }

    await transport.connect({ ip, port, rtcpPort });
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to connect PlainTransport:', error);
    res.status(500).json({ error: error.message || 'Failed to connect plain transport' });
  }
});

module.exports = router;
