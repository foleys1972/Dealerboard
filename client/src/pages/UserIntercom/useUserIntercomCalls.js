import { useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const API_BASE = process.env.REACT_APP_API_URL || '';

export function getParticipantId(p) {
  if (p == null) return null;
  if (typeof p === 'string' || typeof p === 'number') return String(p);
  return (
    String(
      p.userId ||
        p.id ||
        p.user?.userId ||
        p.user?.id ||
        p.contactUserId ||
        ''
    ) || null
  );
}

export function formatCallDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/** Cache RTP capabilities for faster WebRTC setup. */
export function useWebRtcPrewarm() {
  useEffect(() => {
    let preWarmTimer;
    const preWarmWebRTC = async () => {
      try {
        const rtpCapabilities = await api.get('/api/webrtc/rtp-capabilities').catch(() => null);
        if (rtpCapabilities?.data) {
          try {
            sessionStorage.setItem(
              'webrtc-rtp-capabilities',
              JSON.stringify(rtpCapabilities.data)
            );
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.warn('Pre-warm WebRTC failed (non-critical):', error);
      }
    };

    preWarmTimer = setTimeout(preWarmWebRTC, 500);
    return () => {
      if (preWarmTimer) clearTimeout(preWarmTimer);
    };
  }, []);
}

export function useAutoAnswerIncomingCalls({ socket, autoAnswer, isInCall, instantConnect }) {
  useEffect(() => {
    if (!socket || !autoAnswer) return undefined;

    const handleIncomingCall = (data) => {
      if (!autoAnswer || isInCall) return;

      const { fromUserId, callId, enableVideo } = data;
      setTimeout(() => {
        instantConnect({
          userId: fromUserId,
          callId,
          enableVideo: enableVideo || false,
          autoAnswer: true,
        });
      }, 100);
    };

    socket.on('call-incoming', handleIncomingCall);
    return () => {
      socket.off('call-incoming', handleIncomingCall);
    };
  }, [socket, autoAnswer, isInCall, instantConnect]);
}

export function useUserIntercomCalls({ authUser, socket, instantConnect, setVideoEnabled }) {
  const startDirectCall = useCallback(
    (contact, enableVideo = false) => {
      if (contact.contactUserId) {
        instantConnect({
          userId: contact.contactUserId,
          enableVideo,
        });
        setVideoEnabled(enableVideo);
        return;
      }

      if (contact.uri) {
        const uri = contact.uri.startsWith('sip:') ? contact.uri : `sip:${contact.uri}`;
        window.location.href = uri;
        return;
      }

      toast.error('No routing information available for this contact');
    },
    [instantConnect, setVideoEnabled]
  );

  const startGroupCall = useCallback(
    async (group) => {
      try {
        let participantIds = [];
        if (Array.isArray(group.participants) && group.participants.length > 0) {
          participantIds = group.participants.map((p) => getParticipantId(p)).filter(Boolean);
        } else {
          const res = await fetch(`${API_BASE}/api/groups/${group.id}/participants`);
          if (res.ok) {
            const data = await res.json();
            const participants = data.participants || data.users || [];
            participantIds = participants.map((p) => getParticipantId(p)).filter(Boolean);
          } else {
            const res2 = await fetch(`${API_BASE}/api/groups/${group.id}`);
            if (res2.ok) {
              const data = await res2.json();
              const participants = data.group?.participants || data.participants || [];
              participantIds = participants.map((p) => getParticipantId(p)).filter(Boolean);
            }
          }
        }

        const selfId = String(authUser?.id || authUser?.userId || '');
        if (selfId) {
          participantIds = participantIds.filter((id) => String(id) !== selfId);
        }

        if (participantIds.length === 0) {
          toast.error('No participants available in this group');
          return;
        }

        let onlineIds = participantIds;
        if (socket) {
          try {
            onlineIds = await new Promise((resolve) => {
              const timeout = setTimeout(() => resolve(participantIds), 700);
              socket.emit('presence-get', (resp) => {
                clearTimeout(timeout);
                const online = (resp?.online || []).map(String);
                resolve(participantIds.filter((id) => online.includes(String(id))));
              });
            });
          } catch {
            onlineIds = participantIds;
          }
        }

        if (onlineIds.length === 0) {
          toast('No online presence detected; attempting all members', { icon: 'ℹ️' });
          onlineIds = participantIds;
        }
        if (onlineIds.length < participantIds.length) {
          toast('Some participants are offline; calling online members only', { icon: 'ℹ️' });
        }

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
    },
    [authUser, socket, instantConnect]
  );

  return { startDirectCall, startGroupCall };
}
