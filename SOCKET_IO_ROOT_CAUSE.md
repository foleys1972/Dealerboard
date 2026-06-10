# Socket.IO Connection Timeout - Root Cause Analysis

## **CRITICAL FINDING: Library Bug**

The Socket.IO connection timeout issue is **NOT** a configuration problem in our code. It is a **known limitation/bug in SocketIOClient.NET v3.1.1**.

## Root Cause

**SocketIOClient.NET v3.1.1** has a **hardcoded 10-second timeout** in its internal `HttpClient` that **cannot be overridden**:

1. The `ConnectionTimeout` property in `SocketIOOptions` is **IGNORED** by the library
2. The library creates its own internal `HttpClient` with a 10-second timeout
3. There is **no way** to provide a custom `HttpClient` or override this timeout
4. The library throws `TimeoutException` after exactly 10 seconds, regardless of our settings

## Evidence

- Error message: "Socket.IO connection timed out after 10 seconds" (hardcoded in library)
- Our code sets `ConnectionTimeout = TimeSpan.FromSeconds(30)` but it's ignored
- Stack trace shows exception originates from inside SocketIOClient library
- No `HttpClient` property exists in `SocketIOOptions` to override

## Impact

- Connections fail on slower networks
- SSL handshake may take longer than 10 seconds
- Self-signed certificates require additional negotiation time
- Any network latency causes connection failures

## Solutions

### Immediate (Current Implementation)
1. ✅ Catch `TimeoutException` and provide helpful diagnostics
2. ✅ Log detailed error information for troubleshooting
3. ✅ Suggest checking network/SSL/firewall issues

### Long-term Options

1. **Upgrade SocketIOClient Library**
   - Check if newer version (v4.x+) fixes this issue
   - May require breaking changes

2. **Switch to Alternative Library**
   - Consider `SocketIOClient` alternatives
   - Evaluate `Quobject.SocketIoClientDotNet` or other libraries
   - Requires significant refactoring

3. **Fork and Fix Library**
   - Modify library source code to respect `ConnectionTimeout`
   - Not recommended for production

4. **Server-Side Optimization**
   - Optimize server response time
   - Reduce SSL handshake time
   - Pre-warm connections

## Current Workaround

The code now:
- Catches the `TimeoutException` from the library
- Provides detailed diagnostic information
- Logs the issue clearly for troubleshooting
- Suggests possible causes (network, SSL, firewall)

## Testing Recommendations

1. Test on faster network connections
2. Verify SSL certificate is properly configured
3. Check firewall rules allow Socket.IO connections
4. Monitor server logs for connection attempts
5. Consider using HTTP instead of HTTPS for local development

## Library Issue Reference

- **Library**: SocketIOClient.NET v3.1.1
- **Issue**: Hardcoded 10-second HttpClient timeout
- **Status**: Known limitation, not configurable
- **Workaround**: None available in current version


---

## Update 2026-06-10: Transport workarounds verified stale and removed

The polling-only / no-compression workarounds that accumulated around the historical
"Invalid frame header" and "hanging WebSocket upgrade" symptoms were re-tested
empirically against the current stack:

- Server: socket.io ^4.8.1, plain HTTP on :5000 (`HTTPS_ENABLED` unset)
- Web-family client: socket.io-client ^4.7.2 (Node harness: `scripts/ws-transport-test.js`)
- .NET client: SocketIOClient 3.1.1 (harness: `tools/socketio-net-test/`)

Results (all against `http://localhost:5000`):

| Scenario | socket.io-client | SocketIOClient.NET |
|---|---|---|
| polling only | OK | OK |
| websocket direct | OK (22ms) | OK (107ms) |
| polling → websocket upgrade | OK (136ms) | OK (107ms) |
| all of the above with `perMessageDeflate`/`httpCompression` enabled | OK | OK |
| 100KB payload over compressed websocket | OK (no frame errors) | n/a |

Conclusion: the original failure does not reproduce on current library versions.
Defaults are now WebSocket-first with compression enabled. Emergency kill switches
(restore the old workaround behavior without code changes):

- Server: `SOCKETIO_COMPRESSION=false` (disables perMessageDeflate/httpCompression)
- Web client: `REACT_APP_SOCKET_FORCE_POLLING=true` (polling-only transport)
- .NET client: `TRADEPULSE_SOCKET_AUTOUPGRADE=false` (stay on polling, no upgrade)

Remaining known constraint (unrelated to the above): browser mixed-content policy.
The CRA dev UI runs HTTPS (`client/.env: HTTPS=true`) while the backend is plain HTTP,
so browsers block BOTH polling and websocket to non-localhost backends (e.g.
`https://192.168.1.41:3000` page → `http://192.168.1.41:5000`). Polling never fixed
this — the proper fix is enabling TLS on the backend in dev (`HTTPS_ENABLED=true`
with the mkcert certs in the repo root), which also requires removing the
HTTPS→HTTP downgrade heuristics in `clientRoutingService.normalizeDevApiUrl`,
`useSocket.normalizeSocketUrl`, and `ServerUrlHelper.Normalize`.

---

## Update 2026-06-10 (part 2): TLS end-to-end in dev, downgrade heuristics removed

### The actual root cause of the historical TLS failures

`SocketIOOptions` in SocketIOClient.NET 3.1.1 has **no certificate hooks at all** —
no `RemoteCertificateValidationCallback`, no `HttpMessageHandler` property. The
reflection-based cert bypass in `SocketService.cs` silently did nothing, so every
HTTPS attempt failed certificate validation, which is why the stack retreated to
plain HTTP + polling and accumulated https→http downgrade heuristics in three
places (useSocket.js, clientRoutingService.js, utils/api.js) plus ServerUrlHelper.cs.

The working injection points (verified empirically) are on the **client object**:

- `SocketIO.HttpClient` — a `DefaultHttpClient` whose private `_handler`
  (HttpClientHandler) accepts `ServerCertificateCustomValidationCallback`
- `SocketIO.ClientWebSocketProvider` — returns a `DefaultClientWebSocket` whose
  private `_ws` (ClientWebSocket) accepts `Options.RemoteCertificateValidationCallback`

This is implemented in `SocketService.ConfigureTransportSecurity()`. Set
`TRADEPULSE_STRICT_TLS=true` to keep full certificate validation (recommended in
production with a real certificate).

### New dev topology

- Backend: `HTTPS_ENABLED=true` in `.env`, serving `dev-cert.pem`/`dev-key.pem`
  (mkcert; SANs: localhost, 127.0.0.1, ::1, 192.168.1.41; valid to 2028).
- CRA dev UI: already HTTPS with the **same cert** (`client/.env` SSL_CRT_FILE).
- Web client: `REACT_APP_API_URL=https://localhost:5000`; wss end-to-end.
- .NET clients: default `https://localhost:5000` (appsettings, ConfigurationService,
  login fallbacks); `ServerUrlHelper` no longer downgrades https→http and defaults
  bare hosts to https.
- Internal publisher↔subscriber loop: auto-derives `https://127.0.0.1:5000` via
  `serverRole.applyLoopbackPublisherUrl` and already trusts the loopback cert.

Verified end-to-end against `https://localhost:5000`: Node socket.io-client and
SocketIOClient.NET both connect on polling, direct websocket (~30/106 ms), and
polling→websocket upgrade, with compression enabled.

### Trust note for new dev machines

The cert was issued by a mkcert CA from the "Media-Centre" machine and that CA is
not necessarily in your trust store. Browsers/OS: either run `mkcert -install` and
regenerate the certs locally, import the issuing `rootCA.pem`, or accept the
browser warning once (covers both :3000 and :5000 since they share the cert).
Node diagnostics: pass `rejectUnauthorized: false` per connection (the harness
`scripts/ws-transport-test.js` does this automatically for https targets);
`NODE_TLS_REJECT_UNAUTHORIZED=0` is NOT honored by engine.io's transports.
