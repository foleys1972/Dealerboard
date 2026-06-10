const { execFile } = require('child_process');

function requireAgentToken(req, res, next) {
  const expected = process.env.AGENT_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Agent is not configured (AGENT_TOKEN missing)' });
  }

  const token = req.headers['x-agent-token'] ? String(req.headers['x-agent-token']) : '';
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

function parseAllowedServices() {
  const raw = process.env.AGENT_ALLOWED_SERVICES;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function execSc(args) {
  return new Promise((resolve, reject) => {
    execFile('sc', args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(stderr || stdout || error.message);
        err.code = error.code;
        return reject(err);
      }
      return resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

module.exports = {
  requireAgentToken,
  parseAllowedServices,
  execSc,
};
