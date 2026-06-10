/**
 * Splits server/socketHandlers.js into attachable handler modules.
 * Run from repo root: node server/scripts/split-socket-handlers.js
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'socketHandlers.js');
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

const outDir = path.join(__dirname, '..', 'socket', 'handlers');
fs.mkdirSync(outDir, { recursive: true });

function toPrototypeMethods(body) {
  return body
    .split('\n')
    .map((line) => {
      const asyncMatch = line.match(/^  async ([a-zA-Z0-9_]+)\(/);
      if (asyncMatch) {
        return line.replace(/^  async ([a-zA-Z0-9_]+)\(/, '  SocketHandler.prototype.$1 = async function(');
      }
      const syncMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_]*)\(/);
      if (syncMatch) {
        return line.replace(/^  ([a-zA-Z_][a-zA-Z0-9_]*)\(/, '  SocketHandler.prototype.$1 = function(');
      }
      return line;
    })
    .join('\n');
}

const header = `const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');
`;

const chunks = [
  { file: 'sipLine.js', start: 30, end: 255, exportName: 'attachSipLineHandlers' },
  { file: 'presence.js', start: 257, end: 632, exportName: 'attachPresenceHandlers' },
  { file: 'instantIntercom.js', start: 634, end: 925, exportName: 'attachInstantIntercomHandlers' },
  { file: 'auth.js', start: 1148, end: 1278, exportName: 'attachAuthHandlers' },
  { file: 'mediaRoom.js', start: 1280, end: 1570, exportName: 'attachMediaRoomHandlers' },
  { file: 'groups.js', start: 1572, end: 1614, exportName: 'attachGroupHandlers' },
  { file: 'broadcast.js', start: 1616, end: 1822, exportName: 'attachBroadcastHandlers' },
  { file: 'instantConnect.js', start: 1824, end: 2761, exportName: 'attachInstantConnectHandlers' },
  { file: 'groupCallEvents.js', start: 2775, end: 2994, exportName: 'attachGroupCallEventHandlers' },
  { file: 'helpers.js', start: 3000, end: 3023, exportName: 'attachHelperHandlers' },
];

for (const chunk of chunks) {
  const body = toPrototypeMethods(lines.slice(chunk.start - 1, chunk.end).join('\n'));
  const content = `${header}
function ${chunk.exportName}(SocketHandler) {
${body}
}

module.exports = { ${chunk.exportName} };
`;
  fs.writeFileSync(path.join(outDir, chunk.file), content);
}

// setupHandlers stays in main file but extract to setup.js for clarity
const setupBody = toPrototypeMethods(lines.slice(926 - 1, 1146).join('\n'));
const setupContent = `${header}
function attachSetupHandlers(SocketHandler) {
${setupBody}
}

module.exports = { attachSetupHandlers };
`;
fs.writeFileSync(path.join(outDir, 'setup.js'), setupContent);

console.log('Socket handler modules written to', outDir);
