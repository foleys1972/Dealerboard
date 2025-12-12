#!/usr/bin/env node

/**
 * Data Migration Script: Fix Group Participants
 * 
 * This script fixes all existing groups that have participants stored as empty objects {}
 * instead of arrays []. It converts them to proper arrays so that users can be added
 * and group participant counts display correctly.
 */

const fs = require('fs');
const path = require('path');

// Path to the groups data file
const GROUPS_FILE = path.join(__dirname, '..', 'server', 'data', 'groups.json');

console.log('🔧 Starting Group Participants Migration...');
console.log(`📁 Groups file: ${GROUPS_FILE}`);

try {
  // Check if groups file exists
  if (!fs.existsSync(GROUPS_FILE)) {
    console.log('❌ Groups file not found. Creating empty groups array...');
    fs.writeFileSync(GROUPS_FILE, JSON.stringify([], null, 2));
    console.log('✅ Empty groups file created');
    process.exit(0);
  }

  // Read the groups file
  const groupsData = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
  console.log(`📊 Found ${groupsData.length} groups to process`);

  let fixedCount = 0;
  let totalGroups = groupsData.length;

  // Process each group
  groupsData.forEach((group, index) => {
    console.log(`\n🔍 Processing group ${index + 1}/${totalGroups}: "${group.name}" (${group.id})`);
    
    // Check if participants is an object instead of array
    if (group.participants && typeof group.participants === 'object' && !Array.isArray(group.participants)) {
      console.log(`  ❌ Found object participants:`, group.participants);
      
      // Convert object to array
      if (Object.keys(group.participants).length === 0) {
        // Empty object - convert to empty array
        group.participants = [];
        console.log(`  ✅ Converted empty object to empty array`);
      } else {
        // Object with keys - convert to array of keys
        group.participants = Object.keys(group.participants);
        console.log(`  ✅ Converted object to array:`, group.participants);
      }
      
      // Update timestamp
      group.updatedAt = new Date().toISOString();
      fixedCount++;
    } else if (Array.isArray(group.participants)) {
      console.log(`  ✅ Participants already an array (${group.participants.length} items)`);
    } else {
      // No participants field or null/undefined
      group.participants = [];
      group.updatedAt = new Date().toISOString();
      console.log(`  ✅ Initialized missing participants as empty array`);
      fixedCount++;
    }
  });

  // Write the fixed data back to file
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupsData, null, 2));
  
  console.log(`\n🎉 Migration completed successfully!`);
  console.log(`📈 Statistics:`);
  console.log(`   - Total groups processed: ${totalGroups}`);
  console.log(`   - Groups fixed: ${fixedCount}`);
  console.log(`   - Groups already correct: ${totalGroups - fixedCount}`);
  
  if (fixedCount > 0) {
    console.log(`\n✅ All groups now have participants as arrays`);
    console.log(`🔧 You can now add users to groups and see participant counts`);
  } else {
    console.log(`\n✅ No groups needed fixing - all participants were already arrays`);
  }

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
