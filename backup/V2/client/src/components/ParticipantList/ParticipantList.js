import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUser, 
  FiMic, 
  FiMicOff, 
  FiVolume2, 
  FiVolumeX, 
  FiMoreVertical,
  FiUserCheck,
  FiUserX,
  FiAward,
  FiShield,
  FiActivity
} from 'react-icons/fi';
import { Button, Badge, Flex } from '../../styles/GlobalStyle';

const ParticipantListContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  overflow: hidden;
`;

const ListHeader = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background};
`;

const ListTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const ParticipantCount = styled(Badge)`
  margin-left: auto;
  font-size: 0.75rem;
`;

const ListContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${props => props.theme.spacing.md};
`;

const ParticipantItem = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  margin-bottom: ${props => props.theme.spacing.sm};
  background: ${props => props.isSpeaking ? props.theme.colors.accent + '20' : 'transparent'};
  border: 1px solid ${props => props.isSpeaking ? props.theme.colors.accent + '40' : 'transparent'};
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    background: ${props => props.theme.colors.background};
  }
`;

const ParticipantAvatar = styled.div`
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
  position: relative;
  flex-shrink: 0;
`;

const SpeakingIndicator = styled.div`
  position: absolute;
  top: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.theme.colors.success};
  border: 2px solid ${props => props.theme.colors.surface};
  animation: pulse 1s infinite;
  
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.2); opacity: 0.7; }
  }
`;

const ParticipantInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ParticipantName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ParticipantStatus = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
  margin-top: 2px;
`;

const ParticipantControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
  align-items: center;
`;

const ControlButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
`;

const RoleBadge = styled(Badge)`
  font-size: 0.625rem;
  padding: 2px 6px;
  margin-left: ${props => props.theme.spacing.xs};
`;

const AudioLevelBar = styled.div`
  width: 60px;
  height: 4px;
  background: ${props => props.theme.colors.border};
  border-radius: 2px;
  overflow: hidden;
  position: relative;
`;

const AudioLevelFill = styled(motion.div)`
  height: 100%;
  background: ${props => props.theme.colors.accent};
  border-radius: 2px;
  width: ${props => props.level * 100}%;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.xl};
  color: ${props => props.theme.colors.textSecondary};
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: ${props => props.theme.spacing.md};
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 0.875rem;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  font-size: 0.75rem;
  opacity: 0.7;
`;

const ParticipantList = ({ 
  participants = [], 
  currentUserId,
  onMuteParticipant,
  onUnmuteParticipant,
  onKickParticipant,
  onMakeModerator,
  showControls = true,
  showAudioLevels = true,
  showRoles = true
}) => {
  const [expandedParticipant, setExpandedParticipant] = useState(null);

  const handleParticipantClick = (participantId) => {
    setExpandedParticipant(expandedParticipant === participantId ? null : participantId);
  };

  const handleMuteToggle = (participantId, isMuted) => {
    if (isMuted) {
      onUnmuteParticipant?.(participantId);
    } else {
      onMuteParticipant?.(participantId);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <FiShield />;
      case 'moderator':
        return <FiAward />;
      case 'speaker':
        return <FiMic />;
      default:
        return <FiUser />;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'moderator':
        return 'warning';
      case 'speaker':
        return 'info';
      default:
        return 'secondary';
    }
  };

  if (participants.length === 0) {
    return (
      <ParticipantListContainer>
        <ListHeader>
          <ListTitle>
            <FiUser />
            Participants
          </ListTitle>
          <ParticipantCount variant="info">0</ParticipantCount>
        </ListHeader>
        <ListContent>
          <EmptyState>
            <EmptyIcon>
              <FiUser />
            </EmptyIcon>
            <EmptyText>No participants</EmptyText>
            <EmptySubtext>Waiting for users to join...</EmptySubtext>
          </EmptyState>
        </ListContent>
      </ParticipantListContainer>
    );
  }

  return (
    <ParticipantListContainer>
      <ListHeader>
        <ListTitle>
          <FiUser />
          Participants
        </ListTitle>
        <ParticipantCount variant="info">
          {participants.length}
        </ParticipantCount>
      </ListHeader>
      
      <ListContent>
        <AnimatePresence>
          {participants.map((participant) => (
            <ParticipantItem
              key={participant.userId}
              isSpeaking={participant.isSpeaking}
              onClick={() => handleParticipantClick(participant.userId)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ParticipantAvatar>
                {participant.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                {participant.isSpeaking && <SpeakingIndicator />}
              </ParticipantAvatar>
              
              <ParticipantInfo>
                <ParticipantName>
                  {participant.user?.name || participant.userId}
                  {participant.userId === currentUserId && (
                    <Badge variant="info" size="sm">You</Badge>
                  )}
                  {showRoles && participant.role && (
                    <RoleBadge variant={getRoleColor(participant.role)}>
                      {getRoleIcon(participant.role)}
                      {participant.role}
                    </RoleBadge>
                  )}
                </ParticipantName>
                
                <ParticipantStatus>
                  {participant.isMuted ? (
                    <>
                      <FiMicOff />
                      Muted
                    </>
                  ) : (
                    <>
                      <FiMic />
                      Active
                    </>
                  )}
                  {participant.isSpeaking && (
                    <>
                      <FiActivity />
                      Speaking
                    </>
                  )}
                </ParticipantStatus>
                
                {showAudioLevels && participant.audioLevel !== undefined && (
                  <AudioLevelBar>
                    <AudioLevelFill
                      level={participant.audioLevel}
                      animate={{ width: `${participant.audioLevel * 100}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </AudioLevelBar>
                )}
              </ParticipantInfo>
              
              {showControls && (
                <ParticipantControls>
                  <ControlButton
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMuteToggle(participant.userId, participant.isMuted);
                    }}
                    title={participant.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {participant.isMuted ? <FiMicOff /> : <FiMic />}
                  </ControlButton>
                  
                  <ControlButton
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle volume control
                    }}
                    title="Volume"
                  >
                    <FiVolume2 />
                  </ControlButton>
                  
                  <ControlButton
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle more options
                    }}
                    title="More options"
                  >
                    <FiMoreVertical />
                  </ControlButton>
                </ParticipantControls>
              )}
            </ParticipantItem>
          ))}
        </AnimatePresence>
      </ListContent>
    </ParticipantListContainer>
  );
};

export default ParticipantList;
