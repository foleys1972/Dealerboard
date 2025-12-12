import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiShield, 
  FiLock, 
  FiKey, 
  FiFileText, 
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiDatabase,
  FiUsers,
  FiActivity,
  FiTrendingUp,
  FiTrendingDown,
  FiRefreshCw,
  FiDownload,
  FiEye,
  FiEdit,
  FiTrash2,
  FiPlus,
  FiSettings,
  FiFilter,
  FiSearch,
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

const ComplianceDashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
  height: 100%;
`;

const ComplianceHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const ComplianceTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const ComplianceActions = styled.div`
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

const ComplianceSection = styled(Card)`
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

const ComplianceStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.md};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => {
    switch (props.status) {
      case 'compliant': return '#e8f5e8';
      case 'warning': return '#fff3cd';
      case 'non-compliant': return '#f8d7da';
      default: return '#f8f9fa';
    }
  }};
  border: 1px solid ${props => {
    switch (props.status) {
      case 'compliant': return '#28a745';
      case 'warning': return '#ffc107';
      case 'non-compliant': return '#dc3545';
      default: return '#dee2e6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'compliant': return '#28a745';
      case 'warning': return '#856404';
      case 'non-compliant': return '#721c24';
      default: return '#495057';
    }
  }};
`;

const StatusIcon = styled.div`
  font-size: 1.5rem;
`;

const StatusText = styled.div`
  font-weight: 600;
  font-size: 1.125rem;
`;

const StatusDetails = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
`;

const EventsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const EventItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  transition: all 0.2s ease;

  &:hover {
    box-shadow: ${props => props.theme.shadows.sm};
  }
`;

const EventIcon = styled.div`
  font-size: 1.25rem;
  color: ${props => {
    switch (props.severity) {
      case 'high': return '#dc3545';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  }};
`;

const EventContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const EventTitle = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.875rem;
`;

const EventDescription = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EventTime = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
`;

const EventSeverity = styled(Badge)`
  font-size: 0.75rem;
`;

const EncryptionKeysList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const KeyItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
`;

const KeyIcon = styled.div`
  font-size: 1.25rem;
  color: ${props => props.theme.colors.accent};
`;

const KeyInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const KeyName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
`;

const KeyDetails = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const KeyStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const KeyActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
`;

const KeyActionButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
`;

const ComplianceDashboard = () => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [showAddKey, setShowAddKey] = useState(false);
  const [showComplianceReport, setShowComplianceReport] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  const queryClient = useQueryClient();

  // Fetch compliance status
  const { data: complianceStatus, isLoading: statusLoading } = useQuery(
    'compliance-status',
    async () => {
      const response = await axios.get('/api/compliance/status');
      return response.data.status;
    }
  );

  // Fetch compliance events
  const { data: complianceEvents, isLoading: eventsLoading } = useQuery(
    'compliance-events',
    async () => {
      const response = await axios.get('/api/compliance/events');
      return response.data.events;
    }
  );

  // Fetch encryption keys
  const { data: encryptionKeys, isLoading: keysLoading } = useQuery(
    'encryption-keys',
    async () => {
      const response = await axios.get('/api/compliance/encryption/keys');
      return response.data.keys;
    }
  );

  // Fetch audit log
  const { data: auditLog, isLoading: auditLoading } = useQuery(
    'audit-log',
    async () => {
      const response = await axios.get('/api/compliance/audit');
      return response.data.auditLog;
    }
  );

  // Generate compliance report
  const generateReportMutation = useMutation(
    async ({ startDate, endDate }) => {
      const response = await axios.get('/api/compliance/report', {
        params: { startDate, endDate }
      });
      return response.data.report;
    },
    {
      onSuccess: (report) => {
        setShowComplianceReport(true);
        toast.success('Compliance report generated');
      },
      onError: (error) => {
        toast.error('Failed to generate compliance report');
      }
    }
  );

  // Generate encryption key
  const generateKeyMutation = useMutation(
    async ({ purpose, metadata }) => {
      const response = await axios.post('/api/compliance/encryption/keys', {
        purpose,
        metadata
      });
      return response.data.key;
    },
    {
      onSuccess: (key) => {
        toast.success('Encryption key generated');
        queryClient.invalidateQueries('encryption-keys');
      },
      onError: (error) => {
        toast.error('Failed to generate encryption key');
      }
    }
  );

  // Rotate encryption key
  const rotateKeyMutation = useMutation(
    async (keyId) => {
      const response = await axios.post(`/api/compliance/encryption/keys/${keyId}/rotate`);
      return response.data.newKey;
    },
    {
      onSuccess: (key) => {
        toast.success('Encryption key rotated');
        queryClient.invalidateQueries('encryption-keys');
      },
      onError: (error) => {
        toast.error('Failed to rotate encryption key');
      }
    }
  );

  const handleGenerateReport = () => {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
    const endDate = new Date().toISOString();
    generateReportMutation.mutate({ startDate, endDate });
  };

  const handleGenerateKey = (purpose, metadata) => {
    generateKeyMutation.mutate({ purpose, metadata });
  };

  const handleRotateKey = (keyId) => {
    rotateKeyMutation.mutate(keyId);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries('compliance-status');
    await queryClient.invalidateQueries('compliance-events');
    await queryClient.invalidateQueries('encryption-keys');
    await queryClient.invalidateQueries('audit-log');
    toast.success('Compliance data refreshed');
  };

  if (statusLoading || eventsLoading || keysLoading || auditLoading) {
    return (
      <ComplianceDashboardContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </ComplianceDashboardContainer>
    );
  }

  return (
    <ComplianceDashboardContainer>
      <ComplianceHeader>
        <ComplianceTitle>
          <FiShield />
          Compliance Dashboard
        </ComplianceTitle>
        <ComplianceActions>
          <Button variant="secondary" onClick={handleRefresh}>
            <FiRefreshCw />
            Refresh
          </Button>
          <Button variant="primary" onClick={handleGenerateReport}>
            <FiDownload />
            Generate Report
          </Button>
        </ComplianceActions>
      </ComplianceHeader>

      {/* Stats Grid */}
      <StatsGrid columns={4}>
        <StatCard variant="primary">
          <StatIcon>
            <FiShield />
          </StatIcon>
          <StatValue>{complianceStatus?.overall || 'Unknown'}</StatValue>
          <StatLabel>Compliance Status</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiActivity />
          </StatIcon>
          <StatValue>{complianceEvents?.length || 0}</StatValue>
          <StatLabel>Compliance Events</StatLabel>
          <StatTrend>
            <FiTrendingDown />
            -0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiKey />
          </StatIcon>
          <StatValue>{encryptionKeys?.length || 0}</StatValue>
          <StatLabel>Encryption Keys</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiFileText />
          </StatIcon>
          <StatValue>{auditLog?.length || 0}</StatValue>
          <StatLabel>Audit Entries</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +0% this week
          </StatTrend>
        </StatCard>
      </StatsGrid>

      <ContentGrid columns={2}>
        {/* Compliance Status Section */}
        <ComplianceSection>
          <SectionHeader>
            <SectionTitle>
              <FiShield />
              Compliance Status
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiSettings />
                Configure
              </Button>
            </SectionActions>
          </SectionHeader>

          <ComplianceStatus status={complianceStatus?.overall}>
            <StatusIcon>
              {complianceStatus?.overall === 'compliant' ? (
                <FiCheckCircle />
              ) : complianceStatus?.overall === 'warning' ? (
                <FiAlertTriangle />
              ) : (
                <FiXCircle />
              )}
            </StatusIcon>
            <div>
              <StatusText>
                {complianceStatus?.overall === 'compliant' ? 'Compliant' : 
                 complianceStatus?.overall === 'warning' ? 'Warning' : 'Non-Compliant'}
              </StatusText>
              <StatusDetails>
                {complianceStatus?.violations || 0} violations, {complianceStatus?.warnings || 0} warnings
              </StatusDetails>
            </div>
          </ComplianceStatus>

          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600' }}>Regulations</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {complianceStatus?.regulations && Object.entries(complianceStatus.regulations).map(([regulation, status]) => (
                <Badge key={regulation} variant={status.status === 'compliant' ? 'success' : 'warning'}>
                  {regulation.toUpperCase()}: {status.status}
                </Badge>
              ))}
            </div>
          </div>
        </ComplianceSection>

        {/* Encryption Keys Section */}
        <ComplianceSection>
          <SectionHeader>
            <SectionTitle>
              <FiKey />
              Encryption Keys
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm" onClick={() => setShowAddKey(true)}>
                <FiPlus />
                Add Key
              </Button>
            </SectionActions>
          </SectionHeader>

          <EncryptionKeysList>
            {encryptionKeys?.length > 0 ? (
              encryptionKeys.map((key) => (
                <KeyItem key={key.id}>
                  <KeyIcon>
                    <FiKey />
                  </KeyIcon>
                  <KeyInfo>
                    <KeyName>{key.purpose}</KeyName>
                    <KeyDetails>
                      Created: {format(new Date(key.createdAt), 'MMM dd, yyyy')} • 
                      Expires: {format(new Date(key.expiresAt), 'MMM dd, yyyy')}
                    </KeyDetails>
                  </KeyInfo>
                  <KeyStatus variant={key.isActive ? 'success' : 'secondary'}>
                    {key.isActive ? 'Active' : 'Inactive'}
                  </KeyStatus>
                  <KeyActions>
                    <KeyActionButton
                      variant="secondary"
                      onClick={() => handleRotateKey(key.id)}
                      disabled={rotateKeyMutation.isLoading}
                    >
                      <FiRefreshCw />
                    </KeyActionButton>
                    <KeyActionButton
                      variant="secondary"
                      onClick={() => setSelectedEvent(key)}
                    >
                      <FiEye />
                    </KeyActionButton>
                  </KeyActions>
                </KeyItem>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                <FiKey style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }} />
                <div>No encryption keys</div>
              </div>
            )}
          </EncryptionKeysList>
        </ComplianceSection>

        {/* Compliance Events Section */}
        <ComplianceSection>
          <SectionHeader>
            <SectionTitle>
              <FiActivity />
              Recent Events
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiFilter />
                Filter
              </Button>
            </SectionActions>
          </SectionHeader>

          <EventsList>
            {complianceEvents?.length > 0 ? (
              complianceEvents.slice(0, 10).map((event) => (
                <EventItem key={event.id} onClick={() => setSelectedEvent(event)}>
                  <EventIcon severity={event.severity}>
                    {event.severity === 'high' ? (
                      <FiAlertTriangle />
                    ) : event.severity === 'medium' ? (
                      <FiClock />
                    ) : (
                      <FiCheckCircle />
                    )}
                  </EventIcon>
                  <EventContent>
                    <EventTitle>{event.event}</EventTitle>
                    <EventDescription>{event.details?.message || 'No description'}</EventDescription>
                  </EventContent>
                  <EventTime>
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </EventTime>
                  <EventSeverity variant={event.severity === 'high' ? 'error' : event.severity === 'medium' ? 'warning' : 'success'}>
                    {event.severity}
                  </EventSeverity>
                </EventItem>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                <FiActivity style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }} />
                <div>No compliance events</div>
              </div>
            )}
          </EventsList>
        </ComplianceSection>

        {/* Audit Log Section */}
        <ComplianceSection>
          <SectionHeader>
            <SectionTitle>
              <FiFileText />
              Audit Log
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiDownload />
                Export
              </Button>
            </SectionActions>
          </SectionHeader>

          <EventsList>
            {auditLog?.length > 0 ? (
              auditLog.slice(0, 10).map((entry) => (
                <EventItem key={entry.id}>
                  <EventIcon severity="low">
                    <FiFileText />
                  </EventIcon>
                  <EventContent>
                    <EventTitle>{entry.event}</EventTitle>
                    <EventDescription>{entry.details?.message || 'No description'}</EventDescription>
                  </EventContent>
                  <EventTime>
                    {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                  </EventTime>
                </EventItem>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                <FiFileText style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }} />
                <div>No audit entries</div>
              </div>
            )}
          </EventsList>
        </ComplianceSection>
      </ContentGrid>

      {/* Add Key Modal */}
      {showAddKey && (
        <AddKeyModal
          onSubmit={(keyData) => {
            handleGenerateKey(keyData.purpose, keyData.metadata);
            setShowAddKey(false);
          }}
          onClose={() => setShowAddKey(false)}
        />
      )}

      {/* Compliance Report Modal */}
      {showComplianceReport && (
        <ComplianceReportModal
          onClose={() => setShowComplianceReport(false)}
        />
      )}
    </ComplianceDashboardContainer>
  );
};

// Add Key Modal Component
const AddKeyModal = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    purpose: '',
    metadata: {}
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Generate Encryption Key</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Purpose</label>
                <Input
                  name="purpose"
                  value={formData.purpose}
                  onChange={handleChange}
                  placeholder="e.g., audio_recording, user_data"
                  required
                />
              </div>
              <div>
                <label>Description</label>
                <Input
                  name="description"
                  value={formData.metadata.description || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    metadata: { ...prev.metadata, description: e.target.value }
                  }))}
                  placeholder="Optional description"
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
            Generate Key
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Compliance Report Modal Component
const ComplianceReportModal = ({ onClose }) => {
  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Compliance Report</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <FiFileText style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }} />
            <div>Compliance report generated successfully</div>
            <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
              Report has been saved and is available for download
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary">
            <FiDownload />
            Download Report
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ComplianceDashboard;
