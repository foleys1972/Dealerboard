import React from 'react';
import styled from 'styled-components';
import { 
  FiMessageSquare, 
  FiUsers,
  FiRefreshCw,
  FiPlus,
  FiCheck,
  FiX,
  FiServer,
  FiActivity,
  FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Section = styled.section`
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  color: #1f2937;
  margin-bottom: 1.5rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: ${props => props.$connected ? '#f0fdf4' : '#fef2f2'};
  border: 2px solid ${props => props.$connected ? '#10b981' : '#ef4444'};
  border-radius: 12px;
  margin-bottom: 1.5rem;
`;

const StatusIndicator = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$connected ? '#10b981' : '#ef4444'};
`;

const StatusText = styled.div`
  flex: 1;
  color: #1f2937;
  font-weight: 500;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: ${props => props.primary ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6'};
  color: ${props => props.primary ? 'white' : '#1f2937'};
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    font-size: 1rem;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  
  thead th {
    text-align: left;
    color: #6b7280;
    font-weight: 600;
    padding: 12px;
    border-bottom: 2px solid #e5e7eb;
  }
  
  tbody td {
    padding: 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #1f2937;
  }
  
  tbody tr:hover {
    background: #f9fafb;
  }
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${props => {
    if (props.variant === 'success') return '#d1fae5';
    if (props.variant === 'warning') return '#fef3c7';
    if (props.variant === 'error') return '#fee2e2';
    return '#e0e7ff';
  }};
  color: ${props => {
    if (props.variant === 'success') return '#065f46';
    if (props.variant === 'warning') return '#92400e';
    if (props.variant === 'error') return '#991b1b';
    return '#3730a3';
  }};
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const InfoItem = styled.div`
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
`;

const InfoLabel = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
`;

const InfoValue = styled.div`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: #9ca3af;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  color: #667eea;
`;

const MatrixManagementPanel = () => {
  const queryClient = useQueryClient();

  // Fetch Matrix status
  const { data: matrixStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery(
    'matrix-status',
    async () => {
      const response = await api.get('/api/matrix/status');
      return response.data;
    },
    { refetchInterval: 30000 }
  );

  // Fetch Matrix rooms
  const { data: matrixRooms, isLoading: roomsLoading, refetch: refetchRooms } = useQuery(
    'matrix-rooms',
    async () => {
      const response = await api.get('/api/matrix/rooms');
      return response.data?.rooms || [];
    },
    { refetchInterval: 30000 }
  );

  // Fetch groups
  const { data: groupsData, isLoading: groupsLoading } = useQuery(
    'groups-for-matrix',
    async () => {
      const response = await api.get('/api/groups');
      return response.data?.groups || [];
    }
  );

  // Fetch federation info
  const { data: federationInfo } = useQuery(
    'matrix-federation',
    async () => {
      const response = await api.get('/api/matrix/federation');
      return response.data;
    },
    { refetchInterval: 60000 }
  );

  // Test Matrix connection mutation
  const testConnectionMutation = useMutation(
    async () => {
      const response = await api.post('/api/matrix/test');
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Matrix connection test successful');
        refetchStatus();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Matrix connection test failed');
      }
    }
  );

  // Create Matrix room for group mutation
  const createRoomMutation = useMutation(
    async ({ groupId, groupData }) => {
      const response = await api.post('/api/matrix/room', {
        groupId,
        groupData
      });
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Matrix room created successfully');
        refetchRooms();
        queryClient.invalidateQueries('groups-for-matrix');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create Matrix room');
      }
    }
  );

  // Sync group with Matrix mutation
  const syncGroupMutation = useMutation(
    async (groupId) => {
      const response = await api.post(`/api/matrix/group/${groupId}/sync`);
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Group synced with Matrix successfully');
        refetchRooms();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to sync group');
      }
    }
  );

  const handleCreateRoomForGroup = async (group) => {
    createRoomMutation.mutate({
      groupId: group.id,
      groupData: {
        name: group.name,
        description: group.description || '',
        members: group.participants || []
      }
    });
  };

  const handleSyncGroup = (groupId) => {
    syncGroupMutation.mutate(groupId);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleRefresh = () => {
    refetchStatus();
    refetchRooms();
    queryClient.invalidateQueries('matrix-federation');
    toast.success('Matrix data refreshed');
  };

  // Get room ID for a group
  const getGroupRoomId = (groupId) => {
    const room = matrixRooms?.find(r => r.groupId === groupId);
    return room?.roomId || null;
  };

  // Check if group has Matrix room
  const hasMatrixRoom = (groupId) => {
    return !!getGroupRoomId(groupId);
  };

  if (statusLoading || roomsLoading || groupsLoading) {
    return (
      <Container>
        <LoadingSpinner>
          <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '0.5rem' }}>Loading Matrix configuration...</span>
        </LoadingSpinner>
      </Container>
    );
  }

  const isConnected = matrixStatus?.isConnected;
  const isInitialized = matrixStatus?.isInitialized;

  return (
    <Container>
      {/* Status Section */}
      <Section>
        <SectionTitle>
          <FiServer />
          Service Status
        </SectionTitle>
        
        <StatusCard $connected={isConnected && isInitialized}>
          <StatusIndicator $connected={isConnected && isInitialized} />
          <StatusText>
            {isInitialized && isConnected 
              ? 'Matrix service is connected and operational' 
              : isInitialized 
                ? 'Matrix service initialized but not connected' 
                : 'Matrix service is not initialized'}
          </StatusText>
        </StatusCard>

        <InfoGrid>
          <InfoItem>
            <InfoLabel>Server URL</InfoLabel>
            <InfoValue>{matrixStatus?.config?.baseUrl || 'Not configured'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Server Name</InfoLabel>
            <InfoValue>{matrixStatus?.config?.serverName || 'Not configured'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Federation</InfoLabel>
            <InfoValue>
              {matrixStatus?.config?.federationEnabled ? (
                <Badge variant="success">Enabled</Badge>
              ) : (
                <Badge variant="warning">Disabled</Badge>
              )}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Rooms</InfoLabel>
            <InfoValue>{matrixStatus?.roomCount || 0}</InfoValue>
          </InfoItem>
        </InfoGrid>

        <ActionBar>
          <ActionButton primary onClick={handleTestConnection} disabled={testConnectionMutation.isLoading}>
            <FiActivity />
            Test Connection
          </ActionButton>
          <ActionButton onClick={handleRefresh}>
            <FiRefreshCw />
            Refresh
          </ActionButton>
        </ActionBar>
      </Section>

      {/* Federation Section */}
      {federationInfo && (
        <Section>
          <SectionTitle>
            <FiServer />
            Federation
          </SectionTitle>
          
          {federationInfo.federationServers && federationInfo.federationServers.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <th>Server URL</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {federationInfo.federationServers.map((server, idx) => (
                  <tr key={idx}>
                    <td>{server.url}</td>
                    <td>
                      {server.connected ? (
                        <Badge variant="success">Connected</Badge>
                      ) : (
                        <Badge variant="error">Disconnected</Badge>
                      )}
                    </td>
                    <td>{server.lastSeen ? new Date(server.lastSeen).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>
              <FiAlertCircle style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }} />
              <div>No federation servers configured</div>
            </EmptyState>
          )}
        </Section>
      )}

      {/* Matrix Rooms Section */}
      <Section>
        <SectionTitle>
          <FiMessageSquare />
          Matrix Rooms
        </SectionTitle>

        {matrixRooms && matrixRooms.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Room ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {matrixRooms.map((room) => (
                <tr key={room.roomId}>
                  <td>{room.groupId}</td>
                  <td>
                    <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                      {room.roomId}
                    </code>
                  </td>
                  <td>
                    <ActionButton onClick={() => handleSyncGroup(room.groupId)}>
                      <FiRefreshCw />
                      Sync
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>
            <FiMessageSquare style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }} />
            <div>No Matrix rooms created yet</div>
          </EmptyState>
        )}
      </Section>

      {/* All Groups with Matrix Status */}
      <Section>
        <SectionTitle>
          <FiUsers />
          Groups & Matrix Rooms
        </SectionTitle>

        {groupsData && groupsData.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Participants</th>
                <th>Matrix Room</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupsData.map((group) => {
                const hasRoom = hasMatrixRoom(group.id);
                const roomId = getGroupRoomId(group.id);
                
                return (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td>{Array.isArray(group.participants) ? group.participants.length : (group.participantCount || 0)}</td>
                    <td>
                      {hasRoom ? (
                        <Badge variant="success">
                          <FiCheck style={{ marginRight: '0.25rem' }} />
                          Linked
                        </Badge>
                      ) : (
                        <Badge variant="error">
                          <FiX style={{ marginRight: '0.25rem' }} />
                          Not Linked
                        </Badge>
                      )}
                    </td>
                    <td>
                      {hasRoom ? (
                        <ActionButton onClick={() => handleSyncGroup(group.id)}>
                          <FiRefreshCw />
                          Sync
                        </ActionButton>
                      ) : (
                        <ActionButton 
                          primary 
                          onClick={() => handleCreateRoomForGroup(group)}
                          disabled={createRoomMutation.isLoading}
                        >
                          <FiPlus />
                          Create Room
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>
            <FiUsers style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }} />
            <div>No groups available</div>
          </EmptyState>
        )}
      </Section>
    </Container>
  );
};

export default MatrixManagementPanel;
