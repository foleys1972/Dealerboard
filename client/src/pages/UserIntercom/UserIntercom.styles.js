import styled from 'styled-components';

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: ${props => props.$embedded ? '100%' : '100vh'};
  background: ${props => props.theme.colors.background};
  position: relative;
  font-family: ${props => props.theme.fonts.primary};
  color: ${props => props.theme.colors.text};
  
  &::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.04) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }
`;

export const Header = styled.header`
  background: ${props => props.theme.colors.surface};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 0.875rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 10;
  min-height: 48px;
`;

export const Logo = styled.div`
  font-size: 1.125rem;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const StatusIndicator = styled.div.withConfig({
  shouldForwardProp: (prop) => !['status','size'].includes(prop)
})`
  width: ${props => props.size === 'small' ? '8px' : '10px'};
  height: ${props => props.size === 'small' ? '8px' : '10px'};
  border-radius: 50%;
  background: ${props => {
    switch(props.status) {
      case 'available': return props.theme.colors.success;
      case 'busy': return props.theme.colors.warning;
      case 'away': return props.theme.colors.textTertiary;
      case 'dnd': return props.theme.colors.error;
      default: return props.theme.colors.textTertiary;
    }
  }};
  flex-shrink: 0;
`;

export const UserName = styled.span`
  color: rgba(255, 255, 255, 0.9);
  font-weight: 400;
  font-size: 0.875rem;
`;

export const IconButton = styled.button`
  background: transparent;
  border: 1px solid transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.375rem;
  border-radius: 4px;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }
  
  &:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.12);
  }
`;

export const MainContent = styled.main`
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  position: relative;
  z-index: 1;
  background: ${props => props.theme.colors.background};
  
  /* Custom scrollbar - Teams style */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
`;

export const QuickActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

export const QuickActionButton = styled.button`
  background: ${({ $active, $color }) => {
    if ($active && $color) return $color;
    if ($active) return 'rgba(6, 182, 212, 0.15)';
    return 'transparent';
  }};
  border: 1px solid ${({ $active, $color }) => {
    if ($active && $color) return $color;
    if ($active) return 'rgba(6, 182, 212, 0.4)';
    return 'rgba(255, 255, 255, 0.1)';
  }};
  color: ${({ $active, $color }) => ($active && $color ? '#ffffff' : '#ffffff')};
  height: 32px;
  padding: 0 0.75rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 400;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  
  &:hover {
    background: ${({ $active, $color }) => {
      if ($active && $color) return $color;
      if ($active) return 'rgba(6, 182, 212, 0.2)';
      return 'rgba(255, 255, 255, 0.08)';
    }};
    border-color: ${({ $active, $color }) => {
      if ($active && $color) return $color;
      if ($active) return 'rgba(6, 182, 212, 0.5)';
      return 'rgba(255, 255, 255, 0.15)';
    }};
  }
  
  &:active {
    transform: scale(0.98);
  }

  svg {
    font-size: 0.875rem;
    flex-shrink: 0;
  }
`;

export const QuickActionStat = styled.div`
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  height: 32px;
  padding: 0 0.75rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 400;
  
  svg {
    font-size: 0.875rem;
    opacity: 0.7;
  }
`;

export const FloatingCallBar = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: ${props => props.theme.colors.surface};
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.4);
  z-index: 1000;
`;

export const CallBarContent = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  min-height: 56px;
  
  @media (max-width: 768px) {
    padding: 0.625rem 1rem;
    gap: 1rem;
  }
`;

export const CallBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
`;

export const CallStatusIndicator = styled.div`
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${props => props.$active ? props.theme.colors.success : props.theme.colors.textTertiary};
  flex-shrink: 0;
  
  .pulse-dot {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: ${props => props.$active ? props.theme.colors.success : props.theme.colors.textTertiary};
    animation: ${props => props.$active ? 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'};
  }
  
  @keyframes pulse-ring {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }
`;

export const CallBarInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const CallBarTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
  
  @media (max-width: 768px) {
    font-size: 0.8125rem;
  }
`;

export const CallBarMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  flex-wrap: wrap;
  line-height: 1.3;
`;

export const CallBarControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  
  @media (max-width: 768px) {
    gap: 0.5rem;
  }
`;

export const CallBarButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.$prominent ? '0.5rem' : '0'};
  padding: ${props => props.$prominent ? '0.625rem 1.25rem' : '0.625rem'};
  border-radius: ${props => props.$prominent ? '4px' : '50%'};
  border: none;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: ${props => props.$prominent ? '600' : '400'};
  font-size: ${props => props.$prominent ? '0.8125rem' : '1rem'};
  min-width: ${props => props.$prominent ? 'auto' : '40px'};
  height: 40px;
  
  ${props => {
    if (props.$variant === 'danger') {
      return `
        background: ${props.theme.colors.error};
        color: #ffffff;
        
        &:hover {
          opacity: 0.9;
        }
      `;
    } else if (props.$variant === 'warning') {
      return `
        background: ${props.theme.colors.warning};
        color: ${props.theme.colors.primary};
        
        &:hover {
          opacity: 0.9;
        }
      `;
    } else {
      return `
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        
        &:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.15);
        }
      `;
    }
  }}
  
  &:active {
    transform: scale(0.96);
  }
  
  svg {
    flex-shrink: 0;
  }
  
  @media (max-width: 768px) {
    ${props => props.$prominent ? `
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      min-width: auto;
    ` : `
      min-width: 36px;
      height: 36px;
      padding: 0.5rem;
    `}
  }
`;

export const ActiveCallPanel = styled.div`
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`;

export const CallHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

export const CallIcon = styled.div`
  font-size: 2rem;
`;

export const CallInfo = styled.div`
  flex: 1;
`;

export const CallTitle = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
  color: #1f2937;
`;

export const CallDuration = styled.div`
  color: #6b7280;
`;

export const CallControls = styled.div`
  display: flex;
  gap: 1rem;
`;

export const CallButton = styled.button`
  flex: 1;
  background: ${props => props.danger ? '#ef4444' : props.muted ? '#6b7280' : '#3b82f6'};
  color: white;
  border: none;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
  }

  svg {
    font-size: 1rem;
  }
`;

export const GridLayout = styled.div`
  display: grid;
  grid-template-columns: ${props => props.$columns ? `repeat(${props.$columns}, 1fr)` : '1fr'};
  gap: ${props => props.$gap || '1rem'};
  width: 100%;

  @media (max-width: 768px) {
    grid-template-columns: ${props => props.$mobileColumns ? `repeat(${props.$mobileColumns}, 1fr)` : '1fr'} !important;
    gap: ${props => props.$mobileGap || '0.75rem'};
  }

  @media (min-width: 769px) and (max-width: 1200px) {
    grid-template-columns: ${props => props.$tabletColumns ? `repeat(${props.$tabletColumns}, 1fr)` : 'repeat(2, 1fr)'};
  }
`;

export const Section = styled.section`
  background: ${props => props.theme.colors.surface};
  border-radius: 4px;
  padding: 1rem;
  border: 1px solid ${props => props.theme.colors.border};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  
  &:hover {
    border-color: ${props => props.theme.colors.borderLight};
  }
`;

export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

export const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  svg {
    flex-shrink: 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }
  
  span {
    flex: 1;
  }
`;

export const SectionTitleOld = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffffff;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: -0.01em;

  svg {
    color: #a0a0b0;
  }
`;

export const Badge = styled.span`
  background: ${props => props.$active ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$active ? '#60cdff' : 'rgba(255, 255, 255, 0.7)'};
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  font-size: 0.6875rem;
  font-weight: 500;
  border: 1px solid ${props => props.$active ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.1)'};
`;

export const BroadcastList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
  
  /* Teams-style scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
`;

export const SectionSubtext = styled.p`
  margin: 0.25rem 0 0.75rem;
  font-size: 0.75rem;
  color: ${({ $error, theme }) => ($error ? theme.colors.error : theme.colors.textSecondary)};
  line-height: 1.4;
`;

export const BroadcastItem = styled.div`
  background: ${({ $active, $bgColor }) => {
    if ($active) return 'rgba(6, 182, 212, 0.1)';
    const bg = $bgColor || '#2d2c2c';
    // Check if it's a light color and use Teams dark instead
    if (typeof bg === 'string' && (bg.startsWith('#f') || bg.startsWith('#e') || bg.startsWith('#d') || bg.startsWith('#c') || bg.startsWith('#b') || bg.startsWith('#a') || bg.includes('255, 255, 255') || bg.includes('249, 250, 251'))) {
      return '#2d2c2c';
    }
    return bg;
  }};
  border: 1px solid ${({ $active }) => ($active ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.08)')};
  border-radius: 4px;
  padding: 0.75rem;
  min-height: 56px;
  width: 100%;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  color: rgba(255, 255, 255, 0.9);
  
  &:hover {
    background: ${({ $active }) => ($active ? 'rgba(6, 182, 212, 0.15)' : '#323130')};
    border-color: ${({ $active }) => ($active ? 'rgba(6, 182, 212, 0.4)' : 'rgba(255, 255, 255, 0.12)')};
  }
`;

export const BroadcastHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0rem;
  min-height: 36px;
`;

export const BroadcastName = styled.div`
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

export const BroadcastTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  line-height: 1.4;
`;

export const BroadcastSubtext = styled.div`
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.3;
`;

export const BroadcastStats = styled.div`
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  flex-wrap: nowrap;
  margin-top: 0.25rem;
`;

export const BroadcastStat = styled.div`
  display: flex;
  gap: 0.375rem;
  align-items: baseline;

  strong {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
  }
  
  span {
    color: rgba(255, 255, 255, 0.5);
  }
`;

export const OnAirPill = styled.span`
  background: ${props => props.theme.colors.error};
  color: #ffffff;
  border-radius: 10px;
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
`;

export const MonitorToggle = styled.button`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: ${({ $active, theme }) => ($active ? theme.colors.success : theme.colors.textTertiary)};
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.4 : 1};
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;

  &:hover {
    ${({ disabled, $active }) => !disabled && `
      background: ${$active ? '#0e6e0e' : 'rgba(255, 255, 255, 0.4)'};
      transform: scale(1.1);
    `}
  }
`;

export const ToggleTrack = styled.span`
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
  background: ${({ $active }) => ($active ? '#22c55e' : '#3a3d44')};
  border-radius: 999px;
  transition: background 0.2s ease;
`;

export const ToggleThumb = styled.span`
  position: absolute;
  top: 2px;
  left: ${({ $active }) => ($active ? '20px' : '2px')};
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: left 0.2s ease;
`;

export const EndButton = styled.button`
  height: 36px;
  padding: 0 0.75rem;
  border: none;
  border-radius: 8px;
  background: #ef4444;
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);

  &:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(239, 68, 68, 0.4);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
  }
`;

export const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

export const VolumeIcon = styled.div`
  color: #667eea;
`;

export const VolumeSlider = styled.input`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  background: #e5e7eb;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #667eea;
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #667eea;
    cursor: pointer;
    border: none;
  }
`;

export const VolumeLevel = styled.span`
  font-size: 0.875rem;
  color: #a1a1aa;
  min-width: 40px;
  text-align: right;
`;

export const VadMeter = styled.div`
  width: 100%;
  height: 6px;
  background: #1f2937;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.35rem;
`;

export const VadFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #10b981, #22d3ee);
  transition: width 100ms linear;
`;

export const AddContactButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid rgba(6, 182, 212, 0.3);
  background: rgba(6, 182, 212, 0.1);
  color: #60cdff;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  height: 32px;
  
  &:hover {
    background: rgba(6, 182, 212, 0.15);
    border-color: rgba(6, 182, 212, 0.4);
    color: #ffffff;
  }
  
  &:active {
    transform: scale(0.98);
  }
  
  svg {
    flex-shrink: 0;
    font-size: 0.875rem;
  }
`;

export const ContactActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
`;

export const CallActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.75rem;
  font-weight: 400;
  min-width: 32px;
  height: 32px;
  
  ${props => {
    if (props.$variant === 'danger') {
      return `
        background: ${props => props.theme.colors.error};
        color: #ffffff;
        
        &:hover {
          background: #a4262c;
        }
      `;
    } else if (props.$variant === 'video') {
      return `
        background: #0078d4;
        color: #ffffff;
        
        &:hover {
          background: #106ebe;
        }
      `;
    } else if (props.$variant === 'voice') {
      return `
        background: rgba(6, 182, 212, 0.1);
        color: #60cdff;
        border-color: rgba(6, 182, 212, 0.3);
        
        &:hover {
          background: rgba(6, 182, 212, 0.15);
          border-color: rgba(6, 182, 212, 0.4);
        }
      `;
    } else {
      return `
        background: transparent;
        color: rgba(255, 255, 255, 0.7);
        border-color: rgba(255, 255, 255, 0.1);
        
        &:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.9);
        }
      `;
    }
  }}
  
  &:active {
    transform: scale(0.96);
  }
  
  svg {
    flex-shrink: 0;
    font-size: 0.875rem;
  }
`;

export const RemoveContactButton = styled.button`
  border: none;
  background: #fee2e2;
  color: #dc2626;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

export const ContactTabs = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
`;

export const ContactTab = styled.button`
  flex: 1;
  border: none;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $active }) => ($active ? '#312e81' : '#e0e7ff')};
  color: ${({ $active }) => ($active ? '#fff' : '#4338ca')};
`;

export const ContactForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
  }
`;

export const ContactInput = styled.input`
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
  font-size: 0.95rem;
  color: #111827;
`;

export const ContactModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
`;

export const ContactModalButton = styled.button`
  border: none;
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $variant }) => ($variant === 'secondary' ? '#e5e7eb' : '#312e81')};
  color: ${({ $variant }) => ($variant === 'secondary' ? '#111827' : '#fff')};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
`;

export const DirectoryResult = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  margin-bottom: 0.5rem;
`;

export const DirectoryAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: #2563eb;
  color: white;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
`;

export const PushToTalkButton = styled.button`
  margin-top: 0.5rem;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border: 1px solid ${({ $speaking, theme }) => ($speaking ? theme.colors.error : theme.colors.border)};
  border-radius: 4px;
  height: 32px;
  padding: 0 0.75rem;
  font-weight: 400;
  font-size: 0.8125rem;
  color: ${({ $speaking, theme }) => ($speaking ? '#ffffff' : theme.colors.text)};
  background: ${({ $speaking, theme }) => ($speaking ? theme.colors.error : 'transparent')};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    ${({ disabled, $speaking }) => !disabled && `
      background: ${$speaking ? '#a4262c' : 'rgba(255, 255, 255, 0.08)'};
      border-color: ${$speaking ? '#a4262c' : 'rgba(255, 255, 255, 0.15)'};
    `}
  }

  &:active {
    transform: ${({ disabled }) => (disabled ? 'none' : 'scale(0.98)')};
  }
`;

export const PushToTalkHint = styled.span`
  display: block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: #9ca3af;
`;

export const ContactList = styled.div`
  display: grid;
  grid-template-columns: ${props => props.$columns ? `repeat(${props.$columns}, 1fr)` : 'repeat(auto-fill, minmax(200px, 1fr))'};
  gap: ${props => props.$gap || '0.75rem'};
  width: 100%;

  @media (max-width: 768px) {
    grid-template-columns: ${props => props.$mobileColumns ? `repeat(${props.$mobileColumns}, 1fr)` : '1fr'};
    gap: ${props => props.$mobileGap || '0.5rem'};
  }
`;

export const ContactItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: ${({ $bgColor }) => {
    const bg = $bgColor || '#2d2c2c';
    // Check if it's a light color and use Teams dark instead
    if (typeof bg === 'string' && (bg.startsWith('#f') || bg.startsWith('#e') || bg.startsWith('#d') || bg.startsWith('#c') || bg.startsWith('#b') || bg.startsWith('#a') || bg.includes('255, 255, 255') || bg.includes('249, 250, 251'))) {
      return '#2d2c2c';
    }
    return bg;
  }};
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  min-height: 56px;
  width: 100%;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.4 : 1};
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  color: #ffffff;

  &:hover {
    background: ${props => props.disabled 
      ? '#2d2c2c' 
      : '#323130'};
    border-color: ${props => props.disabled 
      ? 'rgba(255, 255, 255, 0.08)' 
      : 'rgba(255, 255, 255, 0.12)'};
  }

  &:active {
    background: #3b3a39;
  }
`;

export const ContactAvatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #0078d4;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  position: relative;
  flex-shrink: 0;

  svg {
    font-size: 1rem;
  }
`;

export const ContactInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const ContactName = styled.div`
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
  width: 100%;
  text-align: left;
  font-size: 0.875rem;
  line-height: 1.4;
`;

export const ContactStatus = styled.div`
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.3;
`;

export const OnlineBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.375rem;
  background: ${props => props.theme.colors.success};
  color: #ffffff;
  font-size: 0.625rem;
  font-weight: 600;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
`;

export const SettingsPanel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
  z-index: 1000;
`;

export const SettingsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  h3 {
    margin: 0;
    color: #1f2937;
  }
`;

export const SettingsContent = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

export const SettingsFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0 1.5rem 1.5rem;
`;

export const SettingsFooterButton = styled.button`
  border: none;
  border-radius: 10px;
  padding: 0.5rem 1rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $variant }) => ($variant === 'secondary' ? '#1f2937' : '#fff')};
  background: ${({ $variant }) => ($variant === 'secondary' ? '#e5e7eb' : '#312e81')};
`;

export const DeviceSelect = styled.select`
  width: 100%;
  padding: 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
`;

export const SettingGroup = styled.div`
  margin-bottom: 1.5rem;
`;

export const SettingLabel = styled.label`
  display: block;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.5rem;
`;

export const SettingInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

export const StatusSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  background: white;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

export const EmployeeId = styled.span`
  color: #9ca3af;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  background: #f3f4f6;
  border-radius: 4px;
`;

export const LogoutButton = styled.button`
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

export const UserDetails = styled.div`
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem;
`;

export const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
`;

export const DetailLabel = styled.span`
  color: #6b7280;
  font-weight: 500;
`;

export const DetailValue = styled.span`
  color: #1f2937;
  font-family: monospace;
`;

export const ForwardUserDisplay = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f0fdf4;
  border: 2px solid #4ade80;
  border-radius: 8px;
`;

export const ForwardUserInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  strong {
    color: #1f2937;
  }

  span {
    color: #6b7280;
    font-size: 0.875rem;
  }
`;

export const ChangeButton = styled.button`
  background: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #5568d3;
  }
`;

export const SelectButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1rem;
  background: #f3f4f6;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
    border-color: #667eea;
    color: #667eea;
  }

  svg {
    font-size: 1.25rem;
  }
`;

export const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

export const ModalContent = styled.div`
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  h3 {
    margin: 0;
    color: #1f2937;
  }
`;

export const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  svg {
    color: #9ca3af;
    font-size: 1.25rem;
  }
`;

export const SearchInput = styled.input`
  flex: 1;
  border: none;
  font-size: 1rem;
  outline: none;
  color: #1f2937;

  &::placeholder {
    color: #9ca3af;
  }
`;

export const ResultsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

export const ResultItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f0fdf4;
  }
`;

export const ResultInfo = styled.div`
  flex: 1;
`;

export const ResultName = styled.div`
  font-weight: 500;
  color: #1f2937;
`;

export const ResultDetails = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

export const EmptyState = styled.div`
  text-align: center;
  padding: 2rem 1rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8125rem;
  line-height: 1.5;
`;
