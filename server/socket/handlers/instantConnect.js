const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachInstantConnectHandlers(SocketHandler) {
  SocketHandler.prototype.handleInstantConnect = async function(socket, data) {
    try {
      // Socket.IO servers can receive event args as an array (client emit with multiple args)
      // or as a JSON string depending on client implementation.
      let payload = data;
      try {
        if (Array.isArray(payload)) {
          payload = payload.length > 0 ? payload[0] : {};
        }
        if (typeof payload === 'string') {
          payload = JSON.parse(payload);
        }
      } catch {
        // Keep the original payload if parsing fails.
      }

      const { targetUserId, targetUserIds, groupId, isGroupCall, audioMode, policy, enableVideo, toUri, fromUri, groupUri } = payload || {};
      const callerId = socket.userId;
      const callId = `instant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const callKey = this.getScopedCallKey(socket, callId);

      // Resolve targets that may be passed as username instead of DB id
      const { getUserByIdOrUsername } = require('../../services/databaseService');

      let resolvedTargetUserId = targetUserId;
      // URI-first: if toUri is provided, derive the target username for socket lookup.
      if (!isGroupCall && toUri && !resolvedTargetUserId) {
        const u = this._extractUsernameFromUri(toUri);
        resolvedTargetUserId = u || String(toUri);
      }
      let callForwardInfo = null;
      if (!isGroupCall && targetUserId) {
        try {
          const user = await getUserByIdOrUsername(String(targetUserId));
          // Socket lookup keys are session.username (preferred) and session.userId.
          // In this app, session.userId is often the legacy id (username) for compatibility,
          // while DB ids can differ. Prefer username to ensure getUserSockets() finds targets.
          if (user?.username) {
            resolvedTargetUserId = user.username;
          } else if (user?.id) {
            resolvedTargetUserId = user.id;
          }

          // Immediate call forward (username) for direct calls.
          try {
            const cf = user?.settings?.callForward;
            const enabled = Boolean(cf?.enabled);
            const cond = String(cf?.condition || 'immediate').toLowerCase();
            const forwardTo = (cf?.forwardToUserId || '').toString().trim();
            if (enabled && cond === 'immediate' && forwardTo) {
              const originalTarget = resolvedTargetUserId;
              const fwdUser = await getUserByIdOrUsername(forwardTo);
              const fwdKey = fwdUser?.username || fwdUser?.id || forwardTo;
              logger.info(`instant-connect: call forward immediate enabled. target=${String(resolvedTargetUserId)} -> forwardTo=${String(fwdKey)}`);
              resolvedTargetUserId = fwdKey;

              callForwardInfo = {
                enabled: true,
                forwardedFrom: originalTarget,
                forwardedTo: fwdKey,
                forwardedToDbId: fwdUser?.id || null,
                forwardedToUsername: fwdUser?.username || null,
              };
            }
          } catch {}
        } catch (e) {
          logger.warn(`instant-connect: failed to resolve targetUserId "${targetUserId}"`, e?.message || e);
        }
      }

      let resolvedTargetUserIds = targetUserIds;
      if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        const out = [];
        for (const t of targetUserIds) {
          try {
            const user = await getUserByIdOrUsername(String(t));
            out.push(user?.username ? user.username : (user?.id ? user.id : String(t)));
          } catch {
            out.push(String(t));
          }
        }
        resolvedTargetUserIds = out;
      }

      // Check if socket is connected
      if (!socket.connected) {
        logger.warn(`Socket ${socket.id} not connected when trying to start call`);
        socket.emit('instant-error', { message: 'Socket not connected. Please reconnect and try again.' });
        return;
      }

      if (!callerId) {
        socket.emit('instant-error', { message: 'Not authenticated' });
        return;
      }
      
      // Clean up any stale call state for this user (in case of previous failed/disconnected calls)
      this.cleanupStaleCallState(
        callerId,
        socket.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default',
        socket.subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default'
      );

      logger.info(`Instant connect: ${callerId} → ${resolvedTargetUserId || groupId}`);

      let resolvedGroupCallMode = null;
      let groupName = null;
      if (isGroupCall && groupId && this.groupService) {
        try {
          if (this.groupService.initialize) {
            await this.groupService.initialize();
          }
          const g = this.groupService.getGroup?.(groupId);
          groupName = g?.name || null;
          // callMode values in DB/service: FIRST_ANSWER, REMAIN_GROUP, broadcast
          resolvedGroupCallMode = g?.callMode || null;
        } catch (e) {
          logger.warn(`instant-connect: failed to resolve group callMode for ${groupId}`, e?.message || e);
        }
      }

      // Initialize call session
      const callSession = {
        callId,
        callKey,
        tenantId: socket.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default',
        subTenantId: socket.subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default',
        callerId,
        callerSocketId: socket.id,
        fromUri: fromUri || socket.uri || null,
        targetUserId: resolvedTargetUserId || null, // Store targetUserId for 1:1 calls
        originalTargetUserId: callForwardInfo?.forwardedFrom || null,
        callForward: callForwardInfo,
        toUri: toUri || null,
        targetUserIds: resolvedTargetUserIds || null, // Store targetUserIds for group calls
        type: isGroupCall ? 'group' : 'direct',
        groupId,
        groupUri: groupUri || null,
        config: {
          audioMode: audioMode === 'open' ? 'open' : 'ptt',
          enableVideo: enableVideo === true,
          policy: policy
            ? (policy === 'FIRST_ANSWER' ? 'FIRST_ANSWER' : 'REMAIN_GROUP')
            : (resolvedGroupCallMode === 'FIRST_ANSWER' ? 'FIRST_ANSWER' : 'REMAIN_GROUP'),
        },
        participants: new Map(),
        ringingTargets: new Map(),
        winnerUserId: null,
        startTime: new Date(),
        audioLevels: new Map(),
        silenceTimer: null
      };

      // Determine target user(s) - prefer explicit targets if provided
      let targets = [];
      if (Array.isArray(resolvedTargetUserIds) && resolvedTargetUserIds.length > 0) {
        targets = resolvedTargetUserIds;
      } else if (isGroupCall && groupId) {
        // Get group members
        let memberList = [];
        try {
          if (this.groupService && this.groupService.initialize) {
            await this.groupService.initialize();
          }
          const g = this.groupService?.getGroup?.(groupId);
          const fromParticipants = g?.participants
            ? (Array.isArray(g.participants) ? g.participants : Array.from(g.participants))
            : [];
          memberList = fromParticipants;
        } catch (e) {
          logger.warn(`instant-connect: failed to resolve group participants for ${groupId}`, e?.message || e);
        }
        targets = memberList;
      } else if (resolvedTargetUserId) {
        targets = [resolvedTargetUserId];
      }

      // Never target the caller; a call with only the caller should not be considered established.
      try {
        const callerKey = String(callerId || '').toLowerCase();
        targets = (targets || []).filter(t => {
          const s = String(t || '').toLowerCase();
          return s && s !== callerKey;
        });
      } catch {}

      if (!Array.isArray(targets) || targets.length === 0) {
        socket.emit('instant-error', { message: 'No target users found for call' });
        return;
      }

      // Check DND and admin override
      const callerSession = this.userSessions.get(socket.id);
      const isAdmin =
        callerSession?.role === 'platform_admin' ||
        callerSession?.role === 'tenant_admin' ||
        callerSession?.role === 'admin';

      // Send instant connection to all targets
      const attempted = [];
      const matched = [];
      let directBlocked = null;
      for (const userId of targets) {
        const targetSockets = this.getUserSockets(userId);
        attempted.push(String(userId));

        // For direct calls, if the target has no connected sockets, treat as offline.
        if (!isGroupCall && (!targetSockets || targetSockets.length === 0)) {
          let reason = 'offline';
          let message = 'User is offline';
          try {
            const dbUser = await getUserByIdOrUsername(String(userId));
            const isDnd = Boolean(dbUser?.settings?.dnd);
            if (isDnd && !isAdmin) {
              reason = 'dnd';
              message = 'User has Do Not Disturb enabled';
            }
          } catch {}

          directBlocked = { callId, userId, reason, message };
          continue;
        }
        
        for (const targetSocket of targetSockets) {
          const targetSession = this.userSessions.get(targetSocket.id);
          matched.push(String(userId));
          
          // Check DND
          if (targetSession?.dnd && !isAdmin) {
            logger.info(`Target ${userId} is DND, blocked`);
            // For direct calls: mark blocked and let the post-loop handler emit once and end the call.
            // For group calls: skip this target and continue inviting others.
            if (!isGroupCall) {
              directBlocked = { callId, userId, reason: 'dnd', message: 'User has Do Not Disturb enabled' };
            }
            continue;
          }

          // Check if user is already in a call
          const userInCall = this.isUserInCall(userId);
          if (userInCall) {
            const blockWhenBusy = targetSession?.settings?.blockCallsWhenBusy;
            const allowMultiple = targetSession?.settings?.allowMultipleCalls !== false;
            const maxCalls = targetSession?.settings?.maxSimultaneousCalls || 3;
            const currentCallCount = this.getUserCallCount(userId);

            // If user blocks calls when busy and is in a call
            if (blockWhenBusy && !isAdmin) {
              logger.info(`Target ${userId} is busy and blocks incoming calls`);
              
              if (isGroupCall) {
                // For group calls: notify the BUSY user so they get a toast/alert without joining the call.
                try {
                  targetSocket.emit('instant-blocked', {
                    userId: callerId,
                    callerId,
                    callId,
                    reason: 'busy',
                    message: 'You are on another call and cannot join this group call'
                  });
                } catch {}
                try {
                  this.addMissedCall(String(userId), {
                    id: `${callId}-${userId}`,
                    fromUserId: callerId,
                    at: new Date().toISOString(),
                    type: 'group',
                    reason: 'busy'
                  });
                } catch {}
              } else {
                // For 1-to-1 calls: notify caller.
                directBlocked = { callId, userId, reason: 'busy', message: 'User is on another call and not accepting new calls' };
              }
              continue;
            }

            // If user allows multiple but has reached max
            if (!allowMultiple || (allowMultiple && currentCallCount >= maxCalls)) {
              logger.info(`Target ${userId} has reached maximum simultaneous calls (${currentCallCount}/${maxCalls})`);
              
              if (isGroupCall) {
                try {
                  targetSocket.emit('instant-blocked', {
                    userId: callerId,
                    callerId,
                    callId,
                    reason: 'max-calls-reached',
                    message: `You are on ${currentCallCount} calls (maximum: ${maxCalls}) and cannot join this group call`
                  });
                } catch {}
                try {
                  this.addMissedCall(String(userId), {
                    id: `${callId}-${userId}`,
                    fromUserId: callerId,
                    at: new Date().toISOString(),
                    type: 'group',
                    reason: 'max-calls-reached'
                  });
                } catch {}
              } else {
                directBlocked = { callId, userId, reason: 'max-calls-reached', message: `User is on ${currentCallCount} calls (maximum: ${maxCalls})` };
              }
              continue;
            }

            // If admin, show override notification
            if (isAdmin) {
              targetSocket.emit('instant-busy-override', {
                callId,
                callerId,
                callerName: callerSession?.displayName || callerSession?.username || 'Admin',
                message: 'ADMIN OVERRIDE - You are busy but admin is connecting',
                currentCalls: currentCallCount
              });
            }
          }

          // DND Override notification
          if (targetSession?.dnd && isAdmin) {
            targetSocket.emit('instant-admin-override', {
              callId,
              callerId,
              callerName: callerSession?.displayName || callerSession?.username || 'Admin',
              message: 'ADMIN OVERRIDE - Emergency Connection'
            });
          }

          // Send instant connection (ring)
          targetSocket.emit('instant-incoming', {
            callId,
            callerId,
            callerName: callerSession?.displayName || callerSession?.username || 'Unknown',
            callerRole: callerSession?.role,
            isGroupCall,
            groupId,
            groupName: isGroupCall ? groupName : null,
            enableVideo: callSession.config.enableVideo
          });

          // For group calls we wait for instant-accept.
          // Track who is ringing so we can cancel losers in FIRST_ANSWER mode.
          if (isGroupCall) {
            callSession.ringingTargets.set(String(userId), {
              socketId: targetSocket.id,
              userId,
              invitedAt: new Date(),
            });
          } else {
            // Direct call: auto-accept.
            callSession.participants.set(userId, {
              socketId: targetSocket.id,
              userId,
              joinedAt: new Date(),
              audioLevel: 0
            });
          }
        }
      }

      // For direct calls, if the target was blocked (DND/offline/busy/max-calls), do not create/store a call session.
      // Emit instant-blocked and auto-end/disconnect after 5 seconds so the caller UI clears.
      if (!isGroupCall && directBlocked) {
        try {
          if (directBlocked.reason === 'dnd') {
            try {
              socket.emit('instant-dnd', {
                callId,
                userId: directBlocked.userId,
                reason: 'dnd',
                message: directBlocked.message || 'User has Do Not Disturb enabled',
              });
            } catch {}
          }
          socket.emit('instant-blocked', directBlocked);
        } catch {}
        try {
          setTimeout(() => {
            try { socket.emit('instant-ended', { callId, reason: directBlocked.reason || 'blocked' }); } catch {}
            try { socket.emit('instant-disconnected', { callId, reason: directBlocked.reason || 'blocked' }); } catch {}
          }, 5000);
        } catch {}
        return;
      }

      // For direct calls, if no callee was added as a participant (e.g. all sockets skipped), treat as unreachable.
      if (!isGroupCall && callSession.participants.size === 0) {
        try {
          socket.emit('instant-error', { message: 'Target user not reachable', attempted, matched });
        } catch {}
        return;
      }

      // If no sockets were found for any targets, notify caller
      const anyFound = targets.some(uid => this.getUserSockets(uid).length > 0);
      if (!anyFound) {
        try {
          logger.warn(
            `instant-connect unreachable: caller=${callerId} isGroupCall=${Boolean(isGroupCall)} targetUserId=${String(targetUserId || '')} resolvedTargetUserId=${String(resolvedTargetUserId || '')} groupId=${String(groupId || '')} targets=${JSON.stringify(targets)} payload=${JSON.stringify(payload)}`
          );
        } catch {}
        // Log missed for each target
        for (const t of targets) {
          this.addMissedCall(t, {
            id: `${callId}-${t}`,
            fromUserId: callerId,
            at: new Date().toISOString(),
            type: isGroupCall ? 'group' : 'direct',
            reason: 'unreachable'
          });
        }
        socket.emit('instant-error', { message: 'Target user not reachable', attempted, matched });
        return;
      }

      // Add caller to participants
      callSession.participants.set(callerId, {
        socketId: socket.id,
        userId: callerId,
        joinedAt: new Date(),
        audioLevel: 0
      });

      // Store call session
      this.activeRooms.set(callKey, callSession);

      // Persist call session to DB so recordings can derive duration/participants.
      try {
        const { createCallSession, updateCallSession, getCallSession } = require('../../services/databaseService');
        const nowIso = new Date().toISOString();

        const initialParticipants = [];
        initialParticipants.push({ userId: callerId, role: 'initiator', joinTime: nowIso });

        const targetList = Array.from(callSession.participants.keys()).filter(p => String(p) !== String(callerId));
        const firstAnswererUserId = targetList.length > 0 ? targetList[0] : null;
        if (targetList.length > 0) {
          // For direct calls, the first target is the answerer.
          const first = targetList[0];
          initialParticipants.push({ userId: first, role: 'answerer', joinTime: nowIso });
          for (const t of targetList.slice(1)) {
            initialParticipants.push({ userId: t, role: 'participant', joinTime: nowIso });
          }
        }

        const payload = {
          sessionId: callId,
          lineId: callSession.groupId || callSession.originalTargetUserId || callSession.targetUserId || callId,
          lineType: isGroupCall ? 'GROUP' : 'INTERCOM',
          initiatorUserId: callerId,
          groupMode: callSession.config?.policy || null,
          status: 'active',
          topologyType: isGroupCall ? 'single-room' : 'P2P',
          participants: initialParticipants,
          invitedNoAnswer: [],
          rooms: [],
          bridges: [],
          sessionMetadata: {
            answeredAt: nowIso,
            connectedAt: nowIso,
            type: callSession.type,
            reason: 'instant-connect',
            callForwarded: Boolean(callSession.callForward?.enabled),
            forwardedFrom: callSession.callForward?.forwardedFrom || null,
            forwardedTo: callSession.callForward?.forwardedTo || null,
            forwardedToUsername: callSession.callForward?.forwardedToUsername || null,
            forwardedToDbId: callSession.callForward?.forwardedToDbId || null,
          }
        };

        try {
          await createCallSession(payload);
        } catch {
          // If it already exists, update it.
          const existing = await getCallSession(callId);
          const mergedMeta = { ...(existing?.sessionMetadata || {}), ...(payload.sessionMetadata || {}) };
          await updateCallSession(callId, {
            status: 'active',
            topologyType: payload.topologyType,
            participants: payload.participants,
            sessionMetadata: mergedMeta,
            firstAnswererUserId: firstAnswererUserId || existing?.firstAnswererUserId || null,
          });
        }

        // Ensure first_answerer_user_id is set when we can infer it (direct calls)
        if (firstAnswererUserId) {
          try {
            await updateCallSession(callId, { firstAnswererUserId });
          } catch {}
        }
      } catch (e) {
        logger.warn(`instant-connect: failed to persist call session ${callId}`, e?.message || e);
      }

      // Notify caller that dialing/ringing has started.
      // For direct calls, participants already includes caller+callee.
      // For group calls, participants initially contains only caller (until someone accepts).
      socket.emit('instant-connected', {
        callId,
        callerId,
        targetUserId: callSession.targetUserId,
        targetUserIds: callSession.targetUserIds,
        participants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size,
        config: callSession.config,
        type: callSession.type,
        groupId: callSession.groupId,
        enableVideo: callSession.config.enableVideo,
      });

      // For direct calls, we can start media immediately.
      if (!isGroupCall) {
        this.broadcastToCall(callKey, 'instant-call-active', {
          callId,
          callerId,
          targetUserId: callSession.targetUserId,
          targetUserIds: callSession.targetUserIds,
          participants: Array.from(callSession.participants.keys()),
          participantCount: callSession.participants.size,
          config: callSession.config,
          type: callSession.type,
          groupId: callSession.groupId,
          enableVideo: callSession.config.enableVideo,
        });

        this.broadcastToCall(callKey, 'webrtc-setup-required', {
          callId,
          participants: Array.from(callSession.participants.keys())
        });
      }

      // If this is a group call and we're on a subscriber server, handle subscriber audio routing
      if (isGroupCall && groupId && this.subscriberAudioRouting) {
        try {
          await this.subscriberAudioRouting.handleUserJoinGroupCall(
            callerId,
            groupId
          );
        } catch (error) {
          logger.error(`Failed to handle subscriber audio routing for group call: ${error.message}`, error);
        }
      }

      // Start silence detection timer
      this.startSilenceDetection(callKey);

      logger.info(`Instant call established: ${callId} with ${callSession.participants.size} participants`);

    } catch (error) {
      logger.error('Instant connect error:', error);
      socket.emit('instant-error', { message: 'Failed to establish connection', error: error.message });
    }
  }

  SocketHandler.prototype.handleInstantAccept = async function(socket, data) {
    try {
      const { callId } = data || {};
      const userId = socket.userId;
      if (!callId || !userId) {
        return;
      }

      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId) || this.getScopedCallKey(socket, callId);
      const callSession = callKey ? this.activeRooms.get(callKey) : null;
      if (!callSession) {
        return;
      }

      logger.info(`Instant accept: ${userId} accepted ${callId}`);

      // If this is a FIRST_ANSWER group call and we already have a winner, reject late joiners.
      const isFirstAnswer = callSession?.config?.policy === 'FIRST_ANSWER';
      if (isFirstAnswer && callSession.winnerUserId && String(callSession.winnerUserId) !== String(userId)) {
        socket.emit('instant-ended', { callId, reason: 'answered-by-someone-else' });
        socket.emit('instant-disconnected', { callId, reason: 'answered-by-someone-else' });
        return;
      }

      // Add acceptor as participant (if not already)
      if (!callSession.participants.has(String(userId))) {
        callSession.participants.set(String(userId), {
          socketId: socket.id,
          userId: String(userId),
          joinedAt: new Date(),
          audioLevel: 0,
        });
      }

      // Remove from ringingTargets if present
      try { callSession.ringingTargets?.delete?.(String(userId)); } catch {}

      // FIRST_ANSWER: lock winner and cancel everybody else still ringing.
      if (isFirstAnswer && !callSession.winnerUserId) {
        callSession.winnerUserId = String(userId);

        // Cancel remaining ringing targets
        try {
          const losers = Array.from(callSession.ringingTargets?.values?.() || []);
          for (const loser of losers) {
            const s = this.io.sockets.sockets.get(loser.socketId);
            if (s) {
              s.emit('instant-ended', { callId, reason: 'answered-by-someone-else' });
              s.emit('instant-disconnected', { callId, reason: 'answered-by-someone-else' });
            }
          }
        } catch {}

        // Ensure participants are only caller + winner
        try {
          for (const pid of Array.from(callSession.participants.keys())) {
            if (String(pid) === String(callSession.callerId)) continue;
            if (String(pid) === String(callSession.winnerUserId)) continue;
            callSession.participants.delete(pid);
          }
        } catch {}
      }

      // Notify acceptor
      socket.emit('instant-accepted', { callId });

      // Once we have at least caller + one acceptor, activate the call and start media.
      if (callSession.participants.size >= 2) {
        this.broadcastToCall(callKey, 'instant-call-active', {
          callId,
          callerId: callSession.callerId,
          targetUserId: callSession.targetUserId,
          targetUserIds: callSession.targetUserIds,
          participants: Array.from(callSession.participants.keys()),
          participantCount: callSession.participants.size,
          config: callSession.config,
          type: callSession.type,
          groupId: callSession.groupId,
          enableVideo: callSession.config.enableVideo,
        });

        this.broadcastToCall(callKey, 'webrtc-setup-required', {
          callId,
          participants: Array.from(callSession.participants.keys())
        });
      }
    } catch (error) {
      logger.error('Instant accept error:', error);
    }
  }

  SocketHandler.prototype.handleInstantReject = async function(socket, data) {
    try {
      const { callId, reason } = data;
      const userId = socket.userId;
      
      logger.info(`Instant reject: ${userId} rejected ${callId}, reason: ${reason}`);

      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      const callSession = this.activeRooms.get(callKey);
      if (!callSession) {
        return;
      }

      // Remove user from participants
      callSession.participants.delete(userId);

      // Notify caller
      const callerSocket = this.io.sockets.sockets.get(callSession.callerSocketId);
      if (callerSocket) {
        callerSocket.emit('instant-rejected', {
          callId,
          userId,
          reason
        });
      }

      // Notify user
      socket.emit('instant-disconnected', {
        callId,
        reason: 'rejected'
      });

      // If no participants left, end call
      if (callSession.participants.size <= 1) {
        this.endInstantCall(callKey, 'all-rejected');
      }

    } catch (error) {
      logger.error('Instant reject error:', error);
    }
  }

  SocketHandler.prototype.handleInstantDisconnect = async function(socket, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;
      
      logger.info(`Instant disconnect: ${userId} from ${callId}`);

      // Robust resolution: if callId is empty/pending/mismatched, resolve by active participant membership.
      let callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey && callId) {
        callKey = this.getScopedCallKey(socket, callId);
      }

      let callSession = callKey ? this.activeRooms.get(callKey) : null;
      if (!callSession) {
        // Retry by user membership (covers pending/empty callIds).
        callKey = this.resolveInstantCallKeyForUser(socket, null, userId);
        callSession = callKey ? this.activeRooms.get(callKey) : null;
      }

      if (!callSession || !callKey) {
        return;
      }

      // Remove user from participants
      callSession.participants.delete(userId);

      // Notify all remaining participants
      this.broadcastToCall(callKey, 'participant-left', {
        callId,
        userId,
        remainingParticipants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size
      });

      // Notify all remaining participants that this call was disconnected by a participant.
      // Some clients rely on instant-disconnected/instant-ended rather than participant-left.
      this.broadcastToCall(callKey, 'instant-disconnected', {
        callId,
        userId,
        reason: 'user-disconnect',
        remainingParticipants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size
      });

      // Notify disconnecting user
      socket.emit('instant-disconnected', {
        callId,
        reason: 'user-disconnect'
      });

      // If only one (or zero) participants remain, end the call and notify everyone.
      if (callSession.participants.size <= 1) {
        this.endInstantCall(callKey, 'user-disconnect');
        return;
      }

      // If this is a group call and we're on a subscriber server, handle subscriber audio routing cleanup
      if (callSession.groupId && this.subscriberAudioRouting) {
        try {
          await this.subscriberAudioRouting.handleUserLeaveGroupCall(
            userId,
            callSession.groupId
          );
        } catch (error) {
          logger.error(`Failed to handle subscriber audio routing cleanup for group call: ${error.message}`, error);
        }
      }

      // ...
    } catch (error) {
      logger.error('Instant disconnect error:', error);
    }
  }

  SocketHandler.prototype.handleAudioLevel = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const userId = session.userId;
      const callId = data?.callId || data?.roomId || data?.groupId;
      const level = typeof data?.level === 'number'
        ? data.level
        : (typeof data?.audioLevel === 'number' ? data.audioLevel : 0);

      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey) return;
      const callSession = this.activeRooms.get(callKey);
      if (!callSession) return;

      if (!callSession.audioLevels) callSession.audioLevels = new Map();
      callSession.audioLevels.set(String(userId), { level, timestamp: Date.now() });

      try {
        this.broadcastToCall(callKey, 'audio-level', {
          callId: callSession.callId,
          userId,
          level,
          timestamp: new Date(),
        });
      } catch {}
    } catch (error) {
      logger.error('Failed to handle audio level:', error);
    }
  }

  // ...

  SocketHandler.prototype.startSilenceDetection = function(callKey) {
    const callSession = this.activeRooms.get(callKey);
    if (!callSession) {
      return;
    }

    if (String(process.env.SILENCE_DETECTION_ENABLED || '').toLowerCase() !== 'true') {
      return;
    }

    // ...

    // Check for silence every second
    callSession.silenceTimer = setInterval(() => {
      const now = Date.now();
      const graceMs = Number(process.env.SILENCE_DETECTION_GRACE_MS || 15000);
      const silenceThreshold = Number(process.env.SILENCE_DETECTION_THRESHOLD_MS || 60000);
      let allSilent = true;

      if (callSession.startTime && now - callSession.startTime.getTime() < graceMs) {
        return;
      }

      if (!callSession.audioLevels) {
        return;
      }

      // Check if all participants are silent
      for (const [userId, audioLevel] of callSession.audioLevels.entries()) {
        if (now - audioLevel.timestamp < silenceThreshold) {
          allSilent = false;
          break;
        }
      }

      if (allSilent && callSession.audioLevels.size > 0) {
        // Calculate remaining time
        const oldestAudio = Math.min(...Array.from(callSession.audioLevels.values()).map(a => a.timestamp));
        const silenceDuration = now - oldestAudio;
        const remainingSeconds = Math.max(0, Math.ceil((silenceThreshold - silenceDuration) / 1000));

        if (remainingSeconds <= 3 && remainingSeconds > 0) {
          // Send warning
          this.broadcastToCall(callKey, 'silence-warning', {
            callId: callSession.callId,
            secondsRemaining: remainingSeconds
          });
        } else if (remainingSeconds === 0) {
          // Auto-disconnect
          logger.info(`Auto-disconnect due to silence: ${callSession.callId}`);
          this.endInstantCall(callKey, 'silence-timeout');
        }
      }
    }, 1000);
  }

  SocketHandler.prototype.endInstantCall = function(callKey, reason) {
    const callSession = this.activeRooms.get(callKey);
    if (!callSession) {
      return;
    }

    const callId = callSession.callId;

    const endedAt = new Date();

    logger.info(`Ending instant call: ${callId}, reason: ${reason}`);

    // ...

    // Notify all participants
    this.broadcastToCall(callKey, 'instant-ended', {
      callId,
      reason,
      duration: Date.now() - callSession.startTime.getTime(),
      endedAt: endedAt.toISOString(),
    });

    // Persist end time to DB (best-effort)
    try {
      const { updateCallSession, getCallSession } = require('../../services/databaseService');
      void (async () => {
        const existing = await getCallSession(callId);
        const mergedMeta = { ...(existing?.sessionMetadata || {}) };
        mergedMeta.endedAt = endedAt.toISOString();
        mergedMeta.endReason = reason;

        await updateCallSession(callId, {
          status: 'ended',
          endTime: endedAt,
          sessionMetadata: mergedMeta
        });
      })().catch(() => null);
    } catch (e) {
      logger.warn(`endInstantCall: failed to persist end_time for ${callId}`, e?.message || e);
    }

    // ...

    // Remove call session
    this.activeRooms.delete(callKey);
  }

  // ...

  SocketHandler.prototype.getScopedCallKey = function(socket, callId) {
    return `${socket.tenantId}:${socket.subTenantId}:${callId}`;
  }

  SocketHandler.prototype.handleProducerReady = async function(socket, data) {
    try {
      const { callId, producerId, kind } = data || {};
      const userId = socket.userId;

      if (!callId || !producerId || !userId) {
        return;
      }

      const callKey = this.getScopedCallKey(socket, callId);
      const callSession = this.activeRooms.get(callKey);
      if (!callSession) {
        logger.warn(`Call session not found: ${callId}`);
        return;
      }

      for (const [participantId, participant] of callSession.participants.entries()) {
        if (participantId === userId) continue;
        const participantSocket = this.io.sockets.sockets.get(participant.socketId);
        if (participantSocket) {
          participantSocket.emit('new-producer', {
            callId,
            producerId,
            userId,
            kind
          });
        }
      }
    } catch (error) {
      logger.error('Producer ready handler error:', error);
    }
  }
}

module.exports = { attachInstantConnectHandlers };
