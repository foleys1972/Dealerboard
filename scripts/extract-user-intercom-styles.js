const fs = require('fs');
const path = require('path');

const componentPath = path.join(
  __dirname,
  '..',
  'client',
  'src',
  'pages',
  'UserIntercom',
  'UserIntercom.js'
);

const lines = fs.readFileSync(componentPath, 'utf8').split(/\r?\n/);
const styleStart = lines.findIndex((l) => l.trim() === '// Styled Components');
if (styleStart < 0) {
  console.error('Could not find // Styled Components marker');
  process.exit(1);
}

const styleLines = lines.slice(styleStart + 1);
const exportNames = [];
const styledBody = [];

for (const line of styleLines) {
  const m = /^const ([A-Z][A-Za-z0-9]*) = styled/.exec(line);
  if (m) {
    exportNames.push(m[1]);
    styledBody.push(`export ${line}`);
  } else {
    styledBody.push(line);
  }
}

const stylesPath = path.join(
  __dirname,
  '..',
  'client',
  'src',
  'pages',
  'UserIntercom',
  'UserIntercom.styles.js'
);

fs.writeFileSync(
  stylesPath,
  `import styled from 'styled-components';\n\n${styledBody.join('\n').trimEnd()}\n`
);

const componentLines = lines.slice(0, styleStart);
const importLines = [
  'import {',
  ...exportNames.map((n) => `  ${n},`),
  "} from './UserIntercom.styles';",
];

let lastImport = 0;
for (let i = 0; i < componentLines.length; i++) {
  if (componentLines[i].startsWith('import ')) lastImport = i;
}

componentLines.splice(lastImport + 1, 0, ...importLines);

fs.writeFileSync(
  componentPath,
  `${componentLines.join('\n').trimEnd()}\n\nexport default UserIntercom;\n`
);

console.log(`Extracted ${exportNames.length} styled components to UserIntercom.styles.js`);
