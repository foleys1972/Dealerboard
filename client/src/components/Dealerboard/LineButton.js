import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { FiPhone, FiHeadphones, FiVolume2 } from 'react-icons/fi';
import {
  resolveAssignmentLabel,
  resolveAssignmentTypeLabel,
  isPrivateWireAssignment,
} from '../../utils/dealerboardAssignment';

const flashRed = keyframes`
  0%, 100% {
    background: ${(p) => p.theme.colors.line.ringing.bg};
    border-color: ${(p) => p.theme.colors.line.ringing.border};
    box-shadow: 0 0 14px ${(p) => p.theme.colors.line.ringing.glow};
  }
  50% {
    background: #450a0a;
    border-color: #ef4444;
    box-shadow: none;
  }
`;

const ButtonContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  background: ${(props) => {
    if (props.$isAssigned) return props.theme.colors.line.speaker.bg;
    if (props.$isMonitored) return props.theme.colors.line.monitor.bg;
    if (props.$isPrivate) return props.theme.colors.line.private.bg;
    if (props.$isRinging) return props.theme.colors.line.ringing.bg;
    if (props.$isBusy || props.$isDisconnected) return props.theme.colors.line.busy.bg;
    return props.theme.colors.line.idle.bg;
  }};
  border: 2px solid ${(props) => {
    if (props.$isAssigned) return props.theme.colors.line.speaker.border;
    if (props.$isMonitored) return props.theme.colors.line.monitor.border;
    if (props.$isPrivate) return props.theme.colors.line.private.border;
    if (props.$isRinging) return props.theme.colors.line.ringing.border;
    if (props.$isBusy || props.$isDisconnected) return props.theme.colors.line.busy.border;
    return props.theme.colors.line.idle.border;
  }};
  border-radius: ${(props) => props.theme.borderRadius.md};
  padding: 0.45rem 0.4rem 0.35rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  min-height: 48px;
  max-height: 100%;
  overflow: hidden;
  animation: ${(props) => (props.$isRinging ? css`${flashRed} 0.8s infinite` : 'none')};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    ${(props) => props.$isRinging && css`
      box-shadow: 0 0 10px ${props.theme.colors.line.ringing.glow};
    `}
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
`;

const ButtonNumber = styled.div`
  position: absolute;
  top: 0.2rem;
  left: 0.25rem;
  font-size: 0.6rem;
  font-weight: 700;
  font-family: ${(props) => props.theme.fonts.mono};
  color: ${(props) => (props.$highlight ? 'rgba(255,255,255,0.95)' : props.theme.colors.textSecondary)};
  background: ${(props) => (props.$highlight ? 'rgba(0,0,0,0.25)' : props.theme.colors.surfaceElevated)};
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  letter-spacing: 0.02em;
`;

const ModeToggles = styled.div`
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  display: flex;
  gap: 0.2rem;
  z-index: 2;
`;

const modeBtnActive = (variant, theme) => {
  if (variant === 'monitor') return { bg: theme.colors.warning, border: '#fbbf24', color: '#1f1f1f' };
  return { bg: theme.colors.info, border: '#60a5fa', color: '#fff' };
};

const ModeButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-width: 28px;
  height: 18px;
  padding: 0 0.25rem;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  border-radius: 3px;
  border: 1px solid ${(props) => (props.$active ? modeBtnActive(props.$variant, props.theme).border : props.theme.colors.border)};
  background: ${(props) => (props.$active ? modeBtnActive(props.$variant, props.theme).bg : 'rgba(0,0,0,0.35)')};
  color: ${(props) => (props.$active ? modeBtnActive(props.$variant, props.theme).color : props.theme.colors.textSecondary)};
  cursor: pointer;
  transition: all 0.15s;
  opacity: ${(props) => (props.$active ? 1 : 0.85)};

  &:hover {
    opacity: 1;
    border-color: ${(props) => modeBtnActive(props.$variant, props.theme).border};
  }

  svg {
    width: 9px;
    height: 9px;
  }
`;

const ButtonContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  margin-top: 0.85rem;
  padding: 0 0.15rem;
`;

const lineTextColor = (props) => {
  if (props.$isPrivate || props.$isRinging || props.$isBusy || props.$isDisconnected
      || props.$isMonitored || props.$isAssigned) {
    return 'white';
  }
  return props.theme.colors.text;
};

const LineName = styled.div`
  font-size: 0.72rem;
  font-weight: 700;
  color: ${lineTextColor};
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  line-height: 1.2;
`;

const LineType = styled.div`
  font-size: 0.52rem;
  font-weight: 600;
  color: ${(props) => {
    if (props.$isPrivate || props.$isRinging || props.$isBusy || props.$isDisconnected
        || props.$isMonitored || props.$isAssigned) {
      return 'rgba(255, 255, 255, 0.82)';
    }
    return props.theme.colors.textSecondary;
  }};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const StatusIcon = styled.div`
  font-size: 0.85rem;
  color: white;
  margin-bottom: 0.05rem;
`;

const AudioIndicator = styled.div`
  position: absolute;
  bottom: 0.25rem;
  right: 0.25rem;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => {
    if (props.$assigned) return props.theme.colors.info;
    if (props.$monitored) return props.theme.colors.warning;
    if (props.$active) return props.theme.colors.success;
    return 'transparent';
  }};
  box-shadow: ${(props) => (props.$active || props.$monitored || props.$assigned
    ? '0 0 0 2px rgba(255,255,255,0.15)'
    : 'none')};
`;

const LineButton = ({
  buttonNumber,
  pageNumber,
  assignment,
  line,
  isMonitored,
  isAssigned,
  isAudioActive,
  isPrivate,
  isBusy,
  isRinging,
  isDisconnected,
  onLineClick,
  onMonitorToggle,
  onAssignToggle,
  lines = [],
  speedDials = [],
}) => {
  const hasAssignment = !!assignment;
  const showModeToggles = hasAssignment && isPrivateWireAssignment(assignment) && !!line;
  const highlighted = isPrivate || isRinging || isBusy || isDisconnected || isMonitored || isAssigned;

  const handleMonitor = (e) => {
    e.stopPropagation();
    onMonitorToggle(!isMonitored);
  };

  const handleAssign = (e) => {
    e.stopPropagation();
    onAssignToggle(!isAssigned);
  };

  const getButtonLabel = () => {
    if (!assignment) return '—';
    return resolveAssignmentLabel(assignment, { lines, speedDials });
  };

  const getLineType = () => {
    if (isDisconnected) return 'NO SBC';
    if (isAssigned) return 'ON SPK';
    if (isMonitored) return 'MONITOR';
    if (isPrivate) return 'PRIVATE';
    if (isRinging) return 'RINGING';
    if (isBusy) return 'BUSY';
    return resolveAssignmentTypeLabel(assignment, line);
  };

  const getStatusIcon = () => {
    if (isRinging || isPrivate) return <FiPhone />;
    return null;
  };

  return (
    <ButtonContainer
      $isMonitored={isMonitored}
      $isAssigned={isAssigned}
      $isPrivate={isPrivate}
      $isBusy={isBusy}
      $isRinging={isRinging}
      $isDisconnected={isDisconnected}
      onClick={onLineClick}
      title={
        isDisconnected ? 'No SIP/SBC connectivity'
          : isRinging ? 'Incoming call — press to answer'
          : isAssigned ? 'On speaker panel — click panel slot to talk'
          : isMonitored ? 'Monitoring — use MON to stop'
          : isPrivate ? 'You are on this line'
          : isBusy ? 'Line busy'
          : undefined
      }
      role="button"
      aria-pressed={isPrivate || isRinging}
    >
      <ButtonNumber $highlight={highlighted}>
        {buttonNumber}-{pageNumber}
      </ButtonNumber>

      {showModeToggles && (
        <ModeToggles>
          <ModeButton
            type="button"
            $variant="monitor"
            $active={isMonitored}
            onClick={handleMonitor}
            title={isMonitored ? 'Stop monitoring (listen only)' : 'Monitor live audio (listen only, no speaker panel)'}
            aria-pressed={isMonitored}
            aria-label="Monitor on speaker"
          >
            <FiHeadphones />
            MON
          </ModeButton>
          <ModeButton
            type="button"
            $variant="speaker"
            $active={isAssigned}
            onClick={handleAssign}
            title={isAssigned ? 'Remove from speaker panel' : 'Assign to speaker panel (listen — click panel to talk)'}
            aria-pressed={isAssigned}
            aria-label="Assign to speaker"
          >
            <FiVolume2 />
            SPK
          </ModeButton>
        </ModeToggles>
      )}

      <ButtonContent>
        {getStatusIcon() && <StatusIcon>{getStatusIcon()}</StatusIcon>}
        <LineName
          $isPrivate={isPrivate}
          $isBusy={isBusy}
          $isRinging={isRinging}
          $isDisconnected={isDisconnected}
          $isMonitored={isMonitored}
          $isAssigned={isAssigned}
        >
          {hasAssignment ? getButtonLabel() : '—'}
        </LineName>
        <LineType
          $isPrivate={isPrivate}
          $isBusy={isBusy}
          $isRinging={isRinging}
          $isDisconnected={isDisconnected}
          $isMonitored={isMonitored}
          $isAssigned={isAssigned}
        >
          {hasAssignment ? getLineType() : 'EMPTY'}
        </LineType>
      </ButtonContent>

      <AudioIndicator
        $active={!!isAudioActive && !isMonitored && !isAssigned}
        $monitored={isMonitored}
        $assigned={isAssigned}
        title={
          isAssigned ? 'Speaker latched'
            : isMonitored ? 'Monitoring'
            : isAudioActive ? 'Audio active'
            : ''
        }
      />
    </ButtonContainer>
  );
};

export default LineButton;
