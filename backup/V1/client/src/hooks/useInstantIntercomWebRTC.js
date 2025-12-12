import { useEffect, useCallback, useRef, useState } from 'react';
import { useInstantIntercom } from './useInstantIntercom';
import { useWebRTC } from './useWebRTC';
import { useSocket } from './useSocket';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

/**
 * useInstantIntercomWebRTC
 * Integrates instant intercom signaling with MediaSoup WebRTC audio
 * Provides seamless instant audio connections
 */
export const useInstantIntercomWebRTC = () => {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  
  // Instant intercom hook (signaling)
  const instantIntercom = useInstantIntercom();
  const {
    isInCall,
    activeCall,
    participantCount,
    instantConnect: originalInstantConnect,
    disconnectCall: originalDisconnectCall
  } = instantIntercom;

  // WebRTC hook (audio streaming)
  const webrtc = useWebRTC();
  const {
    device,
    transport,
    producer,
    consumers,
    getUserMedia,
    createTransport,
    startProducing,
    stopProducing,
    initializeMediaSoup
  } = webrtc;

  // Refs
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const outputVolumeRef = useRef(1.0);
  const localStreamRef = useRef(null);
  const pttLatchedRef = useRef(false);
  const [isLatched, setIsLatched] = useState(false);
  const duckedVolumesRef = useRef(new Map());

  // Recording/mixing
  const mixContextRef = useRef(null);
  const mixDestRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingStartRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  // Helpers: convert MediaRecorder blob (webm/opus) → WAV (PCM16 mono)
  const decodeToAudioBuffer = useCallback(async (blob) => {
    try {
      const ac = mixContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuf = await blob.arrayBuffer();
      return await ac.decodeAudioData(arrayBuf);
    } catch (e) {
      console.warn('decodeAudioData failed:', e);
      return null;
    }
  }, []);

  const encodePCM16Wav = useCallback((audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Mixdown to mono
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channelData[ch] = audioBuffer.getChannelData(ch);
    }
    const mono = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) sum += channelData[ch][i] || 0;
      mono[i] = sum / numChannels;
    }

    // Convert float32 [-1,1] to PCM16
    const bytesPerSample = 2;
    const wavBuffer = new ArrayBuffer(44 + mono.length * bytesPerSample);
    const view = new DataView(wavBuffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + mono.length * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate (mono)
    view.setUint16(32, bytesPerSample, true); // block align
    view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, mono.length * bytesPerSample, true);

    let offset = 44;
    for (let i = 0; i < mono.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, mono[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }, []);

  const getAuthHeader = useCallback(() => {
    try {
      const stored = localStorage.getItem('auth-storage');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  }, []);

  const ensureMixGraph = useCallback(() => {
    if (!mixContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      mixContextRef.current = new AC();
    }
    if (!mixDestRef.current && mixContextRef.current) {
      mixDestRef.current = mixContextRef.current.createMediaStreamDestination();
    }
  }, []);

  const connectTrackToMix = useCallback((track) => {
    try {
      ensureMixGraph();
      if (!mixContextRef.current || !mixDestRef.current || !track) return;
      const src = mixContextRef.current.createMediaStreamSource(new MediaStream([track]));
      src.connect(mixDestRef.current);
      // remember to disconnect when track ends
      track.addEventListener('ended', () => {
        try { src.disconnect(); } catch {}
      });
    } catch (e) {
      console.warn('Mix connect failed:', e);
    }
  }, [ensureMixGraph]);

  const startRecording = useCallback(() => {
    try {
      ensureMixGraph();
      if (!mixDestRef.current) return;
      const stream = mixDestRef.current.stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: mime || 'audio/webm' });
          recordedChunksRef.current = [];

          // Try to convert to WAV for upload
          let uploadBlob = blob;
          let uploadName = `call_${activeCall?.callId || Date.now()}.webm`;
          const decoded = await decodeToAudioBuffer(blob);
          if (decoded) {
            const wavBlob = encodePCM16Wav(decoded);
            if (wavBlob && wavBlob.size > 0) {
              uploadBlob = wavBlob;
              uploadName = `call_${activeCall?.callId || Date.now()}.wav`;
            }
          }

          const apiBase = process.env.REACT_APP_API_URL || '';
          const fd = new FormData();
          fd.append('file', uploadBlob, uploadName);
          const participants = Array.from(new Set([
            ...(Array.isArray(activeCall?.participants) ? activeCall.participants : []),
          ]));
          const metadata = {
            callId: activeCall?.callId || null,
            type: activeCall?.type || (activeCall?.isGroupCall ? 'group' : 'direct'),
            groupId: activeCall?.isGroupCall ? (activeCall?.groupId || activeCall?.callId || null) : null,
            participants,
            startTime: recordingStartRef.current ? new Date(recordingStartRef.current).toISOString() : new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: recordingStartRef.current ? (Date.now() - recordingStartRef.current) : 0,
            userId: user?.id || user?.userId || null,
            callForward: !!(activeCall?.callForward),
          };
          fd.append('metadata', JSON.stringify(metadata));
          await fetch(`${apiBase}/api/recordings/upload`, {
            method: 'POST',
            headers: { ...getAuthHeader() },
            body: fd,
            credentials: 'include'
          }).catch((e) => console.warn('Upload recording failed:', e));
        } catch (e) {
          console.warn('Finalize recording failed:', e);
        }
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      console.log('🎙️ Recording started');
    } catch (e) {
      console.warn('Start recording failed:', e);
    }
  }, [activeCall, ensureMixGraph, getAuthHeader, user]);

  const stopRecording = useCallback(() => {
    try {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        mr.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;
    setIsRecording(false);
    recordingStartRef.current = null;
  }, []);

  // Initialize MediaSoup on mount
  useEffect(() => {
    initializeMediaSoup().catch(err => {
      console.warn('MediaSoup initialization failed, using fallback:', err);
    });
  }, [initializeMediaSoup]);

  // Establish WebRTC connection when call connects
  useEffect(() => {
    if (!isInCall || !activeCall || !device) return;

    const setupWebRTC = async () => {
      try {
        console.log('🎤 Setting up WebRTC audio for call:', activeCall.callId);

        // Get microphone access
        const stream = await getUserMedia();
        localStreamRef.current = stream;
        // connect local track to mix
        const audioTrackLocal = stream.getAudioTracks()[0];
        if (audioTrackLocal) {
          connectTrackToMix(audioTrackLocal);
        }

        // Create send transport (for sending audio)
        const sendTransport = await createSendTransport(activeCall.callId);
        sendTransportRef.current = sendTransport;

        // Start producing audio
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await produceAudio(sendTransport, audioTrack, activeCall.callId);
        }

        // Create receive transport (for receiving audio)
        const recvTransport = await createReceiveTransport(activeCall.callId);
        recvTransportRef.current = recvTransport;

        console.log('✅ WebRTC setup complete for call:', activeCall.callId);

        // start recording after graph is ready
        startRecording();

      } catch (error) {
        console.error('Failed to setup WebRTC:', error);
        toast.error('Audio setup failed - check microphone permissions');
      }
    };

    setupWebRTC();

    // Cleanup when call ends
    return () => {
      cleanupWebRTC();
    };
  }, [isInCall, activeCall, device]);

  // Auto-latch PTT for originator when in push-to-talk mode
  useEffect(() => {
    try {
      if (!isInCall || !activeCall) return;
      const callerId = activeCall?.callerId ? String(activeCall.callerId) : '';
      const selfId = String(user?.id || user?.userId || '');
      if (!selfId || !callerId) return;
      const isOriginator = selfId === callerId;
      if (isOriginator && instantIntercom?.intercomMode === 'push-to-talk' && !pttLatchedRef.current) {
        instantIntercom.startPTT && instantIntercom.startPTT();
        pttLatchedRef.current = true;
      }
    } catch {}
  }, [isInCall, activeCall, user, instantIntercom]);

  useEffect(() => {
    if (!isInCall && pttLatchedRef.current) {
      pttLatchedRef.current = false;
      setIsLatched(false);
    }
  }, [isInCall]);

  // Keep PTT aligned with latch state
  useEffect(() => {
    if (!isInCall) return;
    if (isLatched) {
      instantIntercom.startPTT && instantIntercom.startPTT();
    } else {
      instantIntercom.stopPTT && instantIntercom.stopPTT();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLatched]);

  // Duck incoming monitor audio while transmitting to reduce feedback on open speakers
  useEffect(() => {
    const isTx = instantIntercom?.isTransmitting;
    try {
      if (isTx) {
        consumersRef.current.forEach((cons, key) => {
          const el = cons && cons.__audioEl;
          if (el && !duckedVolumesRef.current.has(key)) {
            duckedVolumesRef.current.set(key, el.volume);
            try { el.volume = Math.max(0, Math.min(1, (el.volume || 1) * 0.2)); } catch {}
          }
        });
      } else {
        // restore
        consumersRef.current.forEach((cons, key) => {
          const el = cons && cons.__audioEl;
          if (el && duckedVolumesRef.current.has(key)) {
            const prev = duckedVolumesRef.current.get(key);
            try { el.volume = prev; } catch {}
            duckedVolumesRef.current.delete(key);
          }
        });
      }
    } catch {}
    // Also clean up on unmount/end of call
    return () => {
      consumersRef.current.forEach((cons, key) => {
        const el = cons && cons.__audioEl;
        if (el && duckedVolumesRef.current.has(key)) {
          const prev = duckedVolumesRef.current.get(key);
          try { el.volume = prev; } catch {}
          duckedVolumesRef.current.delete(key);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantIntercom?.isTransmitting, isInCall]);

  // Create send transport
  const createSendTransport = async (callId) => {
    try {
      if (!device) throw new Error('Device not initialized');

      // Request transport from server
      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/transport`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ 
          direction: 'send',
          callId
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to create transport');
      }

      const params = await response.json();

      const sendTransport = device.createSendTransport(params);

      // Handle connect event
      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await fetch(`${apiBase}/api/webrtc/transport/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              dtlsParameters
            }),
            credentials: 'include'
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      // Handle produce event
      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const response = await fetch(`${apiBase}/api/webrtc/produce`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              kind,
              rtpParameters,
              appData: {
                ...appData,
                callId,
                userId: user?.id
              }
            }),
            credentials: 'include'
          });

          const { id } = await response.json();
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      return sendTransport;

    } catch (error) {
      console.error('Failed to create send transport:', error);
      throw error;
    }
  };

  // Create receive transport
  const createReceiveTransport = async (callId) => {
    try {
      if (!device) throw new Error('Device not initialized');

      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/transport`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ 
          direction: 'recv',
          callId
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to create receive transport');
      }

      const params = await response.json();

      const recvTransport = device.createRecvTransport(params);

      // Handle connect event
      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await fetch(`${apiBase}/api/webrtc/transport/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              dtlsParameters
            }),
            credentials: 'include'
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      return recvTransport;

    } catch (error) {
      console.error('Failed to create receive transport:', error);
      throw error;
    }
  };

  // Produce audio
  const produceAudio = async (transport, track, callId) => {
    try {
      const producer = await transport.produce({
        track,
        codecOptions: {
          opusStereo: 1,
          opusFec: 1,
          opusDtx: 1
        },
        appData: {
          userId: user?.id,
          callId
        }
      });

      producersRef.current.set(callId, producer);

      // Handle producer events
      producer.on('transportclose', () => {
        console.log('Producer transport closed');
        producersRef.current.delete(callId);
      });

      producer.on('trackended', () => {
        console.log('Producer track ended');
        producer.close();
        producersRef.current.delete(callId);
      });

      // Notify server that producer is ready
      if (socket) {
        socket.emit('webrtc-producer-ready', {
          callId,
          producerId: producer.id,
          kind: producer.kind
        });
      }

      console.log('✅ Audio producer created:', producer.id);
      return producer;

    } catch (error) {
      console.error('Failed to produce audio:', error);
      throw error;
    }
  };

  // Consume audio from other participants
  const consumeAudio = async (transport, producerId, rtpCapabilities) => {
    try {
      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          transportId: transport.id,
          producerId,
          rtpCapabilities
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to consume');
      }

      const { id, kind, rtpParameters } = await response.json();

      const consumer = await transport.consume({
        id,
        producerId,
        kind,
        rtpParameters
      });

      consumersRef.current.set(producerId, consumer);

      // Play audio track
      const remoteStream = new MediaStream([consumer.track]);
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.volume = outputVolumeRef.current;
      audio.play().catch(err => console.error('Failed to play audio:', err));

      // Attach audio element reference for volume updates
      consumer.__audioEl = audio;
      // connect remote track to mix for recording
      connectTrackToMix(consumer.track);

      console.log('✅ Audio consumer created:', consumer.id);
      return consumer;

    } catch (error) {
      console.error('Failed to consume audio:', error);
      throw error;
    }
  };

  // Cleanup WebRTC resources
  const cleanupWebRTC = () => {
    console.log('🧹 Cleaning up WebRTC resources');
    stopRecording();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all producers
    for (const producer of producersRef.current.values()) {
      producer.close();
    }
    producersRef.current.clear();

    // Close all consumers
    for (const consumer of consumersRef.current.values()) {
      consumer.close();
    }
    consumersRef.current.clear();

    // Close transports
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
  };

  // Listen for new producers (other participants)
  useEffect(() => {
    if (!socket || !isInCall || !activeCall) return;

    const handleNewProducer = async (data) => {
      const { producerId, userId } = data;
      // Normalize ids and ignore our own producer
      const selfId = String(user?.id || user?.userId || '');
      const prodUserId = String(userId || '');
      if (selfId && prodUserId && selfId === prodUserId) {
        return;
      }

      console.log('🔊 New audio producer from:', userId);

      try {
        if (recvTransportRef.current && device) {
          await consumeAudio(recvTransportRef.current, producerId, device.rtpCapabilities);
        }
      } catch (error) {
        console.error('Failed to consume audio from', userId, error);
      }
    };

    const handleProducerClosed = (data) => {
      const { producerId } = data;
      const consumer = consumersRef.current.get(producerId);
      if (consumer) {
        consumer.close();
        consumersRef.current.delete(producerId);
      }
    };

    socket.on('new-producer', handleNewProducer);
    socket.on('producer-closed', handleProducerClosed);

    return () => {
      socket.off('new-producer', handleNewProducer);
      socket.off('producer-closed', handleProducerClosed);
    };
  }, [socket, isInCall, activeCall, device, user]);


  // Integrated instant connect with WebRTC
  const instantConnectWithAudio = useCallback(async (targetData) => {
    try {
      // Check microphone permissions first
      const stream = await getUserMedia();
      
      // Call original instant connect (signaling)
      await originalInstantConnect(targetData);
      
      // WebRTC setup happens automatically in useEffect
      
    } catch (error) {
      console.error('Failed to connect with audio:', error);
      toast.error('Failed to connect - check microphone permissions');
    }
  }, [originalInstantConnect, getUserMedia]);

  // Integrated disconnect with WebRTC cleanup
  const disconnectWithAudio = useCallback(() => {
    // Disconnect signaling
    originalDisconnectCall();
    
    // WebRTC cleanup happens automatically in useEffect
  }, [originalDisconnectCall]);

  // First responder drop-to-1:1: originator receives responder and starts a direct call
  useEffect(() => {
    if (!socket) return;
    const onFirstResponder = async ({ callId, responderId }) => {
      try {
        // Only originator should act
        const callerId = activeCall?.callerId ? String(activeCall.callerId) : '';
        const selfId = String(user?.id || user?.userId || '');
        if (!selfId || !callerId || selfId !== callerId) return;

        // Disconnect current group call
        originalDisconnectCall();
        // Start direct 1:1
        await instantConnectWithAudio({ userId: responderId });
      } catch (e) {
        console.error('Failed to drop to 1:1:', e);
        toast.error('Failed to switch to 1:1');
      }
    };
    socket.on('first-responder-selected', onFirstResponder);
    return () => {
      socket.off('first-responder-selected', onFirstResponder);
    };
  }, [socket, activeCall, user, originalDisconnectCall, instantConnectWithAudio]);

  // Return combined interface
  return {
    // From instant intercom
    ...instantIntercom,
    
    // From WebRTC
    device,
    localStream: localStreamRef.current,
    producers: producersRef.current,
    consumers: consumersRef.current,
    
    // Integrated actions
    instantConnect: instantConnectWithAudio,
    disconnectCall: disconnectWithAudio,
    
    // Audio control
    toggleMute: webrtc.toggleMute,
    toggleUnmute: webrtc.toggleUnmute,
    isMuted: webrtc.isMuted,
    audioLevel: webrtc.audioLevel,
    outputVolume: outputVolumeRef.current,
    setOutputVolume: (v) => {
      const vol = Math.max(0, Math.min(1, Number(v) || 0));
      outputVolumeRef.current = vol;
      // Apply to all current consumer audio elements
      consumersRef.current.forEach((consumer) => {
        try {
          const track = consumer.track;
          // find associated audio by scanning document media elements (best-effort)
          // This is a heuristic; we also store audio on consumer map entry when available
        } catch {}
      });
      // Better: store audio elements alongside consumers
      consumersRef.current.forEach((cons) => {
        if (cons && cons.__audioEl) {
          try { cons.__audioEl.volume = vol; } catch {}
        }
      });
    },
    isLatched,
    togglePTTLatch: () => setIsLatched(prev => !prev),
    startPTT: instantIntercom.startPTT,
    stopPTT: instantIntercom.stopPTT,
  };
};

