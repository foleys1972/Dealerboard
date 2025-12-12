import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { getClientRoutingService } from '../services/clientRoutingService';
import toast from 'react-hot-toast';

let globalSocket = null; // Global socket instance

export const useSocket = () => {
  const [socket, setSocket] = useState(globalSocket);
  const [isConnected, setIsConnected] = useState(globalSocket?.connected || false);
  const [error, setError] = useState(null);

  // Debug: Log state changes
  useEffect(() => {
    console.log('🔍 Socket connection state changed:', { isConnected, hasSocket: !!socket, socketId: socket?.id });
  }, [isConnected, socket]);

  // Sync socket connection state with React state
  useEffect(() => {
    if (socket) {
      const checkConnection = () => {
        const actuallyConnected = socket.connected;
        if (actuallyConnected !== isConnected) {
          console.log('🔄 Syncing connection state:', { was: isConnected, now: actuallyConnected });
          setIsConnected(actuallyConnected);
        }
      };
      
      // Check immediately
      checkConnection();
      
      // Set up interval to periodically sync state
      const syncInterval = setInterval(checkConnection, 1000);
      
      // Also listen for connection changes
      socket.on('connect', () => {
        console.log('🔄 Socket connect event - syncing state to true');
        setIsConnected(true);
      });
      
      socket.on('disconnect', () => {
        console.log('🔄 Socket disconnect event - syncing state to false');
        setIsConnected(false);
      });
      
      return () => {
        clearInterval(syncInterval);
        socket.off('connect');
        socket.off('disconnect');
      };
    }
  }, [socket, isConnected]);
  const { token, user } = useAuthStore();
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 12; // Increased from 5 to 12

  const connectSocket = useCallback(() => {
    if (globalSocket) {
      setSocket(globalSocket);
      setIsConnected(globalSocket.connected);
      return;
    }

    try {
      // Use client routing service to get the appropriate server URL
      const routingService = getClientRoutingService();
      let apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      
      if (routingService.isInitialized) {
        apiBase = routingService.getApiBaseUrl();
      }

      // Normalize the URL protocol to match both server and client
      // If client page is HTTPS, we must use HTTPS/WSS (mixed content security)
      // If client page is HTTP, we can use HTTP/WS
      const isClientHttps = window.location.protocol === 'https:';
      
      try {
        const url = new URL(apiBase);
        const hostname = url.hostname.toLowerCase();
        const port = url.port || (url.protocol === 'https:' ? '443' : '80');
        
        // Check if this is a local/development server
        const isLocalDev = 
          hostname === 'localhost' || 
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.') ||
          port === '5000' ||
          process.env.NODE_ENV === 'development';
        
        // Mixed content security: if client page is HTTPS, we MUST use HTTPS/WSS
        // Browsers block insecure WebSocket (WS) from secure pages (HTTPS)
        if (isClientHttps) {
          // Client is HTTPS - must use HTTPS/WSS (even with self-signed cert)
          if (url.protocol === 'http:') {
            console.warn('[Socket] Client is HTTPS, converting HTTP to HTTPS for server connection (required for mixed content security)');
            url.protocol = 'https:';
            if (!url.port && port !== '443') {
              url.port = port;
            }
            apiBase = url.toString();
          }
        } else if (isLocalDev && url.protocol === 'https:') {
          // Client is HTTP and local dev - use HTTP/WS to avoid certificate issues
          console.warn('[Socket] Local dev detected, converting HTTPS to HTTP to avoid certificate issues');
          url.protocol = 'http:';
          if (!url.port && port !== '80') {
            url.port = port === '443' ? '5000' : port;
          }
          apiBase = url.toString();
        } else if (isClientHttps && url.protocol === 'http:' && !isLocalDev) {
          // Only convert to HTTPS if not local dev
          console.warn('[Socket] Client is HTTPS, converting HTTP to HTTPS for server connection');
          url.protocol = 'https:';
          // Keep the port as-is (likely 5000, which is fine for HTTPS)
          if (!url.port && port !== '443') {
            url.port = port;
          }
          apiBase = url.toString();
        } else if (!isClientHttps && url.protocol === 'https:' && isLocalDev) {
          // Client is HTTP and server URL is HTTPS for local dev - convert to HTTP
          console.warn('[Socket] Client is HTTP, converting HTTPS to HTTP for local development server');
          url.protocol = 'http:';
          // Keep the port as-is
          if (!url.port && port !== '80') {
            url.port = port === '443' ? '5000' : port;
          }
          apiBase = url.toString();
        } else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          // Default: ensure http:// or https:// based on client
          url.protocol = isClientHttps ? 'https:' : 'http:';
          apiBase = url.toString();
        } else {
          // Protocol already correct
          apiBase = url.toString();
        }
      } catch (e) {
        // If URL parsing fails, try to fix common issues
        if (!apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
          // If no protocol, use client's protocol
          apiBase = `${isClientHttps ? 'https://' : 'http://'}${apiBase}`;
        } else if (isClientHttps && apiBase.startsWith('http://')) {
          // Client is HTTPS but server URL is HTTP - MUST convert to HTTPS
          // Browsers block mixed content (HTTP from HTTPS page)
          console.warn('[Socket] Client is HTTPS, converting HTTP to HTTPS for server connection (required for mixed content security)');
          apiBase = apiBase.replace(/^http:/, 'https:');
        } else if (!isClientHttps && apiBase.startsWith('https://')) {
          // Client is HTTP but server URL is HTTPS - check if local and convert
          const localIpMatch = apiBase.match(/^https:\/\/(192\.168\.|10\.|172\.|localhost|127\.0\.0\.1)/i);
          if (localIpMatch || apiBase.includes(':5000')) {
            console.warn('[Socket] Local dev detected, converting HTTPS to HTTP to avoid certificate issues');
            apiBase = apiBase.replace(/^https:/, 'http:');
          }
        }
      }

      console.log('[Socket] Connecting to:', apiBase);

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
        // Use polling only to avoid WebSocket upgrade issues with self-signed certs
        // Polling is more reliable in development environments
        transports: ['polling'],
        upgrade: false, // Disable upgrade to avoid "Invalid frame header" errors
        rememberUpgrade: false,
        timeout: 30000, // Increased timeout for certificate negotiation
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 2000, // Increased delay
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10,
        maxReconnectionAttempts: 10,
        withCredentials: true,
        auth: token ? { token } : undefined,
        extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        // Note: rejectUnauthorized doesn't work in browsers - browsers handle cert validation
        // If using self-signed cert, user must accept it in browser first
      });

      newSocket.on('connect', () => {
        console.log('✅ Socket.IO connected:', newSocket.id, 'Transport:', newSocket.io.engine.transport.name);
        // Force state update - use functional update to ensure it works
        setIsConnected(prev => {
          console.log('🔄 Updating isConnected from', prev, 'to true');
          return true;
        });
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
        // Double-check state after a brief delay - use socket.connected directly
        setTimeout(() => {
          if (newSocket.connected) {
            setIsConnected(prev => {
              if (!prev) {
                console.warn('⚠️ Socket connected but state was false, forcing update...');
                return true;
              }
              return prev;
            });
          }
        }, 100);
        
        try {
          const stored = localStorage.getItem('auth-storage');
          let authToken, authUserId, authUsername;
          if (stored) {
            const parsed = JSON.parse(stored);
            authToken = parsed?.state?.token;
            authUserId = parsed?.state?.user?.id || parsed?.state?.user?.userId;
            authUsername = parsed?.state?.user?.username;
          }
          if (authToken && (authUserId || authUsername)) {
            // Prefer username over numeric ID for better identification
            const userIdentifier = authUsername || authUserId;
            // Validate token format (basic check)
            if (!authToken || authToken.length < 10) {
              console.error('❌ Invalid token format:', authToken?.substring(0, 20));
              return;
            }
            newSocket.emit('authenticate', { 
              userId: authUserId, // Keep for backward compatibility
              username: authUsername, // Send username
              token: authToken 
            });
            console.log('🔐 Authentication sent for user:', authUsername || authUserId, 'Token length:', authToken.length);
          } else {
            console.warn('⚠️ No auth token or user ID found, skipping authentication');
          }
        } catch (error) {
          console.warn('Failed to send authentication:', error);
        }
      });

      // Handle authentication success
      newSocket.on('auth-success', (data) => {
        const username = data?.username || data?.user?.username || data?.userId;
        console.log(`✅ Authentication successful for user: ${username} (ID: ${data?.userId})`);
        // Note: username and userId are intentionally the same in this system
        if (data?.username && data?.username !== data?.userId) {
          console.log('✅ Using username format:', username);
        } else if (data?.username === data?.userId) {
          // This is expected behavior - username and userId are the same
          console.log('✅ Authenticated as:', username);
        } else {
          console.warn('⚠️ Username not found in auth response, using userId:', data?.userId);
        }
        // Force state update with functional update to ensure React detects the change
        setIsConnected(prev => {
          if (!prev) {
            console.log('🔄 Setting isConnected to true after auth-success');
            return true;
          }
          return prev;
        });
        setError(null);
        // Also ensure socket state is synced
        setTimeout(() => {
          if (newSocket.connected) {
            setIsConnected(true);
          }
        }, 50);
      });

      // Handle authentication error
      newSocket.on('auth-error', (error) => {
        console.error('❌ Authentication failed:', error);
        setError(error.message || 'Authentication failed');
        // Don't set isConnected to false here - keep connection, just mark auth as failed
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Socket.IO disconnected:', reason);
        setIsConnected(false);
        
        // Handle different disconnect reasons
        if (reason === 'io server disconnect') {
          // Server disconnected the client, don't reconnect automatically
          console.warn('⚠️ Server disconnected client');
          setError('Server disconnected. Please refresh the page.');
        } else if (reason === 'io client disconnect') {
          // Client manually disconnected
          console.log('ℹ️ Client manually disconnected');
          setError(null);
        } else {
          // Network error or other - will attempt to reconnect
          console.log('🔄 Connection lost, will attempt to reconnect...');
          setError(null); // Clear error, reconnection will handle it
        }
      });

      newSocket.on('error', (error) => {
        console.error('❌ Socket.IO error:', error);
        // Don't set isConnected to false on error - let disconnect handler do it
        // This prevents flickering between connected/disconnected states
        setError(error.message || 'Connection error');
      });

      // Handle transport errors (e.g., WebSocket upgrade failures)
      if (newSocket.io) {
        newSocket.io.on('error', (error) => {
          console.error('❌ Socket.IO transport error:', error);
          // Transport errors are usually recoverable, don't disconnect immediately
          if (error.message && error.message.includes('Invalid frame header')) {
            console.warn('⚠️ WebSocket upgrade failed, staying on polling transport');
            // Connection should still work on polling, so don't mark as disconnected
          }
        });
      }

      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
        setError(error.message || 'Failed to connect');
        
        reconnectAttemptsRef.current++;
        
        // Don't show toast on every reconnect attempt
        if (reconnectAttemptsRef.current === 1) {
          console.log(`🔄 Attempting to reconnect socket...`);
          // Only show error toast once, not on every attempt
          const errorMsg = error.message || 'Connection failed';
          if (errorMsg.includes('timeout') || errorMsg.includes('certificate') || errorMsg.includes('Mixed Content')) {
            console.warn('⚠️ Socket connection issue - this may be due to certificate or mixed content. Try accessing via HTTP or accept the certificate.');
          }
        } else if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
          console.log(`🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
        }
        
        // Log detailed error info for debugging
        if (error.message) {
          console.error('Connection error details:', {
            message: error.message,
            type: error.type,
            description: error.description
          });
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('✅ Socket.IO reconnected after', attemptNumber, 'attempts');
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
            const authUsername = parsed?.state?.user?.username;
            if (authToken && (authUserId || authUsername)) {
              newSocket.emit('authenticate', { 
                userId: authUserId, 
                username: authUsername,
                token: authToken 
              });
              console.log('🔐 Re-authentication sent for user:', authUsername || authUserId);
            }
          }
        } catch (err) {
          console.warn('⚠️ Failed to re-authenticate on reconnect:', err);
        }
        
        toast.success('Reconnected successfully', { duration: 3000, icon: '✅' });
      });

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Auto-reconnect attempt ${attemptNumber}/${maxReconnectAttempts}`);
        console.log('🔄 Attempting to reconnect socket...');
        if (attemptNumber >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
          toast.error('Failed to reconnect. Please refresh the page.');
          reconnectAttemptsRef.current = 0; // Reset for manual retry
        }
      });

      newSocket.on('reconnect_failed', () => {
        console.error('❌ WebSocket reconnection failed after all attempts');
        setIsConnected(false);
        const errorMsg = `Connection failed. Click "Offline" to retry, or accept certificate at ${apiBase}`;
        setError(errorMsg);
        toast.error('Connection failed. Click "Offline" to retry.', {
          duration: 5000,
          icon: '⚠️'
        });
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

  // Manual reconnect function
  const reconnect = useCallback(() => {
    console.log('🔄 Manual reconnect requested');
    reconnectAttemptsRef.current = 0; // Reset attempts
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }
    setSocket(null);
    setIsConnected(false);
    setError(null);
    // Small delay before reconnecting
    setTimeout(() => {
      connectSocket();
    }, 500);
  }, [connectSocket]);

  return {
    socket,
    isConnected,
    error,
    connectSocket,
    disconnectSocket,
    reconnect,
    emit,
    on,
    off
  };
};