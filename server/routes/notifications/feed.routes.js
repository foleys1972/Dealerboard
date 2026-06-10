const express = require('express');
const router = express.Router();
const { getUserNotifications, deleteUserNotification, createUserNotification } = require('../../services/databaseService');
const { getUserIdFromReq } = require('./routeHelpers');

router.post('/', async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body || {};
    const type = String(body.type || 'info');
    const title = body.title != null ? String(body.title) : null;
    const message = body.message != null ? String(body.message) : null;

    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await createUserNotification({
      id,
      userId: String(userId),
      type,
      title,
      message,
      metadata,
    });

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

router.get('/missed', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    getUserNotifications(String(userId), { type: 'missed-call', limit: 100 })
      .then((list) => res.json({ missed: list }))
      .catch(() => res.json({ missed: [] }));
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch missed calls' });
  }
});

router.get('/', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const type = req.query?.type ? String(req.query.type) : null;
    const limit = req.query?.limit ? parseInt(String(req.query.limit), 10) : 50;

    getUserNotifications(String(userId), {
      type: type || undefined,
      limit: Number.isNaN(limit) ? 50 : limit,
    })
      .then((list) => res.json({ notifications: list }))
      .catch(() => res.json({ notifications: [] }));
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

router.delete('/missed/:id', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const id = String(req.params.id);
    deleteUserNotification(String(userId), id)
      .then(() => res.json({ ok: true }))
      .catch(() => res.json({ ok: true }));
  } catch {
    res.status(500).json({ message: 'Failed to delete missed call' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const id = String(req.params.id);
    deleteUserNotification(String(userId), id)
      .then(() => res.json({ ok: true }))
      .catch(() => res.json({ ok: true }));
  } catch {
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

module.exports = router;
