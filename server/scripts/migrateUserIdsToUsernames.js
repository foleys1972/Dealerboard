/**
 * Migration Script: Replace old user IDs with usernames
 * 
 * This script migrates the database to use usernames as the primary identifier
 * instead of the old numeric IDs (e.g., "user-1763220052582" -> "test1")
 * 
 * WARNING: This is a destructive operation. Make sure to backup your database first!
 * 
 * Usage: node server/scripts/migrateUserIdsToUsernames.js
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const DEFAULT_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'trading_intercom',
  user: process.env.POSTGRES_USER || 'intercom_app',
  password: process.env.POSTGRES_PASSWORD || 'intercom',
  ssl: process.env.POSTGRES_SSL === 'true' ? {
    rejectUnauthorized: false,
  } : undefined,
};

const pool = new Pool(DEFAULT_CONFIG);

// Tables that reference users.id via foreign keys
const TABLES_WITH_USER_REFERENCES = [
  { table: 'group_participants', column: 'user_id' },
  { table: 'user_favorites', column: 'user_id' },
  { table: 'user_favorite_groups', column: 'user_id' },
  { table: 'user_homeserver_assignments', column: 'user_id' },
  { table: 'matrix_room_participants', column: 'user_id' },
  { table: 'dealerboard_line_sessions', column: 'user_id' },
  { table: 'dealerboard_speed_dials', column: 'user_id' },
  { table: 'dealerboard_button_assignments', column: 'user_id' },
  { table: 'dealerboard_group_members', column: 'user_id' },
  { table: 'call_sessions', columns: ['initiator_user_id', 'first_answerer_user_id', 'broadcast_activator_user_id'] },
  { table: 'recordings', column: 'recording_user_id' },
  { table: 'direct_contacts', columns: ['owner_id', 'contact_user_id'] },
  { table: 'zoom_integrations', column: 'user_id' },
  { table: 'zoom_meetings', column: 'user_id' },
  { table: 'teams_integrations', column: 'user_id' },
  { table: 'teams_meetings', column: 'user_id' },
];

async function migrateUserIdsToUsernames() {
  const client = await pool.connect();
  
  try {
    logger.info('🚀 Starting user ID to username migration...');
    await client.query('BEGIN');

    // Step 1: Get all users and create a mapping of old ID -> username
    logger.info('📋 Step 1: Fetching all users...');
    const usersResult = await client.query('SELECT id, username FROM users WHERE id != username');
    const userIdMapping = {};
    
    // Safety check: Ensure no username conflicts
    const usernames = new Set();
    for (const row of usersResult.rows) {
      if (usernames.has(row.username)) {
        throw new Error(`Duplicate username found: ${row.username}. Cannot migrate - usernames must be unique.`);
      }
      usernames.add(row.username);
      
      // Check if username already exists as an ID (shouldn't happen, but safety check)
      const existingUser = await client.query('SELECT id FROM users WHERE id = $1', [row.username]);
      if (existingUser.rows.length > 0 && existingUser.rows[0].id !== row.id) {
        throw new Error(`Username ${row.username} already exists as a user ID. Cannot migrate.`);
      }
      
      userIdMapping[row.id] = row.username;
      logger.info(`  Mapping: ${row.id} -> ${row.username}`);
    }

    if (Object.keys(userIdMapping).length === 0) {
      logger.info('✅ No users need migration. All user IDs already match usernames.');
      await client.query('ROLLBACK');
      return;
    }

    logger.info(`📊 Found ${Object.keys(userIdMapping).length} users to migrate`);

    // Step 2: Drop foreign key constraints temporarily (must be done before updating)
    logger.info('📋 Step 2: Dropping foreign key constraints...');
    
    const constraintsToDrop = [];
    
    // Get all foreign key constraints that reference users.id
    const fkResult = await client.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'id';
    `);
    
    for (const fk of fkResult.rows) {
      constraintsToDrop.push({
        table: fk.table_name,
        constraint: fk.constraint_name,
        column: fk.column_name
      });
    }

    // Drop constraints and track which ones were actually dropped
    const droppedConstraints = [];
    for (const fk of constraintsToDrop) {
      try {
        // Check if constraint exists before trying to drop
        const exists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.table_constraints 
            WHERE constraint_name = $1 AND table_name = $2
          );
        `, [fk.constraint, fk.table]);
        
        if (exists.rows[0].exists) {
          await client.query(`ALTER TABLE ${fk.table} DROP CONSTRAINT ${fk.constraint}`);
          droppedConstraints.push(fk);
          logger.info(`  ✅ Dropped constraint ${fk.constraint} from ${fk.table}.${fk.column}`);
        } else {
          logger.info(`  ℹ️  Constraint ${fk.constraint} does not exist on ${fk.table}, skipping...`);
        }
      } catch (error) {
        logger.warn(`  ⚠️  Could not drop constraint ${fk.constraint}: ${error.message}`);
      }
    }

    // Step 3: Update all foreign key references in other tables
    logger.info('📋 Step 3: Updating foreign key references...');
    
    for (const tableRef of TABLES_WITH_USER_REFERENCES) {
      const table = tableRef.table;
      const columns = tableRef.columns || [tableRef.column];
      
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      
      if (!tableExists.rows[0].exists) {
        logger.warn(`  ⚠️  Table ${table} does not exist, skipping...`);
        continue;
      }

      for (const column of columns) {
        // Check if column exists
        const columnExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          );
        `, [table, column]);
        
        if (!columnExists.rows[0].exists) {
          logger.warn(`  ⚠️  Column ${table}.${column} does not exist, skipping...`);
          continue;
        }

        // Update each user ID reference
        for (const [oldId, username] of Object.entries(userIdMapping)) {
          const updateResult = await client.query(
            `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
            [username, oldId]
          );
          
          if (updateResult.rowCount > 0) {
            logger.info(`  ✅ Updated ${updateResult.rowCount} row(s) in ${table}.${column}: ${oldId} -> ${username}`);
          }
        }
      }
    }

    // Step 3: Update all foreign key references in other tables
    logger.info('📋 Step 3: Updating foreign key references...');
    
    for (const tableRef of TABLES_WITH_USER_REFERENCES) {
      const table = tableRef.table;
      const columns = tableRef.columns || [tableRef.column];
      
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      
      if (!tableExists.rows[0].exists) {
        logger.warn(`  ⚠️  Table ${table} does not exist, skipping...`);
        continue;
      }

      for (const column of columns) {
        // Check if column exists
        const columnExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          );
        `, [table, column]);
        
        if (!columnExists.rows[0].exists) {
          logger.warn(`  ⚠️  Column ${table}.${column} does not exist, skipping...`);
          continue;
        }

        // Update each user ID reference
        for (const [oldId, username] of Object.entries(userIdMapping)) {
          const updateResult = await client.query(
            `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
            [username, oldId]
          );
          
          if (updateResult.rowCount > 0) {
            logger.info(`  ✅ Updated ${updateResult.rowCount} row(s) in ${table}.${column}: ${oldId} -> ${username}`);
          }
        }
      }
    }

    // Step 4: Update users table - set id = username
    logger.info('📋 Step 4: Updating users table...');
    for (const [oldId, username] of Object.entries(userIdMapping)) {
      await client.query(
        `UPDATE users SET id = $1 WHERE id = $2`,
        [username, oldId]
      );
      logger.info(`  ✅ Updated user: ${oldId} -> ${username}`);
    }

    // Step 5: Validate data integrity before recreating constraints
    logger.info('📋 Step 5: Validating data integrity...');
    
    // Check for orphaned foreign key references
    for (const tableRef of TABLES_WITH_USER_REFERENCES) {
      const table = tableRef.table;
      const columns = tableRef.columns || [tableRef.column];
      
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );
      `, [table]);
      
      if (!tableExists.rows[0].exists) {
        continue;
      }

      for (const column of columns) {
        // Check if column exists
        const columnExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          );
        `, [table, column]);
        
        if (!columnExists.rows[0].exists) {
          continue;
        }

        // Check for orphaned references
        const orphanedResult = await client.query(`
          SELECT COUNT(*) as count
          FROM ${table} t
          WHERE t.${column} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM users u WHERE u.id = t.${column}
          );
        `);
        
        const orphanedCount = parseInt(orphanedResult.rows[0].count);
        if (orphanedCount > 0) {
          logger.warn(`  ⚠️  Found ${orphanedCount} orphaned references in ${table}.${column}`);
          // Show some examples
          const examples = await client.query(`
            SELECT DISTINCT ${column} 
            FROM ${table} 
            WHERE ${column} IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ${table}.${column})
            LIMIT 5;
          `);
          logger.warn(`  Examples: ${examples.rows.map(r => r[column]).join(', ')}`);
        } else {
          logger.info(`  ✅ ${table}.${column} - all references valid`);
        }
      }
    }

    // Step 6: Recreate foreign key constraints (only those that were dropped)
    logger.info('📋 Step 6: Recreating foreign key constraints...');
    
    // Build a map of dropped constraints for quick lookup
    const droppedConstraintsMap = new Map();
    for (const fk of droppedConstraints) {
      const key = `${fk.table}.${fk.column}`;
      if (!droppedConstraintsMap.has(key)) {
        droppedConstraintsMap.set(key, []);
      }
      droppedConstraintsMap.get(key).push(fk);
    }
    
    // Recreate constraints for each table (only if they were dropped)
    // Note: Some tables may not have named constraints, so we'll try to recreate them
    const constraintDefinitions = [
      { table: 'group_participants', column: 'user_id', constraint: 'group_participants_user_id_fkey', skipIfExists: true },
      { table: 'user_favorites', column: 'user_id', constraint: 'user_favorites_user_id_fkey', skipIfExists: true },
      { table: 'user_favorite_groups', column: 'user_id', constraint: 'user_favorite_groups_user_id_fkey', skipIfExists: true },
      { table: 'user_homeserver_assignments', column: 'user_id', constraint: 'user_homeserver_assignments_user_id_fkey', skipIfExists: true },
      { table: 'matrix_room_participants', column: 'user_id', constraint: 'matrix_room_participants_user_id_fkey', skipIfExists: true },
      { table: 'dealerboard_line_sessions', column: 'user_id', constraint: 'dealerboard_line_sessions_user_id_fkey', skipIfExists: true },
      { table: 'dealerboard_speed_dials', column: 'user_id', constraint: 'dealerboard_speed_dials_user_id_fkey', skipIfExists: true },
      { table: 'dealerboard_button_assignments', column: 'user_id', constraint: 'dealerboard_button_assignments_user_id_fkey', skipIfExists: true },
      { table: 'dealerboard_group_members', column: 'user_id', constraint: 'dealerboard_group_members_user_id_fkey', skipIfExists: true },
      { table: 'recordings', column: 'recording_user_id', constraint: 'recordings_recording_user_id_fkey', skipIfExists: true },
      { table: 'direct_contacts', column: 'owner_id', constraint: 'direct_contacts_owner_id_fkey', skipIfExists: true },
      { table: 'direct_contacts', column: 'contact_user_id', constraint: 'direct_contacts_contact_user_id_fkey', skipIfExists: true },
      { table: 'zoom_integrations', column: 'user_id', constraint: 'zoom_integrations_user_id_fkey', skipIfExists: true },
      { table: 'zoom_meetings', column: 'user_id', constraint: 'zoom_meetings_user_id_fkey', skipIfExists: true },
      { table: 'teams_integrations', column: 'user_id', constraint: 'teams_integrations_user_id_fkey', skipIfExists: true },
      { table: 'teams_meetings', column: 'user_id', constraint: 'teams_meetings_user_id_fkey', skipIfExists: true },
    ];

    for (const def of constraintDefinitions) {
      // Only recreate constraints that were actually dropped
      const key = `${def.table}.${def.column}`;
      const wasDropped = droppedConstraintsMap.has(key);
      
      if (!wasDropped) {
        logger.info(`  ℹ️  Constraint ${def.constraint} was not dropped, skipping recreation...`);
        continue;
      }
      
      // Check if table and column exist
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );
      `, [def.table]);
      
      if (!tableExists.rows[0].exists) {
        logger.warn(`  ⚠️  Table ${def.table} does not exist, skipping constraint...`);
        continue;
      }

      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        );
      `, [def.table, def.column]);
      
      if (!columnExists.rows[0].exists) {
        logger.warn(`  ⚠️  Column ${def.table}.${def.column} does not exist, skipping constraint...`);
        continue;
      }

      // Check if constraint already exists
      const constraintExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = $1 AND table_name = $2
        );
      `, [def.constraint, def.table]);
      
      if (constraintExists.rows[0].exists) {
        logger.info(`  ℹ️  Constraint ${def.constraint} already exists on ${def.table}, skipping...`);
        continue;
      }
      
      try {
        await client.query(`
          ALTER TABLE ${def.table} 
          ADD CONSTRAINT ${def.constraint} 
          FOREIGN KEY (${def.column}) 
          REFERENCES users(id) 
          ON DELETE CASCADE;
        `);
        logger.info(`  ✅ Recreated constraint ${def.constraint} on ${def.table}.${def.column}`);
      } catch (error) {
        // Constraint might already exist or have a different name, or data validation failed
        if (error.message.includes('already exists')) {
          logger.info(`  ℹ️  Constraint ${def.constraint} already exists on ${def.table}, skipping...`);
        } else if (error.message.includes('violates foreign key constraint')) {
          logger.error(`  ❌ Data validation failed for ${def.table}.${def.column}: ${error.message}`);
          logger.error(`  💡 This means some ${def.column} values don't exist in users.id`);
          logger.error(`  ⚠️  Migration will continue, but this constraint was not recreated`);
          // Don't throw - continue with other constraints
        } else {
          logger.warn(`  ⚠️  Could not recreate constraint ${def.constraint}: ${error.message}`);
        }
      }
    }
    
    // Note: call_sessions columns (initiator_user_id, first_answerer_user_id, broadcast_activator_user_id)
    // don't have foreign key constraints in the schema, so we skip them

    // Step 7: Verify migration
    logger.info('📋 Step 7: Verifying migration...');
    const verifyResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE id != username
    `);
    
    const remainingMismatches = parseInt(verifyResult.rows[0].count);
    if (remainingMismatches > 0) {
      logger.error(`❌ Migration incomplete: ${remainingMismatches} users still have mismatched IDs`);
      throw new Error('Migration verification failed');
    }

    logger.info('✅ Migration verification passed!');

    await client.query('COMMIT');
    logger.info('🎉 Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Migration failed, rolling back...');
    logger.error('Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateUserIdsToUsernames()
    .then(() => {
      logger.info('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateUserIdsToUsernames };

