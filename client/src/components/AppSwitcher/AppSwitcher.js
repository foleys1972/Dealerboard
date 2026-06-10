import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { FiGrid, FiShield, FiSettings, FiLayers, FiMic, FiGlobe } from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { getAppNavItems, getActiveNavId } from '../../utils/navigation';

const Switcher = styled.nav`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const NavItem = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: none;
  background: ${props => props.$active ? props.theme.colors.gradient : 'transparent'};
  color: ${props => props.$active ? '#ffffff' : props.theme.colors.textSecondary};
  font-size: 0.8125rem;
  font-weight: ${props => props.$active ? 600 : 500};
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    color: ${props => props.$active ? '#ffffff' : props.theme.colors.text};
    background: ${props => props.$active ? props.theme.colors.gradient : props.theme.colors.surface};
  }

  svg {
    flex-shrink: 0;
  }
`;

const ICONS = {
  grid: FiGrid,
  shield: FiShield,
  building: FiLayers,
  settings: FiSettings,
  mic: FiMic,
  globe: FiGlobe,
};

const AppSwitcher = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const items = getAppNavItems(user);
  const activeId = getActiveNavId(location.pathname);

  return (
    <Switcher aria-label="Application navigation">
      {items.map((item) => {
        const Icon = ICONS[item.icon] || FiGrid;
        return (
          <NavItem
            key={item.id}
            $active={activeId === item.id}
            onClick={() => navigate(item.path)}
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </NavItem>
        );
      })}
    </Switcher>
  );
};

export default AppSwitcher;
