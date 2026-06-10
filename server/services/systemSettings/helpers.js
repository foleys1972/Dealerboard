const { SystemSettingsError } = require('./errors');

function resolveSettingsId(user) {
  const tenantId = user.tid || user.tenantId || user.tenant || null;
  const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'tenant-default';
  const effectiveTenantId = (tenantId && tenantId !== defaultTenantId) ? tenantId : null;
  return effectiveTenantId ? `tenant:${effectiveTenantId}` : 'global';
}

function ensureDefaults(settings) {
  const withDefaults = { ...(settings || {}) };
  if (!withDefaults.intercom) withDefaults.intercom = {};
  if (withDefaults.intercom.duckingPercent === undefined || withDefaults.intercom.duckingPercent === null) {
    withDefaults.intercom.duckingPercent = 50;
  }
  if (!withDefaults.recordings) withDefaults.recordings = {};
  if (withDefaults.recordings.allowDeletion === undefined || withDefaults.recordings.allowDeletion === null) {
    withDefaults.recordings.allowDeletion = false;
  }
  if (withDefaults.recordings.uploadChunkSeconds === undefined || withDefaults.recordings.uploadChunkSeconds === null) {
    withDefaults.recordings.uploadChunkSeconds = 20;
  }
  return withDefaults;
}

function buildEnvDefaults() {
  return {
    roomArchive: {
      enabled: false,
      inactiveDays: 90,
    },
    serverRole: {
      role: process.env.SERVER_ROLE || 'publisher',
      publisherUrl: process.env.PUBLISHER_URL || '',
      enablePublisher: process.env.ENABLE_PUBLISHER !== undefined
        ? process.env.ENABLE_PUBLISHER === 'true'
        : undefined,
      enableSubscriber: process.env.ENABLE_SUBSCRIBER !== undefined
        ? process.env.ENABLE_SUBSCRIBER === 'true'
        : undefined,
      serverId: process.env.SERVER_ID || 'intercom-server-01',
      serverName: process.env.SERVER_NAME || 'Trading Intercom Server',
    },
    ports: {
      conferencingPort: parseInt(process.env.CONFERENCING_PORT, 10) || 3002,
      federationPort: parseInt(process.env.FEDERATION_PORT, 10) || 3002,
      rtcMinPort: parseInt(process.env.RTC_MIN_PORT, 10) || 10000,
      rtcMaxPort: parseInt(process.env.RTC_MAX_PORT, 10) || 10200,
      subscriberPortPool: process.env.SUBSCRIBER_PORT_POOL || '5100-5500',
    },
    zoom: {
      enabled: process.env.ZOOM_ENABLED === 'true',
      clientId: process.env.ZOOM_CLIENT_ID || '',
      clientSecret: '',
      redirectUri: process.env.ZOOM_REDIRECT_URI || '',
      accountId: process.env.ZOOM_ACCOUNT_ID || '',
      allowDirectAuth: process.env.ZOOM_ALLOW_DIRECT_AUTH === 'true',
    },
    teams: {
      enabled: process.env.TEAMS_ENABLED === 'true',
      clientId: process.env.TEAMS_CLIENT_ID || '',
      clientSecret: '',
      tenantId: process.env.TEAMS_TENANT_ID || '',
      redirectUri: process.env.TEAMS_REDIRECT_URI || '',
    },
    sip: {
      enabled: process.env.SIP_ENABLED === 'true',
      host: process.env.SIP_HOST || 'localhost',
      port: parseInt(process.env.SIP_PORT, 10) || 5060,
      domain: process.env.SIP_DOMAIN || '',
      password: '',
    },
    matrix: {
      serverUrl: process.env.MATRIX_SERVER_URL || 'https://matrix.org',
      accessToken: '',
      userId: process.env.MATRIX_USER_ID || '',
      deviceId: process.env.MATRIX_DEVICE_ID || '',
    },
    mediasoup: {
      numWorkers: parseInt(process.env.MEDIASOUP_NUM_WORKERS, 10) || 4,
      listenIp: process.env.LISTEN_IP || '0.0.0.0',
      announcedIp: process.env.ANNOUNCED_IP || '',
      logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
      maxConcurrentGroups: parseInt(process.env.MAX_CONCURRENT_GROUPS, 10) || 50,
      maxParticipantsPerGroup: parseInt(process.env.MAX_PARTICIPANTS_PER_GROUP, 10) || 300,
    },
    federation: {
      enabled: process.env.FEDERATION_ENABLED === 'true',
      serverId: process.env.SERVER_ID || 'intercom-server-01',
      serverName: process.env.SERVER_NAME || 'Trading Intercom Server',
      serverUrl: process.env.SERVER_URL || 'ws://localhost:3001',
      federationSecret: '',
      maxConnections: parseInt(process.env.FEDERATION_MAX_CONNECTIONS, 10) || 10,
      heartbeatInterval: parseInt(process.env.FEDERATION_HEARTBEAT_INTERVAL, 10) || 30000,
      reconnectInterval: parseInt(process.env.FEDERATION_RECONNECT_INTERVAL, 10) || 5000,
      maxReconnectAttempts: parseInt(process.env.FEDERATION_MAX_RECONNECT_ATTEMPTS, 10) || 5,
      encryptionEnabled: process.env.FEDERATION_ENCRYPTION_ENABLED === 'true',
      compressionEnabled: process.env.FEDERATION_COMPRESSION_ENABLED === 'true',
    },
    activeDirectory: {
      enabled: process.env.AD_ENABLED === 'true',
      url: process.env.AD_URL || 'ldap://localhost:389',
      baseDN: process.env.AD_BASE_DN || '',
      bindDN: process.env.AD_BIND_DN || '',
      bindPassword: '',
      userSearchBase: process.env.AD_USER_SEARCH_BASE || '',
      groupSearchBase: process.env.AD_GROUP_SEARCH_BASE || '',
      syncInterval: parseInt(process.env.AD_SYNC_INTERVAL, 10) || 300000,
    },
    compliance: {
      enabled: process.env.COMPLIANCE_ENABLED === 'true',
      regulations: process.env.COMPLIANCE_REGULATIONS?.split(',') || ['mifid2', 'dodd-frank', 'sox'],
      retentionPeriod: parseInt(process.env.COMPLIANCE_RETENTION_PERIOD, 10) || 2555,
      auditLogging: process.env.COMPLIANCE_AUDIT_LOGGING === 'true',
      dataClassification: process.env.COMPLIANCE_DATA_CLASSIFICATION === 'true',
      accessControl: process.env.COMPLIANCE_ACCESS_CONTROL === 'true',
      encryptionRequired: process.env.COMPLIANCE_ENCRYPTION_REQUIRED === 'true',
      reportingInterval: parseInt(process.env.COMPLIANCE_REPORTING_INTERVAL, 10) || 86400000,
      complianceOfficer: process.env.COMPLIANCE_OFFICER_EMAIL || '',
      legalHold: process.env.COMPLIANCE_LEGAL_HOLD === 'true',
    },
    recordings: {
      allowDeletion: false,
      uploadChunkSeconds: 20,
    },
  };
}

function validateSettingsUpdate(settings) {
  if (settings.ports) {
    const { rtcMinPort, rtcMaxPort } = settings.ports;
    if (rtcMinPort !== undefined && rtcMaxPort !== undefined) {
      if (rtcMinPort >= rtcMaxPort) {
        throw new SystemSettingsError(400, 'First port must be less than last port');
      }
      if (rtcMinPort < 1024 || rtcMaxPort > 65535) {
        throw new SystemSettingsError(400, 'Ports must be between 1024 and 65535');
      }
    }

    if (settings.ports.subscriberPortPool !== undefined) {
      const cfg = settings.ports.subscriberPortPool;
      const isValidRangeString = (v) => {
        if (typeof v !== 'string' || !v.trim()) return false;
        const m = v.trim().match(/^(\d{2,5})\s*(?:-|\.\.)\s*(\d{2,5})$/);
        if (!m) return false;
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        return Number.isFinite(start) && Number.isFinite(end) && start >= 1024 && end <= 65535 && start <= end;
      };
      const isValidPortArray = (v) => {
        if (!Array.isArray(v) || v.length === 0) return false;
        return v.every((p) => {
          const n = parseInt(p, 10);
          return Number.isFinite(n) && n >= 1024 && n <= 65535;
        });
      };
      if (!(isValidRangeString(cfg) || isValidPortArray(cfg))) {
        throw new SystemSettingsError(
          400,
          'ports.subscriberPortPool must be a range string like "5100-5500" (or "5100..5500"), or an array of ports'
        );
      }
    }
  }

  if (settings.serverRole) {
    const { role, publisherUrl, serverId, enablePublisher, enableSubscriber } = settings.serverRole;
    if (!role || !['publisher', 'subscriber'].includes(role)) {
      throw new SystemSettingsError(400, 'Server role must be either "publisher" or "subscriber"');
    }
    if (!serverId || !serverId.trim()) {
      throw new SystemSettingsError(400, 'Server ID is required');
    }
    const willEnablePublisher = enablePublisher !== undefined ? !!enablePublisher : (role === 'publisher');
    const willEnableSubscriber = enableSubscriber !== undefined ? !!enableSubscriber : (role === 'subscriber');
    if (willEnableSubscriber && !willEnablePublisher && (!publisherUrl || !publisherUrl.trim())) {
      throw new SystemSettingsError(
        400,
        'Publisher Server URL is required when subscriber is enabled without local publisher'
      );
    }
  }

  if (settings.recordings?.uploadChunkSeconds !== undefined && settings.recordings.uploadChunkSeconds !== null) {
    const seconds = parseInt(settings.recordings.uploadChunkSeconds, 10);
    if (!Number.isFinite(seconds) || Number.isNaN(seconds)) {
      throw new SystemSettingsError(400, 'recordings.uploadChunkSeconds must be an integer');
    }
    if (seconds < 10 || seconds > 30) {
      throw new SystemSettingsError(400, 'recordings.uploadChunkSeconds must be between 10 and 30 seconds');
    }
    settings.recordings.uploadChunkSeconds = seconds;
  }
}

function mergeSettings(existing, update) {
  const merged = { ...existing };
  const sensitiveFields = {
    zoom: ['clientSecret'],
    sip: ['password'],
    matrix: ['accessToken'],
    federation: ['federationSecret'],
    activeDirectory: ['bindPassword'],
  };

  for (const [key, value] of Object.entries(update)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      merged[key] = { ...(merged[key] || {}), ...value };
      if (sensitiveFields[key]) {
        for (const field of sensitiveFields[key]) {
          if (value[field] && value[field].trim() !== '') {
            merged[key][field] = value[field];
          }
        }
      }
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

module.exports = {
  resolveSettingsId,
  ensureDefaults,
  buildEnvDefaults,
  validateSettingsUpdate,
  mergeSettings,
};
