import 'dotenv/config';

import express from 'express';

import { pool } from './lib/db.js';
import { bearerAuth } from './lib/auth.js';
import { ingestRouter } from './routes/ingest.js';
import { queryRouter } from './routes/query.js';

const app = express();

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

app.get('/api/v1/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'uc-sentinel' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_unhealthy' });
  }
});

app.use('/api/v1/ingest', bearerAuth, ingestRouter);
app.use('/api/v1/query', bearerAuth, queryRouter);

const port = parseInt(process.env.PORT || '8800', 10);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`UC Sentinel listening on :${port}`);
});
