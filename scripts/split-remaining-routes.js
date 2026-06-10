const fs = require('fs');
const path = require('path');

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

function sliceLines(lines, start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function fixImports(content) {
  return content
    .replace(/require\('\.\.\/services/g, "require('../../services")
    .replace(/require\('\.\.\/middleware/g, "require('../../middleware")
    .replace(/require\('\.\.\/utils/g, "require('../../utils")
    .replace(/require\('\.\/authRoutes/g, "require('../authRoutes");
}

function writeRouteFile(outDir, name, header, body) {
  fs.writeFileSync(
    path.join(outDir, name),
    `${header}${fixImports(body)}\n\nmodule.exports = router;\n`
  );
}

function writeIndex(outDir, middleware, mounts) {
  const middlewareBlock = middleware
    ? `const express = require('express');
const router = express.Router();
${middleware}

`
    : `const express = require('express');
const router = express.Router();

`;

  const mountBlock = mounts.map((m) => `router.use(require('./${m}'));`).join('\n');

  fs.writeFileSync(
    path.join(outDir, 'index.js'),
    `${middlewareBlock}${mountBlock}

module.exports = router;
`
  );
}

function stub(originalPath, folderName) {
  fs.writeFileSync(originalPath, `module.exports = require('./${folderName}');\n`);
}

// --- compliance ---
{
  const src = path.join(__dirname, '../server/routes/complianceRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/compliance');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  const complianceHeader = `const express = require('express');
const router = express.Router();
const { complianceService } = require('../../services/complianceService');
const logger = require('../../utils/logger');
`;

  const encryptionHeader = `const express = require('express');
const router = express.Router();
const { encryptionService } = require('../../services/encryptionService');
const logger = require('../../utils/logger');
`;

  writeRouteFile(outDir, 'status.routes.js', complianceHeader, sliceLines(lines, 11, 90));
  writeRouteFile(outDir, 'actions.routes.js', complianceHeader, sliceLines(lines, 93, 206));
  writeRouteFile(
    outDir,
    'encryption.routes.js',
    encryptionHeader,
    sliceLines(lines, 209, 368)
  );

  const exportBody = `${sliceLines(lines, 371, 411)}

${sliceLines(lines, 413, 424)}`;
  writeRouteFile(outDir, 'export.routes.js', complianceHeader, exportBody);

  fs.writeFileSync(
    path.join(outDir, 'shared.js'),
    `const { complianceService } = require('../../services/complianceService');

${sliceLines(lines, 413, 424)}

module.exports = { convertToCSV };
`
  );

  writeIndex(
    outDir,
    `const { authenticateToken, requirePlatformAdmin } = require('../../middleware/auth');
router.use(authenticateToken, requirePlatformAdmin);`,
    ['status.routes', 'actions.routes', 'encryption.routes', 'export.routes']
  );

  // export.routes needs convertToCSV - add import
  const exportPath = path.join(outDir, 'export.routes.js');
  let exportContent = fs.readFileSync(exportPath, 'utf8');
  exportContent = exportContent.replace(
    "const logger = require('../../utils/logger');",
    "const logger = require('../../utils/logger');\nconst { convertToCSV } = require('./shared');"
  );
  exportContent = exportContent.replace(/\nfunction convertToCSV[\s\S]*?\n}\n\nmodule\.exports/, '\n\nmodule.exports');
  fs.writeFileSync(exportPath, exportContent);

  stub(path.join(__dirname, '../server/routes/complianceRoutes.js'), 'compliance');
  console.log('compliance split complete');
}

// --- federation ---
{
  const src = path.join(__dirname, '../server/routes/federationRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/federation');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  const header = `const express = require('express');
const router = express.Router();
const { federationService } = require('../../services/federationService');
const logger = require('../../utils/logger');
`;

  writeRouteFile(outDir, 'peers.routes.js', header, sliceLines(lines, 10, 112));
  writeRouteFile(outDir, 'sync.routes.js', header, sliceLines(lines, 115, 222));
  writeRouteFile(outDir, 'messaging.routes.js', header, sliceLines(lines, 225, 270));
  writeRouteFile(outDir, 'admin.routes.js', header, sliceLines(lines, 273, 401));

  writeIndex(
    outDir,
    `const { requireFederationOrPlatformAdmin } = require('../../middleware/auth');
router.use(requireFederationOrPlatformAdmin);`,
    ['peers.routes', 'sync.routes', 'messaging.routes', 'admin.routes']
  );

  stub(path.join(__dirname, '../server/routes/federationRoutes.js'), 'federation');
  console.log('federation split complete');
}

// --- zoom ---
{
  const src = path.join(__dirname, '../server/routes/zoomRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/zoom');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  const header = `const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../authRoutes');
const { getZoomService } = require('../../services/zoomService');
const logger = require('../../utils/logger');
`;

  writeRouteFile(outDir, 'auth.routes.js', header, sliceLines(lines, 14, 210));
  writeRouteFile(outDir, 'meetings.routes.js', header, sliceLines(lines, 213, 327));
  writeRouteFile(outDir, 'bridge.routes.js', header, sliceLines(lines, 330, 423));

  writeIndex(outDir, null, ['auth.routes', 'meetings.routes', 'bridge.routes']);
  stub(path.join(__dirname, '../server/routes/zoomRoutes.js'), 'zoom');
  console.log('zoom split complete');
}

// --- teams ---
{
  const src = path.join(__dirname, '../server/routes/teamsRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/teams');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  const header = `const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getTeamsService } = require('../../services/teamsService');
const logger = require('../../utils/logger');
`;

  writeRouteFile(outDir, 'auth.routes.js', header, sliceLines(lines, 8, 136));
  writeRouteFile(outDir, 'meetings.routes.js', header, sliceLines(lines, 139, 254));
  writeRouteFile(outDir, 'bridge.routes.js', header, sliceLines(lines, 257, 353));

  writeIndex(outDir, null, ['auth.routes', 'meetings.routes', 'bridge.routes']);
  stub(path.join(__dirname, '../server/routes/teamsRoutes.js'), 'teams');
  console.log('teams split complete');
}

// --- userIntercom ---
{
  const src = path.join(__dirname, '../server/routes/userIntercomRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/userIntercom');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'routeHelpers.js'),
    `const { getUserByIdOrUsername, updateUser, findGroups } = require('../../services/databaseService');
const gridConfigService = require('../../services/userIntercom/gridConfigService');

${sliceLines(lines, 9, 91)}

module.exports = {
  normalizeBoolean,
  resolveTargetUser,
  normalizeStringArray,
  normalizeCallMode,
  isBroadcastGroup,
  isSelfRequest,
  ensureCanConfigureUser,
  getUserByIdOrUsername,
  updateUser,
  findGroups,
  gridConfigService,
  DEFAULT_GRID_CONFIG: gridConfigService.DEFAULT_GRID_CONFIG,
};
`
  );

  const gridHeader = `const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const logger = require('../../utils/logger');
const {
  gridConfigService,
  DEFAULT_GRID_CONFIG,
} = require('./routeHelpers');
`;

  const userHeader = `const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const logger = require('../../utils/logger');
const {
  resolveTargetUser,
  ensureCanConfigureUser,
  normalizeStringArray,
  normalizeBoolean,
  isBroadcastGroup,
  getUserByIdOrUsername,
  updateUser,
  findGroups,
} = require('./routeHelpers');
`;

  writeRouteFile(outDir, 'grid.routes.js', gridHeader, sliceLines(lines, 94, 124));
  writeRouteFile(
    outDir,
    'broadcast.routes.js',
    userHeader,
    `${sliceLines(lines, 127, 234)}\n\n${sliceLines(lines, 236, 260)}`
  );
  writeRouteFile(outDir, 'config.routes.js', userHeader, sliceLines(lines, 262, 422));

  writeIndex(outDir, null, ['grid.routes', 'broadcast.routes', 'config.routes']);
  stub(path.join(__dirname, '../server/routes/userIntercomRoutes.js'), 'userIntercom');
  console.log('userIntercom split complete');
}

// --- adminStats ---
{
  const src = path.join(__dirname, '../server/routes/adminStatsRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/adminStats');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  const basicHeader = `const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../../utils/logger');
const { groupService } = require('../../services/groupService');
const { findUsers } = require('../../services/databaseService');
`;

  const authHeader = `const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../../utils/logger');
const { groupService } = require('../../services/groupService');
const { findUsers } = require('../../services/databaseService');
const { authenticateToken } = require('../authRoutes');
const { adminOnly } = require('../../middleware/roleCheck');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getArchiveHealth } = require('../../services/recordingArchiveService');
const { getRecordingReconcileHealth } = require('../../services/recordingReconcileService');
`;

  writeRouteFile(outDir, 'health.routes.js', basicHeader, sliceLines(lines, 13, 33));
  writeRouteFile(
    outDir,
    'stats.routes.js',
    basicHeader,
    `${sliceLines(lines, 36, 90)}\n\n${sliceLines(lines, 93, 147)}`
  );
  writeRouteFile(outDir, 'healthCheck.routes.js', authHeader, sliceLines(lines, 150, 323));
  writeRouteFile(outDir, 'sipHa.routes.js', authHeader, sliceLines(lines, 326, 353));

  writeIndex(outDir, null, ['health.routes', 'stats.routes', 'healthCheck.routes', 'sipHa.routes']);
  stub(path.join(__dirname, '../server/routes/adminStatsRoutes.js'), 'adminStats');
  console.log('adminStats split complete');
}

// --- groupCalls ---
{
  const src = path.join(__dirname, '../server/routes/groupCallRoutes.js');
  const outDir = path.join(__dirname, '../server/routes/groupCalls');
  const lines = readLines(src);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'routeHelpers.js'),
    `const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration
} = require('../../services/databaseService');
const logger = require('../../utils/logger');
const crypto = require('crypto');

function getSocketHandler(req) {
  return req.app?.locals?.socketHandler;
}

module.exports = {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
  getSocketHandler,
  logger,
  crypto,
};
`
  );

  const header = `const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
  getSocketHandler,
  logger,
  crypto,
} = require('./routeHelpers');
`;

  writeRouteFile(outDir, 'initiate.routes.js', header, sliceLines(lines, 27, 99));
  writeRouteFile(outDir, 'answer.routes.js', header, sliceLines(lines, 101, 240));
  writeRouteFile(
    outDir,
    'lifecycle.routes.js',
    header,
    `${sliceLines(lines, 244, 287)}\n\n${sliceLines(lines, 291, 329)}`
  );

  writeIndex(outDir, null, ['initiate.routes', 'answer.routes', 'lifecycle.routes']);
  stub(path.join(__dirname, '../server/routes/groupCallRoutes.js'), 'groupCalls');
  console.log('groupCalls split complete');
}

console.log('All remaining route splits complete');
