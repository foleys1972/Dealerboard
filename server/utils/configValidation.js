const logger = require('./logger');

const WEAK_JWT_SECRETS = new Set([
  'your-secret-key',
  'dev_secret',
  'federation-secret-key',
]);

const MIN_SECRET_LENGTH = 32;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function isWeakSecret(value) {
  if (!value) return true;
  const s = String(value);
  return s.length < MIN_SECRET_LENGTH || WEAK_JWT_SECRETS.has(s);
}

/**
 * Validate required configuration. Throws on fatal errors in production.
 * Call before the HTTP server starts.
 */
function validateServerConfig() {
  const errors = [];
  const warnings = [];

  if (isProduction()) {
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET must be set in production');
    } else if (isWeakSecret(process.env.JWT_SECRET)) {
      errors.push(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters and not a known default value`
      );
    }

    if (process.env.ALLOW_BOOTSTRAP_USERS === 'true') {
      errors.push('ALLOW_BOOTSTRAP_USERS must not be enabled in production');
    }

    if (process.env.FEDERATION_ENABLED === 'true') {
      if (!process.env.FEDERATION_SECRET) {
        errors.push('FEDERATION_SECRET must be set when FEDERATION_ENABLED=true');
      } else if (isWeakSecret(process.env.FEDERATION_SECRET)) {
        errors.push(
          `FEDERATION_SECRET must be at least ${MIN_SECRET_LENGTH} characters and not a known default value`
        );
      }
    }

    if (String(process.env.ENABLE_LOCAL_AGENT || '').toLowerCase() === 'true') {
      if (!process.env.AGENT_TOKEN) {
        errors.push('AGENT_TOKEN must be set when ENABLE_LOCAL_AGENT=true');
      } else if (String(process.env.AGENT_TOKEN).length < MIN_SECRET_LENGTH) {
        errors.push(`AGENT_TOKEN must be at least ${MIN_SECRET_LENGTH} characters`);
      }
    }
  } else {
    if (!process.env.JWT_SECRET) {
      warnings.push(
        'JWT_SECRET is not set; using development fallback (never use in production)'
      );
    } else if (isWeakSecret(process.env.JWT_SECRET)) {
      warnings.push('JWT_SECRET is weak or short; set a strong secret before deploying');
    }
  }

  for (const msg of warnings) {
    logger.warn(`[config] ${msg}`);
  }

  if (errors.length > 0) {
    const message = `Server configuration invalid:\n- ${errors.join('\n- ')}`;
    logger.error(message);
    throw new Error(message);
  }
}

/** Whether default admin/trader bootstrap users may be created. */
function allowBootstrapUsers() {
  if (isProduction()) {
    return false;
  }
  return process.env.ALLOW_BOOTSTRAP_USERS !== 'false';
}

module.exports = {
  validateServerConfig,
  isProduction,
  allowBootstrapUsers,
  isWeakSecret,
  MIN_SECRET_LENGTH,
};
