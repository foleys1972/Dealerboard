import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { FiVideo, FiArrowLeft, FiEye, FiEyeOff, FiCheck, FiKey } from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import TeamsTab from '../../components/TeamsTab/TeamsTab';
import { useQueryClient } from 'react-query';

const SettingsContainer = styled.div`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const SettingsHeader = styled.div`
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: fit-content;
  
  &:hover {
    background: ${props => props.theme.colors.surface};
    border-color: ${props => props.theme.colors.primary};
  }
  
  &:active {
    transform: scale(0.98);
  }
`;

const HeaderContent = styled.div`
  display: flex;
  flex-direction: column;
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

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  padding: 0 2rem;
  margin-bottom: 2rem;
`;

const Tab = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: ${props => props.$active ? props.theme.colors.text.primary : props.theme.colors.text.secondary};
  font-size: 0.9375rem;
  font-weight: ${props => props.$active ? 600 : 400};
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    color: ${props => props.theme.colors.text.primary};
    background: ${props => props.theme.colors.surfaceElevated};
  }
  
  ${props => props.$active && `
    border-bottom-color: ${props.theme.colors.primary};
    color: ${props.theme.colors.primary};
  `}
`;

const TabContent = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

function Settings() {
  console.log('🎨 Settings component rendering');
  const navigate = useNavigate();
  const location = useLocation();
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
  
  // Initialize activeTab from URL query parameter or default to 'general'
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') || 'general';
  });
  
  // Update activeTab when URL query parameter changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['general', 'zoom', 'teams'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);
  
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
    
    // Messaging & File Sharing settings (regulatory compliance)
    allowFileSharing: false, // Disabled by default
    allowMessageAccess: true, // Enabled by default
    
    // Advanced settings
    autoReconnect: true,
    connectionTimeout: 30,
    maxParticipants: 200,
    audioQuality: 'high',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localZoomEnabled, setLocalZoomEnabled] = useState(user?.zoomEnabled || false);
  const [localTeamsEnabled, setLocalTeamsEnabled] = useState(user?.teamsEnabled || false);
  const [zoomUsername, setZoomUsername] = useState('');
  const [zoomPassword, setZoomPassword] = useState('');
  const [showZoomPassword, setShowZoomPassword] = useState(false);
  const queryClient = useQueryClient();

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
    
    // Also load settings from server (for file sharing and message access)
    const loadServerSettings = async () => {
      if (user?.id || user?.userId) {
        try {
          console.log('🔄 Loading user data from server for Settings page...');
          // Use username as identifier (username and id should be the same)
          const userIdentifier = user?.username || user?.id;
          console.log('🔍 Loading user data with identifier:', userIdentifier);
          const response = await api.get(`/api/auth/users/${userIdentifier}`);
          console.log('📥 Full API response:', response.data);
          const userData = response.data?.user || response.data;
          if (userData) {
            console.log('📥 User data loaded:', { 
              zoomEnabled: userData.zoomEnabled, 
              teamsEnabled: userData.teamsEnabled,
              zoomEnabledType: typeof userData.zoomEnabled,
              teamsEnabledType: typeof userData.teamsEnabled,
              fullUserData: userData
            });
            // Update user in auth store with latest data (including zoomEnabled)
            updateUser({
              ...user,
              ...(userData.zoomEnabled !== undefined && { zoomEnabled: userData.zoomEnabled }),
              ...(userData.teamsEnabled !== undefined && { teamsEnabled: userData.teamsEnabled })
            });
            // Update local state immediately
            if (userData.zoomEnabled !== undefined) {
              setLocalZoomEnabled(userData.zoomEnabled);
            }
            if (userData.teamsEnabled !== undefined) {
              setLocalTeamsEnabled(userData.teamsEnabled);
            }
            // Load Zoom username if available
            if (userData.zoomConfig?.username) {
              setZoomUsername(userData.zoomConfig.username);
            }
            // Load Zoom username if available
            if (userData.zoomConfig?.username) {
              setZoomUsername(userData.zoomConfig.username);
            }
            // Load settings
            if (userData.settings) {
              const serverSettings = userData.settings;
              setSettings(prev => ({
                ...prev,
                allowFileSharing: serverSettings.allowFileSharing || false,
                allowMessageAccess: serverSettings.allowMessageAccess !== false,
              }));
            }
          }
        } catch (error) {
          console.error('Failed to load server settings:', error);
          // Use defaults if server load fails - don't show error for 404 (user not found)
          if (error.response?.status !== 404) {
            console.warn('Could not load server settings, using defaults');
          }
        }
      }
    };
    
    loadServerSettings();
  }, [user?.id, user?.userId]); // Re-run when user ID changes, not just when user object changes

  useEffect(() => {
    // Update WebRTC settings when local state changes
    setMuted(!settings.microphoneEnabled);
    setVolume(settings.volume);
  }, [settings.microphoneEnabled, settings.volume, setMuted, setVolume]);

  const handleSettingChange = (key, value) => {
    // Validate numeric values
    if (key === 'volume' && (value < 0 || value > 1)) {
      toast.error('Volume must be between 0 and 1');
      return;
    }
    if (key === 'maxSimultaneousCalls' && (value < 1 || value > 10)) {
      toast.error('Max simultaneous calls must be between 1 and 10');
      return;
    }
    if (key === 'autoDisconnectSeconds' && (value < 0 || value > 300)) {
      toast.error('Auto disconnect must be between 0 and 300 seconds');
      return;
    }
    if (key === 'connectionTimeout' && (value < 5 || value > 300)) {
      toast.error('Connection timeout must be between 5 and 300 seconds');
      return;
    }
    if (key === 'maxParticipants' && (value < 2 || value > 1000)) {
      toast.error('Max participants must be between 2 and 1000');
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    console.log('💾 Save Settings button clicked');
    console.log('Current state:', { localZoomEnabled, localTeamsEnabled, username: user?.username, id: user?.id });
    setIsLoading(true);
    try {
      // Save to localStorage
      localStorage.setItem('intercom-settings', JSON.stringify(settings));
      
      // Update user settings on server (for file sharing and message access)
      if (user) {
        try {
          const payload = {
            settings: {
              allowFileSharing: settings.allowFileSharing || false,
              allowMessageAccess: settings.allowMessageAccess !== false,
              // Include other settings if needed
              ...settings
            },
            // Include top-level user fields - always send local state values
            zoomEnabled: localZoomEnabled,
            teamsEnabled: localTeamsEnabled
          };
          console.log('Saving settings with payload:', payload);
          // Use username as identifier (username and id should be the same)
          const userIdentifier = user?.username || user?.id;
          console.log('💾 Saving settings with identifier:', userIdentifier);
          const response = await api.put(`/api/auth/users/${userIdentifier}/settings`, payload);
          console.log('Settings saved to server:', response.data);
          // Update user in auth store if response includes updated user
          if (response.data?.user) {
            const updatedUserData = response.data.user;
            console.log('Updating user in auth store:', updatedUserData);
            updateUser(updatedUserData);
            // Also update local state to match server response
            if (updatedUserData.zoomEnabled !== undefined) {
              setLocalZoomEnabled(updatedUserData.zoomEnabled);
            }
            if (updatedUserData.teamsEnabled !== undefined) {
              setLocalTeamsEnabled(updatedUserData.teamsEnabled);
            }
          }
        } catch (error) {
          console.error('Failed to save settings to server:', error);
          // Show warning but continue - settings saved to localStorage
          if (error.response?.status === 403) {
            toast.error('Permission denied: Cannot update settings');
          } else if (error.response?.status !== 404) {
            toast.error('Settings saved locally but failed to sync with server');
          }
          // Continue anyway - settings saved to localStorage
        }
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
      allowFileSharing: false,
      allowMessageAccess: true,
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Microphone access not supported in this browser');
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl
        }
      });
      
      toast.success('Microphone test successful');
      
      // Stop tracks after a short delay to allow user to see success message
      setTimeout(() => {
        stream.getTracks().forEach(track => {
          track.stop();
        });
      }, 1000);
    } catch (error) {
      let errorMessage = 'Microphone test failed';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Microphone is being used by another application.';
      } else {
        errorMessage = `Microphone test failed: ${error.message}`;
      }
      toast.error(errorMessage);
    }
  };

  const testAudio = () => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = settings.volume;
    audio.play().catch(() => {
      toast.error('Audio test failed - no notification sound available');
    });
  };

  // Sync local state with user state
  useEffect(() => {
    console.log('🔄 Syncing zoomEnabled/teamsEnabled from user object:', {
      zoomEnabled: user?.zoomEnabled,
      teamsEnabled: user?.teamsEnabled,
      localZoomEnabled,
      localTeamsEnabled
    });
    if (user?.zoomEnabled !== undefined) {
      const zoomValue = user.zoomEnabled === true || user.zoomEnabled === 1 || user.zoomEnabled === 'true';
      console.log('✅ Setting localZoomEnabled to:', zoomValue, 'from user.zoomEnabled:', user.zoomEnabled);
      setLocalZoomEnabled(zoomValue);
    }
    if (user?.teamsEnabled !== undefined) {
      const teamsValue = user.teamsEnabled === true || user.teamsEnabled === 1 || user.teamsEnabled === 'true';
      console.log('✅ Setting localTeamsEnabled to:', teamsValue, 'from user.teamsEnabled:', user.teamsEnabled);
      setLocalTeamsEnabled(teamsValue);
    }
  }, [user?.zoomEnabled, user?.teamsEnabled]);

  // Check if Zoom/Teams are enabled for this user
  // Use localZoomEnabled if set, otherwise check user.zoomEnabled from database
  // Ensure we always check both local state and user state
  const zoomEnabled = Boolean(
    localZoomEnabled === true || 
    localZoomEnabled === 1 || 
    localZoomEnabled === 'true' ||
    user?.zoomEnabled === true || 
    user?.zoomEnabled === 1 || 
    user?.zoomEnabled === 'true'
  );
  const teamsEnabled = Boolean(
    localTeamsEnabled === true || 
    localTeamsEnabled === 1 || 
    localTeamsEnabled === 'true' ||
    user?.teamsEnabled === true || 
    user?.teamsEnabled === 1 || 
    user?.teamsEnabled === 'true'
  );
  
  // Debug logging
  useEffect(() => {
    console.log('🔍 Zoom/Teams tab visibility check:', {
      zoomEnabled,
      teamsEnabled,
      localZoomEnabled,
      localTeamsEnabled,
      userZoomEnabled: user?.zoomEnabled,
      userTeamsEnabled: user?.teamsEnabled,
      activeTab,
      tabsShouldRender: 'ALWAYS - tabs are now permanent'
    });
    console.log('🎨 Rendering Settings page with tabs - Zoom and Teams tabs should always be visible');
  }, [zoomEnabled, teamsEnabled, localZoomEnabled, localTeamsEnabled, user?.zoomEnabled, user?.teamsEnabled, activeTab]);

  return (
    <SettingsContainer>
      <SettingsHeader>
        <BackButton onClick={() => navigate('/')} title="Back to Intercom">
          <FiArrowLeft />
          <span>Back</span>
        </BackButton>
        <HeaderContent>
          <SettingsTitle>Settings</SettingsTitle>
          <SettingsSubtitle>Configure your intercom system preferences</SettingsSubtitle>
        </HeaderContent>
      </SettingsHeader>

      <TabsContainer>
        <Tab key="general" $active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
          General
        </Tab>
        <Tab 
          key="zoom"
          $active={activeTab === 'zoom'} 
          onClick={() => {
            console.log('🎯 Zoom tab clicked');
            setActiveTab('zoom');
          }}
        >
          <FiVideo />
          <span>Zoom</span>
        </Tab>
        <Tab 
          key="teams"
          $active={activeTab === 'teams'} 
          onClick={() => {
            console.log('🎯 Teams tab clicked');
            setActiveTab('teams');
          }}
        >
          <FiVideo />
          <span>Microsoft Teams</span>
        </Tab>
      </TabsContainer>

      {activeTab === 'general' && (
        <>
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

        {/* Messaging & File Sharing Settings */}
        <SettingsCard>
          <CardTitle>
            💬 Messaging & File Sharing
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel style={{ color: '#ffffff' }}>
              <Checkbox
                type="checkbox"
                checked={settings.allowFileSharing || false}
                onChange={(e) => handleSettingChange('allowFileSharing', e.target.checked)}
              />
              <span style={{ color: '#ffffff' }}>Allow File Sharing</span>
            </CheckboxLabel>
            <InfoText style={{ color: '#ef4444', fontWeight: 500 }}>
              ⚠️ File sharing is disabled by default for regulatory compliance. 
              Enabling this allows you to send files, images, and documents in messages.
            </InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel style={{ color: '#ffffff' }}>
              <Checkbox
                type="checkbox"
                checked={settings.allowMessageAccess !== false}
                onChange={(e) => handleSettingChange('allowMessageAccess', e.target.checked)}
              />
              <span style={{ color: '#ffffff' }}>Allow Message Access</span>
            </CheckboxLabel>
            <InfoText style={{ color: '#a0a0b0' }}>
              Allow access to view and send messages in Matrix chat rooms. 
              If disabled, you will not be able to use the messaging feature.
            </InfoText>
          </FormGroup>
        </SettingsCard>

        {/* Integration Settings */}
        <SettingsCard>
          <CardTitle>
            🔌 Integration Settings
          </CardTitle>
          
          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={localZoomEnabled}
                onChange={(e) => {
                  setLocalZoomEnabled(e.target.checked);
                  setHasChanges(true);
                }}
              />
              Enable Zoom Integration
            </CheckboxLabel>
            <InfoText>Enable Zoom integration to create and join Zoom meetings</InfoText>
          </FormGroup>

          <FormGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={localTeamsEnabled}
                onChange={(e) => {
                  setLocalTeamsEnabled(e.target.checked);
                  setHasChanges(true);
                }}
              />
              Enable Microsoft Teams Integration
            </CheckboxLabel>
            <InfoText>Enable Microsoft Teams integration to create and join Teams meetings</InfoText>
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
            onClick={(e) => {
              console.log('🔘 Save button clicked', { isLoading, hasChanges, localZoomEnabled, localTeamsEnabled, username: user?.username, id: user?.id });
              if (!isLoading) {
                handleSaveSettings();
              }
            }}
            disabled={isLoading}
            style={{ 
              opacity: (!hasChanges && !isLoading) ? 0.5 : 1,
              cursor: (!hasChanges && !isLoading) ? 'not-allowed' : 'pointer'
            }}
            title={!hasChanges ? 'No changes to save' : 'Save settings'}
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </Button>
        </ButtonGroup>
      </div>
        </>
      )}

      {activeTab === 'zoom' && (
        <TabContent>
          {console.log('🔍 Rendering Zoom tab content', { activeTab, zoomUsername, hasPassword: !!zoomPassword })}
          <SettingsCard>
            <CardTitle>
              <FiVideo />
              Zoom Login Credentials
            </CardTitle>
            <InfoText style={{ marginBottom: '1.5rem' }}>
              Enter your Zoom username and password to connect your Zoom account.
            </InfoText>
            
            <FormGroup>
              <Label>Zoom Username / Email</Label>
              <Input
                type="text"
                value={zoomUsername || ''}
                onChange={(e) => {
                  console.log('📝 Zoom username changed:', e.target.value);
                  setZoomUsername(e.target.value);
                }}
                placeholder="Enter your Zoom username or email"
                autoComplete="username"
              />
            </FormGroup>

            <FormGroup>
              <Label>Zoom Password</Label>
              <div style={{ position: 'relative' }}>
                <Input
                  type={showZoomPassword ? 'text' : 'password'}
                  value={zoomPassword}
                  onChange={(e) => setZoomPassword(e.target.value)}
                  placeholder="Enter your Zoom password"
                  autoComplete="current-password"
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowZoomPassword(!showZoomPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showZoomPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </FormGroup>

            <ButtonGroup>
              <Button
                onClick={async () => {
                  if (!zoomUsername || !zoomPassword) {
                    toast.error('Please enter both Zoom Username and Password');
                    return;
                  }
                  
                  try {
                    setIsLoading(true);
                    // Verify login
                    await api.post('/api/zoom/verify-login', {
                      username: zoomUsername,
                      password: zoomPassword
                    });
                    
                    // Save username after successful verification
                    const userIdentifier = user?.username || user?.id;
                    await api.put(`/api/auth/users/${userIdentifier}/settings`, {
                      zoomConfig: {
                        username: zoomUsername
                        // Password is not stored
                      }
                    });
                    
                    toast.success('Zoom login verified and username saved');
                    queryClient.invalidateQueries(['user', userIdentifier]);
                    setZoomPassword(''); // Clear password after saving
                  } catch (error) {
                    toast.error(error.response?.data?.error || 'Failed to verify Zoom login');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading || !zoomUsername || !zoomPassword}
              >
                <FiCheck />
                {isLoading ? 'Verifying...' : 'Verify Login'}
              </Button>
              <SecondaryButton
                onClick={async () => {
                  if (!zoomUsername) {
                    toast.error('Please enter Zoom Username');
                    return;
                  }
                  
                  try {
                    setIsLoading(true);
                    const userIdentifier = user?.username || user?.id;
                    await api.put(`/api/auth/users/${userIdentifier}/settings`, {
                      zoomConfig: {
                        username: zoomUsername
                      }
                    });
                    
                    toast.success('Zoom username saved');
                    queryClient.invalidateQueries(['user', userIdentifier]);
                  } catch (error) {
                    toast.error(error.response?.data?.error || 'Failed to save Zoom username');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading || !zoomUsername}
              >
                <FiKey />
                {isLoading ? 'Saving...' : 'Save Username'}
              </SecondaryButton>
            </ButtonGroup>
          </SettingsCard>
        </TabContent>
      )}

      {activeTab === 'teams' && (
        <TabContent>
          <TeamsTab />
        </TabContent>
      )}
    </SettingsContainer>
  );
}

export default Settings;
