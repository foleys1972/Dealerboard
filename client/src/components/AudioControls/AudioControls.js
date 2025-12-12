import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiMic, 
  FiMicOff, 
  FiVolume2, 
  FiVolumeX, 
  FiPlay, 
  FiPause, 
  FiSquare,
  FiSettings,
  FiHeadphones,
  FiHeadphonesOff
} from 'react-icons/fi';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { useWebRTC } from '../../hooks/useWebRTC';
import { Button, Flex, Spacer } from '../../styles/GlobalStyle';
import AudioVisualizer from '../AudioVisualizer/AudioVisualizer';
import toast from 'react-hot-toast';

const AudioControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${props => props.theme.spacing.lg};
  padding: ${props => props.theme.spacing.xl};
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: ${props => props.theme.borderRadius.xl};
  color: white;
  min-height: 400px;
  justify-content: center;
`;

const VisualizerContainer = styled.div`
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const ControlsSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
  width: 100%;
`;

const PrimaryControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.lg};
  align-items: center;
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
  transition: all 0.3s ease;
  
  &:hover {
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const SecondaryControls = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  align-items: center;
`;

const SecondaryButton = styled(Button)`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }
`;

const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  background: rgba(255, 255, 255, 0.1);
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border-radius: ${props => props.theme.borderRadius.md};
  backdrop-filter: blur(10px);
`;

const VolumeSlider = styled.input`
  width: 100px;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  
  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  opacity: 0.9;
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.isActive ? '#00ff88' : '#ff4444'};
  animation: ${props => props.isActive ? 'pulse 1s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const AudioLevelBar = styled.div`
  width: 200px;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
`;

const AudioLevelFill = styled(motion.div)`
  height: 100%;
  background: linear-gradient(90deg, #00ff88, #00d4aa);
  border-radius: 2px;
  width: ${props => props.level * 100}%;
`;

const SettingsPanel = styled(motion.div)`
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: ${props => props.theme.spacing.md};
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 200px;
`;

const SettingsItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.sm};
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingsLabel = styled.span`
  font-size: 0.875rem;
  color: white;
`;

const SettingsToggle = styled.input`
  width: 40px;
  height: 20px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  outline: none;
  cursor: pointer;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }
  
  &:checked::before {
    transform: translateX(20px);
  }
`;

const AudioControls = ({ 
  isConnected = false, 
  isRecording = false,
  onStartRecording,
  onStopRecording,
  onMuteToggle,
  onVolumeChange,
  onSettingsToggle,
  showSettings = false,
  volume = 1,
  isMuted = false,
  audioLevel = 0,
  isSpeaking = false
}) => {
  const [localVolume, setLocalVolume] = useState(volume);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);

  useEffect(() => {
    setLocalVolume(volume);
  }, [volume]);

  const handleMuteToggle = () => {
    if (onMuteToggle) {
      onMuteToggle();
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setLocalVolume(newVolume);
    if (onVolumeChange) {
      onVolumeChange(newVolume);
    }
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      onStopRecording?.();
    } else {
      onStartRecording?.();
    }
  };

  return (
    <AudioControlsContainer>
      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <SettingsItem>
            <SettingsLabel>Push to Talk</SettingsLabel>
            <SettingsToggle
              type="checkbox"
              checked={pushToTalk}
              onChange={(e) => setPushToTalk(e.target.checked)}
            />
          </SettingsItem>
          <SettingsItem>
            <SettingsLabel>Noise Suppression</SettingsLabel>
            <SettingsToggle
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => setNoiseSuppression(e.target.checked)}
            />
          </SettingsItem>
          <SettingsItem>
            <SettingsLabel>Echo Cancellation</SettingsLabel>
            <SettingsToggle
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => setEchoCancellation(e.target.checked)}
            />
          </SettingsItem>
        </SettingsPanel>
      )}

      {/* Audio Visualizer */}
      <VisualizerContainer>
        <AudioVisualizer
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          isMuted={isMuted}
          size="200px"
          showBars={true}
          showPulse={true}
        />
      </VisualizerContainer>

      {/* Status Indicator */}
      <StatusIndicator>
        <StatusDot isActive={isConnected} />
        <span>
          {isConnected ? 'Connected' : 'Disconnected'}
          {isSpeaking && ' • Speaking'}
          {isMuted && ' • Muted'}
        </span>
      </StatusIndicator>

      {/* Audio Level Bar */}
      <AudioLevelBar>
        <AudioLevelFill
          level={audioLevel}
          animate={{ width: `${audioLevel * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </AudioLevelBar>

      {/* Primary Controls */}
      <ControlsSection>
        <PrimaryControls>
          <PrimaryButton
            variant={isMuted ? 'danger' : 'accent'}
            onClick={handleMuteToggle}
            disabled={!isConnected}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <FiMicOff /> : <FiMic />}
          </PrimaryButton>
        </PrimaryControls>

        {/* Secondary Controls */}
        <SecondaryControls>
          <SecondaryButton
            onClick={handleRecordingToggle}
            disabled={!isConnected}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <FiSquare /> : <FiPlay />}
          </SecondaryButton>
          
          <SecondaryButton
            onClick={onSettingsToggle}
            title="Audio Settings"
          >
            <FiSettings />
          </SecondaryButton>
        </SecondaryControls>

        {/* Volume Control */}
        <VolumeControl>
          <FiVolume2 />
          <VolumeSlider
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={localVolume}
            onChange={handleVolumeChange}
          />
          <span style={{ fontSize: '0.875rem', minWidth: '30px' }}>
            {Math.round(localVolume * 100)}%
          </span>
        </VolumeControl>
      </ControlsSection>
    </AudioControlsContainer>
  );
};

export default AudioControls;
