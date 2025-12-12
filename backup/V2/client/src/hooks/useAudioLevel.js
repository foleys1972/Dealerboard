import { useState, useEffect, useRef, useCallback } from 'react';

export const useAudioLevel = (stream, isEnabled = true) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const dataArrayRef = useRef(null);

  const startMonitoring = useCallback(() => {
    if (!stream || !isEnabled) return;

    try {
      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      // Configure analyser
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Create data array
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      // Connect stream to analyser
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Start monitoring loop
      const monitor = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        // Calculate average level
        const average = dataArrayRef.current.reduce((sum, value) => sum + value, 0) / dataArrayRef.current.length;
        const normalizedLevel = average / 255;
        
        setAudioLevel(normalizedLevel);
        setIsSpeaking(normalizedLevel > 0.01);
        
        animationRef.current = requestAnimationFrame(monitor);
      };
      
      monitor();
    } catch (error) {
      console.error('Failed to start audio monitoring:', error);
    }
  }, [stream, isEnabled]);

  const stopMonitoring = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    dataArrayRef.current = null;
    
    setAudioLevel(0);
    setIsSpeaking(false);
  }, []);

  const mute = useCallback(() => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = false;
      });
      setIsMuted(true);
    }
  }, [stream]);

  const unmute = useCallback(() => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = true;
      });
      setIsMuted(false);
    }
  }, [stream]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      unmute();
    } else {
      mute();
    }
  }, [isMuted, mute, unmute]);

  // Start/stop monitoring when stream changes
  useEffect(() => {
    if (stream && isEnabled) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
    
    return () => {
      stopMonitoring();
    };
  }, [stream, isEnabled, startMonitoring, stopMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    audioLevel,
    isSpeaking,
    isMuted,
    mute,
    unmute,
    toggleMute,
    startMonitoring,
    stopMonitoring,
  };
};
