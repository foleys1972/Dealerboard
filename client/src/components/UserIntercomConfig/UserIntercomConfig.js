import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Select, Input } from '../../styles/GlobalStyle';

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.75rem;
  align-items: center;
`;

const Label = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const Helper = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const SlotsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
`;

const SlotCard = styled.div`
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surfaceElevated};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const SlotTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const Divider = styled.div`
  height: 1px;
  background: ${props => props.theme.colors.border};
  margin: 0.5rem 0;
`;

const ListRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
`;

const TinyButton = styled(Button)`
  padding: 6px 10px;
`;

const UserIntercomConfig = ({ userId, userName, onClose }) => {
  const queryClient = useQueryClient();

  const { data: configData, isLoading: isLoadingConfig } = useQuery(
    ['user-intercom-config', userId],
    async () => {
      const res = await api.get(`/api/user-intercom/config?userId=${encodeURIComponent(userId)}`);
      return res.data;
    },
    { enabled: !!userId }
  );

  const { data: broadcastGroupsData } = useQuery(
    'available-broadcast-groups',
    async () => {
      const res = await api.get('/api/user-intercom/available-broadcast-groups');
      return res.data;
    }
  );

  const { data: groupCallGroupsData } = useQuery(
    'available-group-call-groups',
    async () => {
      const res = await api.get('/api/user-intercom/available-group-call-groups');
      return res.data;
    }
  );

  const broadcastGroups = broadcastGroupsData?.groups || [];
  const groupCallGroups = groupCallGroupsData?.groups || [];

  const initial = useMemo(() => {
    const intercomEnabled = configData?.intercomEnabled !== undefined ? Boolean(configData.intercomEnabled) : true;

    const allowedBroadcastGroups = Array.isArray(configData?.allowedBroadcastGroups)
      ? configData.allowedBroadcastGroups
      : [];

    const broadcastSlots = Array.isArray(configData?.broadcastSlots)
      ? configData.broadcastSlots
      : Array.from({ length: 8 }, (_, i) => ({ index: i + 1, groupId: null, label: null }));

    const groupCallSlots = Array.isArray(configData?.groupCallSlots)
      ? configData.groupCallSlots
      : Array.from({ length: 10 }, (_, i) => ({ index: i + 1, groupId: null, label: null }));

    return { intercomEnabled, allowedBroadcastGroups, broadcastSlots, groupCallSlots };
  }, [configData]);

  const [intercomEnabled, setIntercomEnabled] = useState(true);
  const [allowedBroadcastGroups, setAllowedBroadcastGroups] = useState([]);
  const [broadcastSlots, setBroadcastSlots] = useState([]);
  const [groupCallSlots, setGroupCallSlots] = useState([]);
  const [broadcastSearch, setBroadcastSearch] = useState('');
  const [groupCallSearch, setGroupCallSearch] = useState('');

  React.useEffect(() => {
    setIntercomEnabled(initial.intercomEnabled);
    setAllowedBroadcastGroups(initial.allowedBroadcastGroups);
    setBroadcastSlots(initial.broadcastSlots);
    setGroupCallSlots(initial.groupCallSlots);
  }, [initial]);

  const saveMutation = useMutation(
    async () => {
      const payload = {
        userId,
        intercomEnabled,
        allowedBroadcastGroupIds: allowedBroadcastGroups.map(g => g.id),
        broadcastSlots,
        groupCallSlots,
      };

      const res = await api.put('/api/user-intercom/config', payload);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['user-intercom-config', userId]);
        queryClient.invalidateQueries('users');
        toast.success('Intercom configuration saved');
      },
      onError: (error) => {
        toast.error(error?.response?.data?.error || 'Failed to save intercom configuration');
      }
    }
  );

  const handleSave = async ({ closeOnSuccess }) => {
    const result = await saveMutation.mutateAsync();
    if (closeOnSuccess && result?.success) {
      onClose();
    }
  };

  const setBroadcastSlotGroup = (index, groupId) => {
    setBroadcastSlots(prev => prev.map(s => (s.index === index ? { ...s, groupId: groupId || null } : s)));
  };

  const setGroupCallSlotGroup = (index, groupId) => {
    setGroupCallSlots(prev => prev.map(s => (s.index === index ? { ...s, groupId: groupId || null } : s)));
  };

  const filteredBroadcastGroups = useMemo(() => {
    const q = (broadcastSearch || '').trim().toLowerCase();
    if (!q) return broadcastGroups;
    return broadcastGroups.filter(g => (g.name || '').toLowerCase().includes(q));
  }, [broadcastGroups, broadcastSearch]);

  const filteredGroupCallGroups = useMemo(() => {
    const q = (groupCallSearch || '').trim().toLowerCase();
    if (!q) return groupCallGroups;
    return groupCallGroups.filter(g => (g.name || '').toLowerCase().includes(q));
  }, [groupCallGroups, groupCallSearch]);

  const allowedBroadcastOptions = useMemo(() => {
    if (allowedBroadcastGroups.length > 0) return allowedBroadcastGroups;
    return broadcastGroups;
  }, [allowedBroadcastGroups, broadcastGroups]);

  const addAllowedBroadcast = (groupId) => {
    const id = (groupId || '').trim();
    if (!id) return;
    const group = broadcastGroups.find(g => g.id === id);
    const name = group?.name || id;
    setAllowedBroadcastGroups(prev => {
      if (prev.some(p => p.id === id)) return prev;
      return [...prev, { id, name }];
    });
  };

  const removeAllowedBroadcast = (groupId) => {
    const id = (groupId || '').trim();
    setAllowedBroadcastGroups(prev => prev.filter(g => g.id !== id));

    // Also unassign from slots if it was in use.
    setBroadcastSlots(prev => prev.map(s => (s.groupId === id ? { ...s, groupId: null } : s)));
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Intercom Configuration</h3>
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>{userName}</div>
        </ModalHeader>

        <ModalBody>
          {isLoadingConfig ? (
            <div>Loading...</div>
          ) : (
            <Section>
              <Row>
                <Label>Intercom</Label>
                <Select
                  value={intercomEnabled ? 'enabled' : 'disabled'}
                  onChange={(e) => setIntercomEnabled(e.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </Row>

              <div>
                <Label>Broadcast Buttons (8)</Label>
                <Helper>Add allowed broadcasts (can be unassigned), then map allowed broadcasts onto the 8 device buttons.</Helper>
              </div>

              <Section>
                <Label>Allowed Broadcasts</Label>
                <Input
                  value={broadcastSearch}
                  onChange={(e) => setBroadcastSearch(e.target.value)}
                  placeholder="Search broadcasts..."
                />

                <ListRow>
                  <Select
                    value={''}
                    onChange={(e) => {
                      addAllowedBroadcast(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Add broadcast...</option>
                    {filteredBroadcastGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                  <TinyButton onClick={() => setAllowedBroadcastGroups([])}>
                    Clear
                  </TinyButton>
                </ListRow>

                {allowedBroadcastGroups.length === 0 ? (
                  <Helper>No allowed broadcasts configured. Slots can be assigned from all broadcasts.</Helper>
                ) : (
                  <Section>
                    {allowedBroadcastGroups.map(g => (
                      <ListRow key={g.id}>
                        <div style={{ fontSize: '0.875rem' }}>{g.name}</div>
                        <TinyButton onClick={() => removeAllowedBroadcast(g.id)}>
                          Remove
                        </TinyButton>
                      </ListRow>
                    ))}
                  </Section>
                )}
              </Section>

              <Divider />

              <SlotsGrid>
                {Array.from({ length: 8 }, (_, i) => {
                  const index = i + 1;
                  const slot = broadcastSlots.find(s => s.index === index) || { index, groupId: null };
                  return (
                    <SlotCard key={`broadcast-${index}`}>
                      <SlotTitle>Broadcast {index}</SlotTitle>
                      <Select
                        value={slot.groupId || ''}
                        onChange={(e) => setBroadcastSlotGroup(index, e.target.value)}
                      >
                        <option value="">(Unassigned)</option>
                        {allowedBroadcastOptions.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </Select>
                    </SlotCard>
                  );
                })}
              </SlotsGrid>

              <div style={{ marginTop: '0.75rem' }}>
                <Label>Group Call Buttons (10)</Label>
                <Helper>Search and assign which groups appear on the 10 buttons. Unassigned buttons stay empty.</Helper>
              </div>

              <Input
                value={groupCallSearch}
                onChange={(e) => setGroupCallSearch(e.target.value)}
                placeholder="Search group calls..."
              />

              <SlotsGrid>
                {Array.from({ length: 10 }, (_, i) => {
                  const index = i + 1;
                  const slot = groupCallSlots.find(s => s.index === index) || { index, groupId: null };
                  return (
                    <SlotCard key={`groupcall-${index}`}>
                      <SlotTitle>Group Call {index}</SlotTitle>
                      <Select
                        value={slot.groupId || ''}
                        onChange={(e) => setGroupCallSlotGroup(index, e.target.value)}
                      >
                        <option value="">(Unassigned)</option>
                        {filteredGroupCallGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </Select>
                    </SlotCard>
                  );
                })}
              </SlotsGrid>
            </Section>
          )}
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} disabled={saveMutation.isLoading}>Cancel</Button>
          <Button onClick={() => handleSave({ closeOnSuccess: false })} disabled={saveMutation.isLoading}>
            Save
          </Button>
          <Button onClick={() => handleSave({ closeOnSuccess: true })} disabled={saveMutation.isLoading}>
            Save & Exit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UserIntercomConfig;
