/**
 * Load-aware subscriber selection for a user's location.
 *
 * Each location has a primary and (optionally) secondary subscriber assignment.
 * Normally users route to the primary; when the primary is over a load
 * threshold we overflow them to the secondary. Both subscribers serve the same
 * groups linked through the publisher hub, so a conference simply spans the two
 * rooms — no media re-plumbing required.
 */

// Overflow once the primary crosses this fraction of its configured capacity.
const DEFAULT_OVERFLOW_THRESHOLD = 0.85;

function loadRatioOf(candidate) {
  const r = candidate?.load?.loadRatio;
  return typeof r === 'number' && Number.isFinite(r) ? r : 0;
}

/**
 * Decide which subscriber a user should connect to.
 *
 * @param {object} args
 * @param {{serverUrl?:string, load?:{loadRatio?:number}}|null} args.primary
 * @param {{serverUrl?:string, load?:{loadRatio?:number}}|null} args.secondary
 * @param {number} [args.threshold] overflow threshold (0..1)
 * @returns {{ serverUrl: string, reason: string }|null} chosen subscriber, or null if none
 */
function pickSubscriber({ primary, secondary, threshold = DEFAULT_OVERFLOW_THRESHOLD } = {}) {
  const p = primary && primary.serverUrl ? primary : null;
  const s = secondary && secondary.serverUrl ? secondary : null;

  if (!p && !s) return null;
  if (p && !s) return { serverUrl: p.serverUrl, reason: 'only-primary' };
  if (!p && s) return { serverUrl: s.serverUrl, reason: 'only-secondary' };

  const pLoad = loadRatioOf(p);
  const sLoad = loadRatioOf(s);

  // Primary has headroom — keep users local to it (avoids hub relay hops).
  if (pLoad < threshold) {
    return { serverUrl: p.serverUrl, reason: 'primary-has-headroom' };
  }

  // Primary is busy — overflow to secondary only if it is genuinely less loaded.
  if (sLoad < pLoad) {
    return { serverUrl: s.serverUrl, reason: 'overflow-to-secondary' };
  }

  // Both busy and secondary is no better — stay on primary.
  return { serverUrl: p.serverUrl, reason: 'both-busy-keep-primary' };
}

module.exports = {
  pickSubscriber,
  DEFAULT_OVERFLOW_THRESHOLD,
};
