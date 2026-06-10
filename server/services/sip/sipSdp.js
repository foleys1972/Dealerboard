const CODECS = {
  PCMU: { payloadType: 0, mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 },
  PCMA: { payloadType: 8, mimeType: 'audio/PCMA', clockRate: 8000, channels: 1 },
  TELEPHONE_EVENT: { payloadType: 101, mimeType: 'audio/telephone-event', clockRate: 8000, channels: 1 },
};

function getAnnouncedIp() {
  return process.env.ANNOUNCED_IP || process.env.SIP_MEDIA_IP || null;
}

function normalizeSdp(sdp) {
  if (!sdp) return '';
  return sdp.replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n');
}

/**
 * Parse audio connection + first audio m-line from remote SDP.
 */
function parseAudioMedia(sdp) {
  const text = normalizeSdp(sdp);
  const lines = text.split('\r\n');

  let connectionIp = null;
  let port = null;
  let protocol = 'RTP/AVP';
  const payloadTypes = [];
  const rtpmap = new Map();

  for (const line of lines) {
    if (line.startsWith('c=IN IP4 ')) {
      connectionIp = line.slice('c=IN IP4 '.length).trim();
    }
    const media = line.match(/^m=audio\s+(\d+)\s+(\S+)\s*(.*)$/);
    if (media) {
      port = parseInt(media[1], 10);
      protocol = media[2];
      const pts = media[3].trim().split(/\s+/).filter(Boolean);
      payloadTypes.push(...pts.map((p) => parseInt(p, 10)).filter(Number.isFinite));
      break;
    }
  }

  for (const line of lines) {
    const map = line.match(/^a=rtpmap:(\d+)\s+([^\s/]+)\/(\d+)(?:\/(\d+))?/i);
    if (map) {
      rtpmap.set(parseInt(map[1], 10), {
        payloadType: parseInt(map[1], 10),
        codec: map[2].toUpperCase(),
        clockRate: parseInt(map[3], 10),
        channels: map[4] ? parseInt(map[4], 10) : 1,
      });
    }
  }

  let primaryCodec = 'PCMU';
  let payloadType = 0;
  for (const pt of payloadTypes) {
    const info = rtpmap.get(pt);
    if (!info) continue;
    if (info.codec === 'PCMU' || info.codec === 'G711' || info.codec === 'G711U') {
      primaryCodec = 'PCMU';
      payloadType = pt;
      break;
    }
    if (info.codec === 'PCMA' || info.codec === 'G711A') {
      primaryCodec = 'PCMA';
      payloadType = pt;
      break;
    }
  }

  if (payloadTypes.length && payloadType === 0 && !rtpmap.has(0)) {
    const first = rtpmap.get(payloadTypes[0]);
    if (first) {
      primaryCodec = first.codec;
      payloadType = first.payloadType;
    }
  }

  return {
    ip: connectionIp,
    port,
    protocol,
    payloadTypes,
    rtpmap,
    primaryCodec,
    payloadType,
  };
}

function buildAudioOffer({ ip, port, sessionName = 'TradePulse Line' }) {
  const mediaIp = ip || getAnnouncedIp() || '127.0.0.1';
  const mediaPort = port || 40000;
  const sessionId = Date.now();

  return `v=0\r
o=- ${sessionId} ${sessionId} IN IP4 ${mediaIp}\r
s=${sessionName}\r
c=IN IP4 ${mediaIp}\r
t=0 0\r
m=audio ${mediaPort} RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-15\r
a=sendrecv\r
a=ptime:20\r
`;
}

function buildRtpParametersForCodec(codecName, payloadType, ssrc) {
  const upper = String(codecName || 'PCMU').toUpperCase();
  const base = CODECS[upper] || CODECS.PCMU;
  const pt = Number.isFinite(payloadType) ? payloadType : base.payloadType;

  return {
    codecs: [{
      mimeType: base.mimeType,
      payloadType: pt,
      clockRate: base.clockRate,
      channels: base.channels,
      parameters: {},
    }],
    headerExtensions: [],
    encodings: [{ ssrc: ssrc || (Math.floor(Math.random() * 0xffffffff)) }],
    rtcp: {
      cname: `sip-${Date.now()}`,
    },
  };
}

function negotiateCodec(preferredOrder, remoteParsed) {
  const order = preferredOrder || ['PCMU', 'PCMA'];
  for (const name of order) {
    const base = CODECS[name];
    if (!base) continue;
    if (remoteParsed.payloadTypes.includes(base.payloadType)) {
      return { codec: name, payloadType: base.payloadType };
    }
    for (const pt of remoteParsed.payloadTypes) {
      const info = remoteParsed.rtpmap.get(pt);
      if (info && info.codec === name) {
        return { codec: name, payloadType: pt };
      }
    }
  }
  return {
    codec: remoteParsed.primaryCodec || 'PCMU',
    payloadType: remoteParsed.payloadType || 0,
  };
}

module.exports = {
  CODECS,
  getAnnouncedIp,
  normalizeSdp,
  parseAudioMedia,
  buildAudioOffer,
  buildRtpParametersForCodec,
  negotiateCodec,
};
