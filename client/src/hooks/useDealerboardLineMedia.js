import { useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

/**
 * Full-duplex MediaSoup audio for dealerboard private wire / DDI line calls.
 * Uses the same WebRTC transport flow as broadcast audio (groupId = mediaGroupId).
 */
export const useDealerboardLineMedia = () => {
  const deviceRef = useRef(null);
  const sessionsRef = useRef(new Map());
  const apiBase = process.env.REACT_APP_API_URL || '';
  const { user: authUser } = useAuthStore();
  const currentUserId = authUser?.id || authUser?.userId;

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

  const ensureDevice = useCallback(async (groupId) => {
    if (deviceRef.current) {
      return deviceRef.current;
    }

    const { Device } = await import('mediasoup-client');
    const capsUrl = groupId
      ? `${apiBase}/api/webrtc/groups/${encodeURIComponent(groupId)}/rtp-capabilities`
      : `${apiBase}/api/webrtc/rtp-capabilities`;
    const response = await fetch(capsUrl, {
      headers: { ...getAuthHeader() },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch RTP capabilities');
    }
    const rtpCapabilities = await response.json();
    const device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;
    return device;
  }, [apiBase]);

  const createTransport = useCallback(async (device, direction, groupId) => {
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
    const transport = direction === 'send'
      ? device.createSendTransport(params)
      : device.createRecvTransport(params);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await fetch(`${apiBase}/api/webrtc/transport/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ transportId: params.id, dtlsParameters }),
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
  }, [apiBase]);

  const pollProducers = useCallback(async (groupId) => {
    const response = await fetch(`${apiBase}/api/webrtc/groups/${encodeURIComponent(groupId)}/producers`, {
      headers: { ...getAuthHeader() },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch producers');
    }
    const data = await response.json();
    return data.producers || [];
  }, [apiBase]);

  const stopSession = useCallback((groupId) => {
    const session = sessionsRef.current.get(groupId);
    if (!session) return;

    if (session.pollTimer) clearInterval(session.pollTimer);
    if (session.producer) {
      try { session.producer.close(); } catch {}
    }
    if (session.sendStream) {
      session.sendStream.getTracks().forEach((t) => t.stop());
    }
    if (session.sendTransport) {
      try { session.sendTransport.close(); } catch {}
    }
    for (const { consumer, audio } of session.consumers.values()) {
      try { consumer.close(); } catch {}
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
    }
    if (session.recvTransport) {
      try { session.recvTransport.close(); } catch {}
    }
    sessionsRef.current.delete(groupId);
  }, []);

  const startLineListen = useCallback(async (mediaGroupId) => {
    if (!mediaGroupId) return null;

    try {
      stopSession(mediaGroupId);
      const device = await ensureDevice(mediaGroupId);
      const session = {
        groupId: mediaGroupId,
        consumers: new Map(),
        pollTimer: null,
      };
      sessionsRef.current.set(mediaGroupId, session);

      const { transport: recvTransport, transportId } = await createTransport(device, 'recv', mediaGroupId);
      session.recvTransport = recvTransport;
      session.recvTransportId = transportId;

      const updateConsumers = async () => {
        try {
          const producers = await pollProducers(mediaGroupId);
          const activeIds = new Set(producers.map((p) => p.id));

          for (const producer of producers) {
            if (producer.appData?.userId && currentUserId && producer.appData.userId === currentUserId) {
              continue;
            }
            if (!session.consumers.has(producer.id)) {
              const consumeResponse = await fetch(`${apiBase}/api/webrtc/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                  transportId: session.recvTransportId,
                  producerId: producer.id,
                  groupId: mediaGroupId,
                  rtpCapabilities: device.rtpCapabilities,
                }),
                credentials: 'include',
              });
              if (!consumeResponse.ok) continue;
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
              audio.play().catch(() => {});
              session.consumers.set(producer.id, { consumer, audio });
            }
          }

          for (const [producerId, { consumer, audio }] of session.consumers.entries()) {
            if (!activeIds.has(producerId)) {
              consumer.close();
              if (audio) {
                audio.pause();
                audio.srcObject = null;
              }
              session.consumers.delete(producerId);
            }
          }
        } catch (error) {
          console.error('Line listen consumer update failed', error);
        }
      };

      await updateConsumers();
      session.pollTimer = setInterval(updateConsumers, 2000);
      return session;
    } catch (error) {
      console.error('Failed to start dealerboard line listen', error);
      stopSession(mediaGroupId);
      throw error;
    }
  }, [apiBase, createTransport, currentUserId, ensureDevice, pollProducers, stopSession]);

  const startLineCall = useCallback(async (mediaGroupId) => {
    if (!mediaGroupId) return null;

    try {
      stopSession(mediaGroupId);
      const device = await ensureDevice(mediaGroupId);
      const session = {
        groupId: mediaGroupId,
        consumers: new Map(),
        pollTimer: null,
      };
      sessionsRef.current.set(mediaGroupId, session);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const { transport: sendTransport } = await createTransport(device, 'send', mediaGroupId);
      session.sendTransport = sendTransport;
      session.sendStream = stream;
      session.producer = await sendTransport.produce({
        track,
        codecOptions: { opusStereo: 1, opusFec: 1 },
        appData: { groupId: mediaGroupId, userId: currentUserId, source: 'dealerboard-line' },
      });

      const { transport: recvTransport, transportId } = await createTransport(device, 'recv', mediaGroupId);
      session.recvTransport = recvTransport;
      session.recvTransportId = transportId;

      const updateConsumers = async () => {
        try {
          const producers = await pollProducers(mediaGroupId);
          const activeIds = new Set(producers.map((p) => p.id));

          for (const producer of producers) {
            if (producer.appData?.userId && currentUserId && producer.appData.userId === currentUserId) {
              continue;
            }
            if (!session.consumers.has(producer.id)) {
              const consumeResponse = await fetch(`${apiBase}/api/webrtc/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                  transportId: session.recvTransportId,
                  producerId: producer.id,
                  groupId: mediaGroupId,
                  rtpCapabilities: device.rtpCapabilities,
                }),
                credentials: 'include',
              });
              if (!consumeResponse.ok) continue;
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
              audio.play().catch(() => {});
              session.consumers.set(producer.id, { consumer, audio });
            }
          }

          for (const [producerId, { consumer, audio }] of session.consumers.entries()) {
            if (!activeIds.has(producerId)) {
              consumer.close();
              if (audio) {
                audio.pause();
                audio.srcObject = null;
              }
              session.consumers.delete(producerId);
            }
          }
        } catch (error) {
          console.error('Line call consumer update failed', error);
        }
      };

      await updateConsumers();
      session.pollTimer = setInterval(updateConsumers, 2000);
      return session;
    } catch (error) {
      console.error('Failed to start dealerboard line media', error);
      toast.error('Could not open line audio — check microphone permissions');
      stopSession(mediaGroupId);
      throw error;
    }
  }, [apiBase, createTransport, currentUserId, ensureDevice, pollProducers, stopSession]);

  const stopLineCall = useCallback((mediaGroupId) => {
    if (!mediaGroupId) return;
    stopSession(mediaGroupId);
  }, [stopSession]);

  return { startLineListen, startLineCall, stopLineCall };
};
