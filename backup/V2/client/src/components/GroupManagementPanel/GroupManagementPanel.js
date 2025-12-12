import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FiUsers, FiRefreshCw, FiFilter, FiUserPlus, FiUserMinus, FiPhoneCall } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const FILTERS = [
  { id: 'all', label: 'All Types' },
  { id: 'group-call', label: 'Group Calls' },
  { id: 'conference', label: 'Group Calls' },
];

const GroupManagementPanel = () => {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [filter, setFilter] = useState('group-call');
  const [participantSelections, setParticipantSelections] = useState({});
  const [updatingGroup, setUpdatingGroup] = useState(null);

  useEffect(() => {
    refreshGroups();
    refreshUsers();
  }, []);

  const refreshGroups = async () => {
    try {
      setGroupsLoading(true);
      const response = await api.get('/api/groups');
      const list = (response.data?.groups || []).filter(
        (group) => (group.callMode || 'conference') !== 'broadcast'
      );
      setGroups(list);
    } catch (error) {
      console.error('Failed to load groups', error);
      toast.error(error.response?.data?.error || 'Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  };

  const refreshUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await api.get('/api/auth/users');
      setUsers(response.data?.users || []);
    } catch (error) {
      console.error('Failed to load users', error);
      toast.error(error.response?.data?.error || 'Failed to load directory');
    } finally {
      setUsersLoading(false);
    }
  };

  const userLookup = useMemo(() => {
    const map = new Map();
    users.forEach((user) => {
      map.set(user.userId, user);
    });
    return map;
  }, [users]);

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      const mode = group.callMode || 'conference';
      if (filter === 'all') return true;
      if (filter === 'group-call') {
        return mode === 'hunt' || mode === 'group-call';
      }
      return mode === filter;
    });
  }, [groups, filter]);

  const handleParticipantSelect = (groupId, userId) => {
    setParticipantSelections((prev) => ({
      ...prev,
      [groupId]: userId,
    }));
  };

  const handleAddParticipant = async (groupId) => {
    const userId = participantSelections[groupId];
    if (!userId) {
      toast.error('Select a user to add');
      return;
    }
    try {
      setUpdatingGroup(groupId);
      await api.post(`/api/groups/${groupId}/participants`, { userId });
      toast.success('User added to group');
      setParticipantSelections((prev) => ({ ...prev, [groupId]: '' }));
      await refreshGroups();
    } catch (error) {
      console.error('Failed to add participant', error);
      toast.error(error.response?.data?.error || 'Failed to add participant');
    } finally {
      setUpdatingGroup(null);
    }
  };

  const handleRemoveParticipant = async (groupId, userId) => {
    try {
      setUpdatingGroup(groupId);
      await api.delete(`/api/groups/${groupId}/participants/${userId}`);
      toast.success('User removed from group');
      await refreshGroups();
    } catch (error) {
      console.error('Failed to remove participant', error);
      toast.error(error.response?.data?.error || 'Failed to remove participant');
    } finally {
      setUpdatingGroup(null);
    }
  };

  const getModeLabel = (mode) => {
    if (mode === 'hunt' || mode === 'group-call' || mode === 'conference') {
      return { label: 'Group Call', color: '#2563eb' };
    }
    return { label: 'Group Call', color: '#2563eb' };
  };

  return (
    <Container>
      <Header>
        <Title>Group Calls</Title>
        <HeaderActions>
          <HeaderButton onClick={refreshGroups} disabled={groupsLoading}>
            <FiRefreshCw />
            Refresh
          </HeaderButton>
        </HeaderActions>
      </Header>

      <StatsRow>
        <StatCard>
          <strong>{groups.length}</strong>
          <span>Total Groups</span>
        </StatCard>
        <StatCard>
          <strong>{groups.filter((g) => (g.callMode || 'conference') === 'hunt').length}</strong>
          <span>Group Calls</span>
        </StatCard>
        <StatCard style={{ display: 'none' }}>
          <strong>0</strong>
          <span>Conferences</span>
        </StatCard>
      </StatsRow>

      <FiltersRow>
        <FilterGroup>
          <FiFilter />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterGroup>
        <DirectoryMeta>
          <span>Directory</span>
          <strong>{users.length}</strong>
        </DirectoryMeta>
      </FiltersRow>

      {filteredGroups.length === 0 && !groupsLoading ? (
        <EmptyState>
          <FiPhoneCall size={32} />
          <p>No groups match your filters</p>
        </EmptyState>
      ) : (
        <GroupList>
          {filteredGroups.map((group) => {
            const modeInfo = getModeLabel(group.callMode || 'group-call');
            return (
              <GroupCard key={group.id}>
                <GroupHeader>
                  <GroupInfo>
                    <h3>{group.name}</h3>
                    <p>{group.description || 'No description provided'}</p>
                  </GroupInfo>
                  <ModeBadge $color={modeInfo.color}>{modeInfo.label}</ModeBadge>
                </GroupHeader>

                <DetailRow>
                  <DetailLabel>Participants</DetailLabel>
                  <DetailValue>{group.participants?.length || 0}</DetailValue>
                </DetailRow>

                <ParticipantList>
                  {(group.participants || []).length === 0 ? (
                    <ParticipantEmpty>No users assigned yet</ParticipantEmpty>
                  ) : (
                    group.participants.map((participantId) => {
                      const participant = userLookup.get(participantId);
                      const label =
                        participant?.name ||
                        participant?.displayName ||
                        participant?.username ||
                        participantId;
                      return (
                        <ParticipantChip key={participantId}>
                          <div>
                            <strong>{label}</strong>
                            <small>{participant?.role || 'user'}</small>
                          </div>
                          <RemoveButton
                            type="button"
                            onClick={() => handleRemoveParticipant(group.id, participantId)}
                            disabled={updatingGroup === group.id}
                          >
                            <FiUserMinus />
                          </RemoveButton>
                        </ParticipantChip>
                      );
                    })
                  )}
                </ParticipantList>

                <ParticipantForm>
                  <select
                    value={participantSelections[group.id] || ''}
                    onChange={(e) => handleParticipantSelect(group.id, e.target.value)}
                    disabled={usersLoading}
                  >
                    <option value="">Select user…</option>
                    {users.map((user) => (
                      <option key={user.userId} value={user.userId}>
                        {user.name || user.displayName || user.username}
                      </option>
                    ))}
                  </select>
                  <AddButton
                    type="button"
                    onClick={() => handleAddParticipant(group.id)}
                    disabled={updatingGroup === group.id || usersLoading}
                  >
                    <FiUserPlus />
                    Add
                  </AddButton>
                </ParticipantForm>
              </GroupCard>
            );
          })}
        </GroupList>
      )}
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  color: #111827;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const HeaderButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: white;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
`;

const StatCard = styled.div`
  background: #f9fafb;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;

  strong {
    display: block;
    font-size: 1.5rem;
    color: #111827;
  }

  span {
    color: #6b7280;
    font-size: 0.85rem;
  }
`;

const FiltersRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
`;

const FilterGroup = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;

  select {
    border: none;
    outline: none;
    font-size: 0.9rem;
  }
`;

const DirectoryMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #eef2ff;
  color: #4338ca;
  padding: 0.5rem 1rem;
  border-radius: 999px;

  span {
    font-size: 0.85rem;
  }

  strong {
    font-size: 1rem;
  }
`;

const GroupList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
`;

const GroupCard = styled.div`
  background: white;
  border-radius: 16px;
  padding: 1.25rem;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const GroupHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
`;

const GroupInfo = styled.div`
  flex: 1;

  h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #111827;
  }

  p {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.9rem;
  }
`;

const ModeBadge = styled.span`
  align-self: flex-start;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background: ${(props) => props.$color};
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #4b5563;
`;

const DetailLabel = styled.span`
  color: #6b7280;
`;

const DetailValue = styled.span`
  font-weight: 600;
  color: #111827;
`;

const ParticipantList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ParticipantChip = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;

  strong {
    display: block;
    color: #111827;
  }

  small {
    color: #6b7280;
  }
`;

const ParticipantEmpty = styled.div`
  padding: 0.75rem;
  text-align: center;
  color: #9ca3af;
  border: 1px dashed #e5e7eb;
  border-radius: 10px;
  font-size: 0.85rem;
`;

const RemoveButton = styled.button`
  border: none;
  background: none;
  color: #dc2626;
  cursor: pointer;
  display: inline-flex;
  align-items: center;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ParticipantForm = styled.div`
  display: flex;
  gap: 0.5rem;

  select {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0.5rem;
    font-size: 0.9rem;
  }
`;

const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: #2563eb;
  color: white;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  background: white;
  border-radius: 16px;
  padding: 3rem;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #e5e7eb;

  svg {
    margin-bottom: 0.5rem;
  }
`;

export default GroupManagementPanel;

