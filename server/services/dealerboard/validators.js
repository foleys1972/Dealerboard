const crypto = require('crypto');
const {
  buildSbcProfileFromPayload,
  serializeSbcProfile,
  validateSbcProfile,
} = require('./sbcProfile');

function normalizeSbcDetails(payload = {}) {
  const profile = buildSbcProfileFromPayload(payload);
  return serializeSbcProfile(profile);
}

function validateSbcDetails(sbcDetails) {
  if (sbcDetails?.primary && typeof sbcDetails.primary === 'object') {
    if (!String(sbcDetails.primary.host || '').trim()) {
      return { ok: false, error: 'Primary SBC host is required' };
    }
  }

  const profile = buildSbcProfileFromPayload({ sbcDetails });
  return validateSbcProfile(profile);
}

function validatePrivateWirePayload({
  uriAddress,
  mode,
  isExternalCommunity,
  externalCommunityId,
  externalCommunityName,
  isInternalWire,
}) {
  const normalizedMode = mode !== undefined && mode !== null ? String(mode).trim().toUpperCase() : mode;

  const internalFlag = isInternalWire === true || isInternalWire === 'true';
  const isInternalOnlyMode =
    internalFlag ||
    (normalizedMode && ['INTERNAL', 'INTERCOM', 'GROUP', 'BROADCAST'].includes(normalizedMode));

  if (uriAddress !== undefined && uriAddress !== null) {
    const u = String(uriAddress).trim();
    if (!u) {
      if (!isInternalOnlyMode) return { ok: false, error: 'URI address is required' };
    } else if (!isInternalOnlyMode && !u.toLowerCase().startsWith('sip:')) {
      return { ok: false, error: 'URI address must start with sip:' };
    }
  }

  if (normalizedMode !== undefined) {
    if (!['ARD', 'MRD', 'HOOT', 'INTERNAL', 'INTERCOM', 'GROUP', 'BROADCAST'].includes(normalizedMode)) {
      return { ok: false, error: 'Invalid mode' };
    }
  }

  if (normalizedMode === 'HOOT') {
    if (!isExternalCommunity && !internalFlag) {
      return { ok: false, error: 'HOOT lines must be External Community Connections (unless internal wire)' };
    }
  }

  if (isExternalCommunity) {
    if (normalizedMode && normalizedMode !== 'HOOT') {
      return { ok: false, error: 'External community connections are only supported for HOOT lines' };
    }
    if (!externalCommunityId || !externalCommunityName) {
      return { ok: false, error: 'External community ID and name required for external community wires' };
    }
  }

  return { ok: true };
}

function generateSudoLineReference() {
  return `LINE-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function modeToSignallingType(mode) {
  const m = String(mode || '').trim().toUpperCase();
  if (m === 'ARD') return 'AUTO_RINGDOWN';
  if (m === 'MRD') return 'MANUAL_RINGDOWN';
  if (m === 'HOOT') return 'NONE';
  return 'MANUAL_RINGDOWN';
}

function isAdminRole(role) {
  return role === 'platform_admin' || role === 'tenant_admin' || role === 'admin';
}

module.exports = {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
  isAdminRole,
};
