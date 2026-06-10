const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const rootDir = path.dirname(process.execPath);
process.chdir(rootDir);

const entryRel = './server/index.js';
const entryPath = path.join(rootDir, 'server', 'index.js');
if (!fs.existsSync(entryPath)) {
  console.error(`Missing entry file: ${entryPath}`);
  process.exit(1);
}

const diskRequire = createRequire(path.join(rootDir, 'package.json'));
diskRequire(entryRel);
