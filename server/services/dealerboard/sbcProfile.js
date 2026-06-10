/**
 * Primary / secondary SBC profile parsing for dealerboard lines.
 *
 * Stored shape (JSONB sbc_details):
 * {
 *   "primary": { host, port, username, password, domain, label? },
 *   "secondary": { ... } | null,
 *   "failbackToPrimary": true
 * }
 *
 * Legacy flat { host, port, ... } is treated as primary-only.
 */

const ENDPOINT_ROLES = ['primary', 'secondary'];

function parsePort(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const p = parseInt(value, 10);
  if (!Number.isFinite(p) || p <= 0) {
    throw new Error('Invalid SBC port');
  }
  return p;
}

function normalizeEndpoint(raw = {}, role = 'primary') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const host = raw.host !== undefined && raw.host !== null ? String(raw.host).trim() : '';
  if (!host) return null;

  const out = { role, host };
  const port = parsePort(raw.port);
  if (port !== undefined) out.port = port;
  if (raw.username) out.username = String(raw.username);
  if (raw.password) out.password = String(raw.password);
  if (raw.domain) out.domain = String(raw.domain);
  if (raw.label) out.label = String(raw.label);
  return out;
}

function endpointFromFlatPayload(payload, prefix = '') {
  const hostKey = prefix ? `${prefix}Host` : 'sbcHost';
  const portKey = prefix ? `${prefix}Port` : 'sbcPort';
  const userKey = prefix ? `${prefix}Username` : 'sbcUsername';
  const passKey = prefix ? `${prefix}Password` : 'sbcPassword';
  const domainKey = prefix ? `${prefix}Domain` : 'sbcDomain';
  const labelKey = prefix ? `${prefix}Label` : 'sbcLabel';

  const host = payload?.[hostKey];
  if (host === undefined || host === null || !String(host).trim()) {
    return null;
  }

  const raw = { host: String(host).trim() };
  if (payload?.[portKey] !== undefined && payload?.[portKey] !== null && String(payload[portKey]).trim() !== '') {
    raw.port = parsePort(payload[portKey]);
  }
  if (payload?.[userKey]) raw.username = String(payload[userKey]);
  if (payload?.[passKey]) raw.password = String(payload[passKey]);
  if (payload?.[domainKey]) raw.domain = String(payload[domainKey]);
  if (payload?.[labelKey]) raw.label = String(payload[labelKey]);

  return normalizeEndpoint(raw, prefix ? 'secondary' : 'primary');
}

function coerceStoredProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { primary: null, secondary: null, failbackToPrimary: true };
  }

  if (raw.primary && typeof raw.primary === 'object') {
    return {
      primary: normalizeEndpoint(raw.primary, 'primary'),
      secondary: normalizeEndpoint(raw.secondary, 'secondary'),
      failbackToPrimary: raw.failbackToPrimary !== false,
    };
  }

  if (raw.host) {
    return {
      primary: normalizeEndpoint(raw, 'primary'),
      secondary: normalizeEndpoint(raw.secondary, 'secondary'),
      failbackToPrimary: raw.failbackToPrimary !== false,
    };
  }

  return { primary: null, secondary: null, failbackToPrimary: raw.failbackToPrimary !== false };
}

function buildSbcProfileFromPayload(payload = {}) {
  let profile;
  if (payload.sbcDetails && typeof payload.sbcDetails === 'object' && !Array.isArray(payload.sbcDetails)) {
    const stored = coerceStoredProfile(payload.sbcDetails);
    const primary = stored.primary || endpointFromFlatPayload(payload);
    const secondary = stored.secondary || endpointFromFlatPayload(payload, 'sbcSecondary');
    profile = {
      primary,
      secondary,
      failbackToPrimary: payload.sbcFailbackToPrimary !== undefined
        ? payload.sbcFailbackToPrimary !== false && payload.sbcFailbackToPrimary !== 'false'
        : stored.failbackToPrimary !== false,
    };
  } else {
    profile = {
      primary: endpointFromFlatPayload(payload),
      secondary: endpointFromFlatPayload(payload, 'sbcSecondary'),
      failbackToPrimary: payload.sbcFailbackToPrimary !== false && payload.sbcFailbackToPrimary !== 'false',
    };
  }

  // Secondary SBC is an alternate route to the same SIP line — inherit identity from primary.
  if (profile.primary && profile.secondary) {
    if (!profile.secondary.username && profile.primary.username) {
      profile.secondary.username = profile.primary.username;
    }
    if (!profile.secondary.password && profile.primary.password) {
      profile.secondary.password = profile.primary.password;
    }
    if (!profile.secondary.domain && profile.primary.domain) {
      profile.secondary.domain = profile.primary.domain;
    }
  }

  return profile;
}

function serializeSbcProfile(profile) {
  const out = {
    failbackToPrimary: profile.failbackToPrimary !== false,
  };
  if (profile.primary) out.primary = { ...profile.primary };
  if (profile.secondary) out.secondary = { ...profile.secondary };
  return out;
}

function parseSbcProfile(sbcDetails) {
  const profile = coerceStoredProfile(sbcDetails);
  const endpoints = [];
  if (profile.primary) endpoints.push(profile.primary);
  if (profile.secondary) endpoints.push(profile.secondary);

  return {
    ...profile,
    endpoints,
    hasSecondary: endpoints.length > 1,
  };
}

function getPrimaryEndpoint(sbcDetails) {
  return parseSbcProfile(sbcDetails).primary;
}

function validateSbcProfile(profile) {
  if (!profile?.primary) {
    return { ok: true };
  }

  const primaryCheck = validateSingleEndpoint(profile.primary, 'Primary SBC');
  if (!primaryCheck.ok) return primaryCheck;

  if (profile.secondary) {
    const secondaryCheck = validateSingleEndpoint(profile.secondary, 'Secondary SBC');
    if (!secondaryCheck.ok) return secondaryCheck;

    if (
      profile.primary.host === profile.secondary.host
      && (profile.primary.port || 5060) === (profile.secondary.port || 5060)
    ) {
      return { ok: false, error: 'Secondary SBC must differ from primary (host/port)' };
    }

    // Both SBC paths must present the same SIP line identity (AOR) to the platform.
    const pUser = String(profile.primary.username || '').trim();
    const sUser = String(profile.secondary.username || '').trim();
    const pDomain = String(profile.primary.domain || '').trim();
    const sDomain = String(profile.secondary.domain || '').trim();

    if (sUser && pUser && sUser !== pUser) {
      return { ok: false, error: 'Secondary SBC username must match primary (same SIP line identity)' };
    }
    if (sDomain && pDomain && sDomain !== pDomain) {
      return { ok: false, error: 'Secondary SBC domain must match primary (same SIP line identity)' };
    }
  }

  return { ok: true };
}

function validateSingleEndpoint(endpoint, label) {
  if (!endpoint?.host || !String(endpoint.host).trim()) {
    return { ok: false, error: `${label} host is required` };
  }
  if (endpoint.port !== undefined) {
    const p = parseInt(endpoint.port, 10);
    if (!Number.isFinite(p) || p <= 0) {
      return { ok: false, error: `${label} port is invalid` };
    }
  }
  return { ok: true };
}

/** Flatten for admin API responses / legacy consumers. */
function flattenSbcForDisplay(sbcDetails) {
  const profile = parseSbcProfile(sbcDetails);
  const primary = profile.primary || {};
  const secondary = profile.secondary || {};
  return {
    sbcDetails: serializeSbcProfile(profile),
    sbcHost: primary.host || '',
    sbcPort: primary.port ?? '',
    sbcUsername: primary.username || '',
    sbcPassword: primary.password || '',
    sbcDomain: primary.domain || '',
    sbcLabel: primary.label || '',
    sbcSecondaryHost: secondary.host || '',
    sbcSecondaryPort: secondary.port ?? '',
    sbcSecondaryUsername: secondary.username || '',
    sbcSecondaryPassword: secondary.password || '',
    sbcSecondaryDomain: secondary.domain || '',
    sbcSecondaryLabel: secondary.label || '',
    sbcFailbackToPrimary: profile.failbackToPrimary !== false,
    hasSecondarySbc: profile.hasSecondary,
  };
}

function extractSbcPayloadFromBody(body = {}) {
  return {
    sbcDetails: body.sbcDetails,
    sbcHost: body.sbcHost,
    sbcPort: body.sbcPort,
    sbcUsername: body.sbcUsername,
    sbcPassword: body.sbcPassword,
    sbcDomain: body.sbcDomain,
    sbcLabel: body.sbcLabel,
    sbcSecondaryHost: body.sbcSecondaryHost,
    sbcSecondaryPort: body.sbcSecondaryPort,
    sbcSecondaryUsername: body.sbcSecondaryUsername,
    sbcSecondaryPassword: body.sbcSecondaryPassword,
    sbcSecondaryDomain: body.sbcSecondaryDomain,
    sbcSecondaryLabel: body.sbcSecondaryLabel,
    sbcFailbackToPrimary: body.sbcFailbackToPrimary,
  };
}

function hasSbcPayloadFields(body = {}) {
  const p = extractSbcPayloadFromBody(body);
  return Object.entries(p).some(([key, value]) => {
    if (key === 'sbcFailbackToPrimary') return value !== undefined;
    return value !== undefined;
  });
}

module.exports = {
  ENDPOINT_ROLES,
  normalizeEndpoint,
  buildSbcProfileFromPayload,
  serializeSbcProfile,
  parseSbcProfile,
  getPrimaryEndpoint,
  validateSbcProfile,
  flattenSbcForDisplay,
  extractSbcPayloadFromBody,
  hasSbcPayloadFields,
};
