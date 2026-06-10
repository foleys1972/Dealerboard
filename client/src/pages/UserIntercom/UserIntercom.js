import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPhoneCall, 
  FiPhoneOff, 
  FiMic, 
  FiMicOff,
  FiVolume2,
  FiUsers,
  FiBell,
  FiBellOff,
  FiPhoneForwarded,
  FiSettings,
  FiRadio,
  FiHeadphones,
  FiMinusCircle,
  FiPlusCircle,
  FiLogOut,
  FiX,
  FiTrash2,
  FiVideo,
  FiVideoOff,
  FiCamera,
  FiCameraOff
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useInstantIntercomWebRTC } from '../../hooks/useInstantIntercomWebRTC';
import { useBroadcastAudio } from '../../hooks/useBroadcastAudio';
import OnAirIndicator from '../../components/OnAirIndicator/OnAirIndicator';
import api from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useUserIntercomPresence } from './useUserIntercomPresence';
import { useUserIntercomMissedCalls } from './useUserIntercomMissedCalls';
import { useUserIntercomGrid } from './useUserIntercomGrid';
import { useUserIntercomGroupCalls } from './useUserIntercomGroupCalls';
import { useUserIntercomDirectContacts } from './useUserIntercomDirectContacts';
import { useUserIntercomBroadcasts } from './useUserIntercomBroadcasts';
import {
  useUserIntercomCalls,
  useWebRtcPrewarm,
  useAutoAnswerIncomingCalls,
  formatCallDuration,
} from './useUserIntercomCalls';
import { useUserIntercomMediaDevices } from './useUserIntercomMediaDevices';
import { useUserIntercomSettings } from './useUserIntercomSettings';
import { useUserIntercomContactModal } from './useUserIntercomContactModal';
import { useUserIntercomNewGroupModal } from './useUserIntercomNewGroupModal';
import UserIntercomHeader from './UserIntercomHeader';
import UserIntercomBroadcastSection from './UserIntercomBroadcastSection';
import UserIntercomGroupSection from './UserIntercomGroupSection';
import UserIntercomContactsSection from './UserIntercomContactsSection';
import UserIntercomSettingsPanel from './UserIntercomSettingsPanel';
import UserIntercomContactModal from './UserIntercomContactModal';
import UserIntercomNewGroupModal from './UserIntercomNewGroupModal';
import UserIntercomForwardSearchModal from './UserIntercomForwardSearchModal';
import {
  Container,
  MainContent,
  QuickActions,
  QuickActionButton,
  QuickActionStat,
  FloatingCallBar,
  CallBarContent,
  CallBarLeft,
  CallStatusIndicator,
  CallBarInfo,
  CallBarTitle,
  CallBarMeta,
  CallBarControls,
  CallBarButton,
  ActiveCallPanel,
  CallHeader,
  CallIcon,
  CallInfo,
  CallTitle,
  CallDuration,
  CallControls,
  CallButton,
  GridLayout,
  SectionTitleOld,
  SectionSubtext,
  EndButton,
  VolumeControl,
  VolumeIcon,
  VolumeSlider,
  VolumeLevel,
  VadMeter,
  VadFill,
  PushToTalkHint,
  SettingsPanel,
  SettingsHeader,
  SettingsContent,
  SettingsFooter,
  SettingsFooterButton,
  DeviceSelect,
  SettingGroup,
  SettingLabel,
  SettingInput,
  IconButton,
} from './UserIntercom.styles';

const API_BASE = process.env.REACT_APP_API_URL || '';

const UserIntercom = ({ embedded = false }) => {
  const navigate = useNavigate();
  // Auth
  const { user: authUser, logout } = useAuthStore();
  const { socket, connectSocket } = useSocket();
  
  // Instant Intercom with WebRTC Audio Hook
  const {
    isInCall,
    activeCall: instantCall,
    participantCount,
    callDuration,
    isTransmitting,
    intercomMode,
    instantConnect,
    disconnectCall,
    audioLevel,
    isMuted,
    toggleMute,
    toggleUnmute,
    startPTT,
    stopPTT,
    isLatched,
    togglePTTLatch,
    videoEnabled: hookVideoEnabled,
    setVideoEnabled: setHookVideoEnabled,
    videoConsumers,
    localStream: hookLocalStream
  } = useInstantIntercomWebRTC();
  const {
    monitorBroadcast: monitorBroadcastAudio,
    stopMonitoring: stopBroadcastAudio,
    startPushToTalk: startBroadcastPushToTalk,
    stopPushToTalk: stopBroadcastPushToTalk,
    updateSpeakerDevice: updateBroadcastSpeaker,
    subscribeLevels: subscribeBroadcastLevels,
    stopAll: stopAllBroadcastAudio,
  } = useBroadcastAudio();

  const userId = authUser?.id || authUser?.userId;
  const { gridConfig } = useUserIntercomGrid();
  const {
    groupCalls,
    groupCallLoading,
    groupCallError,
    loadGroupCalls,
    setGroupCalls,
    setGroupCallLoading,
  } = useUserIntercomGroupCalls(userId);
  const {
    directContacts,
    contactsLoading,
    setContactsLoading,
    loadDirectContacts,
    deleteDirectContact,
  } = useUserIntercomDirectContacts(userId);
  const {
    isDND,
    status,
    setStatus,
    callForward,
    setCallForward,
    showForwardSearch,
    setShowForwardSearch,
    forwardSearchResults,
    showSettings,
    setShowSettings,
    autoAnswer,
    toggleDND,
    toggleCallForward,
    toggleAutoAnswer,
    searchForwardUsers,
    selectForwardUser,
  } = useUserIntercomSettings();
  const {
    showContactModal,
    openContactModal,
    closeContactModal,
    contactModalTab,
    setContactModalTab,
    manualContact,
    setManualContact,
    directorySearchResults,
    contactSearchTerm,
    handleAddManualContact,
    handleDirectorySearch,
    handleAddDirectoryContact,
  } = useUserIntercomContactModal({ loadDirectContacts, setContactsLoading });
  const {
    showNewGroupModal,
    openNewGroupModal,
    closeNewGroupModal,
    newGroupName,
    setNewGroupName,
    newGroupSearch,
    newGroupAudioMode,
    setNewGroupAudioMode,
    newGroupPolicy,
    setNewGroupPolicy,
    newGroupResults,
    newGroupSelected,
    searchUsersForNewGroup,
    toggleSelectNewGroupUser,
    handleCreateGroup,
  } = useUserIntercomNewGroupModal({ loadGroupCalls, setGroupCallLoading });

  // User state
  const [user, setUser] = useState({
    name: authUser?.name || 'Trader',
    id: authUser?.userId || 'user-001',
    sipUri: authUser?.sipUri || '',
    employeeId: authUser?.employeeId || '',
  });

  // Active calls (legacy - can be removed later)
  const [activeCall, setActiveCall] = useState(null);

  // Page edit (button color) state
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [buttonColor, setButtonColor] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-button-color');
      // If stored color is light (old theme), use dark theme default
      if (stored && (stored.startsWith('#f') || stored.startsWith('#e') || stored.startsWith('#d') || stored.startsWith('#c') || stored.startsWith('#b') || stored.startsWith('#a'))) {
        return 'rgba(21, 21, 32, 0.8)';
      }
      return stored || 'rgba(21, 21, 32, 0.8)'; // Dark theme default
    } catch { 
      return 'rgba(21, 21, 32, 0.8)'; // Dark theme default
    }
  });
  const [selectedEditColor, setSelectedEditColor] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [colorMap, setColorMap] = useState(() => {
    try {
      const raw = localStorage.getItem('ui-button-color-map');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const applyButtonColor = useCallback((color) => {
    if (!color) return;
    const blocked = ['#dc2626', '#16a34a'];
    if (blocked.includes(color.toLowerCase())) {
      toast.error('This color is reserved for status icons');
      return;
    }
    setButtonColor(color);
    try { localStorage.setItem('ui-button-color', color); } catch {}
  }, []);
  const setItemColor = useCallback((kind, id, color) => {
    if (!color) return;
    const blocked = ['#dc2626', '#16a34a'];
    if (blocked.includes(String(color).toLowerCase())) {
      toast.error('This color is reserved for status icons');
      return;
    }
    const key = `${kind}:${id}`;
    setColorMap(prev => {
      const next = { ...prev, [key]: color };
      try { localStorage.setItem('ui-button-color-map', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleLeaveGroup = useCallback(async (groupId) => {
    try {
      const myId = authUser?.id || authUser?.userId;
      if (!myId) throw new Error('Missing user id');
      await api.delete(`/api/groups/${groupId}/participants/${myId}`);
      setGroupCalls(prev => prev.filter(g => g.id !== groupId));
      toast.success('Removed from group');
    } catch (e) {
      console.error('Failed to leave group', e);
      toast.error(e?.response?.data?.error || e?.message || 'Failed to leave group');
    }
  }, [authUser]);

  // Notifications
  const [showNotifications, setShowNotifications] = useState(false);
  const { missedCalls, missedLoading, missedError, fetchMissed } =
    useUserIntercomMissedCalls(showNotifications);

  const { onlineUsers, computePresence } = useUserIntercomPresence({
    socket,
    connectSocket,
    isDND,
    isInCall,
    callForward,
  });

  const onlineUserIds = useMemo(
    () => new Set(Object.keys(onlineUsers).filter((id) => onlineUsers[id])),
    [onlineUsers]
  );

  useWebRtcPrewarm();
  useAutoAnswerIncomingCalls({ socket, autoAnswer, isInCall, instantConnect });

  const [remoteVideoStream, setRemoteVideoStream] = useState(null);

  // Listen for video consumers and update remote video stream
  useEffect(() => {
    if (!isInCall || !videoConsumers) return;
    
    // Check videoConsumers map for video streams
    const checkVideoConsumers = () => {
      if (videoConsumers && videoConsumers.size > 0) {
        const firstConsumer = Array.from(videoConsumers.values())[0];
        if (firstConsumer && firstConsumer.__videoStream) {
          setRemoteVideoStream(firstConsumer.__videoStream);
        } else if (firstConsumer && firstConsumer.track) {
          // Create stream from track if not already created
          const videoStream = new MediaStream([firstConsumer.track]);
          firstConsumer.__videoStream = videoStream;
          setRemoteVideoStream(videoStream);
        }
      } else {
        setRemoteVideoStream(null);
      }
    };
    
    // Check immediately
    checkVideoConsumers();
    
    // Check periodically
    const interval = setInterval(checkVideoConsumers, 500);
    
    return () => {
      clearInterval(interval);
    };
  }, [isInCall, videoConsumers]);
  
  const { selectedDevices } = useUserIntercomMediaDevices();

  const {
    broadcasts,
    broadcastLoading,
    broadcastError,
    speakingBroadcastId,
    startPushToTalk,
    stopPushToTalk,
    toggleBroadcast,
  } = useUserIntercomBroadcasts({
    userId,
    selectedDevices,
    monitorBroadcastAudio,
    stopBroadcastAudio,
    startBroadcastPushToTalk,
    stopBroadcastPushToTalk,
    updateBroadcastSpeaker,
    subscribeBroadcastLevels,
    stopAllBroadcastAudio,
  });
  
  // Video call state - sync with hook
  const videoEnabled = hookVideoEnabled || false;
  const setVideoEnabled = setHookVideoEnabled || (() => {});

  const { startDirectCall, startGroupCall } = useUserIntercomCalls({
    authUser,
    socket,
    instantConnect,
    setVideoEnabled,
  });

  // Handle logout
  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  // End call (legacy - now using disconnectCall from hook)
  const endCall = () => {
    if (activeCall) {
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);
      toast.success(`Call ended (${duration}s)`);
      setActiveCall(null);
    }
  };

  // Active broadcast count
  const activeBroadcastCount = broadcasts.filter(b => b.active).length;

  return (
    <Container $embedded={embedded}>
      {!embedded && (
        <UserIntercomHeader
          authUser={authUser}
          user={user}
          computePresence={computePresence}
          onEditPage={() => setShowEditPanel(true)}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onLogout={handleLogout}
        />
      )}

      {/* On Air Indicator - Shows when in active call */}
      {isInCall && (
        <div style={{ padding: '1rem', background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.2), rgba(239, 68, 68, 0.3))', borderBottom: '2px solid #ef4444' }}>
          <OnAirIndicator
            isActive={isInCall}
            isPTT={intercomMode === 'push-to-talk'}
            isTransmitting={isTransmitting}
            participantCount={participantCount}
            duration={callDuration}
            callType={instantCall?.isGroupCall ? 'group' : 'direct'}
            onDisconnect={disconnectCall}
          />
          <div style={{ 
            marginTop: '0.5rem', 
            display: 'flex', 
            gap: '1rem', 
            alignItems: 'center' 
          }}>
            <button
              onClick={isMuted ? toggleUnmute : toggleMute}
              style={{
                padding: '8px 16px',
                background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isMuted ? <FiMicOff /> : <FiMic />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <div style={{ 
              flex: 1, 
              height: '8px', 
              background: 'rgba(255,255,255,0.2)', 
              borderRadius: '4px', 
              overflow: 'hidden' 
            }}>
              <div style={{
                height: '100%',
                width: `${(audioLevel || 0) * 100}%`,
                background: 'linear-gradient(90deg, #10b981, #3b82f6)',
                transition: 'width 0.1s ease'
              }} />
            </div>
            <span style={{ color: '#ffffff', fontSize: '0.875rem', fontWeight: 600 }}>
              {Math.round((audioLevel || 0) * 100)}%
            </span>
          </div>
        </div>
      )}

        <MainContent $inCall={isInCall}>
        {showNotifications && (
          <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <FiBell style={{ marginRight: 8 }} />
              <span style={{ fontWeight: 700 }}>Notifications</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={fetchMissed} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
                <button onClick={() => setShowNotifications(false)} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
            {missedLoading && <div style={{ opacity: 0.8 }}>Loading…</div>}
            {missedError && <div style={{ color: '#f87171' }}>{missedError}</div>}
            {!missedLoading && !missedError && missedCalls.length === 0 && (
              <div style={{ opacity: 0.8 }}>No missed calls</div>
            )}
            {!missedLoading && missedCalls.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {missedCalls.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 6 }}>
                    <span style={{ fontWeight: 600 }}>From: {item.fromUserId}</span>
                    <span style={{ opacity: 0.8 }}>{new Date(item.at).toLocaleString()}</span>
                    <span style={{ opacity: 0.8 }}>({item.type})</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => instantConnect({ userId: item.fromUserId })}
                        style={{ background: '#10b981', color: '#000', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                      >
                        Call back
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Quick Actions */}
        <QuickActions>
          <QuickActionButton 
            $active={isDND} 
            onClick={toggleDND}
            $color="#ef4444"
          >
            <FiBellOff />
            <span>Do Not Disturb</span>
          </QuickActionButton>
          
          <QuickActionButton 
            $active={callForward.enabled}
            onClick={toggleCallForward}
            $color="#3b82f6"
            title={callForward.forwardToUser ? `Forward to: ${callForward.forwardToUser.name}` : 'Call Forward'}
          >
            <FiPhoneForwarded />
            <span>
              {callForward.forwardToUser 
                ? `→ ${callForward.forwardToUser.name}` 
                : 'Call Forward'}
            </span>
          </QuickActionButton>
          
          <QuickActionStat>
            <FiRadio />
            <span>{activeBroadcastCount} / {broadcasts.length} Monitors</span>
          </QuickActionStat>

          {isInCall && (
            <QuickActionButton
              onClick={disconnectCall}
              $active={true}
              $color="#dc2626"
              title="End Call"
            >
              <FiPhoneOff />
              <span>End Call</span>
            </QuickActionButton>
          )}

          {isInCall && (
            <QuickActionButton
              $active={isTransmitting}
              $color={isTransmitting ? '#16a34a' : 'rgba(255,255,255,0.2)'}
              title="Push to Talk"
              onMouseDown={() => startPTT && startPTT()}
              onMouseUp={() => stopPTT && stopPTT()}
              onTouchStart={(e) => {
                e.preventDefault();
                startPTT && startPTT();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopPTT && stopPTT();
              }}
              onMouseLeave={() => {
                stopPTT && stopPTT();
              }}
            >
              <FiMic />
              <span>PTT</span>
            </QuickActionButton>
          )}

          {isInCall && (
            <QuickActionButton
              $active={isLatched}
              $color={isLatched ? '#22c55e' : 'rgba(255,255,255,0.2)'}
              title={isLatched ? 'Latched (click to un-latch)' : 'Latch PTT (click to latch)'}
              onClick={() => togglePTTLatch && togglePTTLatch()}
            >
              <span style={{ fontWeight: 700 }}>{isLatched ? 'Latched' : 'Latch'}</span>
            </QuickActionButton>
          )}

          {isInCall && instantCall?.config?.policy === 'firstResponder1to1' && instantCall?.config?.audioMode === 'ptt' && (
            <QuickActionStat title="First responder mode: first to speak becomes 1:1">
              <FiUsers />
              <span>First responder mode</span>
            </QuickActionStat>
          )}

          <QuickActionButton
            onClick={() => navigate('/settings')}
            $color="#06b6d4"
            title="Audio & system settings"
          >
            <FiSettings />
            <span>Settings</span>
          </QuickActionButton>

          <QuickActionButton
            $active={showNotifications}
            onClick={() => setShowNotifications(s => !s)}
            $color="#8b5cf6"
            title="Notifications"
          >
            <FiBell />
            <span>Notifications</span>
          </QuickActionButton>

          <QuickActionButton
            $active={autoAnswer}
            onClick={toggleAutoAnswer}
            $color={autoAnswer ? "#10b981" : "#6b7280"}
            title={autoAnswer ? "Auto-answer enabled - calls will be answered automatically" : "Auto-answer disabled"}
          >
            <FiPhoneCall />
            <span>Auto-Answer</span>
          </QuickActionButton>
        </QuickActions>

        {/* Active Call - Prominent Floating Bar */}
        {isInCall && instantCall && (
          <FloatingCallBar>
            <CallBarContent>
              <CallBarLeft>
                <CallStatusIndicator $active={!isMuted}>
                  <div className="pulse-dot" />
                </CallStatusIndicator>
                <CallBarInfo>
                  <CallBarTitle>
                    {instantCall?.isGroupCall 
                      ? `Group Call - ${participantCount || 0} participants`
                      : instantCall?.contact?.username 
                        ? `@${instantCall.contact.username}`
                        : instantCall?.targetUserId
                          ? `Calling ${instantCall.targetUserId}`
                          : 'Active Call'
                    }
                  </CallBarTitle>
                  <CallBarMeta>
                    {callDuration > 0 && (
                      <span>{formatCallDuration(callDuration)}</span>
                    )}
                    {videoEnabled && (
                      <>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <FiVideo size={12} />
                          Video
                        </span>
                      </>
                    )}
                    {isMuted && (
                      <>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444' }}>
                          <FiMicOff size={12} />
                          Muted
                        </span>
                      </>
                    )}
                  </CallBarMeta>
                </CallBarInfo>
              </CallBarLeft>
              
              <CallBarControls>
                {videoEnabled && (
                  <CallBarButton
                    onClick={() => setVideoEnabled(false)}
                    $variant="secondary"
                    title="Disable Video"
                  >
                    <FiVideoOff size={18} />
                  </CallBarButton>
                )}
                <CallBarButton
                  onClick={isMuted ? toggleUnmute : toggleMute}
                  $variant={isMuted ? "warning" : "secondary"}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <FiMicOff size={18} /> : <FiMic size={18} />}
                </CallBarButton>
                <CallBarButton
                  onClick={disconnectCall}
                  $variant="danger"
                  title="End Call"
                  $prominent
                >
                  <FiPhoneOff size={20} />
                  <span>End Call</span>
                </CallBarButton>
              </CallBarControls>
            </CallBarContent>
          </FloatingCallBar>
        )}

        <GridLayout 
          $columns={gridConfig.columns}
          $gap={gridConfig.gap}
          $mobileColumns={gridConfig.mobileColumns}
          $mobileGap={gridConfig.mobileGap}
          $tabletColumns={gridConfig.tabletColumns}
        >
          <UserIntercomBroadcastSection
            broadcasts={broadcasts}
            broadcastLoading={broadcastLoading}
            broadcastError={broadcastError}
            activeBroadcastCount={activeBroadcastCount}
            speakingBroadcastId={speakingBroadcastId}
            showEditPanel={showEditPanel}
            selectedEditColor={selectedEditColor}
            colorMap={colorMap}
            buttonColor={buttonColor}
            onSetItemColor={setItemColor}
            onToggleBroadcast={toggleBroadcast}
            onStartPushToTalk={startPushToTalk}
            onStopPushToTalk={stopPushToTalk}
          />

          <UserIntercomGroupSection
            gridConfig={gridConfig}
            groupCalls={groupCalls}
            groupCallLoading={groupCallLoading}
            groupCallError={groupCallError}
            isInCall={isInCall}
            instantCall={instantCall}
            onlineUserIds={onlineUserIds}
            authUser={authUser}
            showEditPanel={showEditPanel}
            selectedEditColor={selectedEditColor}
            colorMap={colorMap}
            buttonColor={buttonColor}
            onOpenNewGroupModal={openNewGroupModal}
            onStartGroupCall={startGroupCall}
            onSetItemColor={setItemColor}
          />

          <UserIntercomContactsSection
            gridConfig={gridConfig}
            directContacts={directContacts}
            contactsLoading={contactsLoading}
            onlineUsers={onlineUsers}
            isInCall={isInCall}
            instantCall={instantCall}
            showEditPanel={showEditPanel}
            deleteMode={deleteMode}
            selectedEditColor={selectedEditColor}
            colorMap={colorMap}
            buttonColor={buttonColor}
            onOpenContactModal={openContactModal}
            onStartDirectCall={startDirectCall}
            onDisconnectCall={disconnectCall}
            onDeleteDirectContact={deleteDirectContact}
            onSetItemColor={setItemColor}
          />
        </GridLayout>
      </MainContent>
      
      {/* Format call duration - moved to component level */}

      {showSettings && (
        <UserIntercomSettingsPanel
          user={user}
          groupCalls={groupCalls}
          status={status}
          onStatusChange={setStatus}
          callForward={callForward}
          onShowForwardSearch={() => setShowForwardSearch(true)}
          onClose={() => setShowSettings(false)}
          onLeaveGroup={handleLeaveGroup}
          onOpenFullSettings={() => {
            setShowSettings(false);
            navigate('/settings');
          }}
        />
      )}

      {/* Video Call Display */}
      {isInCall && videoEnabled && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          width: '320px',
          height: '240px',
          background: '#000',
          borderRadius: '8px',
          overflow: 'hidden',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Remote video (main) */}
          {remoteVideoStream ? (
            <video
              key="remote-video"
              ref={(el) => {
                if (el && remoteVideoStream) {
                  el.srcObject = remoteVideoStream;
                  el.play().catch(console.error);
                }
              }}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                flex: 1
              }}
            />
          ) : hookLocalStream && hookLocalStream.getVideoTracks().length > 0 ? (
            <video
              key="local-video-fallback"
              ref={(el) => {
                if (el && hookLocalStream) {
                  el.srcObject = hookLocalStream;
                  el.play().catch(console.error);
                }
              }}
              autoPlay
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                flex: 1
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '0.875rem'
            }}>
              Waiting for video...
            </div>
          )}
          
          {/* Local video (picture-in-picture) */}
          {hookLocalStream && hookLocalStream.getVideoTracks().length > 0 && remoteVideoStream && (
            <video
              key="local-video-pip"
              ref={(el) => {
                if (el && hookLocalStream) {
                  el.srcObject = hookLocalStream;
                  el.play().catch(console.error);
                }
              }}
              autoPlay
              muted
              playsInline
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                width: '80px',
                height: '60px',
                borderRadius: '4px',
                objectFit: 'cover',
                border: '2px solid rgba(255,255,255,0.3)'
              }}
            />
          )}
          
          <button
            onClick={() => {
              setVideoEnabled(false);
              // Stop video tracks
              if (hookLocalStream) {
                hookLocalStream.getVideoTracks().forEach(track => track.stop());
              }
            }}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 10px',
              cursor: 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.75rem'
            }}
            title="Disable Video"
          >
            <FiVideoOff size={14} />
            <span>Stop Video</span>
          </button>
        </div>
      )}

      {/* Edit Page Panel */}
      {showEditPanel && (
        <SettingsPanel>
          <SettingsHeader>
            <h3>Edit Page</h3>
            <IconButton onClick={() => setShowEditPanel(false)}>
              <FiX />
            </IconButton>
          </SettingsHeader>
          <SettingsContent>
            <SettingGroup>
              <SettingLabel>Button Color</SettingLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['#f9fafb', '#e5e7eb', '#e2e8f0', '#dbeafe', '#eef2ff', '#fae8ff', '#fef3c7', '#e7e5e4',
                  '#93c5fd', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185', '#facc15', '#34d399', '#22d3ee'
                ].map(c => (
                  <button
                    key={c}
                    onClick={() => { applyButtonColor(c); setSelectedEditColor(c); }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '2px solid rgba(0,0,0,0.1)', background: c, cursor: 'pointer' }}
                    title={c}
                  />
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={selectedEditColor || buttonColor}
                    onChange={(e) => { applyButtonColor(e.target.value); setSelectedEditColor(e.target.value); }}
                    style={{ width: 36, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    title="Custom color"
                  />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Avoid red (#dc2626) and green (#16a34a)</span>
                </div>
              </div>
            </SettingGroup>
            <SettingGroup>
              <SettingLabel>Direct Contacts</SettingLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="deleteMode" type="checkbox" checked={deleteMode} onChange={(e) => setDeleteMode(e.target.checked)} />
                <label htmlFor="deleteMode">Delete mode (click a contact to remove)</label>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Tip: Pick a color above, then click any button to apply.</div>
            </SettingGroup>
          </SettingsContent>
          <SettingsFooter>
            <SettingsFooterButton
              type="button"
              $variant="primary"
              onClick={() => setShowEditPanel(false)}
            >
              Done
            </SettingsFooterButton>
          </SettingsFooter>
        </SettingsPanel>
      )}

      {showContactModal && (
        <UserIntercomContactModal
          contactsLoading={contactsLoading}
          contactModalTab={contactModalTab}
          onTabChange={setContactModalTab}
          manualContact={manualContact}
          onManualContactChange={setManualContact}
          contactSearchTerm={contactSearchTerm}
          directorySearchResults={directorySearchResults}
          onClose={closeContactModal}
          onAddManualContact={handleAddManualContact}
          onDirectorySearch={handleDirectorySearch}
          onAddDirectoryContact={handleAddDirectoryContact}
        />
      )}

      {showNewGroupModal && (
        <UserIntercomNewGroupModal
          newGroupName={newGroupName}
          onNewGroupNameChange={setNewGroupName}
          newGroupAudioMode={newGroupAudioMode}
          onNewGroupAudioModeChange={setNewGroupAudioMode}
          newGroupPolicy={newGroupPolicy}
          onNewGroupPolicyChange={setNewGroupPolicy}
          newGroupSearch={newGroupSearch}
          newGroupResults={newGroupResults}
          newGroupSelected={newGroupSelected}
          onSearchUsers={searchUsersForNewGroup}
          onToggleSelectUser={toggleSelectNewGroupUser}
          onClose={closeNewGroupModal}
          onCreateGroup={handleCreateGroup}
        />
      )}

      {showForwardSearch && (
        <UserIntercomForwardSearchModal
          callForward={callForward}
          forwardSearchResults={forwardSearchResults}
          onClose={() => setShowForwardSearch(false)}
          onSearchQueryChange={(query) => {
            setCallForward({ ...callForward, searchQuery: query });
            searchForwardUsers(query);
          }}
          onSelectUser={selectForwardUser}
        />
      )}
    </Container>
  );
};

export default UserIntercom;
