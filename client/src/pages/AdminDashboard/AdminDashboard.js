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
  FiGlobe
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
        setStats(response.data.stats || {});
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
            {/* Health Check - visible to all authenticated users - MUST BE FIRST */}
            <NavItem 
              key="health-check-nav"
              $active={activeTab === 'healthCheck'}
              onClick={() => setActiveTab('healthCheck')}
              style={{ backgroundColor: activeTab === 'healthCheck' ? 'rgba(6, 182, 212, 0.1)' : 'transparent' }}
            >
              <FiServer />
              <span>Health Check</span>
            </NavItem>
            
            {/* Admin-only tabs */}
            {isAdmin && (
              <>
                <NavItem 
                  $active={activeTab === 'overview'}
                  onClick={() => setActiveTab('overview')}
                >
                  <FiActivity />
                  <span>Overview</span>
                </NavItem>
                
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
                  <FiPhone />
                  <span>Groups</span>
                </NavItem>
                
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
                  <FiMessageSquare />
                  <span>Matrix Rooms</span>
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
                
                <NavItem 
                  $active={activeTab === 'dealerboardGroups'}
                  onClick={() => setActiveTab('dealerboardGroups')}
                >
                  <FiUsers />
                  <span>Dealerboard Groups</span>
                </NavItem>
                
                <NavItem 
                  $active={activeTab === 'matrixHomeservers'}
                  onClick={() => setActiveTab('matrixHomeservers')}
                >
                  <FiServer />
                  <span>Matrix Homeservers</span>
                </NavItem>
                
                <NavItem 
                  $active={activeTab === 'system'}
                  onClick={() => setActiveTab('system')}
                >
                  <FiServer />
                  <span>System</span>
                </NavItem>

                <NavItem 
                  $active={false}
                  onClick={() => navigate('/federation')}
                >
                  <FiGlobe />
                  <span>Federation Portal</span>
                </NavItem>

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
                <PageTitle>System Overview</PageTitle>
                
                <StatsGrid>
                  <StatCard color={theme.colors.accent}>
                    <StatIcon><FiUsers /></StatIcon>
                    <StatValue>{stats.totalUsers}</StatValue>
                    <StatLabel>Total Users</StatLabel>
                    <StatSubtext>{stats.activeUsers} active now</StatSubtext>
                  </StatCard>
                  
                  <StatCard color={theme.colors.success}>
                    <StatIcon><FiPhone /></StatIcon>
                    <StatValue>{stats.activeCalls}</StatValue>
                    <StatLabel>Active Calls</StatLabel>
                    <StatSubtext>Real-time</StatSubtext>
                  </StatCard>
                  
                  <StatCard color={theme.colors.warning}>
                    <StatIcon><FiRadio /></StatIcon>
                    <StatValue>{stats.broadcasts}</StatValue>
                    <StatLabel>Active Broadcasts</StatLabel>
                    <StatSubtext>{stats.totalGroups} total groups</StatSubtext>
                  </StatCard>
                  
                  <StatCard color={theme.colors.info}>
                    <StatIcon><FiVideo /></StatIcon>
                    <StatValue>{stats.iptvStreams}</StatValue>
                    <StatLabel>IPTV Streams</StatLabel>
                    <StatSubtext>Multicast active</StatSubtext>
                  </StatCard>
                </StatsGrid>

                <Section>
                  <SectionTitle>Recent Activity</SectionTitle>
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
                        No recent activity
                      </EmptyActivity>
                    )}
                  </ActivityList>
                </Section>

                {!!groupsMeta?.length && (
                  <Section style={{ marginTop: '1rem' }}>
                    <SectionTitle>Groups – Last Used</SectionTitle>
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
                    <SectionTitle>Broadcasts – Last Spoken</SectionTitle>
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
  width: 250px;
  background: ${props => props.theme.colors.surface};
  border-right: 1px solid ${props => props.theme.colors.border};
  padding: 1.5rem 0;
  overflow-y: auto;
  overflow-x: hidden;
`;

const NavItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  color: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.textSecondary};
  background: ${props => props.$active ? 'rgba(6, 182, 212, 0.1)' : 'transparent'};
  border-left: 4px solid ${props => props.$active ? props.theme.colors.accent : 'transparent'};
  cursor: pointer;
  transition: all 0.2s;
  font-weight: ${props => props.$active ? '600' : '400'};

  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.accent};
  }

  svg {
    font-size: 1.25rem;
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  background: ${props => props.theme.colors.background};
`;

const OverviewTab = styled.div``;

const PageTitle = styled.h1`
  font-size: 2rem;
  color: ${props => props.theme.colors.text};
  margin-bottom: 2rem;
  font-weight: 700;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
`;

const StatCard = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: ${props => props.theme.shadows.md};
  border-left: 4px solid ${props => props.color};
  border: 1px solid ${props => props.theme.colors.border};
`;

const StatIcon = styled.div`
  font-size: 2rem;
  color: ${props => props.theme.colors.accent};
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatSubtext = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textTertiary};
  margin-top: 0.25rem;
`;

const Section = styled.section`
  background: ${props => props.theme.colors.surface};
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.border};
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  color: ${props => props.theme.colors.text};
  margin-bottom: 1.5rem;
  font-weight: 600;
`;

const MetaTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  thead th {
    text-align: left;
    color: ${props => props.theme.colors.textSecondary};
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 1px solid ${props => props.theme.colors.border};
  }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid ${props => props.theme.colors.border};
    color: ${props => props.theme.colors.text};
  }
  tbody tr:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ActivityItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border-radius: 12px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const ActivityIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.color}15;
  color: ${props => props.color};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
`;

const ActivityText = styled.div`
  flex: 1;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;

  strong {
    font-weight: 600;
  }
`;

const ActivityTime = styled.div`
  color: ${props => props.theme.colors.textTertiary};
  font-size: 0.75rem;
`;

const EmptyActivity = styled.div`
  text-align: center;
  padding: 2rem;
  color: ${props => props.theme.colors.textTertiary};
  font-style: italic;
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

