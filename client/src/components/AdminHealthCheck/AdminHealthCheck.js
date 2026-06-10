import React, { useState, useEffect } from 'react';
import styled, { ThemeProvider, useTheme } from 'styled-components';
import { 
  FiServer, 
  FiCpu,
  FiHardDrive,
  FiActivity,
  FiRefreshCw,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiWifi,
  FiDatabase,
  FiLink,
  FiRadio,
  FiUsers,
  FiVideo
} from 'react-icons/fi';
import { useQuery } from 'react-query';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
  padding: 1.5rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const RefreshButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surface};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  svg {
    animation: ${props => props.$refreshing ? 'spin 1s linear infinite' : 'none'};
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const StatusBadge = styled.span`
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.875rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: ${props => {
    if (props.$status === 'healthy') return '#10b981';
    if (props.$status === 'warning') return '#f59e0b';
    if (props.$status === 'degraded') return '#ef4444';
    return '#6b7280';
  }};
  color: #ffffff;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
`;

const Card = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const CardTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const CardIcon = styled.div`
  color: ${props => props.theme.colors.accent};
  font-size: 1.25rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  
  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  text-align: right;
`;

const ConnectionStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => {
    if (props.$connected) return '#10b981';
    return '#ef4444';
  }};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${props => props.theme.colors.surfaceElevated};
  border-radius: ${props => props.theme.borderRadius.full};
  overflow: hidden;
  margin-top: 0.5rem;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${props => {
    const percent = props.$percent || 0;
    if (percent < 50) return '#10b981';
    if (percent < 80) return '#f59e0b';
    return '#ef4444';
  }};
  width: ${props => `${props.$percent || 0}%`};
  transition: width 0.3s ease;
`;

const ErrorMessage = styled.div`
  padding: 1rem;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: ${props => props.theme.borderRadius.md};
  color: #991b1b;
  font-size: 0.875rem;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatUptime = (seconds) => {
  if (!seconds) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
};

const AdminHealthCheck = () => {
  const [refreshing, setRefreshing] = useState(false);
  const { token } = useAuthStore();
  
  const { data, isLoading, error, refetch } = useQuery(
    'healthCheck',
    async () => {
      try {
        const response = await api.get('/api/admin/health-check');
        return response.data;
      } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          const publicHealth = await api.get('/api/admin/health');
          const db = publicHealth.data?.database;
          throw Object.assign(new Error(
            db?.connected
              ? 'Session expired or invalid — log out and sign in again. PostgreSQL is connected on the server.'
              : 'Session expired and database check failed — log out, sign in again, and verify Postgres is running.'
          ), {
            isAuthError: true,
            databaseConnected: db?.connected,
            databaseError: db?.error,
          });
        }
        throw err;
      }
    },
    {
      enabled: Boolean(token),
      refetchInterval: 10000, // Auto-refresh every 10 seconds
      retry: (failureCount, err) => {
        if (err?.isAuthError) return false;
        return failureCount < 2;
      },
      retryDelay: 1000,
    }
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
      toast.success('Health check refreshed');
    } catch (err) {
      toast.error('Failed to refresh health check');
    } finally {
      setRefreshing(false);
    }
  };

  if (!token) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <Header>
            <Title>
              <FiServer />
              System Health Check
            </Title>
          </Header>
          <ErrorMessage>
            Sign in to view the full system health check.
          </ErrorMessage>
        </Container>
      </ThemeProvider>
    );
  }

  if (isLoading && !data) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <LoadingSpinner>
            <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ marginLeft: '0.5rem' }}>Loading health check...</span>
          </LoadingSpinner>
        </Container>
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <Header>
            <Title>
              <FiServer />
              System Health Check
            </Title>
          </Header>
          <ErrorMessage>
            <strong>Error loading health check:</strong> {error.message || 'Unknown error'}
            {error.isAuthError && error.databaseConnected && (
              <div style={{ marginTop: '0.75rem' }}>
                <ConnectionStatus $connected>
                  <FiCheckCircle />
                  PostgreSQL: connected (verified via public health endpoint)
                </ConnectionStatus>
              </div>
            )}
            {error.isAuthError && error.databaseConnected === false && (
              <div style={{ marginTop: '0.75rem' }}>
                <ConnectionStatus $connected={false}>
                  <FiXCircle />
                  PostgreSQL: {error.databaseError || 'not reachable'}
                </ConnectionStatus>
              </div>
            )}
          </ErrorMessage>
        </Container>
      </ThemeProvider>
    );
  }

  const health = data?.health;
  if (!health) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <Header>
            <Title>
              <FiServer />
              System Health Check
            </Title>
          </Header>
          <ErrorMessage>No health data available</ErrorMessage>
        </Container>
      </ThemeProvider>
    );
  }

  const system = health.system || {};
  const ports = health.ports || {};
  const connections = health.connections || {};
  const mediaSoup = health.mediaSoup || {};
  const application = health.application || {};
  const recordings = health.recordings || {};
  const archive = recordings.archive || {};
  const reconcile = recordings.reconcile || {};

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <Header>
          <Title>
            <FiServer />
            System Health Check
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <StatusBadge $status={health.status || 'unknown'}>
              {health.status === 'healthy' && <FiCheckCircle />}
              {health.status === 'warning' && <FiAlertCircle />}
              {health.status === 'degraded' && <FiXCircle />}
              {health.status || 'unknown'}
            </StatusBadge>
            <RefreshButton onClick={handleRefresh} disabled={refreshing}>
              <FiRefreshCw />
              Refresh
            </RefreshButton>
          </div>
        </Header>

        <Grid>
          {/* System Information */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiServer />
              </CardIcon>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <InfoRow>
              <InfoLabel>Hostname</InfoLabel>
              <InfoValue>{system.hostname || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Platform</InfoLabel>
              <InfoValue>{system.platform || 'N/A'} ({system.arch || 'N/A'})</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>CPU</InfoLabel>
              <InfoValue>{system.cpus || 'N/A'} cores - {system.cpuModel || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Node.js Version</InfoLabel>
              <InfoValue>{system.nodeVersion || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Process ID</InfoLabel>
              <InfoValue>{system.pid || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Uptime</InfoLabel>
              <InfoValue>{formatUptime(system.uptime)}</InfoValue>
            </InfoRow>
          </Card>

          {/* Memory Usage */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiHardDrive />
              </CardIcon>
              <CardTitle>Memory Usage</CardTitle>
            </CardHeader>
            <InfoRow>
              <InfoLabel>Total Memory</InfoLabel>
              <InfoValue>{formatBytes(system.totalMemory)}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Used Memory</InfoLabel>
              <InfoValue>{formatBytes(system.usedMemory)}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Free Memory</InfoLabel>
              <InfoValue>{formatBytes(system.freeMemory)}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Usage</InfoLabel>
              <InfoValue>{system.memoryUsagePercent || '0'}%</InfoValue>
            </InfoRow>
            <ProgressBar>
              <ProgressFill $percent={parseFloat(system.memoryUsagePercent || 0)} />
            </ProgressBar>
            {system.processMemory && (
              <>
                <InfoRow style={{ marginTop: '0.5rem' }}>
                  <InfoLabel>Process Heap Used</InfoLabel>
                  <InfoValue>{formatBytes(system.processMemory.heapUsed)}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Process Heap Total</InfoLabel>
                  <InfoValue>{formatBytes(system.processMemory.heapTotal)}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Process RSS</InfoLabel>
                  <InfoValue>{formatBytes(system.processMemory.rss)}</InfoValue>
                </InfoRow>
              </>
            )}
          </Card>

          {/* CPU Load */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiCpu />
              </CardIcon>
              <CardTitle>CPU Load</CardTitle>
            </CardHeader>
            {system.loadAverage && (
              <>
                <InfoRow>
                  <InfoLabel>1 minute</InfoLabel>
                  <InfoValue>{system.loadAverage[0]?.toFixed(2) || '0.00'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>5 minutes</InfoLabel>
                  <InfoValue>{system.loadAverage[1]?.toFixed(2) || '0.00'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>15 minutes</InfoLabel>
                  <InfoValue>{system.loadAverage[2]?.toFixed(2) || '0.00'}</InfoValue>
                </InfoRow>
              </>
            )}
          </Card>

          {/* Ports Configuration */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiLink />
              </CardIcon>
              <CardTitle>Ports Configuration</CardTitle>
            </CardHeader>
            <InfoRow>
              <InfoLabel>Server Port</InfoLabel>
              <InfoValue>{ports.serverPort || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>RTC Port Range</InfoLabel>
              <InfoValue>{ports.rtcPortRange || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>RTC Min Port</InfoLabel>
              <InfoValue>{ports.rtcMinPort || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>RTC Max Port</InfoLabel>
              <InfoValue>{ports.rtcMaxPort || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Socket.IO Path</InfoLabel>
              <InfoValue>{ports.socketIOPath || '/socket.io'}</InfoValue>
            </InfoRow>
          </Card>

          {/* Connections Status */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiWifi />
              </CardIcon>
              <CardTitle>Connections</CardTitle>
            </CardHeader>
            <InfoRow>
              <InfoLabel>Socket.IO</InfoLabel>
              <ConnectionStatus $connected={connections.socketIO?.connected > 0}>
                {connections.socketIO?.connected ? <FiCheckCircle /> : <FiXCircle />}
                {connections.socketIO?.connected || 0} connected
              </ConnectionStatus>
            </InfoRow>
            {connections.socketIO && (
              <>
                <InfoRow>
                  <InfoLabel>Active Rooms</InfoLabel>
                  <InfoValue>{connections.socketIO.rooms || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Active Calls</InfoLabel>
                  <InfoValue>{connections.socketIO.activeCalls || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Active Broadcasts</InfoLabel>
                  <InfoValue>{connections.socketIO.activeBroadcasts || 0}</InfoValue>
                </InfoRow>
              </>
            )}
            <InfoRow>
              <InfoLabel>Database</InfoLabel>
              <ConnectionStatus $connected={connections.database?.connected}>
                {connections.database?.connected ? <FiCheckCircle /> : <FiXCircle />}
                {connections.database?.connected ? 'Connected' : (connections.database?.error || 'Disconnected')}
              </ConnectionStatus>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Redis</InfoLabel>
              <ConnectionStatus $connected={connections.redis?.connected}>
                {connections.redis?.connected ? <FiCheckCircle /> : <FiXCircle />}
                {connections.redis?.connected ? 'Connected' : (connections.redis?.error || 'Not enabled')}
              </ConnectionStatus>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Matrix</InfoLabel>
              <ConnectionStatus $connected={connections.matrix?.connected}>
                {connections.matrix?.connected ? <FiCheckCircle /> : <FiXCircle />}
                {connections.matrix?.connected ? `Connected (${connections.matrix.userId || 'N/A'})` : (connections.matrix?.error || 'Disconnected')}
              </ConnectionStatus>
            </InfoRow>
          </Card>

          {/* MediaSoup SFU */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiVideo />
              </CardIcon>
              <CardTitle>MediaSoup SFU</CardTitle>
            </CardHeader>
            {mediaSoup.error ? (
              <InfoRow>
                <InfoLabel>Status</InfoLabel>
                <InfoValue style={{ color: '#ef4444' }}>{mediaSoup.error}</InfoValue>
              </InfoRow>
            ) : (
              <>
                <InfoRow>
                  <InfoLabel>Workers</InfoLabel>
                  <InfoValue>{mediaSoup.workers || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Routers</InfoLabel>
                  <InfoValue>{mediaSoup.routers || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Transports</InfoLabel>
                  <InfoValue>{mediaSoup.transports || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Producers</InfoLabel>
                  <InfoValue>{mediaSoup.producers || 0}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Consumers</InfoLabel>
                  <InfoValue>{mediaSoup.consumers || 0}</InfoValue>
                </InfoRow>
                {mediaSoup.config && (
                  <>
                    <InfoRow>
                      <InfoLabel>Listen IP</InfoLabel>
                      <InfoValue>{mediaSoup.config.listenIp || 'N/A'}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <InfoLabel>Announced IP</InfoLabel>
                      <InfoValue>{mediaSoup.config.announcedIp || 'N/A'}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <InfoLabel>Max Concurrent Groups</InfoLabel>
                      <InfoValue>{mediaSoup.config.maxConcurrentGroups || 'N/A'}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <InfoLabel>Max Participants/Group</InfoLabel>
                      <InfoValue>{mediaSoup.config.maxParticipantsPerGroup || 'N/A'}</InfoValue>
                    </InfoRow>
                  </>
                )}
              </>
            )}
          </Card>

          {/* Application Stats */}
          <Card>
            <CardHeader>
              <CardIcon>
                <FiUsers />
              </CardIcon>
              <CardTitle>Application</CardTitle>
            </CardHeader>
            <InfoRow>
              <InfoLabel>Total Users</InfoLabel>
              <InfoValue>{application.totalUsers || 0}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Active Users</InfoLabel>
              <InfoValue>{application.activeUsers || 0}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Total Groups</InfoLabel>
              <InfoValue>{application.totalGroups || 0}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Active Groups</InfoLabel>
              <InfoValue>{application.activeGroups || 0}</InfoValue>
            </InfoRow>

            {recordings?.archive && (
              <>
                <InfoRow style={{ marginTop: '0.5rem' }}>
                  <InfoLabel>Recording Archive Pending</InfoLabel>
                  <InfoValue>{archive.pendingCount ?? 'N/A'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Oldest Pending</InfoLabel>
                  <InfoValue>{archive.oldestPendingAt ? new Date(archive.oldestPendingAt).toLocaleString() : 'N/A'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Last Archive Retry Run</InfoLabel>
                  <InfoValue>{archive.lastRetryRunAt ? new Date(archive.lastRetryRunAt).toLocaleString() : 'N/A'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Last Archive Retry Error</InfoLabel>
                  <InfoValue>{archive.lastRetryError || archive.error || 'None'}</InfoValue>
                </InfoRow>
              </>
            )}

            {recordings?.reconcile && (
              <>
                <InfoRow style={{ marginTop: '0.5rem' }}>
                  <InfoLabel>Recording Duration Reconcile Last Run</InfoLabel>
                  <InfoValue>{reconcile.lastRunAt ? new Date(reconcile.lastRunAt).toLocaleString() : 'N/A'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Recording Duration Reconcile Last Error</InfoLabel>
                  <InfoValue>{reconcile.lastError || reconcile.error || 'None'}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>Reconcile Updated (last run)</InfoLabel>
                  <InfoValue>{reconcile.lastSummary?.updated ?? 'N/A'}</InfoValue>
                </InfoRow>
              </>
            )}
          </Card>
        </Grid>

        {health.timestamp && (
          <div style={{ 
            textAlign: 'center', 
            color: theme.colors.textSecondary, 
            fontSize: '0.875rem',
            marginTop: '1rem'
          }}>
            Last updated: {new Date(health.timestamp).toLocaleString()}
          </div>
        )}
      </Container>
    </ThemeProvider>
  );
};

export default AdminHealthCheck;

