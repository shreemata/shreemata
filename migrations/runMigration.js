/**
 * Master Migration Script
 * 
 * Runs all migrations in the correct order:
 * 1. User migration (tree structure and trust funds)
 * 2. Order migration (commission calculations)
 */

const { runMigration: runUserMigration } = require('./migrateUsers');
const { runMigration: runOrderMigration } = require('./migrateOrders');

async function runAllMigrations(options = {}) {
  const { dryRun = false } = options;
  
  console.log('=== Multi-Level Referral System Migration ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);
  
  try {
    // Step 1: Migrate users and initialize trust funds
    console.log('STEP 1: Migrating users and initializing trust funds...');
    await runUserMigration();
    console.log('✓ User migration complete\n');
    
    // Step 2: Process existing orders
    console.log('STEP 2: Processing existing orders...');
    await runOrderMigration({ dryRun, verify: true });
    console.log('✓ Order migration complete\n');
    
    console.log('=== All Migrations Complete ===');
    console.log('The multi-level referral system has been successfully migrated.');
    console.log('\nNext steps:');
    console.log('1. Verify the data in your database');
    console.log('2. Test the referral system with new orders');
    console.log('3. Monitor commission distributions');
    
  } catch (error) {
    console.error('\n=== Migration Failed ===');
    console.error('Error:', error.message);
    console.error('\nPlease fix the error and run the migration again.');
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  runAllMigrations({ dryRun })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runAllMigrations };
