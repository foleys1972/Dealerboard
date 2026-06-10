const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../server/routes/webrtcRoutes.js');
const outDir = path.join(__dirname, '../server/routes/webrtc');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

fs.mkdirSync(outDir, { recursive: true });

const mediaSoupImports = `const {
  getRouter,
  getWorker,
  createGroupRouter,
  getOrCreateRouter,
  createWebRtcTransport,
  createPlainTransport,
  getTransportById,
  connectTransport,
  produceMedia,
  createConsumer,
  getRouterRtpCapabilities,
  getProducersByGroup,
  getGroupRouter,
  listGroupRouterIds,
  getSFUStats,
} = require('../../services/mediaSoupService');
const { audioRecordingService } = require('../../services/audioRecordingService');
const logger = require('../../utils/logger');
const { getScopedGroupId } = require('./routeHelpers');
`;

const header = `const express = require('express');
const router = express.Router();
${mediaSoupImports}`;

function writeSection(name, ranges) {
  const body = ranges
    .map(([start, end]) => lines.slice(start - 1, end).join('\n'))
    .join('\n\n');
  fs.writeFileSync(path.join(outDir, name), `${header}${body}\n\nmodule.exports = router;\n`);
}

writeSection('debug.routes.js', [[56, 112]]);
writeSection('rtp.routes.js', [[115, 157]]);
writeSection('plain.routes.js', [[159, 271]]);
writeSection('transport.routes.js', [[274, 312]]);
writeSection('media.routes.js', [[315, 335], [367, 399]]);
writeSection('legacy.routes.js', [[337, 364], [402, 430]]);
writeSection('lifecycle.routes.js', [[433, 506]]);
writeSection('inventory.routes.js', [[509, 574]]);
writeSection('control.routes.js', [[577, 714]]);

fs.writeFileSync(
  path.join(outDir, 'index.js'),
  `const express = require('express');
const router = express.Router();
const { attachAuthMiddleware } = require('./routeHelpers');

attachAuthMiddleware(router);

router.use(require('./debug.routes'));
router.use(require('./rtp.routes'));
router.use(require('./plain.routes'));
router.use(require('./transport.routes'));
router.use(require('./media.routes'));
router.use(require('./legacy.routes'));
router.use(require('./lifecycle.routes'));
router.use(require('./inventory.routes'));
router.use(require('./control.routes'));

module.exports = router;
`
);

console.log('WebRTC routes split complete');
