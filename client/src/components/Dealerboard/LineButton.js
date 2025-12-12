import React from 'react';
import styled from 'styled-components';
import { FiPhone, FiPhoneOff } from 'react-icons/fi';

const ButtonContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  background: ${props => {
    if (props.$isMonitored) return '#3b82f6'; // Blue when monitored
    if (props.$isRinging) return '#f59e0b'; // Orange when ringing
    if (props.$isSelected) return '#10b981'; // Green when selected
    if (props.$activeCall) return '#8b5cf6'; // Purple when in call
    return props.theme.colors.surface;
  }};
  border: 2px solid ${props => {
    if (props.$isSelected) return props.theme.colors.accent;
    return props.theme.colors.border;
  }};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 80px;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
`;

const ButtonNumber = styled.div`
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  background: ${props => props.theme.colors.surfaceElevated};
  padding: 0.125rem 0.375rem;
  border-radius: ${props => props.theme.borderRadius.sm};
`;

const ButtonContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin-top: 1.25rem;
`;

const LineName = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => {
    if (props.$isMonitored || props.$isRinging || props.$isSelected || props.$activeCall) {
      return 'white';
    }
    return props.theme.colors.text;
  }};
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const LineType = styled.div`
  font-size: 0.625rem;
  color: ${props => {
    if (props.$isMonitored || props.$isRinging || props.$isSelected || props.$activeCall) {
      return 'rgba(255, 255, 255, 0.8)';
    }
    return props.theme.colors.textSecondary;
  }};
  text-transform: uppercase;
`;

const StatusIcon = styled.div`
  font-size: 1rem;
  color: ${props => {
    if (props.$isMonitored || props.$isRinging || props.$isSelected || props.$activeCall) {
      return 'white';
    }
    return props.theme.colors.textSecondary;
  }};
`;

const ToggleContainer = styled.div`
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  display: flex;
  align-items: center;
`;

const ToggleSwitch = styled.button`
  width: 32px;
  height: 18px;
  background: ${props => props.$active ? '#10b981' : props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 9px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
  
  &::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    top: 1px;
    left: ${props => props.$active ? '15px' : '1px'};
    transition: all 0.2s;
  }
  
  &:hover {
    border-color: ${props => props.theme.colors.accent};
  }
`;

const LineButton = ({
  buttonNumber,
  pageNumber,
  assignment,
  line,
  isMonitored,
  activeCall,
  isRinging,
  isSelected,
  onLineClick,
  onMonitorToggle
}) => {
  const handleToggle = (e) => {
    e.stopPropagation();
    onMonitorToggle(!isMonitored);
  };

  const getButtonLabel = () => {
    if (assignment?.type === 'speed_dial') {
      return assignment.speedDialName || 'Speed Dial';
    }
    if (line) {
      return line.label || line.name || 'Unnamed Line';
    }
    return 'Empty';
  };

  const getLineType = () => {
    if (assignment?.type === 'speed_dial') {
      return 'SPEED';
    }
    if (line?.type === 'private_wire') {
      return line.mode || 'PW';
    }
    if (line?.type === 'DDI') {
      return 'DDI';
    }
    return '';
  };

  const getStatusIcon = () => {
    if (activeCall) {
      return <FiPhone style={{ color: 'white' }} />;
    }
    if (isRinging) {
      return <FiPhone style={{ color: 'white', animation: 'pulse 1s infinite' }} />;
    }
    return null;
  };

  return (
    <ButtonContainer
      $isMonitored={isMonitored}
      $isRinging={isRinging}
      $isSelected={isSelected}
      $activeCall={activeCall}
      onClick={onLineClick}
    >
      <ButtonNumber>
        {buttonNumber}-{pageNumber}
      </ButtonNumber>
      
      <ToggleContainer>
        <ToggleSwitch
          $active={isMonitored}
          onClick={handleToggle}
          title={isMonitored ? 'Disable monitor' : 'Enable monitor'}
        />
      </ToggleContainer>

      <ButtonContent>
        {getStatusIcon() && <StatusIcon>{getStatusIcon()}</StatusIcon>}
        <LineName $isMonitored={isMonitored} $isRinging={isRinging} $isSelected={isSelected} $activeCall={activeCall}>
          {getButtonLabel()}
        </LineName>
        <LineType $isMonitored={isMonitored} $isRinging={isRinging} $isSelected={isSelected} $activeCall={activeCall}>
          {getLineType()}
        </LineType>
      </ButtonContent>
    </ButtonContainer>
  );
};

export default LineButton;

