import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/authStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useSocket } from '../../hooks/useSocket';
import toast from 'react-hot-toast';

const SettingsContainer = styled.div`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const SettingsHeader = styled.div`
  margin-bottom: 2rem;
`;

const SettingsTitle = styled.h1`
  color: ${props => props.theme.colors.text.primary};
  font-size: 2rem;
  margin-bottom: 0.5rem;
`;

const SettingsSubtitle = styled.p`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 1.1rem;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
`;

const SettingsCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid ${props => props.theme.colors.border};
`;

const CardTitle = styled.h3`
  color: ${props => props.theme.colors.text.primary};
  font-size: 1.3rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  color: ${props => props.theme.colors.text.primary};
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.primary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary}20;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.primary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary}20;
  }
`;

const Checkbox = styled.input`
  margin-right: 0.5rem;
`;

const CheckboxLabel = styled.label`
  color: ${props => props.theme.colors.text.primary};
  display: flex;
  align-items: center;
  cursor: pointer;
`;

const Button = styled.button`
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.theme.colors.primaryHover};
    transform: translateY(-1px);
  }
  
  &:disabled {
    background: ${props => props.theme.colors.text.disabled};
    cursor: not-allowed;
    transform: none;
  }
`;

const SecondaryButton = styled(Button)`
  background: transparent;
  color: ${props => props.theme.colors.text.primary};
  border: 1px solid ${props => props.theme.colors.border};
  
  &:hover {
    background: ${props => props.theme.colors.background.secondary};
    transform: translateY(-1px);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
`;

const StatusIndicator = styled.div`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.connected ? props.theme.colors.success : props.theme.colors.error};
  margin-right: 0.5rem;
`;

const StatusText = styled.span`
  color: ${props => props.connected ? props.theme.colors.success : props.theme.colors.error};
  font-weight: 500;
`;

const InfoText = styled.p`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 0.9rem;
  margin-top: 0.5rem;
`;

function Settings() {
  const { user, updateUser } = useAuthStore();
  const { 
    isConnected, 
    isMuted, 
    volume, 
    setMuted, 
    setVolume,
    cleanup 
  } = useWebRTCStore();
  const { socket, isConnected: socketConnected } = useSocket();
  
  const [settings, setSettings] = useState({
    // Audio settings
    microphoneEnabled: !isMuted,
    volume: volume,
    pushToTalk: false,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    
    // Intercom Mode settings
    intercomMode: 'always-on', // or 'push-to-talk'
    autoDisconnectSeconds: 10,
    
    // Busy Call Handling settings
    blockCallsWhenBusy: false,
    allowMultipleCalls: true,
    maxSimultaneousCalls: 3,
    
    // Notification settings
    notifications: true,
    soundNotifications: true,
    vibrationNotifications: false,
    
    // Display settings
    theme: 'dark',
    fontSize: 'medium',
    showParticipantAvatars: true,
    showAudioLevels: true,
    
    // Privacy settings
    allowRecording: true,
    shareLocation: false,
    showOnlineStatus: true,
    
    // Advanced settings
    autoReconnect: true,
    connectionTimeout: 30,
    maxParticipants: 200,
    audioQuality: 'high',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem('intercom-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Update WebRTC settings when local state changes
    setMuted(!settings.microphoneEnabled);
    setVolume(settings.volume);
  }, [settings.microphoneEnabled, settings.volume, setMuted, setVolume]);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    setIsLoading(true);
    try {
      // Save to localStorage
      localStorage.setItem('intercom-settings', JSON.stringify(settings));
      
      // Update user preferences on server
      if (user) {
        await updateUser({
          preferences: settings
        });
      }
      
      setHasChanges(false);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSettings = () => {
    const defaultSettings = {
      microphoneEnabled: true,
      volume: 1.0,
      pushToTalk: false,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      intercomMode: 'always-on',
      autoDisconnectSeconds: 10,
      blockCallsWhenBusy: false,
      allowMultipleCalls: true,
      maxSimultaneousCalls: 3,
      notifications: true,
      soundNotifications: true,
      vibrationNotifications: false,
      theme: 'dark',
      fontSize: 'medium',
      showParticipantAvatars: true,
      showAudioLevels: true,
      allowRecording: true,
      shareLocation: false,
      showOnlineStatus: true,
      autoReconnect: true,
      connectionTimeout: 30,
      maxParticipants: 200,
      audioQuality: 'high',
    };
    
    setSettings(defaultSettings);
    setHasChanges(true);
    toast('Settings reset to defaults', { icon: 'ℹ️' });
  };

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      toast.success('Microphone test successful');
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      toast.error('Microphone test failed: ' + error.message);
    }
  };

  const testAudio = () => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = settings.volume;
    audio.play().catch(() => {
      toast.error('Audio test failed - no notification sound available');
    });
  };

  return (
    <SettingsContainer>
      <SettingsHeader>
        <SettingsTitle>Settings</SettingsTitle>
        <SettingsSubtitle>Configure your intercom system preferences</SettingsSubtitle>
      </SettingsHeader>

      <SettingsGrid>
        {/* Audio Settings */}
        <SettingsCard>
          <CardTitle>
            🎤 Audio Settings
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.microphoneEnabled}
                onChange={(e) => handleSettingChange('microphoneEnabled', e.target.checked)}
              />
              Enable Microphone
            </CheckboxLabel>
            <InfoText>Allow the system to access your microphone for communication</InfoText>
          </FormGroup>

          <FormGroup>
            <Label>Volume Level</Label>
            <Input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.volume}
              onChange={(e) => handleSettingChange('volume', parseFloat(e.target.value))}
            />
            <InfoText>Current volume: {Math.round(settings.volume * 100)}%</InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.pushToTalk}
                onChange={(e) => handleSettingChange('pushToTalk', e.target.checked)}
              />
              Push to Talk
            </CheckboxLabel>
            <InfoText>Hold a key to speak instead of continuous transmission</InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.noiseSuppression}
                onChange={(e) => handleSettingChange('noiseSuppression', e.target.checked)}
              />
              Noise Suppression
            </CheckboxLabel>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.echoCancellation}
                onChange={(e) => handleSettingChange('echoCancellation', e.target.checked)}
              />
              Echo Cancellation
            </CheckboxLabel>
          </FormGroup>

          <ButtonGroup>
            <SecondaryButton onClick={testMicrophone}>
              Test Microphone
            </SecondaryButton>
            <SecondaryButton onClick={testAudio}>
              Test Audio
            </SecondaryButton>
          </ButtonGroup>
        </SettingsCard>

        {/* Instant Intercom Settings */}
        <SettingsCard>
          <CardTitle>
            🎙️ Instant Intercom Mode
          </CardTitle>
          
          <FormGroup>
            <Label>Audio Mode</Label>
            <Select
              value={settings.intercomMode}
              onChange={(e) => handleSettingChange('intercomMode', e.target.value)}
            >
              <option value="always-on">Always On (Hot Mic)</option>
              <option value="push-to-talk">Push to Talk (Spacebar)</option>
            </Select>
            <InfoText>
              {settings.intercomMode === 'always-on' 
                ? 'Your microphone is always active when connected'
                : 'Hold spacebar to transmit, release to stop'}
            </InfoText>
          </FormGroup>

          <FormGroup>
            <Label>Auto-Disconnect After Silence</Label>
            <Input
              type="range"
              min="5"
              max="60"
              value={settings.autoDisconnectSeconds}
              onChange={(e) => handleSettingChange('autoDisconnectSeconds', parseInt(e.target.value))}
            />
            <InfoText>
              Automatically disconnect after {settings.autoDisconnectSeconds} seconds of silence
            </InfoText>
          </FormGroup>
        </SettingsCard>

        {/* Busy Call Handling Settings */}
        <SettingsCard>
          <CardTitle>
            📞 Call Availability
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.blockCallsWhenBusy}
                onChange={(e) => handleSettingChange('blockCallsWhenBusy', e.target.checked)}
              />
              Block incoming calls when I'm on a call
            </CheckboxLabel>
            <InfoText>
              {settings.blockCallsWhenBusy 
                ? '🔒 You will NOT receive calls while already on a call (1-to-1 only)'
                : '✅ You can receive multiple calls simultaneously'}
            </InfoText>
          </FormGroup>

          {!settings.blockCallsWhenBusy && (
            <>
              <FormGroup>
                <CheckboxLabel>
                  <Checkbox
                    type="checkbox"
                    checked={settings.allowMultipleCalls}
                    onChange={(e) => handleSettingChange('allowMultipleCalls', e.target.checked)}
                  />
                  Allow multiple simultaneous calls
                </CheckboxLabel>
              </FormGroup>

              {settings.allowMultipleCalls && (
                <FormGroup>
                  <Label>Maximum Simultaneous Calls: {settings.maxSimultaneousCalls}</Label>
                  <Input
                    type="range"
                    min="1"
                    max="10"
                    value={settings.maxSimultaneousCalls}
                    onChange={(e) => handleSettingChange('maxSimultaneousCalls', parseInt(e.target.value))}
                  />
                  <InfoText>
                    You can be on up to {settings.maxSimultaneousCalls} call{settings.maxSimultaneousCalls > 1 ? 's' : ''} at once
                  </InfoText>
                </FormGroup>
              )}
            </>
          )}

          <InfoText style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
            ℹ️ <strong>Note:</strong> Group calls will connect to available members only. 
            Busy members are silently skipped without error messages.
          </InfoText>
        </SettingsCard>

        {/* Connection Settings */}
        <SettingsCard>
          <CardTitle>
            🌐 Connection Settings
          </CardTitle>
          
          <FormGroup>
            <Label>Connection Status</Label>
            <div>
              <StatusIndicator connected={socketConnected} />
              <StatusText connected={socketConnected}>
                {socketConnected ? 'Connected' : 'Disconnected'}
              </StatusText>
            </div>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.autoReconnect}
                onChange={(e) => handleSettingChange('autoReconnect', e.target.checked)}
              />
              Auto Reconnect
            </CheckboxLabel>
            <InfoText>Automatically reconnect if connection is lost</InfoText>
          </FormGroup>

          <FormGroup>
            <Label>Connection Timeout (seconds)</Label>
            <Input
              type="number"
              min="5"
              max="120"
              value={settings.connectionTimeout}
              onChange={(e) => handleSettingChange('connectionTimeout', parseInt(e.target.value))}
            />
          </FormGroup>

          <FormGroup>
            <Label>Max Participants</Label>
            <Input
              type="number"
              min="10"
              max="500"
              value={settings.maxParticipants}
              onChange={(e) => handleSettingChange('maxParticipants', parseInt(e.target.value))}
            />
          </FormGroup>
        </SettingsCard>

        {/* Notification Settings */}
        <SettingsCard>
          <CardTitle>
            🔔 Notifications
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => handleSettingChange('notifications', e.target.checked)}
              />
              Enable Notifications
            </CheckboxLabel>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.soundNotifications}
                onChange={(e) => handleSettingChange('soundNotifications', e.target.checked)}
              />
              Sound Notifications
            </CheckboxLabel>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.vibrationNotifications}
                onChange={(e) => handleSettingChange('vibrationNotifications', e.target.checked)}
              />
              Vibration Notifications
            </CheckboxLabel>
            <InfoText>Vibrate on mobile devices when notifications arrive</InfoText>
          </FormGroup>
        </SettingsCard>

        {/* Display Settings */}
        <SettingsCard>
          <CardTitle>
            🎨 Display Settings
          </CardTitle>
          
          <FormGroup>
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onChange={(e) => handleSettingChange('theme', e.target.value)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Font Size</Label>
            <Select
              value={settings.fontSize}
              onChange={(e) => handleSettingChange('fontSize', e.target.value)}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.showParticipantAvatars}
                onChange={(e) => handleSettingChange('showParticipantAvatars', e.target.checked)}
              />
              Show Participant Avatars
            </CheckboxLabel>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.showAudioLevels}
                onChange={(e) => handleSettingChange('showAudioLevels', e.target.checked)}
              />
              Show Audio Levels
            </CheckboxLabel>
          </FormGroup>
        </SettingsCard>

        {/* Privacy Settings */}
        <SettingsCard>
          <CardTitle>
            🔒 Privacy Settings
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.allowRecording}
                onChange={(e) => handleSettingChange('allowRecording', e.target.checked)}
              />
              Allow Recording
            </CheckboxLabel>
            <InfoText>Allow your audio to be recorded in group sessions</InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.shareLocation}
                onChange={(e) => handleSettingChange('shareLocation', e.target.checked)}
              />
              Share Location
            </CheckboxLabel>
            <InfoText>Share your location with other participants</InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={settings.showOnlineStatus}
                onChange={(e) => handleSettingChange('showOnlineStatus', e.target.checked)}
              />
              Show Online Status
            </CheckboxLabel>
            <InfoText>Let others see when you're online</InfoText>
          </FormGroup>
        </SettingsCard>

        {/* Advanced Settings */}
        <SettingsCard>
          <CardTitle>
            ⚙️ Advanced Settings
          </CardTitle>
          
          <FormGroup>
            <Label>Audio Quality</Label>
            <Select
              value={settings.audioQuality}
              onChange={(e) => handleSettingChange('audioQuality', e.target.value)}
            >
              <option value="low">Low (8kHz)</option>
              <option value="medium">Medium (16kHz)</option>
              <option value="high">High (48kHz)</option>
            </Select>
            <InfoText>Higher quality uses more bandwidth</InfoText>
          </FormGroup>
        </SettingsCard>
      </SettingsGrid>

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SecondaryButton onClick={handleResetSettings}>
          Reset to Defaults
        </SecondaryButton>
        
        <ButtonGroup>
          <SecondaryButton onClick={() => window.history.back()}>
            Cancel
          </SecondaryButton>
          <Button 
            onClick={handleSaveSettings}
            disabled={isLoading || !hasChanges}
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </Button>
        </ButtonGroup>
      </div>
    </SettingsContainer>
  );
}

export default Settings;
