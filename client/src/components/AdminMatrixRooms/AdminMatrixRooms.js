import React, { useState } from 'react';
import styled from 'styled-components';
import { FiPlus, FiEdit, FiTrash2, FiX, FiCheck, FiMessageCircle, FiGlobe, FiUsers, FiServer } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Badge
} from '../../styles/GlobalStyle';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow: hidden;
`;

const TableHeader = styled.thead`
  background: ${props => props.theme.colors.background};
`;

const TableHeaderCell = styled.th`
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const TableRow = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  
  &:hover {
    background: ${props => props.theme.colors.background};
  }
`;

const TableCell = styled.td`
  padding: 1rem;
  color: ${props => props.theme.colors.text};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
`;

const RoomIdCell = styled.div`
  font-family: monospace;
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  word-break: break-all;
`;

const AdminMatrixRooms = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [formData, setFormData] = useState({
    groupId: '',
    groupName: '',
    groupDescription: '',
    participantIds: [],
    homeserverId: ''
  });

  const queryClient = useQueryClient();

  // Fetch Matrix rooms
  const { data: roomsData, isLoading } = useQuery(
    'matrix-rooms',
    async () => {
      const response = await api.get('/api/matrix/rooms');
      return response.data;
    }
  );

  // Fetch homeservers for selection
  const { data: homeserversData } = useQuery(
    'matrix-homeservers',
    async () => {
      const response = await api.get('/api/matrix/homeservers');
      return response.data;
    }
  );

  // Fetch groups for selection
  const { data: groupsData } = useQuery(
    'groups',
    async () => {
      const response = await api.get('/api/groups');
      return response.data;
    }
  );

  // Fetch users for participant selection
  const { data: usersData } = useQuery(
    'users',
    async () => {
      const response = await api.get('/api/auth/users');
      return response.data;
    }
  );

  // Fetch room assignments
  const { data: assignmentsData } = useQuery(
    'matrix-room-assignments',
    async () => {
      // We'll need to create an endpoint for this or fetch from rooms
      return { assignments: [] };
    }
  );

  // Create room mutation
  const createRoomMutation = useMutation(
    async (data) => {
      const response = await api.post('/api/matrix/orchestrator/rooms/create', {
        groupId: data.groupId || `group_${Date.now()}`,
        groupData: {
          name: data.groupName,
          description: data.groupDescription,
          members: data.participantIds
        },
        participantIds: data.participantIds,
        homeserverId: data.homeserverId || undefined
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('matrix-rooms');
        toast.success('Matrix room created successfully');
        setShowCreateModal(false);
        resetForm();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create room');
      }
    }
  );

  // Fetch room participants
  const { data: participantsData, refetch: refetchParticipants } = useQuery(
    ['room-participants', selectedRoom?.roomId],
    async () => {
      if (!selectedRoom?.roomId) return null;
      // We'll need to create an endpoint for this
      const response = await api.get(`/api/matrix/room/${selectedRoom.roomId}/members`);
      return response.data;
    },
    {
      enabled: !!selectedRoom?.roomId && showParticipantsModal
    }
  );

  const resetForm = () => {
    setFormData({
      groupId: '',
      groupName: '',
      groupDescription: '',
      participantIds: [],
      homeserverId: ''
    });
  };

  const handleCreateRoom = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleViewParticipants = (room) => {
    setSelectedRoom(room);
    setShowParticipantsModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createRoomMutation.mutate(formData);
  };

  const rooms = roomsData?.rooms || [];
  const homeservers = homeserversData?.homeservers || [];
  const groups = groupsData?.groups || [];
  const users = usersData?.users || [];

  return (
    <Container>
      <Header>
        <Title>
          <FiMessageCircle style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Matrix Rooms
        </Title>
        <Button variant="primary" onClick={handleCreateRoom}>
          <FiPlus style={{ marginRight: '0.25rem' }} />
          Create Room
        </Button>
      </Header>

      <Card>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            No Matrix rooms found. Click "Create Room" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHeaderCell>Room ID</TableHeaderCell>
                <TableHeaderCell>Group</TableHeaderCell>
                <TableHeaderCell>Homeserver</TableHeaderCell>
                <TableHeaderCell>Region</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHeader>
            <tbody>
              {rooms.map((room) => (
                <TableRow key={room.roomId}>
                  <TableCell>
                    <RoomIdCell>{room.roomId}</RoomIdCell>
                    <div style={{ marginTop: '0.25rem' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`https://matrix.to/#/${room.roomId}`, '_blank')}
                      >
                        <FiGlobe style={{ marginRight: '0.25rem' }} />
                        Open in Matrix
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {room.groupId ? (
                      <div>
                        <strong>{room.groupId}</strong>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>No group</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {room.assignment?.homeserverName ? (
                      <div>
                        <FiServer style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                        {room.assignment.homeserverName}
                      </div>
                    ) : (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {room.assignment?.region ? (
                      <Badge variant="info">{room.assignment.region}</Badge>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Unknown</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ActionButtons>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewParticipants(room)}
                      >
                        <FiUsers />
                      </Button>
                    </ActionButtons>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Create Room Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalContent>
          <ModalHeader>Create Matrix Room</ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <FormGroup>
                <Label>Group (Optional)</Label>
                <Select
                  value={formData.groupId}
                  onChange={(e) => {
                    const selectedGroup = groups.find(g => g.id === e.target.value);
                    setFormData({
                      ...formData,
                      groupId: e.target.value,
                      groupName: selectedGroup?.name || '',
                      groupDescription: selectedGroup?.description || ''
                    });
                  }}
                >
                  <option value="">Create New Group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Group Name *</Label>
                <Input
                  type="text"
                  value={formData.groupName}
                  onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                  placeholder="e.g., Trading Floor A"
                  required
                />
              </FormGroup>

              <FormGroup>
                <Label>Description</Label>
                <Input
                  type="text"
                  value={formData.groupDescription}
                  onChange={(e) => setFormData({ ...formData, groupDescription: e.target.value })}
                  placeholder="Room description"
                />
              </FormGroup>

              <FormGroup>
                <Label>Homeserver (Optional - uses orchestrator if not specified)</Label>
                <Select
                  value={formData.homeserverId}
                  onChange={(e) => setFormData({ ...formData, homeserverId: e.target.value })}
                >
                  <option value="">Auto-select (Orchestrator)</option>
                  {homeservers
                    .filter(hs => hs.isActive)
                    .map((homeserver) => (
                      <option key={homeserver.id} value={homeserver.id}>
                        {homeserver.serverName} ({homeserver.region})
                      </option>
                    ))}
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Initial Participants</Label>
                <Select
                  multiple
                  value={formData.participantIds}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFormData({ ...formData, participantIds: selected });
                  }}
                  style={{ minHeight: '150px' }}
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName || user.username} ({user.username})
                    </option>
                  ))}
                </Select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Hold Ctrl/Cmd to select multiple participants
                </div>
              </FormGroup>
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
              >
                <FiX style={{ marginRight: '0.25rem' }} />
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={createRoomMutation.isLoading}
              >
                <FiCheck style={{ marginRight: '0.25rem' }} />
                Create Room
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Participants Modal */}
      <Modal isOpen={showParticipantsModal} onClose={() => setShowParticipantsModal(false)}>
        <ModalContent>
          <ModalHeader>
            Room Participants - {selectedRoom?.roomId?.substring(0, 20)}...
          </ModalHeader>
          <ModalBody>
            {participantsData ? (
              <div>
                <p>Participants: {participantsData.members?.length || 0}</p>
                {/* Display participants list */}
              </div>
            ) : (
              <div>Loading participants...</div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setShowParticipantsModal(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default AdminMatrixRooms;

