import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiServer, 
  FiGlobe, 
  FiUsers, 
  FiMessageCircle,
  FiShield,
  FiRefreshCw,
  FiPlus,
  FiSettings,
  FiActivity,
  FiWifi,
  FiWifiOff,
  FiCheckCircle,
  FiAlertCircle,
  FiTrendingUp,
  FiTrendingDown,
  FiX
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuthStore } from '../../stores/authStore';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Flex, 
  Grid, 
  Spacer,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  LoadingSpinner
} from '../../styles/GlobalStyle';
import MatrixStatus from '../../components/MatrixStatus/MatrixStatus';
import FederationManagement from '../../components/FederationManagement/FederationManagement';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, formatDistanceToNow } from 'date-fns';

const FederationContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
  height: 100%;
`;

const FederationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const FederationTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const FederationActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const StatsGrid = styled(Grid)`
  margin-bottom: ${props => props.theme.spacing.xl};
`;

const StatCard = styled(Card)`
  text-align: center;
  padding: ${props => props.theme.spacing.lg};
  background: ${props => props.variant === 'primary' ? props.theme.colors.primary : props.theme.colors.surface};
  color: ${props => props.variant === 'primary' ? 'white' : props.theme.colors.text};
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg};
  }
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatIcon = styled.div`
  font-size: 2rem;
  margin-bottom: ${props => props.theme.spacing.sm};
  opacity: 0.8;
`;

const StatTrend = styled.div`
  font-size: 0.75rem;
  margin-top: ${props => props.theme.spacing.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ContentGrid = styled(Grid)`
  flex: 1;
  gap: ${props => props.theme.spacing.lg};
`;

const ServersSection = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const SectionActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const ServersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
`;

const ServerCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const ServerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const ServerName = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const ServerStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const ServerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const ServerDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const ServerDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const ServerActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const ServerActionButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const RoomsSection = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
`;

const RoomItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const RoomInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const RoomName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.875rem;
`;

const RoomStatus = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
`;

const RoomActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
`;

const RoomActionButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.xl};
  color: ${props => props.theme.colors.textSecondary};
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: ${props => props.theme.spacing.md};
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 0.875rem;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  font-size: 0.75rem;
  opacity: 0.7;
`;

const Federation = () => {
  const [activeTab, setActiveTab] = useState('matrix');
  const [showAddServer, setShowAddServer] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Fetch Matrix status
  const { data: matrixStatus, isLoading: matrixLoading } = useQuery(
    'matrix-status',
    async () => {
      const response = await axios.get('/api/matrix/status');
      return response.data;
    }
  );

  // Fetch federation info
  const { data: federationInfo } = useQuery(
    'matrix-federation',
    async () => {
      const response = await axios.get('/api/matrix/federation');
      return response.data;
    }
  );

  // Fetch Matrix rooms
  const { data: matrixRooms, isLoading: roomsLoading } = useQuery(
    'matrix-rooms',
    async () => {
      const response = await axios.get('/api/matrix/rooms');
      return response.data;
    }
  );

  // Test Matrix connection
  const testConnectionMutation = useMutation(
    async () => {
      const response = await axios.post('/api/matrix/test');
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Matrix connection test successful');
        queryClient.invalidateQueries('matrix-status');
      },
      onError: (error) => {
        toast.error('Matrix connection test failed');
      }
    }
  );

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries('matrix-status');
    await queryClient.invalidateQueries('matrix-federation');
    await queryClient.invalidateQueries('matrix-rooms');
    toast.success('Federation status refreshed');
  };

  if (matrixLoading || roomsLoading) {
    return (
      <FederationContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </FederationContainer>
    );
  }

  return (
    <FederationContainer>
      <FederationHeader>
        <FederationTitle>
          <FiGlobe />
          Server Federation
        </FederationTitle>
        <FederationActions>
          <Button variant="secondary" onClick={handleRefresh}>
            <FiRefreshCw />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowAddServer(true)}>
            <FiPlus />
            Add Server
          </Button>
        </FederationActions>
      </FederationHeader>

      {/* Stats Grid */}
      <StatsGrid columns={4}>
        <StatCard variant="primary">
          <StatIcon>
            <FiServer />
          </StatIcon>
          <StatValue>{matrixStatus?.roomCount || 0}</StatValue>
          <StatLabel>Federated Rooms</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +5 this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiUsers />
          </StatIcon>
          <StatValue>{federationInfo?.connected ? '1' : '0'}</StatValue>
          <StatLabel>Connected Servers</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +1 this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiMessageCircle />
          </StatIcon>
          <StatValue>{matrixStatus?.isConnected ? '1' : '0'}</StatValue>
          <StatLabel>Active Connections</StatLabel>
          <StatTrend>
            <FiTrendingDown />
            -0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiShield />
          </StatIcon>
          <StatValue>{federationInfo?.federationEnabled ? '1' : '0'}</StatValue>
          <StatLabel>Federation Status</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
      </StatsGrid>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <Button
          variant={activeTab === 'matrix' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('matrix')}
        >
          Matrix Federation
        </Button>
        <Button
          variant={activeTab === 'server' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('server')}
        >
          Server Federation
        </Button>
      </div>

      {activeTab === 'matrix' && (
        <ContentGrid columns={2}>
          {/* Matrix Status Section */}
          <MatrixStatus />

          {/* Servers Section */}
          <ServersSection>
          <SectionHeader>
            <SectionTitle>
              <FiServer />
              Federated Servers
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiSettings />
                Configure
              </Button>
            </SectionActions>
          </SectionHeader>

          <ServersList>
            {federationInfo?.connected ? (
              <ServerCard>
                <ServerHeader>
                  <ServerName>
                    <FiServer />
                    {federationInfo.serverName || 'Local Server'}
                  </ServerName>
                  <ServerStatus variant="success">
                    Connected
                  </ServerStatus>
                </ServerHeader>

                <ServerInfo>
                  <ServerDetail>
                    <ServerDetailIcon>
                      <FiWifi />
                    </ServerDetailIcon>
                    <span>Status: {federationInfo.connected ? 'Active' : 'Inactive'}</span>
                  </ServerDetail>
                  
                  <ServerDetail>
                    <ServerDetailIcon>
                      <FiGlobe />
                    </ServerDetailIcon>
                    <span>URL: {federationInfo.baseUrl}</span>
                  </ServerDetail>
                  
                  <ServerDetail>
                    <ServerDetailIcon>
                      <FiShield />
                    </ServerDetailIcon>
                    <span>Federation: {federationInfo.federationEnabled ? 'Enabled' : 'Disabled'}</span>
                  </ServerDetail>
                </ServerInfo>

                <ServerActions>
                  <ServerActionButton
                    variant="primary"
                    onClick={handleTestConnection}
                    disabled={testConnectionMutation.isLoading}
                  >
                    <FiActivity />
                    Test
                  </ServerActionButton>
                  
                  <ServerActionButton
                    variant="secondary"
                    onClick={() => setSelectedServer(federationInfo)}
                  >
                    <FiSettings />
                    Configure
                  </ServerActionButton>
                </ServerActions>
              </ServerCard>
            ) : (
              <EmptyState>
                <EmptyIcon>
                  <FiServer />
                </EmptyIcon>
                <EmptyText>No federated servers</EmptyText>
                <EmptySubtext>Add a server to enable federation</EmptySubtext>
              </EmptyState>
            )}
          </ServersList>
        </ServersSection>

        {/* Rooms Section */}
        <RoomsSection>
          <SectionHeader>
            <SectionTitle>
              <FiMessageCircle />
              Matrix Rooms
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiPlus />
                Create Room
              </Button>
            </SectionActions>
          </SectionHeader>

          {matrixRooms?.rooms?.length > 0 ? (
            matrixRooms.rooms.map((room) => (
              <RoomItem key={room.roomId}>
                <RoomInfo>
                  <RoomName>{room.roomId}</RoomName>
                  <RoomStatus>
                    <FiMessageCircle />
                    Group: {room.groupId}
                  </RoomStatus>
                </RoomInfo>
                
                <RoomActions>
                  <RoomActionButton
                    variant="primary"
                    onClick={() => window.open(`https://matrix.to/#/${room.roomId}`, '_blank')}
                  >
                    <FiGlobe />
                  </RoomActionButton>
                  
                  <RoomActionButton
                    variant="secondary"
                    onClick={() => setSelectedServer(room)}
                  >
                    <FiSettings />
                  </RoomActionButton>
                </RoomActions>
              </RoomItem>
            ))
          ) : (
            <EmptyState>
              <EmptyIcon>
                <FiMessageCircle />
              </EmptyIcon>
              <EmptyText>No Matrix rooms</EmptyText>
              <EmptySubtext>Create a group to generate Matrix rooms</EmptySubtext>
            </EmptyState>
          )}
        </RoomsSection>
        </ContentGrid>
      )}

      {activeTab === 'server' && (
        <FederationManagement />
      )}

      {/* Add Server Modal */}
      {showAddServer && (
        <AddServerModal
          onSubmit={(serverData) => {
            // Handle server addition
            console.log('Add server:', serverData);
            setShowAddServer(false);
          }}
          onClose={() => setShowAddServer(false)}
        />
      )}
    </FederationContainer>
  );
};

// Add Server Modal Component
const AddServerModal = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    token: '',
    enabled: true,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Add Federated Server</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Server Name</label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label>Server URL</label>
                <Input
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  placeholder="https://matrix.example.com"
                  required
                />
              </div>
              <div>
                <label>Access Token</label>
                <Input
                  name="token"
                  type="password"
                  value={formData.token}
                  onChange={handleChange}
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="enabled"
                  checked={formData.enabled}
                  onChange={handleChange}
                />
                <label>Enable Federation</label>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Add Server
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default Federation;
