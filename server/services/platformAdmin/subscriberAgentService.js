const axios = require('axios');
const { getSubscriberForAgent } = require('../../db/platformAdmin/subscribers');
const { PlatformAdminError } = require('./errors');

async function forwardAgentServiceControl(subscriberId, body) {
  const id = String(subscriberId || '').trim();
  if (!id) throw new PlatformAdminError(400, 'subscriberId is required');

  const action = body?.action ? String(body.action).toLowerCase() : '';
  const serviceName = body?.serviceName ? String(body.serviceName) : '';

  if (!serviceName) throw new PlatformAdminError(400, 'serviceName is required');
  if (!['start', 'stop', 'restart', 'status'].includes(action)) {
    throw new PlatformAdminError(400, 'Invalid action. Must be start, stop, restart, or status');
  }

  const agentToken = process.env.AGENT_TOKEN;
  if (!agentToken) {
    throw new PlatformAdminError(503, 'AGENT_TOKEN is not configured on this server');
  }

  const row = await getSubscriberForAgent(id);
  if (!row) throw new PlatformAdminError(404, 'Subscriber not found');

  const serverUrl = row.server_url ? String(row.server_url) : '';
  if (!serverUrl) throw new PlatformAdminError(400, 'Subscriber serverUrl is not set');

  const allowedServices = Array.isArray(row.metadata?.agent?.allowedServices)
    ? row.metadata.agent.allowedServices.map((s) => String(s))
    : [];

  if (allowedServices.length > 0 && !allowedServices.includes(serviceName)) {
    throw new PlatformAdminError(403, 'serviceName is not allowed for this subscriber');
  }

  try {
    const targetUrl = `${serverUrl.replace(/\/+$/, '')}/api/agent/service`;
    const result = await axios.post(
      targetUrl,
      { action, serviceName },
      {
        timeout: 15000,
        headers: {
          'x-agent-token': agentToken,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      subscriber: {
        id: row.id,
        name: row.name,
        serverId: row.server_id,
        serverUrl,
        isActive: row.is_active,
      },
      allowedServices,
      agent: result.data,
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status && data) {
      throw new PlatformAdminError(status, data.error || 'Agent request failed', data.details);
    }
    throw error;
  }
}

module.exports = {
  forwardAgentServiceControl,
};
