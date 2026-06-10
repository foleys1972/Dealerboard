const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');
const { onSipLineCallStatus } = require('../../services/sipLineStateWiring');
const { buildLineMediaGroupId, ensureLineMediaRouter } = require('../../services/dealerboard/lineMediaService');
const { openOrJoinSipLine, updateLineCallStatus } = require('../../services/dealerboard/sipLineStateService');

function attachSipLineHandlers(SocketHandler) {
  SocketHandler.prototype.handleSipIncomingCall = async function(lineId, callId, call) {
    try {
      const nowIso = new Date().toISOString();
      const lineKey = `${String(lineId)}:${String(callId)}`;

      // Persist minimal tracking so we can stop recording on BYE.
      if (!this._sipLineCalls.has(lineKey)) {
        this._sipLineCalls.set(lineKey, {
          lineId: String(lineId),
          callId: String(callId),
          startedAt: nowIso,
          recordingId: null,
          sessionId: null,
        });
      }

      // Broadcast to tenant room for UI (dealerboards can subscribe later)
      try {
        const mediaGroupId = buildLineMediaGroupId(String(lineId));
        ensureLineMediaRouter(String(lineId)).catch(() => {});
        openOrJoinSipLine({
          lineId: String(lineId),
          mediaGroupId,
          sipCallId: String(callId),
          joinedExistingCall: false,
        });
        updateLineCallStatus(String(lineId), String(callId), 'ringing');

        // Broadcast to every connected dealerboard/intercom client (they filter by
        // their assigned lineId). The 'presence:all' room is joined by platform
        // admins only, so routing line events there silently dropped the audible
        // ring for regular turret users — see services/sipLineStateWiring.js.
        this.io.emit('line-sip-incoming', {
          lineId: String(lineId),
          callId: String(callId),
          sipCallId: String(callId),
          mediaGroupId,
          status: call?.status || 'incoming',
          timestamp: nowIso,
        });
      } catch {}

      // Create a call_session so recording metadata has a home.
      try {
        const { createCallSession } = require('../../services/databaseService');
        const sessionId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        const tracked = this._sipLineCalls.get(lineKey);
        tracked.sessionId = sessionId;
        this._sipLineCalls.set(lineKey, tracked);

        await createCallSession({
          sessionId,
          lineId: String(lineId),
          // Call sessions currently only allow INTERCOM/GROUP/BROADCAST/ARD/MRD/ZOOM/TEAMS.
          // For now, classify inbound line calls as MRD unless overridden by line config.
          lineType: 'MRD',
          initiatorUserId: 'sip',
          status: 'active',
          topologyType: 'P2P',
          participants: [],
          invitedNoAnswer: [],
          sessionMetadata: {
            source: 'sip-incoming',
            sipCallId: String(callId),
            sipLineId: String(lineId),
            receivedAt: nowIso,
          },
        });
      } catch (e) {
        // Don't fail the call pipeline if DB write fails.
        try { logger.warn('Failed to create call_session for SIP incoming call', e?.message || e); } catch {}
      }

      // Apply unconditional line forward (SIP URI). This is the first step toward a full bridge+record flow.
      try {
        const tracked = this._sipLineCalls.get(lineKey);
        if (!tracked || tracked._forwardHandled === true) {
          // Avoid double-processing if multiple SIP messages trigger this.
        } else {
          let forwardEnabled = false;
          let forwardToUri = null;
          let lineKind = null; // 'privateWire' | 'ddi'

          // Resolve forward settings from DB.
          try {
            const { pool } = require('../../services/databaseService');

            // Private wire: use dealerboard_private_wires.metadata.callForward.{enabled,forwardToUri}
            const pw = await pool.query(
              `SELECT id, mode, metadata
               FROM dealerboard_private_wires
               WHERE id = $1
               LIMIT 1`,
              [String(lineId)]
            );

            if (pw.rows.length > 0) {
              lineKind = 'privateWire';
              const meta = pw.rows[0]?.metadata || {};
              const cf = meta?.callForward || meta?.call_forward || {};
              forwardEnabled = Boolean(cf?.enabled);
              forwardToUri = (cf?.forwardToUri || cf?.forward_to_uri || cf?.targetUri || '').toString().trim() || null;
            } else {
              // DDI: no metadata column today; allow forward settings under connection_details.
              const ddi = await pool.query(
                `SELECT id, connection_details
                 FROM dealerboard_ddi_lines
                 WHERE id = $1
                 LIMIT 1`,
                [String(lineId)]
              );
              if (ddi.rows.length > 0) {
                lineKind = 'ddi';
                const cd = ddi.rows[0]?.connection_details || {};
                const cf = cd?.callForward || cd?.call_forward || {};
                forwardEnabled = Boolean(cf?.enabled);
                forwardToUri = (cf?.forwardToUri || cf?.forward_to_uri || cf?.targetUri || '').toString().trim() || null;
              }
            }
          } catch (e) {
            try { logger.warn('Failed to resolve line forward config', e?.message || e); } catch {}
          }

          if (forwardEnabled && forwardToUri) {
            tracked._forwardHandled = true;
            tracked.forward = {
              enabled: true,
              toUri: forwardToUri,
              kind: lineKind,
              decidedAt: nowIso,
            };
            this._sipLineCalls.set(lineKey, tracked);

            // Answer the inbound leg so we anchor the call (required for bridge/record).
            try {
              const ua = this.sipGateway?.getUserAgent?.(String(lineId));
              if (ua?.answerIncomingCall) {
                await ua.answerIncomingCall(String(callId));
              }
            } catch (e) {
              try { logger.warn('Failed to answer inbound SIP leg for forward', e?.message || e); } catch {}
            }

            // Originate outbound leg to forwarded SIP URI.
            try {
              if (this.sipGateway?.makeCall) {
                const fwdCallId = await this.sipGateway.makeCall(String(lineId), forwardToUri, {
                  mode: 'FORWARD',
                  forwardedFromLineId: String(lineId),
                  forwardedFromCallId: String(callId),
                });
                tracked.forward.forwardCallId = String(fwdCallId);
                this._sipLineCalls.set(lineKey, tracked);
              }
            } catch (e) {
              try { logger.warn('Failed to originate forwarded SIP leg', e?.message || e); } catch {}
            }

            // Persist forward metadata onto call_session so recording has the full story.
            try {
              const { updateCallSession, getCallSession } = require('../../services/databaseService');
              if (tracked.sessionId) {
                const existing = await getCallSession(tracked.sessionId);
                const meta = existing?.sessionMetadata || {};
                meta.callForward = {
                  enabled: true,
                  unconditional: true,
                  forwardedFromLineId: String(lineId),
                  inboundSipCallId: String(callId),
                  forwardedToUri: forwardToUri,
                  outboundSipCallId: tracked.forward?.forwardCallId || null,
                  decidedAt: nowIso,
                };
                await updateCallSession(tracked.sessionId, { sessionMetadata: meta });
              }
            } catch (e) {
              try { logger.warn('Failed to persist SIP line forward metadata', e?.message || e); } catch {}
            }
          }
        }
      } catch (e) {
        try { logger.warn('Line forward processing failed', e?.message || e); } catch {}
      }

      // Start a recording entry if possible; actual media capture/bridge will be implemented next.
      try {
        const { audioRecordingService } = require('../../services/audioRecordingService');
        const tracked = this._sipLineCalls.get(lineKey);
        if (!tracked?.sessionId) return;

        const recording = await audioRecordingService.startRecording(String(lineId), [], {
          sessionId: tracked.sessionId,
          callType: 'line-forward-bridge',
          lineId: String(lineId),
          captureMethod: 'sip',
          platform: 'sip',
          topology: 'P2P',
          videoWasEnabled: false,
        });

        tracked.recordingId = recording?.id || recording?.recordingId || null;
        this._sipLineCalls.set(lineKey, tracked);
      } catch (e) {
        try { logger.warn('Failed to start recording for SIP incoming call', e?.message || e); } catch {}
      }
    } catch (error) {
      logger.error('handleSipIncomingCall failed:', error);
    }
  }

  SocketHandler.prototype.handleSipCallEnded = async function(lineId, callId, call) {
    try {
      const lineKey = `${String(lineId)}:${String(callId)}`;
      const tracked = this._sipLineCalls.get(lineKey);
      if (!tracked) return;

      // Stop recording if we started one.
      try {
        if (tracked.recordingId) {
          const { audioRecordingService } = require('../../services/audioRecordingService');
          await audioRecordingService.stopRecording(tracked.recordingId);
        }
      } catch {}

      this._sipLineCalls.delete(lineKey);
    } catch (error) {
      logger.error('handleSipCallEnded failed:', error);
    }
  }

  SocketHandler.prototype.handleSipCallStateChanged = async function(lineId, callId, call) {
    try {
      await onSipLineCallStatus(lineId, callId, call?.status);
    } catch (error) {
      logger.error('handleSipCallStateChanged failed:', error);
    }
  }
}

module.exports = { attachSipLineHandlers };
