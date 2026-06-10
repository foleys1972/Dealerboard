const crypto = require('crypto');
const { protectString } = require('../dpapiService');
const { testArchiveDestinationByConfig } = require('../recordingArchiveService');
const {
  listLocations,
  getLocationArchiveConfig,
  insertLocation,
  updateLocation,
  deleteLocationById,
  listUsersByLocationId,
  assignUsersToLocation,
  mapLocationRow,
  mapLocationUserRow,
} = require('../../db/locations/locations');
const {
  getLocationSubscriberAssignmentRow,
  subscriberExists,
  upsertLocationSubscriberAssignment,
} = require('../../db/locations/subscriberAssignments');
const { LocationError } = require('./errors');

async function normalizeLocationStorageConfig(input) {
  const cfg = (input && typeof input === 'object') ? { ...input } : {};

  const type = String(cfg.type || '').toLowerCase();
  if (type === 's3' || cfg.s3) {
    const s3 = cfg.s3 ? { ...cfg.s3 } : { ...cfg };

    if (s3.accessKeyId && s3.accessKeyId !== '********') {
      s3.accessKeyIdEnc = await protectString(String(s3.accessKeyId));
    }
    if (s3.secretAccessKey && s3.secretAccessKey !== '********') {
      s3.secretAccessKeyEnc = await protectString(String(s3.secretAccessKey));
    }

    delete s3.accessKeyId;
    delete s3.secretAccessKey;

    cfg.type = 's3';
    cfg.s3 = {
      ...s3,
      accessKeyIdEnc: s3.accessKeyIdEnc || (cfg.s3 ? cfg.s3.accessKeyIdEnc : cfg.accessKeyIdEnc),
      secretAccessKeyEnc: s3.secretAccessKeyEnc || (cfg.s3 ? cfg.s3.secretAccessKeyEnc : cfg.secretAccessKeyEnc),
    };
  }

  if (!cfg.localCapGb && cfg.localCapGb !== 0) {
    cfg.localCapGb = 10;
  }

  return cfg;
}

async function listLocationRecords() {
  const rows = await listLocations();
  return { success: true, locations: rows.map(mapLocationRow) };
}

async function getSubscriberAssignment(locationId) {
  const id = String(locationId || '').trim();
  if (!id) throw new LocationError(400, 'id is required');
  const assignment = await getLocationSubscriberAssignmentRow(id);
  return { success: true, assignment };
}

async function setSubscriberAssignment(locationId, body, updatedBy) {
  const id = String(locationId || '').trim();
  if (!id) throw new LocationError(400, 'id is required');

  const primarySubscriberId = body?.primarySubscriberId ? String(body.primarySubscriberId) : null;
  const secondarySubscriberId = body?.secondarySubscriberId ? String(body.secondarySubscriberId) : null;
  const notes = body?.notes !== undefined ? String(body.notes || '') : null;

  if (primarySubscriberId && !(await subscriberExists(primarySubscriberId))) {
    throw new LocationError(400, 'primarySubscriberId not found');
  }
  if (secondarySubscriberId && !(await subscriberExists(secondarySubscriberId))) {
    throw new LocationError(400, 'secondarySubscriberId not found');
  }

  await upsertLocationSubscriberAssignment([
    id,
    primarySubscriberId,
    secondarySubscriberId,
    updatedBy,
    notes,
  ]);

  const assignment = await getLocationSubscriberAssignmentRow(id);
  return { success: true, assignment };
}

async function createLocation(body) {
  const {
    name,
    description,
    region,
    timezone,
    retentionDays,
    voiceRetentionDays,
    voiceVoxSilenceSeconds,
    messagingRetentionDays,
    dataRetentionDays,
    legalHold,
    sftpConfig,
    metadata,
  } = body || {};

  const nm = String(name || '').trim();
  if (!nm) throw new LocationError(400, 'name is required');

  const id = `loc_${crypto.randomBytes(8).toString('hex')}`;
  const ret = retentionDays !== undefined && retentionDays !== null
    ? (parseInt(retentionDays, 10) || 30)
    : 30;
  const normalizedStorage = await normalizeLocationStorageConfig(sftpConfig || {});
  const voxSilenceSeconds = voiceVoxSilenceSeconds !== undefined && voiceVoxSilenceSeconds !== null
    ? (parseInt(voiceVoxSilenceSeconds, 10) || 10)
    : 10;

  const row = await insertLocation([
    id,
    nm,
    description !== undefined ? String(description) : null,
    region !== undefined && region !== null ? String(region) : null,
    timezone !== undefined && timezone !== null ? String(timezone) : 'UTC',
    ret,
    voiceRetentionDays !== undefined
      ? (voiceRetentionDays === null ? null : (parseInt(voiceRetentionDays, 10) || null))
      : null,
    voxSilenceSeconds,
    messagingRetentionDays !== undefined
      ? (messagingRetentionDays === null ? null : (parseInt(messagingRetentionDays, 10) || null))
      : null,
    dataRetentionDays !== undefined
      ? (dataRetentionDays === null ? null : (parseInt(dataRetentionDays, 10) || null))
      : null,
    legalHold !== undefined ? !!legalHold : false,
    JSON.stringify(normalizedStorage),
    JSON.stringify(metadata || {}),
  ]);

  return { status: 201, body: { success: true, location: mapLocationRow(row) } };
}

async function updateLocationRecord(id, body) {
  const locationId = String(id || '').trim();
  if (!locationId) throw new LocationError(400, 'id is required');

  const {
    name,
    description,
    region,
    timezone,
    retentionDays,
    voiceRetentionDays,
    voiceVoxSilenceSeconds,
    messagingRetentionDays,
    dataRetentionDays,
    legalHold,
    sftpConfig,
    metadata,
  } = body || {};

  const updates = [];
  const values = [];
  let p = 1;

  if (name !== undefined) {
    updates.push(`name = $${p++}`);
    values.push(String(name || '').trim());
  }
  if (description !== undefined) {
    updates.push(`description = $${p++}`);
    values.push(description === null ? null : String(description));
  }
  if (region !== undefined) {
    updates.push(`region = $${p++}`);
    values.push(region === null ? null : String(region));
  }
  if (timezone !== undefined) {
    updates.push(`timezone = $${p++}`);
    values.push(timezone === null ? 'UTC' : String(timezone));
  }
  if (retentionDays !== undefined) {
    updates.push(`retention_days = $${p++}`);
    values.push(parseInt(retentionDays, 10) || 30);
  }
  if (voiceRetentionDays !== undefined) {
    updates.push(`voice_retention_days = $${p++}`);
    values.push(voiceRetentionDays === null ? null : (parseInt(voiceRetentionDays, 10) || null));
  }
  if (voiceVoxSilenceSeconds !== undefined) {
    updates.push(`voice_vox_silence_seconds = $${p++}`);
    values.push(voiceVoxSilenceSeconds === null ? 10 : (parseInt(voiceVoxSilenceSeconds, 10) || 10));
  }
  if (messagingRetentionDays !== undefined) {
    updates.push(`messaging_retention_days = $${p++}`);
    values.push(messagingRetentionDays === null ? null : (parseInt(messagingRetentionDays, 10) || null));
  }
  if (dataRetentionDays !== undefined) {
    updates.push(`data_retention_days = $${p++}`);
    values.push(dataRetentionDays === null ? null : (parseInt(dataRetentionDays, 10) || null));
  }
  if (legalHold !== undefined) {
    updates.push(`legal_hold = $${p++}`);
    values.push(!!legalHold);
  }
  if (sftpConfig !== undefined) {
    const normalizedStorage = await normalizeLocationStorageConfig(sftpConfig || {});
    updates.push(`sftp_config = $${p++}::jsonb`);
    values.push(JSON.stringify(normalizedStorage));
  }
  if (metadata !== undefined) {
    updates.push(`metadata = $${p++}::jsonb`);
    values.push(JSON.stringify(metadata || {}));
  }

  if (updates.length === 0) throw new LocationError(400, 'No fields to update');

  updates.push('updated_at = NOW()');
  values.push(locationId);

  const row = await updateLocation(locationId, updates, values);
  if (!row) throw new LocationError(404, 'Location not found');

  return { success: true, location: mapLocationRow(row) };
}

async function testArchiveDestination(locationId) {
  const id = String(locationId || '').trim();
  if (!id) throw new LocationError(400, 'id is required');

  const row = await getLocationArchiveConfig(id);
  if (!row) throw new LocationError(404, 'Location not found');

  const test = await testArchiveDestinationByConfig(row.sftp_config || {});
  return {
    success: true,
    locationId: String(row.id),
    locationName: row.name,
    test,
  };
}

async function deleteLocation(id) {
  const locationId = String(id || '').trim();
  if (!locationId) throw new LocationError(400, 'id is required');

  await deleteLocationById(locationId);
  return { success: true };
}

async function listLocationUsers(locationId) {
  const id = String(locationId || '').trim();
  if (!id) throw new LocationError(400, 'id is required');

  const rows = await listUsersByLocationId(id);
  return { success: true, users: rows.map(mapLocationUserRow) };
}

async function assignUsers(locationId, userIds) {
  const id = String(locationId || '').trim();
  if (!id) throw new LocationError(400, 'id is required');

  const ids = Array.isArray(userIds) ? userIds.map(String).filter(Boolean) : [];

  await assignUsersToLocation(id, ids);
  return { success: true, assigned: ids.length };
}

module.exports = {
  listLocationRecords,
  getSubscriberAssignment,
  setSubscriberAssignment,
  createLocation,
  updateLocationRecord,
  testArchiveDestination,
  deleteLocation,
  listLocationUsers,
  assignUsers,
};
