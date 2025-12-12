/**
 * Group Call Manager Hook
 * 
 * Manages group call state and interactions using the subscriber API.
 * Supports FIRST_ANSWER and REMAIN_GROUP modes per spec.
 * 
 * Features:
 * - Initiate group calls via subscriber API
 * - Handle FIRST_ANSWER mode (first answerer wins, others cancelled)
 * - Handle REMAIN_GROUP mode (multiple participants join)
 * - Track call state and participants
 * - Handle WebSocket events for group calls
 * - Cancel group calls
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

const GROUP_CALL_MODES = {
  FIRST_ANSWER: 'FIRST_ANSWER',
  REMAIN_GROUP: 'REMAIN_GROUP'
};

const CALL_STATES = {
  IDLE: 'idle',
  INITIATING: 'initiating',
  RINGING: 'ringing',
  ACTIVE: 'active',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
  ERROR: 'error'
};

export const useGroupCallManager = () => {
  const { socket, isConnected: socketConnected } = useSocket();
  const { user } = useAuthStore();
  
  // Current call state
  const [currentCall, setCurrentCall] = useState(null);
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [participants, setParticipants] = useState([]);
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [firstAnswerer, setFirstAnswerer] = useState(null);
  
  // Refs for cleanup
  const callTimeoutRef = useRef(null);
  const ringTimeoutRef = useRef(null);

  // Initialize WebSocket event listeners
  useEffect(() => {
    if (!socket || !socketConnected) return;

    const handleGroupCallAnswered = (data) => {
      const { sessionId, answeredBy, displayName, action, targetUsers } = data;
      
      if (currentCall?.sessionId === sessionId) {
        if (action === 'cancel-alert') {
          // FIRST_ANSWER mode: Someone else answered first
          if (answeredBy !== user?.id) {
            toast.info(`${displayName} answered the call`);
            setCallState(CALL_STATES.CANCELLED);
            cleanupCall();
          }
        }
      }
    };

    const handleGroupCallParticipantJoined = (data) => {
      const { sessionId, participantUserId, displayName, currentParticipants, topology } = data;
      
      if (currentCall?.sessionId === sessionId) {
        // REMAIN_GROUP mode: New participant joined
        setParticipants(prev => {
          const exists = prev.find(p => p.userId === participantUserId);
          if (exists) return prev;
          return [...prev, {
            userId: participantUserId,
            displayName,
            joinedAt: new Date()
          }];
        });
        
        toast.success(`${displayName} joined the call`);
        
        // Update topology if provided
        if (topology) {
          setCurrentCall(prev => ({ ...prev, topology }));
        }
      }
    };

    const handleGroupCallNoAnswer = (data) => {
      const { sessionId, userId, displayName } = data;
      
      if (currentCall?.sessionId === sessionId) {
        setInvitedUsers(prev => 
          prev.map(u => 
            u.userId === userId 
              ? { ...u, status: 'no-answer', noAnswerAt: new Date() }
              : u
          )
        );
      }
    };

    const handleGroupCallCancelled = (data) => {
      const { sessionId, reason } = data;
      
      if (currentCall?.sessionId === sessionId) {
        toast.info('Group call was cancelled');
        setCallState(CALL_STATES.CANCELLED);
        cleanupCall();
      }
    };

    // Register event listeners
    socket.on('group-call-answered', handleGroupCallAnswered);
    socket.on('group-call-participant-joined', handleGroupCallParticipantJoined);
    socket.on('group-call-no-answer', handleGroupCallNoAnswer);
    socket.on('group-call-cancelled', handleGroupCallCancelled);

    return () => {
      socket.off('group-call-answered', handleGroupCallAnswered);
      socket.off('group-call-participant-joined', handleGroupCallParticipantJoined);
      socket.off('group-call-no-answer', handleGroupCallNoAnswer);
      socket.off('group-call-cancelled', handleGroupCallCancelled);
    };
  }, [socket, socketConnected, currentCall, user]);

  // Cleanup function
  const cleanupCall = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  // Reset call state
  const resetCall = useCallback(() => {
    setCurrentCall(null);
    setCallState(CALL_STATES.IDLE);
    setParticipants([]);
    setInvitedUsers([]);
    setFirstAnswerer(null);
    cleanupCall();
  }, [cleanupCall]);

  /**
   * Initiate a group call
   * @param {Object} params
   * @param {string} params.lineId - Line configuration ID
   * @param {string} params.mode - 'FIRST_ANSWER' or 'REMAIN_GROUP'
   * @param {string[]} params.targetUsers - Array of user IDs to call
   * @param {string} params.initiatorRegion - Region of initiator (optional)
   */
  const initiateGroupCall = useCallback(async (params) => {
    const { lineId, mode, targetUsers, initiatorRegion = 'US' } = params;

    if (!lineId || !mode || !targetUsers || targetUsers.length === 0) {
      toast.error('Missing required parameters for group call');
      return null;
    }

    if (![GROUP_CALL_MODES.FIRST_ANSWER, GROUP_CALL_MODES.REMAIN_GROUP].includes(mode)) {
      toast.error('Invalid group call mode. Use FIRST_ANSWER or REMAIN_GROUP');
      return null;
    }

    if (!user?.id) {
      toast.error('User not authenticated');
      return null;
    }

    try {
      setCallState(CALL_STATES.INITIATING);

      const response = await api.post('/api/group-calls/initiate', {
        lineId,
        mode,
        targetUsers,
        initiatorRegion
      });

      const { sessionId, mode: responseMode, targetCount, instruction } = response.data;

      const newCall = {
        sessionId,
        lineId,
        mode: responseMode,
        initiatorUserId: user.id,
        targetUsers,
        targetCount,
        instruction,
        startTime: new Date(),
        topology: 'pending'
      };

      setCurrentCall(newCall);
      setCallState(CALL_STATES.RINGING);
      setInvitedUsers(targetUsers.map(userId => ({
        userId,
        status: 'ringing',
        invitedAt: new Date()
      })));

      // Set timeout for call (default 30 seconds)
      callTimeoutRef.current = setTimeout(() => {
        if (callState === CALL_STATES.RINGING) {
          toast.error('Group call timed out - no one answered');
          cancelGroupCall(sessionId);
        }
      }, 30000);

      toast.success(`Group call initiated (${mode} mode)`);
      return newCall;
    } catch (error) {
      console.error('Failed to initiate group call:', error);
      toast.error(error.response?.data?.error || 'Failed to initiate group call');
      setCallState(CALL_STATES.ERROR);
      return null;
    }
  }, [user, callState]);

  /**
   * Answer a group call
   * @param {string} sessionId - Call session ID
   * @param {string} answerRegion - Region of answerer (optional)
   */
  const answerGroupCall = useCallback(async (sessionId, answerRegion = 'US') => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return false;
    }

    if (!currentCall || currentCall.sessionId !== sessionId) {
      toast.error('Call session not found');
      return false;
    }

    try {
      const response = await api.post('/api/group-calls/answer', {
        sessionId,
        answerRegion
      });

      const {
        firstAnswerer: isFirstAnswerer,
        cancelOthers,
        otherParticipants,
        topology,
        currentParticipants
      } = response.data;

      if (isFirstAnswerer) {
        setFirstAnswerer(user.id);
        setCallState(CALL_STATES.ACTIVE);
        
        if (cancelOthers) {
          toast.success('You answered first - other participants will be notified');
        }
      } else {
        // REMAIN_GROUP mode: joining existing call
        setCallState(CALL_STATES.ACTIVE);
        toast.success('Joined group call');
      }

      // Update participants
      if (otherParticipants && otherParticipants.length > 0) {
        setParticipants(otherParticipants.map(p => ({
          userId: p.userId,
          displayName: p.displayName,
          joinedAt: new Date(p.joinedAt || new Date())
        })));
      }

      // Update call topology
      if (topology) {
        setCurrentCall(prev => ({ ...prev, topology, currentParticipants }));
      }

      cleanupCall();
      return true;
    } catch (error) {
      console.error('Failed to answer group call:', error);
      toast.error(error.response?.data?.error || 'Failed to answer group call');
      return false;
    }
  }, [user, currentCall, cleanupCall]);

  /**
   * Cancel a group call
   * @param {string} sessionId - Call session ID (optional, uses current call if not provided)
   */
  const cancelGroupCall = useCallback(async (sessionId = null) => {
    const callSessionId = sessionId || currentCall?.sessionId;
    
    if (!callSessionId) {
      toast.error('No active call to cancel');
      return false;
    }

    try {
      await api.post('/api/group-calls/cancel', {
        sessionId: callSessionId,
        reason: 'cancelled-by-user'
      });

      toast.info('Group call cancelled');
      setCallState(CALL_STATES.CANCELLED);
      cleanupCall();
      return true;
    } catch (error) {
      console.error('Failed to cancel group call:', error);
      toast.error(error.response?.data?.error || 'Failed to cancel group call');
      return false;
    }
  }, [currentCall, cleanupCall]);

  /**
   * Get group call status
   * @param {string} sessionId - Call session ID
   */
  const getGroupCallStatus = useCallback(async (sessionId) => {
    try {
      const response = await api.get(`/api/group-calls/status/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get group call status:', error);
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    // State
    currentCall,
    callState,
    participants,
    invitedUsers,
    firstAnswerer,
    isCallActive: callState === CALL_STATES.ACTIVE,
    isCallRinging: callState === CALL_STATES.RINGING,
    
    // Actions
    initiateGroupCall,
    answerGroupCall,
    cancelGroupCall,
    getGroupCallStatus,
    resetCall,
    
    // Constants
    GROUP_CALL_MODES,
    CALL_STATES
  };
};

export default useGroupCallManager;

