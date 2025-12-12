import React from 'react';
import styled from 'styled-components';
import { FiX, FiVolume2 } from 'react-icons/fi';

const MonitorButtonContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #3b82f6;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: ${props => props.theme.borderRadius.md};
  color: white;
  position: relative;
  min-height: 60px;
  flex-shrink: 0;
`;

const MonitorIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 1rem;
`;

const MonitorInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MonitorLineName = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
`;

const MonitorButtonNumber = styled.div`
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.8);
`;

const VADIndicator = styled.div`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 8px;
  height: 8px;
  background: ${props => props.$active ? '#10b981' : '#6b7280'};
  border-radius: 50%;
  animation: ${props => props.$active ? 'pulse 1s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.2);
    }
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }
`;

const MonitorButton = ({ line, buttonNumber, onToggle }) => {
  // TODO: Get VAD status from socket/state
  const vadActive = false; // This should come from real-time audio detection

  return (
    <MonitorButtonContainer>
      <MonitorIcon>
        <FiVolume2 />
      </MonitorIcon>
      <MonitorInfo>
        <MonitorLineName>{line?.label || line?.name || 'Unknown Line'}</MonitorLineName>
        <MonitorButtonNumber>Button {buttonNumber}</MonitorButtonNumber>
      </MonitorInfo>
      <VADIndicator $active={vadActive} title={vadActive ? 'Audio detected' : 'No audio'} />
      <CloseButton onClick={onToggle} title="Stop monitoring">
        <FiX size={14} />
      </CloseButton>
    </MonitorButtonContainer>
  );
};

export default MonitorButton;

