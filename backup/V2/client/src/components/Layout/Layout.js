import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMenu, 
  FiX, 
  FiHome, 
  FiUsers, 
  FiSettings, 
  FiMic, 
  FiMicOff,
  FiVolume2,
  FiVolumeX,
  FiLogOut,
  FiUser,
  FiBell,
  FiActivity
} from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useSocket } from '../../hooks/useSocket';
import { Button, Badge, Flex, Spacer } from '../../styles/GlobalStyle';

const LayoutContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: ${props => props.theme.colors.background};
`;

const Sidebar = styled(motion.aside)`
  width: 280px;
  background: ${props => props.theme.colors.surface};
  border-right: 1px solid ${props => props.theme.colors.border};
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 100;
  overflow-y: auto;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    width: 100%;
    transform: translateX(-100%);
    ${props => props.isOpen && `
      transform: translateX(0);
    `}
  }
`;

const SidebarHeader = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  background: ${props => props.theme.colors.gradient};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  
  svg {
    background: ${props => props.theme.colors.gradient};
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const UserInfo = styled.div`
  padding: ${props => props.theme.spacing.md};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
`;

const UserDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserRole = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Navigation = styled.nav`
  flex: 1;
  padding: ${props => props.theme.spacing.md} 0;
`;

const NavItem = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.lg};
  color: ${props => props.theme.colors.text};
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;

  &:hover {
    background: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.primary};
  }

  ${({ $active, theme }) => $active && `
    background: ${theme.colors.accent}20;
    color: ${theme.colors.accent};
    font-weight: 600;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: ${theme.colors.accent};
    }
  `}
`;

const NavIcon = styled.div`
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
`;

const NavText = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
`;

const NavBadge = styled(Badge)`
  margin-left: auto;
`;

const AudioControls = styled.div`
  padding: ${props => props.theme.spacing.md};
  border-top: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background};
`;

const AudioControlGroup = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const AudioControlButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.75rem;
  padding: ${props => props.theme.spacing.sm};
`;

const AudioLevel = styled.div`
  height: 4px;
  background: ${props => props.theme.colors.border};
  border-radius: 2px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${props => props.level * 100}%;
    background: ${props => props.theme.colors.accent};
    transition: width 0.1s ease;
  }
`;

const MainContent = styled.main`
  flex: 1;
  margin-left: 280px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    margin-left: 0;
  }
`;

const TopBar = styled.header`
  background: ${props => props.theme.colors.surface};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  padding: ${props => props.theme.spacing.md} ${props => props.theme.spacing.lg};
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
`;

const TopBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
`;

const MenuButton = styled(Button)`
  display: none;
  
  @media (max-width: ${props => props.theme.breakpoints.md}) {
    display: flex;
  }
`;

const PageTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const TopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const NotificationButton = styled(Button)`
  position: relative;
  padding: ${props => props.theme.spacing.sm};
`;

const NotificationBadge = styled(Badge)`
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 0.625rem;
  padding: 2px 4px;
  min-width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Content = styled.div`
  flex: 1;
  padding: ${props => props.theme.spacing.lg};
`;

const Overlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  display: none;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    display: block;
  }
`;

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { 
    isConnected, 
    isSpeaking, 
    isMuted, 
    audioLevel,
    currentRoom,
    toggleMute,
    toggleUnmute,
    leaveRoom
  } = useWebRTCStore();
  const { socket } = useSocket();

  const navigationItems = [
    { path: '/', icon: FiHome, label: 'Dashboard', badge: null },
    { path: '/admin', icon: FiUsers, label: 'Admin', badge: null },
    { path: '/recordings', icon: FiActivity, label: 'Recordings', badge: null },
    { path: '/federation', icon: FiActivity, label: 'Federation', badge: null },
    { path: '/settings', icon: FiSettings, label: 'Settings', badge: null },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleMuteToggle = () => {
    if (isMuted) {
      toggleUnmute();
    } else {
      toggleMute();
    }
  };

  const handleLeaveRoom = () => {
    if (currentRoom) {
      leaveRoom();
      navigate('/');
    }
  };

  return (
    <LayoutContainer>
      <AnimatePresence>
        {sidebarOpen && (
          <Overlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <Sidebar
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        exit={{ x: -280 }}
        isOpen={sidebarOpen}
      >
        <SidebarHeader>
          <Logo>
            <FiMic />
            TradePulse
          </Logo>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSidebarOpen(false)}
            style={{ display: 'none' }}
          >
            <FiX />
          </Button>
        </SidebarHeader>

        <UserInfo>
          <UserAvatar>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </UserAvatar>
          <UserDetails>
            <UserName>{user?.name || 'User'}</UserName>
            <UserRole>{user?.role || 'Trader'}</UserRole>
          </UserDetails>
        </UserInfo>

        <Navigation>
          {navigationItems.map((item) => (
            <NavItem
              key={item.path}
              $active={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false);
              }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <NavIcon>
                <item.icon />
              </NavIcon>
              <NavText>{item.label}</NavText>
              {item.badge && <NavBadge variant="info">{item.badge}</NavBadge>}
            </NavItem>
          ))}
        </Navigation>

        <AudioControls>
          <AudioControlGroup>
            <AudioControlButton
              variant={isMuted ? 'danger' : 'secondary'}
              onClick={handleMuteToggle}
              disabled={!isConnected}
            >
              {isMuted ? <FiMicOff /> : <FiMic />}
              {isMuted ? 'Unmute' : 'Mute'}
            </AudioControlButton>
            
            <AudioControlButton
              variant="secondary"
              onClick={handleLeaveRoom}
              disabled={!currentRoom}
            >
              <FiX />
              Leave
            </AudioControlButton>
          </AudioControlGroup>

          <AudioLevel level={audioLevel} />
          <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '4px' }}>
            {isSpeaking ? 'Speaking...' : 'Silent'}
          </div>
        </AudioControls>
      </Sidebar>

      <MainContent>
        <TopBar>
          <TopBarLeft>
            <MenuButton
              variant="secondary"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu />
            </MenuButton>
            <PageTitle>
              {navigationItems.find(item => item.path === location.pathname)?.label || 'TradePulse'}
            </PageTitle>
          </TopBarLeft>

          <TopBarRight>
            <NotificationButton variant="secondary">
              <FiBell />
              <NotificationBadge variant="error">3</NotificationBadge>
            </NotificationButton>

            <Button
              variant="secondary"
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FiLogOut />
              Logout
            </Button>
          </TopBarRight>
        </TopBar>

        <Content>
          {children}
        </Content>
      </MainContent>
    </LayoutContainer>
  );
};

export default Layout;
