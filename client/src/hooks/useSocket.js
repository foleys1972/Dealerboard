import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { getClientRoutingService } from '../services/clientRoutingService';
import toast from 'react-hot-toast';

let globalSocket = null; // Global socket instance
let socketInitPromise = null; // Prevent concurrent connect storms

// Production logging control
const isDev = process.env.NODE_ENV === 'development';

const log = {
  info: (...args) => isDev && console.log(...args),
  warn: (...args) => isDev && console.warn(...args),
  error: (...args) => console.error(...args), // Always log errors
  debug: (...args) => isDev && console.log(...args),
};

/**
 * Normalizes the API URL for Socket.IO connection.
 * The configured scheme is trusted as-is (the dev backend runs TLS); the only
 * rewrite is upgrading http→https when the page itself is HTTPS, because the
 * browser would hard-block the mixed-content request anyway.
 * @param {string} apiBase - The base API URL to normalize
 * @returns {string} - Normalized URL
 */
const normalizeSocketUrl = (apiBase) => {
  const isClientHttps = window.location.protocol === 'https:';

  try {
    const url = new URL(apiBase);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');

    // Mixed content security: an HTTPS page cannot talk to an HTTP backend.
    if (isClientHttps && url.protocol === 'http:') {
      log.warn('[Socket] Client is HTTPS, converting HTTP to HTTPS (mixed content security)');
      url.protocol = 'https:';
      if (!url.port && port !== '443') {
        url.port = port;
      }
      return url.toString();
    }

    // Ensure valid protocol
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      url.protocol = isClientHttps ? 'https:' : 'http:';
    }

    return url.toString();
  } catch (e) {
    // Fallback: string-based fixes
    if (!apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
      return `${isClientHttps ? 'https://' : 'http://'}${apiBase}`;
    }

    if (isClientHttps && apiBase.startsWith('http://')) {
      log.warn('[Socket] Client is HTTPS, converting HTTP to HTTPS (mixed content security)');
      return apiBase.replace(/^http:/, 'https:');
    }

    return apiBase;
  }
};

/**
 * Gets Socket.IO configuration
 * @param {string} token - JWT authentication token
 * @param {object} options
 * @returns {object} Socket.IO configuration object
 */
const getSocketConfig = (token, options = {}) => {
  const { forceNew = false, pollingOnly = false } = options;

  // Verified 2026-06-10: WebSocket works against the current server in all transport
  // combinations, including compression (see SOCKET_IO_ROOT_CAUSE.md). Default to
  // websocket with polling fallback; REACT_APP_SOCKET_FORCE_POLLING=true is the
  // emergency kill switch if a deployment hits the historical frame-header issue.
  const allowWebSocket =
    !pollingOnly && process.env.REACT_APP_SOCKET_FORCE_POLLING !== 'true';

  return {
    path: '/socket.io',
    transports: allowWebSocket ? ['websocket', 'polling'] : ['polling'],
    upgrade: allowWebSocket,
    rememberUpgrade: allowWebSocket,
    timeout: 30000,
    forceNew,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: 10,
    maxReconnectionAttempts: 10,
    withCredentials: true,
    auth: token ? { token } : undefined,
  };
};

export const useSocket = () => {
  const [socket, setSocket] = useState(globalSocket);
  const [isConnected, setIsConnected] = useState(globalSocket?.connected || false);
  const [error, setError] = useState(null);

  // Debug: Log state changes
  useEffect(() => {
    log.debug('🔍 Socket connection state changed:', { isConnected, hasSocket: !!socket, socketId: socket?.id });
  }, [isConnected, socket]);

  // Sync socket connection state with React state
  useEffect(() => {
    if (!socket) return;
    
    // Set initial state
    setIsConnected(socket.connected);
    
    // Event handlers
    const onConnect = () => {
      log.info('✅ Socket connected:', socket.id);
      setIsConnected(true);
    };
    
    const onDisconnect = () => {
      log.info('❌ Socket disconnected');
      setIsConnected(false);
    };
    
    // Register listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    
    // Cleanup
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]); // Only depend on socket, not isConnected
  const { token, user } = useAuthStore();
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10; // Match Socket.IO reconnectionAttempts config

  const connectSocket = useCallback((options = {}) => {
    const { forceNew = false } = options;

    if (globalSocket && !forceNew) {
      setSocket(globalSocket);
      setIsConnected(globalSocket.connected);
      if (!globalSocket.connected) {
        globalSocket.connect();
      }
      return;
    }

    if (socketInitPromise && !forceNew) {
      socketInitPromise.then(() => {
        if (globalSocket) {
          setSocket(globalSocket);
          setIsConnected(globalSocket.connected);
        }
      });
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
      apiBase = normalizeSocketUrl(apiBase);

      log.info('[Socket] Connecting to:', apiBase);
      
      // Log connection diagnostics
      const urlObj = new URL(apiBase);
      log.debug('[Socket] Connection diagnostics:', {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'),
        clientProtocol: window.location.protocol,
        isLocalDev: urlObj.hostname === 'localhost' || 
                   urlObj.hostname.startsWith('192.168.') || 
                   urlObj.hostname.startsWith('10.') ||
                   urlObj.hostname.startsWith('172.') ||
                   urlObj.port === '5000'
      });

      // Pull JWT from persisted auth store
      let token;
      try {
        const stored = localStorage.getItem('auth-storage');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.state?.token;
        }
      } catch {}

      const newSocket = io(apiBase, getSocketConfig(token, { forceNew }));

      newSocket.on('connect', () => {
        const transport = newSocket.io?.engine?.transport?.name || 'unknown';
        log.info('✅ Socket.IO connected:', newSocket.id, 'Transport:', transport);
        
        // Log connection diagnostics in dev mode
        if (isDev && newSocket.io?.engine) {
          log.debug('Connection established:', {
            socketId: newSocket.id,
            transport: transport,
            upgrade: newSocket.io.engine.upgrade,
            readyState: newSocket.io.engine.readyState,
            url: apiBase
          });
        }
        
        setIsConnected(prev => {
          log.debug('🔄 Updating isConnected from', prev, 'to true');
          return true;
        });
        setError(null);
        reconnectAttemptsRef.current = 0;
        setTimeout(() => {
          if (newSocket.connected) {
            setIsConnected(prev => (prev ? prev : true));
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
            if (!authToken || authToken.length < 10) {
              log.error('❌ Invalid token format:', authToken?.substring(0, 20));
              return;
            }
            newSocket.emit('authenticate', { 
              userId: authUserId,
              username: authUsername,
              token: authToken 
            });
            log.info('🔐 Authentication sent for user:', authUsername || authUserId, 'Token length:', authToken.length);
          } else {
            log.warn('⚠️ No auth token or user ID found, skipping authentication');
          }
        } catch (error) {
          log.warn('Failed to send authentication:', error);
        }
      });

      // Handle authentication success
      newSocket.on('auth-success', (data) => {
        const username = data?.username || data?.user?.username || data?.userId;
        log.info(`✅ Authentication successful for user: ${username} (ID: ${data?.userId})`);
        // Note: username and userId are intentionally the same in this system
        if (data?.username && data?.username !== data?.userId) {
          log.info('✅ Using username format:', username);
        } else if (data?.username === data?.userId) {
          // This is expected behavior - username and userId are the same
          log.info('✅ Authenticated as:', username);
        } else {
          log.warn('⚠️ Username not found in auth response, using userId:', data?.userId);
        }
        // Force state update with functional update to ensure React detects the change
        setIsConnected(prev => {
          if (!prev) {
            log.debug('🔄 Setting isConnected to true after auth-success');
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
        log.error('❌ Authentication failed:', error);
        setError(error.message || 'Authentication failed');
        // Don't set isConnected to false here - keep connection, just mark auth as failed
      });

      newSocket.on('disconnect', (reason) => {
        log.info('❌ Socket.IO disconnected:', reason);
        setIsConnected(false);
        
        // Handle different disconnect reasons
        if (reason === 'io server disconnect') {
          // Server disconnected the client, don't reconnect automatically
          log.warn('⚠️ Server disconnected client');
          setError('Server disconnected. Please refresh the page.');
        } else if (reason === 'io client disconnect') {
          // Client manually disconnected
          log.info('ℹ️ Client manually disconnected');
          setError(null);
        } else {
          // Network error or other - will attempt to reconnect
          log.info('🔄 Connection lost, will attempt to reconnect...');
          setError(null); // Clear error, reconnection will handle it
        }
      });

      newSocket.on('error', (error) => {
        log.error('❌ Socket.IO error:', error);
        // Don't set isConnected to false on error - let disconnect handler do it
        // This prevents flickering between connected/disconnected states
        setError(error.message || 'Connection error');
      });

      // Handle transport errors (e.g., WebSocket upgrade failures)
      if (newSocket.io) {
        newSocket.io.on('error', (error) => {
          const errorMsg = error.message || '';
          // Only log significant transport errors (not timeouts/refused which are handled elsewhere)
          if (errorMsg.includes('Invalid frame header')) {
            log.warn('⚠️ WebSocket upgrade failed, staying on polling transport (this is usually fine)');
            // Connection should still work on polling, so don't mark as disconnected
          } else if (!errorMsg.includes('timeout') && !errorMsg.includes('ECONNREFUSED')) {
            // Log other transport errors in dev mode only
            if (isDev) {
              log.debug('Socket.IO transport error:', error);
            }
          }
        });
      }

      newSocket.on('connect_error', (error) => {
        const errorMsg = error.message || 'Connection failed';
        if (newSocket.connected || errorMsg.includes('Invalid frame header')) {
          return;
        }

        setIsConnected(false);
        setError(errorMsg || 'Failed to connect');
        
        reconnectAttemptsRef.current++;
        const isTimeout = errorMsg.includes('timeout');
        const isCertificate = errorMsg.includes('certificate') || errorMsg.includes('SSL') || errorMsg.includes('TLS');
        const isMixedContent = errorMsg.includes('Mixed Content') || errorMsg.includes('mixed content');
        
        // Only log detailed error on first attempt or every 5th attempt
        if (reconnectAttemptsRef.current === 1) {
          log.error('WebSocket connection error:', error);
          log.info(`🔄 Attempting to reconnect socket...`);
          
          // Provide helpful guidance based on error type
          if (isCertificate) {
            log.warn('⚠️ Certificate/SSL issue detected. If using self-signed certificate, you may need to accept it in your browser or configure proper SSL.');
          } else if (isMixedContent) {
            log.warn('⚠️ Mixed content detected. Ensure the page and WebSocket use the same protocol (both HTTP or both HTTPS).');
          } else if (isTimeout) {
            log.warn('⚠️ Connection timeout. Check if the server is running and accessible, and verify firewall/network settings.');
          }
        } else if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
          // Only log every 5th attempt to reduce noise
          if (reconnectAttemptsRef.current % 5 === 0) {
            log.debug(`🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
          }
        }
        
        // Log detailed error info for debugging (only on first attempt)
        if (reconnectAttemptsRef.current === 1 && error.message) {
          log.debug('Connection error details:', {
            message: error.message,
            type: error.type,
            description: error.description,
            url: apiBase
          });
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        const transport = newSocket.io?.engine?.transport?.name || 'unknown';
        log.info('✅ Socket.IO reconnected after', attemptNumber, 'attempts', `(Transport: ${transport})`);
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Log reconnection details in dev mode
        if (isDev && newSocket.io?.engine) {
          log.debug('Reconnection details:', {
            transport: transport,
            upgrade: newSocket.io.engine.upgrade,
            readyState: newSocket.io.engine.readyState
          });
        }
        
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
              log.info('🔐 Re-authentication sent for user:', authUsername || authUserId);
            }
          }
        } catch (err) {
          log.warn('⚠️ Failed to re-authenticate on reconnect:', err);
        }
        
        toast.success('Reconnected successfully', { duration: 3000, icon: '✅' });
      });

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        log.debug(`🔄 Auto-reconnect attempt ${attemptNumber}/${maxReconnectAttempts}`);
        log.debug('🔄 Attempting to reconnect socket...');
        if (attemptNumber >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
          toast.error('Failed to reconnect. Please refresh the page.');
          reconnectAttemptsRef.current = 0; // Reset for manual retry
        }
      });

      newSocket.on('reconnect_failed', () => {
        log.error('❌ WebSocket reconnection failed after all attempts');
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
      socketInitPromise = Promise.resolve(newSocket);
    } catch (error) {
      socketInitPromise = null;
      log.error('Failed to create WebSocket connection:', error);
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  // If routing changes (e.g., effectiveSiteId moved and backend recommends a different subscriber URL),
  // force Socket.IO to reconnect to the new base URL.
  useEffect(() => {
    const onRoutingChanged = (evt) => {
      try {
        const nextBaseUrl = evt?.detail?.nextBaseUrl;
        if (!nextBaseUrl) return;

        log.info('[Socket] Routing changed; forcing reconnect to:', nextBaseUrl);

        if (globalSocket) {
          try {
            globalSocket.disconnect();
          } catch {}
          globalSocket = null;
        }
        socketInitPromise = null;

        setSocket(null);
        setIsConnected(false);

        if (token && user) {
          connectSocket({ forceNew: true });
        }
      } catch (e) {
        log.warn('[Socket] Failed to handle routing change event:', e);
      }
    };

    window.addEventListener('client-routing-changed', onRoutingChanged);
    return () => window.removeEventListener('client-routing-changed', onRoutingChanged);
  }, [token, user, connectSocket]);

  const disconnectSocket = useCallback(() => {
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }
    socketInitPromise = null;
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
      log.warn('Socket not connected, cannot emit event:', event);
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

  // Auto-connect when authenticated — bind to stable user id, not object reference
  const userKey = user?.id || user?.userId || user?.username || null;
  useEffect(() => {
    if (!token || !userKey) return;
    
    if (!globalSocket) {
      connectSocket();
      return;
    }
    
    if (globalSocket && !globalSocket.connected) {
      globalSocket.connect();
    }
  }, [token, userKey, connectSocket]);

  // Sync React state when another hook instance creates the global socket
  useEffect(() => {
    if (globalSocket && globalSocket !== socket) {
      setSocket(globalSocket);
      setIsConnected(globalSocket.connected);
    }
  }, [socket]);

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

  // Manual reconnect function
  const reconnect = useCallback(() => {
    log.info('🔄 Manual reconnect requested');
    reconnectAttemptsRef.current = 0;
    socketInitPromise = null;
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }
    setSocket(null);
    setIsConnected(false);
    setError(null);
    setTimeout(() => {
      connectSocket({ forceNew: true });
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