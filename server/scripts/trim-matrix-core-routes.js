const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../routes/matrix/core.routes.js');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /\/\/ Create a new chat room[\s\S]*?\/\/ Join Matrix room\n/,
  '// Join Matrix room\n'
);

content = content.replace(
  /const multer = require\('multer'\);\r?\nconst upload = multer\(\{[\s\S]*?\}\);\r?\n\r?\nrouter\.post\('\/room\/:roomId\/upload'/,
  "router.post('/room/:roomId/upload'"
);

content = content.replace(
  /\/\/ Get or create direct message room[\s\S]*?\/\/ Sync group with Matrix room\n/,
  '// Sync group with Matrix room\n'
);

content = content.replace(
  /\/\/ Get participants for a Matrix room[\s\S]*?\/\/ Get all Matrix room mappings\n/,
  '// Get all Matrix room mappings\n'
);

content = content.replace(
  /router\.get\('\/rooms', authenticateToken, async \(req, res\) => \{[\s\S]*?\}\);\r?\n\r?\n\/\/ Handle Matrix webhook/,
  `router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    const { isAdminRole } = require('../../services/dealerboard/validators');
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const result = await listRoomMappings(matrixService);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get room mappings');
  }
});

// Handle Matrix webhook`
);

content = content.replace(
  /\/\/ ============================================\r?\n\/\/ Matrix Homeserver Registry Routes[\s\S]*?(?=module\.exports = router;)/,
  ''
);

fs.writeFileSync(filePath, content);
const remaining = (content.match(/pool\.query/g) || []).length;
console.log(`trimmed core.routes.js; ${remaining} pool.query remaining`);
