import React, { useState, useEffect } from 'react';
import styled, { ThemeProvider, useTheme } from 'styled-components';
import { 
  FiServer, 
  FiMapPin, 
  FiClock, 
  FiSettings,
  FiPlus,
  FiEdit,
  FiTrash2,
  FiCheck,
  FiX,
  FiUsers,
  FiSave,
  FiCpu
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  padding-bottom: 0.5rem;
`;

const Tab = styled.button`
  padding: 0.75rem 1.5rem;
  background: ${props => props.$active ? props.theme.colors.surfaceElevated : 'transparent'};
  border: none;
  border-radius: ${props => props.theme.borderRadius.md} ${props => props.theme.borderRadius.md} 0 0;
  color: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.textSecondary};
  font-size: 0.875rem;
  font-weight: ${props => props.$active ? 600 : 400};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.accent};
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
`;

const Section = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
`;

const TableHeader = styled.thead`
  background: ${props => props.theme.colors.surfaceElevated};
`;

const TableRow = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const TableHeaderCell = styled.th`
  padding: 0.75rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableCell = styled.td`
  padding: 0.75rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.$primary ? props.theme.colors.accent : props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.$primary ? props.theme.colors.accent : props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$primary ? '#ffffff' : props.theme.colors.text};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.$primary ? props.theme.colors.accentHover : props.theme.colors.surface};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
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

const Input = styled.input`
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const Textarea = styled.textarea`
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const Select = styled.select`
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
  
  option {
    background: ${props => props.theme.colors.surface};
    color: ${props => props.theme.colors.text};
  }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const StatusBadge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    if (props.$status === 'connected') return '#10b981';
    if (props.$status === 'disconnected') return '#6b7280';
    return '#ef4444';
  }};
  color: #ffffff;
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 2rem;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const ModalCloseButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    color: ${props => props.theme.colors.text};
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${props => props.theme.colors.border};
`;

const AdminSystemSettings = () => {
  const [activeTab, setActiveTab] = useState('server-role');
  const [editingSubscriber, setEditingSubscriber] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [showSubscriberModal, setShowSubscriberModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showUserAssignmentModal, setShowUserAssignmentModal] = useState(false);
  const [selectedLocationForUsers, setSelectedLocationForUsers] = useState(null);
  const [portConfig, setPortConfig] = useState({
    conferencingPort: 3002,
    federationPort: 3002,
    rtcMinPort: 10000,
    rtcMaxPort: 10200
  });
  const [serverRole, setServerRole] = useState({
    role: 'publisher', // 'publisher' or 'subscriber'
    publisherUrl: '', // Only used if role is 'subscriber'
    serverId: process.env.REACT_APP_SERVER_ID || '',
    serverName: process.env.REACT_APP_SERVER_NAME || 'Trading Intercom Server'
  });

  const queryClient = useQueryClient();

  // Fetch subscribers
  const { data: subscribersData, isLoading: loadingSubscribers } = useQuery(
    'subscribers',
    async () => {
      const res = await api.get('/subscribers');
      return res.data.subscribers || [];
    },
    { refetchInterval: 30000 } // Refresh every 30 seconds
  );

  // Fetch locations
  const { data: locationsData, isLoading: loadingLocations } = useQuery(
    'locations',
    async () => {
      const res = await api.get('/locations');
      return res.data.locations || [];
    }
  );

  // Fetch all users for assignment
  const { data: allUsersData, isLoading: loadingUsers } = useQuery(
    'allUsers',
    async () => {
      const res = await api.get('/auth/users');
      return res.data.users || [];
    },
    {
      enabled: showUserAssignmentModal // Only fetch when modal is open
    }
  );

  // Fetch users in selected location
  const { data: locationUsersData, isLoading: loadingLocationUsers } = useQuery(
    ['locationUsers', selectedLocationForUsers?.id],
    async () => {
      if (!selectedLocationForUsers?.id) return [];
      const res = await api.get(`/locations/${selectedLocationForUsers.id}/users`);
      return res.data.users || [];
    },
    {
      enabled: !!selectedLocationForUsers?.id && showUserAssignmentModal
    }
  );

  // Fetch system settings for port config and server role
  useQuery(
    'systemSettings',
    async () => {
      const res = await api.get('/system/settings');
      return res.data.settings || {};
    },
    {
      onSuccess: (data) => {
        if (data.ports) {
          setPortConfig({
            conferencingPort: data.ports.conferencingPort || 3002,
            federationPort: data.ports.federationPort || 3002,
            rtcMinPort: data.ports.rtcMinPort || 10000,
            rtcMaxPort: data.ports.rtcMaxPort || 10200
          });
        }
        if (data.serverRole) {
          setServerRole(data.serverRole);
        }
      }
    }
  );

  const subscribers = subscribersData || [];
  const locations = locationsData || [];

  // Subscriber mutations
  const createSubscriberMutation = useMutation(
    async (data) => {
      const res = await api.post('/subscribers', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscribers');
        setShowSubscriberModal(false);
        setEditingSubscriber(null);
        toast.success('Subscriber created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create subscriber');
      }
    }
  );

  const updateSubscriberMutation = useMutation(
    async ({ id, data }) => {
      const res = await api.put(`/subscribers/${id}`, data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscribers');
        setShowSubscriberModal(false);
        setEditingSubscriber(null);
        toast.success('Subscriber updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update subscriber');
      }
    }
  );

  const deleteSubscriberMutation = useMutation(
    async (id) => {
      await api.delete(`/subscribers/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscribers');
        toast.success('Subscriber deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete subscriber');
      }
    }
  );

  // Location mutations
  const createLocationMutation = useMutation(
    async (data) => {
      const res = await api.post('/locations', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('locations');
        setShowLocationModal(false);
        setEditingLocation(null);
        toast.success('Location created successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create location');
      }
    }
  );

  const updateLocationMutation = useMutation(
    async ({ id, data }) => {
      const res = await api.put(`/locations/${id}`, data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('locations');
        setShowLocationModal(false);
        setEditingLocation(null);
        toast.success('Location updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update location');
      }
    }
  );

  const deleteLocationMutation = useMutation(
    async (id) => {
      await api.delete(`/locations/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('locations');
        toast.success('Location deleted successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete location');
      }
    }
  );

  // Assign users to location mutation
  const assignUsersMutation = useMutation(
    async ({ locationId, userIds }) => {
      const res = await api.post(`/locations/${locationId}/assign-users`, { userIds });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('locations');
        queryClient.invalidateQueries(['locationUsers', selectedLocationForUsers?.id]);
        setShowUserAssignmentModal(false);
        setSelectedLocationForUsers(null);
        toast.success('Users assigned successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to assign users');
      }
    }
  );

  // Port config mutation
  const updatePortConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/system/settings', {
        ports: data
      });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Port configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save port configuration');
      }
    }
  );

  // Server role mutation
  const updateServerRoleMutation = useMutation(
    async (data) => {
      const res = await api.put('/system/settings', {
        serverRole: data
      });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Server role configuration saved successfully. Server restart may be required.');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save server role configuration');
      }
    }
  );

  const handleEditSubscriber = (subscriber) => {
    setEditingSubscriber(subscriber);
    setShowSubscriberModal(true);
  };

  const handleEditLocation = (location) => {
    setEditingLocation(location);
    setShowLocationModal(true);
  };

  const handleDeleteSubscriber = async (id) => {
    if (window.confirm('Are you sure you want to delete this subscriber?')) {
      deleteSubscriberMutation.mutate(id);
    }
  };

  const handleDeleteLocation = async (id) => {
    if (window.confirm('Are you sure you want to delete this location? Users and subscribers must be reassigned first.')) {
      deleteLocationMutation.mutate(id);
    }
  };

  const handleManageUsers = (location) => {
    setSelectedLocationForUsers(location);
    setShowUserAssignmentModal(true);
  };

  const handleCloseUserAssignment = () => {
    setShowUserAssignmentModal(false);
    setSelectedLocationForUsers(null);
  };

  const handleSavePortConfig = () => {
    // Validate port range is 200 ports
    const portRange = portConfig.rtcMaxPort - portConfig.rtcMinPort + 1;
    if (portRange !== 200) {
      toast.error(`Port range must be exactly 200 ports. Current range: ${portRange} ports`);
      return;
    }

    // Validate min < max
    if (portConfig.rtcMinPort >= portConfig.rtcMaxPort) {
      toast.error('First port must be less than last port');
      return;
    }

    // Validate ports are in valid range
    if (portConfig.rtcMinPort < 1024 || portConfig.rtcMaxPort > 65535) {
      toast.error('Ports must be between 1024 and 65535');
      return;
    }

    updatePortConfigMutation.mutate(portConfig);
  };

  const handleSaveServerRole = () => {
    // Validate that publisherUrl is provided when role is subscriber
    if (serverRole.role === 'subscriber' && !serverRole.publisherUrl?.trim()) {
      toast.error('Publisher Server URL is required when server role is Subscriber');
      return;
    }

    // Validate serverId is provided
    if (!serverRole.serverId?.trim()) {
      toast.error('Server ID is required');
      return;
    }

    updateServerRoleMutation.mutate(serverRole);
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <TabsContainer>
          <Tab $active={activeTab === 'server-role'} onClick={() => setActiveTab('server-role')}>
            <FiCpu />
            Server Role
          </Tab>
          <Tab $active={activeTab === 'subscribers'} onClick={() => setActiveTab('subscribers')}>
            <FiServer />
            Subscriber Servers
          </Tab>
          <Tab $active={activeTab === 'locations'} onClick={() => setActiveTab('locations')}>
            <FiMapPin />
            Locations
          </Tab>
          <Tab $active={activeTab === 'retention'} onClick={() => setActiveTab('retention')}>
            <FiClock />
            Retention Rules
          </Tab>
          <Tab $active={activeTab === 'ports'} onClick={() => setActiveTab('ports')}>
            <FiSettings />
            Port Configuration
          </Tab>
        </TabsContainer>

        <TabContent>
          {activeTab === 'server-role' && (
            <Section>
              <SectionTitle>
                <FiCpu />
                Server Role Configuration
              </SectionTitle>
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
                <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
                  <strong>Publisher:</strong> Central server that manages the database and coordinates group calls/broadcasts. 
                  Subscriber servers connect to publishers.
                </p>
                <p style={{ margin: '0.5rem 0 0 0', color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
                  <strong>Subscriber:</strong> Connects to a publisher server and routes audio locally to its users. 
                  Uses one connection to the publisher per group call/broadcast, then distributes locally.
                </p>
              </div>
              <FormGroup>
                <Label>Server Role *</Label>
                <Select
                  value={serverRole.role}
                  onChange={(e) => setServerRole({ ...serverRole, role: e.target.value })}
                >
                  <option value="publisher">Publisher (Central Server)</option>
                  <option value="subscriber">Subscriber (Connects to Publisher)</option>
                </Select>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Defines whether this server acts as a publisher (central) or subscriber (connects to publisher)
                </div>
              </FormGroup>
              <FormGroup>
                <Label>Server ID *</Label>
                <Input
                  value={serverRole.serverId}
                  onChange={(e) => setServerRole({ ...serverRole, serverId: e.target.value })}
                  placeholder="intercom-server-01"
                  required
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Unique identifier for this server instance
                </div>
              </FormGroup>
              <FormGroup>
                <Label>Server Name</Label>
                <Input
                  value={serverRole.serverName}
                  onChange={(e) => setServerRole({ ...serverRole, serverName: e.target.value })}
                  placeholder="Trading Intercom Server"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Display name for this server
                </div>
              </FormGroup>
              {serverRole.role === 'subscriber' && (
                <>
                  <FormGroup>
                    <Label>Publisher Server URL *</Label>
                    <Input
                      value={serverRole.publisherUrl}
                      onChange={(e) => setServerRole({ ...serverRole, publisherUrl: e.target.value })}
                      placeholder="ws://publisher.example.com:3002"
                      required={serverRole.role === 'subscriber'}
                    />
                    <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                      WebSocket URL of the publisher server to connect to (only required for subscribers)
                    </div>
                  </FormGroup>
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1f2937', borderRadius: theme.borderRadius.md, border: '1px solid #374151' }}>
                    <p style={{ margin: 0, color: '#fbbf24', fontSize: '0.875rem', fontWeight: 500 }}>
                      ⚠️ Subscriber Mode: This server will connect to the publisher and route audio locally.
                      When multiple users on this subscriber join a group call/broadcast, only one connection 
                      to the publisher is used, then audio is distributed locally.
                    </p>
                  </div>
                </>
              )}
              {serverRole.role === 'publisher' && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1f2937', borderRadius: theme.borderRadius.md, border: '1px solid #374151' }}>
                  <p style={{ margin: 0, color: '#10b981', fontSize: '0.875rem', fontWeight: 500 }}>
                    ✓ Publisher Mode: This server manages the central database and accepts connections from subscriber servers.
                  </p>
                </div>
              )}
              <Button $primary onClick={handleSaveServerRole}>
                <FiSave />
                Save Server Role Configuration
              </Button>
            </Section>
          )}

          {activeTab === 'subscribers' && (
            <Section>
              <SectionTitle>
                <FiServer />
                Subscriber Servers
                <Button $primary onClick={() => { setEditingSubscriber(null); setShowSubscriberModal(true); }} style={{ marginLeft: 'auto' }}>
                  <FiPlus />
                  Add Subscriber
                </Button>
              </SectionTitle>
              {loadingSubscribers ? (
                <div>Loading...</div>
              ) : subscribers.length === 0 ? (
                <div>No subscribers configured</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Server URL</TableHeaderCell>
                      <TableHeaderCell>Server ID</TableHeaderCell>
                      <TableHeaderCell>Location</TableHeaderCell>
                      <TableHeaderCell>Port</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {subscribers.map((subscriber) => (
                      <TableRow key={subscriber.id}>
                        <TableCell>{subscriber.name}</TableCell>
                        <TableCell>{subscriber.serverUrl}</TableCell>
                        <TableCell>{subscriber.serverId}</TableCell>
                        <TableCell>
                          {locations.find(l => l.id === subscriber.locationId)?.name || 'None'}
                        </TableCell>
                        <TableCell>{subscriber.connectionPort}</TableCell>
                        <TableCell>
                          <StatusBadge $status={subscriber.status}>
                            {subscriber.status}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <ButtonGroup>
                            <Button onClick={() => handleEditSubscriber(subscriber)}>
                              <FiEdit />
                            </Button>
                            <Button onClick={() => handleDeleteSubscriber(subscriber.id)}>
                              <FiTrash2 />
                            </Button>
                          </ButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>
          )}

          {activeTab === 'locations' && (
            <Section>
              <SectionTitle>
                <FiMapPin />
                Locations
                <Button $primary onClick={() => { setEditingLocation(null); setShowLocationModal(true); }} style={{ marginLeft: 'auto' }}>
                  <FiPlus />
                  Add Location
                </Button>
              </SectionTitle>
              {loadingLocations ? (
                <div>Loading...</div>
              ) : locations.length === 0 ? (
                <div>No locations configured</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Description</TableHeaderCell>
                      <TableHeaderCell>Users</TableHeaderCell>
                      <TableHeaderCell>Subscribers</TableHeaderCell>
                      <TableHeaderCell>Voice Retention</TableHeaderCell>
                      <TableHeaderCell>Messaging Retention</TableHeaderCell>
                      <TableHeaderCell>Data Retention</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {locations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell>{location.name}</TableCell>
                        <TableCell>{location.description || '-'}</TableCell>
                        <TableCell>{location.userCount}</TableCell>
                        <TableCell>{location.subscriberCount}</TableCell>
                        <TableCell>{location.voiceRetentionDays} days</TableCell>
                        <TableCell>{location.messagingRetentionDays} days</TableCell>
                        <TableCell>{location.dataRetentionDays} days</TableCell>
                        <TableCell>
                          <ButtonGroup>
                            <Button onClick={() => handleManageUsers(location)} title="Manage Users">
                              <FiUsers />
                            </Button>
                            <Button onClick={() => handleEditLocation(location)}>
                              <FiEdit />
                            </Button>
                            <Button onClick={() => handleDeleteLocation(location.id)}>
                              <FiTrash2 />
                            </Button>
                          </ButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>
          )}

          {activeTab === 'retention' && (
            <Section>
              <SectionTitle>
                <FiClock />
                Retention Rules by Location
              </SectionTitle>
              {locations.length === 0 ? (
                <div>No locations configured. Create a location first to set retention rules.</div>
              ) : (
                <div>
                  {locations.map((location) => (
                    <Section key={location.id} style={{ marginBottom: '1rem' }}>
                      <SectionTitle style={{ fontSize: '1rem' }}>{location.name}</SectionTitle>
                      <FormGroup>
                        <Label>Voice Recordings Retention (days)</Label>
                        <Input
                          type="number"
                          value={location.voiceRetentionDays || 30}
                          onChange={(e) => {
                            updateLocationMutation.mutate({
                              id: location.id,
                              data: { voiceRetentionDays: parseInt(e.target.value) }
                            });
                          }}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>Messaging Retention (days)</Label>
                        <Input
                          type="number"
                          value={location.messagingRetentionDays || 30}
                          onChange={(e) => {
                            updateLocationMutation.mutate({
                              id: location.id,
                              data: { messagingRetentionDays: parseInt(e.target.value) }
                            });
                          }}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>Data Retention (days)</Label>
                        <Input
                          type="number"
                          value={location.dataRetentionDays || 30}
                          onChange={(e) => {
                            updateLocationMutation.mutate({
                              id: location.id,
                              data: { dataRetentionDays: parseInt(e.target.value) }
                            });
                          }}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Checkbox
                            checked={location.legalHold || false}
                            onChange={(e) => {
                              updateLocationMutation.mutate({
                                id: location.id,
                                data: { legalHold: e.target.checked }
                              });
                            }}
                          />
                          Legal Hold (prevents deletion)
                        </Label>
                      </FormGroup>
                    </Section>
                  ))}
                </div>
              )}
            </Section>
          )}

          {activeTab === 'ports' && (
            <Section>
              <SectionTitle>
                <FiSettings />
                Port Configuration
              </SectionTitle>
              <FormGroup>
                <Label>Conferencing Connection Port</Label>
                <Input
                  type="number"
                  value={portConfig.conferencingPort}
                  onChange={(e) => setPortConfig({ ...portConfig, conferencingPort: parseInt(e.target.value) || 3002 })}
                  min="1024"
                  max="65535"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Port used for subscriber server connections to the central server for group calls and broadcasts
                </div>
              </FormGroup>
              <FormGroup>
                <Label>Federation Port</Label>
                <Input
                  type="number"
                  value={portConfig.federationPort}
                  onChange={(e) => setPortConfig({ ...portConfig, federationPort: parseInt(e.target.value) || 3002 })}
                  min="1024"
                  max="65535"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Port used for federation connections between servers
                </div>
              </FormGroup>
              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: `1px solid ${theme.colors.border}` }}>
                <SectionTitle style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                  WebRTC Endpoint Port Range
                </SectionTitle>
                <div style={{ marginBottom: '1rem', padding: '1rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
                  <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
                    Configure the port range for WebRTC media endpoints. The range must be exactly <strong>200 ports</strong>.
                    Each endpoint connection will use a port from this range.
                  </p>
                </div>
                <FormGroup>
                  <Label>First Port (Start) *</Label>
                  <Input
                    type="number"
                    value={portConfig.rtcMinPort}
                    onChange={(e) => {
                      const minPort = parseInt(e.target.value) || 10000;
                      setPortConfig({ 
                        ...portConfig, 
                        rtcMinPort: minPort,
                        rtcMaxPort: minPort + 199 // Automatically set max to maintain 200 port range
                      });
                    }}
                    min="1024"
                    max="65335"
                  />
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    Starting port for WebRTC endpoint range (must be between 1024 and 65335 to allow 200 port range)
                  </div>
                </FormGroup>
                <FormGroup>
                  <Label>Last Port (End) *</Label>
                  <Input
                    type="number"
                    value={portConfig.rtcMaxPort}
                    onChange={(e) => {
                      const maxPort = parseInt(e.target.value) || 10200;
                      setPortConfig({ 
                        ...portConfig, 
                        rtcMaxPort: maxPort,
                        rtcMinPort: maxPort - 199 // Automatically set min to maintain 200 port range
                      });
                    }}
                    min="1224"
                    max="65535"
                  />
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    Ending port for WebRTC endpoint range (must be exactly 200 ports after first port)
                  </div>
                </FormGroup>
                <div style={{ 
                  padding: '0.75rem', 
                  background: portConfig.rtcMaxPort - portConfig.rtcMinPort + 1 === 200 ? '#1f2937' : '#7f1d1d',
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${portConfig.rtcMaxPort - portConfig.rtcMinPort + 1 === 200 ? '#374151' : '#991b1b'}`,
                  marginBottom: '1rem'
                }}>
                  <p style={{ margin: 0, color: portConfig.rtcMaxPort - portConfig.rtcMinPort + 1 === 200 ? '#10b981' : '#fca5a5', fontSize: '0.875rem', fontWeight: 500 }}>
                    {portConfig.rtcMaxPort - portConfig.rtcMinPort + 1 === 200 
                      ? `✓ Port range: ${portConfig.rtcMaxPort - portConfig.rtcMinPort + 1} ports (${portConfig.rtcMinPort} - ${portConfig.rtcMaxPort})`
                      : `⚠ Port range: ${portConfig.rtcMaxPort - portConfig.rtcMinPort + 1} ports (must be exactly 200 ports)`
                    }
                  </p>
                </div>
              </div>
              <Button $primary onClick={handleSavePortConfig}>
                <FiSave />
                Save Port Configuration
              </Button>
            </Section>
          )}
        </TabContent>

        {/* Subscriber Modal */}
        {showSubscriberModal && (
          <SubscriberModal
            subscriber={editingSubscriber}
            locations={locations}
            onClose={() => {
              setShowSubscriberModal(false);
              setEditingSubscriber(null);
            }}
            onSave={(data) => {
              if (editingSubscriber) {
                updateSubscriberMutation.mutate({ id: editingSubscriber.id, data });
              } else {
                createSubscriberMutation.mutate(data);
              }
            }}
          />
        )}

        {/* Location Modal */}
        {showLocationModal && (
          <LocationModal
            location={editingLocation}
            onClose={() => {
              setShowLocationModal(false);
              setEditingLocation(null);
            }}
            onSave={(data) => {
              if (editingLocation) {
                updateLocationMutation.mutate({ id: editingLocation.id, data });
              } else {
                createLocationMutation.mutate(data);
              }
            }}
          />
        )}

        {showUserAssignmentModal && selectedLocationForUsers && (
          <UserAssignmentModal
            location={selectedLocationForUsers}
            allUsers={allUsersData || []}
            locationUsers={locationUsersData || []}
            loadingUsers={loadingUsers || loadingLocationUsers}
            onClose={handleCloseUserAssignment}
            onAssign={(userIds) => {
              assignUsersMutation.mutate({
                locationId: selectedLocationForUsers.id,
                userIds
              });
            }}
          />
        )}
      </Container>
    </ThemeProvider>
  );
};

// Subscriber Modal Component
const SubscriberModal = ({ subscriber, locations, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: subscriber?.name || '',
    serverUrl: subscriber?.serverUrl || '',
    serverId: subscriber?.serverId || '',
    locationId: subscriber?.locationId || '',
    connectionPort: subscriber?.connectionPort || 3002,
    isActive: subscriber?.isActive !== false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{subscriber ? 'Edit Subscriber' : 'Add Subscriber'}</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </FormGroup>
          <FormGroup>
            <Label>Server URL *</Label>
            <Input
              value={formData.serverUrl}
              onChange={(e) => setFormData({ ...formData, serverUrl: e.target.value })}
              placeholder="ws://subscriber.example.com:3002"
              required
            />
          </FormGroup>
          <FormGroup>
            <Label>Server ID *</Label>
            <Input
              value={formData.serverId}
              onChange={(e) => setFormData({ ...formData, serverId: e.target.value })}
              required
            />
          </FormGroup>
          <FormGroup>
            <Label>Location</Label>
            <Select
              value={formData.locationId}
              onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
            >
              <option value="">None</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Connection Port</Label>
            <Input
              type="number"
              value={formData.connectionPort}
              onChange={(e) => setFormData({ ...formData, connectionPort: parseInt(e.target.value) })}
              min="1024"
              max="65535"
            />
          </FormGroup>
          <FormGroup>
            <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Checkbox
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Active
            </Label>
          </FormGroup>
          <ModalFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button $primary type="submit">
              <FiCheck />
              {subscriber ? 'Update' : 'Create'} Subscriber
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// Location Modal Component
const LocationModal = ({ location, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: location?.name || '',
    description: location?.description || '',
    retentionDays: location?.retentionDays || 30,
    voiceRetentionDays: location?.voiceRetentionDays || location?.retentionDays || 30,
    messagingRetentionDays: location?.messagingRetentionDays || location?.retentionDays || 30,
    dataRetentionDays: location?.dataRetentionDays || location?.retentionDays || 30,
    legalHold: location?.legalHold || false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{location ? 'Edit Location' : 'Add Location'}</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </FormGroup>
          <FormGroup>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormGroup>
          <FormGroup>
            <Label>Default Retention (days)</Label>
            <Input
              type="number"
              value={formData.retentionDays}
              onChange={(e) => setFormData({ ...formData, retentionDays: parseInt(e.target.value) })}
              min="1"
            />
          </FormGroup>
          <FormGroup>
            <Label>Voice Retention (days)</Label>
            <Input
              type="number"
              value={formData.voiceRetentionDays}
              onChange={(e) => setFormData({ ...formData, voiceRetentionDays: parseInt(e.target.value) })}
              min="1"
            />
          </FormGroup>
          <FormGroup>
            <Label>Messaging Retention (days)</Label>
            <Input
              type="number"
              value={formData.messagingRetentionDays}
              onChange={(e) => setFormData({ ...formData, messagingRetentionDays: parseInt(e.target.value) })}
              min="1"
            />
          </FormGroup>
          <FormGroup>
            <Label>Data Retention (days)</Label>
            <Input
              type="number"
              value={formData.dataRetentionDays}
              onChange={(e) => setFormData({ ...formData, dataRetentionDays: parseInt(e.target.value) })}
              min="1"
            />
          </FormGroup>
          <FormGroup>
            <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Checkbox
                checked={formData.legalHold}
                onChange={(e) => setFormData({ ...formData, legalHold: e.target.checked })}
              />
              Legal Hold (prevents deletion)
            </Label>
          </FormGroup>
          <ModalFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button $primary type="submit">
              <FiCheck />
              {location ? 'Update' : 'Create'} Location
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// User Assignment Modal Component
const UserAssignmentModal = ({ location, allUsers, locationUsers, loadingUsers, onClose, onAssign }) => {
  const theme = useTheme();
  const [selectedUserIds, setSelectedUserIds] = useState(
    new Set(locationUsers.map(user => user.id))
  );

  useEffect(() => {
    setSelectedUserIds(new Set(locationUsers.map(user => user.id)));
  }, [locationUsers]);

  const handleToggleUser = (userId) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAssign(Array.from(selectedUserIds));
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <ModalHeader>
          <ModalTitle>Manage Users - {location?.name}</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        {loadingUsers ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading users...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
              {allUsers.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: theme.colors.textSecondary }}>
                  No users available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell style={{ width: '50px' }}></TableHeaderCell>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Email</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {allUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => handleToggleUser(user.id)}
                          />
                        </TableCell>
                        <TableCell>{user.name || user.username}</TableCell>
                        <TableCell>{user.email || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge $status={user.isActive ? 'connected' : 'disconnected'}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
            <ModalFooter>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button $primary type="submit">
                <FiCheck />
                Assign {selectedUserIds.size} User{selectedUserIds.size !== 1 ? 's' : ''}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};

export default AdminSystemSettings;

