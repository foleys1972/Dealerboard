import { useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export const useBroadcastAudio = () => {
  const deviceRef = useRef(null);
  const initializedRef = useRef(false);
  const sessionsRef = useRef(new Map());
  const apiBase = process.env.REACT_APP_API_URL || '';
  const { user: authUser } = useAuthStore();
  const currentUserId = authUser?.id || authUser?.userId;
  const levelSubscribersRef = useRef(new Map()); // groupId -> Set<callback(level: number)>

  const getAuthHeader = () => {
    try {
      const stored = localStorage.getItem('auth-storage');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  const ensureDevice = useCallback(async () => {
    if (deviceRef.current) {
      return deviceRef.current;
    }

    try {
      const { Device } = await import('mediasoup-client');
      const response = await fetch(`${apiBase}/api/webrtc/rtp-capabilities`, {
        headers: {
          ...getAuthHeader(),
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch RTP capabilities');
      }
      const rtpCapabilities = await response.json();
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      initializedRef.current = true;
      return device;
    } catch (error) {
      console.error('Failed to initialize broadcast audio device:', error);
      toast.error('Media engine unavailable');
      throw error;
    }
  }, []);

  const createTransport = useCallback(
    async (device, direction, groupId) => {
      const response = await fetch(`${apiBase}/api/webrtc/transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ direction, groupId }),
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to create WebRTC transport');
      }
      const params = await response.json();
      const transport =
        direction === 'send'
          ? device.createSendTransport(params)
          : device.createRecvTransport(params);

      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await fetch(`${apiBase}/api/webrtc/transport/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({
              transportId: params.id,
              dtlsParameters,
            }),
            credentials: 'include',
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      if (direction === 'send') {
        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const produceResponse = await fetch(`${apiBase}/api/webrtc/produce`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({
                transportId: params.id,
                kind,
                rtpParameters,
                groupId,
                appData,
              }),
              credentials: 'include',
            });
            const { id } = await produceResponse.json();
            callback({ id });
          } catch (error) {
            errback(error);
          }
        });
      }

      return { transport, transportId: params.id };
    },
    []
  );

  const pollProducers = useCallback(async (groupId) => {
    const response = await fetch(`${apiBase}/api/webrtc/groups/${groupId}/producers`, {
      headers: { ...getAuthHeader() },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch producers');
    }
    const data = await response.json();
    return data.producers || [];
  }, []);

  const monitorBroadcast = useCallback(
    async ({ groupId, speakerDeviceId }) => {
      try {
        const device = await ensureDevice();
        let session = sessionsRef.current.get(groupId);
        if (session?.monitoring) {
          return session;
        }

        const { transport: recvTransport, transportId } = await createTransport(
          device,
          'recv',
          groupId
        );

        const newSession = {
          groupId,
          speakerDeviceId,
          recvTransport,
          recvTransportId: transportId,
          consumers: new Map(),
          pollTimer: null,
          monitoring: true,
          isTransmitting: false,
          levelTimer: null,
        };

        sessionsRef.current.set(groupId, newSession);

        const emitLevel = (groupId, level) => {
          const subs = levelSubscribersRef.current.get(groupId);
          if (subs && subs.size) {
            subs.forEach(cb => {
              try { cb(level); } catch {}
            });
          }
        };

        const updateConsumers = async () => {
          try {
            const producers = await pollProducers(groupId);
            const activeIds = new Set(producers.map((producer) => producer.id));

            // Add new producers
            for (const producer of producers) {
              // Skip consuming our own producer to avoid sidetone/loopback
              if (producer.appData?.userId && currentUserId && producer.appData.userId === currentUserId) {
                continue;
              }
              if (!newSession.consumers.has(producer.id)) {
                try {
                  const consumeResponse = await fetch(`${apiBase}/api/webrtc/consume`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                    body: JSON.stringify({
                      transportId: newSession.recvTransportId,
                      producerId: producer.id,
                      groupId,
                      rtpCapabilities: device.rtpCapabilities,
                    }),
                    credentials: 'include',
                  });
                  const consumeParams = await consumeResponse.json();
                  const consumer = await recvTransport.consume({
                    id: consumeParams.id,
                    producerId: consumeParams.producerId,
                    kind: consumeParams.kind,
                    rtpParameters: consumeParams.rtpParameters,
                  });
                  const remoteStream = new MediaStream([consumer.track]);
                  const audio = new Audio();
                  audio.autoplay = true;
                  audio.srcObject = remoteStream;
                  if (speakerDeviceId && audio.setSinkId) {
                    audio.setSinkId(speakerDeviceId).catch(() => {});
                  }
                  audio.play().catch(() => {});

                  // Create analyser for VAD level
                  let analyser = null;
                  let audioCtx = null;
                  let sourceNode = null;
                  let rafId = null;
                  try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    sourceNode = audioCtx.createMediaStreamSource(remoteStream);
                    analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    sourceNode.connect(analyser);
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    const loop = () => {
                      if (!analyser) return;
                      analyser.getByteTimeDomainData(data);
                      // Compute simple RMS
                      let sum = 0;
                      for (let i = 0; i < data.length; i++) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                      }
                      const rms = Math.sqrt(sum / data.length);
                      // Aggregate across consumers later; for now emit per-session max
                      // Store level on this consumer entry
                      const entry = newSession.consumers.get(producer.id);
                      if (entry) entry.level = rms;
                      // Compute max across all consumers for this group
                      let maxLevel = 0;
                      newSession.consumers.forEach(c => {
                        if (typeof c.level === 'number' && c.level > maxLevel) maxLevel = c.level;
                      });
                      emitLevel(groupId, maxLevel);
                      rafId = requestAnimationFrame(loop);
                    };
                    rafId = requestAnimationFrame(loop);
                  } catch {}

                  const cleanupAnalyser = () => {
                    if (rafId) cancelAnimationFrame(rafId);
                    try { sourceNode && sourceNode.disconnect(); } catch {}
                    try { audioCtx && audioCtx.close(); } catch {}
                  };

                  newSession.consumers.set(producer.id, { consumer, audio });
                  // Attach analyser cleanup
                  const entry = newSession.consumers.get(producer.id);
                  if (entry) entry.cleanupAnalyser = cleanupAnalyser;
                } catch (error) {
                  console.error('Failed to consume producer', producer.id, error);
                }
              }
            }

            // Remove stale consumers
            for (const [producerId, { consumer, audio }] of newSession.consumers.entries()) {
              if (!activeIds.has(producerId)) {
                consumer.close();
                if (audio) {
                  audio.pause();
                  audio.srcObject = null;
                }
                try { newSession.consumers.get(producerId)?.cleanupAnalyser?.(); } catch {}
                newSession.consumers.delete(producerId);
              }
            }
          } catch (error) {
            console.error('Failed to update broadcast consumers:', error);
          }
        };

        await updateConsumers();
        newSession.pollTimer = setInterval(updateConsumers, 3000);
        toast.success('Monitoring broadcast');
        return newSession;
      } catch (error) {
        console.error('Failed to monitor broadcast:', error);
        toast.error('Unable to monitor broadcast');
        throw error;
      }
    },
    [ensureDevice, createTransport, pollProducers, currentUserId, apiBase]
  );

  const stopMonitoring = useCallback((groupId) => {
    const session = sessionsRef.current.get(groupId);
    if (!session) return;
    if (session.pollTimer) {
      clearInterval(session.pollTimer);
    }
    for (const { consumer, audio, cleanupAnalyser } of session.consumers.values()) {
      consumer.close();
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      try { cleanupAnalyser && cleanupAnalyser(); } catch {}
    }
    session.recvTransport.close();
    sessionsRef.current.delete(groupId);
  }, []);

  const startPushToTalk = useCallback(
    async ({ groupId, microphoneId }) => {
      try {
        const device = await ensureDevice();
        let session = sessionsRef.current.get(groupId);
        if (!session) {
          session = await monitorBroadcast({ groupId });
        }
        if (session.producer) {
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
        });
        const track = stream.getAudioTracks()[0];

        const { transport: sendTransport, transportId } = await createTransport(
          device,
          'send',
          groupId
        );

        session.sendTransport = sendTransport;
        session.sendStream = stream;

        const producer = await sendTransport.produce({
          track,
          codecOptions: { opusStereo: 1, opusFec: 1 },
          appData: { groupId, userId: currentUserId },
        });

        session.producer = producer;
        session.producerId = producer.id;
        session.isTransmitting = true;

        producer.on('transportclose', () => {
          session.producer = null;
        });

        toast.success('Push-to-talk active');
      } catch (error) {
        console.error('Failed to start push-to-talk:', error);
        toast.error('Push-to-talk failed');
        throw error;
      }
    },
    [ensureDevice, monitorBroadcast, createTransport, currentUserId]
  );

  const stopPushToTalk = useCallback(async (groupId) => {
    const session = sessionsRef.current.get(groupId);
    if (!session || !session.producer) {
      return;
    }

    try {
      await fetch(`${apiBase}/api/webrtc/producer/${session.producer.id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
    } catch (error) {
      console.warn('Failed to close producer via API:', error);
    }

    session.producer.close();
    session.producer = null;
    session.isTransmitting = false;
    if (session.sendTransport) {
      session.sendTransport.close();
      session.sendTransport = null;
    }
    if (session.sendStream) {
      session.sendStream.getTracks().forEach((track) => track.stop());
      session.sendStream = null;
    }
    toast.success('Push-to-talk released');
  }, []);

  const updateSpeakerDevice = useCallback((groupId, speakerDeviceId) => {
    const session = sessionsRef.current.get(groupId);
    if (!session) return;
    session.speakerDeviceId = speakerDeviceId;
    session.consumers.forEach(({ audio }) => {
      if (audio && audio.setSinkId && speakerDeviceId) {
        audio.setSinkId(speakerDeviceId).catch(() => {});
      }
    });
  }, []);

  const subscribeLevels = useCallback((groupId, callback) => {
    let set = levelSubscribersRef.current.get(groupId);
    if (!set) {
      set = new Set();
      levelSubscribersRef.current.set(groupId, set);
    }
    set.add(callback);
    return () => {
      const s = levelSubscribersRef.current.get(groupId);
      if (!s) return;
      s.delete(callback);
      if (s.size === 0) levelSubscribersRef.current.delete(groupId);
    };
  }, []);

  const stopAll = useCallback(() => {
    for (const groupId of sessionsRef.current.keys()) {
      stopMonitoring(groupId);
    }
  }, [stopMonitoring]);

  return {
    monitorBroadcast,
    stopMonitoring,
    startPushToTalk,
    stopPushToTalk,
    updateSpeakerDevice,
    subscribeLevels,
    stopAll,
  };
};

