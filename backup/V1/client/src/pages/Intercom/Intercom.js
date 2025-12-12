import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMic, 
  FiMicOff, 
  FiVolume2, 
  FiVolumeX, 
  FiUsers, 
  FiSettings,
  FiPlay,
  FiPause,
  FiSquare,
  FiMoreVertical,
  FiX,
  FiUser,
  FiUserCheck,
  FiUserX
} from 'react-icons/fi';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSocket } from '../../hooks/useSocket';
import { useAuthStore } from '../../stores/authStore';
import { Button, Card, Badge, Flex, Spacer, Grid } from '../../styles/GlobalStyle';
import AudioControls from '../../components/AudioControls/AudioControls';
import ParticipantList from '../../components/ParticipantList/ParticipantList';
import AudioVisualizer from '../../components/AudioVisualizer/AudioVisualizer';
import toast from 'react-hot-toast';

const IntercomContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: ${props => props.theme.colors.background};
`;

const Header = styled.div`
  background: ${props => props.theme.colors.surface};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  padding: ${props => props.theme.spacing.lg};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
`;

const GroupInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const GroupName = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const GroupStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  margin-top: ${props => props.theme.spacing.xs};
`;

const StatusIndicator = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.isConnected ? props.theme.colors.success : props.theme.colors.error};
`;

const StatusText = styled.span`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const ControlButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  font-size: 0.875rem;
  font-weight: 500;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const ParticipantsPanel = styled.div`
  width: 300px;
  background: ${props => props.theme.colors.surface};
  border-right: 1px solid ${props => props.theme.colors.border};
  display: flex;
  flex-direction: column;
`;

const ParticipantsHeader = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ParticipantsTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const ParticipantsCount = styled(Badge)`
  font-size: 0.75rem;
`;

const ParticipantsList = styled.div`
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
  background: ${props => props.isSpeaking ? `${props.theme.colors.accent}20` : 'transparent'};
  border: 1px solid ${props => props.isSpeaking ? `${props.theme.colors.accent}40` : 'transparent'};
  transition: all 0.2s ease;
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
`;

const ParticipantStatus = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ParticipantControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
`;

const ControlIcon = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.accent};
    color: white;
  }
`;

const AudioPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.xl};
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
`;

const AudioVisualizerContainer = styled.div`
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: ${props => props.theme.spacing.xl};
  position: relative;
  overflow: hidden;
`;

const AudioLevel = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  opacity: ${props => props.level};
  transition: opacity 0.1s ease;
`;

const AudioIcon = styled.div`
  font-size: 4rem;
  color: white;
  z-index: 1;
`;

const AudioControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${props => props.theme.spacing.lg};
`;

const PrimaryControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.md};
`;

const PrimaryButton = styled(Button)`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  box-shadow: ${props => props.theme.shadows.lg};
`;

const SecondaryControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const SecondaryButton = styled(Button)`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
`;

const RecordingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  background: ${props => props.theme.colors.error};
  color: white;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
`;

const RecordingDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: white;
  animation: blink 1s infinite;

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;

const Intercom = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    isConnected,
    isSpeaking,
    isMuted,
    audioLevel,
    participants,
    currentRoom,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleUnmute,
  } = useWebRTC();
  const { socket, emit } = useSocket();
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState(1.0);

  useEffect(() => {
    if (groupId && !currentRoom) {
      joinRoom(`room_${groupId}`, groupId);
    }
  }, [groupId, currentRoom, joinRoom]);

  useEffect(() => {
    if (!socket) return;

    const handleRecordingStarted = (data) => {
      setIsRecording(true);
      setRecordingId(data.recordingId);
    };

    const handleRecordingStopped = (data) => {
      setIsRecording(false);
      setRecordingId(null);
    };

    socket.on('recording-started', handleRecordingStarted);
    socket.on('recording-stopped', handleRecordingStopped);

    return () => {
      socket.off('recording-started', handleRecordingStarted);
      socket.off('recording-stopped', handleRecordingStopped);
    };
  }, [socket]);

  const handleMuteToggle = () => {
    if (isMuted) {
      toggleUnmute();
    } else {
      toggleMute();
    }
  };

  const handleStartRecording = () => {
    if (currentRoom) {
      emit('start-recording', { roomId: currentRoom.id, groupId });
    }
  };

  const handleStopRecording = () => {
    if (currentRoom) {
      emit('stop-recording', { roomId: currentRoom.id });
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    navigate('/');
  };

  const participantList = Array.from(participants.values());

  return (
    <IntercomContainer>
      <Header>
        <HeaderLeft>
          <GroupInfo>
            <GroupName>Group: {groupId}</GroupName>
            <GroupStatus>
              <StatusIndicator isConnected={isConnected} />
              <StatusText>
                {isConnected ? 'Connected' : 'Disconnected'}
              </StatusText>
              {isRecording && (
                <RecordingIndicator>
                  <RecordingDot />
                  Recording
                </RecordingIndicator>
              )}
            </GroupStatus>
          </GroupInfo>
        </HeaderLeft>

        <HeaderRight>
          <ControlButton
            variant="secondary"
            onClick={() => setShowSettings(!showSettings)}
          >
            <FiSettings />
            Settings
          </ControlButton>
          
          <ControlButton
            variant="secondary"
            onClick={handleLeaveRoom}
          >
            <FiX />
            Leave
          </ControlButton>
        </HeaderRight>
      </Header>

      <MainContent>
        <ParticipantsPanel>
          <ParticipantsHeader>
            <ParticipantsTitle>
              <FiUsers />
              Participants
            </ParticipantsTitle>
            <ParticipantsCount variant="info">
              {participantList.length}
            </ParticipantsCount>
          </ParticipantsHeader>

          <ParticipantList
            participants={participantList}
            currentUserId={user?.id}
            onMuteParticipant={(userId) => {
              // Handle mute participant
              console.log('Mute participant:', userId);
            }}
            onUnmuteParticipant={(userId) => {
              // Handle unmute participant
              console.log('Unmute participant:', userId);
            }}
            onKickParticipant={(userId) => {
              // Handle kick participant
              console.log('Kick participant:', userId);
            }}
            showControls={true}
            showAudioLevels={true}
            showRoles={true}
          />
        </ParticipantsPanel>

        <AudioPanel>
          <AudioControls
            isConnected={isConnected}
            isRecording={isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onMuteToggle={handleMuteToggle}
            onVolumeChange={(volume) => setVolume(volume)}
            onSettingsToggle={() => setShowSettings(!showSettings)}
            showSettings={showSettings}
            volume={volume}
            isMuted={isMuted}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
          />
        </AudioPanel>
      </MainContent>
    </IntercomContainer>
  );
};

export default Intercom;
