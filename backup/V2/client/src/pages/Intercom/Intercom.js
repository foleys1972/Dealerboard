import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { 
  FiMessageSquare, 
  FiPhone,
  FiUsers,
  FiUser,
  FiSearch,
  FiSend,
  FiPaperclip,
  FiMoreVertical,
  FiLogOut,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';

// Import voice functionality from UserIntercom
import VoiceTab from './VoiceTab';
import MessagingTab from './MessagingTab';

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

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
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
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  padding: 0 2rem;
`;

const Tab = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
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
  const { user, logout, refreshToken } = useAuthStore();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('voice'); // 'voice' or 'messaging'
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  return (
    <Container>
      <Header>
        <Logo>TradePulse Intercom</Logo>
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
      </TabsContainer>

      <TabContent>
        {activeTab === 'voice' && <VoiceTab />}
        {activeTab === 'messaging' && <MessagingTab />}
      </TabContent>
    </Container>
  );
};

export default Intercom;
