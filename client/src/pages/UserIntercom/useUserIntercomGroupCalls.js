import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { fetchIntercomButtonLayout, assignedGroupIdsFromSlots } from '../../utils/intercomButtonLayout';

export function useUserIntercomGroupCalls(userId) {
  const [groupCalls, setGroupCalls] = useState([]);
  const [groupCallLoading, setGroupCallLoading] = useState(false);
  const [groupCallError, setGroupCallError] = useState(null);

  const loadGroupCalls = useCallback(async () => {
    if (!userId) return;
    try {
      setGroupCallLoading(true);
      setGroupCallError(null);

      const layout = await fetchIntercomButtonLayout(userId);
      const assignedIds = assignedGroupIdsFromSlots(layout.groupCallSlots);

      if (assignedIds.length === 0) {
        setGroupCalls([]);
        return;
      }

      const response = await api.get('/api/groups');
      if (!response.data?.success && !Array.isArray(response.data?.groups)) {
        throw new Error('Failed to load groups');
      }

      const allGroups = response.data?.groups || response.data || [];
      const lookup = new Map(allGroups.map((g) => [String(g.id), g]));

      const ordered = layout.groupCallSlots
        .filter((slot) => slot.groupId && lookup.has(String(slot.groupId)))
        .map((slot) => {
          const group = lookup.get(String(slot.groupId));
          return {
            ...group,
            slotIndex: slot.index,
            name: group.name || slot.label || slot.groupId,
          };
        });

      setGroupCalls(ordered);
    } catch (error) {
      console.error(error);
      setGroupCallError(error.message || 'Failed to load group calls');
    } finally {
      setGroupCallLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadGroupCalls();
  }, [loadGroupCalls]);

  return {
    groupCalls,
    groupCallLoading,
    groupCallError,
    loadGroupCalls,
    setGroupCalls,
    setGroupCallLoading,
  };
}
