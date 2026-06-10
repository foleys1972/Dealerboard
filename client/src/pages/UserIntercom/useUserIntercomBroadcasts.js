import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  fetchIntercomButtonLayout,
  assignedGroupIdsFromSlots,
} from '../../utils/intercomButtonLayout';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Broadcast (hoot) channels: fetch, monitor, PTT, and local audio sync.
 */
export function useUserIntercomBroadcasts({
  userId,
  selectedDevices,
  monitorBroadcastAudio,
  stopBroadcastAudio,
  startBroadcastPushToTalk,
  stopBroadcastPushToTalk,
  updateBroadcastSpeaker,
  subscribeBroadcastLevels,
  stopAllBroadcastAudio,
}) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState(null);
  const [speakingBroadcastId, setSpeakingBroadcastId] = useState(null);
  const [broadcastLevels, setBroadcastLevels] = useState({});
  const levelUnsubsRef = useRef(new Map());

  const fetchBroadcastStatus = useCallback(async (groupId) => {
    try {
      const response = await fetch(`${API_BASE}/api/groups/${groupId}/hoot/status`);
      if (!response.ok) return;
      const data = await response.json();
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === groupId ? { ...b, hoot: data.hoot } : b))
      );
    } catch (error) {
      console.error('Failed to refresh hoot status', error);
    }
  }, []);

  const fetchBroadcasts = useCallback(async () => {
    try {
      setBroadcastLoading(true);
      setBroadcastError(null);

      const layout = await fetchIntercomButtonLayout(userId);
      const assignedIds = assignedGroupIdsFromSlots(layout.broadcastSlots);

      if (assignedIds.length === 0) {
        setBroadcasts([]);
        return;
      }

      const response = await fetch(`${API_BASE}/api/groups?callMode=broadcast`);
      if (!response.ok) {
        throw new Error('Failed to load broadcast channels');
      }
      const data = await response.json();
      const groups = (data.groups || []).filter((g) => assignedIds.includes(String(g.id)));

      const groupById = new Map(groups.map((g) => [String(g.id), g]));
      const orderedGroups = layout.broadcastSlots
        .filter((slot) => slot.groupId && groupById.has(String(slot.groupId)))
        .map((slot) => groupById.get(String(slot.groupId)));

      setBroadcasts((prev) => {
        const previousMap = new Map(prev.map((b) => [b.id, b]));
        return orderedGroups.map((group) => {
          const previous = previousMap.get(group.id);
          const hootConfig =
            group.hoot?.config || group.hootConfig || previous?.hootConfig || {};

          const selfId = String(userId || '');
          const listeners = Array.isArray(group.hoot?.state?.listeners)
            ? group.hoot.state.listeners.map(String)
            : [];
          const persistentListeners = Array.isArray(group.hoot?.state?.persistentListeners)
            ? group.hoot.state.persistentListeners.map(String)
            : [];
          const serverActive = !!(
            selfId &&
            (listeners.includes(selfId) || persistentListeners.includes(selfId))
          );

          return {
            id: group.id,
            name: group.name,
            description: group.description,
            active: serverActive,
            volume: previous?.volume ?? 80,
            isToggling: false,
            hoot: group.hoot || previous?.hoot || null,
            hootConfig,
          };
        });
      });
    } catch (error) {
      console.error(error);
      setBroadcastError(error.message);
      toast.error(error.message || 'Failed to load broadcasts');
    } finally {
      setBroadcastLoading(false);
    }
  }, [userId]);

  const stopPushToTalk = useCallback(
    async (broadcastId, reason = 'ptt-release') => {
      if (!userId || speakingBroadcastId !== broadcastId) return;
      try {
        await stopBroadcastPushToTalk(broadcastId);
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, reason }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to stop hoot');
        }
      } catch (error) {
        console.error('Failed to stop hoot:', error);
        toast.error(error.message || 'Push-to-talk stop failed');
      } finally {
        setSpeakingBroadcastId((current) => (current === broadcastId ? null : current));
        fetchBroadcastStatus(broadcastId);
      }
    },
    [userId, speakingBroadcastId, stopBroadcastPushToTalk, fetchBroadcastStatus]
  );

  const startPushToTalk = useCallback(
    async (broadcastId) => {
      if (!userId) {
        toast.error('You must be logged in to speak');
        return;
      }

      if (speakingBroadcastId && speakingBroadcastId !== broadcastId) {
        await stopPushToTalk(speakingBroadcastId);
      }

      try {
        await startBroadcastPushToTalk({
          groupId: broadcastId,
          microphoneId: selectedDevices.microphoneId,
        });
        setSpeakingBroadcastId(broadcastId);
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, options: { source: 'ptt-button' } }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to start hoot');
        }
        fetchBroadcastStatus(broadcastId);
      } catch (error) {
        console.error('Failed to start hoot:', error);
        toast.error(error.message || 'Push-to-talk failed');
        setSpeakingBroadcastId((current) => (current === broadcastId ? null : current));
        await stopBroadcastPushToTalk(broadcastId);
      }
    },
    [
      userId,
      speakingBroadcastId,
      stopPushToTalk,
      fetchBroadcastStatus,
      startBroadcastPushToTalk,
      selectedDevices.microphoneId,
    ]
  );

  useEffect(() => {
    fetchBroadcasts();
    const interval = setInterval(fetchBroadcasts, 15000);
    return () => clearInterval(interval);
  }, [fetchBroadcasts]);

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    const run = async () => {
      for (const b of broadcasts) {
        if (cancelled) return;
        if (!b?.id) continue;

        if (b.active) {
          try {
            await monitorBroadcastAudio({
              groupId: b.id,
              speakerDeviceId: selectedDevices.speakerId,
            });

            if (!levelUnsubsRef.current.get(b.id)) {
              try {
                const unsub = subscribeBroadcastLevels(b.id, (level) => {
                  setBroadcastLevels((prev) => ({ ...prev, [b.id]: level }));
                });
                levelUnsubsRef.current.set(b.id, unsub);
              } catch {
                // ignore
              }
            }
          } catch {
            // retry on next refresh
          }
        } else {
          try {
            stopBroadcastAudio(b.id);
          } catch {
            // ignore
          }
          const unsub = levelUnsubsRef.current.get(b.id);
          if (unsub) {
            try {
              unsub();
            } catch {
              // ignore
            }
            levelUnsubsRef.current.delete(b.id);
          }
          setBroadcastLevels((prev) => {
            if (!(b.id in prev)) return prev;
            const next = { ...prev };
            delete next[b.id];
            return next;
          });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    broadcasts,
    userId,
    monitorBroadcastAudio,
    stopBroadcastAudio,
    selectedDevices.speakerId,
    subscribeBroadcastLevels,
  ]);

  useEffect(() => {
    return () => {
      stopAllBroadcastAudio();
    };
  }, [stopAllBroadcastAudio]);

  useEffect(() => {
    broadcasts
      .filter((broadcast) => broadcast.active)
      .forEach((broadcast) =>
        updateBroadcastSpeaker(broadcast.id, selectedDevices.speakerId)
      );
  }, [broadcasts, selectedDevices.speakerId, updateBroadcastSpeaker]);

  const toggleBroadcast = useCallback(
    async (broadcastId) => {
      const broadcast = broadcasts.find((b) => b.id === broadcastId);
      if (!broadcast) return;
      if (!userId) {
        toast.error('User information not available');
        return;
      }

      const targetState = !broadcast.active;
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === broadcastId ? { ...b, isToggling: true } : b))
      );

      try {
        if (targetState) {
          const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/listen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              persistent: broadcast.hootConfig?.persistentListen || false,
            }),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to join broadcast');
          }
          await monitorBroadcastAudio({
            groupId: broadcastId,
            speakerDeviceId: selectedDevices.speakerId,
          });
          try {
            const unsub = subscribeBroadcastLevels(broadcastId, (level) => {
              setBroadcastLevels((prev) => ({ ...prev, [broadcastId]: level }));
            });
            levelUnsubsRef.current.set(broadcastId, unsub);
          } catch {
            // ignore
          }
          toast.success(`Monitoring ${broadcast.name}`);
        } else {
          const response = await fetch(
            `${API_BASE}/api/groups/${broadcastId}/hoot/listen/${userId}?keepPersistent=false`,
            { method: 'DELETE' }
          );
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to leave broadcast');
          }
          stopBroadcastAudio(broadcastId);
          const unsub = levelUnsubsRef.current.get(broadcastId);
          if (unsub) {
            try {
              unsub();
            } catch {
              // ignore
            }
            levelUnsubsRef.current.delete(broadcastId);
          }
          setBroadcastLevels((prev) => {
            const next = { ...prev };
            delete next[broadcastId];
            return next;
          });
          toast.success(`Stopped monitoring ${broadcast.name}`);
          if (speakingBroadcastId === broadcastId) {
            await stopPushToTalk(broadcastId, 'monitor-disabled');
          }
        }

        setBroadcasts((prev) =>
          prev.map((b) =>
            b.id === broadcastId ? { ...b, active: targetState, isToggling: false } : b
          )
        );
        fetchBroadcastStatus(broadcastId);
      } catch (error) {
        console.error(error);
        toast.error(error.message || 'Broadcast action failed');
        if (targetState) {
          stopBroadcastAudio(broadcastId);
        }
        setBroadcasts((prev) =>
          prev.map((b) => (b.id === broadcastId ? { ...b, isToggling: false } : b))
        );
      }
    },
    [
      broadcasts,
      userId,
      monitorBroadcastAudio,
      selectedDevices.speakerId,
      subscribeBroadcastLevels,
      stopBroadcastAudio,
      speakingBroadcastId,
      stopPushToTalk,
      fetchBroadcastStatus,
    ]
  );

  const adjustBroadcastVolume = useCallback((broadcastId, newVolume) => {
    setBroadcasts((prev) =>
      prev.map((b) => (b.id === broadcastId ? { ...b, volume: newVolume } : b))
    );
  }, []);

  return {
    broadcasts,
    broadcastLoading,
    broadcastError,
    speakingBroadcastId,
    broadcastLevels,
    fetchBroadcasts,
    fetchBroadcastStatus,
    startPushToTalk,
    stopPushToTalk,
    toggleBroadcast,
    adjustBroadcastVolume,
    setBroadcasts,
  };
}
