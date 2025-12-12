import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
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
  FiSearch,
  FiX,
  FiPlus,
  FiTrash2,
  FiUserPlus
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useInstantIntercomWebRTC } from '../../hooks/useInstantIntercomWebRTC';
import { useBroadcastAudio } from '../../hooks/useBroadcastAudio';
import OnAirIndicator from '../../components/OnAirIndicator/OnAirIndicator';
import api from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';

const API_BASE = process.env.REACT_APP_API_URL || '';

const UserIntercom = () => {
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
    togglePTTLatch
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
  
  // User state
  const [user, setUser] = useState({ 
    name: authUser?.name || 'Trader', 
    id: authUser?.userId || 'user-001',
    sipUri: authUser?.sipUri || '',
    employeeId: authUser?.employeeId || ''
  });
  const [status, setStatus] = useState('available'); // available, busy, dnd, away
  
  // Settings
  const [isDND, setIsDND] = useState(false);
  const [callForward, setCallForward] = useState({ 
    enabled: false, 
    forwardToUser: null,
    searchQuery: ''
  });
  const [showForwardSearch, setShowForwardSearch] = useState(false);
  const [forwardSearchResults, setForwardSearchResults] = useState([]);
  
  // Active calls (legacy - can be removed later)
  const [activeCall, setActiveCall] = useState(null);
  
  // Broadcasts (Hoots)
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState(null);
  
  // Group calls available to call
  const [groupCalls, setGroupCalls] = useState([]);
  const [groupCallLoading, setGroupCallLoading] = useState(false);
  const [groupCallError, setGroupCallError] = useState(null);
  
  // Direct contacts
  const [directContacts, setDirectContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalTab, setContactModalTab] = useState('manual');
  const [manualContact, setManualContact] = useState({
    displayName: '',
    uri: '',
    extension: '',
  });
  const [directorySearchResults, setDirectorySearchResults] = useState([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');

  // New group modal state
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSearch, setNewGroupSearch] = useState('');
  const [newGroupResults, setNewGroupResults] = useState([]);
  const [newGroupSelected, setNewGroupSelected] = useState([]); // array of {id, name}
  const [newGroupAudioMode, setNewGroupAudioMode] = useState('ptt'); // 'ptt' | 'open'
  const [newGroupPolicy, setNewGroupPolicy] = useState('group'); // 'group' | 'firstResponder1to1'

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
  const [missedCalls, setMissedCalls] = useState([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedError, setMissedError] = useState(null);

  const fetchMissed = useCallback(async () => {
    try {
      setMissedLoading(true);
      setMissedError(null);
      const res = await api.get('/api/notifications/missed');
      setMissedCalls(res.data?.missed || []);
    } catch (e) {
      setMissedError(e?.message || 'Failed to load notifications');
    } finally {
      setMissedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showNotifications) {
      fetchMissed();
    }
  }, [showNotifications, fetchMissed]);

  // Presence status derived locally (online/busy/dnd/forward/offline)
  const computePresence = useCallback(() => {
    if (!socket || !socket.connected) return { key: 'offline', label: 'Offline' };
    if (isDND) return { key: 'dnd', label: 'Do Not Disturb' };
    if (isInCall) return { key: 'busy', label: 'On a call' };
    if (callForward.enabled) return { key: 'forward', label: 'Call forwarding' };
    return { key: 'online', label: 'Online' };
  }, [socket, isDND, isInCall, callForward]);

  // Auto-reconnect logic: try to reconnect every 10 seconds for 2 minutes when offline
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  useEffect(() => {
    if (!socket) return;
    
    const maxAttempts = 12; // 2 minutes = 120 seconds / 10 seconds = 12 attempts
    const reconnectInterval = 10000; // 10 seconds
    
    const tryReconnect = () => {
      if (!socket) return;
      if (socket.connected) {
        console.log('✅ Socket connected, stopping auto-reconnect');
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) {
          clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        return;
      }
      
      reconnectAttemptsRef.current++;
      console.log(`🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current}/${maxAttempts}`);
      
      if (reconnectAttemptsRef.current > maxAttempts) {
        console.log('⏹️ Max reconnection attempts (2 minutes) reached, stopping auto-reconnect');
        if (reconnectTimerRef.current) {
          clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        return;
      }
      
      // Try to reconnect
      try {
        if (socket.disconnected) {
          console.log('🔄 Attempting to reconnect socket...');
          socket.connect();
        } else if (!socket.connected && !socket.connecting) {
          // Socket might be in a weird state, try connectSocket to create a new one
          console.log('🔄 Socket in unexpected state, calling connectSocket...');
          connectSocket();
        }
      } catch (error) {
        console.error('❌ Reconnection attempt failed:', error);
      }
    };
    
    const onDisconnect = (reason) => {
      console.log('⚠️ Socket disconnected:', reason);
      reconnectAttemptsRef.current = 0; // Reset attempts on new disconnect
      
      // Start auto-reconnect timer
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
      }
      
      // Try immediately
      tryReconnect();
      
      // Then try every 10 seconds
      reconnectTimerRef.current = setInterval(() => {
        tryReconnect();
      }, reconnectInterval);
    };
    
    const onConnect = () => {
      console.log('✅ Socket connected, stopping auto-reconnect');
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    
    // Check initial state
    if (!socket.connected) {
      console.log('🔄 Socket not connected on mount, starting auto-reconnect');
      onDisconnect('initial');
    }
    
    // Listen for disconnect events
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    
    return () => {
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socket) {
        socket.off('disconnect', onDisconnect);
        socket.off('connect', onConnect);
      }
    };
  }, [socket, connectSocket]);

  // Network presence for contacts
  const [onlineUsers, setOnlineUsers] = useState({}); // { userId: true }
  useEffect(() => {
    if (!socket) return;
    // fetch initial
    try {
      socket.emit('presence-get', (data) => {
        const online = {};
        (data?.online || []).forEach(id => { online[String(id)] = true; });
        setOnlineUsers(online);
      });
    } catch {}
    const onPresence = ({ userId, online }) => {
      const id = String(userId);
      setOnlineUsers(prev => {
        const next = { ...prev };
        if (online) next[id] = true;
        else delete next[id];
        return next;
      });
    };
    socket.on('presence-update', onPresence);
    return () => socket.off('presence-update', onPresence);
  }, [socket]);
  
  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const userId = authUser?.id || authUser?.userId;
  const [availableDevices, setAvailableDevices] = useState({ microphones: [], speakers: [] });
  const [selectedDevices, setSelectedDevices] = useState({ microphoneId: '', speakerId: '' });

  const [speakingBroadcastId, setSpeakingBroadcastId] = useState(null);
  const [broadcastLevels, setBroadcastLevels] = useState({});
  const levelUnsubsRef = React.useRef(new Map());
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  // Helper to normalize a participant object to a userId string
  const getParticipantId = useCallback((p) => {
    if (p == null) return null;
    if (typeof p === 'string' || typeof p === 'number') return String(p);
    return String(
      p.userId ||
      p.id ||
      p.user?.userId ||
      p.user?.id ||
      p.contactUserId ||
      ''
    ) || null;
  }, []);

  const fetchBroadcastStatus = useCallback(async (groupId) => {
    try {
      const response = await fetch(`${API_BASE}/api/groups/${groupId}/hoot/status`);
      if (!response.ok) return;
      const data = await response.json();
      setBroadcasts(prev =>
        prev.map(b => b.id === groupId ? { ...b, hoot: data.hoot } : b)
      );
    } catch (error) {
      console.error('Failed to refresh hoot status', error);
    }
  }, []);

  const fetchBroadcasts = useCallback(async () => {
    try {
      setBroadcastLoading(true);
      setBroadcastError(null);
      const response = await fetch(`${API_BASE}/api/groups?callMode=broadcast`);
      if (!response.ok) {
        throw new Error('Failed to load broadcast channels');
      }
      const data = await response.json();
      const groups = data.groups || [];

      setBroadcasts(prev => {
        const previousMap = new Map(prev.map(b => [b.id, b]));
        return groups.map(group => {
          const previous = previousMap.get(group.id);
          const hootConfig = group.hoot?.config || group.hootConfig || previous?.hootConfig || {};
          return {
            id: group.id,
            name: group.name,
            description: group.description,
            active: previous?.active || false,
            volume: previous?.volume ?? 80,
            isToggling: false,
            hoot: group.hoot || previous?.hoot || null,
            hootConfig,
          };
        });
      });
    } catch (error) {
      console.error(error);
      setBroadcastError(error.message);
      toast.error(error.message || 'Failed to load broadcasts');
    } finally {
      setBroadcastLoading(false);
    }
  }, []);

  const loadDirectContacts = useCallback(async () => {
    try {
      setContactsLoading(true);
      const response = await api.get('/api/direct-contacts');
      setDirectContacts(response.data?.contacts || []);
    } catch (error) {
      console.error('Failed to load direct contacts', error);
      toast.error(error.response?.data?.error || 'Failed to load direct contacts');
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const stopPushToTalk = useCallback(
    async (broadcastId, reason = 'ptt-release') => {
      if (!userId || speakingBroadcastId !== broadcastId) return;
      try {
        await stopBroadcastPushToTalk(broadcastId);
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, reason }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to stop hoot');
        }
      } catch (error) {
        console.error('Failed to stop hoot:', error);
        toast.error(error.message || 'Push-to-talk stop failed');
      } finally {
        setSpeakingBroadcastId((current) => (current === broadcastId ? null : current));
        fetchBroadcastStatus(broadcastId);
      }
    },
    [userId, speakingBroadcastId, stopBroadcastPushToTalk, fetchBroadcastStatus]
  );

  const startPushToTalk = useCallback(
    async (broadcastId) => {
      if (!userId) {
        toast.error('You must be logged in to speak');
        return;
      }

      if (speakingBroadcastId && speakingBroadcastId !== broadcastId) {
        await stopPushToTalk(speakingBroadcastId);
      }

      try {
        await startBroadcastPushToTalk({
          groupId: broadcastId,
          microphoneId: selectedDevices.microphoneId,
        });
        setSpeakingBroadcastId(broadcastId);
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, options: { source: 'ptt-button' } }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to start hoot');
        }
        fetchBroadcastStatus(broadcastId);
      } catch (error) {
        console.error('Failed to start hoot:', error);
        toast.error(error.message || 'Push-to-talk failed');
        setSpeakingBroadcastId((current) => (current === broadcastId ? null : current));
        await stopBroadcastPushToTalk(broadcastId);
      }
    },
    [userId, speakingBroadcastId, stopPushToTalk, fetchBroadcastStatus, startBroadcastPushToTalk, selectedDevices.microphoneId]
  );

  const loadGroupCalls = useCallback(async () => {
    if (!userId) return;
    try {
      setGroupCallLoading(true);
      setGroupCallError(null);
      const response = await fetch(`${API_BASE}/api/groups?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to load groups');
      }
      const data = await response.json();
      const groups = (data.groups || []).filter(group => (group.callMode || 'group-call') !== 'broadcast');
      setGroupCalls(groups);
    } catch (error) {
      console.error(error);
      setGroupCallError(error.message);
    } finally {
      setGroupCallLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBroadcasts();
    const interval = setInterval(fetchBroadcasts, 15000);
    return () => clearInterval(interval);
  }, [fetchBroadcasts]);

  useEffect(() => {
    loadGroupCalls();
  }, [loadGroupCalls]);

  useEffect(() => {
    loadDirectContacts();
  }, [loadDirectContacts]);

  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter((device) => device.kind === 'audioinput');
        const speakers = devices.filter((device) => device.kind === 'audiooutput');
        setAvailableDevices({ microphones, speakers });
        setSelectedDevices((prev) => ({
          microphoneId: prev.microphoneId || microphones[0]?.deviceId || '',
          speakerId: prev.speakerId || speakers[0]?.deviceId || '',
        }));
      } catch (error) {
        console.error('Failed to enumerate audio devices:', error);
      }
    };

    enumerateDevices();
  }, []);

  useEffect(() => {
    return () => {
      stopAllBroadcastAudio();
    };
  }, [stopAllBroadcastAudio]);

  useEffect(() => {
    broadcasts
      .filter((broadcast) => broadcast.active)
      .forEach((broadcast) =>
        updateBroadcastSpeaker(broadcast.id, selectedDevices.speakerId)
      );
  }, [broadcasts, selectedDevices.speakerId, updateBroadcastSpeaker]);

  // Presence tracking
  useEffect(() => {
    if (!socket) return;
    const applyOnline = (list) => {
      try {
        const set = new Set((list || []).map(id => String(id)));
        setOnlineUserIds(set);
      } catch {}
    };
    // initial fetch
    try {
      socket.emit('presence-get', (resp) => applyOnline(resp?.online || []));
    } catch {}
    // live updates
    const onPresence = (data) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        const id = String(data?.userId);
        if (!id) return prev;
        if (data?.online) next.add(id);
        else next.delete(id);
        return next;
      });
    };
    socket.on('presence-update', onPresence);
    return () => {
      socket.off('presence-update', onPresence);
    };
  }, [socket]);
  const handleDeleteDirectContact = async (contactId) => {
    try {
      await api.delete(`/api/direct-contacts/${contactId}`);
      toast.success('Contact removed');
      loadDirectContacts();
    } catch (error) {
      console.error('Failed to remove contact', error);
      toast.error(error.response?.data?.error || 'Failed to remove contact');
    }
  };

  const handleCloseContactModal = () => {
    setShowContactModal(false);
    setContactModalTab('manual');
    setManualContact({ displayName: '', uri: '', extension: '' });
    setDirectorySearchResults([]);
    setContactSearchTerm('');
  };

  const handleAddManualContact = async (event) => {
    event.preventDefault();
    if (!manualContact.displayName.trim() || !manualContact.uri.trim()) {
      toast.error('Name and URI are required');
      return;
    }
    try {
      setContactsLoading(true);
      await api.post('/api/direct-contacts', {
        displayName: manualContact.displayName.trim(),
        uri: manualContact.uri.trim(),
        extension: manualContact.extension?.trim() || null,
      });
      toast.success('Contact added');
      setManualContact({ displayName: '', uri: '', extension: '' });
      handleCloseContactModal();
      loadDirectContacts();
    } catch (error) {
      console.error('Failed to add contact', error);
      toast.error(error.response?.data?.error || 'Failed to add contact');
    } finally {
      setContactsLoading(false);
    }
  };

  const handleDirectorySearch = async (query) => {
    setContactSearchTerm(query);
    if (!query || query.length < 2) {
      setDirectorySearchResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setDirectorySearchResults(
        users.map((user) => ({
          id: user.userId || user.id,
          name:
            user.displayName ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.username,
          extension: user.extension,
          email: user.email,
          sipUri: user.sipUri,
          raw: user,
        }))
      );
    } catch (error) {
      console.error('Failed to search directory', error);
      toast.error(error.response?.data?.error || 'Failed to search directory');
    }
  };

  const handleAddDirectoryContact = async (user) => {
    try {
      setContactsLoading(true);
      await api.post('/api/direct-contacts', {
        contactUserId: user.id,
        displayName: user.name,
        extension: user.extension || null,
        uri: user.sipUri || null,
        metadata: {
          email: user.email,
        },
      });
      toast.success('Contact added');
      loadDirectContacts();
    } catch (error) {
      console.error('Failed to add directory contact', error);
      toast.error(error.response?.data?.error || 'Failed to add contact');
    } finally {
      setContactsLoading(false);
    }
  };

  const searchUsersForNewGroup = async (query) => {
    setNewGroupSearch(query);
    if (!query || query.length < 2) {
      setNewGroupResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setNewGroupResults(users.map(u => ({
        id: u.userId || u.id,
        name: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
        email: u.email,
      })));
    } catch (error) {
      console.error('Failed to search users for group', error);
      setNewGroupResults([]);
    }
  };

  const toggleSelectNewGroupUser = (user) => {
    setNewGroupSelected(prev => {
      const exists = prev.some(p => p.id === user.id);
      if (exists) return prev.filter(p => p.id !== user.id);
      return [...prev, user];
    });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      toast.error('Group name is required');
      return;
    }
    try {
      setGroupCallLoading(true);
      // Create group
      const createRes = await api.post('/api/groups', {
        name: newGroupName.trim(),
        callMode: 'group-call',
      });
      const group = createRes.data?.group || createRes.data;
      const groupId = group?.id;
      if (!groupId) throw new Error('Group create failed');

      // Add participants
      for (const u of newGroupSelected) {
        try {
          await api.post(`/api/groups/${groupId}/participants`, { userId: u.id });
        } catch {}
      }

      // Close modal and refresh
      setShowNewGroupModal(false);
      setNewGroupName('');
      setNewGroupSearch('');
      setNewGroupResults([]);
      setNewGroupSelected([]);
      await loadGroupCalls();
      toast.success('Group created');
    } catch (error) {
      console.error('Create group failed', error);
      toast.error(error.response?.data?.error || 'Failed to create group');
    } finally {
      setGroupCallLoading(false);
    }
  };

  // Toggle DND
  const toggleDND = () => {
    setIsDND(!isDND);
    setStatus(isDND ? 'available' : 'dnd');
    toast.success(isDND ? 'Do Not Disturb OFF' : 'Do Not Disturb ON');
  };

  // Handle logout
  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  // Toggle call forward
  const toggleCallForward = () => {
    if (!callForward.enabled && !callForward.forwardToUser) {
      setShowForwardSearch(true);
      toast('Select a person to forward calls to');
      return;
    }
    const newState = !callForward.enabled;
    setCallForward({ ...callForward, enabled: newState });
    if (newState && callForward.forwardToUser) {
      toast.success(`Call forward enabled to ${callForward.forwardToUser.name}`);
    } else {
      toast.success('Call forward disabled');
    }
  };

  // Search for users to forward to
  const searchForwardUsers = async (query) => {
    if (query.length < 2) {
      setForwardSearchResults([]);
      return;
    }

    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      const formatted = users.map(user => ({
        id: user.id || user.userId,
        name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        status: user.status || 'available',
        extension: user.extension || '',
        email: user.email,
      }));
      setForwardSearchResults(formatted);
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    }
  };

  // Select forward user
  const selectForwardUser = (contact) => {
    setCallForward({
      ...callForward,
      forwardToUser: contact,
      enabled: true
    });
    setShowForwardSearch(false);
    toast.success(`Calls will forward to ${contact.name}`);
  };

  // Toggle broadcast monitor
  const toggleBroadcast = async (broadcastId) => {
    const broadcast = broadcasts.find(b => b.id === broadcastId);
    if (!broadcast) return;
    if (!userId) {
      toast.error('User information not available');
      return;
    }

    const targetState = !broadcast.active;
    setBroadcasts(prev =>
      prev.map(b => b.id === broadcastId ? { ...b, isToggling: true } : b)
    );

    try {
      if (targetState) {
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/listen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            persistent: broadcast.hootConfig?.persistentListen || false,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to join broadcast');
        }
        await monitorBroadcastAudio({
          groupId: broadcastId,
          speakerDeviceId: selectedDevices.speakerId,
        });
        // Subscribe to VAD levels for this broadcast
        try {
          const unsub = subscribeBroadcastLevels(broadcastId, (level) => {
            setBroadcastLevels(prev => ({ ...prev, [broadcastId]: level }));
          });
          levelUnsubsRef.current.set(broadcastId, unsub);
        } catch {}
        toast.success(`Monitoring ${broadcast.name}`);
      } else {
        const response = await fetch(`${API_BASE}/api/groups/${broadcastId}/hoot/listen/${userId}?keepPersistent=false`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to leave broadcast');
        }
        stopBroadcastAudio(broadcastId);
        // Unsubscribe from VAD levels
        const unsub = levelUnsubsRef.current.get(broadcastId);
        if (unsub) {
          try { unsub(); } catch {}
          levelUnsubsRef.current.delete(broadcastId);
        }
        setBroadcastLevels(prev => {
          const next = { ...prev };
          delete next[broadcastId];
          return next;
        });
        toast.success(`Stopped monitoring ${broadcast.name}`);
        if (speakingBroadcastId === broadcastId) {
          await stopPushToTalk(broadcastId, 'monitor-disabled');
        }
      }

      setBroadcasts(prev =>
        prev.map(b => b.id === broadcastId ? { ...b, active: targetState, isToggling: false } : b)
      );
      fetchBroadcastStatus(broadcastId);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Broadcast action failed');
      if (targetState) {
        stopBroadcastAudio(broadcastId);
      }
      setBroadcasts(prev =>
        prev.map(b => b.id === broadcastId ? { ...b, isToggling: false } : b)
      );
    }
  };

  // Adjust broadcast volume
  const adjustBroadcastVolume = (broadcastId, newVolume) => {
    setBroadcasts(prev => prev.map(b => 
      b.id === broadcastId ? { ...b, volume: newVolume } : b
    ));
  };

  // Start direct call - use instant intercom
  const startDirectCall = (contact) => {
    if (contact.contactUserId) {
      instantConnect({ userId: contact.contactUserId });
      return;
    }

    if (contact.uri) {
      const uri = contact.uri.startsWith('sip:') ? contact.uri : `sip:${contact.uri}`;
      window.location.href = uri;
      return;
    }

    toast.error('No routing information available for this contact');
  };

  // Start group call - use instant intercom
  const startGroupCall = async (group) => {
    try {
      // Collect target participants
      let participantIds = [];
      if (Array.isArray(group.participants) && group.participants.length > 0) {
        participantIds = group.participants
          .map(p => getParticipantId(p))
          .filter(Boolean);
      } else {
        // Fetch group details for participants
        // Prefer participants endpoint if available
        const res = await fetch(`${API_BASE}/api/groups/${group.id}/participants`);
        if (res.ok) {
          const data = await res.json();
          const participants = data.participants || data.users || [];
          participantIds = participants
            .map(p => getParticipantId(p))
            .filter(Boolean);
        } else {
          const res2 = await fetch(`${API_BASE}/api/groups/${group.id}`);
          if (res2.ok) {
            const data = await res2.json();
            const participants = data.group?.participants || data.participants || [];
            participantIds = participants
              .map(p => getParticipantId(p))
              .filter(Boolean);
          }
        }
      }

      // Exclude self from targets
      const selfId = String(authUser?.id || authUser?.userId || '');
      if (selfId) {
        participantIds = participantIds.filter(id => String(id) !== selfId);
      }

      if (participantIds.length === 0) {
        toast.error('No participants available in this group');
        return;
      }

      // Filter to online participants via presence-get
      let onlineIds = participantIds;
      if (socket) {
        try {
          onlineIds = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(participantIds), 700);
            socket.emit('presence-get', (resp) => {
              clearTimeout(timeout);
              const online = (resp?.online || []).map(String);
              resolve(participantIds.filter(id => online.includes(String(id))));
            });
          });
        } catch {
          onlineIds = participantIds;
        }
      }

      // If none detected online, attempt all (they may be online but presence delayed)
      if (onlineIds.length === 0) {
        toast('No online presence detected; attempting all members', { icon: 'ℹ️' });
        onlineIds = participantIds;
      }
      if (onlineIds.length < participantIds.length) {
        toast('Some participants are offline; calling online members only', { icon: 'ℹ️' });
      }

      // Start group call with explicit targets
      instantConnect({
        groupId: group.id,
        targetUserIds: onlineIds,
        audioMode: 'ptt',
        policy: 'group',
      });
    } catch (err) {
      console.error('Failed to start group call', err);
      toast.error('Failed to start group call');
    }
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
    <Container>
      <Header>
        <Logo>
          <img src={`${process.env.PUBLIC_URL}/icon/tradepulse.ico`} alt="TradePulse" style={{ width: 28, height: 28, marginRight: 10 }} />
          TradePulse
        </Logo>
        <UserInfo>
          <UserName>
            {authUser?.username ? `@${authUser.username}` : (authUser?.displayName || user.name)}
          </UserName>
          {user.employeeId && <EmployeeId>ID: {user.employeeId}</EmployeeId>}
          <IconButton onClick={() => setShowEditPanel(true)} title="Edit Page">
            ✏️
          </IconButton>
          <IconButton onClick={() => setShowSettings(!showSettings)} title="Settings">
            <FiSettings />
          </IconButton>
          <LogoutButton onClick={handleLogout} title="Logout">
            <FiLogOut />
            <span>Logout</span>
          </LogoutButton>
        </UserInfo>
      </Header>

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

      <MainContent>
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
          {/* Presence indicator */}
          {(() => {
            const p = computePresence();
            const dotStyle = {
              width: 10,
              height: 10,
              borderRadius: '50%',
              marginRight: 8,
              background: p.key === 'online' ? '#10b981'
                : p.key === 'busy' ? '#ef4444'
                : p.key === 'forward' ? '#f59e0b'
                : 'rgba(255,255,255,0.35)'
            };
            return (
              <QuickActionStat title={p.label}>
                {p.key === 'dnd' ? <FiMinusCircle /> : <span style={dotStyle} />}
                <span>{p.label}</span>
              </QuickActionStat>
            );
          })()}
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
            $active={showNotifications}
            onClick={() => setShowNotifications(s => !s)}
            $color="#8b5cf6"
            title="Notifications"
          >
            <FiBell />
            <span>Notifications</span>
          </QuickActionButton>
        </QuickActions>

        {/* Active Call */}
        {activeCall && (
          <ActiveCallPanel>
            <CallHeader>
              <CallIcon>📞</CallIcon>
              <CallInfo>
                <CallTitle>
                  {activeCall.type === 'direct' 
                    ? activeCall.contact.name 
                    : `${activeCall.group.name} (Group Call)`
                  }
                </CallTitle>
                <CallDuration>
                  {Math.floor((Date.now() - activeCall.startTime) / 1000)}s
                </CallDuration>
              </CallInfo>
            </CallHeader>
            <CallControls>
              <CallButton onClick={isMuted ? toggleUnmute : toggleMute} muted={isMuted}>
                {isMuted ? <FiMicOff /> : <FiMic />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </CallButton>
              <CallButton onClick={disconnectCall} danger>
                <FiPhoneOff />
                <span>End Call</span>
              </CallButton>
            </CallControls>
          </ActiveCallPanel>
        )}

        <GridLayout>
          {/* Broadcast Monitors */}
          <Section>
            <SectionHeader>
              <SectionTitle>
                <FiRadio />
                Broadcast Monitors
              </SectionTitle>
              <Badge>{activeBroadcastCount} active</Badge>
            </SectionHeader>
            {broadcastLoading && <SectionSubtext>Updating broadcast list...</SectionSubtext>}
            {broadcastError && <SectionSubtext $error>{broadcastError}</SectionSubtext>}
            <BroadcastList>
              {broadcasts.map(broadcast => (
                <BroadcastItem
                  key={broadcast.id}
                  $active={broadcast.active}
                  $bgColor={colorMap[`broadcast:${broadcast.id}`] || buttonColor}
                  onClick={(e) => {
                    if (showEditPanel) {
                      if (selectedEditColor) {
                        e.stopPropagation();
                        setItemColor('broadcast', broadcast.id, selectedEditColor);
                      }
                      return;
                    }
                  }}
                >
                  <BroadcastHeader>
                    <BroadcastName>
                      <BroadcastTitleRow>
                        {broadcast.hoot?.state?.isActive && <OnAirPill>On Air</OnAirPill>}
                        <span style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          color: '#ffffff',
                          fontWeight: 600
                        }}>{broadcast.name}</span>
                        <MonitorToggle
                          aria-label={broadcast.active ? 'Turn monitor off' : 'Turn monitor on'}
                          $active={broadcast.active}
                          disabled={broadcast.isToggling}
                          onClick={() => !broadcast.isToggling && toggleBroadcast(broadcast.id)}
                          style={{ marginLeft: 8 }}
                        />
                      </BroadcastTitleRow>
                      {broadcast.active && (
                        <BroadcastStats>
                          <BroadcastStat title="Monitoring">
                            <strong>{broadcast.hoot?.state?.persistentListenerCount || 0}</strong>
                            <span style={{ opacity: 0.8 }}>monitoring</span>
                          </BroadcastStat>
                        </BroadcastStats>
                      )}
                    </BroadcastName>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {broadcast.active && (
                        <PushToTalkButton
                          type="button"
                          disabled={!broadcast.active}
                          $speaking={speakingBroadcastId === broadcast.id}
                          onMouseDown={() => broadcast.active && startPushToTalk(broadcast.id)}
                          onMouseUp={() => stopPushToTalk(broadcast.id)}
                          onMouseLeave={() => speakingBroadcastId === broadcast.id && stopPushToTalk(broadcast.id)}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            if (broadcast.active) {
                              startPushToTalk(broadcast.id);
                            }
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            stopPushToTalk(broadcast.id);
                          }}
                          onTouchCancel={(e) => {
                            e.preventDefault();
                            stopPushToTalk(broadcast.id);
                          }}
                          style={{ width: 'auto', marginTop: 0 }}
                        >
                          <FiMic size={14} />
                          {speakingBroadcastId === broadcast.id ? 'Live' : 'PTT'}
                        </PushToTalkButton>
                      )}
                    </div>
                  </BroadcastHeader>
                </BroadcastItem>
              ))}
            </BroadcastList>
          </Section>

          {/* Group Calls */}
          <Section>
            <SectionHeader>
              <SectionTitle>
                <FiUsers />
                Group Calls
              </SectionTitle>
              <AddContactButton onClick={() => setShowNewGroupModal(true)} title="Create Group">
                <FiPlus />
                New Group
              </AddContactButton>
            </SectionHeader>
            {groupCallLoading && <SectionSubtext>Loading groups...</SectionSubtext>}
            {groupCallError && <SectionSubtext $error>{groupCallError}</SectionSubtext>}
            <ContactList>
              {groupCalls.length === 0 && !groupCallLoading ? (
                <EmptyState>
                  <p>No groups available yet.</p>
                </EmptyState>
              ) : null}
              {groupCalls.map(group => (
                <ContactItem 
                  key={group.id}
                  disabled={isInCall && !instantCall?.isGroupCall}
                  $bgColor={colorMap[`group:${group.id}`] || buttonColor}
                  onClick={(e) => {
                    if (showEditPanel) {
                      if (selectedEditColor) {
                        e.stopPropagation();
                        setItemColor('group', group.id, selectedEditColor);
                      }
                      return;
                    }
                    startGroupCall(group);
                  }}
                >
                  <ContactInfo>
                    <ContactName style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffffff' }}>{group.name}</span>
                      {Array.isArray(group.participants) && group.participants.length > 0 ? (
                        <OnlineBadge title="Online participants">
                          {(() => {
                            const ids = group.participants.map(p => getParticipantId(p)).filter(Boolean);
                            const base = ids.filter(id => onlineUserIds.has(String(id))).length;
                            const selfId = String(authUser?.id || authUser?.userId || '');
                            const includeSelf = selfId && ids.includes(selfId) && !onlineUserIds.has(selfId) ? 1 : 0;
                            return base + includeSelf;
                          })()}
                        </OnlineBadge>
                      ) : null}
                    </ContactName>
                  </ContactInfo>
                </ContactItem>
              ))}
            </ContactList>
          </Section>

          {/* Direct Contacts */}
          <Section>
            <SectionHeader>
              <SectionTitle>
                <FiPhoneCall />
                Direct Contacts
              </SectionTitle>
              <AddContactButton onClick={() => setShowContactModal(true)}>
                <FiPlus />
                Add
              </AddContactButton>
            </SectionHeader>
            {contactsLoading && <SectionSubtext>Loading contacts...</SectionSubtext>}
            <ContactList>
              {directContacts.length === 0 && !contactsLoading ? (
                <EmptyState>
                  <p>No contacts saved yet. Add someone from the directory or enter a URI.</p>
                </EmptyState>
              ) : null}
              {directContacts.map(contact => (
                <ContactItem 
                  key={contact.id}
                  disabled={isInCall && !instantCall?.isGroupCall}
                  $bgColor={colorMap[`contact:${contact.id}`] || buttonColor}
                  onClick={(e) => {
                    if (showEditPanel) {
                      e.stopPropagation();
                      if (deleteMode) {
                        handleDeleteDirectContact(contact.id);
                        return;
                      }
                      if (selectedEditColor) {
                        setItemColor('contact', contact.id, selectedEditColor);
                      }
                      return;
                    }
                    startDirectCall(contact);
                  }}
                >
                  {/* Remove avatar for tighter layout */}
                  <ContactInfo>
                    <ContactName>
                      {(() => {
                        const contactId = String(contact.contactUserId || contact.id || '');
                        const isOnline = !!(contactId && onlineUsers[contactId]);
                        const inParticipants = Array.isArray(instantCall?.participants) && contactId
                          ? instantCall.participants.map(String).includes(contactId)
                          : false;
                        const inDirect = instantCall?.type === 'direct' && contactId
                          ? (String(instantCall?.contact?.id || '') === contactId)
                          : false;
                        const isBusy = !!(instantCall && (inParticipants || inDirect));
                        const dotStyle = {
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          marginRight: 6,
                          background: isBusy ? '#ef4444' : (isOnline ? '#10b981' : 'rgba(255,255,255,0.35)')
                        };
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <span style={dotStyle} />
                            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffffff' }}>
                              @{contact.username || contact.displayName}
                            </span>
                          </div>
                        );
                      })()}
                    </ContactName>
                  </ContactInfo>
                  <ContactActions />
                </ContactItem>
              ))}
            </ContactList>
          </Section>
        </GridLayout>
      </MainContent>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel>
          <SettingsHeader>
            <h3>Settings</h3>
            <IconButton onClick={() => setShowSettings(false)}>
              <FiX />
            </IconButton>
          </SettingsHeader>
          <SettingsContent>
            <SettingGroup>
              <SettingLabel>Your Details</SettingLabel>
              <UserDetails>
                <DetailRow>
                  <DetailLabel>Name:</DetailLabel>
                  <DetailValue>{user.name}</DetailValue>
                </DetailRow>
                {user.sipUri && (
                  <DetailRow>
                    <DetailLabel>SIP URI:</DetailLabel>
                    <DetailValue>{user.sipUri}</DetailValue>
                  </DetailRow>
                )}
                {user.employeeId && (
                  <DetailRow>
                    <DetailLabel>Employee ID:</DetailLabel>
                    <DetailValue>{user.employeeId}</DetailValue>
                  </DetailRow>
                )}
              </UserDetails>
            </SettingGroup>

            <SettingGroup>
              <SettingLabel>Your Groups</SettingLabel>
              {groupCalls.length === 0 ? (
                <SectionSubtext>No groups assigned.</SectionSubtext>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {groupCalls.map(group => (
                    <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {group.name}
                      </div>
                      <button
                        onClick={() => handleLeaveGroup(group.id)}
                        style={{ background: '#f59e0b', color: '#111827', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                        title="Remove yourself from this group"
                      >
                        Leave
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SettingGroup>
            
            <SettingGroup>
              <SettingLabel>Status</SettingLabel>
              <StatusSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="away">Away</option>
                <option value="dnd">Do Not Disturb</option>
              </StatusSelect>
            </SettingGroup>
            
            <SettingGroup>
              <SettingLabel>Audio Devices</SettingLabel>
              <DeviceSelect
                value={selectedDevices.microphoneId}
                onChange={(e) =>
                  setSelectedDevices((prev) => ({ ...prev, microphoneId: e.target.value }))
                }
              >
                {availableDevices.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || 'Microphone'}
                  </option>
                ))}
              </DeviceSelect>
              <DeviceSelect
                value={selectedDevices.speakerId}
                onChange={(e) =>
                  setSelectedDevices((prev) => ({ ...prev, speakerId: e.target.value }))
                }
              >
                {availableDevices.speakers.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || 'Speaker'}
                  </option>
                ))}
              </DeviceSelect>
            </SettingGroup>

            <SettingGroup>
              <SettingLabel>Call Forward</SettingLabel>
              {callForward.forwardToUser ? (
                <ForwardUserDisplay>
                  <ForwardUserInfo>
                    <strong>{callForward.forwardToUser.name}</strong>
                    <span>Ext: {callForward.forwardToUser.extension}</span>
                  </ForwardUserInfo>
                  <ChangeButton onClick={() => setShowForwardSearch(true)}>
                    Change
                  </ChangeButton>
                </ForwardUserDisplay>
              ) : (
                <SelectButton onClick={() => setShowForwardSearch(true)}>
                  <FiSearch />
                  Select Person to Forward To
                </SelectButton>
              )}
            </SettingGroup>
          </SettingsContent>
          <SettingsFooter>
            <SettingsFooterButton
              type="button"
              $variant="secondary"
              onClick={() => alert('Device test coming soon')}
            >
              Test Devices
            </SettingsFooterButton>
            <SettingsFooterButton
              type="button"
              $variant="primary"
              onClick={() => setShowSettings(false)}
            >
              Close Settings
            </SettingsFooterButton>
          </SettingsFooter>
        </SettingsPanel>
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

      {/* Direct Contact Modal */}
      {showContactModal && (
        <Modal onClick={handleCloseContactModal}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>Manage Direct Contacts</h3>
              <IconButton onClick={handleCloseContactModal}>×</IconButton>
            </ModalHeader>
            <ContactTabs>
              <ContactTab
                type="button"
                $active={contactModalTab === 'manual'}
                onClick={() => setContactModalTab('manual')}
              >
                Manual Entry
              </ContactTab>
              <ContactTab
                type="button"
                $active={contactModalTab === 'directory'}
                onClick={() => setContactModalTab('directory')}
              >
                Directory
              </ContactTab>
            </ContactTabs>

            {contactModalTab === 'manual' ? (
              <ContactForm onSubmit={handleAddManualContact}>
                <FormField>
                  <label>Name</label>
                  <ContactInput
                    type="text"
                    value={manualContact.displayName}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, displayName: e.target.value }))
                    }
                    placeholder="Bloomberg Sales"
                    required
                  />
                </FormField>
                <FormField>
                  <label>SIP / URI</label>
                  <ContactInput
                    type="text"
                    value={manualContact.uri}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, uri: e.target.value }))
                    }
                    placeholder="sip:desk01@example.com"
                    required
                  />
                </FormField>
                <FormField>
                  <label>Extension (optional)</label>
                  <ContactInput
                    type="text"
                    value={manualContact.extension}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, extension: e.target.value }))
                    }
                    placeholder="1234"
                  />
                </FormField>
                <ContactModalActions>
                  <ContactModalButton
                    type="button"
                    $variant="secondary"
                    onClick={handleCloseContactModal}
                  >
                    Cancel
                  </ContactModalButton>
                  <ContactModalButton type="submit" $variant="primary" disabled={contactsLoading}>
                    Save Contact
                  </ContactModalButton>
                </ContactModalActions>
              </ContactForm>
            ) : (
              <>
                <SearchBox>
                  <FiSearch />
                  <SearchInput
                    type="text"
                    placeholder="Search company directory..."
                    value={contactSearchTerm}
                    onChange={(e) => handleDirectorySearch(e.target.value)}
                    autoFocus
                  />
                </SearchBox>
                <ResultsList>
                  {directorySearchResults.length === 0 ? (
                    <EmptyState>
                      {contactSearchTerm.length < 2
                        ? 'Type at least two characters to search.'
                        : 'No users found in the directory.'}
                    </EmptyState>
                  ) : (
                    directorySearchResults.map((user) => (
                      <DirectoryResult key={user.id}>
                        <ContactInfo>
                          <ContactName>{user.name}</ContactName>
                          <ContactStatus>
                            {user.extension ? `Ext: ${user.extension}` : user.email || 'Directory'}
                          </ContactStatus>
                        </ContactInfo>
                        <DirectoryAddButton
                          type="button"
                          onClick={() => handleAddDirectoryContact(user)}
                          disabled={contactsLoading}
                        >
                          <FiUserPlus />
                          Add
                        </DirectoryAddButton>
                      </DirectoryResult>
                    ))
                  )}
                </ResultsList>
              </>
            )}
          </ModalContent>
        </Modal>
      )}

      {/* New Group Modal */}
      {showNewGroupModal && (
        <Modal onClick={() => setShowNewGroupModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>Create Group</h3>
              <IconButton onClick={() => setShowNewGroupModal(false)}>×</IconButton>
            </ModalHeader>
            <ContactForm onSubmit={handleCreateGroup}>
              <FormField>
                <label>Group name</label>
                <ContactInput
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Trading Desk A"
                  required
                />
              </FormField>
              <FormField>
                <label>Audio mode</label>
                <DeviceSelect
                  value={newGroupAudioMode}
                  onChange={(e) => setNewGroupAudioMode(e.target.value)}
                >
                  <option value="ptt">Push-to-Talk</option>
                  <option value="open">Mic Open</option>
                </DeviceSelect>
              </FormField>
              <FormField>
                <label>First responder policy</label>
                <DeviceSelect
                  value={newGroupPolicy}
                  onChange={(e) => setNewGroupPolicy(e.target.value)}
                >
                  <option value="group">Stay as group</option>
                  <option value="firstResponder1to1">First answer → 1:1</option>
                </DeviceSelect>
              </FormField>
              <FormField>
                <label>Add participants</label>
                <SearchBox>
                  <FiSearch />
                  <SearchInput
                    type="text"
                    placeholder="Search directory..."
                    value={newGroupSearch}
                    onChange={(e) => searchUsersForNewGroup(e.target.value)}
                    autoFocus
                  />
                </SearchBox>
                <ResultsList>
                  {newGroupResults.map(u => {
                    const selected = newGroupSelected.some(s => s.id === u.id);
                    return (
                      <ResultItem
                        key={u.id}
                        onClick={() => toggleSelectNewGroupUser(u)}
                        style={{ background: selected ? '#0f172a' : undefined }}
                      >
                        <ContactInfo>
                          <ContactName>{u.name}</ContactName>
                          <ContactStatus>{u.email || 'Directory'}</ContactStatus>
                        </ContactInfo>
                        <MonitorToggle $active={selected}>
                          <ToggleTrack $active={selected}>
                            <ToggleThumb $active={selected} />
                          </ToggleTrack>
                        </MonitorToggle>
                      </ResultItem>
                    );
                  })}
                </ResultsList>
              </FormField>
              <ContactModalActions>
                <ContactModalButton
                  type="button"
                  $variant="secondary"
                  onClick={() => setShowNewGroupModal(false)}
                >
                  Cancel
                </ContactModalButton>
                <ContactModalButton type="submit" $variant="primary">
                  Create Group
                </ContactModalButton>
              </ContactModalActions>
            </ContactForm>
          </ModalContent>
        </Modal>
      )}

      {/* Forward User Search Modal */}
      {showForwardSearch && (
        <Modal onClick={() => setShowForwardSearch(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>Forward Calls To...</h3>
              <IconButton onClick={() => setShowForwardSearch(false)}>×</IconButton>
            </ModalHeader>
            <SearchBox>
              <FiSearch />
              <SearchInput
                type="text"
                placeholder="Search by name, extension, employee ID, or SIP URI..."
                value={callForward.searchQuery}
                onChange={(e) => {
                  setCallForward({ ...callForward, searchQuery: e.target.value });
                  searchForwardUsers(e.target.value);
                }}
                autoFocus
              />
            </SearchBox>
            <ResultsList>
              {forwardSearchResults.length > 0 ? (
                forwardSearchResults.map(contact => (
                  <ResultItem 
                    key={contact.id}
                    onClick={() => selectForwardUser(contact)}
                  >
                    <ContactAvatar>
                      <StatusIndicator status={contact.status} size="small" />
                      {contact.name.substring(0, 2).toUpperCase()}
                    </ContactAvatar>
                    <ResultInfo>
                      <ResultName>{contact.name}</ResultName>
                      <ResultDetails>Ext: {contact.extension}</ResultDetails>
                    </ResultInfo>
                  </ResultItem>
                ))
              ) : (
                <EmptyState>
                  {callForward.searchQuery.length >= 2 
                    ? 'No users found' 
                    : 'Type to search for users...'}
                </EmptyState>
              )}
            </ResultsList>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0a0a0f;
  position: relative;
  
  /* Subtle gradient overlay */
  &::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(6, 182, 212, 0.03) 0%, rgba(16, 185, 129, 0.03) 100%);
    pointer-events: none;
    z-index: 0;
  }
`;

const Header = styled.header`
  background: rgba(21, 21, 32, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  padding: 1.25rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(42, 42, 58, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 10;
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #06b6d4 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const StatusIndicator = styled.div.withConfig({
  shouldForwardProp: (prop) => !['status','size'].includes(prop)
})`
  width: ${props => props.size === 'small' ? '8px' : '12px'};
  height: ${props => props.size === 'small' ? '8px' : '12px'};
  border-radius: 50%;
  background: ${props => {
    switch(props.status) {
      case 'available': return '#4ade80';
      case 'busy': return '#f59e0b';
      case 'away': return '#6b7280';
      case 'dnd': return '#ef4444';
      default: return '#6b7280';
    }
  }};
  box-shadow: 0 0 10px ${props => {
    switch(props.status) {
      case 'available': return '#4ade80';
      case 'busy': return '#f59e0b';
      case 'dnd': return '#ef4444';
      default: return 'transparent';
    }
  }};
`;

const UserName = styled.span`
  color: white;
  font-weight: 500;
`;

const IconButton = styled.button`
  background: rgba(42, 42, 58, 0.5);
  border: 1px solid rgba(58, 58, 74, 0.5);
  color: white;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.5rem;
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(58, 58, 74, 0.7);
    border-color: rgba(6, 182, 212, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const MainContent = styled.main`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  position: relative;
  z-index: 1;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const QuickActionButton = styled.button`
  background: ${({ $active, $color }) => ($active ? $color : 'rgba(21, 21, 32, 0.8)')};
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 1px solid ${({ $active, $color }) => ($active ? $color : 'rgba(42, 42, 58, 0.8)')};
  color: white;
  height: 36px;
  padding: 0 0.85rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: ${({ $active }) => ($active ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 2px 4px rgba(0, 0, 0, 0.2)')};
  
  &:hover {
    ${({ $active, $color }) => !$active && `
      background: rgba(26, 26, 46, 0.9);
      border-color: rgba(58, 58, 74, 1);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    `}
  }
  
  &:active {
    transform: translateY(0);
  }

  svg {
    font-size: 1rem;
  }
`;

const QuickActionStat = styled.div`
  background: rgba(21, 21, 32, 0.8);
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 1px solid rgba(42, 42, 58, 0.8);
  color: white;
  height: 36px;
  padding: 0 0.85rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
`;

const ActiveCallPanel = styled.div`
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`;

const CallHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const CallIcon = styled.div`
  font-size: 2rem;
`;

const CallInfo = styled.div`
  flex: 1;
`;

const CallTitle = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
  color: #1f2937;
`;

const CallDuration = styled.div`
  color: #6b7280;
`;

const CallControls = styled.div`
  display: flex;
  gap: 1rem;
`;

const CallButton = styled.button`
  flex: 1;
  background: ${props => props.danger ? '#ef4444' : props.muted ? '#6b7280' : '#3b82f6'};
  color: white;
  border: none;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
  }

  svg {
    font-size: 1rem;
  }
`;

const GridLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;

  @media (min-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 1280px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const Section = styled.section`
  background: rgba(21, 21, 32, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(42, 42, 58, 0.8);
  border: 1px solid rgba(42, 42, 58, 0.8);
  transition: all 0.3s ease;
  
  &:hover {
    border-color: rgba(58, 58, 74, 1);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(58, 58, 74, 1);
  }
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(42, 42, 58, 0.8);
`;

const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffffff;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: -0.01em;

  svg {
    color: #a0a0b0;
  }
`;

const Badge = styled.span`
  background: #667eea;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
`;

const BroadcastList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
`;

const SectionSubtext = styled.p`
  margin: 0.25rem 0 0.75rem;
  font-size: 0.85rem;
  color: ${({ $error }) => ($error ? '#dc2626' : '#6b7280')};
`;

const BroadcastItem = styled.div`
  background: ${({ $active, $bgColor }) => {
    if ($active) return 'rgba(16, 185, 129, 0.15)';
    // If bgColor is a light color (like #f9fafb), use dark theme default instead
    const bg = $bgColor || 'rgba(21, 21, 32, 0.6)';
    // Check if it's a light color (hex colors starting with #f, #e, #d, #c, #b, #a, or rgba with high values)
    if (typeof bg === 'string' && (bg.startsWith('#f') || bg.startsWith('#e') || bg.startsWith('#d') || bg.startsWith('#c') || bg.startsWith('#b') || bg.startsWith('#a') || bg.includes('255, 255, 255') || bg.includes('249, 250, 251'))) {
      return 'rgba(21, 21, 32, 0.8)';
    }
    return bg;
  }};
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 2px solid ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.2)')};
  border-radius: 12px;
  padding: 1rem;
  min-height: 72px;
  width: 70%;
  justify-self: start;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: ${({ $active }) => ($active ? '0 4px 12px rgba(16, 185, 129, 0.2), 0 0 0 1px rgba(16, 185, 129, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.3)')};
  color: #ffffff; /* Ensure all text inside is white by default */
  
  &:hover {
    border-color: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.7)' : 'rgba(255, 255, 255, 0.3)')};
    box-shadow: ${({ $active }) => ($active ? '0 6px 16px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(16, 185, 129, 0.4)' : '0 4px 8px rgba(0, 0, 0, 0.4)')};
    transform: translateY(-1px);
  }
`;

const BroadcastHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0rem;
  min-height: 36px;
`;

const BroadcastName = styled.div`
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const BroadcastTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #ffffff;
`;

const BroadcastSubtext = styled.div`
  font-size: 0.85rem;
  color: #a0a0b0;
`;

const BroadcastStats = styled.div`
  display: flex;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: #a0a0b0;
  flex-wrap: nowrap;
`;

const BroadcastStat = styled.div`
  display: flex;
  gap: 0.35rem;
  align-items: baseline;

  strong {
    font-size: 1rem;
    color: #ffffff;
    font-weight: 600;
  }
  
  span {
    color: #a0a0b0;
  }
`;

const OnAirPill = styled.span`
  background: linear-gradient(120deg, #ef4444, #f97316);
  color: white;
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MonitorToggle = styled.button`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: ${({ $active }) => ($active ? '#16a34a' : '#ef4444')};
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.6 : 1};
  transition: transform 0.1s ease, opacity 0.2s ease, background 0.2s ease;

  &:hover {
    transform: ${({ disabled }) => (disabled ? 'none' : 'scale(1.05)')};
  }
`;

const ToggleTrack = styled.span`
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
  background: ${({ $active }) => ($active ? '#22c55e' : '#3a3d44')};
  border-radius: 999px;
  transition: background 0.2s ease;
`;

const ToggleThumb = styled.span`
  position: absolute;
  top: 2px;
  left: ${({ $active }) => ($active ? '20px' : '2px')};
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: left 0.2s ease;
`;

const EndButton = styled.button`
  height: 36px;
  padding: 0 0.75rem;
  border: none;
  border-radius: 8px;
  background: #ef4444;
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);

  &:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(239, 68, 68, 0.4);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
  }
`;

const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const VolumeIcon = styled.div`
  color: #667eea;
`;

const VolumeSlider = styled.input`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  background: #e5e7eb;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #667eea;
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #667eea;
    cursor: pointer;
    border: none;
  }
`;

const VolumeLevel = styled.span`
  font-size: 0.875rem;
  color: #a1a1aa;
  min-width: 40px;
  text-align: right;
`;

const VadMeter = styled.div`
  width: 100%;
  height: 6px;
  background: #1f2937;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.35rem;
`;

const VadFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #10b981, #22d3ee);
  transition: width 100ms linear;
`;

const AddContactButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  background: #3b82f6;
  color: white;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
`;

const ContactActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
`;

const RemoveContactButton = styled.button`
  border: none;
  background: #fee2e2;
  color: #dc2626;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const ContactTabs = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
`;

const ContactTab = styled.button`
  flex: 1;
  border: none;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $active }) => ($active ? '#312e81' : '#e0e7ff')};
  color: ${({ $active }) => ($active ? '#fff' : '#4338ca')};
`;

const ContactForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
  }
`;

const ContactInput = styled.input`
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
  font-size: 0.95rem;
  color: #111827;
`;

const ContactModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
`;

const ContactModalButton = styled.button`
  border: none;
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $variant }) => ($variant === 'secondary' ? '#e5e7eb' : '#312e81')};
  color: ${({ $variant }) => ($variant === 'secondary' ? '#111827' : '#fff')};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
`;

const DirectoryResult = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  margin-bottom: 0.5rem;
`;

const DirectoryAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: #2563eb;
  color: white;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
`;

const PushToTalkButton = styled.button`
  margin-top: 0.35rem;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: none;
  border-radius: 8px;
  height: 36px;
  padding: 0 0.85rem;
  font-weight: 600;
  color: white;
  background: ${({ $speaking }) => ($speaking ? '#dc2626' : '#1f2937')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: transform 0.1s ease, background 0.2s ease;

  &:active {
    transform: ${({ disabled }) => (disabled ? 'none' : 'scale(0.98)')};
  }
`;

const PushToTalkHint = styled.span`
  display: block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: #9ca3af;
`;

const ContactList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
`;

const ContactItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: ${({ $bgColor }) => {
    const bg = $bgColor || 'rgba(21, 21, 32, 0.8)';
    // Check if it's a light color (hex colors starting with #f, #e, #d, #c, #b, #a, or rgba with high values)
    if (typeof bg === 'string' && (bg.startsWith('#f') || bg.startsWith('#e') || bg.startsWith('#d') || bg.startsWith('#c') || bg.startsWith('#b') || bg.startsWith('#a') || bg.includes('255, 255, 255') || bg.includes('249, 250, 251'))) {
      return 'rgba(21, 21, 32, 0.8)';
    }
    return bg;
  }};
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  min-height: 72px;
  width: 70%;
  justify-self: start;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.5 : 1};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: #ffffff; /* Ensure all text inside is white by default */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);

  &:hover {
    background: ${props => props.disabled ? 'rgba(21, 21, 32, 0.8)' : 'rgba(26, 26, 46, 0.9)'};
    border-color: rgba(255, 255, 255, 0.3);
    transform: ${props => props.disabled ? 'none' : 'translateY(-1px)'};
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  }
`;

const ContactAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  position: relative;

  svg {
    font-size: 1.2rem;
  }
`;

const ContactInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

const ContactName = styled.div`
  font-weight: 500;
  color: #ffffff;
  width: 100%;
  text-align: left;
`;

const ContactStatus = styled.div`
  font-size: 0.875rem;
  color: #a0a0b0;
`;

const OnlineBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.5rem;
  background: #16a34a;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  width: 18px;
  height: 18px;
  border-radius: 999px;
`;

const SettingsPanel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
  z-index: 1000;
`;

const SettingsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  h3 {
    margin: 0;
    color: #1f2937;
  }
`;

const SettingsContent = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const SettingsFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0 1.5rem 1.5rem;
`;

const SettingsFooterButton = styled.button`
  border: none;
  border-radius: 10px;
  padding: 0.5rem 1rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $variant }) => ($variant === 'secondary' ? '#1f2937' : '#fff')};
  background: ${({ $variant }) => ($variant === 'secondary' ? '#e5e7eb' : '#312e81')};
`;

const DeviceSelect = styled.select`
  width: 100%;
  padding: 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
`;

const SettingGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const SettingLabel = styled.label`
  display: block;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.5rem;
`;

const SettingInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const StatusSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  background: white;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const EmployeeId = styled.span`
  color: #9ca3af;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  background: #f3f4f6;
  border-radius: 4px;
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ef4444;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #dc2626;
    transform: translateY(-1px);
  }

  svg {
    font-size: 1rem;
  }
`;

const UserDetails = styled.div`
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
`;

const DetailLabel = styled.span`
  color: #6b7280;
  font-weight: 500;
`;

const DetailValue = styled.span`
  color: #1f2937;
  font-family: monospace;
`;

const ForwardUserDisplay = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f0fdf4;
  border: 2px solid #4ade80;
  border-radius: 8px;
`;

const ForwardUserInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  strong {
    color: #1f2937;
  }

  span {
    color: #6b7280;
    font-size: 0.875rem;
  }
`;

const ChangeButton = styled.button`
  background: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #5568d3;
  }
`;

const SelectButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1rem;
  background: #f3f4f6;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
    border-color: #667eea;
    color: #667eea;
  }

  svg {
    font-size: 1.25rem;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  h3 {
    margin: 0;
    color: #1f2937;
  }
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 2px solid #e5e7eb;

  svg {
    color: #9ca3af;
    font-size: 1.25rem;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  font-size: 1rem;
  outline: none;
  color: #1f2937;

  &::placeholder {
    color: #9ca3af;
  }
`;

const ResultsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

const ResultItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f0fdf4;
  }
`;

const ResultInfo = styled.div`
  flex: 1;
`;

const ResultName = styled.div`
  font-weight: 500;
  color: #1f2937;
`;

const ResultDetails = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
`;

export default UserIntercom;

