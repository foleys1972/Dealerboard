const {
  getSipRouteById,
  listRouteTrunks,
} = require('../../db/systemSettings/sipRoutes');
const {
  serializeSbcProfile,
  parseSbcProfile,
} = require('./sbcProfile');

function trunkRowToEndpoint(trunk, role) {
  return {
    role,
    host: trunk.host,
    port: trunk.port || 5060,
    username: trunk.username || '',
    password: trunk.password || '',
    domain: trunk.domain || '',
    label: trunk.label || trunk.name || role,
  };
}

async function loadRouteWithTrunks(routeId) {
  if (!routeId) return null;
  const route = await getSipRouteById(String(routeId));
  if (!route || route.is_active === false) return null;
  const trunks = await listRouteTrunks(route.id);
  const activeTrunks = trunks.filter((t) => t.is_active !== false);
  if (!activeTrunks.length) return null;
  return { route, trunks: activeTrunks };
}

async function resolveSbcProfileFromRouteId(routeId) {
  const loaded = await loadRouteWithTrunks(routeId);
  if (!loaded) return null;

  const [primaryTrunk, secondaryTrunk] = loaded.trunks;
  const profile = serializeSbcProfile({
    primary: trunkRowToEndpoint(primaryTrunk, 'primary'),
    secondary: secondaryTrunk ? trunkRowToEndpoint(secondaryTrunk, 'secondary') : null,
    failbackToPrimary: loaded.route.failback_to_primary !== false,
  });
  return profile;
}

async function resolveSbcDetailsForDdiRow(row) {
  const routeId = row?.sip_route_id || row?.sipRouteId;
  if (routeId) {
    const fromRoute = await resolveSbcProfileFromRouteId(routeId);
    if (fromRoute) return fromRoute;
  }
  return row?.sbc_details || {};
}

async function resolveSbcDetailsForLine({ sipRouteId, sbcDetails }) {
  if (sipRouteId) {
    const fromRoute = await resolveSbcProfileFromRouteId(sipRouteId);
    if (fromRoute) return fromRoute;
  }
  const parsed = parseSbcProfile(sbcDetails || {});
  return parsed.endpoints?.length ? sbcDetails : (sbcDetails || {});
}

async function getGatewayUriForRoute(routeId) {
  const loaded = await loadRouteWithTrunks(routeId);
  if (!loaded?.trunks?.[0]) return null;
  const trunk = loaded.trunks[0];
  const domain = trunk.domain || process.env.SIP_DOMAIN || 'localhost';
  return `sip:${trunk.host}${trunk.port && trunk.port !== 5060 ? `:${trunk.port}` : ''}@${domain}`;
}

async function resolveOutgoingGatewayUri({ row, sipRouteId: overrideRouteId }) {
  const routeId = overrideRouteId || row?.sip_route_id || row?.sipRouteId || null;
  if (routeId) {
    const fromRoute = await getGatewayUriForRoute(routeId);
    if (fromRoute) return fromRoute;
  }

  const sbcDetails = await resolveSbcDetailsForDdiRow(row);
  const { getPrimaryEndpoint } = require('./sbcProfile');
  const primarySbc = getPrimaryEndpoint(sbcDetails) || sbcDetails;
  const connectionDetails = row?.connection_details || row?.connectionDetails || {};
  return connectionDetails.gatewayUri || sbcDetails.gatewayUri || `sip:${primarySbc.host || 'localhost'}`;
}

async function resolveDomainForRoute(routeId) {
  const loaded = await loadRouteWithTrunks(routeId);
  if (!loaded?.trunks?.[0]) return process.env.SIP_DOMAIN || 'localhost';
  const trunk = loaded.trunks[0];
  return trunk.domain || process.env.SIP_DOMAIN || 'localhost';
}

async function resolveBlindTransferReferUri({ sourceDdi, digits, applyDialPlanFn }) {
  const { normalizeDigits } = require('../dialPlanService');
  let plannedDigits = normalizeDigits(digits);
  if (!plannedDigits) return null;

  let dialPlanRouteId = null;
  const countryCode = sourceDdi?.country_code
    ? String(sourceDdi.country_code).trim().toUpperCase()
    : null;
  if (countryCode && applyDialPlanFn) {
    const planned = await applyDialPlanFn({
      countryCode,
      direction: 'outgoing',
      number: plannedDigits,
    });
    plannedDigits = planned?.number || plannedDigits;
    dialPlanRouteId = planned?.sipRouteId || null;
  }

  const routeId = dialPlanRouteId || sourceDdi?.sip_route_id || sourceDdi?.sipRouteId || null;
  let domain = process.env.SIP_DOMAIN || 'localhost';
  if (routeId) {
    domain = await resolveDomainForRoute(routeId);
  } else if (sourceDdi) {
    const sbcDetails = await resolveSbcDetailsForDdiRow(sourceDdi);
    const { getPrimaryEndpoint } = require('./sbcProfile');
    const primary = getPrimaryEndpoint(sbcDetails) || {};
    domain = primary.domain || domain;
  }

  return `sip:${plannedDigits}@${domain}`;
}

async function resolveDdiLineReferUri(ddiLine) {
  const connection = ddiLine?.connection_details || {};
  if (connection.uri) return connection.uri;
  if (connection.gatewayUri) return connection.gatewayUri;

  const domain = process.env.SIP_DOMAIN || 'localhost';
  if (ddiLine?.line_number) {
    return `sip:${ddiLine.line_number}@${domain}`;
  }

  return resolveOutgoingGatewayUri({ row: ddiLine });
}

module.exports = {
  trunkRowToEndpoint,
  resolveSbcProfileFromRouteId,
  resolveSbcDetailsForDdiRow,
  resolveSbcDetailsForLine,
  getGatewayUriForRoute,
  resolveOutgoingGatewayUri,
  resolveDdiLineReferUri,
  resolveDomainForRoute,
  resolveBlindTransferReferUri,
  loadRouteWithTrunks,
};
