import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.REPORTING_DATABASE_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('[reporting-server] DATABASE_URL is not set; DB calls will fail until configured.');
}

export const pool = new Pool({
  connectionString,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
});


