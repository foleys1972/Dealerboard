import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

let globalSocket = null; // Global socket instance

export const useSocket = () => {
  const [socket, setSocket] = useState(globalSocket);
  const [isConnected, setIsConnected] = useState(globalSocket?.connected || false);
  const [error, setError] = useState(null);
  const { token, user } = useAuthStore();
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connectSocket = useCallback(() => {
    if (globalSocket) {
      setSocket(globalSocket);
      setIsConnected(globalSocket.connected);
      return;
    }

    try {
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      // Pull JWT from persisted auth store
      let token;
      try {
        const stored = localStorage.getItem('auth-storage');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.state?.token;
        }
      } catch {}

      const newSocket = io(apiBase, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5,
        withCredentials: true,
        auth: token ? { token } : undefined,
        extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      newSocket.on('connect', () => {
        console.log('WebSocket connected:', newSocket.id);
        setIsConnected(true);
        try {
          const stored = localStorage.getItem('auth-storage');
          let authToken, authUserId;
          if (stored) {
            const parsed = JSON.parse(stored);
            authToken = parsed?.state?.token;
            authUserId = parsed?.state?.user?.id || parsed?.state?.user?.userId;
          }
          if (authToken && authUserId) {
            newSocket.emit('authenticate', { userId: authUserId, token: authToken });
          }
        } catch {}
      });

      newSocket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setIsConnected(false);
        setError(null);
        
        // Handle different disconnect reasons
        if (reason === 'io server disconnect') {
          // Server disconnected the client, don't reconnect automatically
          console.warn('Server disconnected client');
        } else if (reason === 'io client disconnect') {
          // Client manually disconnected
          console.log('Client manually disconnected');
        } else {
          // Network error or other - will attempt to reconnect
          console.log('Connection lost, will attempt to reconnect...');
        }
      });

      newSocket.on('error', (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        setError(error.message || 'Connection error');
      });

      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
        setError(error.message || 'Failed to connect');
        
        // Don't show toast on every reconnect attempt
        if (reconnectAttemptsRef.current === 0) {
          toast.error('Connection failed. Retrying...');
        }
        reconnectAttemptsRef.current++;
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('WebSocket reconnected after', attemptNumber, 'attempts');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Re-authenticate on reconnect
        try {
          const stored = localStorage.getItem('auth-storage');
          if (stored) {
            const parsed = JSON.parse(stored);
            const authToken = parsed?.state?.token;
            const authUserId = parsed?.state?.user?.id || parsed?.state?.user?.userId;
            if (authToken && authUserId) {
              newSocket.emit('authenticate', { userId: authUserId, token: authToken });
            }
          }
        } catch (err) {
          console.warn('Failed to re-authenticate on reconnect:', err);
        }
        
        toast.success('Reconnected successfully');
      });

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Reconnection attempt', attemptNumber);
        if (attemptNumber >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
          toast.error('Failed to reconnect. Please refresh the page.');
        }
      });

      newSocket.on('reconnect_failed', () => {
        console.error('WebSocket reconnection failed');
        setIsConnected(false);
        setError('Reconnection failed');
        toast.error('Failed to reconnect. Please refresh the page.');
      });

      globalSocket = newSocket;
      setSocket(newSocket);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  const disconnectSocket = useCallback(() => {
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }
    setSocket(null);
    setIsConnected(false);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
  }, []); // Empty dependency array

  const emit = useCallback((event, data) => {
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }, [socket]);

  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
    }
  }, [socket]);

  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (token && user && !socket && !isConnected) {
      connectSocket();
    } else if (token && user && socket && !socket.connected && !isConnected) {
      // If socket exists but not connected, try to reconnect
      if (globalSocket && !globalSocket.connected) {
        globalSocket.connect();
      } else {
        connectSocket();
      }
    }
  }, [token, user, socket, isConnected, connectSocket]);

  // Disconnect sockets in other tabs on logout (storage event)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'auth-storage' && (!e.newValue || e.newValue === '')) {
        // Auth cleared elsewhere -> disconnect here
        disconnectSocket();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [disconnectSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Use globalSocket instead of socket to avoid stale closure
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
      }
    };
  }, []); // Empty dependency array - only run on unmount

  return {
    socket,
    isConnected,
    error,
    connectSocket,
    disconnectSocket,
    emit,
    on,
    off
  };
};