import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiUsers, 
  FiPhone, 
  FiVideo,
  FiRadio,
  FiSettings,
  FiLogOut,
  FiUserPlus,
  FiDatabase,
  FiServer,
  FiActivity
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import UserManagementPanel from '../../components/UserManagementPanel/UserManagementPanel';
import GroupManagementPanel from '../../components/GroupManagementPanel/GroupManagementPanel';
import BroadcastManagementPanel from '../../components/BroadcastManagementPanel/BroadcastManagementPanel';
import api from '../../utils/api';
import { Navigate } from 'react-router-dom';
import Recordings from '../Recordings/Recordings';

const AdminDashboard = () => {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const isAdmin = user?.role === 'admin';
  
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
  useEffect(() => {
    if (!isAdmin) return;
    fetchLiveData();
    
    const interval = setInterval(fetchLiveData, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const fetchLiveData = async () => {
    try {
      const response = await api.get('/api/admin/stats');
      if (response.data?.success) {
        setStats(response.data.stats || stats);
        setRecentActivity(response.data.recentActivity || []);
        if (Array.isArray(response.data.groups)) setGroupsMeta(response.data.groups);
        if (Array.isArray(response.data.broadcasts)) setBroadcastsMeta(response.data.broadcasts);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch live data:', error);
      setIsLoading(false);
    }
  };

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
    
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!isAdmin) {
    return (
      <Container>
        <Header>
          <Logo>🎙️ TradePulse Admin</Logo>
        </Header>
        <main style={{ padding: '2rem' }}>
          <InfoBox>
            Admin access required. Please sign in with an administrator account.
          </InfoBox>
        </main>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Logo>🎙️ TradePulse Admin</Logo>
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
            $active={activeTab === 'system'}
            onClick={() => setActiveTab('system')}
          >
            <FiServer />
            <span>System</span>
          </NavItem>
        </Sidebar>

        <Content>
          {activeTab === 'overview' && (
            <OverviewTab>
              <PageTitle>System Overview</PageTitle>
              
              <StatsGrid>
                <StatCard color="#3b82f6">
                  <StatIcon><FiUsers /></StatIcon>
                  <StatValue>{stats.totalUsers}</StatValue>
                  <StatLabel>Total Users</StatLabel>
                  <StatSubtext>{stats.activeUsers} active now</StatSubtext>
                </StatCard>
                
                <StatCard color="#10b981">
                  <StatIcon><FiPhone /></StatIcon>
                  <StatValue>{stats.activeCalls}</StatValue>
                  <StatLabel>Active Calls</StatLabel>
                  <StatSubtext>Real-time</StatSubtext>
                </StatCard>
                
                <StatCard color="#f59e0b">
                  <StatIcon><FiRadio /></StatIcon>
                  <StatValue>{stats.broadcasts}</StatValue>
                  <StatLabel>Active Broadcasts</StatLabel>
                  <StatSubtext>{stats.totalGroups} total groups</StatSubtext>
                </StatCard>
                
                <StatCard color="#8b5cf6">
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
                        <ActivityIcon color={activity.color || '#3b82f6'}>
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

          {activeTab === 'users' && (
            <UserManagementPanel />
          )}

          {activeTab === 'groups' && (
            <GroupManagementPanel />
          )}

          {activeTab === 'broadcasts' && (
            <TabContent>
              <BroadcastManagementPanel />
            </TabContent>
          )}

          {activeTab === 'iptv' && (
            <TabContent>
              <PageTitle>IPTV Stream Management</PageTitle>
              <InfoBox>
                IPTV stream configuration coming soon...
                <br />
                Features: Add multicast streams, configure codecs, monitor status
              </InfoBox>
            </TabContent>
          )}

          {activeTab === 'recordings' && (
            <TabContent>
              <Recordings />
            </TabContent>
          )}

          {activeTab === 'system' && (
            <TabContent>
              <PageTitle>System Settings</PageTitle>
              <InfoBox>
                System configuration coming soon...
                <br />
                Features: Server settings, federation, network config, security
              </InfoBox>
            </TabContent>
          )}
        </Content>
      </MainContent>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f3f4f6;
`;

const Header = styled.header`
  background: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #e5e7eb;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  color: #667eea;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const AdminBadge = styled.span`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.5px;
`;

const UserName = styled.span`
  color: #1f2937;
  font-weight: 500;
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ef4444;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #dc2626;
    transform: translateY(-1px);
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
  background: white;
  border-right: 2px solid #e5e7eb;
  padding: 1.5rem 0;
`;

const NavItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  color: ${({ $active }) => ($active ? '#667eea' : '#6b7280')};
  background: ${({ $active }) => ($active ? '#f0f4ff' : 'transparent')};
  border-left: 4px solid ${({ $active }) => ($active ? '#667eea' : 'transparent')};
  cursor: pointer;
  transition: all 0.2s;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};

  &:hover {
    background: #f9fafb;
    color: #667eea;
  }

  svg {
    font-size: 1.25rem;
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
`;

const OverviewTab = styled.div``;

const PageTitle = styled.h1`
  font-size: 2rem;
  color: #1f2937;
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
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-left: 4px solid ${props => props.color};
`;

const StatIcon = styled.div`
  font-size: 2rem;
  color: #667eea;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatSubtext = styled.div`
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 0.25rem;
`;

const Section = styled.section`
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  color: #1f2937;
  margin-bottom: 1.5rem;
  font-weight: 600;
`;

const MetaTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  thead th {
    text-align: left;
    color: #6b7280;
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #1f2937;
  }
  tbody tr:hover {
    background: #f9fafb;
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
  background: #f9fafb;
  border-radius: 12px;
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
  color: #1f2937;
  font-size: 0.875rem;

  strong {
    font-weight: 600;
  }
`;

const ActivityTime = styled.div`
  color: #9ca3af;
  font-size: 0.75rem;
`;

const EmptyActivity = styled.div`
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
  font-style: italic;
`;

const TabContent = styled.div``;

const ActionBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: ${props => props.primary ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6'};
  color: ${props => props.primary ? 'white' : '#1f2937'};
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  svg {
    font-size: 1rem;
  }
`;

const InfoBox = styled.div`
  background: #fef3c7;
  border: 2px solid #fbbf24;
  border-radius: 12px;
  padding: 1.5rem;
  color: #78350f;
  line-height: 1.6;
`;

export default AdminDashboard;

