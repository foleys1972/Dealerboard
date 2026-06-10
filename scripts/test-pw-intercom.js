/* Temporary E2E test: private wire modes (internal MRD/HOOT, external) + intercom voice/video signaling. */
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const SUBSCRIBER_ID = 'subscriber_1780839244742_c595e975';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function login(username, password) {
  const { status, json } = await api(null, 'POST', '/api/auth/login', { username, password });
  if (status !== 200 || !json?.token) throw new Error(`login failed for ${username}: ${status} ${JSON.stringify(json)}`);
  return json.token;
}

// ---------- Private wire tests ----------

async function createInternalPair(token, mode, label) {
  const { status, json } = await api(token, 'POST', '/api/dealerboard/private-wires', {
    lineLabel: label,
    mode,
    internalWire: true,
    homeSubscriberId: SUBSCRIBER_ID,
    secondarySubscriberId: SUBSCRIBER_ID,
  });
  if (status !== 200 && status !== 201) throw new Error(`create ${mode} pair failed: ${status} ${JSON.stringify(json)}`);
  return json; // { internalPairId, ids: [idA, idB] }
}

async function testInternalMrd(token) {
  console.log('\n=== Internal MRD wire ===');
  const pair = await createInternalPair(token, 'MRD', 'TEST-MRD');
  const [a, b] = pair.ids;
  try {
    // 1. Caller presses MRD line: should connect immediately (open wire), not ring.
    const call = await api(token, 'POST', `/api/dealerboard/private-wires/${a}/call`, {});
    record('MRD call connects immediately', call.status === 200 && call.json?.success === true && call.json?.ringing !== true,
      `${call.status} ${call.json?.message} mode=${call.json?.lineMode}`);
    const sipCallId = call.json?.sipCallId;

    // 2. Manual ring signal to the far end.
    const sig = await api(token, 'POST', `/api/dealerboard/private-wires/${a}/signal`, {});
    record('MRD manual ring signal', sig.status === 200 && sig.json?.success === true,
      `${sig.status} ${sig.json?.message}`);

    // 3. Far end answers the manual ring.
    const ans = await api(token, 'POST', `/api/dealerboard/private-wires/${b}/answer`, { sipCallId: sig.json?.sipCallId || sipCallId });
    record('MRD far-end answer', ans.status === 200 && ans.json?.success === true,
      `${ans.status} ${ans.json?.message}`);

    // 4. End from both sides.
    const endA = await api(token, 'POST', `/api/dealerboard/private-wires/${a}/end`, { sipCallId: ans.json?.sipCallId || sipCallId });
    record('MRD end (A)', endA.status === 200 && endA.json?.success === true, `${endA.status} ${JSON.stringify(endA.json)}`);
    const endB = await api(token, 'POST', `/api/dealerboard/private-wires/${b}/end`, {});
    record('MRD end (B)', endB.status === 200 || endB.status === 404, `${endB.status} ${JSON.stringify(endB.json)}`);
  } finally {
    for (const id of pair.ids) await api(token, 'DELETE', `/api/dealerboard/private-wires/${id}`);
  }
}

async function testInternalHoot(token) {
  console.log('\n=== Internal HOOT wire ===');
  const pair = await createInternalPair(token, 'HOOT', 'TEST-HOOT');
  const [a, b] = pair.ids;
  try {
    // 1. Hoot connects both ends instantly, no ringing ever.
    const call = await api(token, 'POST', `/api/dealerboard/private-wires/${a}/call`, {});
    record('HOOT call instant-connect', call.status === 200 && call.json?.success === true
      && call.json?.lineMode === 'HOOT' && call.json?.ringing !== true,
      `${call.status} ${call.json?.message} mode=${call.json?.lineMode}`);
    const sipCallId = call.json?.sipCallId;

    // 2. Signal must be rejected or meaningless on a hoot... internal /signal is generic;
    //    instead verify far end can join the live hoot (B presses the line).
    const joinB = await api(token, 'POST', `/api/dealerboard/private-wires/${b}/call`, {});
    record('HOOT far-end join', joinB.status === 200 && joinB.json?.success === true,
      `${joinB.status} ${joinB.json?.message}`);

    // 3. End both ends.
    const endA = await api(token, 'POST', `/api/dealerboard/private-wires/${a}/end`, { sipCallId });
    record('HOOT end (A)', endA.status === 200 && endA.json?.success === true, `${endA.status} ${JSON.stringify(endA.json)}`);
    const endB = await api(token, 'POST', `/api/dealerboard/private-wires/${b}/end`, {});
    record('HOOT end (B)', endB.status === 200 || endB.status === 404, `${endB.status} ${JSON.stringify(endB.json)}`);
  } finally {
    for (const id of pair.ids) await api(token, 'DELETE', `/api/dealerboard/private-wires/${id}`);
  }
}

async function testExternalWires(token) {
  console.log('\n=== External wires (SIP gateway simulated) ===');

  // External ARD
  let created = await api(token, 'POST', '/api/dealerboard/private-wires', {
    lineLabel: 'TEST-EXT-ARD', mode: 'ARD', uriAddress: 'sip:ext-ard-test@sbc.example.com',
  });
  record('External ARD create', created.status === 200 || created.status === 201, `${created.status} ${JSON.stringify(created.json)}`);
  const ardId = created.json?.id;

  // External MRD
  created = await api(token, 'POST', '/api/dealerboard/private-wires', {
    lineLabel: 'TEST-EXT-MRD', mode: 'MRD', uriAddress: 'sip:ext-mrd-test@sbc.example.com',
  });
  record('External MRD create', created.status === 200 || created.status === 201, `${created.status} ${JSON.stringify(created.json)}`);
  const mrdId = created.json?.id;

  // External HOOT (external community)
  created = await api(token, 'POST', '/api/dealerboard/private-wires', {
    lineLabel: 'TEST-EXT-HOOT', mode: 'HOOT', uriAddress: 'sip:ext-hoot-test@sbc.example.com',
    isExternalCommunity: true, externalCommunityId: 'test-community', externalCommunityName: 'Test Community',
  });
  record('External HOOT create', created.status === 200 || created.status === 201, `${created.status} ${JSON.stringify(created.json)}`);
  const hootId = created.json?.id;

  const cleanup = [ardId, mrdId, hootId].filter(Boolean);
  try {
    if (ardId) {
      const call = await api(token, 'POST', `/api/dealerboard/private-wires/${ardId}/call`, {});
      record('External ARD call (simulated, no SBC)', call.status === 200 && call.json?.success === true,
        `${call.status} ${call.json?.message} sipCallId=${call.json?.sipCallId}`);
      const sig = await api(token, 'POST', `/api/dealerboard/private-wires/${ardId}/signal`, {});
      record('External ARD signal rejected (auto-ring)', sig.status === 400,
        `${sig.status} ${sig.json?.error || sig.json?.message}`);
      const end = await api(token, 'POST', `/api/dealerboard/private-wires/${ardId}/end`, { sipCallId: call.json?.sipCallId });
      record('External ARD end', end.status === 200 && end.json?.success === true, `${end.status} ${JSON.stringify(end.json)}`);
    }

    if (mrdId) {
      const call = await api(token, 'POST', `/api/dealerboard/private-wires/${mrdId}/call`, {});
      record('External MRD call (simulated, no SBC)', call.status === 200 && call.json?.success === true,
        `${call.status} ${call.json?.message}`);
      const sig = await api(token, 'POST', `/api/dealerboard/private-wires/${mrdId}/signal`, {});
      record('External MRD signal', sig.status === 200 || sig.status === 503,
        `${sig.status} ${sig.json?.message || sig.json?.error}`);
      const end = await api(token, 'POST', `/api/dealerboard/private-wires/${mrdId}/end`, {});
      record('External MRD end', end.status === 200 && end.json?.success === true, `${end.status} ${JSON.stringify(end.json)}`);
    }

    if (hootId) {
      const call = await api(token, 'POST', `/api/dealerboard/private-wires/${hootId}/call`, { hoot: true });
      record('External HOOT call (simulated, no SBC)', call.status === 200 && call.json?.success === true,
        `${call.status} ${call.json?.message}`);
      const end = await api(token, 'POST', `/api/dealerboard/private-wires/${hootId}/end`, {});
      record('External HOOT end', end.status === 200 && end.json?.success === true, `${end.status} ${JSON.stringify(end.json)}`);
    }
  } finally {
    for (const id of cleanup) await api(token, 'DELETE', `/api/dealerboard/private-wires/${id}`);
  }
}

// ---------- Intercom (instant connect) tests ----------

function connectSocket(token, userId, username) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ['polling', 'websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error(`socket auth timeout for ${username}`)), 8000);
    socket.on('connect', () => socket.emit('authenticate', { userId, username, token }));
    socket.on('auth-success', () => { clearTimeout(timer); resolve(socket); });
    socket.on('auth-error', (e) => { clearTimeout(timer); reject(new Error(`auth-error for ${username}: ${e?.message}`)); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(new Error(`connect_error for ${username}: ${e?.message}`)); });
  });
}

function waitFor(socket, event, ms = 10000, predicate = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout waiting for "${event}"`)); }, ms);
    const handler = (data) => {
      if (predicate && !predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

async function testIntercom(adminToken, traderToken, { video }) {
  const label = video ? 'video' : 'voice';
  console.log(`\n=== Intercom ${label} call ===`);

  const caller = await connectSocket(adminToken, 'admin', 'admin');
  const callee = await connectSocket(traderToken, 'trader1', 'trader1');

  try {
    const incomingP = waitFor(callee, 'instant-incoming');
    const connectedP = waitFor(caller, 'instant-connected');

    caller.emit('instant-connect', { targetUserId: 'trader1', enableVideo: video === true });

    const incoming = await incomingP;
    record(`Intercom ${label}: callee receives instant-incoming`, !!incoming?.callId,
      `callId=${incoming?.callId} video=${incoming?.config?.enableVideo ?? incoming?.enableVideo}`);
    const connected = await connectedP;
    record(`Intercom ${label}: caller receives instant-connected`, !!connected?.callId, `callId=${connected?.callId}`);

    const callId = incoming.callId;

    const activeP = waitFor(caller, 'instant-call-active');
    const setupP = waitFor(callee, 'webrtc-setup-required');
    const acceptedP = waitFor(callee, 'instant-accepted');
    callee.emit('instant-accept', { callId });

    const accepted = await acceptedP;
    record(`Intercom ${label}: callee accept acknowledged`, accepted?.callId === callId, `callId=${accepted?.callId}`);
    const active = await activeP;
    const videoFlag = active?.config?.enableVideo === true || active?.enableVideo === true;
    record(`Intercom ${label}: call active for both parties`,
      Array.isArray(active?.participants) && active.participants.length === 2 && (video ? videoFlag : true),
      `participants=${JSON.stringify(active?.participants)} enableVideo=${videoFlag}`);
    const setup = await setupP;
    record(`Intercom ${label}: WebRTC media setup triggered`, setup?.callId === callId, `callId=${setup?.callId}`);

    if (!video) {
      // Mid-call video escalation on a voice call.
      const ackP = waitFor(caller, 'instant-enable-video-ack');
      const reActiveP = waitFor(callee, 'instant-call-active', 10000, (d) => d?.config?.enableVideo === true);
      caller.emit('instant-enable-video', { callId, enableVideo: true });
      const ack = await ackP;
      const reActive = await reActiveP;
      record('Intercom voice: mid-call video escalation', ack?.enableVideo === true && reActive?.config?.enableVideo === true,
        `ack=${JSON.stringify(ack)} active.enableVideo=${reActive?.config?.enableVideo}`);
    }

    const endedP = waitFor(callee, 'instant-disconnected').catch(() => waitFor(callee, 'instant-ended'));
    caller.emit('instant-disconnect', { callId });
    const ended = await endedP;
    record(`Intercom ${label}: call teardown propagates`, !!ended, `reason=${ended?.reason}`);
  } finally {
    caller.close();
    callee.close();
  }
}

(async () => {
  try {
    const adminToken = await login('admin', 'admin');
    const traderToken = await login('trader1', 'trader123');
    console.log('Logged in admin + trader1');

    await testInternalMrd(adminToken);
    await testInternalHoot(adminToken);
    await testExternalWires(adminToken);
    await testIntercom(adminToken, traderToken, { video: false });
    await testIntercom(adminToken, traderToken, { video: true });

    const fails = results.filter((r) => !r.ok);
    console.log(`\n==== SUMMARY: ${results.length - fails.length}/${results.length} passed ====`);
    if (fails.length) {
      fails.forEach((f) => console.log(`FAIL: ${f.name} — ${f.detail}`));
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error('TEST RUN ERROR:', e?.message || e);
    process.exit(2);
  }
})();
