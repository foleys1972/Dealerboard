const express = require('express');
const logger = require('../../utils/logger');
const { getUcSentinelDeliveryService } = require('../../services/ucSentinelDeliveryService');
const { requireAgentToken, parseAllowedServices, execSc } = require('./routeHelpers');

const router = express.Router();

router.post('/service', requireAgentToken, async (req, res) => {
  try {
    const enable = String(process.env.ENABLE_LOCAL_AGENT || '').toLowerCase() === 'true';
    if (!enable) {
      return res.status(403).json({ error: 'Agent is disabled (set ENABLE_LOCAL_AGENT=true)' });
    }

    const action = req.body?.action ? String(req.body.action).toLowerCase() : '';
    const serviceName = req.body?.serviceName ? String(req.body.serviceName) : '';

    if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });
    if (!['start', 'stop', 'restart', 'status'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be start, stop, restart, or status' });
    }

    const allowed = parseAllowedServices();
    if (allowed.length > 0 && !allowed.includes(serviceName)) {
      return res.status(403).json({ error: 'serviceName is not allowed by AGENT_ALLOWED_SERVICES' });
    }

    if (action === 'status') {
      const out = await execSc(['query', serviceName]);
      getUcSentinelDeliveryService().enqueueAudit({
        action,
        serviceName,
        success: true,
        result: out.stdout,
      }).catch(() => {});
      return res.json({ success: true, action, serviceName, result: out.stdout });
    }

    if (action === 'stop') {
      const out = await execSc(['stop', serviceName]);
      getUcSentinelDeliveryService().enqueueAudit({
        action,
        serviceName,
        success: true,
        result: out.stdout,
      }).catch(() => {});
      return res.json({ success: true, action, serviceName, result: out.stdout });
    }

    if (action === 'start') {
      const out = await execSc(['start', serviceName]);
      getUcSentinelDeliveryService().enqueueAudit({
        action,
        serviceName,
        success: true,
        result: out.stdout,
      }).catch(() => {});
      return res.json({ success: true, action, serviceName, result: out.stdout });
    }

    const stopOut = await execSc(['stop', serviceName]);
    const startOut = await execSc(['start', serviceName]);
    getUcSentinelDeliveryService().enqueueAudit({
      action,
      serviceName,
      success: true,
      result: `${stopOut.stdout}\n${startOut.stdout}`,
    }).catch(() => {});
    return res.json({
      success: true,
      action,
      serviceName,
      result: `${stopOut.stdout}\n${startOut.stdout}`,
    });
  } catch (error) {
    logger.error('Agent service control failed:', error);
    try {
      const action = req.body?.action ? String(req.body.action).toLowerCase() : '';
      const serviceName = req.body?.serviceName ? String(req.body.serviceName) : '';
      getUcSentinelDeliveryService().enqueueAudit({
        action,
        serviceName,
        success: false,
        error: error.message,
      }).catch(() => {});
    } catch {}
    return res.status(500).json({ error: 'Service control failed', details: error.message });
  }
});

module.exports = router;
