/**
 * Database Migration Script
 * 
 * Runs database initialization to add new columns and tables.
 * This should be run after code updates that add new schema elements.
 * 
 * Usage: node server/scripts/migrateDatabase.js
 */

require('dotenv').config();
const { initializeDatabase } = require('../services/databaseService');
const logger = require('../utils/logger');

async function runMigration() {
  try {
    logger.info('Starting database migration...');
    await initializeDatabase();
    logger.info('✅ Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

runMigration();

