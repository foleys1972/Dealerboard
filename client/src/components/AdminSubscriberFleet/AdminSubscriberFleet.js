import React, { useMemo, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { useQuery } from 'react-query';
import { FiServer, FiLink, FiUsers, FiActivity, FiAlertCircle, FiRefreshCw, FiSettings } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { theme } from '../../styles/GlobalStyle';
import api from '../../utils/api';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
  padding: 1.5rem;
`;

const InlineSelect = styled.select`
  padding: 0.4rem 0.5rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  cursor: pointer;
  min-width: 180px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }

  option {
    background: ${props => props.theme.colors.surface};
    color: ${props => props.theme.colors.text};
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
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

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
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
`;

const InfoBox = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
`;

const Card = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.25rem;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`;

const KpiRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  padding: 0.4rem 0;
`;

const KpiLabel = styled.div`
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.875rem;
`;

const KpiValue = styled.div`
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-weight: 500;
  text-align: right;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  font-weight: 600;
  padding: 0.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const Td = styled.td`
  padding: 0.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  vertical-align: top;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 600;
  background: ${props => {
    if (props.$tone === 'good') return '#10b981';
    if (props.$tone === 'warn') return '#f59e0b';
    if (props.$tone === 'bad') return '#ef4444';
    return '#6b7280';
  }};
  color: #ffffff;
`;

function getToneFromHealth(healthStatus) {
  if (healthStatus === 'healthy') return 'good';
  if (healthStatus === 'warning') return 'warn';
  if (healthStatus === 'degraded') return 'bad';
  return 'neutral';
}

const AdminSubscriberFleet = () => {
  const { data: allocationsData, isLoading: allocationsLoading, error: allocationsError, refetch: refetchAllocations } = useQuery(
    'subscriberPortAllocations',
    async () => {
      const res = await api.get('/api/subscribers/allocations');
      return res.data;
    },
    { refetchInterval: 15000, retry: 1 }
  );

  const { data: healthData, isLoading: healthLoading, error: healthError, refetch: refetchHealth } = useQuery(
    'fleetHealthCheck',
    async () => {
      const res = await api.get('/api/admin/health-check');
      return res.data;
    },
    { refetchInterval: 15000, retry: 1 }
  );

  const { data: orchestratorData, isLoading: orchLoading, error: orchError, refetch: refetchOrch } = useQuery(
    'orchestratorStatus',
    async () => {
      const res = await api.get('/api/matrix/orchestrator/status');
      return res.data;
    },
    { refetchInterval: 30000, retry: 1 }
  );

  const allocations = allocationsData?.allocations || [];
  const health = healthData?.health;
  const orch = orchestratorData;

  const allowedServicesBySubscriberId = useMemo(() => {
    const map = new Map();
    allocations.forEach((a) => {
      const sid = a?.subscriberId != null ? String(a.subscriberId) : '';
      if (!sid) return;
      const list = Array.isArray(a?.agent?.allowedServices) ? a.agent.allowedServices : [];
      map.set(sid, list.map(s => String(s)));
    });
    return map;
  }, [allocations]);

  const [selectedServiceBySubscriberId, setSelectedServiceBySubscriberId] = useState({});

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchAllocations(), refetchHealth(), refetchOrch()]);
      toast.success('Fleet refreshed');
    } catch {
      toast.error('Failed to refresh fleet');
    }
  };

  const isLoading = allocationsLoading || healthLoading || orchLoading;
  const hasError = allocationsError || healthError || orchError;

  const totalAllocated = allocations.length;
  const uniquePorts = new Set(allocations.map(a => a.port)).size;

  const rtcRange = health?.ports?.rtcPortRange || 'N/A';
  const connectedUsers = health?.connections?.socketIO?.connected ?? 0;
  const activeCalls = health?.connections?.socketIO?.activeCalls ?? 0;

  const managedHomeservers = Array.isArray(orch?.managedHomeservers) ? orch.managedHomeservers : [];

  const handleAgentAction = async ({ subscriberId, action, serviceName }) => {
    try {
      if (!subscriberId) {
        toast.error('Missing subscriberId');
        return;
      }

      if (!serviceName) {
        toast.error('Select a service first');
        return;
      }

      const res = await api.post(`/api/platform-admin/subscribers/${encodeURIComponent(String(subscriberId))}/agent/service`, {
        action,
        serviceName,
      });

      const resultText = res.data?.agent?.result;
      if (resultText) {
        // Keep it short in toast
        toast.success(`${action} OK: ${serviceName}`);
        // Also log full output for debugging
        // eslint-disable-next-line no-console
        console.log('Agent result:', resultText);
      } else {
        toast.success(`${action} OK: ${serviceName}`);
      }

      await refetchAllocations();
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.details || e.message || 'Agent action failed';
      toast.error(msg);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <Header>
          <Title>
            <FiServer />
            Subscriber Fleet / HA
          </Title>
          <Actions>
            <Button onClick={handleRefresh} disabled={isLoading} title="Refresh all fleet panels">
              <FiRefreshCw />
              Refresh
            </Button>
            <Button
              disabled
              title="Service control requires a dedicated remote-control mechanism (recommended: subscriber-side agent endpoint with strong auth, or out-of-band ops tooling)."
            >
              <FiActivity />
              Stop Service
            </Button>
            <Button
              disabled
              title="Failover/failback is currently handled by client routing + orchestrator logic. We can add explicit forced failover actions once we confirm the exact target (Matrix homeserver vs publisher/subscriber role)."
            >
              <FiLink />
              Failover / Failback
            </Button>
          </Actions>
        </Header>

        <InfoBox>
          This panel shows the subscriber fleet state: port allocations, node health signals, RTC port range, connected users, and orchestrator capacity. Direct service-control actions are intentionally disabled until we confirm the enterprise-safe control plane.
        </InfoBox>

        {hasError && (
          <InfoBox style={{ borderColor: '#fecaca', background: '#fee2e2', color: '#991b1b' }}>
            <strong>
              <FiAlertCircle style={{ marginRight: 6 }} />
              Some data failed to load.
            </strong>
            <div style={{ marginTop: 6, fontSize: '0.875rem' }}>
              {allocationsError?.message || healthError?.message || orchError?.message || 'Unknown error'}
            </div>
          </InfoBox>
        )}

        <Grid>
          <Card>
            <CardHeader>
              <CardTitle>
                <FiUsers />
                Live Usage
              </CardTitle>
              <Badge $tone={getToneFromHealth(health?.status)}>
                {health?.status || 'unknown'}
              </Badge>
            </CardHeader>
            <KpiRow>
              <KpiLabel>Connected users (Socket.IO)</KpiLabel>
              <KpiValue>{connectedUsers}</KpiValue>
            </KpiRow>
            <KpiRow>
              <KpiLabel>Active calls</KpiLabel>
              <KpiValue>{activeCalls}</KpiValue>
            </KpiRow>
            <KpiRow>
              <KpiLabel>RTC port range</KpiLabel>
              <KpiValue>{rtcRange}</KpiValue>
            </KpiRow>
            <KpiRow>
              <KpiLabel>Allocated subscriber ports</KpiLabel>
              <KpiValue>{totalAllocated} ({uniquePorts} unique)</KpiValue>
            </KpiRow>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <FiSettings />
                Orchestrator Capacity
              </CardTitle>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                {orch?.region ? `Region: ${orch.region}` : ''}
              </div>
            </CardHeader>
            {managedHomeservers.length === 0 ? (
              <div style={{ color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
                No homeservers reported.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Region</Th>
                    <Th>Load</Th>
                    <Th>Capacity</Th>
                    <Th>Health</Th>
                  </tr>
                </thead>
                <tbody>
                  {managedHomeservers.slice(0, 8).map(hs => (
                    <tr key={hs.id}>
                      <Td>{hs.serverName || hs.id}</Td>
                      <Td>{hs.region || 'N/A'}</Td>
                      <Td>{hs.currentLoad ?? 'N/A'}</Td>
                      <Td>{hs.capacity ?? 'N/A'}</Td>
                      <Td>
                        <Badge $tone={getToneFromHealth(hs.health?.status)}>
                          {hs.health?.status || 'unknown'}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card style={{ gridColumn: '1 / -1' }}>
            <CardHeader>
              <CardTitle>
                <FiLink />
                Subscriber Port Allocations
              </CardTitle>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                Source: /api/subscribers/allocations
              </div>
            </CardHeader>

            {allocations.length === 0 ? (
              <div style={{ color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
                No allocations yet. They are created when a subscriber first authenticates to the publisher.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Port</Th>
                    <Th>Server ID</Th>
                    <Th>Name</Th>
                    <Th>Server URL</Th>
                    <Th>Notes</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.slice(0, 50).map(a => (
                    <tr key={`${a.subscriberId}-${a.port}`}
                      title={`subscriberId: ${a.subscriberId}`}
                    >
                      <Td style={{ fontFamily: 'monospace' }}>{a.port}</Td>
                      <Td style={{ fontFamily: 'monospace' }}>{a.serverId || 'N/A'}</Td>
                      <Td>{a.name || 'N/A'}</Td>
                      <Td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.serverUrl || 'N/A'}
                      </Td>
                      <Td>{a.notes || ''}</Td>
                      <Td>
                        {(() => {
                          const sid = a?.subscriberId != null ? String(a.subscriberId) : '';
                          const allowed = allowedServicesBySubscriberId.get(sid) || [];
                          const selected = selectedServiceBySubscriberId[sid] || (allowed.length > 0 ? allowed[0] : '');

                          return (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <InlineSelect
                                value={selected}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedServiceBySubscriberId((prev) => ({
                                    ...prev,
                                    [sid]: value,
                                  }));
                                }}
                                disabled={allowed.length === 0}
                                title={allowed.length === 0 ? 'No allowed services configured for this subscriber' : 'Select a service to control'}
                              >
                                {allowed.length === 0 ? (
                                  <option value="">No services configured</option>
                                ) : (
                                  allowed.map((svc) => (
                                    <option key={svc} value={svc}>{svc}</option>
                                  ))
                                )}
                              </InlineSelect>

                          <Button
                            type="button"
                            onClick={() => handleAgentAction({ subscriberId: a.subscriberId, action: 'status', serviceName: selected })}
                            title="Query Windows service status via subscriber local agent"
                            disabled={!selected}
                          >
                            Status
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleAgentAction({ subscriberId: a.subscriberId, action: 'restart', serviceName: selected })}
                            title="Restart Windows service via subscriber local agent"
                            disabled={!selected}
                          >
                            Restart
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleAgentAction({ subscriberId: a.subscriberId, action: 'stop', serviceName: selected })}
                            title="Stop Windows service via subscriber local agent"
                            disabled={!selected}
                          >
                            Stop
                          </Button>
                            </div>
                          );
                        })()}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </Grid>

        <div style={{ textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
          {health?.timestamp ? `Health updated: ${new Date(health.timestamp).toLocaleString()}` : ''}
        </div>
      </Container>
    </ThemeProvider>
  );
};

export default AdminSubscriberFleet;
