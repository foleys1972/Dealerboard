import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiGlobe, 
  FiServer, 
  FiUsers, 
  FiActivity,
  FiShield,
  FiRefreshCw,
  FiPlus,
  FiEdit,
  FiTrash2,
  FiDownload,
  FiUpload,
  FiSettings,
  FiFilter,
  FiSearch,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiClock,
  FiDatabase,
  FiTrendingUp,
  FiTrendingDown,
  FiSend,
  FiMessageCircle,
  FiX
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
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
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, formatDistanceToNow } from 'date-fns';

const FederationManagementContainer = styled.div`
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

const FederationSection = styled(Card)`
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

const PeersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const PeerCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const PeerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const PeerName = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const PeerStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const PeerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const PeerDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const PeerDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const PeerActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const PeerActionButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const PeerActionIcon = styled(Button)`
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

const FederationManagement = () => {
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [showImportConfig, setShowImportConfig] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [showPeerDetails, setShowPeerDetails] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch federation status
  const { data: federationStatus, isLoading: statusLoading } = useQuery(
    'federation-status',
    async () => {
      const response = await axios.get('/api/federation/status');
      return response.data.status;
    }
  );

  // Fetch federation peers
  const { data: federationPeers, isLoading: peersLoading } = useQuery(
    'federation-peers',
    async () => {
      const response = await axios.get('/api/federation/peers');
      return response.data.peers;
    }
  );

  // Fetch federation statistics
  const { data: federationStats, isLoading: statsLoading } = useQuery(
    'federation-stats',
    async () => {
      const response = await axios.get('/api/federation/stats');
      return response.data.stats;
    }
  );

  // Add federation peer
  const addPeerMutation = useMutation(
    async (peerData) => {
      const response = await axios.post('/api/federation/peers', peerData);
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Federation peer added successfully');
        queryClient.invalidateQueries('federation-peers');
        queryClient.invalidateQueries('federation-status');
      },
      onError: (error) => {
        toast.error('Failed to add federation peer');
      }
    }
  );

  // Remove federation peer
  const removePeerMutation = useMutation(
    async (serverId) => {
      const response = await axios.delete(`/api/federation/peers/${serverId}`);
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Federation peer removed successfully');
        queryClient.invalidateQueries('federation-peers');
        queryClient.invalidateQueries('federation-status');
      },
      onError: (error) => {
        toast.error('Failed to remove federation peer');
      }
    }
  );

  // Test federation connection
  const testConnectionMutation = useMutation(
    async (serverId) => {
      const response = await axios.post(`/api/federation/test/${serverId}`);
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Test message sent successfully');
      },
      onError: (error) => {
        toast.error('Failed to test federation connection');
      }
    }
  );

  // Export federation configuration
  const exportConfigMutation = useMutation(
    async () => {
      const response = await axios.get('/api/federation/export', {
        responseType: 'blob'
      });
      return response.data;
    },
    {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'federation-config.json');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('Federation configuration exported');
      },
      onError: (error) => {
        toast.error('Failed to export federation configuration');
      }
    }
  );

  // Import federation configuration
  const importConfigMutation = useMutation(
    async (configData) => {
      const response = await axios.post('/api/federation/import', configData);
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success(`Federation configuration imported: ${data.importedCount} successful, ${data.failedCount} failed`);
        queryClient.invalidateQueries('federation-peers');
        queryClient.invalidateQueries('federation-status');
      },
      onError: (error) => {
        toast.error('Failed to import federation configuration');
      }
    }
  );

  const handleAddPeer = (peerData) => {
    addPeerMutation.mutate(peerData);
  };

  const handleRemovePeer = (serverId) => {
    if (window.confirm('Are you sure you want to remove this federation peer?')) {
      removePeerMutation.mutate(serverId);
    }
  };

  const handleTestConnection = (serverId) => {
    testConnectionMutation.mutate(serverId);
  };

  const handleExportConfig = () => {
    exportConfigMutation.mutate();
  };

  const handleImportConfig = (configData) => {
    importConfigMutation.mutate(configData);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries('federation-status');
    await queryClient.invalidateQueries('federation-peers');
    await queryClient.invalidateQueries('federation-stats');
    toast.success('Federation data refreshed');
  };

  const handlePeerClick = (peer) => {
    setSelectedPeer(peer);
    setShowPeerDetails(true);
  };

  if (statusLoading || peersLoading || statsLoading) {
    return (
      <FederationManagementContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </FederationManagementContainer>
    );
  }

  return (
    <FederationManagementContainer>
      <FederationHeader>
        <FederationTitle>
          <FiGlobe />
          Federation Management
        </FederationTitle>
        <FederationActions>
          <Button variant="secondary" onClick={handleRefresh}>
            <FiRefreshCw />
            Refresh
          </Button>
          <Button variant="secondary" onClick={handleExportConfig}>
            <FiDownload />
            Export
          </Button>
          <Button variant="secondary" onClick={() => setShowImportConfig(true)}>
            <FiUpload />
            Import
          </Button>
          <Button variant="primary" onClick={() => setShowAddPeer(true)}>
            <FiPlus />
            Add Peer
          </Button>
        </FederationActions>
      </FederationHeader>

      {/* Stats Grid */}
      <StatsGrid columns={4}>
        <StatCard variant="primary">
          <StatIcon>
            <FiGlobe />
          </StatIcon>
          <StatValue>{federationStatus?.totalPeers || 0}</StatValue>
          <StatLabel>Total Peers</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiServer />
          </StatIcon>
          <StatValue>{federationStatus?.connectedPeers || 0}</StatValue>
          <StatLabel>Connected Peers</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiActivity />
          </StatIcon>
          <StatValue>{federationStats?.queuedMessages || 0}</StatValue>
          <StatLabel>Queued Messages</StatLabel>
          <StatTrend>
            <FiTrendingDown />
            -0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiShield />
          </StatIcon>
          <StatValue>{federationStatus?.isRunning ? '1' : '0'}</StatValue>
          <StatLabel>Federation Status</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
      </StatsGrid>

      <ContentGrid columns={2}>
        {/* Federation Peers Section */}
        <FederationSection>
          <SectionHeader>
            <SectionTitle>
              <FiServer />
              Federation Peers
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiSettings />
                Configure
              </Button>
            </SectionActions>
          </SectionHeader>

          <PeersList>
            {federationPeers?.length > 0 ? (
              federationPeers.map((peer) => (
                <PeerCard key={peer.serverId} onClick={() => handlePeerClick(peer)}>
                  <PeerHeader>
                    <PeerName>
                      <FiServer />
                      {peer.serverName}
                    </PeerName>
                    <PeerStatus variant={peer.connectionStatus === 'connected' ? 'success' : 'secondary'}>
                      {peer.connectionStatus}
                    </PeerStatus>
                  </PeerHeader>

                  <PeerInfo>
                    <PeerDetail>
                      <PeerDetailIcon>
                        <FiGlobe />
                      </PeerDetailIcon>
                      <span>ID: {peer.serverId}</span>
                    </PeerDetail>
                    
                    <PeerDetail>
                      <PeerDetailIcon>
                        <FiServer />
                      </PeerDetailIcon>
                      <span>URL: {peer.serverUrl}</span>
                    </PeerDetail>
                    
                    <PeerDetail>
                      <PeerDetailIcon>
                        <FiClock />
                      </PeerDetailIcon>
                      <span>Last Seen: {peer.lastSeen ? formatDistanceToNow(new Date(peer.lastSeen), { addSuffix: true }) : 'Never'}</span>
                    </PeerDetail>
                  </PeerInfo>

                  <PeerActions>
                    <PeerActionButton
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestConnection(peer.serverId);
                      }}
                      disabled={testConnectionMutation.isLoading}
                    >
                      <FiSend />
                      Test
                    </PeerActionButton>
                    
                    <PeerActionIcon
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePeerClick(peer);
                      }}
                    >
                      <FiEdit />
                    </PeerActionIcon>
                    
                    <PeerActionIcon
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePeer(peer.serverId);
                      }}
                    >
                      <FiTrash2 />
                    </PeerActionIcon>
                  </PeerActions>
                </PeerCard>
              ))
            ) : (
              <EmptyState>
                <EmptyIcon>
                  <FiServer />
                </EmptyIcon>
                <EmptyText>No federation peers</EmptyText>
                <EmptySubtext>Add a peer to enable federation</EmptySubtext>
              </EmptyState>
            )}
          </PeersList>
        </FederationSection>

        {/* Federation Statistics Section */}
        <FederationSection>
          <SectionHeader>
            <SectionTitle>
              <FiActivity />
              Federation Statistics
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiRefreshCw />
                Refresh
              </Button>
            </SectionActions>
          </SectionHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Total Peers</span>
              <Badge variant="info">{federationStats?.totalPeers || 0}</Badge>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Connected Peers</span>
              <Badge variant="success">{federationStats?.connectedPeers || 0}</Badge>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Disconnected Peers</span>
              <Badge variant="secondary">{federationStats?.disconnectedPeers || 0}</Badge>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Queued Messages</span>
              <Badge variant="warning">{federationStats?.queuedMessages || 0}</Badge>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Uptime</span>
              <Badge variant="info">{Math.round(federationStats?.uptime || 0)}s</Badge>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Memory Usage</span>
              <Badge variant="info">{Math.round((federationStats?.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB</Badge>
            </div>
          </div>
        </FederationSection>
      </ContentGrid>

      {/* Add Peer Modal */}
      {showAddPeer && (
        <AddPeerModal
          onSubmit={handleAddPeer}
          onClose={() => setShowAddPeer(false)}
        />
      )}

      {/* Import Config Modal */}
      {showImportConfig && (
        <ImportConfigModal
          onSubmit={handleImportConfig}
          onClose={() => setShowImportConfig(false)}
        />
      )}

      {/* Peer Details Modal */}
      {showPeerDetails && selectedPeer && (
        <PeerDetailsModal
          peer={selectedPeer}
          onClose={() => setShowPeerDetails(false)}
        />
      )}
    </FederationManagementContainer>
  );
};

// Add Peer Modal Component
const AddPeerModal = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    serverId: '',
    serverName: '',
    serverUrl: '',
    publicKey: '',
    isActive: true
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
          <h3>Add Federation Peer</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Server ID</label>
                <Input
                  name="serverId"
                  value={formData.serverId}
                  onChange={handleChange}
                  placeholder="intercom-server-02"
                  required
                />
              </div>
              <div>
                <label>Server Name</label>
                <Input
                  name="serverName"
                  value={formData.serverName}
                  onChange={handleChange}
                  placeholder="Trading Intercom Server 02"
                  required
                />
              </div>
              <div>
                <label>Server URL</label>
                <Input
                  name="serverUrl"
                  value={formData.serverUrl}
                  onChange={handleChange}
                  placeholder="ws://server02.example.com:3002"
                  required
                />
              </div>
              <div>
                <label>Public Key (Optional)</label>
                <Input
                  name="publicKey"
                  value={formData.publicKey}
                  onChange={handleChange}
                  placeholder="Public key for encryption"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                />
                <label>Active</label>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Add Peer
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Import Config Modal Component
const ImportConfigModal = ({ onSubmit, onClose }) => {
  const [configData, setConfigData] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(configData);
      onSubmit(parsed);
    } catch (error) {
      toast.error('Invalid JSON configuration');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setConfigData(e.target.result);
      };
      reader.readAsText(file);
    }
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Import Federation Configuration</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Upload Configuration File</label>
                <Input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                />
              </div>
              <div>
                <label>Or Paste Configuration JSON</label>
                <textarea
                  value={configData}
                  onChange={(e) => setConfigData(e.target.value)}
                  placeholder="Paste federation configuration JSON here..."
                  style={{
                    width: '100%',
                    height: '200px',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Import Configuration
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Peer Details Modal Component
const PeerDetailsModal = ({ peer, onClose }) => {
  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Peer Details</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Server ID</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.serverId}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Server Name</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.serverName}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Server URL</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.serverUrl}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Status</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.connectionStatus}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Last Seen</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.lastSeen ? format(new Date(peer.lastSeen), 'MMM dd, yyyy HH:mm:ss') : 'Never'}
                </div>
              </div>
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Active</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  {peer.isActive ? 'Yes' : 'No'}
                </div>
              </div>
            </div>
            
            {peer.publicKey && (
              <div>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>Public Key</label>
                <div style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {peer.publicKey}
                </div>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary">
            <FiEdit />
            Edit Peer
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default FederationManagement;
