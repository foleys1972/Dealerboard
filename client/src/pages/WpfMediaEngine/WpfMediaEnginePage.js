import React from 'react';

// A headless mediasoup-client media engine page designed to be hosted in WPF WebView2.
// It listens for WebView2 messages and starts/stops mediasoup audio for a given callId.
export default function WpfMediaEnginePage() {
  const stateRef = React.useRef({
    serverUrl: '',
    token: '',
    device: null,
    sendTransport: null,
    recvTransport: null,
    producer: null,
    videoProducer: null,
    consumers: new Map(),
    videoConsumers: new Map(),
    audioContext: null,
    pollTimer: null,
    statsTimer: null,
    serverStatsTimer: null,
    activeCallId: null,
    localStream: null,
    localVideoStream: null,
    muted: false,
    enableVideo: false,
    localAnalyser: null,
    localLevelTimer: null,
  });

  const logToHost = React.useCallback((level, message, data) => {
    try {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ type: 'log', level, message, data });
      }
    } catch {}
    try {
      // also log in devtools
      // eslint-disable-next-line no-console
      console[level] ? console[level](message, data || '') : console.log(message, data || '');
    } catch {}
  }, []);

  const logMediaDiagnostics = React.useCallback(async (tag) => {
    try {
      const diag = { tag };

      try {
        if (navigator?.permissions?.query) {
          const micPerm = await navigator.permissions.query({ name: 'microphone' });
          diag.microphonePermission = micPerm?.state;
        }
      } catch (e) {
        diag.microphonePermissionError = e?.message || String(e);
      }

      try {
        if (navigator?.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          diag.devices = devices.map(d => ({
            kind: d.kind,
            deviceId: d.deviceId,
            groupId: d.groupId,
            label: d.label,
          }));
        }
      } catch (e) {
        diag.enumerateDevicesError = e?.message || String(e);
      }

      logToHost('info', 'Media diagnostics', diag);
    } catch {}
  }, [logToHost]);

  const ensureLocalVideo = React.useCallback(async () => {
    const s = stateRef.current;
    if (s.localVideoStream) return s.localVideoStream;

    await logMediaDiagnostics('before-getUserMedia-video');

    try {
      // Request camera. enumerateDevices() will be more reliable after this succeeds.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      let trackSettings = null;
      try { trackSettings = track?.getSettings?.(); } catch {}
      logToHost('info', 'getUserMedia video ok', { hasTrack: !!track, trackEnabled: track?.enabled, settings: trackSettings });

      s.localVideoStream = stream;
      await logMediaDiagnostics('after-getUserMedia-video');
      return stream;
    } catch (e) {
      logToHost('error', 'getUserMedia video failed', {
        name: e?.name,
        message: e?.message || String(e),
        stack: e?.stack,
      });
      await logMediaDiagnostics('after-getUserMedia-video-failed');
      throw e;
    }
  }, [logMediaDiagnostics, logToHost]);

  const ensureLocalLevelMeter = React.useCallback(async () => {
    const s = stateRef.current;
    if (s.localLevelTimer) return;

    s.localLevelTimer = setInterval(() => {
      try {
        const current = stateRef.current;
        const a = current.localAnalyser;
        if (!a) return;

        const buf = new Uint8Array(a.fftSize);
        a.getByteTimeDomainData(buf);

        let sumSq = 0;
        let maxAbs = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128;
          const abs = Math.abs(v);
          if (abs > maxAbs) maxAbs = abs;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length);

        logToHost('info', 'Local mic level', {
          rms: Number.isFinite(rms) ? Number(rms.toFixed(4)) : null,
          peak: Number.isFinite(maxAbs) ? Number(maxAbs.toFixed(4)) : null,
        });
      } catch {}
    }, 2000);
  }, [logToHost]);

  React.useEffect(() => {
    const onError = (event) => {
      try {
        const err = event?.error;
        logToHost('error', 'window.onerror', {
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          error: err?.message,
          name: err?.name,
          stack: err?.stack,
        });
      } catch {}
    };

    const onUnhandled = (event) => {
      try {
        const reason = event?.reason;
        logToHost('error', 'unhandledrejection', {
          error: reason?.message || String(reason),
          name: reason?.name,
          stack: reason?.stack,
        });
      } catch {}
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      try { window.removeEventListener('error', onError); } catch {}
      try { window.removeEventListener('unhandledrejection', onUnhandled); } catch {}
    };
  }, [logToHost]);

  React.useEffect(() => {
    try {
      const init = window.__tpMediaEngineInit;
      if (init && typeof init === 'object') {
        stateRef.current.serverUrl = init.serverUrl || '';
        stateRef.current.token = init.token || '';
        logToHost('info', 'Initialized (preload)', { serverUrl: stateRef.current.serverUrl, hasToken: !!stateRef.current.token });
      }
    } catch {}
    logMediaDiagnostics('after-preload-init').catch(() => {});
  }, [logMediaDiagnostics, logToHost]);

  const fetchJson = React.useCallback(async (path, body) => {
    const s = stateRef.current;
    const url = `${s.serverUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (s.token) headers.Authorization = `Bearer ${s.token}`;

    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} ${text}`);
    }

    return await res.json();
  }, []);

  const ensureDevice = React.useCallback(async (callId) => {
    const s = stateRef.current;
    if (s.device) return s.device;

    const { Device } = await import('mediasoup-client');

    // IMPORTANT: use call-scoped router capabilities.
    // The global /api/webrtc/rtp-capabilities can return empty capabilities if the
    // default router isn't initialized; that leads to no producer/consumer => no audio.
    const capsPath = callId
      ? `/api/webrtc/groups/${encodeURIComponent(callId)}/rtp-capabilities`
      : '/api/webrtc/rtp-capabilities';
    const routerCaps = await fetchJson(capsPath);

    const device = new Device();
    await device.load({ routerRtpCapabilities: routerCaps });

    s.device = device;
    logToHost('info', 'mediasoup-client Device loaded');
    return device;
  }, [fetchJson, logToHost]);

  const ensureAudioStatsPolling = React.useCallback(() => {
    const s = stateRef.current;
    if (s.statsTimer) return;

    s.statsTimer = setInterval(() => {
      const current = stateRef.current;
      if (!current.activeCallId) return;

      for (const [producerId, entry] of current.consumers.entries()) {
        const a = entry?.analyser;
        if (!a) continue;

        try {
          const buf = new Uint8Array(a.fftSize);
          a.getByteTimeDomainData(buf);

          let sumSq = 0;
          let maxAbs = 0;
          for (let i = 0; i < buf.length; i += 1) {
            const v = (buf[i] - 128) / 128;
            const abs = Math.abs(v);
            if (abs > maxAbs) maxAbs = abs;
            sumSq += v * v;
          }

          const rms = Math.sqrt(sumSq / buf.length);
          logToHost('info', 'Remote audio level', {
            producerId,
            rms: Number.isFinite(rms) ? Number(rms.toFixed(4)) : null,
            peak: Number.isFinite(maxAbs) ? Number(maxAbs.toFixed(4)) : null,
            trackEnabled: entry?.consumer?.track?.enabled,
            trackMuted: entry?.consumer?.track?.muted,
            trackReadyState: entry?.consumer?.track?.readyState,
          });
        } catch (e) {
          logToHost('warn', 'Remote audio level read failed', { producerId, error: e?.message || String(e) });
        }
      }
    }, 2000);
  }, [logToHost]);

  const summarizeMediasoupStat = (stat) => {
    if (!stat || typeof stat !== 'object') return null;
    // mediasoup producer/consumer stats shapes vary; pick common fields.
    const pick = (k) => stat[k];
    return {
      type: pick('type'),
      timestamp: pick('timestamp'),
      kind: pick('kind'),
      mimeType: pick('mimeType'),
      packetsReceived: pick('packetsReceived'),
      packetsSent: pick('packetsSent'),
      bytesReceived: pick('bytesReceived'),
      bytesSent: pick('bytesSent'),
      packetsLost: pick('packetsLost'),
      jitter: pick('jitter'),
      bitrate: pick('bitrate'),
      score: pick('score'),
    };
  };

  const pollServerStats = React.useCallback(async () => {
    const s = stateRef.current;
    if (!s.activeCallId) return;

    try {
      if (s.producer?.id) {
        const stats = await fetchJson(`/api/webrtc/producer/${encodeURIComponent(s.producer.id)}/stats`);
        const first = Array.isArray(stats) ? stats[0] : stats;
        logToHost('info', 'Server producer stats', { producerId: s.producer.id, stat: summarizeMediasoupStat(first) });
      }
    } catch (e) {
      logToHost('warn', 'Server producer stats failed', { error: e?.message || String(e) });
    }

    for (const entry of s.consumers.values()) {
      const cid = entry?.consumer?.id;
      if (!cid) continue;
      try {
        const stats = await fetchJson(`/api/webrtc/consumer/${encodeURIComponent(cid)}/stats`);
        const first = Array.isArray(stats) ? stats[0] : stats;
        logToHost('info', 'Server consumer stats', {
          consumerId: cid,
          producerId: entry?.consumer?.producerId,
          stat: summarizeMediasoupStat(first)
        });
      } catch (e) {
        logToHost('warn', 'Server consumer stats failed', { consumerId: cid, error: e?.message || String(e) });
      }
    }
  }, [fetchJson, logToHost]);

  const createSendTransport = React.useCallback(async (callId) => {
    const s = stateRef.current;
    const device = await ensureDevice(callId);

    const params = await fetchJson('/api/webrtc/transport', {
      direction: 'send',
      groupId: callId,
      callId,
    });

    logToHost('info', 'Server transport params (send)', {
      callId,
      transportId: params?.id,
      iceParameters: params?.iceParameters,
      iceCandidates: params?.iceCandidates,
      dtlsParameters: params?.dtlsParameters,
    });

    const transport = device.createSendTransport(params);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await fetchJson('/api/webrtc/transport/connect', {
          transportId: params.id,
          dtlsParameters,
        });
        callback();
      } catch (e) {
        errback(e);
      }
    });

    transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const produced = await fetchJson('/api/webrtc/produce', {
          transportId: params.id,
          kind,
          rtpParameters,
          groupId: callId,
          appData: { ...(appData || {}), callId },
        });
        callback({ id: produced.id });
      } catch (e) {
        errback(e);
      }
    });

    transport.on('connectionstatechange', (st) => {
      logToHost('info', `sendTransport connectionstatechange=${st}`);
    });

    s.sendTransport = transport;
    return transport;
  }, [ensureDevice, fetchJson, logToHost]);

  const createRecvTransport = React.useCallback(async (callId) => {
    const s = stateRef.current;
    const device = await ensureDevice(callId);

    const params = await fetchJson('/api/webrtc/transport', {
      direction: 'recv',
      groupId: callId,
      callId,
    });

    logToHost('info', 'Server transport params (recv)', {
      callId,
      transportId: params?.id,
      iceParameters: params?.iceParameters,
      iceCandidates: params?.iceCandidates,
      dtlsParameters: params?.dtlsParameters,
    });

    const transport = device.createRecvTransport(params);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await fetchJson('/api/webrtc/transport/connect', {
          transportId: params.id,
          dtlsParameters,
        });
        callback();
      } catch (e) {
        errback(e);
      }
    });

    transport.on('connectionstatechange', (st) => {
      logToHost('info', `recvTransport connectionstatechange=${st}`);
    });

    s.recvTransport = transport;
    return transport;
  }, [ensureDevice, fetchJson, logToHost]);

  const ensureLocalAudio = React.useCallback(async () => {
    const s = stateRef.current;
    if (s.localStream) return s.localStream;

    await logMediaDiagnostics('before-getUserMedia');

    try {
      const pickConcreteMicDeviceId = async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter(d => d.kind === 'audioinput');
          const preferred = audioInputs.find(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
          return preferred?.deviceId || null;
        } catch {
          return null;
        }
      };

      const getStream = async (deviceIdExact) => {
        const audio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        if (deviceIdExact) {
          audio.deviceId = { exact: deviceIdExact };
        }

        return await navigator.mediaDevices.getUserMedia({ audio, video: false });
      };

      let stream = await getStream(null);

      const track = stream?.getAudioTracks?.()[0];
      let trackSettings = null;
      try { trackSettings = track?.getSettings?.(); } catch {}

      logToHost('info', 'getUserMedia ok', {
        hasStream: !!stream,
        hasTrack: !!track,
        trackEnabled: track?.enabled,
        trackMuted: track?.muted,
        trackReadyState: track?.readyState,
        settings: trackSettings,
      });

      try {
        if (track) {
          track.onmute = () => logToHost('warn', 'Local mic track onmute', { readyState: track.readyState, enabled: track.enabled });
          track.onunmute = () => logToHost('info', 'Local mic track onunmute', { readyState: track.readyState, enabled: track.enabled });
          track.onended = () => logToHost('warn', 'Local mic track ended', { readyState: track.readyState, enabled: track.enabled });
        }
      } catch {}

      // If the track starts muted, retry with a concrete deviceId.
      // In some environments, 'default' can map to a non-capturing endpoint.
      try {
        if (track && track.muted) {
          const concreteId = await pickConcreteMicDeviceId();
          if (concreteId) {
            logToHost('warn', 'Local mic track is muted; retrying getUserMedia with concrete deviceId', { deviceId: concreteId });
            try {
              stream.getTracks().forEach(t => t.stop());
            } catch {}

            stream = await getStream(concreteId);
          }
        }
      } catch (e) {
        logToHost('warn', 'Retry getUserMedia failed', { error: e?.message || String(e) });
      }

      // Setup local mic level metering via WebAudio.
      try {
        if (!s.audioContext) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) s.audioContext = new Ctx();
        }

        if (s.audioContext) {
          try {
            if (s.audioContext.state !== 'running') {
              await s.audioContext.resume();
            }
          } catch {}

          const t = stream?.getAudioTracks?.()[0];
          if (t) {
            const localStreamForMeter = new MediaStream([t]);
            const source = s.audioContext.createMediaStreamSource(localStreamForMeter);
            const analyser = s.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            s.localAnalyser = analyser;
            await ensureLocalLevelMeter();
          }
        }
      } catch (e) {
        logToHost('warn', 'Local mic metering setup failed', { error: e?.message || String(e) });
      }

      s.localStream = stream;
      await logMediaDiagnostics('after-getUserMedia');
      return stream;
    } catch (e) {
      logToHost('error', 'getUserMedia failed', {
        name: e?.name,
        message: e?.message || String(e),
        stack: e?.stack,
      });
      await logMediaDiagnostics('after-getUserMedia-failed');
      throw e;
    }
  }, []);

  const applyMute = React.useCallback(async (muted) => {
    const s = stateRef.current;
    s.muted = !!muted;

    try {
      if (s.localStream) {
        const track = s.localStream.getAudioTracks()[0];
        if (track) {
          track.enabled = !s.muted;
        }
      }
    } catch {}

    try {
      if (s.producer) {
        if (s.muted) {
          await s.producer.pause();
        } else {
          await s.producer.resume();
        }
      }
    } catch (e) {
      logToHost('warn', 'Failed to apply producer mute', { error: e.message, muted: s.muted });
    }

    logToHost('info', 'Mute applied', { muted: s.muted });
  }, [logToHost]);

  const consumeRemoteProducers = React.useCallback(async (callId) => {
    const s = stateRef.current;
    const recvTransport = s.recvTransport;
    const device = s.device;
    if (!recvTransport || !device) return;

    const producersResp = await fetchJson(`/api/webrtc/groups/${encodeURIComponent(callId)}/producers`);
    const producers = (producersResp && producersResp.producers) ? producersResp.producers : [];

    for (const p of producers) {
      if (!p || !p.kind || !p.id) continue;
      if (p.kind === 'audio') {
        if (s.producer && p.id === s.producer.id) continue;
        if (s.consumers.has(p.id)) continue;
      }
      if (p.kind === 'video') {
        if (s.videoProducer && p.id === s.videoProducer.id) continue;
        if (s.videoConsumers.has(p.id)) continue;
      }
      if (p.kind !== 'audio' && p.kind !== 'video') continue;

      const consumeParams = await fetchJson('/api/webrtc/consume', {
        transportId: recvTransport.id,
        producerId: p.id,
        rtpCapabilities: device.rtpCapabilities,
        groupId: callId,
      });

      const consumer = await s.recvTransport.consume({
        id: consumeParams.id,
        producerId: consumeParams.producerId,
        kind: consumeParams.kind,
        rtpParameters: consumeParams.rtpParameters,
      });

      if (p.kind === 'video') {
        const stream = new MediaStream([consumer.track]);
        const existing = document.getElementById(`tp-remote-video-${p.id}`);
        if (existing) {
          try { existing.srcObject = stream; } catch {}
        }

        const videoEl = existing || document.createElement('video');
        videoEl.id = `tp-remote-video-${p.id}`;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        // Autoplay policies in Chromium/WebView2 can block video playback unless muted.
        // Remote video audio (if any) is handled separately via the audio consumer.
        videoEl.muted = true;
        try { videoEl.volume = 0; } catch {}
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'contain';
        videoEl.style.background = '#000';
        try { videoEl.srcObject = stream; } catch {}

        try {
          videoEl.onplaying = () => logToHost('info', 'videoEl onplaying', { producerId: p.id });
          videoEl.onpause = () => logToHost('info', 'videoEl onpause', { producerId: p.id });
          videoEl.onerror = () => logToHost('warn', 'videoEl onerror', { producerId: p.id, code: videoEl.error?.code, message: videoEl.error?.message });
          videoEl.onloadedmetadata = () => logToHost('info', 'videoEl loadedmetadata', { producerId: p.id, w: videoEl.videoWidth, h: videoEl.videoHeight });
        } catch {}

        if (!existing) {
          const wrap = document.getElementById('tp-video-wrap');
          if (wrap) wrap.appendChild(videoEl);
          else document.body.appendChild(videoEl);
        }

        s.videoConsumers.set(p.id, { consumer, videoEl });
        logToHost('info', 'Consumed remote video producer', { producerId: p.id, consumerId: consumer.id });

        try {
          const playPromise = videoEl.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise;
          }
          logToHost('info', 'videoEl.play() ok', {
            producerId: p.id,
            paused: videoEl.paused,
            muted: videoEl.muted,
            readyState: videoEl.readyState,
          });
        } catch (err) {
          logToHost('warn', 'videoEl.play() failed', {
            producerId: p.id,
            error: err?.message || String(err),
            paused: videoEl.paused,
            muted: videoEl.muted,
            readyState: videoEl.readyState,
          });
        }

        try { await consumer.resume(); } catch {}
        continue;
      }

      const stream = new MediaStream([consumer.track]);

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.controls = false;
      audioEl.muted = false;
      audioEl.srcObject = stream;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      try {
        audioEl.onplaying = () => logToHost('info', 'audioEl onplaying', { producerId: p.id });
        audioEl.onpause = () => logToHost('info', 'audioEl onpause', { producerId: p.id });
        audioEl.onerror = () => logToHost('warn', 'audioEl onerror', { producerId: p.id, code: audioEl.error?.code, message: audioEl.error?.message });
      } catch {}

      // WebAudio fallback: connect remote stream to an AudioContext destination.
      // This can work even when HTMLMediaElement playback is suppressed in embedded/hidden WebView2.
      let webAudio = null;
      let analyser = null;
      try {
        if (!s.audioContext) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) {
            s.audioContext = new Ctx();
          }
        }

        if (s.audioContext) {
          try {
            if (s.audioContext.state !== 'running') {
              await s.audioContext.resume();
            }
          } catch (e) {
            logToHost('warn', 'AudioContext resume failed', { error: e?.message || String(e), state: s.audioContext.state });
          }

          const source = s.audioContext.createMediaStreamSource(stream);
          source.connect(s.audioContext.destination);

          try {
            analyser = s.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            // Connect for measurement only; analyser does not need to connect to destination.
            source.connect(analyser);
          } catch {}

          webAudio = { source };
          logToHost('info', 'WebAudio connected', { producerId: p.id, ctxState: s.audioContext.state });
        }
      } catch (e) {
        logToHost('warn', 'WebAudio setup failed', { error: e?.message || String(e) });
      }

      try {
        const playPromise = audioEl.play();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }
        logToHost('info', 'audioEl.play() ok', {
          producerId: p.id,
          paused: audioEl.paused,
          muted: audioEl.muted,
          volume: audioEl.volume,
          readyState: audioEl.readyState,
        });
      } catch (err) {
        logToHost('warn', 'audioEl.play() failed', {
          producerId: p.id,
          error: err?.message || String(err),
          paused: audioEl.paused,
          muted: audioEl.muted,
          volume: audioEl.volume,
          readyState: audioEl.readyState,
        });
      }

      s.consumers.set(p.id, { consumer, audioEl, webAudio, analyser });
      logToHost('info', 'Consumed remote producer', { producerId: p.id, consumerId: consumer.id });

      try {
        await consumer.resume();
      } catch {}
    }
  }, [fetchJson, logToHost]);

  const startCall = React.useCallback(async (callId, enableVideo) => {
    const s = stateRef.current;
    if (!callId) return;

    s.enableVideo = !!enableVideo;

    logToHost('info', 'startCall begin', { callId, enableVideo: !!enableVideo, hasToken: !!s.token, serverUrl: s.serverUrl });

    if (s.activeCallId && s.activeCallId !== callId) {
      await stopAll();
    }

    s.activeCallId = callId;

    await ensureDevice(callId);
    await createSendTransport(callId);
    await createRecvTransport(callId);

    const stream = await ensureLocalAudio();
    const track = stream.getAudioTracks()[0];

    logToHost('info', 'Local audio acquired', { hasTrack: !!track, trackEnabled: track ? track.enabled : undefined });

    if (track && s.sendTransport) {
      s.producer = await s.sendTransport.produce({
        track,
        codecOptions: { opusStereo: 1, opusFec: 1, opusDtx: 1 },
        appData: { callId },
      });
      logToHost('info', 'Audio producer created', { producerId: s.producer.id });
    }

    if (enableVideo && s.sendTransport) {
      try {
        const vstream = await ensureLocalVideo();
        const vtrack = vstream.getVideoTracks()[0];
        if (vtrack) {
          s.videoProducer = await s.sendTransport.produce({
            track: vtrack,
            appData: { callId, media: 'video' },
          });
          logToHost('info', 'Video producer created', { producerId: s.videoProducer.id });
        }
      } catch (e) {
        logToHost('warn', 'Video producer setup failed', { error: e?.message || String(e) });
      }
    }

    // If host had us muted already, apply it after producer creation.
    if (s.muted) {
      await applyMute(true);
    }

    if (s.pollTimer) {
      clearInterval(s.pollTimer);
      s.pollTimer = null;
    }

    // Poll for new producers periodically.
    s.pollTimer = setInterval(() => {
      const current = stateRef.current;
      if (current.activeCallId !== callId) return;
      if (!current.recvTransport || !current.device) return;
      consumeRemoteProducers(callId).catch((e) => logToHost('warn', 'consume poll failed', { error: e.message }));
    }, 500);

    // Immediate consume.
    await consumeRemoteProducers(callId);

    ensureAudioStatsPolling();

    try {
      const s = stateRef.current;
      if (!s.serverStatsTimer) {
        s.serverStatsTimer = setInterval(() => {
          pollServerStats().catch(() => {});
        }, 2000);
      }
    } catch {}

    try {
      await pollServerStats();
    } catch {}

    logToHost('info', 'Call started', { callId, enableVideo: !!enableVideo });
  }, [consumeRemoteProducers, createRecvTransport, createSendTransport, ensureAudioStatsPolling, ensureDevice, ensureLocalAudio, ensureLocalVideo, logToHost, pollServerStats]);

  const stopAll = React.useCallback(async () => {
    const s = stateRef.current;

    if (s.pollTimer) {
      clearInterval(s.pollTimer);
      s.pollTimer = null;
    }

    if (s.statsTimer) {
      clearInterval(s.statsTimer);
      s.statsTimer = null;
    }

    if (s.serverStatsTimer) {
      clearInterval(s.serverStatsTimer);
      s.serverStatsTimer = null;
    }

    if (s.localLevelTimer) {
      clearInterval(s.localLevelTimer);
      s.localLevelTimer = null;
    }

    s.localAnalyser = null;

    try {
      if (s.producer) {
        s.producer.close();
        s.producer = null;
      }
    } catch {}

    try {
      if (s.videoProducer) {
        s.videoProducer.close();
        s.videoProducer = null;
      }
    } catch {}

    for (const entry of s.consumers.values()) {
      try { entry.consumer.close(); } catch {}
      try { entry.webAudio?.source?.disconnect(); } catch {}
      try { entry.analyser?.disconnect(); } catch {}
      try { entry.audioEl.remove(); } catch {}
    }
    s.consumers.clear();

    for (const entry of s.videoConsumers.values()) {
      try { entry.consumer.close(); } catch {}
      try { entry.videoEl?.remove?.(); } catch {}
    }
    s.videoConsumers.clear();

    try {
      if (s.sendTransport) {
        s.sendTransport.close();
        s.sendTransport = null;
      }
    } catch {}

    try {
      if (s.recvTransport) {
        s.recvTransport.close();
        s.recvTransport = null;
      }
    } catch {}

    try {
      if (s.localStream) {
        s.localStream.getTracks().forEach(t => t.stop());
        s.localStream = null;
      }
    } catch {}

    try {
      if (s.localVideoStream) {
        s.localVideoStream.getTracks().forEach(t => t.stop());
        s.localVideoStream = null;
      }
    } catch {}

    try {
      if (s.audioContext) {
        await s.audioContext.close();
        s.audioContext = null;
      }
    } catch {}

    s.activeCallId = null;
    s.enableVideo = false;

    logToHost('info', 'Stopped all media');
  }, [logToHost]);

  const stopCall = React.useCallback(async (callId) => {
    const s = stateRef.current;
    if (!callId) return;
    if (s.activeCallId && s.activeCallId !== callId) return;
    await stopAll();
  }, [stopAll]);

  React.useEffect(() => {
    const handler = async (evt) => {
      const msg = evt?.data;
      if (!msg || !msg.type) return;

      try {
        if (msg.type === 'init') {
          stateRef.current.serverUrl = msg.serverUrl || '';
          stateRef.current.token = msg.token || '';
          logToHost('info', 'Initialized', { serverUrl: stateRef.current.serverUrl, hasToken: !!stateRef.current.token });
          return;
        }

        if (msg.type === 'startCall') {
          await startCall(msg.callId, !!msg.enableVideo);
          return;
        }

        if (msg.type === 'stopCall') {
          await stopCall(msg.callId);
          return;
        }

        if (msg.type === 'setMuted') {
          await applyMute(!!msg.muted);
          return;
        }

        if (msg.type === 'stopAll') {
          await stopAll();
        }
      } catch (e) {
        logToHost('error', 'MediaEngine error', { error: e?.message, name: e?.name, stack: e?.stack, msg });
      }
    };

    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', handler);
      try {
        window.chrome.webview.postMessage({ type: 'ready' });
      } catch {}
    } else {
      window.addEventListener('message', handler);
    }

    return () => {
      try {
        if (window.chrome && window.chrome.webview) {
          window.chrome.webview.removeEventListener('message', handler);
        } else {
          window.removeEventListener('message', handler);
        }
      } catch {}
    };
  }, [applyMute, logToHost, startCall, stopAll, stopCall]);

  // Keep page blank.
  return (
    <div style={{ background: '#000', color: '#fff', height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div id="tp-video-wrap" style={{ flex: 1, position: 'relative', background: '#000' }}>
        {/* remote video elements will be appended here */}
      </div>
    </div>
  );
}
