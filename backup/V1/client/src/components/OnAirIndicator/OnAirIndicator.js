import React from 'react';
import styled, { keyframes } from 'styled-components';
import { FiMic, FiMicOff, FiRadio } from 'react-icons/fi';

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
`;

const glow = keyframes`
  0%, 100% {
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.5),
                0 0 20px rgba(239, 68, 68, 0.3),
                0 0 30px rgba(239, 68, 68, 0.1);
  }
  50% {
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.7),
                0 0 30px rgba(239, 68, 68, 0.5),
                0 0 45px rgba(239, 68, 68, 0.3);
  }
`;

const OnAirContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
  padding: ${props => props.theme.spacing.md};
  background: ${props => props.isActive ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' : props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.isActive ? '0 0 20px rgba(239, 68, 68, 0.4)' : props.theme.shadows.sm};
  transition: all 0.3s ease;
  animation: ${props => props.isActive ? pulse : 'none'} 2s ease-in-out infinite;
`;

const OnAirLight = styled.div`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${props => props.isActive ? '#ef4444' : props.theme.colors.border};
  animation: ${props => props.isActive ? glow : 'none'} 2s ease-in-out infinite;
  transition: all 0.3s ease;
`;

const OnAirText = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.isActive ? '#ffffff' : props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.xs} ${props => props.theme.spacing.sm};
  background: ${props => props.isActive ? 'rgba(255, 255, 255, 0.2)' : props.theme.colors.background};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.75rem;
  font-weight: 500;
  color: ${props => props.isActive ? '#ffffff' : props.theme.colors.textSecondary};
`;

const IconWrapper = styled.div`
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  color: ${props => props.isActive ? '#ffffff' : props.theme.colors.textSecondary};
`;

const ParticipantCount = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.isActive ? '#ffffff' : props.theme.colors.text};
`;

const Timer = styled.div`
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.isActive ? '#ffffff' : props.theme.colors.text};
  min-width: 60px;
  text-align: center;
`;

const PTTIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
  padding: ${props => props.theme.spacing.xs} ${props => props.theme.spacing.sm};
  background: ${props => props.transmitting ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.75rem;
  font-weight: 600;
  color: #ffffff;
  animation: ${props => props.transmitting ? pulse : 'none'} 1s ease-in-out infinite;
`;

const Kbd = styled.kbd`
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.7rem;
`;

/**
 * OnAirIndicator Component
 * Shows visual "On Air" indicator when in active call
 */
const OnAirIndicator = ({ 
  isActive = false, 
  isPTT = false,
  isTransmitting = false,
  participantCount = 0,
  duration = 0,
  callType = 'direct', // 'direct', 'group', 'broadcast'
  onDisconnect
}) => {
  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isActive) {
    return (
      <OnAirContainer isActive={false}>
        <OnAirLight isActive={false} />
        <OnAirText isActive={false}>Off Air</OnAirText>
      </OnAirContainer>
    );
  }

  return (
    <OnAirContainer isActive={true}>
      <OnAirLight isActive={true} />
      
      <OnAirText isActive={true}>
        🔴 On Air
      </OnAirText>

      {callType === 'group' && participantCount > 0 && (
        <StatusBadge isActive={true}>
          <IconWrapper isActive={true}>
            <FiRadio />
          </IconWrapper>
          <ParticipantCount isActive={true}>
            {participantCount} {participantCount === 1 ? 'person' : 'people'}
          </ParticipantCount>
        </StatusBadge>
      )}

      {isPTT && (
        <PTTIndicator transmitting={isTransmitting}>
          <IconWrapper isActive={true}>
            {isTransmitting ? <FiMic /> : <FiMicOff />}
          </IconWrapper>
          {isTransmitting ? 'TRANSMITTING' : <><Kbd>SPACE</Kbd> to talk</>}
        </PTTIndicator>
      )}

      <Timer isActive={true}>
        {formatDuration(duration)}
      </Timer>

      {onDisconnect && (
        <button
          onClick={onDisconnect}
          style={{
            padding: '8px 16px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: 'none',
            borderRadius: '8px',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.5)'}
          onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.3)'}
        >
          End Connection
        </button>
      )}
    </OnAirContainer>
  );
};

export default OnAirIndicator;

