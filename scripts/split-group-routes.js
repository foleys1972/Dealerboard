const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../server/routes/groupRoutes.js');
const outDir = path.join(__dirname, '../server/routes/groups');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

fs.mkdirSync(outDir, { recursive: true });

const sharedBody = lines.slice(9, 39).join('\n');
fs.writeFileSync(
  path.join(outDir, 'shared.js'),
  `const { getUserByIdOrUsername } = require('../../services/databaseService');
const logger = require('../../utils/logger');

${sharedBody}

module.exports = { hydrateParticipants };
`
);

const headers = {
  core: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const logger = require('../../utils/logger');
const { normalizeCallModeForDb } = require('../../utils/groupCallMode');
`,
  audio: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const { audioRecordingService } = require('../../services/audioRecordingService');
const logger = require('../../utils/logger');
`,
  broadcast: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const logger = require('../../utils/logger');
`,
  stats: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const logger = require('../../utils/logger');
`,
  participants: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const { getUserByIdOrUsername } = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { hydrateParticipants } = require('./shared');
`,
  hoot: `const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const logger = require('../../utils/logger');
`,
};

function writeRoute(name, headerKey, startLine, endLine, extraRanges = []) {
  const chunks = [[startLine, endLine], ...extraRanges].map(([start, end]) =>
    lines.slice(start - 1, end).join('\n')
  );
  const body = chunks.join('\n\n');
  fs.writeFileSync(
    path.join(outDir, name),
    `${headers[headerKey]}${body}\n\nmodule.exports = router;\n`
  );
}

writeRoute('stats.routes.js', 'stats', 415, 428, [
  [397, 413],
]);

writeRoute('core.routes.js', 'core', 42, 250);
writeRoute('audio.routes.js', 'audio', 252, 361);
writeRoute('broadcast.routes.js', 'broadcast', 364, 395);
writeRoute('participants.routes.js', 'participants', 431, 580);
writeRoute('hoot.routes.js', 'hoot', 583, 678);

fs.writeFileSync(
  path.join(outDir, 'index.js'),
  `const express = require('express');
const router = express.Router();

router.use(require('./stats.routes'));
router.use(require('./core.routes'));
router.use(require('./audio.routes'));
router.use(require('./broadcast.routes'));
router.use(require('./participants.routes'));
router.use(require('./hoot.routes'));

module.exports = router;
`
);

console.log('Group routes split complete');
