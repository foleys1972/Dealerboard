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
  FiCpu,
  FiVideo,
  FiPhone,
  FiShield,
  FiDatabase,
  FiImage,
  FiUpload,
  FiLink,
  FiGrid
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

const AdminSystemSettings = ({ initialTab = 'server-role' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Update activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
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
  
  // Configuration states
  const [zoomConfig, setZoomConfig] = useState({
    enabled: false,
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    accountId: '',
    allowDirectAuth: false
  });
  const [teamsConfig, setTeamsConfig] = useState({
    enabled: false,
    clientId: '',
    clientSecret: '',
    tenantId: '',
    redirectUri: ''
  });
  const [sipConfig, setSipConfig] = useState({
    enabled: false,
    host: 'localhost',
    port: 5060,
    domain: '',
    password: ''
  });
  const [matrixConfig, setMatrixConfig] = useState({
    serverUrl: 'https://matrix.org',
    accessToken: '',
    userId: '',
    deviceId: ''
  });
  const [mediasoupConfig, setMediasoupConfig] = useState({
    numWorkers: 4,
    listenIp: '0.0.0.0',
    announcedIp: '',
    logLevel: 'warn',
    maxConcurrentGroups: 50,
    maxParticipantsPerGroup: 300
  });
  const [federationConfig, setFederationConfig] = useState({
    enabled: false,
    serverId: '',
    serverName: '',
    serverUrl: '',
    federationSecret: '',
    maxConnections: 10,
    heartbeatInterval: 30000,
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
    encryptionEnabled: false,
    compressionEnabled: false
  });
  const [adConfig, setAdConfig] = useState({
    enabled: false,
    url: 'ldap://localhost:389',
    baseDN: '',
    bindDN: '',
    bindPassword: '',
    userSearchBase: '',
    groupSearchBase: '',
    syncInterval: 300000
  });
  const [complianceConfig, setComplianceConfig] = useState({
    enabled: false,
    regulations: ['mifid2', 'dodd-frank', 'sox'],
    retentionPeriod: 2555,
    auditLogging: false,
    dataClassification: false,
    accessControl: false,
    encryptionRequired: false,
    reportingInterval: 86400000,
    complianceOfficer: '',
    legalHold: false
  });
  const [gridConfig, setGridConfig] = useState({
    columns: 3,
    gap: '1rem',
    mobileColumns: 1,
    mobileGap: '0.75rem',
    tabletColumns: 2,
    contactColumns: 2,
    contactGap: '0.75rem',
    contactMobileColumns: 1
  });

  const [iconConfig, setIconConfig] = useState({
    intercom: {
      favicon: '',
      appIcon: '',
      libraryIcon: 'FiPhone',
      customIconUrl: '',
      useCustomIcon: false
    },
    dealerboard: {
      favicon: '',
      appIcon: '',
      libraryIcon: 'FiGrid',
      customIconUrl: '',
      useCustomIcon: false
    }
  });

  const queryClient = useQueryClient();

  // Fetch subscribers
  const { data: subscribersData, isLoading: loadingSubscribers } = useQuery(
    'subscribers',
    async () => {
      const res = await api.get('/api/subscribers');
      return res.data.subscribers || [];
    },
    { refetchInterval: 30000 } // Refresh every 30 seconds
  );

  // Fetch locations
  const { data: locationsData, isLoading: loadingLocations } = useQuery(
    'locations',
    async () => {
      const res = await api.get('/api/locations');
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
      const res = await api.get(`/api/locations/${selectedLocationForUsers.id}/users`);
      return res.data.users || [];
    },
    {
      enabled: !!selectedLocationForUsers?.id && showUserAssignmentModal
    }
  );

  // Fetch system settings for all configurations
  useQuery(
    'systemSettings',
    async () => {
      const res = await api.get('/api/system/settings');
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
        if (data.zoom) {
          setZoomConfig({
            enabled: data.zoom.enabled || false,
            clientId: data.zoom.clientId || '',
            clientSecret: '', // Never show in UI
            redirectUri: data.zoom.redirectUri || '',
            accountId: data.zoom.accountId || '',
            allowDirectAuth: data.zoom.allowDirectAuth || false
          });
        }
        if (data.teams) {
          setTeamsConfig({
            enabled: data.teams.enabled || false,
            clientId: data.teams.clientId || '',
            clientSecret: '', // Never show in UI
            tenantId: data.teams.tenantId || '',
            redirectUri: data.teams.redirectUri || ''
          });
        }
        if (data.sip) {
          setSipConfig({
            enabled: data.sip.enabled || false,
            host: data.sip.host || 'localhost',
            port: data.sip.port || 5060,
            domain: data.sip.domain || '',
            password: '' // Never show in UI
          });
        }
        if (data.matrix) {
          setMatrixConfig({
            serverUrl: data.matrix.serverUrl || 'https://matrix.org',
            accessToken: '', // Never show in UI
            userId: data.matrix.userId || '',
            deviceId: data.matrix.deviceId || ''
          });
        }
        if (data.mediasoup) {
          setMediasoupConfig({
            numWorkers: data.mediasoup.numWorkers || 4,
            listenIp: data.mediasoup.listenIp || '0.0.0.0',
            announcedIp: data.mediasoup.announcedIp || '',
            logLevel: data.mediasoup.logLevel || 'warn',
            maxConcurrentGroups: data.mediasoup.maxConcurrentGroups || 50,
            maxParticipantsPerGroup: data.mediasoup.maxParticipantsPerGroup || 300
          });
        }
        if (data.federation) {
          setFederationConfig({
            enabled: data.federation.enabled || false,
            serverId: data.federation.serverId || '',
            serverName: data.federation.serverName || '',
            serverUrl: data.federation.serverUrl || '',
            federationSecret: '', // Never show in UI
            maxConnections: data.federation.maxConnections || 10,
            heartbeatInterval: data.federation.heartbeatInterval || 30000,
            reconnectInterval: data.federation.reconnectInterval || 5000,
            maxReconnectAttempts: data.federation.maxReconnectAttempts || 5,
            encryptionEnabled: data.federation.encryptionEnabled || false,
            compressionEnabled: data.federation.compressionEnabled || false
          });
        }
        if (data.activeDirectory) {
          setAdConfig({
            enabled: data.activeDirectory.enabled || false,
            url: data.activeDirectory.url || 'ldap://localhost:389',
            baseDN: data.activeDirectory.baseDN || '',
            bindDN: data.activeDirectory.bindDN || '',
            bindPassword: '', // Never show in UI
            userSearchBase: data.activeDirectory.userSearchBase || '',
            groupSearchBase: data.activeDirectory.groupSearchBase || '',
            syncInterval: data.activeDirectory.syncInterval || 300000
          });
        }
        if (data.compliance) {
          setComplianceConfig({
            enabled: data.compliance.enabled || false,
            regulations: data.compliance.regulations || ['mifid2', 'dodd-frank', 'sox'],
            retentionPeriod: data.compliance.retentionPeriod || 2555,
            auditLogging: data.compliance.auditLogging || false,
            dataClassification: data.compliance.dataClassification || false,
            accessControl: data.compliance.accessControl || false,
            encryptionRequired: data.compliance.encryptionRequired || false,
            reportingInterval: data.compliance.reportingInterval || 86400000,
            complianceOfficer: data.compliance.complianceOfficer || '',
            legalHold: data.compliance.legalHold || false
          });
        }
      }
    }
  );

  // Load grid configuration
  const { data: gridConfigData } = useQuery(
    'grid-config',
    async () => {
      const response = await api.get('/api/user-intercom/grid-config');
      return response.data;
    },
    {
      enabled: isAdmin,
      onSuccess: (data) => {
        if (data?.config) {
          setGridConfig(data.config);
        }
      }
    }
  );

  // Update grid config mutation
  const updateGridConfigMutation = useMutation(
    async (config) => {
      const res = await api.put('/api/user-intercom/grid-config', { gridConfig: config });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grid-config');
        toast.success('Grid configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save grid configuration');
      }
    }
  );

  const subscribers = subscribersData || [];
  const locations = locationsData || [];

  // Subscriber mutations
  const createSubscriberMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/subscribers', data);
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
      const res = await api.put(`/api/subscribers/${id}`, data);
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
      await api.delete(`/api/subscribers/${id}`);
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
      const res = await api.post('/api/locations', data);
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
      const res = await api.put(`/api/locations/${id}`, data);
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
      await api.delete(`/api/locations/${id}`);
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
      const res = await api.post(`/api/locations/${locationId}/assign-users`, { userIds });
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
      const res = await api.put('/api/system/settings', {
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
      const res = await api.put('/api/system/settings', {
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

  // Configuration mutations
  const updateZoomConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { zoom: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Zoom configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Zoom configuration');
      }
    }
  );

  const updateTeamsConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { teams: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Teams configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Teams configuration');
      }
    }
  );

  const updateSipConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { sip: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('SIP configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save SIP configuration');
      }
    }
  );

  const updateMatrixConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { matrix: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Matrix configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Matrix configuration');
      }
    }
  );

  const updateMediasoupConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { mediasoup: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('MediaSoup configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save MediaSoup configuration');
      }
    }
  );

  const updateFederationConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { federation: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Federation configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Federation configuration');
      }
    }
  );

  const updateAdConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { activeDirectory: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Active Directory configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Active Directory configuration');
      }
    }
  );

  const updateComplianceConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { compliance: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Compliance configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save Compliance configuration');
      }
    }
  );

  const updateIconConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { icons: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Icon configuration saved successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save icon configuration');
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
          <Tab $active={activeTab === 'zoom'} onClick={() => setActiveTab('zoom')}>
            <FiVideo />
            Zoom
          </Tab>
          <Tab $active={activeTab === 'teams'} onClick={() => setActiveTab('teams')}>
            <FiVideo />
            Teams
          </Tab>
          <Tab $active={activeTab === 'sip'} onClick={() => setActiveTab('sip')}>
            <FiPhone />
            SIP
          </Tab>
          <Tab $active={activeTab === 'matrix'} onClick={() => setActiveTab('matrix')}>
            <FiServer />
            Matrix
          </Tab>
          <Tab $active={activeTab === 'mediasoup'} onClick={() => setActiveTab('mediasoup')}>
            <FiSettings />
            MediaSoup
          </Tab>
          <Tab $active={activeTab === 'federation'} onClick={() => setActiveTab('federation')}>
            <FiServer />
            Federation
          </Tab>
          <Tab $active={activeTab === 'ad'} onClick={() => setActiveTab('ad')}>
            <FiUsers />
            Active Directory
          </Tab>
          <Tab $active={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')}>
            <FiShield />
            Compliance
          </Tab>
          <Tab $active={activeTab === 'icons'} onClick={() => setActiveTab('icons')}>
            <FiSettings />
            Client Icons
          </Tab>
          <Tab $active={activeTab === 'user-intercom'} onClick={() => setActiveTab('user-intercom')}>
            <FiGrid />
            User Intercom
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

   {activeTab === 'zoom' && (
     <Section>
       <SectionTitle>
         <FiVideo />
         Zoom Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={zoomConfig.enabled}
             onChange={(e) => setZoomConfig({ ...zoomConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Zoom Integration</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>Client ID</Label>
         <Input
           type="text"
           value={zoomConfig.clientId}
           onChange={(e) => setZoomConfig({ ...zoomConfig, clientId: e.target.value })}
           placeholder="Zoom OAuth Client ID"
         />
       </FormGroup>
       <FormGroup>
         <Label>Client Secret</Label>
         <Input
           type="password"
           value={zoomConfig.clientSecret}
           onChange={(e) => setZoomConfig({ ...zoomConfig, clientSecret: e.target.value })}
           placeholder="Leave blank to keep existing secret"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the secret
         </div>
       </FormGroup>
       <FormGroup>
         <Label>Redirect URI</Label>
         <Input
           type="text"
           value={zoomConfig.redirectUri}
           onChange={(e) => setZoomConfig({ ...zoomConfig, redirectUri: e.target.value })}
           placeholder="https://yourdomain.com/api/zoom/callback"
         />
       </FormGroup>
       <FormGroup>
         <Label>Account ID (Server-to-Server OAuth)</Label>
         <Input
           type="text"
           value={zoomConfig.accountId}
           onChange={(e) => setZoomConfig({ ...zoomConfig, accountId: e.target.value })}
           placeholder="Zoom Account ID"
         />
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={zoomConfig.allowDirectAuth}
             onChange={(e) => setZoomConfig({ ...zoomConfig, allowDirectAuth: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Allow Direct API Key/Secret Authentication</span>
         </label>
       </FormGroup>
       <Button $primary onClick={() => updateZoomConfigMutation.mutate(zoomConfig)}>
         <FiSave />
         Save Zoom Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'teams' && (
     <Section>
       <SectionTitle>
         <FiVideo />
         Microsoft Teams Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={teamsConfig.enabled}
             onChange={(e) => setTeamsConfig({ ...teamsConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Teams Integration</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>Client ID (Application ID)</Label>
         <Input
           type="text"
           value={teamsConfig.clientId}
           onChange={(e) => setTeamsConfig({ ...teamsConfig, clientId: e.target.value })}
           placeholder="Azure AD Application (Client) ID"
         />
       </FormGroup>
       <FormGroup>
         <Label>Client Secret</Label>
         <Input
           type="password"
           value={teamsConfig.clientSecret}
           onChange={(e) => setTeamsConfig({ ...teamsConfig, clientSecret: e.target.value })}
           placeholder="Leave blank to keep existing secret"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the secret
         </div>
       </FormGroup>
       <FormGroup>
         <Label>Tenant ID</Label>
         <Input
           type="text"
           value={teamsConfig.tenantId}
           onChange={(e) => setTeamsConfig({ ...teamsConfig, tenantId: e.target.value })}
           placeholder="Azure AD Tenant ID (or 'common')"
         />
       </FormGroup>
       <FormGroup>
         <Label>Redirect URI</Label>
         <Input
           type="text"
           value={teamsConfig.redirectUri}
           onChange={(e) => setTeamsConfig({ ...teamsConfig, redirectUri: e.target.value })}
           placeholder="https://yourdomain.com/api/teams/callback"
         />
       </FormGroup>
       <Button $primary onClick={() => updateTeamsConfigMutation.mutate(teamsConfig)}>
         <FiSave />
         Save Teams Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'sip' && (
     <Section>
       <SectionTitle>
         <FiPhone />
         SIP Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={sipConfig.enabled}
             onChange={(e) => setSipConfig({ ...sipConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable SIP Service</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>SIP Host</Label>
         <Input
           type="text"
           value={sipConfig.host}
           onChange={(e) => setSipConfig({ ...sipConfig, host: e.target.value })}
           placeholder="localhost"
         />
       </FormGroup>
       <FormGroup>
         <Label>SIP Port</Label>
         <Input
           type="number"
           value={sipConfig.port}
           onChange={(e) => setSipConfig({ ...sipConfig, port: parseInt(e.target.value) || 5060 })}
           min="1"
           max="65535"
         />
       </FormGroup>
       <FormGroup>
         <Label>SIP Domain</Label>
         <Input
           type="text"
           value={sipConfig.domain}
           onChange={(e) => setSipConfig({ ...sipConfig, domain: e.target.value })}
           placeholder="sip.example.com"
         />
       </FormGroup>
       <FormGroup>
         <Label>SIP Password</Label>
         <Input
           type="password"
           value={sipConfig.password}
           onChange={(e) => setSipConfig({ ...sipConfig, password: e.target.value })}
           placeholder="Leave blank to keep existing password"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the password
         </div>
       </FormGroup>
       <Button $primary onClick={() => updateSipConfigMutation.mutate(sipConfig)}>
         <FiSave />
         Save SIP Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'matrix' && (
     <Section>
       <SectionTitle>
         <FiServer />
         Matrix Configuration
       </SectionTitle>
       <FormGroup>
         <Label>Matrix Server URL</Label>
         <Input
           type="text"
           value={matrixConfig.serverUrl}
           onChange={(e) => setMatrixConfig({ ...matrixConfig, serverUrl: e.target.value })}
           placeholder="https://matrix.org"
         />
       </FormGroup>
       <FormGroup>
         <Label>Access Token</Label>
         <Input
           type="password"
           value={matrixConfig.accessToken}
           onChange={(e) => setMatrixConfig({ ...matrixConfig, accessToken: e.target.value })}
           placeholder="Leave blank to keep existing token"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the access token
         </div>
       </FormGroup>
       <FormGroup>
         <Label>User ID</Label>
         <Input
           type="text"
           value={matrixConfig.userId}
           onChange={(e) => setMatrixConfig({ ...matrixConfig, userId: e.target.value })}
           placeholder="@user:matrix.org"
         />
       </FormGroup>
       <FormGroup>
         <Label>Device ID</Label>
         <Input
           type="text"
           value={matrixConfig.deviceId}
           onChange={(e) => setMatrixConfig({ ...matrixConfig, deviceId: e.target.value })}
           placeholder="Device identifier"
         />
       </FormGroup>
       <Button $primary onClick={() => updateMatrixConfigMutation.mutate(matrixConfig)}>
         <FiSave />
         Save Matrix Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'mediasoup' && (
     <Section>
       <SectionTitle>
         <FiSettings />
         MediaSoup Configuration
       </SectionTitle>
       <FormGroup>
         <Label>Number of Workers</Label>
         <Input
           type="number"
           value={mediasoupConfig.numWorkers}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, numWorkers: parseInt(e.target.value) || 4 })}
           min="1"
           max="16"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of MediaSoup worker processes (typically CPU cores)
         </div>
       </FormGroup>
       <FormGroup>
         <Label>Listen IP</Label>
         <Input
           type="text"
           value={mediasoupConfig.listenIp}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, listenIp: e.target.value })}
           placeholder="0.0.0.0"
         />
       </FormGroup>
       <FormGroup>
         <Label>Announced IP</Label>
         <Input
           type="text"
           value={mediasoupConfig.announcedIp}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, announcedIp: e.target.value })}
           placeholder="Public IP address (if behind NAT)"
         />
       </FormGroup>
       <FormGroup>
         <Label>Log Level</Label>
         <Select
           value={mediasoupConfig.logLevel}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, logLevel: e.target.value })}
         >
           <option value="debug">Debug</option>
           <option value="warn">Warning</option>
           <option value="error">Error</option>
         </Select>
       </FormGroup>
       <FormGroup>
         <Label>Max Concurrent Groups</Label>
         <Input
           type="number"
           value={mediasoupConfig.maxConcurrentGroups}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, maxConcurrentGroups: parseInt(e.target.value) || 50 })}
           min="1"
           max="1000"
         />
       </FormGroup>
       <FormGroup>
         <Label>Max Participants Per Group</Label>
         <Input
           type="number"
           value={mediasoupConfig.maxParticipantsPerGroup}
           onChange={(e) => setMediasoupConfig({ ...mediasoupConfig, maxParticipantsPerGroup: parseInt(e.target.value) || 300 })}
           min="1"
           max="10000"
         />
       </FormGroup>
       <Button $primary onClick={() => updateMediasoupConfigMutation.mutate(mediasoupConfig)}>
         <FiSave />
         Save MediaSoup Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'federation' && (
     <Section>
       <SectionTitle>
         <FiServer />
         Federation Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={federationConfig.enabled}
             onChange={(e) => setFederationConfig({ ...federationConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Federation</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>Server ID</Label>
         <Input
           type="text"
           value={federationConfig.serverId}
           onChange={(e) => setFederationConfig({ ...federationConfig, serverId: e.target.value })}
           placeholder="intercom-server-01"
         />
       </FormGroup>
       <FormGroup>
         <Label>Server Name</Label>
         <Input
           type="text"
           value={federationConfig.serverName}
           onChange={(e) => setFederationConfig({ ...federationConfig, serverName: e.target.value })}
           placeholder="Trading Intercom Server"
         />
       </FormGroup>
       <FormGroup>
         <Label>Server URL</Label>
         <Input
           type="text"
           value={federationConfig.serverUrl}
           onChange={(e) => setFederationConfig({ ...federationConfig, serverUrl: e.target.value })}
           placeholder="ws://localhost:3001"
         />
       </FormGroup>
       <FormGroup>
         <Label>Federation Secret</Label>
         <Input
           type="password"
           value={federationConfig.federationSecret}
           onChange={(e) => setFederationConfig({ ...federationConfig, federationSecret: e.target.value })}
           placeholder="Leave blank to keep existing secret"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the secret
         </div>
       </FormGroup>
       <FormGroup>
         <Label>Max Connections</Label>
         <Input
           type="number"
           value={federationConfig.maxConnections}
           onChange={(e) => setFederationConfig({ ...federationConfig, maxConnections: parseInt(e.target.value) || 10 })}
           min="1"
           max="100"
         />
       </FormGroup>
       <FormGroup>
         <Label>Heartbeat Interval (ms)</Label>
         <Input
           type="number"
           value={federationConfig.heartbeatInterval}
           onChange={(e) => setFederationConfig({ ...federationConfig, heartbeatInterval: parseInt(e.target.value) || 30000 })}
           min="1000"
           max="300000"
         />
       </FormGroup>
       <FormGroup>
         <Label>Reconnect Interval (ms)</Label>
         <Input
           type="number"
           value={federationConfig.reconnectInterval}
           onChange={(e) => setFederationConfig({ ...federationConfig, reconnectInterval: parseInt(e.target.value) || 5000 })}
           min="1000"
           max="60000"
         />
       </FormGroup>
       <FormGroup>
         <Label>Max Reconnect Attempts</Label>
         <Input
           type="number"
           value={federationConfig.maxReconnectAttempts}
           onChange={(e) => setFederationConfig({ ...federationConfig, maxReconnectAttempts: parseInt(e.target.value) || 5 })}
           min="1"
           max="50"
         />
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={federationConfig.encryptionEnabled}
             onChange={(e) => setFederationConfig({ ...federationConfig, encryptionEnabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Encryption</span>
         </label>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={federationConfig.compressionEnabled}
             onChange={(e) => setFederationConfig({ ...federationConfig, compressionEnabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Compression</span>
         </label>
       </FormGroup>
       <Button $primary onClick={() => updateFederationConfigMutation.mutate(federationConfig)}>
         <FiSave />
         Save Federation Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'ad' && (
     <Section>
       <SectionTitle>
         <FiUsers />
         Active Directory Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={adConfig.enabled}
             onChange={(e) => setAdConfig({ ...adConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Active Directory</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>LDAP URL</Label>
         <Input
           type="text"
           value={adConfig.url}
           onChange={(e) => setAdConfig({ ...adConfig, url: e.target.value })}
           placeholder="ldap://localhost:389"
         />
       </FormGroup>
       <FormGroup>
         <Label>Base DN</Label>
         <Input
           type="text"
           value={adConfig.baseDN}
           onChange={(e) => setAdConfig({ ...adConfig, baseDN: e.target.value })}
           placeholder="dc=example,dc=com"
         />
       </FormGroup>
       <FormGroup>
         <Label>Bind DN</Label>
         <Input
           type="text"
           value={adConfig.bindDN}
           onChange={(e) => setAdConfig({ ...adConfig, bindDN: e.target.value })}
           placeholder="cn=admin,dc=example,dc=com"
         />
       </FormGroup>
       <FormGroup>
         <Label>Bind Password</Label>
         <Input
           type="password"
           value={adConfig.bindPassword}
           onChange={(e) => setAdConfig({ ...adConfig, bindPassword: e.target.value })}
           placeholder="Leave blank to keep existing password"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Only enter if you want to change the password
         </div>
       </FormGroup>
       <FormGroup>
         <Label>User Search Base</Label>
         <Input
           type="text"
           value={adConfig.userSearchBase}
           onChange={(e) => setAdConfig({ ...adConfig, userSearchBase: e.target.value })}
           placeholder="ou=users,dc=example,dc=com"
         />
       </FormGroup>
       <FormGroup>
         <Label>Group Search Base</Label>
         <Input
           type="text"
           value={adConfig.groupSearchBase}
           onChange={(e) => setAdConfig({ ...adConfig, groupSearchBase: e.target.value })}
           placeholder="ou=groups,dc=example,dc=com"
         />
       </FormGroup>
       <FormGroup>
         <Label>Sync Interval (ms)</Label>
         <Input
           type="number"
           value={adConfig.syncInterval}
           onChange={(e) => setAdConfig({ ...adConfig, syncInterval: parseInt(e.target.value) || 300000 })}
           min="60000"
           max="3600000"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           How often to sync users and groups from AD (default: 5 minutes)
         </div>
       </FormGroup>
       <Button $primary onClick={() => updateAdConfigMutation.mutate(adConfig)}>
         <FiSave />
         Save Active Directory Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'compliance' && (
     <Section>
       <SectionTitle>
         <FiShield />
         Compliance Configuration
       </SectionTitle>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.enabled}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, enabled: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Compliance Features</span>
         </label>
       </FormGroup>
       <FormGroup>
         <Label>Regulations (comma-separated)</Label>
         <Input
           type="text"
           value={complianceConfig.regulations.join(', ')}
           onChange={(e) => setComplianceConfig({ ...complianceConfig, regulations: e.target.value.split(',').map(r => r.trim()) })}
           placeholder="mifid2, dodd-frank, sox"
         />
       </FormGroup>
       <FormGroup>
         <Label>Retention Period (days)</Label>
         <Input
           type="number"
           value={complianceConfig.retentionPeriod}
           onChange={(e) => setComplianceConfig({ ...complianceConfig, retentionPeriod: parseInt(e.target.value) || 2555 })}
           min="1"
           max="36500"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Default: 7 years (2555 days)
         </div>
       </FormGroup>
       <FormGroup>
         <Label>Compliance Officer Email</Label>
         <Input
           type="email"
           value={complianceConfig.complianceOfficer}
           onChange={(e) => setComplianceConfig({ ...complianceConfig, complianceOfficer: e.target.value })}
           placeholder="compliance@example.com"
         />
       </FormGroup>
       <FormGroup>
         <Label>Reporting Interval (ms)</Label>
         <Input
           type="number"
           value={complianceConfig.reportingInterval}
           onChange={(e) => setComplianceConfig({ ...complianceConfig, reportingInterval: parseInt(e.target.value) || 86400000 })}
           min="3600000"
           max="604800000"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Default: 24 hours (86400000 ms)
         </div>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.auditLogging}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, auditLogging: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Audit Logging</span>
         </label>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.dataClassification}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, dataClassification: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Data Classification</span>
         </label>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.accessControl}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, accessControl: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Access Control</span>
         </label>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.encryptionRequired}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, encryptionRequired: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Require Encryption</span>
         </label>
       </FormGroup>
       <FormGroup>
         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
           <input
             type="checkbox"
             checked={complianceConfig.legalHold}
             onChange={(e) => setComplianceConfig({ ...complianceConfig, legalHold: e.target.checked })}
           />
           <span style={{ color: theme.colors.text }}>Enable Legal Hold</span>
         </label>
       </FormGroup>
       <Button $primary onClick={() => updateComplianceConfigMutation.mutate(complianceConfig)}>
         <FiSave />
         Save Compliance Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'icons' && (
     <Section>
       <SectionTitle>
         <FiImage />
         Client Icon Configuration
       </SectionTitle>
       <div style={{ marginBottom: '1.5rem', padding: '1rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
         <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
           Configure icons for Intercom and Dealerboard client types. You can use icon libraries (react-icons) or upload custom icons.
         </p>
       </div>

       {/* Intercom Icon Configuration */}
       <div style={{ marginBottom: '2rem', padding: '1.5rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
         <SectionTitle style={{ fontSize: '1rem', marginBottom: '1rem' }}>
           <FiPhone />
           Intercom Client Icons
         </SectionTitle>
         
         <FormGroup>
           <Label>Icon Library (react-icons/fi)</Label>
           <Select
             value={iconConfig.intercom.libraryIcon}
             onChange={(e) => setIconConfig({
               ...iconConfig,
               intercom: { ...iconConfig.intercom, libraryIcon: e.target.value }
             })}
           >
             <option value="FiPhone">Phone (FiPhone)</option>
             <option value="FiMic">Microphone (FiMic)</option>
             <option value="FiHeadphones">Headphones (FiHeadphones)</option>
             <option value="FiRadio">Radio (FiRadio)</option>
             <option value="FiMessageSquare">Message (FiMessageSquare)</option>
             <option value="FiVideo">Video (FiVideo)</option>
           </Select>
           <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
             Icon from react-icons/fi library to use for Intercom client
           </div>
         </FormGroup>

         <FormGroup>
           <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
             <input
               type="checkbox"
               checked={iconConfig.intercom.useCustomIcon}
               onChange={(e) => setIconConfig({
                 ...iconConfig,
                 intercom: { ...iconConfig.intercom, useCustomIcon: e.target.checked }
               })}
             />
             <span style={{ color: theme.colors.text, fontWeight: '500' }}>Use Custom Icon</span>
           </label>
         </FormGroup>

         {iconConfig.intercom.useCustomIcon && (
           <>
             <FormGroup>
               <Label>Custom Icon URL</Label>
               <Input
                 type="url"
                 value={iconConfig.intercom.customIconUrl}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   intercom: { ...iconConfig.intercom, customIconUrl: e.target.value }
                 })}
                 placeholder="https://example.com/icons/intercom-icon.png"
               />
               <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                 URL to a custom icon image (PNG, SVG, or ICO format)
               </div>
             </FormGroup>

             <FormGroup>
               <Label>Favicon URL (16x16 or 32x32)</Label>
               <Input
                 type="url"
                 value={iconConfig.intercom.favicon}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   intercom: { ...iconConfig.intercom, favicon: e.target.value }
                 })}
                 placeholder="https://example.com/favicon.ico"
               />
             </FormGroup>

             <FormGroup>
               <Label>App Icon URL (192x192 or 512x512)</Label>
               <Input
                 type="url"
                 value={iconConfig.intercom.appIcon}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   intercom: { ...iconConfig.intercom, appIcon: e.target.value }
                 })}
                 placeholder="https://example.com/app-icon.png"
               />
             </FormGroup>
           </>
         )}
       </div>

       {/* Dealerboard Icon Configuration */}
       <div style={{ marginBottom: '2rem', padding: '1.5rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
         <SectionTitle style={{ fontSize: '1rem', marginBottom: '1rem' }}>
           <FiGrid />
           Dealerboard Client Icons
         </SectionTitle>
         
         <FormGroup>
           <Label>Icon Library (react-icons/fi)</Label>
           <Select
             value={iconConfig.dealerboard.libraryIcon}
             onChange={(e) => setIconConfig({
               ...iconConfig,
               dealerboard: { ...iconConfig.dealerboard, libraryIcon: e.target.value }
             })}
           >
             <option value="FiGrid">Grid (FiGrid)</option>
             <option value="FiLayout">Layout (FiLayout)</option>
             <option value="FiMonitor">Monitor (FiMonitor)</option>
             <option value="FiTrendingUp">Trending (FiTrendingUp)</option>
             <option value="FiBarChart2">Chart (FiBarChart2)</option>
             <option value="FiPieChart">Pie Chart (FiPieChart)</option>
           </Select>
           <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
             Icon from react-icons/fi library to use for Dealerboard client
           </div>
         </FormGroup>

         <FormGroup>
           <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
             <input
               type="checkbox"
               checked={iconConfig.dealerboard.useCustomIcon}
               onChange={(e) => setIconConfig({
                 ...iconConfig,
                 dealerboard: { ...iconConfig.dealerboard, useCustomIcon: e.target.checked }
               })}
             />
             <span style={{ color: theme.colors.text, fontWeight: '500' }}>Use Custom Icon</span>
           </label>
         </FormGroup>

         {iconConfig.dealerboard.useCustomIcon && (
           <>
             <FormGroup>
               <Label>Custom Icon URL</Label>
               <Input
                 type="url"
                 value={iconConfig.dealerboard.customIconUrl}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   dealerboard: { ...iconConfig.dealerboard, customIconUrl: e.target.value }
                 })}
                 placeholder="https://example.com/icons/dealerboard-icon.png"
               />
               <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                 URL to a custom icon image (PNG, SVG, or ICO format)
               </div>
             </FormGroup>

             <FormGroup>
               <Label>Favicon URL (16x16 or 32x32)</Label>
               <Input
                 type="url"
                 value={iconConfig.dealerboard.favicon}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   dealerboard: { ...iconConfig.dealerboard, favicon: e.target.value }
                 })}
                 placeholder="https://example.com/favicon.ico"
               />
             </FormGroup>

             <FormGroup>
               <Label>App Icon URL (192x192 or 512x512)</Label>
               <Input
                 type="url"
                 value={iconConfig.dealerboard.appIcon}
                 onChange={(e) => setIconConfig({
                   ...iconConfig,
                   dealerboard: { ...iconConfig.dealerboard, appIcon: e.target.value }
                 })}
                 placeholder="https://example.com/app-icon.png"
               />
             </FormGroup>
           </>
         )}
       </div>

       <Button $primary onClick={() => updateIconConfigMutation.mutate(iconConfig)}>
         <FiSave />
         Save Icon Configuration
       </Button>
     </Section>
   )}

   {activeTab === 'user-intercom' && (
     <Section>
       <SectionTitle>
         <FiGrid />
         User Intercom Grid Configuration
       </SectionTitle>
       <div style={{ marginBottom: '1.5rem', padding: '1rem', background: theme.colors.surfaceElevated, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}` }}>
         <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
           Configure the grid layout for the User Intercom interface. This controls how contacts, groups, and broadcasts are displayed in a grid system.
         </p>
       </div>

       <FormGroup>
         <Label>Desktop Columns</Label>
         <Input
           type="number"
           min="1"
           max="6"
           value={gridConfig.columns}
           onChange={(e) => setGridConfig({ ...gridConfig, columns: parseInt(e.target.value) || 3 })}
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of columns for desktop view (1-6)
         </div>
       </FormGroup>

       <FormGroup>
         <Label>Desktop Gap</Label>
         <Input
           type="text"
           value={gridConfig.gap}
           onChange={(e) => setGridConfig({ ...gridConfig, gap: e.target.value })}
           placeholder="1rem"
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Gap between grid items (e.g., "1rem", "16px")
         </div>
       </FormGroup>

       <FormGroup>
         <Label>Tablet Columns</Label>
         <Input
           type="number"
           min="1"
           max="4"
           value={gridConfig.tabletColumns}
           onChange={(e) => setGridConfig({ ...gridConfig, tabletColumns: parseInt(e.target.value) || 2 })}
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of columns for tablet view (1-4)
         </div>
       </FormGroup>

       <FormGroup>
         <Label>Mobile Columns</Label>
         <Input
           type="number"
           min="1"
           max="3"
           value={gridConfig.mobileColumns}
           onChange={(e) => setGridConfig({ ...gridConfig, mobileColumns: parseInt(e.target.value) || 1 })}
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of columns for mobile view (1-3)
         </div>
       </FormGroup>

       <FormGroup>
         <Label>Mobile Gap</Label>
         <Input
           type="text"
           value={gridConfig.mobileGap}
           onChange={(e) => setGridConfig({ ...gridConfig, mobileGap: e.target.value })}
           placeholder="0.75rem"
         />
       </FormGroup>

       <SectionTitle style={{ fontSize: '1rem', marginTop: '2rem', marginBottom: '1rem' }}>
         Contact List Grid
       </SectionTitle>

       <FormGroup>
         <Label>Contact Columns</Label>
         <Input
           type="number"
           min="1"
           max="6"
           value={gridConfig.contactColumns}
           onChange={(e) => setGridConfig({ ...gridConfig, contactColumns: parseInt(e.target.value) || 2 })}
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of columns for contact lists (1-6)
         </div>
       </FormGroup>

       <FormGroup>
         <Label>Contact Gap</Label>
         <Input
           type="text"
           value={gridConfig.contactGap}
           onChange={(e) => setGridConfig({ ...gridConfig, contactGap: e.target.value })}
           placeholder="0.75rem"
         />
       </FormGroup>

       <FormGroup>
         <Label>Contact Mobile Columns</Label>
         <Input
           type="number"
           min="1"
           max="2"
           value={gridConfig.contactMobileColumns}
           onChange={(e) => setGridConfig({ ...gridConfig, contactMobileColumns: parseInt(e.target.value) || 1 })}
         />
         <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
           Number of columns for contact lists on mobile (1-2)
         </div>
       </FormGroup>

       <Button $primary onClick={() => updateGridConfigMutation.mutate(gridConfig)}>
         <FiSave />
         Save Grid Configuration
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

