const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { isProduction } = require('../utils/configValidation');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const DEV_FALLBACK_SECRET = 'your-secret-key';

function getJwtSecrets() {
  const secrets = [];
  if (process.env.JWT_SECRET) secrets.push(process.env.JWT_SECRET);
  if (process.env.JWT_ACCESS_TOKEN_SECRET) {
    secrets.push(process.env.JWT_ACCESS_TOKEN_SECRET);
  }
  if (secrets.length === 0 && !isProduction()) {
    secrets.push(DEV_FALLBACK_SECRET);
  }
  return secrets;
}

function getJwtSecret() {
  const secrets = getJwtSecrets();
  if (secrets.length === 0) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secrets[0];
}

function normalizeUserPayload(decoded) {
  if (!decoded || typeof decoded !== 'object') {
    return decoded;
  }
  if (decoded.role === 'admin') {
    decoded.role = 'platform_admin';
  }
  return decoded;
}

function verifyTokenWithAnySecret(token) {
  if (!token) return null;
  for (const secret of getJwtSecrets()) {
    try {
      return jwt.verify(token, secret);
    } catch {
      // try next secret
    }
  }
  return null;
}

function verifyToken(token) {
  const decoded = verifyTokenWithAnySecret(token);
  return decoded ? normalizeUserPayload(decoded) : null;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  return next();
}

function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const role = req.user.role === 'admin' ? 'platform_admin' : req.user.role;
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

const requirePlatformAdmin = requireRole('platform_admin');
const requireTenantAdmin = requireRole('tenant_admin', 'platform_admin');

function generateToken(user, tenantContext = {}) {
  const legacyId = user.username || user.id;
  const uid = user.uid || user.id;

  return jwt.sign(
    {
      id: legacyId,
      uid,
      username: user.username,
      email: user.email,
      role: user.role,
      source: user.source,
      tid: tenantContext.tenantId,
      stid: tenantContext.subTenantId,
      sid: tenantContext.siteId,
      tenantSlug: tenantContext.tenantSlug,
      sip: tenantContext.sipUri,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}

function safeEqualStrings(a, b) {
  if (a == null || b == null) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Federation HTTP API: shared secret (peer servers) or platform admin JWT.
 */
function requireFederationOrPlatformAdmin(req, res, next) {
  const headerSecret =
    req.headers['x-federation-secret'] || req.headers['x-federation-token'];
  const expected = process.env.FEDERATION_SECRET;

  if (headerSecret && expected && safeEqualStrings(headerSecret, expected)) {
    req.federationAuth = { mode: 'secret' };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.role === 'platform_admin') {
      req.user = decoded;
      req.federationAuth = { mode: 'jwt' };
      return next();
    }
  }

  return res.status(401).json({
    error: 'Federation secret (x-federation-secret) or platform admin token required',
  });
}

module.exports = {
  JWT_EXPIRES_IN,
  getJwtSecret,
  getJwtSecrets,
  verifyToken,
  verifyTokenWithAnySecret,
  authenticateToken,
  requireRole,
  requirePlatformAdmin,
  requireTenantAdmin,
  generateToken,
  getUserFromRequest,
  requireFederationOrPlatformAdmin,
};
