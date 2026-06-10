const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');

let reconcileTimer = null;
let lastRunAt = null;
let lastError = null;
let lastSummary = null;
let lastSentinelAlertAt = null;

function computeAuthoritativeDurationMs(callSession) {
  try {
    const answeredAtRaw = callSession?.sessionMetadata?.answeredAt || callSession?.sessionMetadata?.connectedAt;
    const endAtRaw = callSession?.endTime;
    if (!answeredAtRaw || !endAtRaw) return null;

    const answeredAt = new Date(answeredAtRaw);
    const endAt = new Date(endAtRaw);
    if (isNaN(answeredAt.getTime()) || isNaN(endAt.getTime())) return null;
    if (endAt <= answeredAt) return null;

    return endAt.getTime() - answeredAt.getTime();
  } catch {
    return null;
  }
}

async function reconcileOneRecording({ recordingId, metaPath, meta, recordingDir }) {
  const { getCallSession, getRecording, updateRecording } = require('./databaseService');

  const sessionId = meta?.sessionId || meta?.callId || null;
  if (!sessionId) return { updated: false, reason: 'no_session' };

  const cs = await getCallSession(String(sessionId));
  if (!cs) return { updated: false, reason: 'no_call_session' };

  const authoritativeMs = computeAuthoritativeDurationMs(cs);
  if (!Number.isFinite(authoritativeMs) || authoritativeMs <= 0) {
    return { updated: false, reason: 'call_not_ended' };
  }

  const currentMs = Number(meta?.durationMs || 0);
  if (Number.isFinite(currentMs) && Math.abs(currentMs - authoritativeMs) < 500) {
    return { updated: false, reason: 'already_ok' };
  }

  const nextMeta = { ...(meta || {}) };
  nextMeta.durationMs = authoritativeMs;
  if (cs.startTime) nextMeta.startTime = cs.startTime;
  if (cs.endTime) nextMeta.endTime = cs.endTime;

  await fs.writeJson(metaPath, nextMeta, { spaces: 2 });

  // Best-effort DB update.
  try {
    const rec = await getRecording(String(recordingId));
    if (rec) {
      await updateRecording(String(recordingId), {
        startTime: cs.startTime || undefined,
        endTime: cs.endTime || undefined,
        duration: authoritativeMs,
        recordingMetadata: nextMeta,
      });
    }
  } catch (e) {
    logger.warn(`Recording reconcile DB update failed for ${recordingId}: ${e?.message || e}`);
  }

  // Also update in-memory cache if present
  try {
    const { audioRecordingService } = require('./audioRecordingService');
    const idx = (audioRecordingService.completedRecordings || []).findIndex(r => r.id === recordingId);
    if (idx >= 0) {
      const r = audioRecordingService.completedRecordings[idx];
      r.duration = authoritativeMs;
      r.startTime = nextMeta.startTime ? new Date(nextMeta.startTime) : r.startTime;
      r.endTime = nextMeta.endTime ? new Date(nextMeta.endTime) : r.endTime;
      r.metadata = nextMeta;
    }
  } catch {}

  return { updated: true, authoritativeMs, previousMs: currentMs };
}

async function reconcileRecentRecordings({ recordingDir, maxPerRun = 50 }) {
  const startedAt = new Date();
  lastRunAt = startedAt.toISOString();
  lastError = null;

  let files;
  try {
    files = await fs.readdir(recordingDir);
  } catch {
    files = [];
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));

  // Oldest first, so we converge faster on backlog.
  jsonFiles.sort();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const jf of jsonFiles) {
    if (scanned >= maxPerRun) break;
    scanned += 1;

    const recordingId = path.basename(jf, '.json');
    const metaPath = path.join(recordingDir, jf);

    try {
      const meta = await fs.readJson(metaPath);
      const res = await reconcileOneRecording({ recordingId, metaPath, meta, recordingDir });
      if (res.updated) updated += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  const finishedAt = new Date();
  lastSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    scanned,
    updated,
    skipped,
  };
  return lastSummary;
}

function startRecordingReconcileLoop({ recordingDir, intervalMs = 60 * 1000 }) {
  if (reconcileTimer) return;
  reconcileTimer = setInterval(async () => {
    try {
      await reconcileRecentRecordings({ recordingDir });
    } catch (e) {
      lastError = e?.message || String(e);

      // UC Sentinel alerting (throttled)
      try {
        const now = Date.now();
        const last = lastSentinelAlertAt ? new Date(lastSentinelAlertAt).getTime() : 0;
        if (now - last >= Math.max(30_000, intervalMs - 250)) {
          lastSentinelAlertAt = new Date(now).toISOString();
          const uc = require('./ucSentinelDeliveryService').getUcSentinelDeliveryService();
          uc.enqueueAlert({
            kind: 'recording-reconcile-loop-error',
            severity: 'warning',
            title: 'Recording reconcile loop error',
            message: lastError,
            details: { recordingDir },
          }).catch(() => {});
        }
      } catch {}
    }
  }, intervalMs);

  try {
    reconcileTimer.unref?.();
  } catch {}
}

function stopRecordingReconcileLoop() {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

function getRecordingReconcileHealth() {
  return {
    lastRunAt,
    lastError,
    lastSummary,
  };
}

module.exports = {
  startRecordingReconcileLoop,
  stopRecordingReconcileLoop,
  reconcileRecentRecordings,
  getRecordingReconcileHealth,
};
