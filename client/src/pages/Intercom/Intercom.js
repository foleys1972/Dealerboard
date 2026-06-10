import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { 
  FiMessageSquare, 
  FiPhone,
  FiUser,
  FiLogOut,
  FiRefreshCw,
  FiGrid,
  FiVideo,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiBell,
  FiX,
  FiCheckCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import { useQueryClient } from 'react-query';

// Import voice functionality from UserIntercom
import VoiceTab from './VoiceTab';
import MessagingTab from './MessagingTab';
import DealerboardTab from './DealerboardTab';
import ZoomTab from '../../components/ZoomTab/ZoomTab';
import TeamsTab from '../../components/TeamsTab/TeamsTab';
import AppSwitcher from '../../components/AppSwitcher/AppSwitcher';
import OnboardingTour from '../../components/OnboardingTour/OnboardingTour';
import { PRODUCT_NAME } from '../../config/brand';
import { useInstantIntercomWebRTC } from '../../hooks/useInstantIntercomWebRTC';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: ${props => props.theme.colors.background};
  overflow: hidden;
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const Header = styled.div`
  background: rgba(21, 21, 32, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid ${props => props.theme.colors.border};
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
  gap: 1rem;
  flex-wrap: wrap;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    padding: 0.75rem 1rem;
  }
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #06b6d4 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  min-width: 0;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    gap: 0.5rem;
  }
`;

const ConnectionStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: ${props => props.$isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
  border: 1px solid ${props => props.$isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${props => props.$isOnline ? '#10b981' : '#ef4444'};
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$isOnline ? '#10b981' : '#ef4444'};
  animation: ${props => props.$isOnline ? 'pulse 2s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const NotificationBanner = styled.div`
  position: fixed;
  top: 80px;
  right: 1rem;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem 1.25rem;
  box-shadow: ${props => props.theme.shadows.lg};
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 300px;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

const NotificationContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const NotificationTitle = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const NotificationMessage = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  line-height: 1.4;
`;

const NotificationActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const NotificationButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  ${props => props.$primary ? `
    background: ${props.theme.colors.accent};
    color: white;
  ` : `
    background: ${props.theme.colors.surfaceElevated};
    color: ${props.theme.colors.text};
    border: 1px solid ${props.theme.colors.border};
  `}
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.md};
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => props.theme.borderRadius.sm};
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.text};
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }
  
  &:active {
    transform: scale(0.98);
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  color: #3b82f6;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
  }
  
  &:active {
    transform: scale(0.98);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  padding: 0 2rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    padding: 0 1rem;
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  padding: 0 1rem;
`;

const PageInfo = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0.5rem;
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: ${props => props.$disabled ? props.theme.colors.surfaceElevated : props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.$disabled ? props.theme.colors.textSecondary : props.theme.colors.text};
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s;
  font-size: 0.875rem;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.surfaceElevated};
    border-color: ${props => props.theme.colors.accent};
  }
`;

const Tab = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: ${props => props.$active ? props.theme.colors.text : props.theme.colors.textSecondary};
  font-size: 0.9375rem;
  font-weight: ${props => props.$active ? 600 : 400};
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    color: ${props => props.theme.colors.text};
    background: ${props => props.theme.colors.surfaceElevated};
  }
  
  ${props => props.$active && `
    border-bottom-color: ${props.theme.colors.accent};
    color: ${props.theme.colors.text};
  `}
`;

const TabContent = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Intercom = () => {
  const { user, logout, refreshToken, updateUser: updateAuthUser } = useAuthStore();
  const { socket, isConnected: socketConnected, reconnect: reconnectSocket } = useSocket();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dealerboard');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dealerboardPage, setDealerboardPage] = useState(1);
  const [profileUpdateNotification, setProfileUpdateNotification] = useState(null);

  // Keep instant intercom WebRTC media running regardless of which Intercom tab is active.
  // Without this, being on Dealerboard can prevent producing/consuming audio for instant calls.
  useInstantIntercomWebRTC();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshToken();
      if (result.success) {
        toast.success('Token refreshed successfully');
        // Reconnect socket with new token if needed
        if (socket && !socket.connected) {
          socket.connect();
        }
      } else {
        toast.error(result.error || 'Failed to refresh token');
      }
    } catch (error) {
      toast.error('Failed to refresh token');
      console.error('Token refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Listen for profile update notifications
  useEffect(() => {
    if (!socket) return;

    const handleProfileUpdate = (data) => {
      setProfileUpdateNotification({
        ...data,
        id: `profile-update-${Date.now()}`
      });
    };

    socket.on('profile-updated', handleProfileUpdate);

    return () => {
      socket.off('profile-updated', handleProfileUpdate);
    };
  }, [socket]);

  // Handle update now button click
  const handleUpdateNow = async () => {
    if (!user?.id && !user?.userId) return;

    try {
      // Fetch latest user data from server
      const response = await api.get(`/api/auth/users/${user.id || user.userId}`);
      if (response.data?.user) {
        // Update auth store with latest user data
        updateAuthUser(response.data.user);
        
        // Invalidate any user-related queries
        queryClient.invalidateQueries(['user', user.id || user.userId]);
        queryClient.invalidateQueries('admin-users');
        
        toast.success('Profile updated successfully');
        setProfileUpdateNotification(null);
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      toast.error('Failed to update profile');
    }
  };

  const handleDismissNotification = () => {
    setProfileUpdateNotification(null);
  };

  return (
    <Container>
      <OnboardingTour />
      {profileUpdateNotification && (
        <NotificationBanner>
          <FiBell style={{ color: '#06b6d4', fontSize: '1.25rem', flexShrink: 0 }} />
          <NotificationContent>
            <NotificationTitle>
              <FiCheckCircle style={{ color: '#10b981' }} />
              Profile Updated
            </NotificationTitle>
            <NotificationMessage>
              {profileUpdateNotification.message || 'Your profile has been updated by an administrator.'}
            </NotificationMessage>
            <NotificationActions>
              <NotificationButton $primary onClick={handleUpdateNow}>
                Update Now
              </NotificationButton>
              <NotificationButton onClick={handleDismissNotification}>
                Later
              </NotificationButton>
            </NotificationActions>
          </NotificationContent>
          <CloseButton onClick={handleDismissNotification} title="Dismiss">
            <FiX />
          </CloseButton>
        </NotificationBanner>
      )}
      <Header>
        <HeaderLeft>
          <Logo>{PRODUCT_NAME}</Logo>
          <AppSwitcher />
          <ConnectionStatus 
            $isOnline={socketConnected}
            onClick={() => !socketConnected && reconnectSocket()}
            style={{ cursor: socketConnected ? 'default' : 'pointer' }}
            title={socketConnected ? 'WebSocket connected' : 'WebSocket disconnected - Click to retry'}
          >
            <StatusDot $isOnline={socketConnected} />
            <span>{socketConnected ? 'Online' : 'Offline'}</span>
          </ConnectionStatus>
        </HeaderLeft>
        <HeaderRight>
          <UserInfo>
            <FiUser />
            <span>@{user?.username || user?.name || 'User'}</span>
          </UserInfo>
          <RefreshButton 
            onClick={handleRefreshToken} 
            disabled={isRefreshing}
            title="Refresh token"
          >
            <FiRefreshCw style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </RefreshButton>
          <LogoutButton onClick={handleLogout} title="Logout">
            <FiLogOut />
            <span>Logout</span>
          </LogoutButton>
        </HeaderRight>
      </Header>

      <TabsContainer>
        <Tab 
          $active={activeTab === 'dealerboard'} 
          onClick={() => setActiveTab('dealerboard')}
        >
          <FiGrid />
          <span>Dealerboard</span>
        </Tab>
        <Tab 
          $active={activeTab === 'voice'} 
          onClick={() => setActiveTab('voice')}
        >
          <FiPhone />
          <span>Intercom</span>
        </Tab>
        <Tab 
          $active={activeTab === 'messaging'} 
          onClick={() => setActiveTab('messaging')}
        >
          <FiMessageSquare />
          <span>Messaging</span>
        </Tab>
        <Tab 
          $active={activeTab === 'zoom'} 
          onClick={() => setActiveTab('zoom')}
        >
          <FiVideo />
          <span>Zoom</span>
        </Tab>
        <Tab 
          $active={activeTab === 'teams'} 
          onClick={() => setActiveTab('teams')}
        >
          <FiUsers />
          <span>Teams</span>
        </Tab>
        
        {activeTab === 'dealerboard' && (
          <PaginationContainer>
            <PageButton 
              $disabled={dealerboardPage === 1}
              onClick={() => setDealerboardPage(prev => Math.max(1, prev - 1))}
              disabled={dealerboardPage === 1}
            >
              <FiChevronLeft />
            </PageButton>
            <PageInfo>Page {dealerboardPage} of 10</PageInfo>
            <PageButton 
              $disabled={dealerboardPage === 10}
              onClick={() => setDealerboardPage(prev => Math.min(10, prev + 1))}
              disabled={dealerboardPage === 10}
            >
              <FiChevronRight />
            </PageButton>
          </PaginationContainer>
        )}
      </TabsContainer>

      <TabContent>
        {activeTab === 'dealerboard' && <DealerboardTab currentPage={dealerboardPage} onPageChange={setDealerboardPage} />}
        {activeTab === 'voice' && <VoiceTab />}
        {activeTab === 'messaging' && <MessagingTab />}
        {activeTab === 'zoom' && <ZoomTab />}
        {activeTab === 'teams' && <TeamsTab />}
      </TabContent>
    </Container>
  );
};

export default Intercom;
