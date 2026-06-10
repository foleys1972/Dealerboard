const crypto = require('crypto');

function parseAuthHeader(headerValue) {
  if (!headerValue) return null;

  const params = {};
  const re = /(\w+)=(?:"([^"]+)"|([^,\s]+))/g;
  let match;
  while ((match = re.exec(headerValue)) !== null) {
    params[match[1].toLowerCase()] = match[2] || match[3];
  }
  return params;
}

function parseWwwAuthenticate(message) {
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^WWW-Authenticate:\s*(.+)$/i);
    if (m) return parseAuthHeader(m[1]);
    const p = line.match(/^Proxy-Authenticate:\s*(.+)$/i);
    if (p) return parseAuthHeader(p[1]);
  }
  return null;
}

function unq(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

function md5(parts) {
  return crypto.createHash('md5').update(parts.join(':')).digest('hex');
}

/**
 * Build SIP Authorization / Proxy-Authorization header (RFC 2617 digest).
 */
function buildAuthorizationHeader({
  username,
  password,
  method,
  uri,
  challenge,
  headerName = 'Authorization',
  nc = '00000001',
  cnonce,
}) {
  if (!challenge?.realm || !username || password == null) {
    return null;
  }

  const realm = unq(challenge.realm);
  const nonce = unq(challenge.nonce);
  const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
  if (algorithm !== 'MD5') {
    throw new Error(`Unsupported digest algorithm: ${algorithm}`);
  }

  const ha1 = md5([username, realm, password]);
  const ha2 = md5([method, uri]);
  const qop = challenge.qop ? String(challenge.qop).split(',')[0].trim() : null;
  const cnonceValue = cnonce || crypto.randomBytes(8).toString('hex');

  let response;
  let qopParam = '';
  if (qop) {
    response = md5([ha1, nonce, nc, cnonceValue, qop, ha2]);
    qopParam = `, qop=${qop}, nc=${nc}, cnonce="${cnonceValue}"`;
  } else {
    response = md5([ha1, nonce, ha2]);
  }

  let header = `${headerName}: Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"${qopParam}, algorithm=MD5`;
  if (challenge.opaque) {
    header += `, opaque="${unq(challenge.opaque)}"`;
  }
  return header;
}

module.exports = {
  parseWwwAuthenticate,
  buildAuthorizationHeader,
};
