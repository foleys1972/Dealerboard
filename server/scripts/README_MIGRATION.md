# User ID to Username Migration

This script migrates the database to use usernames as the primary identifier instead of the old numeric IDs (e.g., `user-1763220052582` → `test1`).

## ⚠️ WARNING

**This is a destructive database operation. Always backup your database before running this migration!**

## Prerequisites

1. **Backup your database** - This is critical!
   ```bash
   pg_dump -h localhost -U intercom_app trading_intercom > backup_before_migration.sql
   ```

2. Ensure the server is **stopped** or in maintenance mode to prevent concurrent writes

3. Verify all users have unique usernames (the script will check this)

## What the Migration Does

1. **Identifies users** that need migration (where `id != username`)
2. **Drops foreign key constraints** temporarily
3. **Updates all foreign key references** in related tables:
   - `group_participants.user_id`
   - `user_favorites.user_id`
   - `user_favorite_groups.user_id`
   - `user_homeserver_assignments.user_id`
   - `matrix_room_participants.user_id`
   - `dealerboard_line_sessions.user_id`
   - `dealerboard_speed_dials.user_id`
   - `dealerboard_button_assignments.user_id`
   - `dealerboard_group_members.user_id`
   - `call_sessions.initiator_user_id`, `first_answerer_user_id`, `broadcast_activator_user_id`
   - `recordings.recording_user_id`
   - `direct_contacts.owner_id`, `contact_user_id`
   - `zoom_integrations.user_id`
   - `zoom_meetings.user_id`
   - `teams_integrations.user_id`
   - `teams_meetings.user_id`
4. **Updates the `users` table** to set `id = username`
5. **Recreates foreign key constraints**
6. **Verifies** the migration was successful

## Running the Migration

```bash
# From the project root
node server/scripts/migrateUserIdsToUsernames.js
```

## Rollback

If something goes wrong, the script uses a database transaction and will automatically rollback. However, if you need to restore from backup:

```bash
# Restore from backup
psql -h localhost -U intercom_app trading_intercom < backup_before_migration.sql
```

## After Migration

1. Restart the server
2. Verify users can log in
3. Check that all user-related data is intact
4. Test user management features

## Notes

- The migration runs in a transaction, so it's all-or-nothing
- If the migration fails, all changes are automatically rolled back
- The script will skip tables/columns that don't exist
- Foreign key constraints are automatically recreated after the migration

