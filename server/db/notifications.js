const { pool } = require('./pool');

async function createUserNotification(notification) {
  const {
    id,
    userId,
    type,
    title,
    message,
    metadata = {},
    createdAt
  } = notification;

  await pool.query(
    `
      INSERT INTO user_notifications (id, user_id, type, title, message, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, NOW()))
      ON CONFLICT (id) DO NOTHING
    `,
    [
      String(id),
      String(userId),
      String(type),
      title != null ? String(title) : null,
      message != null ? String(message) : null,
      JSON.stringify(metadata || {}),
      createdAt ? new Date(createdAt) : null,
    ]
  );
}

async function getUserNotifications(userId, opts = {}) {
  const limit = Math.max(1, Math.min(parseInt(opts.limit || 50, 10) || 50, 200));
  const type = opts.type ? String(opts.type) : null;

  const values = [String(userId)];
  let where = 'WHERE user_id = $1';
  if (type) {
    values.push(type);
    where += ` AND type = $${values.length}`;
  }
  values.push(limit);

  const result = await pool.query(
    `
      SELECT id, user_id, type, title, message, metadata, created_at
      FROM user_notifications
      ${where}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    metadata: r.metadata || {},
    createdAt: r.created_at,
  }));
}

async function deleteUserNotification(userId, id) {
  await pool.query(
    `DELETE FROM user_notifications WHERE user_id = $1 AND id = $2`,
    [String(userId), String(id)]
  );
}

module.exports = {
  createUserNotification,
  getUserNotifications,
  deleteUserNotification,
};
