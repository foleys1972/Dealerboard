const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const SftpClient = require('ssh2-sftp-client');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { pool, getUserByIdOrUsername } = require('./databaseService');
const { unprotectString } = require('./dpapiService');

const LOCAL_CAP_DEFAULT_GB = 10;

let retryTimer = null;
let lastRetryRunAt = null;
let lastRetryError = null;
let lastRetrySummary = null;
let lastSentinelAlertAt = null;

function maskSecret(value) {
  if (!value) return '';
  return '********';
}

function resolveArchiveFolderPath(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const raw = cfg.localPath || cfg.folderPath || cfg.uncPath || cfg.smb?.uncPath || cfg.smb?.localPath || '';
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return process.platform === 'win32' ? path.win32.normalize(trimmed) : path.normalize(trimmed);
}

async function archiveToLocalFolder({ folderPath, recordingId, wavPath, jsonPath }) {
  const baseDir = process.platform === 'win32'
    ? path.win32.join(String(folderPath), String(recordingId))
    : path.join(String(folderPath), String(recordingId));
  await fs.ensureDir(baseDir);
  await fs.copyFile(wavPath, path.join(baseDir, path.basename(wavPath)));
  await fs.copyFile(jsonPath, path.join(baseDir, path.basename(jsonPath)));
  return { destination: baseDir };
}

async function getLocationArchiveConfigByUserId(userIdOrUsername) {
  if (!userIdOrUsername) return null;
  const u = await getUserByIdOrUsername(String(userIdOrUsername));
  if (!u?.locationId) return null;

  const result = await pool.query(
    `SELECT id, name, sftp_config FROM locations WHERE id = $1`,
    [String(u.locationId)]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const cfg = row.sftp_config || {};

  return {
    locationId: String(row.id),
    locationName: row.name,
    config: cfg,
  };
}

async function getLocationArchiveConfigByLocationId(locationId) {
  if (!locationId) return null;
  const result = await pool.query(
    `SELECT id, name, sftp_config FROM locations WHERE id = $1`,
    [String(locationId)]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    locationId: String(row.id),
    locationName: row.name,
    config: row.sftp_config || {},
  };
}

async function archiveToSmb({ uncPath, recordingId, wavPath, jsonPath }) {
  const baseDir = path.win32.join(String(uncPath), String(recordingId));
  await fs.ensureDir(baseDir);
  await fs.copyFile(wavPath, path.win32.join(baseDir, path.basename(wavPath)));
  await fs.copyFile(jsonPath, path.win32.join(baseDir, path.basename(jsonPath)));
  return { destination: baseDir };
}

async function archiveToSftp({ host, port, username, password, remotePath, recordingId, wavPath, jsonPath }) {
  const sftp = new SftpClient();
  await sftp.connect({ host, port: port || 22, username, password });

  const remoteDir = remotePath ? path.posix.join(remotePath, recordingId) : recordingId;
  await sftp.mkdir(remoteDir, true);
  await sftp.put(wavPath, path.posix.join(remoteDir, path.basename(wavPath)));
  await sftp.put(jsonPath, path.posix.join(remoteDir, path.basename(jsonPath)));

  await sftp.end();
  return { destination: remoteDir };
}

async function archiveToS3({ endpointUrl, region, accessKeyIdEnc, secretAccessKeyEnc, bucket, prefix, recordingId, wavPath, jsonPath }) {
  const accessKeyId = accessKeyIdEnc ? await unprotectString(accessKeyIdEnc) : null;
  const secretAccessKey = secretAccessKeyEnc ? await unprotectString(secretAccessKeyEnc) : null;

  if (!bucket) throw new Error('S3 bucket is required');
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 credentials are missing');

  const client = new S3Client({
    region: region || 'us-east-1',
    endpoint: endpointUrl || undefined,
    forcePathStyle: !!endpointUrl,
    credentials: { accessKeyId, secretAccessKey },
  });

  const keyBase = prefix ? `${String(prefix).replace(/\/$/, '')}/${recordingId}` : recordingId;

  const wavKey = `${keyBase}/${path.basename(wavPath)}`;
  const jsonKey = `${keyBase}/${path.basename(jsonPath)}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: wavKey,
    Body: await fs.readFile(wavPath),
    ContentType: 'audio/wav',
  }));

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: jsonKey,
    Body: await fs.readFile(jsonPath),
    ContentType: 'application/json',
  }));

  return { destination: `s3://${bucket}/${keyBase}` };
}

async function testArchiveDestinationByConfig(cfg) {
  const config = cfg && typeof cfg === 'object' ? cfg : {};
  if (!config.enabled) {
    return { ok: false, error: 'Archive is disabled for this location' };
  }

  const type = String(config.type || 'sftp').toLowerCase();
  const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const testPayload = Buffer.from(`archive_test:${testId}`, 'utf8');

  if (type === 'local' || type === 'folder') {
    const folderPath = resolveArchiveFolderPath(config);
    if (!folderPath) return { ok: false, error: 'Local folder path is required (e.g. E:\\vr_storage)' };
    const baseDir = process.platform === 'win32'
      ? path.win32.join(folderPath, '_archive_test')
      : path.join(folderPath, '_archive_test');
    const testFile = path.join(baseDir, `${testId}.txt`);

    try {
      await fs.ensureDir(baseDir);
      await fs.writeFile(testFile, testPayload);
      const readBack = await fs.readFile(testFile);
      await fs.remove(testFile);
      if (!readBack || readBack.toString('utf8') !== testPayload.toString('utf8')) {
        return { ok: false, error: 'Local folder read-back validation failed' };
      }
      return { ok: true, destination: baseDir };
    } catch (error) {
      return { ok: false, error: error?.message || 'Failed to write to local folder' };
    }
  }

  if (type === 'smb') {
    const uncPath = resolveArchiveFolderPath(config);
    if (!uncPath) return { ok: false, error: 'SMB UNC path or local folder path is required' };
    const baseDir = process.platform === 'win32'
      ? path.win32.join(String(uncPath), '_archive_test')
      : path.join(String(uncPath), '_archive_test');
    const testFile = path.join(baseDir, `${testId}.txt`);

    try {
      await fs.ensureDir(baseDir);
      await fs.writeFile(testFile, testPayload);
      const readBack = await fs.readFile(testFile);
      await fs.remove(testFile);

      if (!readBack || readBack.toString('utf8') !== testPayload.toString('utf8')) {
        return { ok: false, error: 'SMB read-back validation failed' };
      }
      return { ok: true, destination: baseDir };
    } catch (error) {
      return { ok: false, error: error?.message || 'Failed to write to SMB/folder path' };
    }
  }

  if (type === 's3') {
    const s3 = config.s3 || config;
    const bucket = s3.bucket;
    if (!bucket) return { ok: false, error: 'S3 bucket is required' };

    const accessKeyId = s3.accessKeyIdEnc ? await unprotectString(s3.accessKeyIdEnc) : null;
    const secretAccessKey = s3.secretAccessKeyEnc ? await unprotectString(s3.secretAccessKeyEnc) : null;
    if (!accessKeyId || !secretAccessKey) return { ok: false, error: 'S3 credentials are missing' };

    const client = new S3Client({
      region: s3.region || 'us-east-1',
      endpoint: s3.endpointUrl || undefined,
      forcePathStyle: !!s3.endpointUrl,
      credentials: { accessKeyId, secretAccessKey },
    });

    const keyBase = s3.prefix ? `${String(s3.prefix).replace(/\/$/, '')}/_archive_test` : '_archive_test';
    const key = `${keyBase}/${testId}.txt`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: testPayload,
      ContentType: 'text/plain',
    }));

    // We intentionally don't delete here to avoid requiring extra S3 permissions.
    return { ok: true, destination: `s3://${bucket}/${keyBase}` };
  }

  // Default: SFTP
  const sftpCfg = config.sftp || config;
  if (!sftpCfg.host) return { ok: false, error: 'SFTP host is required' };
  if (!sftpCfg.username) return { ok: false, error: 'SFTP username is required' };

  const sftp = new SftpClient();
  await sftp.connect({
    host: sftpCfg.host,
    port: sftpCfg.port || 22,
    username: sftpCfg.username,
    password: sftpCfg.password,
  });

  const remoteBase = sftpCfg.remotePath ? path.posix.join(sftpCfg.remotePath, '_archive_test') : '_archive_test';
  const remoteFile = path.posix.join(remoteBase, `${testId}.txt`);
  await sftp.mkdir(remoteBase, true);
  await sftp.put(testPayload, remoteFile);
  const readBack = await sftp.get(remoteFile);
  await sftp.delete(remoteFile);
  await sftp.end();

  const rb = Buffer.isBuffer(readBack) ? readBack : Buffer.from(readBack);
  if (rb.toString('utf8') !== testPayload.toString('utf8')) {
    return { ok: false, error: 'SFTP read-back validation failed' };
  }

  return { ok: true, destination: remoteBase };
}

async function archiveCompletedRecording({ recordingId, wavPath, jsonPath, meta }) {
  try {
    const uploaderId = meta?.userId || meta?.recordingUserId || meta?.uploadedByUserId || meta?.uploadedBy || null;
    const loc = await getLocationArchiveConfigByUserId(uploaderId);
    if (!loc?.config) return { archived: false, reason: 'no_location_or_config' };

    const cfg = loc.config || {};
    if (!cfg.enabled) return { archived: false, reason: 'disabled' };

    const type = String(cfg.type || 'sftp').toLowerCase();

    let result;
    if (type === 'local' || type === 'folder') {
      const folderPath = resolveArchiveFolderPath(cfg);
      if (!folderPath) throw new Error('Local folder path is required');
      result = await archiveToLocalFolder({ folderPath, recordingId, wavPath, jsonPath });
    } else if (type === 'smb') {
      const uncPath = cfg.uncPath || cfg.smb?.uncPath;
      if (!uncPath) throw new Error('SMB uncPath is required');
      result = await archiveToSmb({ uncPath, recordingId, wavPath, jsonPath });
    } else if (type === 's3') {
      const s3 = cfg.s3 || cfg;
      result = await archiveToS3({
        endpointUrl: s3.endpointUrl,
        region: s3.region,
        accessKeyIdEnc: s3.accessKeyIdEnc,
        secretAccessKeyEnc: s3.secretAccessKeyEnc,
        bucket: s3.bucket,
        prefix: s3.prefix,
        recordingId,
        wavPath,
        jsonPath,
      });
    } else {
      const sftp = cfg.sftp || cfg;
      result = await archiveToSftp({
        host: sftp.host,
        port: sftp.port,
        username: sftp.username,
        password: sftp.password,
        remotePath: sftp.remotePath,
        recordingId,
        wavPath,
        jsonPath,
      });
    }

    return { archived: true, locationId: loc.locationId, locationName: loc.locationName, ...result };
  } catch (error) {
    logger.warn(`Archive failed for recording ${recordingId}: ${error.message}`);
    return { archived: false, reason: error.message };
  }
}

async function getLocalCapBytesForLocation(locationId) {
  const loc = await getLocationArchiveConfigByLocationId(locationId);
  const cfg = loc?.config || {};
  const capGbRaw = cfg.localCapGb;
  const capGb = Number.isFinite(Number(capGbRaw)) ? Number(capGbRaw) : LOCAL_CAP_DEFAULT_GB;
  const cap = Math.max(0, capGb) * 1024 * 1024 * 1024;
  return { capBytes: cap, config: cfg, location: loc };
}

async function computeRecordingFileSetSize(recordingDir, baseId) {
  const candidates = [
    path.join(recordingDir, `${baseId}.wav`),
    path.join(recordingDir, `${baseId}.webm`),
    path.join(recordingDir, `${baseId}.mp3`),
    path.join(recordingDir, `${baseId}.json`),
  ];

  let total = 0;
  for (const p of candidates) {
    try {
      if (await fs.pathExists(p)) {
        const st = await fs.stat(p);
        if (st?.isFile()) total += st.size;
      }
    } catch {}
  }

  return { totalBytes: total, candidates };
}

async function enforceLocalCapForLocation({ locationId, recordingDir }) {
  const { capBytes } = await getLocalCapBytesForLocation(locationId);
  if (!capBytes || capBytes <= 0) return { ok: true, evicted: 0, capBytes };

  let files;
  try {
    files = await fs.readdir(recordingDir);
  } catch {
    return { ok: true, evicted: 0, capBytes };
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const items = [];

  for (const jf of jsonFiles) {
    const id = path.basename(jf, '.json');
    const metaPath = path.join(recordingDir, jf);
    try {
      const meta = await fs.readJson(metaPath);
      const uploaderId = meta?.userId || meta?.recordingUserId || meta?.uploadedByUserId || meta?.uploadedBy || null;
      if (!uploaderId) continue;
      const u = await getUserByIdOrUsername(String(uploaderId));
      if (!u?.locationId || String(u.locationId) !== String(locationId)) continue;

      const archived = Boolean(meta?.archive?.archived);
      const timeRaw = meta?.endTime || meta?.startTime || meta?.createdAt || null;
      const time = timeRaw ? new Date(timeRaw).getTime() : 0;
      const { totalBytes, candidates } = await computeRecordingFileSetSize(recordingDir, id);
      if (totalBytes <= 0) continue;
      items.push({ id, time, archived, totalBytes, candidates });
    } catch {}
  }

  let used = items.reduce((sum, x) => sum + (x.totalBytes || 0), 0);
  if (used <= capBytes) return { ok: true, evicted: 0, capBytes, usedBytes: used };

  // Oldest first; evict archived items before non-archived.
  items.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? -1 : 1;
    return (a.time || 0) - (b.time || 0);
  });

  let evicted = 0;
  for (const item of items) {
    if (used <= capBytes) break;
    if (!item.archived) continue;

    for (const p of item.candidates) {
      try {
        if (await fs.pathExists(p)) await fs.remove(p);
      } catch {}
    }

    used -= item.totalBytes;
    evicted += 1;
  }

  return { ok: true, evicted, capBytes, usedBytes: used };
}

async function listPendingArchiveCandidates(recordingDir) {
  let files;
  try {
    files = await fs.readdir(recordingDir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const out = [];
  for (const jf of jsonFiles) {
    const recordingId = path.basename(jf, '.json');
    const jsonPath = path.join(recordingDir, jf);
    try {
      const meta = await fs.readJson(jsonPath);
      const archived = Boolean(meta?.archive?.archived);
      if (archived) continue;
      out.push({ recordingId, jsonPath, meta });
    } catch {}
  }
  return out;
}

async function retryPendingArchives({ recordingDir, maxPerRun = 25 }) {
  const startedAt = new Date();
  lastRetryRunAt = startedAt.toISOString();
  lastRetryError = null;

  const candidates = await listPendingArchiveCandidates(recordingDir);

  // Prefer oldest first
  candidates.sort((a, b) => {
    const ta = a?.meta?.endTime || a?.meta?.startTime || a?.meta?.createdAt || null;
    const tb = b?.meta?.endTime || b?.meta?.startTime || b?.meta?.createdAt || null;
    const da = ta ? new Date(ta).getTime() : 0;
    const db = tb ? new Date(tb).getTime() : 0;
    return da - db;
  });

  let attempted = 0;
  let archived = 0;
  let failed = 0;

  for (const c of candidates) {
    if (attempted >= maxPerRun) break;
    attempted += 1;

    const wavPath = path.join(recordingDir, `${c.recordingId}.wav`);
    const webmPath = path.join(recordingDir, `${c.recordingId}.webm`);
    const mp3Path = path.join(recordingDir, `${c.recordingId}.mp3`);

    let audioPath = null;
    if (await fs.pathExists(wavPath)) audioPath = wavPath;
    else if (await fs.pathExists(webmPath)) audioPath = webmPath;
    else if (await fs.pathExists(mp3Path)) audioPath = mp3Path;
    else {
      failed += 1;
      continue;
    }

    const result = await archiveCompletedRecording({
      recordingId: c.recordingId,
      wavPath: audioPath,
      jsonPath: c.jsonPath,
      meta: c.meta
    });

    try {
      const nextMeta = { ...(c.meta || {}) };
      nextMeta.archive = {
        archived: !!result.archived,
        destination: result.destination || null,
        locationId: result.locationId || null,
        locationName: result.locationName || null,
        archivedAt: result.archived ? new Date().toISOString() : null,
        reason: result.archived ? null : (result.reason || null),
      };
      await fs.writeJson(c.jsonPath, nextMeta, { spaces: 2 });
    } catch {}

    if (result.archived) {
      archived += 1;
      try {
        const uploaderId = c.meta?.userId || c.meta?.recordingUserId || c.meta?.uploadedByUserId || c.meta?.uploadedBy || null;
        if (uploaderId) {
          const u = await getUserByIdOrUsername(String(uploaderId));
          if (u?.locationId) {
            await enforceLocalCapForLocation({ locationId: String(u.locationId), recordingDir });
          }
        }
      } catch {}
    } else {
      failed += 1;
    }
  }

  const finishedAt = new Date();
  lastRetrySummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    attempted,
    archived,
    failed,
    pendingTotal: candidates.length,
  };
  return lastRetrySummary;
}

function startArchiveRetryLoop({ recordingDir, intervalMs = 5 * 60 * 1000 }) {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    try {
      const summary = await retryPendingArchives({ recordingDir });

      // UC Sentinel alerting (aggregated) for archive failures/backlog.
      try {
        const uc = require('./ucSentinelDeliveryService').getUcSentinelDeliveryService();
        const failed = parseInt(summary?.failed || 0, 10) || 0;
        const pendingTotal = parseInt(summary?.pendingTotal || 0, 10) || 0;

        // Throttle: at most once per interval.
        const now = Date.now();
        const last = lastSentinelAlertAt ? new Date(lastSentinelAlertAt).getTime() : 0;
        if (now - last >= Math.max(30_000, intervalMs - 250)) {
          lastSentinelAlertAt = new Date(now).toISOString();

          if (failed > 0) {
            uc.enqueueAlert({
              kind: 'recording-archive-failed',
              severity: 'error',
              title: 'Recording archive failures',
              message: `${failed} recordings failed to archive in the last retry run`,
              details: summary || null,
            }).catch(() => {});
          } else if (pendingTotal > 0 && pendingTotal >= 100) {
            uc.enqueueAlert({
              kind: 'recording-archive-backlog',
              severity: 'warning',
              title: 'Recording archive backlog',
              message: `${pendingTotal} recordings pending archive`,
              details: summary || null,
            }).catch(() => {});
          }
        }
      } catch {}
    } catch (e) {
      lastRetryError = e?.message || String(e);

      // UC Sentinel alerting (loop error)
      try {
        const uc = require('./ucSentinelDeliveryService').getUcSentinelDeliveryService();
        uc.enqueueAlert({
          kind: 'recording-archive-retry-loop-error',
          severity: 'error',
          title: 'Archive retry loop error',
          message: lastRetryError,
          details: { recordingDir },
        }).catch(() => {});
      } catch {}
    }
  }, intervalMs);

  try {
    retryTimer.unref?.();
  } catch {}
}

function stopArchiveRetryLoop() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

async function getArchiveHealth({ recordingDir }) {
  const candidates = await listPendingArchiveCandidates(recordingDir);

  let oldestPendingAt = null;
  for (const c of candidates) {
    const tRaw = c?.meta?.endTime || c?.meta?.startTime || c?.meta?.createdAt || null;
    if (!tRaw) continue;
    const t = new Date(tRaw);
    if (isNaN(t.getTime())) continue;
    if (!oldestPendingAt || t < oldestPendingAt) oldestPendingAt = t;
  }

  return {
    pendingCount: candidates.length,
    oldestPendingAt: oldestPendingAt ? oldestPendingAt.toISOString() : null,
    lastRetryRunAt,
    lastRetryError,
    lastRetrySummary,
  };
}

function maskArchiveConfigForUi(cfg) {
  const out = { ...(cfg || {}) };
  if (out.type === 's3' || out.s3) {
    const s3 = out.s3 || out;
    if (s3.accessKeyIdEnc) s3.accessKeyId = maskSecret(s3.accessKeyIdEnc);
    if (s3.secretAccessKeyEnc) s3.secretAccessKey = maskSecret(s3.secretAccessKeyEnc);
    delete s3.accessKeyIdEnc;
    delete s3.secretAccessKeyEnc;
    out.s3 = s3;
  }
  return out;
}

module.exports = {
  archiveCompletedRecording,
  enforceLocalCapForLocation,
  maskArchiveConfigForUi,
  startArchiveRetryLoop,
  stopArchiveRetryLoop,
  retryPendingArchives,
  getArchiveHealth,
  testArchiveDestinationByConfig,
};
