import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

export function useUserIntercomNewGroupModal({ loadGroupCalls, setGroupCallLoading }) {
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSearch, setNewGroupSearch] = useState('');
  const [newGroupResults, setNewGroupResults] = useState([]);
  const [newGroupSelected, setNewGroupSelected] = useState([]);
  const [newGroupAudioMode, setNewGroupAudioMode] = useState('ptt');
  const [newGroupPolicy, setNewGroupPolicy] = useState('group');

  const openNewGroupModal = useCallback(() => setShowNewGroupModal(true), []);

  const closeNewGroupModal = useCallback(() => {
    setShowNewGroupModal(false);
    setNewGroupName('');
    setNewGroupSearch('');
    setNewGroupResults([]);
    setNewGroupSelected([]);
  }, []);

  const searchUsersForNewGroup = useCallback(async (query) => {
    setNewGroupSearch(query);
    if (!query || query.length < 2) {
      setNewGroupResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setNewGroupResults(
        users.map((u) => ({
          id: u.userId || u.id,
          name:
            u.displayName ||
            `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
            u.username,
          email: u.email,
        }))
      );
    } catch (error) {
      console.error('Failed to search users for group', error);
      setNewGroupResults([]);
    }
  }, []);

  const toggleSelectNewGroupUser = useCallback((user) => {
    setNewGroupSelected((prev) => {
      const exists = prev.some((p) => p.id === user.id);
      if (exists) return prev.filter((p) => p.id !== user.id);
      return [...prev, user];
    });
  }, []);

  const handleCreateGroup = useCallback(
    async (e) => {
      e.preventDefault();
      if (!newGroupName.trim()) {
        toast.error('Group name is required');
        return;
      }
      try {
        setGroupCallLoading(true);
        const createRes = await api.post('/api/groups', {
          name: newGroupName.trim(),
          callMode: 'group-call',
        });
        const group = createRes.data?.group || createRes.data;
        const groupId = group?.id;
        if (!groupId) throw new Error('Group create failed');

        for (const u of newGroupSelected) {
          try {
            await api.post(`/api/groups/${groupId}/participants`, { userId: u.id });
          } catch {
            // continue with other participants
          }
        }

        closeNewGroupModal();
        await loadGroupCalls();
        toast.success('Group created');
      } catch (error) {
        console.error('Create group failed', error);
        toast.error(error.response?.data?.error || 'Failed to create group');
      } finally {
        setGroupCallLoading(false);
      }
    },
    [
      newGroupName,
      newGroupSelected,
      closeNewGroupModal,
      loadGroupCalls,
      setGroupCallLoading,
    ]
  );

  return {
    showNewGroupModal,
    openNewGroupModal,
    closeNewGroupModal,
    newGroupName,
    setNewGroupName,
    newGroupSearch,
    newGroupAudioMode,
    setNewGroupAudioMode,
    newGroupPolicy,
    setNewGroupPolicy,
    newGroupResults,
    newGroupSelected,
    searchUsersForNewGroup,
    toggleSelectNewGroupUser,
    handleCreateGroup,
  };
}
