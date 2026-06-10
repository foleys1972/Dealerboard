import { useEffect, useCallback, useRef, useState } from 'react';
import { useInstantIntercom } from './useInstantIntercom';
import { useWebRTC } from './useWebRTC';
import { useSocket } from './useSocket';
import { useAuthStore } from '../stores/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * useInstantIntercomWebRTC
 * Integrates instant intercom signaling with MediaSoup WebRTC audio
 * Provides seamless instant audio connections
 */
export const useInstantIntercomWebRTC = () => {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  
  // Instant intercom hook (signaling)
  const instantIntercom = useInstantIntercom();
  const {
    isInCall,
    activeCall,
    participants: instantIntercomParticipants,
    participantCount,
    instantConnect: originalInstantConnect,
    disconnectCall: originalDisconnectCall
  } = instantIntercom;

  // WebRTC hook (audio streaming)
  const webrtc = useWebRTC();
  const {
    device,
    transport,
    producer,
    consumers,
    getUserMedia,
    createTransport,
    startProducing,
    stopProducing,
    initializeMediaSoup
  } = webrtc;

  // Refs
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const outputVolumeRef = useRef(1.0);
  const localStreamRef = useRef(null);
  const pttLatchedRef = useRef(false);
  const [isLatched, setIsLatched] = useState(false);
  const duckedVolumesRef = useRef(new Map());
  const [videoEnabled, setVideoEnabled] = useState(false);
  const videoProducersRef = useRef(new Map()); // callId -> video producer
  const videoConsumersRef = useRef(new Map()); // producerId -> video consumer

  // Recording/mixing
  const mixContextRef = useRef(null);
  const mixDestRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingStartRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  // Simple feature flag: enable/disable call recording without breaking audio
  const isRecordingEnabled = useCallback(() => {
    try {
      const v = localStorage.getItem('enable_call_recording');
      return v === 'true';
    } catch {
      return false;
    }
  }, []);

  // Helpers: convert MediaRecorder blob (webm/opus) → WAV (PCM16 mono)
  const decodeToAudioBuffer = useCallback(async (blob) => {
    try {
      const ac = mixContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuf = await blob.arrayBuffer();
      return await ac.decodeAudioData(arrayBuf);
    } catch (e) {
      console.warn('decodeAudioData failed:', e);
      return null;
    }
  }, []);

  const encodePCM16Wav = useCallback((audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Mixdown to mono
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channelData[ch] = audioBuffer.getChannelData(ch);
    }
    const mono = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) sum += channelData[ch][i] || 0;
      mono[i] = sum / numChannels;
    }

    // Convert float32 [-1,1] to PCM16
    const bytesPerSample = 2;
    const wavBuffer = new ArrayBuffer(44 + mono.length * bytesPerSample);
    const view = new DataView(wavBuffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + mono.length * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate (mono)
    view.setUint16(32, bytesPerSample, true); // block align
    view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, mono.length * bytesPerSample, true);

    let offset = 44;
    for (let i = 0; i < mono.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, mono[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }, []);

  const getAuthHeader = useCallback(() => {
    try {
      const stored = localStorage.getItem('auth-storage');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  }, []);

  const ensureMixGraph = useCallback(() => {
    if (!mixContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      mixContextRef.current = new AC();
    }
    if (!mixDestRef.current && mixContextRef.current) {
      mixDestRef.current = mixContextRef.current.createMediaStreamDestination();
    }
  }, []);

  const connectTrackToMix = useCallback((track) => {
    try {
      ensureMixGraph();
      if (!mixContextRef.current || !mixDestRef.current || !track) {
        console.warn('⚠️ Cannot connect track to mix - missing context, destination, or track');
        return;
      }
      
      // Check if track is already connected (avoid duplicates)
      if (track.__mixSource) {
        console.log('ℹ️ Track already connected to mix, skipping');
        return;
      }
      
      const src = mixContextRef.current.createMediaStreamSource(new MediaStream([track]));
      src.connect(mixDestRef.current);
      
      // Store reference to source for cleanup
      track.__mixSource = src;
      
      console.log('✅ Track connected to mix graph:', track.id, track.kind);
      
      // remember to disconnect when track ends
      track.addEventListener('ended', () => {
        try { 
          if (track.__mixSource) {
            track.__mixSource.disconnect();
            delete track.__mixSource;
          }
        } catch (e) {
          console.warn('Error disconnecting mix source:', e);
        }
      });
    } catch (e) {
      console.error('❌ Mix connect failed:', e, track);
    }
  }, [ensureMixGraph]);

  const startRecording = useCallback(() => {
    try {
      if (!isRecordingEnabled()) {
        console.log('⚠️ Recording not enabled. Set localStorage.setItem("enable_call_recording", "true")');
        return;
      }
      ensureMixGraph();
      if (!mixDestRef.current) {
        console.warn('⚠️ Mix destination not available for recording');
        return;
      }
      const stream = mixDestRef.current.stream;
      
      // Log track count in mix stream
      const tracksInMix = stream.getAudioTracks();
      console.log('🎙️ Starting recording from mix stream with', tracksInMix.length, 'audio track(s)');
      tracksInMix.forEach((track, idx) => {
        console.log(`  Track ${idx + 1}:`, track.id, track.kind, track.enabled ? 'enabled' : 'disabled');
      });
      
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordedChunksRef.current = [];
      
      // Monitor track additions to mix stream
      stream.onaddtrack = (event) => {
        console.log('🎙️ Track added to mix stream:', event.track.id, event.track.kind);
      };
      
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          console.log('📼 Recording data chunk received, size:', e.data.size, 'bytes, total chunks:', recordedChunksRef.current.length);
        }
      };
      mr.onstop = async () => {
        try {
          console.log('📼 MediaRecorder onstop event fired, chunks:', recordedChunksRef.current.length);
          const blob = new Blob(recordedChunksRef.current, { type: mime || 'audio/webm' });
          console.log('📼 Blob created, size:', blob.size, 'bytes');
          recordedChunksRef.current = [];

          // Try to convert to WAV for upload
          let uploadBlob = blob;
          let uploadName = `call_${activeCall?.callId || Date.now()}.webm`;
          console.log('🔄 Attempting to decode audio for WAV conversion...');
          const decoded = await decodeToAudioBuffer(blob);
          if (decoded) {
            console.log('✅ Audio decoded, encoding to WAV...');
            const wavBlob = encodePCM16Wav(decoded);
            if (wavBlob && wavBlob.size > 0) {
              uploadBlob = wavBlob;
              uploadName = `call_${activeCall?.callId || Date.now()}.wav`;
              console.log('✅ WAV encoded, size:', wavBlob.size, 'bytes');
            } else {
              console.warn('⚠️ WAV encoding failed, using original blob');
            }
          } else {
            console.warn('⚠️ Audio decode failed, using original blob');
          }

          const apiBase = process.env.REACT_APP_API_URL || '';
          const fd = new FormData();
          fd.append('file', uploadBlob, uploadName);
          
          // Get participant IDs from multiple sources to ensure we capture everyone
          const participantIdSet = new Set();
          
          console.log('🔍 Collecting participants from:', {
            activeCall: activeCall ? {
              callId: activeCall.callId,
              callerId: activeCall.callerId,
              targetId: activeCall.targetId,
              targetUserId: activeCall.targetUserId,
              participants: activeCall.participants,
              participantsType: typeof activeCall.participants,
              isArray: Array.isArray(activeCall.participants)
            } : 'null',
            instantIntercomParticipants: instantIntercom?.participants,
            consumersCount: consumersRef.current.size,
            currentUser: user?.id || user?.userId
          });
          
          // Add current user
          const currentUserId = String(user?.id || user?.userId || '');
          if (currentUserId) {
            participantIdSet.add(currentUserId);
            console.log('✅ Added current user:', currentUserId);
          }
          
          // Helper function to extract participant ID from various formats
          const extractParticipantId = (p) => {
            if (!p) return null;
            // If it's already a string (just an ID), return it
            if (typeof p === 'string') return p;
            // If it's an object, try to get id or userId
            if (typeof p === 'object') {
              return String(p?.id || p?.userId || p?.user_id || '');
            }
            // If it's a number, convert to string
            if (typeof p === 'number') return String(p);
            return null;
          };
          
          // Add participants from activeCall
          if (Array.isArray(activeCall?.participants)) {
            console.log('📋 Processing activeCall.participants array:', activeCall.participants);
            activeCall.participants.forEach((p, idx) => {
              const pid = extractParticipantId(p);
              if (pid && pid !== 'undefined' && pid !== 'null' && pid.length > 0) {
                participantIdSet.add(pid);
                console.log(`  Added activeCall participant ${idx + 1}:`, pid);
              }
            });
          } else if (activeCall?.participants) {
            console.log('⚠️ activeCall.participants is not an array:', activeCall.participants, typeof activeCall.participants);
          }
          
          // Add participants from instantIntercom hook state
          if (instantIntercomParticipants && Array.isArray(instantIntercomParticipants)) {
            console.log('📋 Processing instantIntercomParticipants state array:', instantIntercomParticipants);
            instantIntercomParticipants.forEach((p, idx) => {
              const pid = extractParticipantId(p);
              if (pid && pid !== 'undefined' && pid !== 'null' && pid.length > 0) {
                participantIdSet.add(pid);
                console.log(`  Added instantIntercom participant ${idx + 1}:`, pid);
              }
            });
          }
          
          // Add participants from consumers (people we're receiving audio from)
          console.log('📋 Processing consumers:', consumersRef.current.size);
          consumersRef.current.forEach((consumer, producerId) => {
            // Try to get userId from consumer metadata if available
            const consumerUserId = consumer?.appData?.userId || consumer?.userId;
            if (consumerUserId) {
              participantIdSet.add(String(consumerUserId));
              console.log(`  Added consumer participant:`, consumerUserId);
            } else {
              console.log(`  Consumer ${producerId} has no userId in appData`);
            }
          });
          
          // Add callerId and targetId if available (these are critical for 1:1 calls)
          if (activeCall?.callerId) {
            const callerId = String(activeCall.callerId);
            participantIdSet.add(callerId);
            console.log('✅ Added callerId:', callerId);
          }
          if (activeCall?.targetId) {
            const targetId = String(activeCall.targetId);
            participantIdSet.add(targetId);
            console.log('✅ Added targetId:', targetId);
          }
          if (activeCall?.targetUserId) {
            const targetUserId = String(activeCall.targetUserId);
            participantIdSet.add(targetUserId);
            console.log('✅ Added targetUserId:', targetUserId);
          }
          
          // For 1:1 calls, if we're the caller, the receiver is targetUserId
          // If we're the receiver, the caller is callerId
          // Make sure we have both sides
          const isOriginator = currentUserId && activeCall?.callerId && String(currentUserId) === String(activeCall.callerId);
          const isReceiver = currentUserId && activeCall?.callerId && String(currentUserId) !== String(activeCall.callerId);
          
          console.log('🔍 Call role detection:', {
            currentUserId,
            callerId: activeCall?.callerId,
            targetUserId: activeCall?.targetUserId,
            isOriginator,
            isReceiver
          });
          
          // If we're the originator and have targetUserId, ensure it's included
          if (isOriginator && activeCall?.targetUserId) {
            const targetId = String(activeCall.targetUserId);
            if (!participantIdSet.has(targetId)) {
              participantIdSet.add(targetId);
              console.log('✅ Added targetUserId (originator perspective):', targetId);
            }
          }
          
          // If we're the receiver, ensure callerId is included (it should be, but double-check)
          if (isReceiver && activeCall?.callerId) {
            const callerId = String(activeCall.callerId);
            if (!participantIdSet.has(callerId)) {
              participantIdSet.add(callerId);
              console.log('✅ Added callerId (receiver perspective):', callerId);
            }
          }
          
          const participantIds = Array.from(participantIdSet).filter(Boolean);
          console.log('👥 Final collected participant IDs for metadata:', participantIds, 'count:', participantIds.length);
          
          // If no participants found, at least include current user
          if (participantIds.length === 0 && currentUserId) {
            participantIds.push(currentUserId);
            console.log('⚠️ No participants found, using current user only:', currentUserId);
          }
          
          // Fetch user information for all participants
          let participantsWithInfo = [];
          try {
            console.log('🔍 Fetching users from API...');
            const usersResponse = await api.get('/api/auth/users');
            const allUsers = usersResponse.data?.users || usersResponse.data || [];
            console.log('✅ Received', allUsers.length, 'users from API');
            
            // Create a map with multiple key formats for each user (string and number versions of ID)
            const userMap = new Map();
            allUsers.forEach(u => {
              // Try multiple ID field names
              const id = u.id || u.userId || u.user_id;
              if (id) {
                const idStr = String(id);
                // Store with both string and number keys for flexible lookup
                userMap.set(idStr, u);
                userMap.set(id, u);
                // Also store without "user-" prefix if present
                if (idStr.startsWith('user-')) {
                  userMap.set(idStr.replace(/^user-/, ''), u);
                }
                if (typeof id === 'string' && !isNaN(Number(id))) {
                  userMap.set(Number(id), u);
                }
                // Store by numeric part if ID is like "user-123456"
                const numericMatch = idStr.match(/user-(\d+)/);
                if (numericMatch) {
                  userMap.set(numericMatch[1], u);
                  userMap.set(Number(numericMatch[1]), u);
                }
              }
            });
            
            console.log('👥 User map created with', userMap.size, 'entries for', allUsers.length, 'users');
            console.log('👥 Sample user from API:', allUsers[0] ? {
              id: allUsers[0].id,
              userId: allUsers[0].userId,
              username: allUsers[0].username,
              sipUri: allUsers[0].sipUri
            } : 'no users');
            
            participantsWithInfo = participantIds.map(participantId => {
              // Try multiple ID formats for matching
              const normalizedId = String(participantId);
              
              console.log(`🔍 Looking up participant ID: "${normalizedId}"`);
              
              // Try multiple lookup strategies
              let participantUser = userMap.get(normalizedId);
              
              if (!participantUser) {
                // Try without "user-" prefix
                if (normalizedId.startsWith('user-')) {
                  const withoutPrefix = normalizedId.replace(/^user-/, '');
                  participantUser = userMap.get(withoutPrefix);
                  console.log(`  Tried without "user-" prefix: "${withoutPrefix}"`, participantUser ? '✅ Found' : '❌ Not found');
                }
              }
              
              if (!participantUser) {
                // Try finding by all possible ID fields
                participantUser = allUsers.find(u => {
                  const uid = String(u.id || u.userId || u.user_id || '');
                  const matches = uid === normalizedId || 
                         uid === participantId ||
                         uid === normalizedId.replace(/^user-/, '') ||
                         (normalizedId.startsWith('user-') && uid === normalizedId);
                  if (matches) {
                    console.log(`  ✅ Found by direct search: uid="${uid}" matches "${normalizedId}"`);
                  }
                  return matches;
                });
              }
              
              if (!participantUser) {
                // Last resort: try partial matching (in case of ID format differences)
                participantUser = allUsers.find(u => {
                  const uid = String(u.id || u.userId || u.user_id || '');
                  // Try matching numeric parts
                  const normalizedNum = normalizedId.replace(/^user-/, '');
                  const uidNum = uid.replace(/^user-/, '');
                  if (normalizedNum === uidNum || normalizedId.includes(uidNum) || uid.includes(normalizedNum)) {
                    console.log(`  ⚠️ Found by partial match: uid="${uid}" vs normalizedId="${normalizedId}"`);
                    return true;
                  }
                  return false;
                });
              }
              
              if (participantUser) {
                // Get username (prioritize username field, remove @ prefix if present)
                let userName = participantUser.username || participantUser.name || null;
                if (userName && userName.startsWith('@')) {
                  userName = userName.substring(1);
                }
                
                // Get URI (prioritize sipUri field)
                const userUri = participantUser.sipUri || participantUser.uri || null;
                
                console.log('✅ Found user info for participant:', participantId, {
                  foundId: participantUser.id || participantUser.userId,
                  userName,
                  uri: userUri,
                  rawUsername: participantUser.username,
                  allFields: Object.keys(participantUser)
                });
                
                // Only include participant if we have at least username or URI
                if (userName || userUri) {
                  return {
                    userId: normalizedId, // Keep for reference but don't display
                    userName: userName,
                    userUri: userUri,
                    userEmail: participantUser.email || null,
                  };
                } else {
                  console.warn('⚠️ Participant found but no username or URI:', participantId, {
                    availableFields: Object.keys(participantUser),
                    userObject: participantUser
                  });
                  return null; // Exclude participants without username/URI
                }
              } else {
                console.warn('⚠️ User not found for participant ID:', participantId, {
                  searchedIds: participantIds,
                  availableUserIds: allUsers.slice(0, 5).map(u => ({
                    id: u.id,
                    userId: u.userId,
                    username: u.username
                  })),
                  userMapKeys: Array.from(userMap.keys()).slice(0, 10)
                });
                return null; // Exclude participants we can't find
              }
            });
            
            // Filter out null entries (participants we couldn't find or don't have username/URI)
            participantsWithInfo = participantsWithInfo.filter(p => p !== null);
            console.log('👥 Participants with info after filtering:', participantsWithInfo.length, participantsWithInfo);
            
            // If we still have no participants with info, try to at least include current user
            if (participantsWithInfo.length === 0 && currentUserId) {
              console.log('⚠️ No participants with info found, trying to add current user manually');
              const currentUserInfo = allUsers.find(u => {
                const uid = String(u.id || u.userId || u.user_id || '');
                return uid === currentUserId || 
                       uid === String(currentUserId) ||
                       (currentUserId.startsWith('user-') && uid === currentUserId.replace(/^user-/, ''));
              });
              
              if (currentUserInfo) {
                let userName = currentUserInfo.username || currentUserInfo.name || null;
                if (userName && userName.startsWith('@')) {
                  userName = userName.substring(1);
                }
                const userUri = currentUserInfo.sipUri || currentUserInfo.uri || null;
                
                if (userName || userUri) {
                  participantsWithInfo.push({
                    userId: currentUserId,
                    userName: userName,
                    userUri: userUri,
                    userEmail: currentUserInfo.email || null,
                  });
                  console.log('✅ Added current user to participants:', { userName, userUri });
                }
              }
            }
          } catch (error) {
            console.error('❌ Failed to fetch participant user info:', error);
            // Fallback: at least try to include current user if we have their info
            if (currentUserId && user) {
              let userName = user.username || user.name || null;
              if (userName && userName.startsWith('@')) {
                userName = userName.substring(1);
              }
              const userUri = user.sipUri || user.uri || null;
              
              if (userName || userUri) {
                participantsWithInfo = [{
                  userId: currentUserId,
                  userName: userName,
                  userUri: userUri,
                  userEmail: user.email || null,
                }];
                console.log('✅ Using current user info as fallback:', { userName, userUri });
              } else {
                // Last resort: just IDs
                participantsWithInfo = participantIds.map(participantId => ({
                  userId: participantId,
                  userName: null,
                  userUri: null,
                  userEmail: null,
                }));
                console.warn('⚠️ Using participant IDs only (no user info available)');
              }
            } else {
              // Last resort: just IDs
              participantsWithInfo = participantIds.map(participantId => ({
                userId: participantId,
                userName: null,
                userUri: null,
                userEmail: null,
              }));
              console.warn('⚠️ Using participant IDs only (no user info available)');
            }
          }
          
          const metadata = {
            callId: activeCall?.callId || null,
            type: activeCall?.type || (activeCall?.isGroupCall ? 'group' : 'direct'),
            groupId: activeCall?.isGroupCall ? (activeCall?.groupId || activeCall?.callId || null) : null,
            participants: participantsWithInfo, // Now includes full user info
            participantIds: participantIds, // Keep IDs for backward compatibility
            startTime: recordingStartRef.current ? new Date(recordingStartRef.current).toISOString() : new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: recordingStartRef.current ? (Date.now() - recordingStartRef.current) : 0,
            userId: user?.id || user?.userId || null,
            userName: user?.username || user?.name || user?.displayName || null,
            userUri: user?.sipUri || null,
            callForward: !!(activeCall?.callForward),
          };
          fd.append('metadata', JSON.stringify(metadata));
          console.log('📤 Uploading recording:', { 
            callId: activeCall?.callId, 
            type: metadata.type, 
            participants: metadata.participants.length,
            duration: metadata.durationMs 
          });
          const uploadResponse = await fetch(`${apiBase}/api/recordings/upload`, {
            method: 'POST',
            headers: { ...getAuthHeader() },
            body: fd,
            credentials: 'include'
          });
          if (uploadResponse.ok) {
            const result = await uploadResponse.json();
            console.log('✅ Recording uploaded successfully:', result);
          } else {
            const error = await uploadResponse.text();
            console.error('❌ Upload recording failed:', uploadResponse.status, error);
          }
        } catch (e) {
          console.error('❌ Finalize recording failed:', e);
        } finally {
          // Clean up after upload completes (or fails)
          mediaRecorderRef.current = null;
          setIsRecording(false);
          recordingStartRef.current = null;
          console.log('🧹 Recording cleanup complete');
        }
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      console.log('🎙️ Recording started');
    } catch (e) {
      console.warn('Start recording failed:', e);
    }
  }, [activeCall, ensureMixGraph, getAuthHeader, user, isRecordingEnabled, decodeToAudioBuffer, encodePCM16Wav]);

  const stopRecording = useCallback(() => {
    try {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        console.log('🛑 Stopping recording, state:', mr.state);
        mr.stop();
        console.log('✅ Recording stop() called, waiting for onstop event...');
      } else {
        console.log('⚠️ No active MediaRecorder to stop:', mr ? mr.state : 'null');
      }
    } catch (e) {
      console.error('❌ Error stopping recording:', e);
    }
    // Don't clear refs here - let onstop handler do it after upload
  }, []);

  // Initialize MediaSoup on mount
  useEffect(() => {
    initializeMediaSoup().catch(err => {
      console.warn('MediaSoup initialization failed, using fallback:', err);
    });
  }, [initializeMediaSoup]);

  // Establish WebRTC connection when call connects
  useEffect(() => {
    if (!isInCall || !activeCall || !device) return;
    if (!socket || !socket.connected) {
      console.warn('⚠️ Socket not connected, cannot setup WebRTC');
      return;
    }

    const setupWebRTC = async () => {
      try {
        const enableVideo = activeCall?.enableVideo || false;
        console.log(`🎤 Setting up WebRTC ${enableVideo ? 'video' : 'audio'} for call:`, activeCall.callId);

        // Get microphone and optionally camera access
        let stream;
        try {
          stream = await getUserMedia({ enableVideo });
          localStreamRef.current = stream;
          setVideoEnabled(enableVideo);
        } catch (mediaError) {
          console.error('Failed to get user media:', mediaError);
          const errorMsg = enableVideo 
            ? 'Camera/microphone access required for video calls' 
            : 'Microphone access required for calls';
          toast.error(errorMsg);
          return;
        }

        // Create send transport (for sending audio/video)
        let sendTransport;
        try {
          sendTransport = await createSendTransport(activeCall.callId);
          sendTransportRef.current = sendTransport;
        } catch (transportError) {
          console.error('Failed to create send transport:', transportError);
          toast.error('Failed to establish connection');
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          return;
        }

        // Start producing audio
        const audioTrack = stream?.getAudioTracks()?.[0];
        if (audioTrack && sendTransport) {
          try {
            await produceAudio(sendTransport, audioTrack, activeCall.callId);
          } catch (produceError) {
            console.error('Failed to produce audio:', produceError);
            toast.error('Failed to start audio transmission');
          }
        } else {
          console.warn('⚠️ No audio track or transport available');
        }

        // Start producing video if enabled
        if (enableVideo) {
          const videoTrack = stream?.getVideoTracks()?.[0];
          if (videoTrack && sendTransport) {
            try {
              await produceVideo(sendTransport, videoTrack, activeCall.callId);
            } catch (produceError) {
              console.error('Failed to produce video:', produceError);
              toast.error('Failed to start video transmission');
              // Continue with audio-only if video fails
            }
          } else {
            console.warn('⚠️ No video track available');
          }
        }

        // Create receive transport (for receiving audio)
        try {
          const recvTransport = await createReceiveTransport(activeCall.callId);
          recvTransportRef.current = recvTransport;
        } catch (recvError) {
          console.error('Failed to create receive transport:', recvError);
          // Continue even if receive transport fails - user can still send audio
        }

        // Connect local audio track to mix graph for recording
        if (audioTrack) {
          try {
            console.log('🎙️ Connecting local track to mix for recording:', audioTrack.id);
            connectTrackToMix(audioTrack);
          } catch (mixError) {
            console.warn('Failed to connect track to mix:', mixError);
            // Continue even if mix connection fails
          }
        } else {
          console.warn('⚠️ No local audio track to connect to mix');
        }

        // Start recording if enabled (after local track is connected)
        // Remote tracks will be connected as they arrive via consumeAudio
        try {
          console.log('🎙️ Starting recording (local track connected, remote tracks will be added as they arrive)');
          startRecording();
        } catch (recordingError) {
          console.warn('Failed to start recording:', recordingError);
          // Continue even if recording fails
        }

        console.log('✅ WebRTC setup complete for call:', activeCall.callId);

      } catch (error) {
        console.error('Failed to setup WebRTC:', error);
        toast.error('Audio setup failed - check microphone permissions');
      }
    };

    setupWebRTC();

    // Cleanup when call ends
    return () => {
      cleanupWebRTC();
    };
  }, [isInCall, activeCall, device, socket, getUserMedia, startRecording, connectTrackToMix]);

  // Auto-latch PTT for originator when in push-to-talk mode
  useEffect(() => {
    try {
      if (!isInCall || !activeCall) return;
      const callerId = activeCall?.callerId ? String(activeCall.callerId) : '';
      const selfId = String(user?.id || user?.userId || '');
      if (!selfId || !callerId) return;
      const isOriginator = selfId === callerId;
      if (isOriginator && instantIntercom?.intercomMode === 'push-to-talk' && !pttLatchedRef.current) {
        instantIntercom.startPTT && instantIntercom.startPTT();
        pttLatchedRef.current = true;
      }
    } catch {}
  }, [isInCall, activeCall, user, instantIntercom]);

  useEffect(() => {
    if (!isInCall && pttLatchedRef.current) {
      pttLatchedRef.current = false;
      setIsLatched(false);
    }
  }, [isInCall]);

  // Keep PTT aligned with latch state
  useEffect(() => {
    if (!isInCall) return;
    if (isLatched) {
      instantIntercom.startPTT && instantIntercom.startPTT();
    } else {
      instantIntercom.stopPTT && instantIntercom.stopPTT();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLatched]);

  // Duck incoming monitor audio while transmitting to reduce feedback on open speakers
  useEffect(() => {
    const isTx = instantIntercom?.isTransmitting;
    try {
      if (isTx) {
        consumersRef.current.forEach((cons, key) => {
          const el = cons && cons.__audioEl;
          if (el && !duckedVolumesRef.current.has(key)) {
            duckedVolumesRef.current.set(key, el.volume);
            try { el.volume = Math.max(0, Math.min(1, (el.volume || 1) * 0.2)); } catch {}
          }
        });
      } else {
        // restore
        consumersRef.current.forEach((cons, key) => {
          const el = cons && cons.__audioEl;
          if (el && duckedVolumesRef.current.has(key)) {
            const prev = duckedVolumesRef.current.get(key);
            try { el.volume = prev; } catch {}
            duckedVolumesRef.current.delete(key);
          }
        });
      }
    } catch {}
    // Also clean up on unmount/end of call
    return () => {
      consumersRef.current.forEach((cons, key) => {
        const el = cons && cons.__audioEl;
        if (el && duckedVolumesRef.current.has(key)) {
          const prev = duckedVolumesRef.current.get(key);
          try { el.volume = prev; } catch {}
          duckedVolumesRef.current.delete(key);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantIntercom?.isTransmitting, isInCall]);

  // Create send transport
  const createSendTransport = async (callId) => {
    try {
      if (!device) throw new Error('Device not initialized');

      // Request transport from server
      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/transport`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ 
          direction: 'send',
          groupId: callId,
          callId
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to create transport');
      }

      const params = await response.json();

      const sendTransport = device.createSendTransport(params);

      // Handle connect event
      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await fetch(`${apiBase}/api/webrtc/transport/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              dtlsParameters
            }),
            credentials: 'include'
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      // Handle produce event
      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const response = await fetch(`${apiBase}/api/webrtc/produce`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              kind,
              rtpParameters,
              groupId: callId,
              appData: {
                ...appData,
                callId,
                userId: user?.id
              }
            }),
            credentials: 'include'
          });

          const { id } = await response.json();
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      return sendTransport;

    } catch (error) {
      console.error('Failed to create send transport:', error);
      throw error;
    }
  };

  // Create receive transport
  const createReceiveTransport = async (callId) => {
    try {
      if (!device) throw new Error('Device not initialized');

      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/transport`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ 
          direction: 'recv',
          groupId: callId,
          callId
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to create receive transport');
      }

      const params = await response.json();

      const recvTransport = device.createRecvTransport(params);

      // Handle connect event
      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await fetch(`${apiBase}/api/webrtc/transport/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              transportId: params.id,
              dtlsParameters
            }),
            credentials: 'include'
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      return recvTransport;

    } catch (error) {
      console.error('Failed to create receive transport:', error);
      throw error;
    }
  };

  // Produce audio
  const produceAudio = async (transport, track, callId) => {
    try {
      const producer = await transport.produce({
        track,
        codecOptions: {
          opusStereo: 1,
          opusFec: 1,
          opusDtx: 1
        },
        appData: {
          userId: user?.id,
          callId
        }
      });

      producersRef.current.set(callId, producer);

      // Handle producer events
      producer.on('transportclose', () => {
        console.log('Producer transport closed');
        producersRef.current.delete(callId);
      });

      producer.on('trackended', () => {
        console.log('Producer track ended');
        producer.close();
        producersRef.current.delete(callId);
      });

      // Notify server that producer is ready
      if (socket) {
        socket.emit('webrtc-producer-ready', {
          callId,
          producerId: producer.id,
          kind: producer.kind
        });
      }

      console.log('✅ Audio producer created:', producer.id);
      return producer;

    } catch (error) {
      console.error('Failed to produce audio:', error);
      throw error;
    }
  };

  // Produce video
  const produceVideo = async (transport, track, callId) => {
    try {
      const producer = await transport.produce({
        track,
        appData: {
          userId: user?.id,
          callId
        }
      });

      videoProducersRef.current.set(callId, producer);

      // Handle producer events
      producer.on('transportclose', () => {
        console.log('Video producer transport closed');
        videoProducersRef.current.delete(callId);
      });

      producer.on('trackended', () => {
        console.log('Video producer track ended');
        producer.close();
        videoProducersRef.current.delete(callId);
      });

      // Notify server that producer is ready
      if (socket) {
        socket.emit('webrtc-producer-ready', {
          callId,
          producerId: producer.id,
          kind: producer.kind
        });
      }

      console.log('✅ Video producer created:', producer.id);
      return producer;

    } catch (error) {
      console.error('Failed to produce video:', error);
      throw error;
    }
  };

  // Consume audio/video from other participants
  const consumeAudio = async (transport, producerId, rtpCapabilities) => {
    try {
      const apiBase = process.env.REACT_APP_API_URL || '';
      const authHeader = (() => {
        try {
          const stored = localStorage.getItem('auth-storage');
          if (!stored) return {};
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      })();
      const response = await fetch(`${apiBase}/api/webrtc/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          transportId: transport.id,
          producerId,
          rtpCapabilities,
          groupId: activeCall?.callId
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to consume');
      }

      const { id, kind, rtpParameters } = await response.json();

      const consumer = await transport.consume({
        id,
        producerId,
        kind,
        rtpParameters
      });

      if (kind === 'video') {
        // Store video consumer
        videoConsumersRef.current.set(producerId, consumer);
        console.log('✅ Video consumer created:', consumer.id);
        
        // Create video stream for display
        const videoStream = new MediaStream([consumer.track]);
        consumer.__videoStream = videoStream;
        
        // Video stream will be accessed via videoConsumers map in the component
        // No need to emit socket event - component can read from videoConsumers
        
        return consumer;
      } else {
        // Audio consumer
        consumersRef.current.set(producerId, consumer);

        // Connect remote audio track to mix graph for recording FIRST
        // This ensures both sides are recorded
        console.log('🎙️ Connecting remote track to mix for recording:', consumer.id);
        connectTrackToMix(consumer.track);

        // Play audio track
        const remoteStream = new MediaStream([consumer.track]);
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.volume = outputVolumeRef.current;
        audio.play().catch(err => console.error('Failed to play audio:', err));

        // Attach audio element reference for volume updates
        consumer.__audioEl = audio;

        console.log('✅ Audio consumer created and connected to mix:', consumer.id);
        return consumer;
      }

    } catch (error) {
      console.error('Failed to consume audio:', error);
      throw error;
    }
  };

  // Cleanup WebRTC resources
  const cleanupWebRTC = () => {
    console.log('🧹 Cleaning up WebRTC resources');

    // Stop recording first
    stopRecording();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all audio producers
    for (const producer of producersRef.current.values()) {
      producer.close();
    }
    producersRef.current.clear();

    // Close all video producers
    for (const producer of videoProducersRef.current.values()) {
      producer.close();
    }
    videoProducersRef.current.clear();

    // Close all audio consumers
    for (const consumer of consumersRef.current.values()) {
      consumer.close();
    }
    consumersRef.current.clear();

    // Close all video consumers
    for (const consumer of videoConsumersRef.current.values()) {
      consumer.close();
    }
    videoConsumersRef.current.clear();

    // Reset video state
    setVideoEnabled(false);

    // Close transports
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
  };

  // Listen for new producers (other participants)
  useEffect(() => {
    if (!socket || !isInCall || !activeCall) return;

    const handleNewProducer = async (data) => {
      const { producerId, userId } = data;
      // Normalize ids and ignore our own producer
      const selfId = String(user?.id || user?.userId || '');
      const prodUserId = String(userId || '');
      if (selfId && prodUserId && selfId === prodUserId) {
        return;
      }

      console.log('🔊 New audio producer from:', userId);

      try {
        if (recvTransportRef.current && device) {
          await consumeAudio(recvTransportRef.current, producerId, device.rtpCapabilities);
        }
      } catch (error) {
        console.error('Failed to consume audio from', userId, error);
      }
    };

    const handleProducerClosed = (data) => {
      const { producerId } = data;
      const consumer = consumersRef.current.get(producerId);
      if (consumer) {
        consumer.close();
        consumersRef.current.delete(producerId);
      }
    };

    socket.on('new-producer', handleNewProducer);
    socket.on('producer-closed', handleProducerClosed);

    return () => {
      socket.off('new-producer', handleNewProducer);
      socket.off('producer-closed', handleProducerClosed);
    };
  }, [socket, isInCall, activeCall, device, user]);


  // Integrated instant connect with WebRTC - optimized for instant setup
  const instantConnectWithAudio = useCallback(async (targetData) => {
    try {
      if (!targetData) {
        toast.error('Invalid call target');
        return;
      }

      const enableVideo = targetData.enableVideo || false;
      
      // Start signaling and media access in parallel for instant setup
      const connectPromise = originalInstantConnect({
        ...targetData,
        enableVideo
      });
      
      const mediaPromise = getUserMedia({ enableVideo }).catch(mediaError => {
        console.error('Media access denied:', mediaError);
        const errorMsg = enableVideo 
          ? 'Camera/microphone access required for video calls' 
          : 'Microphone access required for calls';
        toast.error(errorMsg);
        throw mediaError;
      });
      
      // Wait for both in parallel - this speeds up call setup
      const [stream] = await Promise.all([mediaPromise, connectPromise]);
      
      // Store stream immediately for use in useEffect
      if (stream) {
        localStreamRef.current = stream;
      }
      
      // WebRTC setup happens automatically in useEffect
      console.log('✅ Call connection established instantly');
      
    } catch (error) {
      console.error('Failed to connect with media:', error);
      const errorMessage = error.message || 'Failed to connect';
      if (!errorMessage.includes('access')) {
        toast.error(errorMessage);
      }
      // Clean up any partial setup
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      throw error;
    }
  }, [originalInstantConnect, getUserMedia]);

  // Integrated disconnect with WebRTC cleanup
  const disconnectWithAudio = useCallback(() => {
    // Disconnect signaling
    originalDisconnectCall();
    
    // WebRTC cleanup happens automatically in useEffect
  }, [originalDisconnectCall]);

  // First responder drop-to-1:1: originator receives responder and starts a direct call
  useEffect(() => {
    if (!socket) return;
    const onFirstResponder = async ({ callId, responderId }) => {
      try {
        // Only originator should act
        const callerId = activeCall?.callerId ? String(activeCall.callerId) : '';
        const selfId = String(user?.id || user?.userId || '');
        if (!selfId || !callerId || selfId !== callerId) return;

        // Disconnect current group call
        originalDisconnectCall();
        // Start direct 1:1
        await instantConnectWithAudio({ userId: responderId });
      } catch (e) {
        console.error('Failed to drop to 1:1:', e);
        toast.error('Failed to switch to 1:1');
      }
    };
    socket.on('first-responder-selected', onFirstResponder);
    return () => {
      socket.off('first-responder-selected', onFirstResponder);
    };
  }, [socket, activeCall, user, originalDisconnectCall, instantConnectWithAudio]);

  // Return combined interface
  return {
    // From instant intercom
    ...instantIntercom,
    
    // From WebRTC
    device,
    localStream: localStreamRef.current,
    producers: producersRef.current,
    consumers: consumersRef.current,
    
    // Integrated actions
    instantConnect: instantConnectWithAudio,
    disconnectCall: disconnectWithAudio,
    
    // Audio control
    toggleMute: webrtc.toggleMute,
    toggleUnmute: webrtc.toggleUnmute,
    isMuted: webrtc.isMuted,
    audioLevel: webrtc.audioLevel,
    outputVolume: outputVolumeRef.current,
    setOutputVolume: (v) => {
      const vol = Math.max(0, Math.min(1, Number(v) || 0));
      outputVolumeRef.current = vol;
      // Apply to all current consumer audio elements
      consumersRef.current.forEach((consumer) => {
        try {
          const track = consumer.track;
          // find associated audio by scanning document media elements (best-effort)
          // This is a heuristic; we also store audio on consumer map entry when available
        } catch {}
      });
      // Better: store audio elements alongside consumers
      consumersRef.current.forEach((cons) => {
        if (cons && cons.__audioEl) {
          try { cons.__audioEl.volume = vol; } catch {}
        }
      });
    },
    isLatched,
    togglePTTLatch: () => setIsLatched(prev => !prev),
    startPTT: instantIntercom.startPTT,
    stopPTT: instantIntercom.stopPTT,
  };
};

