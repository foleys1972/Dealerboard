/**
 * Normalize Intercom / Dealerboard client flags from API or form values.
 * JSONB and form fields may arrive as booleans, strings, or numbers.
 */
export function normalizeClientFlag(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  if (typeof value === 'number') return value === 1;
  return Boolean(value);
}

/** Resolve Intercom/Dealerboard access from list API fields or nested settings. */
export function getUserClientAccess(user) {
  if (!user) {
    return { intercomEnabled: true, dealerboardEnabled: false };
  }

  const settings = user.settings || {};
  const intercomRaw = user.intercomEnabled ?? settings.intercomEnabled;
  const dealerboardRaw = user.dealerboardEnabled ?? settings.dealerboardEnabled;

  return {
    intercomEnabled: normalizeClientFlag(intercomRaw, true),
    dealerboardEnabled: normalizeClientFlag(dealerboardRaw, false),
  };
}

export function getDefaultLayoutTab({ intercomEnabled, dealerboardEnabled }) {
  const intercom = normalizeClientFlag(intercomEnabled, true);
  const dealerboard = normalizeClientFlag(dealerboardEnabled, false);

  if (dealerboard && !intercom) return 'dealerboard';
  if (intercom && !dealerboard) return 'intercom';
  if (dealerboard) return 'dealerboard';
  if (intercom) return 'intercom';
  return 'dealerboard';
}
