import React, { useState, useEffect, useCallback } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import {
  FiUsers,
  FiPhone,
  FiVideo,
  FiRadio,
  FiLogOut,
  FiUserPlus,
  FiDatabase,
  FiServer,
  FiActivity,
  FiMessageSquare,
  FiLink,
  FiGlobe,
  FiHeart,
  FiUserCheck,
  FiGrid,
  FiHash,
  FiSettings,
  FiClock
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/GlobalStyle';
import MatrixManagementPanel from '../../components/MatrixManagementPanel/MatrixManagementPanel';
import UserManagement from '../../components/UserManagement/UserManagement';
import AdminRecordings from '../../components/AdminRecordings/AdminRecordings';
import AdminGroupManagement from '../../components/AdminGroupManagement/AdminGroupManagement';
import AdminBroadcastManagement from '../../components/AdminBroadcastManagement/AdminBroadcastManagement';
import AdminSystemSettings from '../../components/AdminSystemSettings/AdminSystemSettings';
import AdminPrivateWires from '../../components/AdminPrivateWires/AdminPrivateWires';
import AdminTelephone from '../../components/AdminTelephone/AdminTelephone';
import DealerboardGroups from '../../components/DealerboardGroups/DealerboardGroups';
import AdminMatrixHomeservers from '../../components/AdminMatrixHomeservers/AdminMatrixHomeservers';
import AdminMatrixRooms from '../../components/AdminMatrixRooms/AdminMatrixRooms';
import AdminHealthCheck from '../../components/AdminHealthCheck/AdminHealthCheck';
import api from '../../utils/api';
import AppSwitcher from '../../components/AppSwitcher/AppSwitcher';
import { PRODUCT_NAME } from '../../config/brand';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const isAdmin = user?.role === 'platform_admin' || user?.role === 'admin';
  
  // Live data states
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalGroups: 0,
    activeCalls: 0,
    broadcasts: 0,
    iptvStreams: 0,
    recordings: 0
  });
  
  const [recentActivity, setRecentActivity] = useState([]);
  const [groupsMeta, setGroupsMeta] = useState([]);
  const [broadcastsMeta, setBroadcastsMeta] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch live data
  const fetchLiveData = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/stats');
      if (response.data?.success) {
        // Merge rather than replace: fields the API doesn't return (e.g. iptvStreams
        // isn't always computed server-side) should keep their sensible default (0)
        // instead of becoming undefined and rendering as blank.
        setStats((prev) => ({ ...prev, ...(response.data.stats || {}) }));
        setRecentActivity(response.data.recentActivity || []);
        if (Array.isArray(response.data.groups)) setGroupsMeta(response.data.groups);
        if (Array.isArray(response.data.broadcasts)) setBroadcastsMeta(response.data.broadcasts);
      } else {
        // Handle case where API returns error in response
        console.warn('Admin stats API returned unsuccessful response:', response.data);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch live data:', error);
      // Only show error toast on first failure, not on every retry
      if (!isLoading) {
        // Don't show toast on initial load failures - they're expected if server is starting
        if (error.response?.status !== 404) {
          console.warn('Admin stats fetch failed:', error.message);
        }
      }
      setIsLoading(false);
      // Keep existing stats on error instead of clearing them
    }
  }, [isLoading]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchLiveData();
    
    const interval = setInterval(fetchLiveData, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, fetchLiveData]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  // Get activity icon based on type
  const getActivityIcon = (type) => {
    switch(type) {
      case 'user_created': return <FiUserPlus />;
      case 'call_started': return <FiPhone />;
      case 'broadcast_active': return <FiRadio />;
      case 'group_created': return <FiUsers />;
      case 'recording': return <FiDatabase />;
      default: return <FiActivity />;
    }
  };

  // Format time ago
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    
    try {
      const timestampDate = new Date(timestamp);
      if (isNaN(timestampDate.getTime())) {
        return 'Invalid date';
      }
      
      const seconds = Math.floor((Date.now() - timestampDate.getTime()) / 1000);
      
      if (seconds < 0) return 'Just now'; // Future dates
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch (error) {
      console.warn('Error formatting time ago:', error, timestamp);
      return 'Unknown';
    }
  };

  // Allow all authenticated users to access Health Check
  // Other tabs still require admin access
  useEffect(() => {
    if (!isAdmin && activeTab !== 'healthCheck') {
      setActiveTab('healthCheck');
    }
  }, [isAdmin, activeTab]);
  
  // Show access denied only if not admin and trying to access non-health-check tabs
  if (!isAdmin && activeTab !== 'healthCheck') {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <Header>
            <Logo>{PRODUCT_NAME} Admin</Logo>
          </Header>
          <main style={{ padding: '2rem' }}>
            <InfoBox>
              Admin access required for this section. You can access Health Check from the sidebar.
            </InfoBox>
          </main>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Container>
        <Header>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Logo>{PRODUCT_NAME}</Logo>
            <AppSwitcher />
          </div>
          <UserInfo>
            <AdminBadge>ADMIN</AdminBadge>
            <UserName>{user?.name || 'Administrator'}</UserName>
            <LogoutButton onClick={handleLogout} title="Logout">
              <FiLogOut />
              <span>Logout</span>
            </LogoutButton>
          </UserInfo>
        </Header>

        <MainContent>
          <Sidebar>
            <SidebarSection>
              <SidebarSectionTitle>Overview</SidebarSectionTitle>
              {/* Health Check - visible to all authenticated users */}
              <NavItem
                key="health-check-nav"
                $active={activeTab === 'healthCheck'}
                onClick={() => setActiveTab('healthCheck')}
              >
                <FiHeart />
                <span>Health Check</span>
              </NavItem>
              {isAdmin && (
                <NavItem
                  $active={activeTab === 'overview'}
                  onClick={() => setActiveTab('overview')}
                >
                  <FiActivity />
                  <span>Overview</span>
                </NavItem>
              )}
            </SidebarSection>

            {isAdmin && (
              <>
                <SidebarSection>
                  <SidebarSectionTitle>People &amp; Groups</SidebarSectionTitle>
                  <NavItem
                    $active={activeTab === 'users'}
                    onClick={() => setActiveTab('users')}
                  >
                    <FiUsers />
                    <span>Users</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'groups'}
                    onClick={() => setActiveTab('groups')}
                  >
                    <FiUserCheck />
                    <span>Groups</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'dealerboardGroups'}
                    onClick={() => setActiveTab('dealerboardGroups')}
                  >
                    <FiGrid />
                    <span>Dealerboard Groups</span>
                  </NavItem>
                </SidebarSection>

                <SidebarSection>
                  <SidebarSectionTitle>Media &amp; Calling</SidebarSectionTitle>
                  <NavItem
                    $active={activeTab === 'broadcasts'}
                    onClick={() => setActiveTab('broadcasts')}
                  >
                    <FiRadio />
                    <span>Broadcasts</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'iptv'}
                    onClick={() => setActiveTab('iptv')}
                  >
                    <FiVideo />
                    <span>IPTV Streams</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'recordings'}
                    onClick={() => setActiveTab('recordings')}
                  >
                    <FiDatabase />
                    <span>Recordings</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'privateWires'}
                    onClick={() => setActiveTab('privateWires')}
                  >
                    <FiLink />
                    <span>Private Wires</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'telephone'}
                    onClick={() => setActiveTab('telephone')}
                  >
                    <FiPhone />
                    <span>Telephone</span>
                  </NavItem>
                </SidebarSection>

                <SidebarSection>
                  <SidebarSectionTitle>Matrix &amp; Federation</SidebarSectionTitle>
                  <NavItem
                    $active={activeTab === 'matrix'}
                    onClick={() => setActiveTab('matrix')}
                  >
                    <FiMessageSquare />
                    <span>Matrix</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'matrixRooms'}
                    onClick={() => setActiveTab('matrixRooms')}
                  >
                    <FiHash />
                    <span>Matrix Rooms</span>
                  </NavItem>
                  <NavItem
                    $active={activeTab === 'matrixHomeservers'}
                    onClick={() => setActiveTab('matrixHomeservers')}
                  >
                    <FiServer />
                    <span>Matrix Homeservers</span>
                  </NavItem>
                  <NavItem
                    $active={false}
                    onClick={() => navigate('/federation')}
                  >
                    <FiGlobe />
                    <span>Federation Portal</span>
                  </NavItem>
                </SidebarSection>

                <SidebarSection>
                  <SidebarSectionTitle>System</SidebarSectionTitle>
                  <NavItem
                    $active={activeTab === 'system'}
                    onClick={() => setActiveTab('system')}
                  >
                    <FiSettings />
                    <span>System</span>
                  </NavItem>
                </SidebarSection>
              </>
            )}
          </Sidebar>

          <Content>
            {/* Health Check - available to all authenticated users */}
            {activeTab === 'healthCheck' && (
              <TabContent>
                <AdminHealthCheck />
              </TabContent>
            )}

            {/* Admin-only tabs */}
            {isAdmin && activeTab === 'overview' && (
              <OverviewTab>
                <PageHeading>
                  <div>
                    <PageTitle>System Overview</PageTitle>
                    <PageSubtitle>Live status across users, calls, broadcasts, and streams</PageSubtitle>
                  </div>
                  <LiveIndicator>
                    <LivePulse />
                    Live
                  </LiveIndicator>
                </PageHeading>

                <StatStrip>
                  <StatSegment>
                    <StatSegmentLabel><FiUsers /> Total Users</StatSegmentLabel>
                    <StatSegmentValue $color={theme.colors.accent}>{String(stats.totalUsers).padStart(2, '0')}</StatSegmentValue>
                    <StatSegmentMeta>{stats.activeUsers} active now</StatSegmentMeta>
                  </StatSegment>
                  <StatSegment>
                    <StatSegmentLabel><FiPhone /> Active Calls</StatSegmentLabel>
                    <StatSegmentValue $color={theme.colors.success}>{String(stats.activeCalls).padStart(2, '0')}</StatSegmentValue>
                    <StatSegmentMeta>real-time</StatSegmentMeta>
                  </StatSegment>
                  <StatSegment>
                    <StatSegmentLabel><FiRadio /> Broadcasts</StatSegmentLabel>
                    <StatSegmentValue $color={theme.colors.warning}>{String(stats.broadcasts).padStart(2, '0')}</StatSegmentValue>
                    <StatSegmentMeta>{stats.totalGroups} total groups</StatSegmentMeta>
                  </StatSegment>
                  <StatSegment>
                    <StatSegmentLabel><FiVideo /> IPTV Streams</StatSegmentLabel>
                    <StatSegmentValue $color={theme.colors.info}>{String(stats.iptvStreams).padStart(2, '0')}</StatSegmentValue>
                    <StatSegmentMeta>multicast active</StatSegmentMeta>
                  </StatSegment>
                </StatStrip>

                <Section style={{ marginTop: '1.25rem' }}>
                  <SectionTitle><FiClock /> Recent Activity</SectionTitle>
                  <ActivityList>
                    {recentActivity.length > 0 ? (
                      recentActivity.map((activity, index) => (
                        <ActivityItem key={index}>
                          <ActivityIcon color={activity.color || theme.colors.accent}>
                            {getActivityIcon(activity.type)}
                          </ActivityIcon>
                          <ActivityText>
                            <strong>{activity.title}:</strong> {activity.description}
                          </ActivityText>
                          <ActivityTime>{formatTimeAgo(activity.timestamp)}</ActivityTime>
                        </ActivityItem>
                      ))
                    ) : (
                      <EmptyActivity>
                        <FiActivity />
                        <span>No recent activity yet — actions like calls, group changes, and user updates will appear here.</span>
                      </EmptyActivity>
                    )}
                  </ActivityList>
                </Section>

                {!!groupsMeta?.length && (
                  <Section style={{ marginTop: '1rem' }}>
                    <SectionTitle><FiUsers /> Groups – Last Used</SectionTitle>
                    <MetaTable>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Participants</th>
                          <th>Last Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupsMeta.map(g => (
                          <tr key={g.id || g.name}>
                            <td>{g.name}</td>
                            <td>{Array.isArray(g.participants) ? g.participants.length : (g.participantCount || 0)}</td>
                            <td>{g.lastUsedOn ? new Date(g.lastUsedOn).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </MetaTable>
                  </Section>
                )}

                {!!broadcastsMeta?.length && (
                  <Section style={{ marginTop: '1rem' }}>
                    <SectionTitle><FiRadio /> Broadcasts – Last Spoken</SectionTitle>
                    <MetaTable>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Listeners</th>
                          <th>Last Spoken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcastsMeta.map(b => (
                          <tr key={b.id || b.name}>
                            <td>{b.name}</td>
                            <td>{b.listenerCount ?? '—'}</td>
                            <td>{b.lastSpokenAt ? new Date(b.lastSpokenAt).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </MetaTable>
                  </Section>
                )}
              </OverviewTab>
            )}

            {isAdmin && activeTab === 'users' && (
              <TabContent>
                <UserManagement />
              </TabContent>
            )}

            {isAdmin && activeTab === 'groups' && (
              <TabContent>
                <AdminGroupManagement />
              </TabContent>
            )}

            {isAdmin && activeTab === 'broadcasts' && (
              <TabContent>
                <AdminBroadcastManagement />
              </TabContent>
            )}

            {isAdmin && activeTab === 'iptv' && (
              <TabContent>
                <PageTitle>IPTV Stream Management</PageTitle>
                <InfoBox>
                  IPTV stream configuration coming soon...
                  <br />
                  Features: Add multicast streams, configure codecs, monitor status
                </InfoBox>
              </TabContent>
            )}

            {isAdmin && activeTab === 'recordings' && (
              <TabContent>
                <AdminRecordings />
              </TabContent>
            )}

            {isAdmin && activeTab === 'matrix' && (
              <TabContent>
                <MatrixManagementPanel />
              </TabContent>
            )}

            {isAdmin && activeTab === 'privateWires' && (
              <TabContent>
                <AdminPrivateWires />
              </TabContent>
            )}

            {isAdmin && activeTab === 'telephone' && (
              <TabContent>
                <AdminTelephone />
              </TabContent>
            )}

            {isAdmin && activeTab === 'dealerboardGroups' && (
              <TabContent>
                <DealerboardGroups />
              </TabContent>
            )}

            {isAdmin && activeTab === 'matrixHomeservers' && (
              <TabContent>
                <AdminMatrixHomeservers />
              </TabContent>
            )}

            {isAdmin && activeTab === 'matrixRooms' && (
              <TabContent>
                <AdminMatrixRooms />
              </TabContent>
            )}

            {isAdmin && activeTab === 'system' && (
              <TabContent>
                <AdminSystemSettings />
              </TabContent>
            )}

          </Content>
        </MainContent>
      </Container>
    </ThemeProvider>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
`;

const Header = styled.header`
  background: ${props => props.theme.colors.surface};
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  box-shadow: ${props => props.theme.shadows.md};
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  background: ${props => props.theme.colors.gradient};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const AdminBadge = styled.span`
  background: ${props => props.theme.colors.gradient};
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.5px;
`;

const UserName = styled.span`
  color: ${props => props.theme.colors.text};
  font-weight: 500;
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }

  svg {
    font-size: 1rem;
  }
`;

const MainContent = styled.main`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const Sidebar = styled.aside`
  width: 220px;
  background: ${props => props.theme.colors.surface};
  border-right: 1px solid ${props => props.theme.colors.border};
  padding: 1rem 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
`;

const SidebarSection = styled.div`
  display: flex;
  flex-direction: column;
`;

const SidebarSectionTitle = styled.div`
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: ${props => props.theme.colors.textTertiary};
  padding: 0 1rem;
  margin-bottom: 0.3rem;
`;

const NavItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.4rem 1rem;
  border-left: 2px solid ${props => props.$active ? props.theme.colors.accent : 'transparent'};
  color: ${props => props.$active ? props.theme.colors.text : props.theme.colors.textSecondary};
  background: ${props => props.$active ? props.theme.colors.surfaceElevated : 'transparent'};
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  font-weight: ${props => props.$active ? '600' : '400'};
  font-size: 0.82rem;

  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.text};
  }

  svg {
    font-size: 0.95rem;
    flex-shrink: 0;
    color: ${props => props.$active ? props.theme.colors.accent : 'currentColor'};
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 1.5rem 2rem;
  overflow-y: auto;
  background: ${props => props.theme.colors.background};
`;

const OverviewTab = styled.div``;

const PageHeading = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.85rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const PageTitle = styled.h1`
  font-size: 1.3rem;
  color: ${props => props.theme.colors.text};
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: uppercase;
`;

const PageSubtitle = styled.p`
  font-size: 0.78rem;
  color: ${props => props.theme.colors.textTertiary};
  margin-top: 0.25rem;
  font-family: ${props => props.theme.fonts.mono};
`;

const LiveIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid ${props => props.theme.colors.success};
  color: ${props => props.theme.colors.success};
  font-family: ${props => props.theme.fonts.mono};
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  flex-shrink: 0;
`;

const pulseKeyframes = `
  @keyframes livePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
`;

const LivePulse = styled.span`
  ${pulseKeyframes}
  width: 6px;
  height: 6px;
  background: ${props => props.theme.colors.success};
  animation: livePulse 1.2s step-end infinite;
`;

const StatStrip = styled.div`
  display: flex;
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  margin-bottom: 1.25rem;
  overflow-x: auto;
`;

const StatSegment = styled.div`
  flex: 1;
  min-width: 160px;
  padding: 0.75rem 1.1rem;
  border-right: 1px solid ${props => props.theme.colors.border};

  &:last-child {
    border-right: none;
  }
`;

const StatSegmentLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: ${props => props.theme.colors.textTertiary};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.4rem;

  svg {
    font-size: 0.8rem;
  }
`;

const StatSegmentValue = styled.div`
  font-family: ${props => props.theme.fonts.mono};
  font-size: 1.9rem;
  font-weight: 700;
  color: ${props => props.$color || props.theme.colors.text};
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

const StatSegmentMeta = styled.div`
  font-size: 0.72rem;
  color: ${props => props.theme.colors.textSecondary};
  margin-top: 0.35rem;
  font-family: ${props => props.theme.fonts.mono};
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 800;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.35rem;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`;

const StatLabel = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textSecondary};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const StatSubtext = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textTertiary};
  margin-top: 0.3rem;
`;

const Section = styled.section`
  background: ${props => props.theme.colors.surface};
  padding: 1.1rem 1.25rem;
  border: 1px solid ${props => props.theme.colors.border};
`;

const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: ${props => props.theme.colors.textSecondary};
  margin-bottom: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;

  svg {
    color: ${props => props.theme.colors.accent};
    font-size: 0.9rem;
  }
`;

const MetaTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  thead th {
    text-align: left;
    color: ${props => props.theme.colors.textTertiary};
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.68rem;
    padding: 6px 10px;
    border-bottom: 1px solid ${props => props.theme.colors.border};
  }
  tbody td {
    padding: 7px 10px;
    border-bottom: 1px solid ${props => props.theme.colors.border};
    color: ${props => props.theme.colors.text};
    font-family: ${props => props.theme.fonts.mono};
    font-size: 0.78rem;
  }
  tbody tr:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActivityItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.25rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  border-left: 2px solid ${props => props.color};

  &:last-child {
    border-bottom: none;
  }
`;

const ActivityIcon = styled.div`
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: ${props => props.color};
  flex-shrink: 0;
  margin-left: 0.5rem;
`;

const ActivityText = styled.div`
  flex: 1;
  color: ${props => props.theme.colors.text};
  font-size: 0.82rem;

  strong {
    font-weight: 700;
  }
`;

const ActivityTime = styled.div`
  color: ${props => props.theme.colors.textTertiary};
  font-size: 0.7rem;
  font-family: ${props => props.theme.fonts.mono};
`;

const EmptyActivity = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  text-align: center;
  padding: 1.1rem;
  color: ${props => props.theme.colors.textTertiary};
  font-size: 0.8rem;

  svg {
    font-size: 1.2rem;
    opacity: 0.5;
  }
`;

const TabContent = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const InfoBox = styled.div`
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  padding: 1.5rem;
  color: ${props => props.theme.colors.warning};
  line-height: 1.6;
`;

export default AdminDashboard;

