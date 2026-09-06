const https = require('https');
const { io } = require('socket.io-client');

function login(username, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username, password });
    const req = https.request('https://localhost:5000/api/auth/login', {
      method: 'POST', rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function api(path, token) {
  return new Promise((resolve) => {
    https.get('https://localhost:5000'+path, { rejectUnauthorized:false, headers:{ Authorization:`Bearer ${token}` } },
      (res)=>{ let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode, body:d})); });
  });
}

(async () => {
  const { token, user } = await login('trader1','trader123');
  console.log('1. LOGIN: user=%s id=%s role=%s', user.username, user.id, user.role);

  // Dealerboard config (exercises auto-seed)
  const cfg = await api(`/api/dealerboard/config/${user.id}`, token);
  let seeded = 'n/a';
  try { const j = JSON.parse(cfg.body); const a = j.assignments||{};
    const groups = Object.keys(a.groups||{}).length, contacts = Object.keys(a.contacts||{}).length;
    seeded = `groups=${groups} contacts=${contacts}`;
  } catch {}
  console.log('2. DEALERBOARD CONFIG: http=%s assignments(%s)', cfg.status, seeded);

  // Socket connect + authenticate over wss
  const socket = io('https://localhost:5000', { transports:['websocket'], reconnection:false, rejectUnauthorized:false, auth:{ token } });
  const events = [];
  let authed = false, lineState = false;
  ['auth-success','auth-error','presence-update','line-sip-state','line-sip-incoming'].forEach(ev =>
    socket.on(ev, (p)=>{ events.push(ev); if(ev==='auth-success') authed=true; if(ev.startsWith('line-sip')) lineState=true; }));

  await new Promise((resolve)=>{
    socket.on('connect', ()=>{
      console.log('3. SOCKET CONNECT: wss id=%s transport=%s', socket.id, socket.io.engine.transport.name);
      socket.emit('authenticate', { userId: user.id, username: user.username, token });
    });
    socket.on('connect_error', e=>{ console.log('3. SOCKET CONNECT_ERROR:', e.message); resolve(); });
    setTimeout(resolve, 4000);
  });
  console.log('4. SOCKET AUTH: auth-success=%s events=[%s]', authed, [...new Set(events)].join(','));
  socket.close();
  process.exit(0);
})().catch(e=>{ console.log('SMOKE ERROR:', e.message); process.exit(1); });
