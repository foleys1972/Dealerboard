const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const SocketHandler = require('../socketHandlers');

function getUserIdFromReq(req) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_ACCESS_TOKEN_SECRET || 'dev_secret');
    return String(payload?.userId || payload?.id || payload?.sub || '');
  } catch {
    return null;
  }
}

router.get('/missed', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    // Access singleton socket handler via app locals if available
    const handler = req.app.locals?.socketHandler;
    if (!handler || !handler.missedCalls) return res.json({ missed: [] });
    const list = handler.missedCalls.get(String(userId)) || [];
    res.json({ missed: list });
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch missed calls' });
  }
});

router.delete('/missed/:id', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const handler = req.app.locals?.socketHandler;
    if (!handler || !handler.missedCalls) return res.json({ ok: true });
    const key = String(userId);
    const id = String(req.params.id);
    const list = handler.missedCalls.get(key) || [];
    const next = list.filter(item => String(item.id) !== id);
    handler.missedCalls.set(key, next);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Failed to delete missed call' });
  }
});

module.exports = router;


