import React from 'react';
import styled, { keyframes } from 'styled-components';
import { FiX, FiVolume2, FiMic } from 'react-icons/fi';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
`;

const MonitorButtonContainer = styled.button`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.35rem;
  background: ${(props) => {
    if (props.$empty) return 'transparent';
    if (props.$speaking) {
      return `linear-gradient(135deg, ${props.theme.colors.line.speaker.bg} 0%, #1e3a8a 100%)`;
    }
    return `linear-gradient(135deg, ${props.theme.colors.line.speaker.bg} 0%, #172554 100%)`;
  }};
  border: 1px solid ${(props) => {
    if (props.$empty) return props.theme.colors.border;
    if (props.$speaking) return props.theme.colors.success;
    return props.theme.colors.line.speaker.border;
  }};
  border-radius: ${(props) => props.theme.borderRadius.md};
  color: ${(props) => (props.$empty ? props.theme.colors.textSecondary : 'white')};
  position: relative;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  cursor: ${(props) => (props.$empty ? 'default' : 'pointer')};
  text-align: left;
  width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:not(:disabled):hover {
    box-shadow: ${(props) => (props.$empty ? 'none' : '0 0 0 1px rgba(59, 130, 246, 0.5)')};
  }

  &:disabled {
    cursor: default;
  }
`;

const SlotBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 0.6rem;
  font-weight: 800;
  font-family: ${(props) => props.theme.fonts.mono};
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 4px;
  color: ${(props) => props.theme.colors.accent};
  flex-shrink: 0;
`;

const MonitorIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: ${(props) => (props.$speaking ? 'rgba(34, 197, 94, 0.25)' : 'rgba(59, 130, 246, 0.2)')};
  border-radius: 50%;
  font-size: 0.85rem;
  color: ${(props) => (props.$speaking ? props.theme.colors.success : props.theme.colors.accent)};
  flex-shrink: 0;
`;

const MonitorInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
`;

const MonitorLineName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MonitorButtonNumber = styled.div`
  font-size: 0.58rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const VADIndicator = styled.div`
  width: 8px;
  height: 8px;
  background: ${(props) => (props.$active ? props.theme.colors.success : '#4b5563')};
  border-radius: 50%;
  flex-shrink: 0;
  animation: ${(props) => (props.$active ? `${pulse} 0.8s infinite` : 'none')};
`;

const CloseButton = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    background: rgba(239, 68, 68, 0.35);
    border-color: ${(props) => props.theme.colors.error};
    color: white;
  }
`;

const Placeholder = styled.div`
  flex: 1;
  font-size: 0.72rem;
  color: ${(props) => props.theme.colors.textTertiary};
  font-style: italic;
`;

const MonitorButton = ({
  line,
  buttonNumber,
  pageNumber,
  slotIndex,
  isSpeaking,
  onSpeakClick,
  onRemove,
}) => {
  if (!line) {
    return (
      <MonitorButtonContainer $empty disabled type="button">
        <SlotBadge>{slotIndex}</SlotBadge>
        <Placeholder>—</Placeholder>
      </MonitorButtonContainer>
    );
  }

  const handleRemove = (e) => {
    e.stopPropagation();
    if (typeof onRemove === 'function') onRemove();
  };

  return (
    <MonitorButtonContainer
      $speaking={isSpeaking}
      type="button"
      onClick={onSpeakClick}
      title={isSpeaking ? 'Click to stop talking' : 'Click to talk on this line'}
      aria-pressed={isSpeaking}
    >
      <SlotBadge>{slotIndex}</SlotBadge>
      <MonitorIcon $speaking={isSpeaking}>
        {isSpeaking ? <FiMic /> : <FiVolume2 />}
      </MonitorIcon>
      <MonitorInfo>
        <MonitorLineName title={line?.label || line?.name}>
          {line?.label || line?.name || 'Unknown'}
        </MonitorLineName>
        <MonitorButtonNumber>
          {pageNumber ? `${buttonNumber}-${pageNumber}` : `Btn ${buttonNumber}`}
          {' · '}
          {isSpeaking ? 'TALKING' : 'SPK · click to talk'}
        </MonitorButtonNumber>
      </MonitorInfo>
      <VADIndicator $active={isSpeaking} title={isSpeaking ? 'Mic open' : 'Listen only'} />
      {typeof onRemove === 'function' && (
        <CloseButton
          role="button"
          tabIndex={0}
          onClick={handleRemove}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleRemove(e);
            }
          }}
          title="Remove from speaker"
          aria-label="Remove from speaker"
        >
          <FiX size={13} />
        </CloseButton>
      )}
    </MonitorButtonContainer>
  );
};

export default MonitorButton;
