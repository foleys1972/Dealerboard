import React, { useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { FiLogOut, FiSettings } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/GlobalStyle';
import TenantAdminSettings from '../../components/TenantAdminSettings/TenantAdminSettings';
import AppSwitcher from '../../components/AppSwitcher/AppSwitcher';
import { PRODUCT_NAME } from '../../config/brand';

const Container = styled.div`
  min-height: 100vh;
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  font-weight: 700;
  font-size: 1.25rem;
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

const Badge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.lg};
  font-size: 0.75rem;
  font-weight: 600;
  background: ${props => props.theme.colors.accent};
  color: #ffffff;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surfaceElevated};
  color: ${props => props.theme.colors.text};
  cursor: pointer;

  &:hover {
    background: ${props => props.theme.colors.surface};
  }
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1;
  min-height: 0;
`;

const Sidebar = styled.aside`
  border-right: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  padding: 1rem;
`;

const NavItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => (props.$active ? props.theme.colors.accent : 'transparent')};
  background: ${props => (props.$active ? props.theme.colors.surfaceElevated : 'transparent')};
  color: ${props => (props.$active ? props.theme.colors.accent : props.theme.colors.textSecondary)};
  cursor: pointer;

  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.accent};
  }
`;

const Content = styled.main`
  padding: 1.5rem;
  overflow-y: auto;
`;

const InfoBox = styled.div`
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const TenantAdminDashboard = () => {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('settings');

  const isTenantAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'admin';

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  if (!isTenantAdmin) {
    return (
      <ThemeProvider theme={theme}>
        <Container>
          <Header>
            <Logo>{PRODUCT_NAME}</Logo>
          </Header>
          <Content>
            <InfoBox>Tenant admin access required.</InfoBox>
          </Content>
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
            <Badge>TENANT ADMIN</Badge>
            <div>{user?.name || user?.username || 'Tenant Admin'}</div>
            <Button onClick={handleLogout} title="Logout">
              <FiLogOut />
              <span>Logout</span>
            </Button>
          </UserInfo>
        </Header>

        <MainContent>
          <Sidebar>
            <NavItem $active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
              <FiSettings />
              <span>Tenant Settings</span>
            </NavItem>
          </Sidebar>

          <Content>
            {activeTab === 'settings' && <TenantAdminSettings />}
          </Content>
        </MainContent>
      </Container>
    </ThemeProvider>
  );
};

export default TenantAdminDashboard;
