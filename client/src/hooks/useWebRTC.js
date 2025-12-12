import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebRTCStore } from '../stores/webrtcStore';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

export const useWebRTC = () => {
  const {
    isInitialized,
    device,
    router,
    transport,
    producer,
    consumers,
    isConnected,
    isSpeaking,
    isMuted,
    volume,
    audioLevel,
    participants,
    currentRoom,
    error,
    loading,
    setIsInitialized,
    setDevice,
    setRouter,
    setTransport,
    setProducer,
    addConsumer,
    removeConsumer,
    setConnectionStatus,
    setSpeaking,
    setMuted,
    setVolume,
    setAudioLevel,
    addParticipant,
    updateParticipant,
    removeParticipant,
    setCurrentRoom,
    clearError,
    cleanup,
  } = useWebRTCStore();

  const { socket, isConnected: socketConnected } = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const initializationRef = useRef(false);

  // Initialize MediaSoup device
  const initializeMediaSoup = useCallback(async () => {
    try {
      if (isInitialized || initializationRef.current) return;

      // Set initialized immediately to prevent multiple calls
      setIsInitialized(true);
      initializationRef.current = true;

      // Add a small delay to prevent connection flooding
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if MediaSoup is available
      try {
        const { Device } = await import('mediasoup-client');
        
        // Get router RTP capabilities with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const apiBase = process.env.REACT_APP_API_URL || '';
        let authHeader = {};
        try {
          const stored = localStorage.getItem('auth-storage');
          if (stored) {
            const parsed = JSON.parse(stored);
            const token = parsed?.state?.token;
            if (token) authHeader = { Authorization: `Bearer ${token}` };
          }
        } catch {}
        const response = await fetch(`${apiBase}/api/webrtc/rtp-capabilities`, {
          signal: controller.signal,
          headers: {
            ...authHeader
          },
          credentials: 'include'
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error('MediaSoup not available');
        }
        
        const rtpCapabilities = await response.json();

        // Create device
        const newDevice = new Device();
        await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
        
        setDevice(newDevice);
        setConnectionStatus(true);
        
        toast.success('WebRTC initialized successfully');
      } catch (mediaSoupError) {
        // MediaSoup not available, use fallback mode
        console.warn('MediaSoup not available, using fallback mode:', mediaSoupError);
        setConnectionStatus(true);
        toast('Audio system running in fallback mode', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error('Failed to initialize audio system:', error);
      // Don't show error toast for fallback mode
      setConnectionStatus(true);
    }
  }, [isInitialized, setDevice, setConnectionStatus, setIsInitialized]);

  // Get user media
  const getUserMedia = useCallback(
    async ({ deviceId, videoDeviceId, enableVideo = false } = {}) => {
      try {
        const audioOptions = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        };
        if (deviceId) {
          audioOptions.deviceId = { exact: deviceId };
        }

        const videoOptions = enableVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        } : false;
        
        if (enableVideo && videoDeviceId) {
          videoOptions.deviceId = { exact: videoDeviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioOptions,
          video: videoOptions,
        });

        setLocalStream(stream);
        return stream;
      } catch (error) {
        console.error('Failed to get user media:', error);
        const errorMsg = enableVideo 
          ? 'Failed to access camera/microphone' 
          : 'Failed to access microphone';
        toast.error(errorMsg);
        throw error;
      }
    },
    []
  );

  // Create transport
  const createTransport = useCallback(async (direction = 'sendrecv') => {
    try {
      if (!device) {
        throw new Error('Device not initialized');
      }

      const response = await fetch('/api/webrtc/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });

      const { id, iceParameters, iceCandidates, dtlsParameters } = await response.json();

      const newTransport = device.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
      });

      // Handle ICE candidates
      newTransport.on('icegatheringstatechange', (state) => {
        console.log('ICE gathering state:', state);
      });

      newTransport.on('iceconnectionstatechange', (state) => {
        console.log('ICE connection state:', state);
        setConnectionStatus(state === 'connected');
      });

      // Handle producer events
      newTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const response = await fetch('/api/webrtc/producer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transportId: id, kind, rtpParameters, appData }),
          });

          const { id: producerId } = await response.json();
          callback({ id: producerId });
        } catch (error) {
          errback(error);
        }
      });

      setTransport(newTransport);
      return newTransport;
    } catch (error) {
      console.error('Failed to create transport:', error);
      toast.error('Failed to create audio connection');
      throw error;
    }
  }, [device, setTransport, setConnectionStatus]);

  // Start producing audio
  const startProducing = useCallback(async () => {
    try {
      if (!transport || !localStream) {
        throw new Error('Transport or local stream not available');
      }

      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track available');
      }

      const newProducer = await transport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: 1,
          opusFec: 1,
        },
        appData: {
          userId: 'current-user', // This should come from auth store
          timestamp: Date.now(),
        },
      });

      // Monitor audio level
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(localStream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start audio level monitoring
      const monitorAudioLevel = () => {
        if (!analyser) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = average / 255;
        
        setAudioLevel(normalizedLevel);
        setSpeaking(normalizedLevel > 0.01);

        animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
      };

      monitorAudioLevel();

      setProducer(newProducer);
      toast.success('Audio transmission started');
    } catch (error) {
      console.error('Failed to start producing:', error);
      toast.error('Failed to start audio transmission');
      throw error;
    }
  }, [transport, localStream, setProducer, setAudioLevel, setSpeaking]);

  // Stop producing audio
  const stopProducing = useCallback(() => {
    if (producer) {
      producer.close();
      setProducer(null);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAudioLevel(0);
    setSpeaking(false);
  }, [producer, setProducer, setAudioLevel, setSpeaking]);

  // Mute/unmute
  const toggleMute = useCallback(() => {
    if (producer) {
      producer.pause();
      setMuted(true);
      toast.success('Microphone muted');
    } else {
      // Fallback mode - just update state
      setMuted(true);
      toast.success('Microphone muted');
    }
  }, [producer, setMuted]);

  const toggleUnmute = useCallback(() => {
    if (producer) {
      producer.resume();
      setMuted(false);
      toast.success('Microphone unmuted');
    } else {
      // Fallback mode - just update state
      setMuted(false);
      toast.success('Microphone unmuted');
    }
  }, [producer, setMuted]);

  // Join room
  const joinRoom = useCallback(async (roomId, groupId) => {
    try {
      if (!socketConnected) {
        throw new Error('Socket not connected');
      }

      // Get user media
      const stream = await getUserMedia();
      
      // Try to create transport and start producing (only if MediaSoup is available)
      try {
        const newTransport = await createTransport('sendrecv');
        await startProducing();
      } catch (mediaSoupError) {
        console.warn('MediaSoup not available, joining room without audio transmission:', mediaSoupError);
        // Continue without MediaSoup - just join the room
      }

      // Join room via socket
      socket.emit('join-room', { roomId, groupId });

      setCurrentRoom({ id: roomId, groupId });
      toast.success(`Joined room ${roomId}`);
    } catch (error) {
      console.error('Failed to join room:', error);
      toast.error('Failed to join room');
      throw error;
    }
  }, [socketConnected, socket, getUserMedia, createTransport, startProducing, setCurrentRoom]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (currentRoom && socket) {
      socket.emit('leave-room', { roomId: currentRoom.id });
    }

    stopProducing();
    
    if (transport) {
      transport.close();
      setTransport(null);
    }

    setCurrentRoom(null);
    setConnectionStatus(false);
  }, [currentRoom, socket, stopProducing, transport, setTransport, setCurrentRoom, setConnectionStatus]);

  // Handle socket events
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (data) => {
      addParticipant(data.userId, data.user);
      toast.success(`${data.user.name} joined the room`);
    };

    const handleUserLeft = (data) => {
      removeParticipant(data.userId);
      toast(`${data.userId} left the room`, { icon: 'ℹ️' });
    };

    const handleUserSpeaking = (data) => {
      updateParticipant(data.userId, { isSpeaking: true });
    };

    const handleUserStoppedSpeaking = (data) => {
      updateParticipant(data.userId, { isSpeaking: false });
    };

    const handleUserMuteChanged = (data) => {
      updateParticipant(data.userId, { isMuted: data.muted });
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('user-speaking', handleUserSpeaking);
    socket.on('user-stopped-speaking', handleUserStoppedSpeaking);
    socket.on('user-mute-changed', handleUserMuteChanged);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('user-speaking', handleUserSpeaking);
      socket.off('user-stopped-speaking', handleUserStoppedSpeaking);
      socket.off('user-mute-changed', handleUserMuteChanged);
    };
  }, [socket, addParticipant, removeParticipant, updateParticipant]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    // State
    isInitialized,
    device,
    router,
    transport,
    producer,
    consumers,
    isConnected,
    isSpeaking,
    isMuted,
    volume,
    audioLevel,
    participants,
    currentRoom,
    error,
    loading,
    localStream,
    remoteStreams,

    // Actions
    initializeMediaSoup,
    getUserMedia,
    createTransport,
    startProducing,
    stopProducing,
    toggleMute,
    toggleUnmute,
    joinRoom,
    leaveRoom,
    setVolume,
    clearError,
    cleanup,
  };
};
