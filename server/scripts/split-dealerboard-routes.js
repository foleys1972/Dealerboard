const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'routes', 'dealerboardRoutes.js');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

const outDir = path.join(__dirname, '..', 'routes', 'dealerboard');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'services', 'dealerboard'), { recursive: true });

const routeHeader = `const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool, allocateSixDigitAor } = require('../../services/databaseService');
const { groupService } = require('../../services/groupService');
const { authenticateToken } = require('../authRoutes');
const { getSIPGateway } = require('../../services/sipService');
const { getSIPMatrixBridge } = require('../../services/sipMatrixBridge');
const { applyDialPlan, normalizeDigits } = require('../../services/dialPlanService');
const logger = require('../../utils/logger');
const {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
  isAdminRole,
  resolveUserDbId,
  getDealerboardConfigGroup,
  shouldPropagateDealerboardAssignment,
  syncDealerboardAssignmentsFromUser,
} = require('./shared');
`;

const lineOpsHeader = `${routeHeader}const {
  ensureMatrixRoomForLine,
  bridgeActiveSIPCallsToMatrixRoom,
} = require('../../services/dealerboard/lineSessionService');

`;

const sections = [
  { file: 'privateWires.routes.js', start: 216, end: 1032, header: routeHeader },
  { file: 'ddiLines.routes.js', start: 1034, end: 1231, header: routeHeader },
  { file: 'lines.routes.js', start: 1233, end: 1593, header: routeHeader },
  { file: 'speedDials.routes.js', start: 1595, end: 1794, header: routeHeader },
  { file: 'assignments.routes.js', start: 1796, end: 2325, header: routeHeader },
  { file: 'preferences.routes.js', start: 2327, end: 2541, header: routeHeader },
  { file: 'groups.routes.js', start: 2543, end: 2795, header: routeHeader },
  { file: 'copyUser.routes.js', start: 2797, end: 2872, header: routeHeader },
  { file: 'lineOperations.routes.js', start: 3085, end: 4260, header: lineOpsHeader },
];

for (const s of sections) {
  const body = lines.slice(s.start - 1, s.end).join('\n');
  const content = `${s.header}\n${body}\n\nmodule.exports = router;\n`;
  fs.writeFileSync(path.join(outDir, s.file), content);
}

const index = `const express = require('express');
const router = express.Router();

router.use(require('./privateWires.routes'));
router.use(require('./ddiLines.routes'));
router.use(require('./lines.routes'));
router.use(require('./speedDials.routes'));
router.use(require('./assignments.routes'));
router.use(require('./preferences.routes'));
router.use(require('./groups.routes'));
router.use(require('./copyUser.routes'));
router.use(require('./lineOperations.routes'));

module.exports = router;
`;

fs.writeFileSync(path.join(outDir, 'index.js'), index);

console.log('Dealerboard route files written to', outDir);
