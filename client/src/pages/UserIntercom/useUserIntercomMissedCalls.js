import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

/**
 * Missed-call notifications panel state for UserIntercom.
 */
export function useUserIntercomMissedCalls(showNotifications) {
  const [missedCalls, setMissedCalls] = useState([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedError, setMissedError] = useState(null);

  const fetchMissed = useCallback(async () => {
    setMissedLoading(true);
    setMissedError(null);
    try {
      const res = await api.get('/api/notifications/missed');
      setMissedCalls(res.data?.missed || []);
    } catch (e) {
      setMissedError(e?.message || 'Failed to load missed calls');
      setMissedCalls([]);
    } finally {
      setMissedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showNotifications) {
      fetchMissed();
    }
  }, [showNotifications, fetchMissed]);

  return {
    missedCalls,
    missedLoading,
    missedError,
    fetchMissed,
  };
}
