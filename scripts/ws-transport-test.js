// Diagnostic: test Socket.IO transports against the dev server.
// Usage: node scripts/ws-transport-test.js [baseUrl]
const { io } = require('socket.io-client');

const base = process.argv[2] || 'http://localhost:5000';

function attempt(name, opts) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Dev diagnostic: accept the self-signed dev cert for https targets.
    const tls = base.startsWith('https') ? { rejectUnauthorized: false } : {};
    const socket = io(base, { path: '/socket.io', timeout: 8000, reconnection: false, ...tls, ...opts });
    const finish = (result) => {
      socket.close();
      resolve({ name, result, ms: Date.now() - started });
    };
    socket.on('connect', () => {
      const transport = socket.io.engine.transport.name;
      if (opts._waitUpgrade) {
        socket.io.engine.on('upgrade', (t) => finish(`connected, upgraded to ${t.name}`));
        setTimeout(() => finish(`connected on ${socket.io.engine.transport.name}, NO upgrade after 5s`), 5000);
      } else {
        finish(`connected on ${transport}`);
      }
    });
    socket.on('connect_error', (err) => finish(`connect_error: ${err.message}`));
    setTimeout(() => finish('TIMEOUT after 10s'), 10000);
  });
}

(async () => {
  console.log(`Testing against ${base}\n`);
  const tests = [
    ['polling only', { transports: ['polling'], upgrade: false }],
    ['websocket only', { transports: ['websocket'] }],
    ['polling + upgrade', { transports: ['polling', 'websocket'], upgrade: true, _waitUpgrade: true }],
  ];
  for (const [name, opts] of tests) {
    const r = await attempt(name, opts);
    console.log(`${r.name.padEnd(20)} -> ${r.result} (${r.ms}ms)`);
  }
  process.exit(0);
})();
