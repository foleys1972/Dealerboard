const fs = require('fs');
const { Pool } = require('pg');
const logger = require('../utils/logger');

function buildSslConfig() {
  if (!parseBoolean(process.env.POSTGRES_SSL || 'false')) {
    return undefined;
  }

  // Certificate verification is ON by default. Set
  // POSTGRES_SSL_REJECT_UNAUTHORIZED=false only for self-signed dev setups.
  const rejectUnauthorized = parseBoolean(
    process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? 'true'
  );

  if (!rejectUnauthorized) {
    logger.warn('POSTGRES_SSL_REJECT_UNAUTHORIZED=false — Postgres TLS certificate verification is disabled');
  }

  const ssl = { rejectUnauthorized };

  // Optional CA bundle for self-managed/internal CAs
  if (process.env.POSTGRES_SSL_CA_FILE) {
    try {
      ssl.ca = fs.readFileSync(process.env.POSTGRES_SSL_CA_FILE, 'utf8');
    } catch (error) {
      logger.error(`Failed to read POSTGRES_SSL_CA_FILE (${process.env.POSTGRES_SSL_CA_FILE}): ${error.message}`);
      throw error;
    }
  }

  return ssl;
}

const DEFAULT_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'trading_intercom',
  user: process.env.POSTGRES_USER || 'intercom_app',
  password: process.env.POSTGRES_PASSWORD || 'intercom',
  max: parseInt(process.env.POSTGRES_POOL_MAX || '20', 10),
  ssl: buildSslConfig(),
};

const pool = new Pool(DEFAULT_CONFIG);

pool.on('error', (error) => {
  logger.error('Unexpected Postgres error', error);
});

function parseBoolean(value) {
  if (!value) return false;
  return value === true || value.toString().toLowerCase() === 'true';
}

module.exports = { pool, parseBoolean };
