const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const logger = require('../../utils/logger');
const { handleServiceError } = require('./routeHelpers');
const { toggleMonitor } = require('../../services/dealerboard/monitorService');
const {
  callPrivateWire,
  callDdiLine,
  signalPrivateWire,
  endPrivateWireCall,
  sendDtmf,
  callSpeedDial,
  endLegacyLine,
  privateWireExists,
  ddiLineExists,
  answerIncomingLine,
} = require('../../services/dealerboard/lineCallService');
const {
  transferLineCall,
  conferenceLineCall,
  endLineConference,
} = require('../../services/dealerboard/lineTransferConferenceService');

function forwardToDealerboardRoute(req, res, targetPath) {
  const dealerboardRouter = require('./index');
  const savedUrl = req.url;
  req.url = targetPath;
  dealerboardRouter(req, res, (err) => {
    req.url = savedUrl;
    if (err) {
      logger.error('Dealerboard route forward failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal routing error' });
      }
      return;
    }
    if (!res.headersSent) {
      res.status(404).json({ error: 'Route not found' });
    }
  });
}

router.post('/private-wires/:lineId/call', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await callPrivateWire({
      lineId: req.params.lineId,
      userId,
      autoRing: req.body?.autoRing,
      hoot: req.body?.hoot,
      digits: req.body?.digits,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to call line');
  }
});

router.post('/lines/:lineId/call', authenticateToken, async (req, res) => {
  try {
    const lineId = req.params.lineId;
    if (await privateWireExists(lineId)) {
      return forwardToDealerboardRoute(req, res, `/private-wires/${lineId}/call`);
    }

    const userId = req.user.id || req.user.userId;
    const result = await callDdiLine({ lineId, userId, digits: req.body?.digits });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to call line');
  }
});

router.post('/private-wires/:lineId/monitor', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await toggleMonitor({
      lineId: req.params.lineId,
      userId,
      enabled: req.body?.enabled,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to toggle monitor');
  }
});

router.post('/private-wires/:lineId/answer', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await answerIncomingLine({
      lineId: req.params.lineId,
      userId,
      sipCallId: req.body?.sipCallId,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to answer incoming call');
  }
});

router.post('/lines/:lineId/answer', authenticateToken, async (req, res) => {
  try {
    const lineId = req.params.lineId;
    const userId = req.user.id || req.user.userId;
    const result = await answerIncomingLine({
      lineId,
      userId,
      sipCallId: req.body?.sipCallId,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to answer incoming call');
  }
});

router.post('/private-wires/:lineId/signal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await signalPrivateWire({ lineId: req.params.lineId, userId });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to send signal');
  }
});

router.post('/lines/:lineId/signal', authenticateToken, async (req, res) => {
  try {
    const lineId = req.params.lineId;
    if (await privateWireExists(lineId)) {
      return forwardToDealerboardRoute(req, res, `/private-wires/${lineId}/signal`);
    }
    throw new LineOperationError(404, 'Line not found');
  } catch (error) {
    handleServiceError(res, error, 'Failed to send signal');
  }
});

router.post('/private-wires/:lineId/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await endPrivateWireCall({ lineId: req.params.lineId, userId });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to end call');
  }
});

router.post('/lines/:lineId/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await endLegacyLine({ lineId: req.params.lineId, userId });
    if (result.forwardTo) {
      return forwardToDealerboardRoute(req, res, result.forwardTo);
    }
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to end call');
  }
});

router.post('/ddi-lines/:lineId/dtmf', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await sendDtmf({
      lineId: req.params.lineId,
      userId,
      digit: req.body?.digit,
      callId: req.body?.callId,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to send DTMF');
  }
});

router.post('/lines/:lineId/dtmf', authenticateToken, async (req, res) => {
  try {
    const lineId = req.params.lineId;
    const userId = req.user.id || req.user.userId;

    if (await ddiLineExists(lineId)) {
      return forwardToDealerboardRoute(req, res, `/ddi-lines/${lineId}/dtmf`);
    }

    if (await privateWireExists(lineId)) {
      const result = await sendDtmf({
        lineId,
        userId,
        digit: req.body?.digit,
        callId: req.body?.callId,
      });
      return res.json(result);
    }

    throw new LineOperationError(404, 'Line not found');
  } catch (error) {
    handleServiceError(res, error, 'Failed to send DTMF');
  }
});

router.post('/speed-dial/:speedDialId/call', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await callSpeedDial({ speedDialId: req.params.speedDialId, userId });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to call speed dial');
  }
});

router.post('/lines/:lineId/transfer', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await transferLineCall({
      lineId: req.params.lineId,
      userId,
      targetLineId: req.body?.targetLineId,
      digits: req.body?.digits,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to transfer call');
  }
});

router.post('/lines/:lineId/conference', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await conferenceLineCall({
      lineId: req.params.lineId,
      userId,
      targetLineId: req.body?.targetLineId,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to conference lines');
  }
});

router.post('/lines/:lineId/conference/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await endLineConference({ lineId: req.params.lineId, userId });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to end conference');
  }
});

module.exports = router;
