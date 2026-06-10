import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FiRadio, FiRefreshCw, FiSettings, FiUsers, FiMic, FiPlus, FiActivity, FiUserPlus, FiUserMinus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const DEFAULT_CONFIG = {
  maxListeners: 100,
  maxSpeakers: 100,
  persistentListen: false,
  defaultPushToTalk: true,
  allowLatch: false,
};

const BroadcastManagementPanel = () => {
  const [broadcasts, setBroadcasts] = useState([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    sipUri: '',
    maxListeners: DEFAULT_CONFIG.maxListeners,
    maxSpeakers: DEFAULT_CONFIG.maxSpeakers,
    persistentListen: false,
    allowLatch: false,
  });
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [participantSelections, setParticipantSelections] = useState({});
  const [updatingParticipants, setUpdatingParticipants] = useState(null);

  const activeBroadcasts = useMemo(
    () => broadcasts.filter((b) => b.hoot?.state?.isActive),
    [broadcasts]
  );

  useEffect(() => {
    fetchBroadcasts();
    fetchUsers();
  }, []);

  const userLookup = useMemo(() => {
    const map = new Map();
    users.forEach((user) => {
      map.set(user.userId, user);
    });
    return map;
  }, [users]);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await api.get('/api/auth/users');
      setUsers(response.data?.users || []);
    } catch (error) {
      console.error('Failed to load users directory', error);
      toast.error(error.response?.data?.error || 'Failed to load user directory');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchBroadcasts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/groups', {
        params: { callMode: 'broadcast' },
      });
      const groups = (response.data?.groups || []).map((group) => ({
        ...group,
        participants: Array.isArray(group.participants) ? group.participants : [],
      }));
      setBroadcasts(groups);
    } catch (error) {
      console.error('Broadcast fetch failed', error);
      toast.error(error.message || 'Failed to load broadcasts');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async (groupId) => {
    try {
      const response = await api.get(`/api/groups/${groupId}/hoot/status`);
      setBroadcasts((prev) =>
        prev.map((group) =>
          group.id === groupId ? { ...group, hoot: response.data?.hoot } : group
        )
      );
      toast.success('Status updated');
    } catch (error) {
      console.error('Failed to fetch hoot status', error);
      toast.error(error.message || 'Failed to fetch status');
    }
  };

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast.error('Broadcast name is required');
      return;
    }

    try {
      setCreating(true);

      const sipUri = (createForm.sipUri || '').trim();
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        callMode: 'broadcast',
        sipEnabled: Boolean(sipUri),
        sipNumbers: sipUri ? [sipUri] : [],
        hootConfig: {
          maxListeners: Number(createForm.maxListeners) || DEFAULT_CONFIG.maxListeners,
          maxSpeakers: Number(createForm.maxSpeakers) || DEFAULT_CONFIG.maxSpeakers,
          persistentListen: createForm.persistentListen,
          defaultPushToTalk: true,
          allowLatch: createForm.allowLatch,
        },
        createdBy: 'admin-ui',
      };

      await api.post('/api/groups', payload);
      toast.success('Broadcast channel created');
      setCreateForm({
        name: '',
        description: '',
        sipUri: '',
        maxListeners: DEFAULT_CONFIG.maxListeners,
        maxSpeakers: DEFAULT_CONFIG.maxSpeakers,
        persistentListen: false,
        allowLatch: false,
      });
      fetchBroadcasts();
    } catch (error) {
      console.error('Create broadcast failed', error);
      toast.error(error.message || 'Failed to create broadcast');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveConfig = async (broadcast) => {
    try {
      await api.put(`/api/groups/${broadcast.id}`, {
        callMode: 'broadcast',
        sipEnabled: Boolean((broadcast.sipNumbers || [])[0]),
        sipNumbers: Array.isArray(broadcast.sipNumbers) ? broadcast.sipNumbers : [],
        hootConfig: broadcast.hootConfig,
      });
      toast.success('Broadcast configuration updated');
      fetchBroadcasts();
    } catch (error) {
      console.error('Failed to save broadcast config', error);
      toast.error(error.message || 'Failed to save configuration');
    }
  };

  const updateBroadcastConfig = (broadcastId, updates) => {
    setBroadcasts((prev) =>
      prev.map((group) =>
        group.id === broadcastId
          ? {
              ...group,
              hootConfig: {
                ...DEFAULT_CONFIG,
                ...group.hootConfig,
                ...updates,
              },
            }
          : group
      )
    );
  };

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
      setUpdatingParticipants(groupId);
      await api.post(`/api/groups/${groupId}/participants`, { userId });
      toast.success('User added to hoot');
      await fetchBroadcasts();
      setParticipantSelections((prev) => ({ ...prev, [groupId]: '' }));
    } catch (error) {
      console.error('Failed to add participant', error);
      toast.error(error.response?.data?.error || 'Failed to add participant');
    } finally {
      setUpdatingParticipants(null);
    }
  };

  const handleRemoveParticipant = async (groupId, userId) => {
    try {
      setUpdatingParticipants(groupId);
      await api.delete(`/api/groups/${groupId}/participants/${userId}`);
      toast.success('User removed from hoot');
      await fetchBroadcasts();
    } catch (error) {
      console.error('Failed to remove participant', error);
      toast.error(error.response?.data?.error || 'Failed to remove participant');
    } finally {
      setUpdatingParticipants(null);
    }
  };

  return (
    <Container>
      <Header>
        <TitleRow>
          <Title>
            <FiRadio />
            Broadcast Management
          </Title>
          <RefreshButton onClick={fetchBroadcasts} disabled={loading}>
            <FiRefreshCw />
            Refresh
          </RefreshButton>
        </TitleRow>
        <StatsRow>
          <StatCard>
            <FiRadio />
            <div>
              <strong>{broadcasts.length}</strong>
              <span>Total Broadcasts</span>
            </div>
          </StatCard>
          <StatCard>
            <FiActivity />
            <div>
              <strong>{activeBroadcasts.length}</strong>
              <span>On Air</span>
            </div>
          </StatCard>
        </StatsRow>
      </Header>

      <Content>
        <BroadcastList>
          {broadcasts.length === 0 && (
            <EmptyState>No broadcast channels configured yet.</EmptyState>
          )}
          {broadcasts.map((broadcast) => {
            const hootConfig = { ...DEFAULT_CONFIG, ...(broadcast.hootConfig || {}) };
            const hootState = broadcast.hoot?.state;
            const sipUri = Array.isArray(broadcast.sipNumbers) && broadcast.sipNumbers.length > 0 ? broadcast.sipNumbers[0] : '';
            const aor = String(broadcast?.metadata?.aor || `BCAST:${broadcast.id}`);
            return (
              <BroadcastItem
                key={broadcast.id}
                $active={hootState?.isActive}
                onClick={() => setSelectedBroadcast(broadcast.id)}
              >
                <BroadcastHeader>
                  <BroadcastName>
                    <strong>{broadcast.name}</strong>
                    <span style={{ fontFamily: 'monospace' }}>{`AOR: ${aor}`}</span>
                    <span>{broadcast.description || 'No description provided'}</span>
                  </BroadcastName>
                  <Badge $active={hootState?.isActive}>
                    {hootState?.isActive ? 'ON AIR' : 'IDLE'}
                  </Badge>
                </BroadcastHeader>

                <BroadcastMeta>
                  <MetaItem>
                    <FiUsers />
                    <span>
                      {hootState?.listenerCount || 0}/{hootConfig.maxListeners} listeners
                    </span>
                  </MetaItem>
                  <MetaItem>
                    <FiMic />
                    <span>
                      {hootState?.activeSpeakers?.length || 0}/{hootConfig.maxSpeakers} speakers
                    </span>
                  </MetaItem>
                  <MetaItem title="Persistent monitor channels">
                    <FiSettings />
                    <span>
                      {hootState?.persistentListenerCount || 0} persistent monitors
                    </span>
                  </MetaItem>
                  <MetaItem title="Broadcast SIP URI">
                    <span>
                      {sipUri ? `SIP: ${sipUri}` : 'SIP: (none)'}
                    </span>
                  </MetaItem>
                </BroadcastMeta>

                <BroadcastActions>
                  <ActionButton onClick={(e) => {
                    e.stopPropagation();
                    fetchStatus(broadcast.id);
                  }}>
                    Refresh status
                  </ActionButton>
                  <ActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveConfig(broadcast);
                    }}
                  >
                    Save config
                  </ActionButton>
                </BroadcastActions>

                <ParticipantManager>
                  <ParticipantHeader>
                    <span>Assigned Participants</span>
                    <small>{broadcast.participants?.length || 0}</small>
                  </ParticipantHeader>
                  <ParticipantList>
                    {(broadcast.participants || []).length === 0 ? (
                      <ParticipantEmpty>No users assigned yet</ParticipantEmpty>
                    ) : (
                      broadcast.participants.map((participantId) => {
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
                            <RemoveParticipantButton
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveParticipant(broadcast.id, participantId);
                              }}
                              disabled={updatingParticipants === broadcast.id}
                              title="Remove user"
                            >
                              <FiUserMinus />
                            </RemoveParticipantButton>
                          </ParticipantChip>
                        );
                      })
                    )}
                  </ParticipantList>
                  <ParticipantAddRow>
                    <ParticipantSelect
                      value={participantSelections[broadcast.id] || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleParticipantSelect(broadcast.id, e.target.value);
                      }}
                      disabled={usersLoading}
                    >
                      <option value="">Select user…</option>
                      {users.map((user) => (
                        <option key={user.userId} value={user.userId}>
                          {user.name || user.displayName || user.username}
                        </option>
                      ))}
                    </ParticipantSelect>
                    <AddParticipantButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddParticipant(broadcast.id);
                      }}
                      disabled={updatingParticipants === broadcast.id || usersLoading}
                    >
                      <FiUserPlus />
                      Add
                    </AddParticipantButton>
                  </ParticipantAddRow>
                </ParticipantManager>

                {selectedBroadcast === broadcast.id && (
                  <BroadcastDetails>
                    <DetailGroup>
                      <label>Internal AOR (for button assignment)</label>
                      <input type="text" value={aor} readOnly />
                    </DetailGroup>
                    <DetailGroup>
                      <label>Broadcast SIP URI</label>
                      <input
                        type="text"
                        value={sipUri}
                        placeholder="sip:hoot@domain"
                        onChange={(e) => {
                          const next = (e.target.value || '').trim();
                          updateBroadcastConfig(broadcast.id, {
                            sipNumbers: next ? [next] : [],
                          });
                        }}
                      />
                    </DetailGroup>
                    <DetailGroup>
                      <label>Max Listeners</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={hootConfig.maxListeners}
                        onChange={(e) =>
                          updateBroadcastConfig(broadcast.id, {
                            maxListeners: parseInt(e.target.value, 10) || DEFAULT_CONFIG.maxListeners,
                          })
                        }
                      />
                    </DetailGroup>
                    <DetailGroup>
                      <label>Max Speakers</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={hootConfig.maxSpeakers}
                        onChange={(e) =>
                          updateBroadcastConfig(broadcast.id, {
                            maxSpeakers: parseInt(e.target.value, 10) || DEFAULT_CONFIG.maxSpeakers,
                          })
                        }
                      />
                    </DetailGroup>
                    <DetailGroup>
                      <label>
                        <input
                          type="checkbox"
                          checked={hootConfig.persistentListen}
                          onChange={(e) =>
                            updateBroadcastConfig(broadcast.id, { persistentListen: e.target.checked })
                          }
                        />
                        Allow persistent monitors
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={hootConfig.allowLatch}
                          onChange={(e) =>
                            updateBroadcastConfig(broadcast.id, { allowLatch: e.target.checked })
                          }
                        />
                        Allow latch (toggle-to-talk)
                      </label>
                    </DetailGroup>
                  </BroadcastDetails>
                )}
              </BroadcastItem>
            );
          })}
        </BroadcastList>

        <CreatePanel onSubmit={handleCreateBroadcast}>
          <PanelHeader>
            <FiPlus />
            Create Broadcast Channel
          </PanelHeader>

          <FormGroup>
            <label>Channel Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. FX Desk Hoot"
              required
            />
          </FormGroup>

          <FormGroup>
            <label>Description</label>
            <textarea
              rows="3"
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
            />
          </FormGroup>

          <FormGroup>
            <label>Broadcast SIP URI</label>
            <input
              type="text"
              value={createForm.sipUri}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, sipUri: e.target.value }))}
              placeholder="sip:hoot@domain"
            />
          </FormGroup>

          <FormRow>
            <FormGroup>
              <label>Max Listeners</label>
              <input
                type="number"
                min="1"
                max="500"
                value={createForm.maxListeners}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, maxListeners: e.target.value }))}
              />
            </FormGroup>
            <FormGroup>
              <label>Max Speakers</label>
              <input
                type="number"
                min="1"
                max="500"
                value={createForm.maxSpeakers}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, maxSpeakers: e.target.value }))}
              />
            </FormGroup>
          </FormRow>

          <FormGroup $checkbox>
            <label>
              <input
                type="checkbox"
                checked={createForm.persistentListen}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, persistentListen: e.target.checked }))
                }
              />
              Allow persistent monitor channels
            </label>
          </FormGroup>

          <FormGroup $checkbox>
            <label>
              <input
                type="checkbox"
                checked={createForm.allowLatch}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, allowLatch: e.target.checked }))
                }
              />
              Allow latch (toggle-to-talk)
            </label>
          </FormGroup>

          <SubmitButton type="submit" disabled={creating}>
            <FiPlus />
            {creating ? 'Creating...' : 'Create Broadcast'}
          </SubmitButton>
        </CreatePanel>
      </Content>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.div`
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  color: #1f2937;
  svg {
    color: #f59e0b;
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  cursor: pointer;
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
`;

const StatsRow = styled.div`
  display: flex;
  gap: 1rem;
`;

const StatCard = styled.div`
  flex: 1;
  background: #f9fafb;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  svg {
    font-size: 1.5rem;
    color: #f59e0b;
  }
  strong {
    font-size: 1.5rem;
    display: block;
    color: #111827;
  }
  span {
    color: #6b7280;
    font-size: 0.875rem;
  }
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  align-items: start;
`;

const BroadcastList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const BroadcastItem = styled.div`
  background: white;
  border-radius: 16px;
  padding: 1.25rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 2px solid ${({ $active }) => ($active ? '#f59e0b55' : 'transparent')};
  cursor: pointer;
`;

const BroadcastHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
`;

const BroadcastName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  strong {
    font-size: 1.1rem;
    color: #1f2937;
  }
  span {
    color: #6b7280;
    font-size: 0.875rem;
  }
`;

const Badge = styled.span`
  background: ${({ $active }) => ($active ? '#f59e0b' : '#e5e7eb')};
  color: ${({ $active }) => ($active ? 'white' : '#374151')};
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
`;

const BroadcastMeta = styled.div`
  display: flex;
  gap: 1.5rem;
  color: #4b5563;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

const BroadcastActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const ActionButton = styled.button`
  padding: 0.4rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  cursor: pointer;
`;

const BroadcastDetails = styled.div`
  border-top: 1px dashed #e5e7eb;
  padding-top: 1rem;
  margin-top: 0.5rem;
  display: grid;
  gap: 1rem;
`;

const DetailGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  label {
    font-size: 0.85rem;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  input[type='number'],
  input[type='text'] {
    width: 200px;
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
  }
`;

const CreatePanel = styled.form`
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const PanelHeader = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  color: #1f2937;
  svg {
    color: #10b981;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  label {
    font-size: 0.9rem;
    color: #374151;
    font-weight: 500;
  }
  input,
  textarea {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    font-size: 0.95rem;
  }
  ${({ $checkbox }) =>
    $checkbox &&
    `
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    label {
      font-weight: 400;
    }
  `}
`;

const FormRow = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const SubmitButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #10b981;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
`;

const EmptyState = styled.div`
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
`;

const ParticipantManager = styled.div`
  border-top: 1px dashed #e5e7eb;
  margin-top: 1rem;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ParticipantHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
  color: #4b5563;

  small {
    color: #9ca3af;
  }
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
  border-radius: 8px;
  background: #f9fafb;

  strong {
    display: block;
    color: #1f2937;
  }

  small {
    color: #6b7280;
  }
`;

const ParticipantEmpty = styled.div`
  padding: 0.75rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.85rem;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
`;

const RemoveParticipantButton = styled.button`
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;

  &:disabled {
    color: #fca5a5;
    cursor: not-allowed;
  }
`;

const ParticipantAddRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ParticipantSelect = styled.select`
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  color: #1f2937;
`;

const AddParticipantButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: none;
  background: #3b82f6;
  color: white;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export default BroadcastManagementPanel;

