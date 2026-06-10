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
  FiRefreshCw,
  FiCpu,
  FiVideo,
  FiPhone,
  FiShield,
  FiDatabase,
  FiImage,
  FiUpload,
  FiLink,
  FiGrid,
  FiMic
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import AdminSubscriberFleet from '../AdminSubscriberFleet/AdminSubscriberFleet';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: nowrap;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  padding-bottom: 0.5rem;

  &::-webkit-scrollbar {
    height: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.border};
    border-radius: 999px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
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
  flex: 0 0 auto;
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

const Card = styled.div`
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1rem;
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'platform_admin';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [locationRetentionEdits, setLocationRetentionEdits] = useState({});
  
  // Update activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      // Backwards-compat: recordings settings have moved under Compliance Management.
      if (initialTab === 'recordings') {
        setActiveTab('compliance');
        return;
      }
      if (initialTab === 'retention') {
        setActiveTab('compliance');
        return;
      }
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
  const [editingSubscriber, setEditingSubscriber] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [showSubscriberModal, setShowSubscriberModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showUserAssignmentModal, setShowUserAssignmentModal] = useState(false);
  const [selectedLocationForUsers, setSelectedLocationForUsers] = useState(null);
  const [showLocationSubscriberAssignmentModal, setShowLocationSubscriberAssignmentModal] = useState(false);
  const [selectedLocationForSubscriberAssignment, setSelectedLocationForSubscriberAssignment] = useState(null);
  const [portConfig, setPortConfig] = useState({
    conferencingPort: 3002,
    federationPort: 3002,
    rtcMinPort: 10000,
    rtcMaxPort: 10200
  });
  const [serverRole, setServerRole] = useState({
    role: 'publisher', // 'publisher' or 'subscriber'
    publisherUrl: '', // Only used if role is 'subscriber'
    enablePublisher: true,
    enableSubscriber: false,
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
  const [sipTrunkForm, setSipTrunkForm] = useState({
    id: '',
    name: '',
    host: '',
    port: '5060',
    username: '',
    password: '',
    domain: '',
    label: '',
  });
  const [sipRouteForm, setSipRouteForm] = useState({
    id: '',
    name: '',
    failbackToPrimary: true,
    trunkIds: [''],
  });
  const [sipRouteEditingId, setSipRouteEditingId] = useState('');
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
    auditLogging: false,
    dataClassification: false,
    accessControl: false,
    encryptionRequired: false,
    reportingInterval: 86400000,
    retentionPeriod: 2555,
    complianceOfficer: '',
    legalHold: false
  });

  const [intercomConfig, setIntercomConfig] = useState({
    duckingPercent: 50
  });
  const [recordingsConfig, setRecordingsConfig] = useState({
    allowDeletion: false,
    uploadChunkSeconds: 20
  });

  const [dialPlanCountryForm, setDialPlanCountryForm] = useState({ code: '', name: '' });
  const [dialPlanPlanForm, setDialPlanPlanForm] = useState({ countryCode: '', direction: 'outgoing', name: '', priority: 1000 });
  const [dialPlanRuleForm, setDialPlanRuleForm] = useState({ pattern: '', deleteDigits: 0, insertPrefix: '', priority: 1000, sipRouteId: '' });
  const [dialPlanEditingRuleId, setDialPlanEditingRuleId] = useState('');
  const [dialPlanSelectedCountry, setDialPlanSelectedCountry] = useState('');
  const [dialPlanSelectedDirection, setDialPlanSelectedDirection] = useState('outgoing');
  const [dialPlanSelectedPlanId, setDialPlanSelectedPlanId] = useState('');
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

  const { data: haSitesData, isLoading: loadingHaSites } = useQuery(
    'haSites',
    async () => {
      const res = await api.get('/api/platform-admin/ha/sites');
      return res.data?.sites || [];
    },
    { retry: 1, refetchOnWindowFocus: false }
  );

  const { data: haSiteFailoverMappingsData, isLoading: loadingHaSiteFailoverMappings } = useQuery(
    'haSiteFailoverMappings',
    async () => {
      const res = await api.get('/api/platform-admin/ha/failover/sites');
      return res.data?.mappings || [];
    },
    { retry: 1, refetchOnWindowFocus: false }
  );

  const [haSiteForm, setHaSiteForm] = useState({ id: '', name: '', isActive: true });
  const upsertHaSiteMutation = useMutation(
    async (payload) => {
      const res = await api.post('/api/platform-admin/ha/sites', payload);
      return res.data?.site;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('haSites');
        toast.success('Site saved');
        setHaSiteForm({ id: '', name: '', isActive: true });
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to save site';
        toast.error(msg);
      }
    }
  );

  const deleteHaSiteMutation = useMutation(
    async ({ siteId, force }) => {
      const qs = force ? '?force=true' : '';
      const res = await api.delete(`/api/platform-admin/ha/sites/${encodeURIComponent(siteId)}${qs}`);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('haSites');
        queryClient.invalidateQueries('haSiteFailoverMappings');
        toast.success('Site deleted');
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to delete site';
        toast.error(msg);
      }
    }
  );

  const [failoverSourceSiteId, setFailoverSourceSiteId] = useState('');
  const [failoverTargetSiteId, setFailoverTargetSiteId] = useState('');
  const [failoverReason, setFailoverReason] = useState('');

  const setSiteFailoverMutation = useMutation(
    async (payload) => {
      const res = await api.post('/api/platform-admin/ha/failover/sites', payload);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('haSiteFailoverMappings');
        toast.success('Failover mapping saved');
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to save failover mapping';
        toast.error(msg);
      }
    }
  );

  const revokeSiteFailoverMutation = useMutation(
    async (payload) => {
      const res = await api.post('/api/platform-admin/ha/failover/sites/revoke', payload);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('haSiteFailoverMappings');
        toast.success('Failover mapping revoked');
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to revoke failover mapping';
        toast.error(msg);
      }
    }
  );

  const [selectedHaSiteId, setSelectedHaSiteId] = useState('');

  const { data: siteEndpointsData, isLoading: loadingSiteEndpoints, refetch: refetchSiteEndpoints } = useQuery(
    ['haSiteEndpoints', selectedHaSiteId],
    async () => {
      if (!selectedHaSiteId) return [];
      const res = await api.get(`/api/platform-admin/ha/sites/${encodeURIComponent(selectedHaSiteId)}/subscriber-endpoints`);
      return res.data?.endpoints || [];
    },
    { enabled: !!selectedHaSiteId, retry: 1, refetchOnWindowFocus: false }
  );

  const createSiteEndpointMutation = useMutation(
    async (payload) => {
      const res = await api.post(
        `/api/platform-admin/ha/sites/${encodeURIComponent(selectedHaSiteId)}/subscriber-endpoints`,
        payload
      );
      return res.data?.endpoint;
    },
    {
      onSuccess: () => {
        toast.success('Endpoint added');
        refetchSiteEndpoints();
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to add endpoint';
        toast.error(msg);
      }
    }
  );

  const updateSiteEndpointMutation = useMutation(
    async ({ endpointId, payload }) => {
      const res = await api.put(
        `/api/platform-admin/ha/sites/${encodeURIComponent(selectedHaSiteId)}/subscriber-endpoints/${encodeURIComponent(endpointId)}`,
        payload
      );
      return res.data?.endpoint;
    },
    {
      onSuccess: () => {
        toast.success('Endpoint updated');
        refetchSiteEndpoints();
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to update endpoint';
        toast.error(msg);
      }
    }
  );

  const deleteSiteEndpointMutation = useMutation(
    async (endpointId) => {
      await api.delete(
        `/api/platform-admin/ha/sites/${encodeURIComponent(selectedHaSiteId)}/subscriber-endpoints/${encodeURIComponent(endpointId)}`
      );
    },
    {
      onSuccess: () => {
        toast.success('Endpoint deleted');
        refetchSiteEndpoints();
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to delete endpoint';
        toast.error(msg);
      }
    }
  );

  const handleLocationRetentionChange = (locationId, field, value) => {
    setLocationRetentionEdits(prev => ({
      ...prev,
      [locationId]: {
        ...(prev[locationId] || {}),
        [field]: value
      }
    }));
  };

  const saveLocationRetention = (locationId) => {
    const draft = locationRetentionEdits[locationId] || {};

    const toNumOrNull = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };

    updateLocationMutation.mutate({
      id: locationId,
      data: {
        voiceRetentionDays: toNumOrNull(draft.voiceRetentionDays),
        messagingRetentionDays: toNumOrNull(draft.messagingRetentionDays),
        dataRetentionDays: toNumOrNull(draft.dataRetentionDays),
      }
    }, {
      onSuccess: () => {
        setLocationRetentionEdits(prev => {
          const next = { ...prev };
          delete next[locationId];
          return next;
        });
      }
    });
  };

  // Fetch locations
  const { data: locationsData, isLoading: loadingLocations } = useQuery(
    'locations',
    async () => {
      const res = await api.get('/api/locations');
      return res.data.locations || [];
    }
  );

  const { data: dialPlanCountriesData } = useQuery(
    'dialPlanCountries',
    async () => {
      const res = await api.get('/api/system/countries');
      return res.data.countries || [];
    },
    {
      enabled: isAdmin,
      onSuccess: (data) => {
        if (!dialPlanSelectedCountry && Array.isArray(data) && data.length > 0) {
          setDialPlanSelectedCountry(String(data[0].code || ''));
          setDialPlanPlanForm(prev => ({ ...prev, countryCode: String(data[0].code || '') }));
        }
      }
    }
  );

  const { data: dialPlansData } = useQuery(
    ['dialPlans', dialPlanSelectedCountry, dialPlanSelectedDirection],
    async () => {
      const params = new URLSearchParams();
      if (dialPlanSelectedCountry) params.set('countryCode', dialPlanSelectedCountry);
      if (dialPlanSelectedDirection) params.set('direction', dialPlanSelectedDirection);
      const res = await api.get(`/api/system/dial-plans?${params.toString()}`);
      return res.data.dialPlans || [];
    },
    {
      enabled: isAdmin,
      onSuccess: (data) => {
        if (!dialPlanSelectedPlanId && Array.isArray(data) && data.length > 0) {
          setDialPlanSelectedPlanId(String(data[0].id || ''));
        }
      }
    }
  );

  const { data: dialPlanRulesData } = useQuery(
    ['dialPlanRules', dialPlanSelectedPlanId],
    async () => {
      if (!dialPlanSelectedPlanId) return [];
      const res = await api.get(`/api/system/dial-plans/${dialPlanSelectedPlanId}/rules`);
      return res.data.rules || [];
    },
    {
      enabled: isAdmin && !!dialPlanSelectedPlanId
    }
  );

  const { data: sipTrunksData } = useQuery(
    'sipTrunks',
    async () => {
      const res = await api.get('/api/system/sip-trunks');
      return res.data.trunks || [];
    },
    { enabled: isAdmin }
  );

  const { data: sipRoutesAdminData } = useQuery(
    'sipRoutesAdmin',
    async () => {
      const res = await api.get('/api/system/sip-routes');
      return res.data.routes || [];
    },
    { enabled: isAdmin }
  );

  // Fetch all users for assignment
  const { data: allUsersData, isLoading: loadingUsers } = useQuery(
    'allUsers',
    async () => {
      const res = await api.get('/api/auth/users');
      return res.data?.users || [];
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
      enabled: isAdmin,
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
            auditLogging: data.compliance.auditLogging || false,
            dataClassification: data.compliance.dataClassification || false,
            accessControl: data.compliance.accessControl || false,
            encryptionRequired: data.compliance.encryptionRequired || false,
            reportingInterval: data.compliance.reportingInterval || 86400000,
            retentionPeriod: parseInt(data.compliance.retentionPeriod, 10) || 2555,
            complianceOfficer: data.compliance.complianceOfficer || '',
            legalHold: data.compliance.legalHold || false
          });
        }

        setIntercomConfig({
          duckingPercent: typeof data?.intercom?.duckingPercent === 'number' ? data.intercom.duckingPercent : 50
        });

        setRecordingsConfig({
          allowDeletion: Boolean(data?.recordings?.allowDeletion),
          uploadChunkSeconds: typeof data?.recordings?.uploadChunkSeconds === 'number'
            ? data.recordings.uploadChunkSeconds
            : 20
        });
      }
    }
  );

  const updateRecordingsConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { recordings: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Recordings settings updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update recordings settings');
      }
    }
  );

  const handleSaveRecordings = () => {
    updateRecordingsConfigMutation.mutate({
      allowDeletion: Boolean(recordingsConfig.allowDeletion),
      uploadChunkSeconds: parseInt(recordingsConfig.uploadChunkSeconds, 10) || 20
    });
  };

  const upsertDialPlanCountryMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/system/countries', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlanCountries');
        setDialPlanCountryForm({ code: '', name: '' });
        toast.success('Country saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save country');
      }
    }
  );

  const deleteDialPlanCountryMutation = useMutation(
    async (code) => {
      await api.delete(`/api/system/countries/${encodeURIComponent(code)}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlanCountries');
        queryClient.invalidateQueries('dialPlans');
        setDialPlanSelectedPlanId('');
        toast.success('Country deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete country');
      }
    }
  );

  const upsertDialPlanMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/system/dial-plans', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlans');
        toast.success('Dial plan saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save dial plan');
      }
    }
  );

  const deleteDialPlanMutation = useMutation(
    async (id) => {
      await api.delete(`/api/system/dial-plans/${encodeURIComponent(id)}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlans');
        setDialPlanSelectedPlanId('');
        toast.success('Dial plan deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete dial plan');
      }
    }
  );

  const upsertDialPlanRuleMutation = useMutation(
    async ({ planId, data }) => {
      const res = await api.post(`/api/system/dial-plans/${encodeURIComponent(planId)}/rules`, data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlanRules');
        setDialPlanRuleForm({ pattern: '', deleteDigits: 0, insertPrefix: '', priority: 1000, sipRouteId: '' });
        setDialPlanEditingRuleId('');
        toast.success('Rule saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save rule');
      }
    }
  );

  const deleteDialPlanRuleMutation = useMutation(
    async ({ planId, ruleId }) => {
      await api.delete(`/api/system/dial-plans/${encodeURIComponent(planId)}/rules/${encodeURIComponent(ruleId)}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('dialPlanRules');
        toast.success('Rule deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete rule');
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

  const { data: locationSubscriberAssignmentData, isLoading: loadingLocationSubscriberAssignment } = useQuery(
    ['locationSubscriberAssignment', selectedLocationForSubscriberAssignment?.id],
    async () => {
      if (!selectedLocationForSubscriberAssignment?.id) return null;
      const res = await api.get(`/api/locations/${selectedLocationForSubscriberAssignment.id}/subscriber-assignment`);
      return res.data?.assignment || null;
    },
    {
      enabled: !!selectedLocationForSubscriberAssignment?.id && showLocationSubscriberAssignmentModal,
    }
  );

  // Subscriber mutations
  const createSubscriberMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/subscribers', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscribers');
        queryClient.invalidateQueries('subscriberPortAllocations');
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
        queryClient.invalidateQueries('subscriberPortAllocations');
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

  const updateLocationSubscriberAssignmentMutation = useMutation(
    async ({ locationId, primarySubscriberId, secondarySubscriberId, notes }) => {
      const res = await api.put(`/api/locations/${locationId}/subscriber-assignment`, {
        primarySubscriberId,
        secondarySubscriberId,
        notes,
      });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('locations');
        queryClient.invalidateQueries(['locationSubscriberAssignment', selectedLocationForSubscriberAssignment?.id]);
        setShowLocationSubscriberAssignmentModal(false);
        setSelectedLocationForSubscriberAssignment(null);
        toast.success('Subscriber assignment updated');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update subscriber assignment');
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
        toast.success('Server role saved. Use Restart Server to apply subscriber/publisher connection changes.');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save server role configuration');
      }
    }
  );

  const restartServerMutation = useMutation(
    async () => {
      const res = await api.post('/api/system/server/restart');
      return res.data;
    },
    {
      onSuccess: (data) => {
        toast.success(data?.message || 'Server is restarting...', { duration: 8000 });
        setTimeout(() => {
          window.location.reload();
        }, 6000);
      },
      onError: (error) => {
        if (error?.response?.status === 404) {
          toast.error(
            'Restart API not loaded yet. Stop and start the server once from the terminal, then try again.',
            { duration: 8000 }
          );
          return;
        }
        toast.error(error.response?.data?.error || 'Failed to restart server');
      },
    }
  );

  const handleRestartServer = () => {
    const confirmed = window.confirm(
      'Restart the server now?\n\nActive calls and WebSocket connections will drop briefly. ' +
      'Save any settings first, then confirm to restart.'
    );
    if (!confirmed) return;
    restartServerMutation.mutate();
  };

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

  const upsertSipTrunkMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/system/sip-trunks', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('sipTrunks');
        queryClient.invalidateQueries('sipRoutesAdmin');
        queryClient.invalidateQueries('sipRoutes');
        setSipTrunkForm({ id: '', name: '', host: '', port: '5060', username: '', password: '', domain: '', label: '' });
        toast.success('SIP trunk saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save SIP trunk');
      }
    }
  );

  const deleteSipTrunkMutation = useMutation(
    async (id) => {
      await api.delete(`/api/system/sip-trunks/${encodeURIComponent(id)}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('sipTrunks');
        queryClient.invalidateQueries('sipRoutesAdmin');
        queryClient.invalidateQueries('sipRoutes');
        toast.success('SIP trunk deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete SIP trunk');
      }
    }
  );

  const upsertSipRouteMutation = useMutation(
    async (data) => {
      const res = await api.post('/api/system/sip-routes', data);
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('sipRoutesAdmin');
        queryClient.invalidateQueries('sipRoutes');
        setSipRouteForm({ id: '', name: '', failbackToPrimary: true, trunkIds: [''] });
        setSipRouteEditingId('');
        toast.success('SIP route saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save SIP route');
      }
    }
  );

  const deleteSipRouteMutation = useMutation(
    async (id) => {
      await api.delete(`/api/system/sip-routes/${encodeURIComponent(id)}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('sipRoutesAdmin');
        queryClient.invalidateQueries('sipRoutes');
        toast.success('SIP route deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete SIP route');
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

  const updateIntercomConfigMutation = useMutation(
    async (data) => {
      const res = await api.put('/api/system/settings', { intercom: data });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemSettings');
        toast.success('Intercom settings updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update intercom settings');
      }
    }
  );

  const handleSaveIntercom = () => {
    const duckingPercent = Number(intercomConfig.duckingPercent);
    if (!Number.isFinite(duckingPercent) || duckingPercent < 0 || duckingPercent > 100) {
      toast.error('Ducking percent must be between 0 and 100');
      return;
    }
    updateIntercomConfigMutation.mutate({ duckingPercent });
  };

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

  const handleManageSubscriberAssignment = (location) => {
    setSelectedLocationForSubscriberAssignment(location);
    setShowLocationSubscriberAssignmentModal(true);
  };

  const handleCloseLocationSubscriberAssignment = () => {
    setShowLocationSubscriberAssignmentModal(false);
    setSelectedLocationForSubscriberAssignment(null);
  };

  const handleSavePortConfig = () => {
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
    const enablePublisher = serverRole.enablePublisher !== undefined ? !!serverRole.enablePublisher : (serverRole.role === 'publisher');
    const enableSubscriber = serverRole.enableSubscriber !== undefined ? !!serverRole.enableSubscriber : (serverRole.role === 'subscriber');

    // If subscriber is enabled without publisher (subscriber-only), publisherUrl is required.
    // If hybrid (publisher + subscriber), publisherUrl can be blank (loopback will be applied server-side).
    if (enableSubscriber && !enablePublisher && !serverRole.publisherUrl?.trim()) {
      toast.error('Publisher Server URL is required when running in Subscriber-only mode');
      return;
    }

    if (!enablePublisher && !enableSubscriber) {
      toast.error('At least one capability must be enabled (Publisher and/or Subscriber)');
      return;
    }

    // Keep the "primary" role label as publisher whenever publisher capability is enabled.
    // This matches operational expectations: admin/config lives on the publisher; hybrid nodes are still primarily publishers.
    const roleToPersist = enablePublisher ? 'publisher' : 'subscriber';

    // Validate serverId is provided
    if (!serverRole.serverId?.trim()) {
      toast.error('Server ID is required');
      return;
    }

    updateServerRoleMutation.mutate({
      ...serverRole,
      role: roleToPersist,
      enablePublisher,
      enableSubscriber
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <TabsContainer>
          <Tab $active={activeTab === 'server-role'} onClick={() => setActiveTab('server-role')}>
            <FiCpu />
            Server Role
          </Tab>
          <Tab $active={activeTab === 'intercom'} onClick={() => setActiveTab('intercom')}>
            <FiPhone />
            Intercom
          </Tab>
          <Tab $active={activeTab === 'subscribers'} onClick={() => setActiveTab('subscribers')}>
            <FiServer />
            Subscriber Servers
          </Tab>
          <Tab $active={activeTab === 'sites'} onClick={() => setActiveTab('sites')}>
            <FiDatabase />
            Sites
          </Tab>
          <Tab $active={activeTab === 'locations'} onClick={() => setActiveTab('locations')}>
            <FiMapPin />
            Locations
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
          <Tab $active={activeTab === 'dial-plans'} onClick={() => setActiveTab('dial-plans')}>
            <FiPhone />
            Dial Plans
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
            Compliance Management
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
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    if (nextRole === 'publisher') {
                      setServerRole({ ...serverRole, role: nextRole, enablePublisher: true, enableSubscriber: false });
                      return;
                    }
                    if (nextRole === 'subscriber') {
                      setServerRole({ ...serverRole, role: nextRole, enablePublisher: false, enableSubscriber: true });
                      return;
                    }
                    setServerRole({ ...serverRole, role: nextRole });
                  }}
                >
                  <option value="publisher">Publisher (Central Server)</option>
                  <option value="subscriber">Subscriber (Connects to Publisher)</option>
                </Select>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Defines whether this server acts as a publisher (central) or subscriber (connects to publisher)
                </div>
              </FormGroup>

              <FormGroup>
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={serverRole.enablePublisher !== undefined ? Boolean(serverRole.enablePublisher) : serverRole.role === 'publisher'}
                    onChange={(e) => setServerRole({ ...serverRole, enablePublisher: e.target.checked })}
                  />
                  Enable Publisher capability
                </Label>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  When enabled, this node can act as a central publisher.
                </div>
              </FormGroup>

              <FormGroup>
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={serverRole.enableSubscriber !== undefined ? Boolean(serverRole.enableSubscriber) : serverRole.role === 'subscriber'}
                    onChange={(e) => setServerRole({ ...serverRole, enableSubscriber: e.target.checked })}
                  />
                  Enable Subscriber capability
                </Label>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  When enabled, this node will connect to a publisher. Turn on both Publisher + Subscriber to run a hybrid node.
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
              {Boolean(serverRole.enableSubscriber) && !Boolean(serverRole.enablePublisher) && (
                <>
                  <FormGroup>
                    <Label>Publisher Server URL *</Label>
                    <Input
                      value={serverRole.publisherUrl}
                      onChange={(e) => setServerRole({ ...serverRole, publisherUrl: e.target.value })}
                      placeholder="https://publisher.example.com:5000"
                      required={Boolean(serverRole.enableSubscriber) && !Boolean(serverRole.enablePublisher)}
                    />
                    <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                      URL of the publisher server to connect to (only required for subscribers)
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
              {Boolean(serverRole.enablePublisher) && !Boolean(serverRole.enableSubscriber) && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1f2937', borderRadius: theme.borderRadius.md, border: '1px solid #374151' }}>
                  <p style={{ margin: 0, color: '#10b981', fontSize: '0.875rem', fontWeight: 500 }}>
                    ✓ Publisher Mode: This server manages the central database and accepts connections from subscriber servers.
                  </p>
                </div>
              )}

              {Boolean(serverRole.enablePublisher) && Boolean(serverRole.enableSubscriber) && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1f2937', borderRadius: theme.borderRadius.md, border: '1px solid #374151' }}>
                  <p style={{ margin: 0, color: '#60a5fa', fontSize: '0.875rem', fontWeight: 500 }}>
                    ✓ Hybrid (Small-site) Mode: Run a publisher and a co-located subscriber instance on the same host for resilience. Subscriber ports are allocated from the pool on first connection.
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <Button $primary onClick={handleSaveServerRole} disabled={updateServerRoleMutation.isLoading}>
                  <FiSave />
                  Save Server Role Configuration
                </Button>
                <Button
                  onClick={handleRestartServer}
                  disabled={restartServerMutation.isLoading}
                  title="Gracefully restart the server process (applies role/SIP changes)"
                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                >
                  <FiRefreshCw style={{ animation: restartServerMutation.isLoading ? 'spin 1s linear infinite' : 'none' }} />
                  Restart Server
                </Button>
              </div>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.75rem' }}>
                Restart after changing publisher/subscriber mode or SIP settings. In development the server respawns automatically;
                in production use PM2/systemd to restart the process when it exits.
              </div>
            </Section>
          )}

          {activeTab === 'ports' && (
            <Section>
              <SectionTitle>
                <FiSettings />
                Port Configuration
              </SectionTitle>

              <FormGroup>
                <Label>Conferencing Port</Label>
                <Input
                  type="number"
                  value={portConfig.conferencingPort}
                  onChange={(e) => setPortConfig({ ...portConfig, conferencingPort: parseInt(e.target.value, 10) || 0 })}
                  placeholder="3002"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Used for conferencing / group call coordination (default 3002).
                </div>
              </FormGroup>

              <FormGroup>
                <Label>Federation Port</Label>
                <Input
                  type="number"
                  value={portConfig.federationPort}
                  onChange={(e) => setPortConfig({ ...portConfig, federationPort: parseInt(e.target.value, 10) || 0 })}
                  placeholder="3002"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Port used for server federation links (if enabled).
                </div>
              </FormGroup>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormGroup>
                  <Label>RTC Min Port</Label>
                  <Input
                    type="number"
                    value={portConfig.rtcMinPort}
                    onChange={(e) => setPortConfig({ ...portConfig, rtcMinPort: parseInt(e.target.value, 10) || 0 })}
                    placeholder="10000"
                  />
                </FormGroup>
                <FormGroup>
                  <Label>RTC Max Port</Label>
                  <Input
                    type="number"
                    value={portConfig.rtcMaxPort}
                    onChange={(e) => setPortConfig({ ...portConfig, rtcMaxPort: parseInt(e.target.value, 10) || 0 })}
                    placeholder="10200"
                  />
                </FormGroup>
              </div>

              <Button $primary onClick={handleSavePortConfig} disabled={updatePortConfigMutation.isLoading}>
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
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={!!zoomConfig.enabled}
                    onChange={(e) => setZoomConfig({ ...zoomConfig, enabled: e.target.checked })}
                  />
                  Enable Zoom integration
                </Label>
              </FormGroup>

              <FormGroup>
                <Label>Client ID</Label>
                <Input
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
                  placeholder="(leave blank to keep existing)"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  For security, the current secret is never shown. Leave blank to keep the existing value.
                </div>
              </FormGroup>

              <FormGroup>
                <Label>Redirect URI</Label>
                <Input
                  value={zoomConfig.redirectUri}
                  onChange={(e) => setZoomConfig({ ...zoomConfig, redirectUri: e.target.value })}
                  placeholder="https://your-server.example.com/api/zoom/oauth/callback"
                />
              </FormGroup>

              <FormGroup>
                <Label>Account ID</Label>
                <Input
                  value={zoomConfig.accountId}
                  onChange={(e) => setZoomConfig({ ...zoomConfig, accountId: e.target.value })}
                  placeholder="Zoom accountId (server-to-server OAuth)"
                />
              </FormGroup>

              <FormGroup>
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={!!zoomConfig.allowDirectAuth}
                    onChange={(e) => setZoomConfig({ ...zoomConfig, allowDirectAuth: e.target.checked })}
                  />
                  Allow direct auth (advanced)
                </Label>
              </FormGroup>

              <Button
                $primary
                onClick={() => {
                  const payload = { ...zoomConfig };
                  if (!payload.clientSecret?.trim()) {
                    delete payload.clientSecret;
                  }
                  updateZoomConfigMutation.mutate(payload);
                  // Clear secret input after save attempt
                  setZoomConfig(prev => ({ ...prev, clientSecret: '' }));
                }}
                disabled={updateZoomConfigMutation.isLoading}
              >
                <FiSave />
                Save Zoom Configuration
              </Button>
            </Section>
          )}

          {activeTab === 'teams' && (
            <Section>
              <SectionTitle>
                <FiVideo />
                Teams Configuration
              </SectionTitle>

              <FormGroup>
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={!!teamsConfig.enabled}
                    onChange={(e) => setTeamsConfig({ ...teamsConfig, enabled: e.target.checked })}
                  />
                  Enable Teams integration
                </Label>
              </FormGroup>

              <FormGroup>
                <Label>Client ID</Label>
                <Input
                  value={teamsConfig.clientId}
                  onChange={(e) => setTeamsConfig({ ...teamsConfig, clientId: e.target.value })}
                  placeholder="Azure app Client ID"
                />
              </FormGroup>

              <FormGroup>
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  value={teamsConfig.clientSecret}
                  onChange={(e) => setTeamsConfig({ ...teamsConfig, clientSecret: e.target.value })}
                  placeholder="(leave blank to keep existing)"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  For security, the current secret is never shown. Leave blank to keep the existing value.
                </div>
              </FormGroup>

              <FormGroup>
                <Label>Tenant ID</Label>
                <Input
                  value={teamsConfig.tenantId}
                  onChange={(e) => setTeamsConfig({ ...teamsConfig, tenantId: e.target.value })}
                  placeholder="Azure tenantId"
                />
              </FormGroup>

              <FormGroup>
                <Label>Redirect URI</Label>
                <Input
                  value={teamsConfig.redirectUri}
                  onChange={(e) => setTeamsConfig({ ...teamsConfig, redirectUri: e.target.value })}
                  placeholder="https://your-server.example.com/api/teams/oauth/callback"
                />
              </FormGroup>

              <Button
                $primary
                onClick={() => {
                  const payload = { ...teamsConfig };
                  if (!payload.clientSecret?.trim()) {
                    delete payload.clientSecret;
                  }
                  updateTeamsConfigMutation.mutate(payload);
                  setTeamsConfig(prev => ({ ...prev, clientSecret: '' }));
                }}
                disabled={updateTeamsConfigMutation.isLoading}
              >
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
                <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Checkbox
                    checked={!!sipConfig.enabled}
                    onChange={(e) => setSipConfig({ ...sipConfig, enabled: e.target.checked })}
                  />
                  Enable SIP integration
                </Label>
              </FormGroup>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <FormGroup>
                  <Label>Host</Label>
                  <Input
                    value={sipConfig.host}
                    onChange={(e) => setSipConfig({ ...sipConfig, host: e.target.value })}
                    placeholder="sip.example.com"
                  />
                </FormGroup>
                <FormGroup>
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={sipConfig.port}
                    onChange={(e) => setSipConfig({ ...sipConfig, port: parseInt(e.target.value, 10) || 0 })}
                    placeholder="5060"
                  />
                </FormGroup>
              </div>

              <FormGroup>
                <Label>Domain</Label>
                <Input
                  value={sipConfig.domain}
                  onChange={(e) => setSipConfig({ ...sipConfig, domain: e.target.value })}
                  placeholder="example.com"
                />
              </FormGroup>

              <FormGroup>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={sipConfig.password}
                  onChange={(e) => setSipConfig({ ...sipConfig, password: e.target.value })}
                  placeholder="(leave blank to keep existing)"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  For security, the current password is never shown. Leave blank to keep the existing value.
                </div>
              </FormGroup>

              <Button
                $primary
                onClick={() => {
                  const payload = { ...sipConfig };
                  if (!payload.password?.trim()) {
                    delete payload.password;
                  }
                  updateSipConfigMutation.mutate(payload);
                  setSipConfig(prev => ({ ...prev, password: '' }));
                }}
                disabled={updateSipConfigMutation.isLoading}
              >
                <FiSave />
                Save SIP Configuration
              </Button>

              <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <Card>
                  <h3 style={{ marginTop: 0 }}>SIP Trunks</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Name</Label>
                      <Input
                        value={sipTrunkForm.name}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Primary SBC"
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Host</Label>
                      <Input
                        value={sipTrunkForm.host}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="sbc.example.com"
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Port</Label>
                      <Input
                        value={sipTrunkForm.port}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, port: e.target.value }))}
                        placeholder="5060"
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Domain</Label>
                      <Input
                        value={sipTrunkForm.domain}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, domain: e.target.value }))}
                        placeholder="example.com"
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Username</Label>
                      <Input
                        value={sipTrunkForm.username}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, username: e.target.value }))}
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={sipTrunkForm.password}
                        onChange={(e) => setSipTrunkForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={sipTrunkForm.id ? '(leave blank to keep)' : ''}
                      />
                    </FormGroup>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <Button
                      $primary
                      type="button"
                      onClick={() => {
                        const name = String(sipTrunkForm.name || '').trim();
                        const host = String(sipTrunkForm.host || '').trim();
                        if (!name || !host) {
                          toast.error('Trunk name and host are required');
                          return;
                        }
                        const payload = {
                          id: sipTrunkForm.id || undefined,
                          name,
                          host,
                          port: parseInt(sipTrunkForm.port, 10) || 5060,
                          username: sipTrunkForm.username || '',
                          domain: sipTrunkForm.domain || '',
                          label: sipTrunkForm.label || name,
                          isActive: true,
                        };
                        if (sipTrunkForm.password?.trim()) {
                          payload.password = sipTrunkForm.password;
                        }
                        upsertSipTrunkMutation.mutate(payload);
                      }}
                      disabled={upsertSipTrunkMutation.isLoading}
                    >
                      {sipTrunkForm.id ? 'Save Trunk' : 'Add Trunk'}
                    </Button>
                    {sipTrunkForm.id && (
                      <Button
                        type="button"
                        onClick={() => setSipTrunkForm({ id: '', name: '', host: '', port: '5060', username: '', password: '', domain: '', label: '' })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  <Table style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <TableHeaderCell>Name</TableHeaderCell>
                        <TableHeaderCell>Host</TableHeaderCell>
                        <TableHeaderCell>Actions</TableHeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {(sipTrunksData || []).map(t => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>{t.host}:{t.port || 5060}</TableCell>
                          <TableCell>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setSipTrunkForm({
                                  id: t.id,
                                  name: t.name || '',
                                  host: t.host || '',
                                  port: String(t.port || 5060),
                                  username: t.username || '',
                                  password: '',
                                  domain: t.domain || '',
                                  label: t.label || '',
                                })}
                              >
                                <FiEdit />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  if (window.confirm(`Delete trunk ${t.name}?`)) {
                                    deleteSipTrunkMutation.mutate(t.id);
                                  }
                                }}
                                disabled={deleteSipTrunkMutation.isLoading}
                              >
                                <FiTrash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                </Card>

                <Card>
                  <h3 style={{ marginTop: 0 }}>SIP Routes</h3>
                  <FormGroup>
                    <Label>Route Name</Label>
                    <Input
                      value={sipRouteForm.name}
                      onChange={(e) => setSipRouteForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="UK Outbound"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Checkbox
                        checked={!!sipRouteForm.failbackToPrimary}
                        onChange={(e) => setSipRouteForm(prev => ({ ...prev, failbackToPrimary: e.target.checked }))}
                      />
                      Fail back to primary trunk
                    </Label>
                  </FormGroup>
                  <Label>Trunks (priority order)</Label>
                  {(sipRouteForm.trunkIds || ['']).map((trunkId, idx) => (
                    <div key={`route-trunk-${idx}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Select
                        value={trunkId}
                        onChange={(e) => {
                          const next = [...(sipRouteForm.trunkIds || [''])];
                          next[idx] = e.target.value;
                          setSipRouteForm(prev => ({ ...prev, trunkIds: next }));
                        }}
                      >
                        <option value="">Select trunk</option>
                        {(sipTrunksData || []).map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.host})</option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const next = (sipRouteForm.trunkIds || []).filter((_, i) => i !== idx);
                          setSipRouteForm(prev => ({ ...prev, trunkIds: next.length ? next : [''] }));
                        }}
                      >
                        <FiX />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSipRouteForm(prev => ({ ...prev, trunkIds: [...(prev.trunkIds || []), ''] }))}
                  >
                    <FiPlus />
                    Add Trunk
                  </Button>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <Button
                      $primary
                      type="button"
                      onClick={() => {
                        const name = String(sipRouteForm.name || '').trim();
                        if (!name) {
                          toast.error('Route name is required');
                          return;
                        }
                        const trunkIds = (sipRouteForm.trunkIds || []).filter(Boolean);
                        if (!trunkIds.length) {
                          toast.error('At least one trunk is required');
                          return;
                        }
                        upsertSipRouteMutation.mutate({
                          id: sipRouteForm.id || sipRouteEditingId || undefined,
                          name,
                          failbackToPrimary: sipRouteForm.failbackToPrimary !== false,
                          isActive: true,
                          trunks: trunkIds.map((id, priority) => ({ trunkId: id, priority: 1000 + priority })),
                        });
                      }}
                      disabled={upsertSipRouteMutation.isLoading}
                    >
                      {sipRouteForm.id || sipRouteEditingId ? 'Save Route' : 'Add Route'}
                    </Button>
                    {(sipRouteForm.id || sipRouteEditingId) && (
                      <Button
                        type="button"
                        onClick={() => {
                          setSipRouteForm({ id: '', name: '', failbackToPrimary: true, trunkIds: [''] });
                          setSipRouteEditingId('');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  <Table style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <TableHeaderCell>Name</TableHeaderCell>
                        <TableHeaderCell>Trunks</TableHeaderCell>
                        <TableHeaderCell>Actions</TableHeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {(sipRoutesAdminData || []).map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{(r.trunks || []).map(t => t.name || t.host).join(' → ') || '-'}</TableCell>
                          <TableCell>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  setSipRouteEditingId(String(r.id));
                                  setSipRouteForm({
                                    id: String(r.id),
                                    name: r.name || '',
                                    failbackToPrimary: r.failbackToPrimary !== false,
                                    trunkIds: (r.trunks || []).length ? r.trunks.map(t => t.trunkId) : [''],
                                  });
                                }}
                              >
                                <FiEdit />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  if (window.confirm(`Delete route ${r.name}?`)) {
                                    deleteSipRouteMutation.mutate(r.id);
                                  }
                                }}
                                disabled={deleteSipRouteMutation.isLoading}
                              >
                                <FiTrash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              </div>
            </Section>
          )}

          {activeTab === 'dial-plans' && (
            <Section>
              <SectionTitle>
                <FiPhone />
                Dial Plans
              </SectionTitle>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                <Card>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Countries</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Code</Label>
                      <Input
                        value={dialPlanCountryForm.code}
                        onChange={(e) => setDialPlanCountryForm(prev => ({ ...prev, code: e.target.value }))}
                        placeholder="UK"
                      />
                    </FormGroup>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Name</Label>
                      <Input
                        value={dialPlanCountryForm.name}
                        onChange={(e) => setDialPlanCountryForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="United Kingdom"
                      />
                    </FormGroup>
                    <Button
                      $primary
                      type="button"
                      onClick={() => {
                        const code = String(dialPlanCountryForm.code || '').trim().toUpperCase();
                        const name = String(dialPlanCountryForm.name || '').trim();
                        if (!code || !name) {
                          toast.error('Country code and name are required');
                          return;
                        }
                        upsertDialPlanCountryMutation.mutate({ code, name, isActive: true });
                      }}
                      disabled={upsertDialPlanCountryMutation.isLoading}
                    >
                      <FiPlus />
                      Save
                    </Button>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <Select
                      value={dialPlanSelectedCountry}
                      onChange={(e) => {
                        setDialPlanSelectedCountry(e.target.value);
                        setDialPlanPlanForm(prev => ({ ...prev, countryCode: e.target.value }));
                        setDialPlanSelectedPlanId('');
                      }}
                    >
                      <option value="">Select country</option>
                      {(dialPlanCountriesData || []).map(c => (
                        <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                      ))}
                    </Select>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (!dialPlanSelectedCountry) return;
                          if (window.confirm(`Delete country ${dialPlanSelectedCountry}? This will delete its dial plans and rules.`)) {
                            deleteDialPlanCountryMutation.mutate(dialPlanSelectedCountry);
                          }
                        }}
                        disabled={!dialPlanSelectedCountry || deleteDialPlanCountryMutation.isLoading}
                      >
                        <FiTrash2 />
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Plans + Rules</h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Country</Label>
                      <Select
                        value={dialPlanPlanForm.countryCode}
                        onChange={(e) => {
                          setDialPlanPlanForm(prev => ({ ...prev, countryCode: e.target.value }));
                          setDialPlanSelectedCountry(e.target.value);
                          setDialPlanSelectedPlanId('');
                        }}
                      >
                        <option value="">Select</option>
                        {(dialPlanCountriesData || []).map(c => (
                          <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                      </Select>
                    </FormGroup>

                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Direction</Label>
                      <Select
                        value={dialPlanSelectedDirection}
                        onChange={(e) => {
                          setDialPlanSelectedDirection(e.target.value);
                          setDialPlanPlanForm(prev => ({ ...prev, direction: e.target.value }));
                          setDialPlanSelectedPlanId('');
                        }}
                      >
                        <option value="outgoing">Outgoing</option>
                        <option value="incoming">Incoming</option>
                      </Select>
                    </FormGroup>

                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Name</Label>
                      <Input
                        value={dialPlanPlanForm.name}
                        onChange={(e) => setDialPlanPlanForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Default"
                      />
                    </FormGroup>

                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Priority</Label>
                      <Input
                        value={String(dialPlanPlanForm.priority)}
                        onChange={(e) => setDialPlanPlanForm(prev => ({ ...prev, priority: e.target.value }))}
                        placeholder="1000"
                      />
                    </FormGroup>

                    <Button
                      $primary
                      type="button"
                      onClick={() => {
                        const payload = {
                          countryCode: String(dialPlanPlanForm.countryCode || '').trim().toUpperCase(),
                          direction: String(dialPlanSelectedDirection || 'outgoing'),
                          name: String(dialPlanPlanForm.name || '').trim() || 'Default',
                          priority: parseInt(dialPlanPlanForm.priority, 10) || 1000,
                          isActive: true
                        };
                        if (!payload.countryCode) {
                          toast.error('Select a country');
                          return;
                        }
                        upsertDialPlanMutation.mutate(payload);
                      }}
                      disabled={upsertDialPlanMutation.isLoading}
                    >
                      <FiPlus />
                      Save Plan
                    </Button>
                  </div>

                  <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '2fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Existing Plans</Label>
                      <Select
                        value={dialPlanSelectedPlanId}
                        onChange={(e) => setDialPlanSelectedPlanId(e.target.value)}
                      >
                        <option value="">Select plan</option>
                        {(dialPlansData || []).map(p => (
                          <option key={p.id} value={p.id}>{p.name} (prio {p.priority})</option>
                        ))}
                      </Select>
                    </FormGroup>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!dialPlanSelectedPlanId) return;
                        if (window.confirm('Delete this dial plan and all its rules?')) {
                          deleteDialPlanMutation.mutate(dialPlanSelectedPlanId);
                        }
                      }}
                      disabled={!dialPlanSelectedPlanId || deleteDialPlanMutation.isLoading}
                    >
                      <FiTrash2 />
                      Delete Plan
                    </Button>
                  </div>

                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginTop: 0 }}>Rules</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Pattern</Label>
                        <Input
                          value={dialPlanRuleForm.pattern}
                          onChange={(e) => setDialPlanRuleForm(prev => ({ ...prev, pattern: e.target.value }))}
                          placeholder="9XXXXXXXXXX"
                        />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Delete Digits</Label>
                        <Input
                          value={String(dialPlanRuleForm.deleteDigits)}
                          onChange={(e) => setDialPlanRuleForm(prev => ({ ...prev, deleteDigits: e.target.value }))}
                          placeholder="0"
                        />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Insert Prefix</Label>
                        <Input
                          value={dialPlanRuleForm.insertPrefix}
                          onChange={(e) => setDialPlanRuleForm(prev => ({ ...prev, insertPrefix: e.target.value }))}
                          placeholder="00"
                        />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Priority</Label>
                        <Input
                          value={String(dialPlanRuleForm.priority)}
                          onChange={(e) => setDialPlanRuleForm(prev => ({ ...prev, priority: e.target.value }))}
                          placeholder="1000"
                        />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>SIP Route</Label>
                        <Select
                          value={dialPlanRuleForm.sipRouteId || ''}
                          onChange={(e) => setDialPlanRuleForm(prev => ({ ...prev, sipRouteId: e.target.value }))}
                        >
                          <option value="">Default (line route)</option>
                          {(sipRoutesAdminData || []).map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </FormGroup>
                      <Button
                        $primary
                        type="button"
                        onClick={() => {
                          if (!dialPlanSelectedPlanId) {
                            toast.error('Select a plan first');
                            return;
                          }
                          const pattern = String(dialPlanRuleForm.pattern || '').trim();
                          if (!pattern) {
                            toast.error('Pattern is required');
                            return;
                          }
                          upsertDialPlanRuleMutation.mutate({
                            planId: dialPlanSelectedPlanId,
                            data: {
                              id: dialPlanEditingRuleId || undefined,
                              pattern,
                              deleteDigits: parseInt(dialPlanRuleForm.deleteDigits, 10) || 0,
                              insertPrefix: String(dialPlanRuleForm.insertPrefix || ''),
                              priority: parseInt(dialPlanRuleForm.priority, 10) || 1000,
                              sipRouteId: dialPlanRuleForm.sipRouteId || null,
                              isActive: true
                            }
                          });
                        }}
                        disabled={upsertDialPlanRuleMutation.isLoading}
                      >
                        <FiPlus />
                        {dialPlanEditingRuleId ? 'Save Rule' : 'Add Rule'}
                      </Button>

                      {dialPlanEditingRuleId && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setDialPlanRuleForm({ pattern: '', deleteDigits: 0, insertPrefix: '', priority: 1000, sipRouteId: '' });
                            setDialPlanEditingRuleId('');
                          }}
                        >
                          <FiX />
                          Cancel
                        </Button>
                      )}
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <Table>
                        <thead>
                          <tr>
                            <TableHeaderCell>Pattern</TableHeaderCell>
                            <TableHeaderCell>Delete</TableHeaderCell>
                            <TableHeaderCell>Insert</TableHeaderCell>
                            <TableHeaderCell>Priority</TableHeaderCell>
                            <TableHeaderCell>SIP Route</TableHeaderCell>
                            <TableHeaderCell>Actions</TableHeaderCell>
                          </tr>
                        </thead>
                        <tbody>
                          {(dialPlanRulesData || []).map(r => (
                            <TableRow key={r.id}>
                              <TableCell>{r.pattern}</TableCell>
                              <TableCell>{r.deleteDigits}</TableCell>
                              <TableCell>{r.insertPrefix}</TableCell>
                              <TableCell>{r.priority}</TableCell>
                              <TableCell>
                                {(sipRoutesAdminData || []).find(route => route.id === r.sipRouteId)?.name || '-'}
                              </TableCell>
                              <TableCell>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                      setDialPlanRuleForm({
                                        pattern: r.pattern,
                                        deleteDigits: r.deleteDigits,
                                        insertPrefix: r.insertPrefix,
                                        priority: r.priority,
                                        sipRouteId: r.sipRouteId || '',
                                      });
                                      setDialPlanEditingRuleId(String(r.id));
                                    }}
                                  >
                                    <FiEdit />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                      if (!dialPlanSelectedPlanId) return;
                                      if (window.confirm('Delete this rule?')) {
                                        deleteDialPlanRuleMutation.mutate({ planId: dialPlanSelectedPlanId, ruleId: r.id });
                                      }
                                    }}
                                    disabled={deleteDialPlanRuleMutation.isLoading}
                                  >
                                    <FiTrash2 />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </Card>
              </div>
            </Section>
          )}

          {activeTab === 'intercom' && (
            <Section>
              <SectionTitle>
                <FiPhone />
                Intercom Settings
              </SectionTitle>

              <FormGroup>
                <Label>Ducking % while transmitting</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={intercomConfig.duckingPercent}
                  onChange={(e) => setIntercomConfig({ ...intercomConfig, duckingPercent: e.target.value })}
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Reduces monitored audio volume while this client is transmitting (0 = no ducking, 100 = mute).
                </div>
              </FormGroup>

              <Button $primary onClick={handleSaveIntercom} disabled={updateIntercomConfigMutation.isLoading}>
                <FiSave />
                Save Intercom Settings
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

              <div style={{ marginTop: '1.5rem' }}>
                <SectionTitle>
                  <FiLink />
                  Site Subscriber Endpoints
                </SectionTitle>

                <FormGroup>
                  <Label>HA Site</Label>
                  <Select
                    value={selectedHaSiteId}
                    onChange={(e) => setSelectedHaSiteId(e.target.value)}
                    disabled={loadingHaSites}
                  >
                    <option value="">Select site...</option>
                    {(Array.isArray(haSitesData) ? haSitesData : []).map(s => (
                      <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}</option>
                    ))}
                  </Select>
                </FormGroup>

                {selectedHaSiteId && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Server URL</Label>
                        <Input id="new-site-endpoint-url" placeholder="https://subscriber-a:5000" />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Priority</Label>
                        <Input id="new-site-endpoint-priority" type="number" defaultValue={0} />
                      </FormGroup>
                      <FormGroup style={{ marginBottom: 0 }}>
                        <Label>Active</Label>
                        <Select id="new-site-endpoint-active" defaultValue="true">
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </Select>
                      </FormGroup>
                      <Button
                        $primary
                        onClick={() => {
                          const url = document.getElementById('new-site-endpoint-url')?.value;
                          const prio = document.getElementById('new-site-endpoint-priority')?.value;
                          const active = document.getElementById('new-site-endpoint-active')?.value;
                          createSiteEndpointMutation.mutate({
                            serverUrl: url,
                            priority: Number(prio),
                            isActive: String(active) === 'true'
                          });
                        }}
                        disabled={createSiteEndpointMutation.isLoading}
                      >
                        <FiPlus />
                        Add
                      </Button>
                    </div>

                    {loadingSiteEndpoints ? (
                      <div style={{ marginTop: '1rem' }}>Loading...</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell>Priority</TableHeaderCell>
                            <TableHeaderCell>Server URL</TableHeaderCell>
                            <TableHeaderCell>Active</TableHeaderCell>
                            <TableHeaderCell>Actions</TableHeaderCell>
                          </TableRow>
                        </TableHeader>
                        <tbody>
                          {(Array.isArray(siteEndpointsData) ? siteEndpointsData : []).map(ep => (
                            <TableRow key={ep.id}>
                              <TableCell>{ep.priority}</TableCell>
                              <TableCell>{ep.serverUrl}</TableCell>
                              <TableCell>{String(ep.isActive)}</TableCell>
                              <TableCell>
                                <ButtonGroup>
                                  <Button
                                    onClick={() => updateSiteEndpointMutation.mutate({ endpointId: ep.id, payload: { isActive: !ep.isActive } })}
                                    disabled={updateSiteEndpointMutation.isLoading}
                                    title="Toggle active"
                                  >
                                    <FiCheck />
                                  </Button>
                                  <Button
                                    onClick={() => deleteSiteEndpointMutation.mutate(ep.id)}
                                    disabled={deleteSiteEndpointMutation.isLoading}
                                    title="Delete"
                                  >
                                    <FiTrash2 />
                                  </Button>
                                </ButtonGroup>
                              </TableCell>
                            </TableRow>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </>
                )}
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <SectionTitle>
                  <FiLink />
                  Subscriber Fleet
                </SectionTitle>
                <AdminSubscriberFleet />
              </div>
            </Section>
          )}

          {activeTab === 'sites' && (
            <Section>
              <SectionTitle>
                <FiDatabase />
                Sites (HA / DC)
              </SectionTitle>

              <Card>
                <h3 style={{ marginTop: 0 }}>Create / Update Site</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                  <FormGroup style={{ marginBottom: 0 }}>
                    <Label>Site ID</Label>
                    <Input
                      value={haSiteForm.id}
                      onChange={(e) => setHaSiteForm(prev => ({ ...prev, id: e.target.value }))}
                      placeholder="NYC-DC1"
                    />
                  </FormGroup>
                  <FormGroup style={{ marginBottom: 0 }}>
                    <Label>Name</Label>
                    <Input
                      value={haSiteForm.name}
                      onChange={(e) => setHaSiteForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="New York DC1"
                    />
                  </FormGroup>
                  <FormGroup style={{ marginBottom: 0 }}>
                    <Label>Active</Label>
                    <Select
                      value={String(haSiteForm.isActive)}
                      onChange={(e) => setHaSiteForm(prev => ({ ...prev, isActive: String(e.target.value) === 'true' }))}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </Select>
                  </FormGroup>
                  <Button
                    $primary
                    type="button"
                    onClick={() => {
                      const id = String(haSiteForm.id || '').trim();
                      if (!id) {
                        toast.error('Site ID is required');
                        return;
                      }
                      upsertHaSiteMutation.mutate({
                        id,
                        name: String(haSiteForm.name || '').trim() || null,
                        isActive: haSiteForm.isActive,
                        metadata: {}
                      });
                    }}
                    disabled={upsertHaSiteMutation.isLoading}
                  >
                    <FiSave />
                    Save
                  </Button>
                </div>
              </Card>

              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>Existing Sites</h3>
                {loadingHaSites ? (
                  <div>Loading...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>ID</TableHeaderCell>
                        <TableHeaderCell>Name</TableHeaderCell>
                        <TableHeaderCell>Active</TableHeaderCell>
                        <TableHeaderCell>Actions</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <tbody>
                      {(Array.isArray(haSitesData) ? haSitesData : []).map(s => (
                        <TableRow key={s.id}>
                          <TableCell>{s.id}</TableCell>
                          <TableCell>{s.name || '-'}</TableCell>
                          <TableCell>{String(s.isActive)}</TableCell>
                          <TableCell>
                            <ButtonGroup>
                              <Button
                                type="button"
                                onClick={() => setHaSiteForm({ id: s.id, name: s.name || '', isActive: !!s.isActive })}
                                title="Edit"
                              >
                                <FiEdit />
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  upsertHaSiteMutation.mutate({
                                    id: String(s.id),
                                    name: s.name || null,
                                    isActive: !s.isActive,
                                    metadata: s.metadata || {}
                                  });
                                }}
                                disabled={upsertHaSiteMutation.isLoading}
                                title="Toggle active"
                              >
                                <FiCheck />
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  const siteId = String(s.id || '').trim();
                                  if (!siteId) return;
                                  const ok = window.confirm(`Delete site ${siteId}? This may break routing if still referenced.`);
                                  if (!ok) return;
                                  deleteHaSiteMutation.mutate({ siteId, force: false }, {
                                    onError: (error) => {
                                      const status = error?.response?.status;
                                      const serverMsg = error?.response?.data?.error;
                                      if (status === 409) {
                                        const okForce = window.confirm(`${serverMsg || 'Site is referenced by mappings.'}\n\nForce delete will remove mappings and endpoints. Continue?`);
                                        if (okForce) {
                                          deleteHaSiteMutation.mutate({ siteId, force: true });
                                        }
                                        return;
                                      }
                                      const msg = serverMsg || error?.message || 'Failed to delete site';
                                      toast.error(msg);
                                    }
                                  });
                                }}
                                disabled={deleteHaSiteMutation.isLoading}
                                title="Delete"
                              >
                                <FiTrash2 />
                              </Button>
                            </ButtonGroup>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <SectionTitle>
                  <FiLink />
                  Site Subscriber Endpoints
                </SectionTitle>

                <Card>
                  <FormGroup>
                    <Label>HA Site</Label>
                    <Select
                      value={selectedHaSiteId}
                      onChange={(e) => setSelectedHaSiteId(e.target.value)}
                      disabled={loadingHaSites}
                    >
                      <option value="">Select site...</option>
                      {(Array.isArray(haSitesData) ? haSitesData : []).map(s => (
                        <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}</option>
                      ))}
                    </Select>
                  </FormGroup>

                  {selectedHaSiteId && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        <FormGroup style={{ marginBottom: 0 }}>
                          <Label>Server URL</Label>
                          <Input id="new-site-endpoint-url-sites-tab" placeholder="https://subscriber-a:5000" />
                        </FormGroup>
                        <FormGroup style={{ marginBottom: 0 }}>
                          <Label>Priority</Label>
                          <Input id="new-site-endpoint-priority-sites-tab" type="number" defaultValue={0} />
                        </FormGroup>
                        <FormGroup style={{ marginBottom: 0 }}>
                          <Label>Active</Label>
                          <Select id="new-site-endpoint-active-sites-tab" defaultValue="true">
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </Select>
                        </FormGroup>
                        <Button
                          $primary
                          type="button"
                          onClick={() => {
                            const url = document.getElementById('new-site-endpoint-url-sites-tab')?.value;
                            const prio = document.getElementById('new-site-endpoint-priority-sites-tab')?.value;
                            const active = document.getElementById('new-site-endpoint-active-sites-tab')?.value;
                            createSiteEndpointMutation.mutate({
                              serverUrl: url,
                              priority: Number(prio),
                              isActive: String(active) === 'true'
                            });
                          }}
                          disabled={createSiteEndpointMutation.isLoading}
                        >
                          <FiPlus />
                          Add
                        </Button>
                      </div>

                      {loadingSiteEndpoints ? (
                        <div style={{ marginTop: '1rem' }}>Loading...</div>
                      ) : (
                        <Table style={{ marginTop: '1rem' }}>
                          <TableHeader>
                            <TableRow>
                              <TableHeaderCell>Priority</TableHeaderCell>
                              <TableHeaderCell>Server URL</TableHeaderCell>
                              <TableHeaderCell>Active</TableHeaderCell>
                              <TableHeaderCell>Actions</TableHeaderCell>
                            </TableRow>
                          </TableHeader>
                          <tbody>
                            {(Array.isArray(siteEndpointsData) ? siteEndpointsData : []).map(ep => (
                              <TableRow key={ep.id}>
                                <TableCell>{ep.priority}</TableCell>
                                <TableCell>{ep.serverUrl}</TableCell>
                                <TableCell>{String(ep.isActive)}</TableCell>
                                <TableCell>
                                  <ButtonGroup>
                                    <Button
                                      type="button"
                                      onClick={() => updateSiteEndpointMutation.mutate({ endpointId: ep.id, payload: { isActive: !ep.isActive } })}
                                      disabled={updateSiteEndpointMutation.isLoading}
                                      title="Toggle active"
                                    >
                                      <FiCheck />
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={() => deleteSiteEndpointMutation.mutate(ep.id)}
                                      disabled={deleteSiteEndpointMutation.isLoading}
                                      title="Delete"
                                    >
                                      <FiTrash2 />
                                    </Button>
                                  </ButtonGroup>
                                </TableCell>
                              </TableRow>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </>
                  )}
                </Card>

                <SectionTitle>
                  <FiLink />
                  Site-Wide Failover Mapping (Option 1)
                </SectionTitle>

                <Card>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Source Site</Label>
                      <Select value={failoverSourceSiteId} onChange={(e) => setFailoverSourceSiteId(e.target.value)}>
                        <option value="">Select source...</option>
                        {(Array.isArray(haSitesData) ? haSitesData : []).map(s => (
                          <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}</option>
                        ))}
                      </Select>
                    </FormGroup>

                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Target Site</Label>
                      <Select value={failoverTargetSiteId} onChange={(e) => setFailoverTargetSiteId(e.target.value)}>
                        <option value="">Select target...</option>
                        {(Array.isArray(haSitesData) ? haSitesData : []).map(s => (
                          <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}</option>
                        ))}
                      </Select>
                    </FormGroup>

                    <FormGroup style={{ marginBottom: 0 }}>
                      <Label>Reason</Label>
                      <Input value={failoverReason} onChange={(e) => setFailoverReason(e.target.value)} placeholder="Maintenance" />
                    </FormGroup>

                    <Button
                      $primary
                      type="button"
                      onClick={() => {
                        const sourceSiteId = String(failoverSourceSiteId || '').trim();
                        const targetSiteId = String(failoverTargetSiteId || '').trim();
                        if (!sourceSiteId) {
                          toast.error('Select a source site');
                          return;
                        }
                        if (!targetSiteId) {
                          toast.error('Select a target site');
                          return;
                        }
                        if (sourceSiteId === targetSiteId) {
                          toast.error('Source and target must be different');
                          return;
                        }
                        setSiteFailoverMutation.mutate({
                          sourceSiteId,
                          targetSiteId,
                          reason: String(failoverReason || '').trim() || null
                        });
                      }}
                      disabled={setSiteFailoverMutation.isLoading}
                    >
                      <FiSave />
                      Set
                    </Button>
                  </div>
                </Card>

                {loadingHaSiteFailoverMappings ? (
                  <div style={{ marginTop: '1rem' }}>Loading...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Source</TableHeaderCell>
                        <TableHeaderCell>Target</TableHeaderCell>
                        <TableHeaderCell>Active</TableHeaderCell>
                        <TableHeaderCell>Reason</TableHeaderCell>
                        <TableHeaderCell>Updated By</TableHeaderCell>
                        <TableHeaderCell>Actions</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <tbody>
                      {(Array.isArray(haSiteFailoverMappingsData) ? haSiteFailoverMappingsData : []).map(m => (
                        <TableRow key={String(m.sourceSiteId)}>
                          <TableCell>{m.sourceSiteId}</TableCell>
                          <TableCell>{m.targetSiteId || '-'}</TableCell>
                          <TableCell>{String(!!m.active)}</TableCell>
                          <TableCell>{m.reason || '-'}</TableCell>
                          <TableCell>{m.updatedBy || '-'}</TableCell>
                          <TableCell>
                            <ButtonGroup>
                              <Button
                                type="button"
                                onClick={() => {
                                  setFailoverSourceSiteId(String(m.sourceSiteId || ''));
                                  setFailoverTargetSiteId(String(m.targetSiteId || ''));
                                  setFailoverReason(String(m.reason || ''));
                                }}
                                title="Load into editor"
                              >
                                <FiEdit />
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  revokeSiteFailoverMutation.mutate({ sourceSiteId: String(m.sourceSiteId) });
                                }}
                                disabled={revokeSiteFailoverMutation.isLoading || !m.active}
                                title="Revoke"
                              >
                                <FiTrash2 />
                              </Button>
                            </ButtonGroup>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
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
                            <Button onClick={() => handleManageSubscriberAssignment(location)} title="Subscriber Assignment">
                              <FiServer />
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

          {activeTab === 'compliance' && (
            <Section>
              <SectionTitle>
                <FiShield />
                Compliance Management
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
                <Label>Recording Retention Period (days)</Label>
                <Input
                  type="number"
                  value={complianceConfig.retentionPeriod}
                  onChange={(e) => setComplianceConfig({ ...complianceConfig, retentionPeriod: parseInt(e.target.value) || 2555 })}
                  min="1"
                />
                <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                  Default: 7 years (2555 days)
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

              <div style={{ marginTop: '2rem' }}>
                <SectionTitle>
                  <FiMic />
                  Recordings
                </SectionTitle>

                <FormGroup>
                  <Label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Checkbox
                      checked={Boolean(recordingsConfig.allowDeletion)}
                      onChange={(e) => setRecordingsConfig({ ...recordingsConfig, allowDeletion: e.target.checked })}
                    />
                    Allow deleting recordings from admin portal
                  </Label>
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    When disabled, delete actions are hidden in the UI and the server rejects delete requests.
                  </div>
                </FormGroup>

                <FormGroup>
                  <Label>WPF recording upload chunk seconds (10-30)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="30"
                    value={String(recordingsConfig.uploadChunkSeconds ?? 20)}
                    onChange={(e) => setRecordingsConfig({ ...recordingsConfig, uploadChunkSeconds: e.target.value })}
                  />
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    WPF clients upload call recordings in rolling chunks to reduce loss if the endpoint fails.
                  </div>
                </FormGroup>

                <Button $primary onClick={handleSaveRecordings} disabled={updateRecordingsConfigMutation.isLoading}>
                  <FiSave />
                  Save Recordings Settings
                </Button>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <SectionTitle>
                  <FiClock />
                  Retention Rules by Location
                </SectionTitle>
                {locations.length === 0 ? (
                  <div>No locations configured. Create a location first to set retention rules.</div>
                ) : (
                  <div>
                    {locations.map((location) => (
                      <Card key={location.id} style={{ marginBottom: '1rem' }}>
                        <h3 style={{ marginTop: 0 }}>{location.name}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                          <FormGroup>
                            <Label>Voice retention (days)</Label>
                            <Input
                              type="number"
                              min="0"
                              value={
                                (locationRetentionEdits[location.id]?.voiceRetentionDays ?? (location.voiceRetentionDays ?? ''))
                              }
                              onChange={(e) => handleLocationRetentionChange(location.id, 'voiceRetentionDays', e.target.value)}
                              placeholder="Default"
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Messaging retention (days)</Label>
                            <Input
                              type="number"
                              min="0"
                              value={
                                (locationRetentionEdits[location.id]?.messagingRetentionDays ?? (location.messagingRetentionDays ?? ''))
                              }
                              onChange={(e) => handleLocationRetentionChange(location.id, 'messagingRetentionDays', e.target.value)}
                              placeholder="Default"
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Data retention (days)</Label>
                            <Input
                              type="number"
                              min="0"
                              value={
                                (locationRetentionEdits[location.id]?.dataRetentionDays ?? (location.dataRetentionDays ?? ''))
                              }
                              onChange={(e) => handleLocationRetentionChange(location.id, 'dataRetentionDays', e.target.value)}
                              placeholder="Default"
                            />
                          </FormGroup>
                        </div>
                        <Button $primary onClick={() => saveLocationRetention(location.id)}>
                          <FiSave />
                          Save Retention Rules
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
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
            haSites={haSitesData}
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

        {showLocationSubscriberAssignmentModal && selectedLocationForSubscriberAssignment && (
          <LocationSubscriberAssignmentModal
            location={selectedLocationForSubscriberAssignment}
            subscribers={subscribers}
            loading={loadingLocationSubscriberAssignment}
            assignment={locationSubscriberAssignmentData}
            onClose={handleCloseLocationSubscriberAssignment}
            onSave={({ primarySubscriberId, secondarySubscriberId, notes }) => {
              updateLocationSubscriberAssignmentMutation.mutate({
                locationId: selectedLocationForSubscriberAssignment.id,
                primarySubscriberId,
                secondarySubscriberId,
                notes,
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
  const initialAllowedServices = Array.isArray(subscriber?.metadata?.agent?.allowedServices)
    ? subscriber.metadata.agent.allowedServices
    : [];

  const [formData, setFormData] = useState({
    name: subscriber?.name || '',
    serverUrl: subscriber?.serverUrl || '',
    serverId: subscriber?.serverId || '',
    locationId: subscriber?.locationId || '',
    connectionPort: subscriber?.connectionPort || '',
    isActive: subscriber?.isActive !== false,
    metadata: subscriber?.metadata || {}
  });

  const [allowedServicesCsv, setAllowedServicesCsv] = useState(initialAllowedServices.join(', '));

  const handleSubmit = (e) => {
    e.preventDefault();
    const allowedServices = String(allowedServicesCsv || '')
      .split(',')
      .map(s => String(s).trim())
      .filter(Boolean);

    const mergedMetadata = {
      ...(formData.metadata || {}),
      agent: {
        ...((formData.metadata && formData.metadata.agent) ? formData.metadata.agent : {}),
        allowedServices
      }
    };

    onSave({
      ...formData,
      metadata: mergedMetadata,
    });
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
              placeholder="https://subscriber.example.com:5101"
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
              onChange={(e) => {
                const raw = String(e.target.value || '').trim();
                setFormData({ ...formData, connectionPort: raw === '' ? '' : parseInt(raw, 10) });
              }}
              min="1024"
              max="65535"
            />
            <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
              For managed subscribers this is assigned by the publisher from the configured port pool after first connection.
            </div>
          </FormGroup>

          <FormGroup>
            <Label>Allowed Services (comma-separated)</Label>
            <Input
              value={allowedServicesCsv}
              onChange={(e) => setAllowedServicesCsv(e.target.value)}
              placeholder="IntercomServer, IntercomSubscriber"
            />
            <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
              Used by Subscriber Fleet service-control dropdown. Stored on subscriber metadata as metadata.agent.allowedServices.
            </div>
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
const LocationModal = ({ location, onClose, onSave, haSites }) => {
  const [formData, setFormData] = useState({
    name: location?.name || '',
    description: location?.description || '',
    siteId: location?.siteId || '',
    timezone: location?.timezone || 'UTC',
    retentionDays: location?.retentionDays || 30,
    voiceRetentionDays: location?.voiceRetentionDays || location?.retentionDays || 30,
    voiceVoxSilenceSeconds: (location?.voiceVoxSilenceSeconds ?? 10),
    messagingRetentionDays: location?.messagingRetentionDays || location?.retentionDays || 30,
    dataRetentionDays: location?.dataRetentionDays || location?.retentionDays || 30,
    legalHold: location?.legalHold || false,
    sftpConfig: {
      ...(location?.sftpConfig || {}),
      type: (location?.sftpConfig?.type || 'sftp'),
      localCapGb: (location?.sftpConfig?.localCapGb ?? 10)
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      siteId: String(formData.siteId || '').trim() ? String(formData.siteId).trim() : null,
    });
  };

  const handleTestArchive = async () => {
    try {
      if (!location?.id) {
        toast.error('Save the location first, then run a test');
        return;
      }
      const response = await api.post(`/api/locations/${location.id}/test-archive`);
      const test = response?.data?.test;
      if (test?.ok) {
        toast.success(`Archive test succeeded: ${test.destination || 'OK'}`);
      } else {
        toast.error(`Archive test failed: ${test?.error || 'Unknown error'}`);
      }
    } catch (e) {
      toast.error(`Archive test failed: ${e?.response?.data?.details || e?.message || 'Unknown error'}`);
    }
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
            <Label>Site (HA / DC)</Label>
            <Select
              value={String(formData.siteId || '')}
              onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
            >
              <option value="">Select site...</option>
              {(Array.isArray(haSites) ? haSites : []).map(s => (
                <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}</option>
              ))}
            </Select>
            <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
              Used for cross-DC subscriber routing and HA ownership. Retention and archive settings remain location-based.
            </div>
          </FormGroup>

          <FormGroup>
            <Label>Timezone (IANA)</Label>
            <Input
              value={String(formData.timezone || 'UTC')}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              placeholder="Europe/London"
            />
          </FormGroup>

          <FormGroup>
            <Label>Voice VOX Silence Seconds</Label>
            <Input
              type="number"
              min="1"
              max="120"
              value={formData.voiceVoxSilenceSeconds}
              onChange={(e) => setFormData({ ...formData, voiceVoxSilenceSeconds: parseInt(e.target.value) || 10 })}
            />
            <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
              Broadcast VOX: stop recording after this many seconds of silence (default 10).
            </div>
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

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <SectionTitle style={{ fontSize: '1rem', marginBottom: '1rem' }}>
              Recording Storage Destination
            </SectionTitle>

            <FormGroup>
              <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Checkbox
                  checked={Boolean(formData.sftpConfig?.enabled)}
                  onChange={(e) => setFormData({
                    ...formData,
                    sftpConfig: { ...(formData.sftpConfig || {}), enabled: e.target.checked }
                  })}
                />
                Enable archive for this location
              </Label>
            </FormGroup>

            <FormGroup>
              <Label>Destination Type</Label>
              <Select
                value={String(formData.sftpConfig?.type || 'sftp')}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), type: e.target.value }
                })}
              >
                <option value="local">Local Folder</option>
                <option value="sftp">SFTP</option>
                <option value="smb">SMB (Network Share)</option>
                <option value="s3">S3 / S3-Compatible</option>
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Local Storage Cap (GB)</Label>
              <Input
                type="number"
                min="0"
                value={String(formData.sftpConfig?.localCapGb ?? 10)}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), localCapGb: parseFloat(e.target.value) }
                })}
              />
            </FormGroup>

            {(String(formData.sftpConfig?.type || 'sftp') === 'local' || String(formData.sftpConfig?.type || 'sftp') === 'folder') && (
              <>
                <FormGroup>
                  <Label>Local Folder Path</Label>
                  <Input
                    value={String(formData.sftpConfig?.localPath || formData.sftpConfig?.uncPath || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        type: 'local',
                        localPath: e.target.value,
                      }
                    })}
                    placeholder="E:\vr_storage"
                  />
                  <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '0.25rem' }}>
                    Voice recording archive folder on this server (e.g. E:\vr_storage). Enable archive and save the location before running a test.
                  </div>
                </FormGroup>
              </>
            )}

            {String(formData.sftpConfig?.type || 'sftp') === 'smb' && (
              <>
                <FormGroup>
                  <Label>UNC Path</Label>
                  <Input
                    value={String(formData.sftpConfig?.uncPath || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: { ...(formData.sftpConfig || {}), uncPath: e.target.value }
                    })}
                    placeholder="\\\\server\\share\\recordings"
                  />
                </FormGroup>
              </>
            )}

            {String(formData.sftpConfig?.type || 'sftp') === 's3' && (
              <>
                <FormGroup>
                  <Label>Bucket</Label>
                  <Input
                    value={String(formData.sftpConfig?.s3?.bucket || formData.sftpConfig?.bucket || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), bucket: e.target.value }
                      }
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Prefix (optional)</Label>
                  <Input
                    value={String(formData.sftpConfig?.s3?.prefix || formData.sftpConfig?.prefix || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), prefix: e.target.value }
                      }
                    })}
                    placeholder="location-a/recordings"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Region</Label>
                  <Input
                    value={String(formData.sftpConfig?.s3?.region || formData.sftpConfig?.region || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), region: e.target.value }
                      }
                    })}
                    placeholder="eu-west-2"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Endpoint URL (optional, for S3-compatible)</Label>
                  <Input
                    value={String(formData.sftpConfig?.s3?.endpointUrl || formData.sftpConfig?.endpointUrl || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), endpointUrl: e.target.value }
                      }
                    })}
                    placeholder="https://s3.company.local"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Access Key ID</Label>
                  <Input
                    type="password"
                    value={String(formData.sftpConfig?.s3?.accessKeyId || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), accessKeyId: e.target.value }
                      }
                    })}
                    placeholder="(stored securely)"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Secret Access Key</Label>
                  <Input
                    type="password"
                    value={String(formData.sftpConfig?.s3?.secretAccessKey || '')}
                    onChange={(e) => setFormData({
                      ...formData,
                      sftpConfig: {
                        ...(formData.sftpConfig || {}),
                        s3: { ...(formData.sftpConfig?.s3 || {}), secretAccessKey: e.target.value }
                      }
                    })}
                    placeholder="(stored securely)"
                  />
                </FormGroup>
              </>
            )}

            {String(formData.sftpConfig?.type || 'sftp') === 'sftp' && (
              <>

            <FormGroup>
              <Label>Host</Label>
              <Input
                value={String(formData.sftpConfig?.host || '')}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), host: e.target.value }
                })}
                placeholder="sftp.example.com"
              />
            </FormGroup>

            <FormGroup>
              <Label>Port</Label>
              <Input
                type="number"
                min="1"
                max="65535"
                value={String(formData.sftpConfig?.port ?? 22)}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), port: parseInt(e.target.value, 10) || 22 }
                })}
              />
            </FormGroup>

            <FormGroup>
              <Label>Username</Label>
              <Input
                value={String(formData.sftpConfig?.username || '')}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), username: e.target.value }
                })}
              />
            </FormGroup>

            <FormGroup>
              <Label>Password</Label>
              <Input
                type="password"
                value={String(formData.sftpConfig?.password || '')}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), password: e.target.value }
                })}
                placeholder="(stored in DB)"
              />
            </FormGroup>

            <FormGroup>
              <Label>Remote Path</Label>
              <Input
                value={String(formData.sftpConfig?.remotePath || '')}
                onChange={(e) => setFormData({
                  ...formData,
                  sftpConfig: { ...(formData.sftpConfig || {}), remotePath: e.target.value }
                })}
                placeholder="/recordings/location-a"
              />
            </FormGroup>

              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="button"
                onClick={() => setFormData({ ...formData, sftpConfig: { type: 'sftp', localCapGb: 10 } })}
              >
                Clear Storage Location
              </Button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <Button
                type="button"
                onClick={handleTestArchive}
                disabled={!location?.id}
              >
                Test Archive Destination
              </Button>
            </div>
          </div>
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
const getAssignableUserKey = (user) => String(user?.userId || user?.id || '');

const UserAssignmentModal = ({ location, allUsers, locationUsers, loadingUsers, onClose, onAssign }) => {
  const theme = useTheme();
  const locationUserKeys = new Set(
    (locationUsers || []).flatMap((user) => {
      const keys = [getAssignableUserKey(user)];
      if (user?.username) keys.push(String(user.username));
      return keys.filter(Boolean);
    })
  );

  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set(locationUserKeys));

  useEffect(() => {
    const keys = new Set(
      (locationUsers || []).flatMap((user) => {
        const keys = [getAssignableUserKey(user)];
        if (user?.username) keys.push(String(user.username));
        return keys.filter(Boolean);
      })
    );
    setSelectedUserIds(keys);
  }, [locationUsers]);

  const isUserSelected = (user) => {
    const keys = [getAssignableUserKey(user), user?.username].filter(Boolean).map(String);
    return keys.some((key) => selectedUserIds.has(key));
  };

  const handleToggleUser = (user) => {
    const keys = [getAssignableUserKey(user), user?.username].filter(Boolean).map(String);
    const canonical = getAssignableUserKey(user) || keys[0];
    const newSelected = new Set(selectedUserIds);
    const currentlySelected = keys.some((key) => newSelected.has(key));

    keys.forEach((key) => newSelected.delete(key));
    if (!currentlySelected && canonical) {
      newSelected.add(canonical);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const canonicalIds = Array.from(
      new Set(Array.from(selectedUserIds).map((value) => String(value).trim()).filter(Boolean))
    );
    onAssign(canonicalIds);
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
                      <TableRow key={getAssignableUserKey(user) || user.username}>
                        <TableCell>
                          <Checkbox
                            checked={isUserSelected(user)}
                            onChange={() => handleToggleUser(user)}
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

const LocationSubscriberAssignmentModal = ({ location, subscribers, assignment, loading, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    primarySubscriberId: assignment?.primarySubscriberId || '',
    secondarySubscriberId: assignment?.secondarySubscriberId || '',
    notes: assignment?.notes || '',
  });

  useEffect(() => {
    setFormData({
      primarySubscriberId: assignment?.primarySubscriberId || '',
      secondarySubscriberId: assignment?.secondarySubscriberId || '',
      notes: assignment?.notes || '',
    });
  }, [assignment]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      primarySubscriberId: formData.primarySubscriberId || null,
      secondarySubscriberId: formData.secondarySubscriberId || null,
      notes: formData.notes,
    });
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <ModalHeader>
          <ModalTitle>Subscriber Assignment - {location?.name}</ModalTitle>
          <ModalCloseButton onClick={onClose}>
            <FiX />
          </ModalCloseButton>
        </ModalHeader>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <FormGroup>
              <Label>Primary Subscriber</Label>
              <Select
                value={formData.primarySubscriberId}
                onChange={(e) => setFormData({ ...formData, primarySubscriberId: e.target.value })}
              >
                <option value="">None</option>
                {subscribers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.serverId})
                  </option>
                ))}
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Secondary Subscriber</Label>
              <Select
                value={formData.secondarySubscriberId}
                onChange={(e) => setFormData({ ...formData, secondarySubscriberId: e.target.value })}
              >
                <option value="">None</option>
                {subscribers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.serverId})
                  </option>
                ))}
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional"
              />
            </FormGroup>

            <ModalFooter>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button $primary type="submit">
                <FiCheck />
                Save
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};

export default AdminSystemSettings;

