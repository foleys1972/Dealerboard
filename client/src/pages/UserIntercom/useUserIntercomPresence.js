import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Socket presence, auto-reconnect, and online-user tracking for UserIntercom.
 */
export function useUserIntercomPresence({
  socket,
  connectSocket,
  isDND,
  isInCall,
  callForward,
}) {
  const [onlineUsers, setOnlineUsers] = useState({});

  const computePresence = useCallback(() => {
    if (!socket || !socket.connected) return { key: 'offline', label: 'Offline' };
    if (isDND) return { key: 'dnd', label: 'Do Not Disturb' };
    if (isInCall) return { key: 'busy', label: 'On a call' };
    if (callForward?.enabled) return { key: 'forward', label: 'Call forwarding' };
    return { key: 'online', label: 'Online' };
  }, [socket, isDND, isInCall, callForward]);

  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!socket) return undefined;

    const maxAttempts = 12;
    const reconnectInterval = 10000;

    const tryReconnect = () => {
      if (!socket) return;
      if (socket.connected) {
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) {
          clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        return;
      }

      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current > maxAttempts) {
        if (reconnectTimerRef.current) {
          clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        return;
      }

      try {
        if (socket.disconnected) {
          socket.connect();
        } else if (!socket.connected && !socket.connecting) {
          connectSocket();
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
      }
    };

    const onDisconnect = () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
      }
      tryReconnect();
      reconnectTimerRef.current = setInterval(tryReconnect, reconnectInterval);
    };

    const onConnect = () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    if (!socket.connected) {
      onDisconnect();
    }

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [socket, connectSocket]);

  useEffect(() => {
    if (!socket) return undefined;

    try {
      socket.emit('presence-get', (data) => {
        const online = {};
        (data?.online || []).forEach((id) => {
          online[String(id)] = true;
        });
        setOnlineUsers(online);
      });
    } catch {
      // ignore
    }

    const refreshTimer = setInterval(() => {
      try {
        socket.emit('presence-get', (data) => {
          const online = {};
          (data?.online || []).forEach((id) => {
            online[String(id)] = true;
          });
          setOnlineUsers(online);
        });
      } catch {
        // ignore
      }
    }, 60_000);

    const onPresence = ({ userId, online }) => {
      const id = String(userId);
      setOnlineUsers((prev) => {
        const next = { ...prev };
        if (online) next[id] = true;
        else delete next[id];
        return next;
      });
    };

    socket.on('presence-update', onPresence);

    return () => {
      clearInterval(refreshTimer);
      socket.off('presence-update', onPresence);
    };
  }, [socket]);

  return { onlineUsers, computePresence };
}
