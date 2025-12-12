import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useAuthStore } from '../stores/authStore';
import { audioNotifications } from '../utils/audioNotifications';
import toast from 'react-hot-toast';

/**
 * useInstantIntercom Hook
 * Manages instant intercom connections with no ringing delays
 */
export const useInstantIntercom = () => {
  const { socket, isConnected, connectSocket } = useSocket();
  const { user, token } = useAuthStore();
  
  // Call state
  const [activeCall, setActiveCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [audioLevels, setAudioLevels] = useState({});
  const [silenceWarning, setSilenceWarning] = useState(null);
  
  // Refs
  const callStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  
  // User settings
  const [intercomMode, setIntercomMode] = useState('always-on'); // or 'push-to-talk'
  const [autoDisconnectSeconds, setAutoDisconnectSeconds] = useState(10);
  const [blockCallsWhenBusy, setBlockCallsWhenBusy] = useState(false);
  const [allowMultipleCalls, setAllowMultipleCalls] = useState(true);
  const [maxSimultaneousCalls, setMaxSimultaneousCalls] = useState(3);

  // Initialize WebRTC peer connection
  const initializeAudioStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false 
      });
      
      // Create audio context for level detection
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      return stream;
    } catch (error) {
      console.error('Failed to get audio stream:', error);
      toast.error('Failed to access microphone');
      throw error;
    }
  }, []);

  // Detect audio levels for silence detection
  const detectAudioLevel = useCallback(() => {
    if (!analyserRef.current) return 0;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    return Math.round(average);
  }, []);

  // Send audio level to server
  useEffect(() => {
    if (!isInCall || !socket || !activeCall) return;
    
    const interval = setInterval(() => {
      const level = detectAudioLevel();
      socket.emit('audio-level', {
        callId: activeCall.callId,
        level
      });
    }, 1000); // Send every second
    
    return () => clearInterval(interval);
  }, [isInCall, socket, activeCall, detectAudioLevel]);

  // Start call duration timer
  useEffect(() => {
    if (isInCall && callStartTimeRef.current) {
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      setCallDuration(0);
    }
    
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isInCall]);

  // Instant connect to user or group
  const instantConnect = useCallback(async (targetData) => {
    let ready = !!(socket && isConnected);
    if (!ready) {
      try {
        connectSocket();
        // wait briefly for socket to connect
        await new Promise(res => setTimeout(res, 800));
        ready = !!(socket && (socket.connected || isConnected));
      } catch {}
    }
    if (!ready) {
      toast.error('Not connected to server');
      return;
    }

    try {
      // Ensure socket authentication
      await new Promise((resolve, reject) => {
        let settled = false;
        const t = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Not authenticated'));
          }
        }, 1500);
        const onOk = () => {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          socket.off('auth-success', onOk);
          socket.off('auth-error', onErr);
          resolve(true);
        };
        const onErr = (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          socket.off('auth-success', onOk);
          socket.off('auth-error', onErr);
          reject(new Error(e?.message || 'Not authenticated'));
        };
        socket.once('auth-success', onOk);
        socket.once('auth-error', onErr);
        try {
          const userId = user?.id || user?.userId;
          if (!userId || !token) throw new Error('Missing credentials');
          socket.emit('authenticate', { userId, token });
        } catch (e) {
          onErr({ message: e.message });
        }
      });

      // Get audio stream
      const stream = await initializeAudioStream();
      
      // Send instant connect request
      socket.emit('instant-connect', {
        targetUserId: targetData.userId,
        targetUserIds: targetData.userIds,
        groupId: targetData.groupId,
        isGroupCall: !!targetData.groupId || !!targetData.userIds,
        // Optional call configuration
        audioMode: targetData.audioMode || 'ptt', // 'ptt' | 'open'
        policy: targetData.policy || 'group', // 'group' | 'firstResponder1to1'
      });
      
      // Play connection beep
      await audioNotifications.playConnectionBeep();
      
      toast.success('Connecting...', { duration: 1000 });
      
    } catch (error) {
      console.error('Instant connect failed:', error);
      toast.error(error?.message || 'Failed to establish connection');
    }
  }, [socket, isConnected, connectSocket, initializeAudioStream, user, token]);

  // Disconnect from call
  const disconnectCall = useCallback(() => {
    if (!socket || !activeCall) return;
    
    socket.emit('instant-disconnect', {
      callId: activeCall.callId
    });
    
    // Cleanup will happen in socket event handler
  }, [socket, activeCall]);

  // Reject incoming call
  const rejectCall = useCallback((callId, reason = 'user-reject') => {
    if (!socket) return;
    
    socket.emit('instant-reject', {
      callId,
      reason
    });
  }, [socket]);

  // PTT controls
  const startPTT = useCallback(() => {
    if (!socket || !activeCall) return;
    
    setIsTransmitting(true);
    socket.emit('ptt-start', {
      callId: activeCall.callId
    });
    
    audioNotifications.playPTTStart();
  }, [socket, activeCall, intercomMode]);

  const stopPTT = useCallback(() => {
    if (!socket || !activeCall) return;
    
    setIsTransmitting(false);
    socket.emit('ptt-stop', {
      callId: activeCall.callId
    });
    
    audioNotifications.playPTTStop();
  }, [socket, activeCall, intercomMode]);

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Incoming instant connection
    const handleInstantIncoming = (data) => {
      console.log('📞 Instant incoming call:', data);
      
      setActiveCall(data);
      setIsInCall(true);
      callStartTimeRef.current = Date.now();
      
      // Play beep
      audioNotifications.playConnectionBeep();
      
      // Vibrate on mobile
      audioNotifications.vibrate([200]);
      
      toast.success(`Connected: ${data.callerName}`, {
        icon: '🔴',
        duration: 2000
      });
    };

    // Connection established
    const handleInstantConnected = (data) => {
      console.log('✅ Instant connection established:', data);
      
      setActiveCall(prev => ({ ...prev, ...data }));
      setParticipants(data.participants || []);
      setParticipantCount(data.participantCount || 0);
      setIsInCall(true);
      callStartTimeRef.current = Date.now();
      
      // If always-on mode, start transmitting
      if (intercomMode === 'always-on') {
        setIsTransmitting(true);
      }
      
      // Align PTT mode with call config from server
      try {
        const mode = data?.config?.audioMode;
        if (mode === 'ptt' && intercomMode !== 'push-to-talk') {
          setIntercomMode('push-to-talk');
        } else if (mode === 'open' && intercomMode !== 'always-on') {
          setIntercomMode('always-on');
        }
      } catch {}
    };

    // Call active (broadcast to all participants)
    const handleInstantCallActive = (data) => {
      console.log('📡 Call active:', data);
      setParticipants(data.participants || []);
      setParticipantCount(data.participantCount || 0);
    };

    // Connection blocked (DND or Busy)
    const handleInstantBlocked = (data) => {
      console.log('🚫 Connection blocked:', data);
      
      const messages = {
        'dnd': '🔕 User has Do Not Disturb enabled',
        'busy': '📞 User is on another call',
        'max-calls-reached': '📵 User has reached maximum calls'
      };
      
      const message = messages[data.reason] || data.message || 'User is unavailable';
      toast.error(message, { duration: 3000 });
    };

    // Admin override notification
    const handleAdminOverride = (data) => {
      console.log('⚠️ Admin override:', data);
      audioNotifications.playAdminOverride();
      toast.error(data.message, {
        icon: '⚠️',
        duration: 5000
      });
    };

    // Admin override when busy
    const handleBusyOverride = (data) => {
      console.log('📞 Busy override:', data);
      audioNotifications.playAdminOverride();
      toast.warning(`${data.message}\nYou have ${data.currentCalls} active call(s)`, {
        icon: '⚠️',
        duration: 5000
      });
    };

    // Participant left
    const handleParticipantLeft = (data) => {
      console.log('👋 Participant left:', data);
      setParticipants(data.remainingParticipants || []);
      setParticipantCount(data.participantCount || 0);
    };

    // PTT transmitting indicator
    const handlePTTTransmitting = (data) => {
      console.log('🎤 PTT:', data);
      // Update UI to show who's transmitting (for group calls)
    };

    // Audio levels update
    const handleAudioLevels = (data) => {
      setAudioLevels(data.levels || {});
    };

    // Silence warning
    const handleSilenceWarning = (data) => {
      console.log('⏱️ Silence warning:', data);
      setSilenceWarning(data.secondsRemaining);
      
      audioNotifications.playSilenceWarning();
      
      toast.warning(`Auto-disconnect in ${data.secondsRemaining} seconds...`, {
        icon: '⏱️',
        duration: 1000
      });
    };

    // Call ended
    const handleInstantEnded = async (data) => {
      console.log('📴 Call ended:', data);
      
      setIsInCall(false);
      setActiveCall(null);
      setParticipants([]);
      setParticipantCount(0);
      setIsTransmitting(false);
      setSilenceWarning(null);
      callStartTimeRef.current = null;
      
      // Play disconnection beep
      await audioNotifications.playDisconnectionBeep();
      
      const reasonText = {
        'user-disconnect': 'Call ended',
        'caller-disconnect': 'Call ended by caller',
        'silence-timeout': 'Disconnected due to silence',
        'all-rejected': 'All participants rejected'
      }[data.reason] || 'Call ended';
      
      toast(reasonText, { icon: '📴', duration: 2000 });
      
      // Cleanup audio
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    // Disconnected
    const handleInstantDisconnected = async (data) => {
      console.log('🔌 Disconnected:', data);
      
      setIsInCall(false);
      setActiveCall(null);
      setParticipants([]);
      setParticipantCount(0);
      setIsTransmitting(false);
      setSilenceWarning(null);
      callStartTimeRef.current = null;
      
      await audioNotifications.playDisconnectionBeep();
      
      toast('Disconnected', { icon: '📴' });
    };

    // Error
    const handleInstantError = (data) => {
      console.error('❌ Instant error:', data);
      toast.error(data.message || 'Connection error');
      
      setIsInCall(false);
      setActiveCall(null);
    };

    // Register listeners
    socket.on('instant-incoming', handleInstantIncoming);
    socket.on('instant-connected', handleInstantConnected);
    socket.on('instant-call-active', handleInstantCallActive);
    socket.on('instant-blocked', handleInstantBlocked);
    socket.on('instant-admin-override', handleAdminOverride);
    socket.on('instant-busy-override', handleBusyOverride);
    socket.on('participant-left', handleParticipantLeft);
    socket.on('ptt-transmitting', handlePTTTransmitting);
    socket.on('audio-levels', handleAudioLevels);
    socket.on('silence-warning', handleSilenceWarning);
    socket.on('instant-ended', handleInstantEnded);
    socket.on('instant-disconnected', handleInstantDisconnected);
    socket.on('instant-error', handleInstantError);

    // Cleanup
    return () => {
      socket.off('instant-incoming', handleInstantIncoming);
      socket.off('instant-connected', handleInstantConnected);
      socket.off('instant-call-active', handleInstantCallActive);
      socket.off('instant-blocked', handleInstantBlocked);
      socket.off('instant-admin-override', handleAdminOverride);
      socket.off('instant-busy-override', handleBusyOverride);
      socket.off('participant-left', handleParticipantLeft);
      socket.off('ptt-transmitting', handlePTTTransmitting);
      socket.off('audio-levels', handleAudioLevels);
      socket.off('silence-warning', handleSilenceWarning);
      socket.off('instant-ended', handleInstantEnded);
      socket.off('instant-disconnected', handleInstantDisconnected);
      socket.off('instant-error', handleInstantError);
    };
  }, [socket, intercomMode]);

  // Keyboard handler for PTT (spacebar)
  useEffect(() => {
    if (intercomMode !== 'push-to-talk' || !isInCall) return;
    
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && !isTransmitting) {
        e.preventDefault();
        startPTT();
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isTransmitting) {
        e.preventDefault();
        stopPTT();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [intercomMode, isInCall, isTransmitting, startPTT, stopPTT]);

  return {
    // State
    isInCall,
    activeCall,
    participants,
    participantCount,
    callDuration,
    isTransmitting,
    audioLevels,
    silenceWarning,
    intercomMode,
    autoDisconnectSeconds,
    blockCallsWhenBusy,
    allowMultipleCalls,
    maxSimultaneousCalls,
    
    // Actions
    instantConnect,
    disconnectCall,
    rejectCall,
    startPTT,
    stopPTT,
    setIntercomMode,
    setAutoDisconnectSeconds,
    setBlockCallsWhenBusy,
    setAllowMultipleCalls,
    setMaxSimultaneousCalls
  };
};

