import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

export function useUserIntercomSettings() {
  const [isDND, setIsDND] = useState(false);
  const [status, setStatus] = useState('available');
  const [callForward, setCallForward] = useState({
    enabled: false,
    forwardToUser: null,
    searchQuery: '',
  });
  const [showForwardSearch, setShowForwardSearch] = useState(false);
  const [forwardSearchResults, setForwardSearchResults] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(() => {
    try {
      return localStorage.getItem('auto-answer-enabled') === 'true';
    } catch {
      return false;
    }
  });

  const toggleDND = useCallback(() => {
    setIsDND((prev) => {
      const next = !prev;
      setStatus(next ? 'dnd' : 'available');
      toast.success(next ? 'Do Not Disturb ON' : 'Do Not Disturb OFF');
      return next;
    });
  }, []);

  const toggleAutoAnswer = useCallback(() => {
    setAutoAnswer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('auto-answer-enabled', String(next));
      } catch {
        // ignore
      }
      toast.success(next ? 'Auto-answer enabled' : 'Auto-answer disabled');
      return next;
    });
  }, []);

  const toggleCallForward = useCallback(() => {
    setCallForward((prev) => {
      if (!prev.enabled && !prev.forwardToUser) {
        setShowForwardSearch(true);
        toast('Select a person to forward calls to');
        return prev;
      }
      const enabled = !prev.enabled;
      if (enabled && prev.forwardToUser) {
        toast.success(`Call forward enabled to ${prev.forwardToUser.name}`);
      } else {
        toast.success('Call forward disabled');
      }
      return { ...prev, enabled };
    });
  }, []);

  const searchForwardUsers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setForwardSearchResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setForwardSearchResults(
        users.map((user) => ({
          id: user.id || user.userId,
          name:
            user.displayName ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          status: user.status || 'available',
          extension: user.extension || '',
          email: user.email,
        }))
      );
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    }
  }, []);

  const selectForwardUser = useCallback((contact) => {
    setCallForward((prev) => ({
      ...prev,
      forwardToUser: contact,
      enabled: true,
    }));
    setShowForwardSearch(false);
    toast.success(`Calls will forward to ${contact.name}`);
  }, []);

  return {
    isDND,
    setIsDND,
    status,
    setStatus,
    callForward,
    setCallForward,
    showForwardSearch,
    setShowForwardSearch,
    forwardSearchResults,
    showSettings,
    setShowSettings,
    autoAnswer,
    setAutoAnswer,
    toggleDND,
    toggleCallForward,
    toggleAutoAnswer,
    searchForwardUsers,
    selectForwardUser,
  };
}
