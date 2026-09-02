# Migration Scripts Usage Guide

## Quick Start

To migrate your existing data to the new multi-level referral system:

```bash
# Run all migrations (recommended)
node migrations/runMigration.js
```

## What Gets Migrated

### User Migration
- Backfills `treeParent`, `treeLevel`, `treePosition` for all users
- Builds tree structure based on existing `referredBy` relationships
- Initializes `directCommissionEarned` and `treeCommissionEarned` to 0
- Creates Trust Fund and Development Trust Fund documents

### Order Migration
- Processes all completed orders
- Creates `CommissionTransaction` records
- Calculates and distributes commissions using the new algorithm
- Updates user wallet balances
- Updates trust fund balances

## Step-by-Step Instructions

### 1. Backup Your Database

**IMPORTANT**: Always backup your database before running migrations!

```bash
# Example using mongodump
mongodump --uri="your-mongodb-uri" --out=./backup
```

### 2. Run Migrations

#### Option A: Run All Migrations (Recommended)

```bash
# Preview changes without applying them
node migrations/runMigration.js --dry-run

# Apply migrations
node migrations/runMigration.js
```

#### Option B: Run Individual Migrations

```bash
# Step 1: Migrate users
node migrations/migrateUsers.js

# Step 2: Migrate orders
node migrations/migrateOrders.js

# Or preview order migration first
node migrations/migrateOrders.js --dry-run
```

### 3. Verify Results

After migration, check:

1. **User Tree Structure**
   - All users should have `treeLevel` set
   - Users with referrals should have `treeParent` set
   - Root users should have `treeLevel: 1` and `treeParent: null`

2. **Commission Transactions**
   - Check that transactions exist for completed orders
   - Verify status is 'completed'

3. **Trust Funds**
   - Both Trust Fund and Development Trust Fund should exist
   - Balances should reflect accumulated commissions

4. **User Wallets**
   - Users who referred others should have wallet balances
   - `directCommissionEarned` and `treeCommissionEarned` should be set

## Command Line Options

### runMigration.js
- `--dry-run`: Preview changes without applying them

### migrateOrders.js
- `--dry-run`: Preview order processing without making changes
- `--skip-verify`: Skip verification step after migration

## Expected Output

### Successful Migration

```
=== Multi-Level Referral System Migration ===
Mode: LIVE

STEP 1: Migrating users and initializing trust funds...
Connected to database
Initializing Trust Funds...
Created Trust Fund
Created Development Trust Fund
Starting tree structure migration...
Found 150 users to process
Initialized commission tracking for 150 users
Found 10 root users (no referrer)
Processing 140 users with referrals
Tree structure migration complete:
  - Placed: 140 users
  - Skipped (already placed): 0 users
✓ User migration complete

STEP 2: Processing existing orders...
Starting order migration...
Found 50 completed orders to process
Processing order 507f1f77bcf86cd799439011 (1/50)
  ✓ Commission distributed successfully
...
=== Order Migration Summary ===
Total orders found: 50
Processed: 50
Skipped: 0
Errors: 0

=== Migration Summary Statistics ===
User Statistics:
  Total users: 150
  Users with referrals: 140
  Users in tree: 140

Commission Statistics:
  Total transactions: 50
  Completed transactions: 50
✓ Order migration complete

=== All Migrations Complete ===
```

## Common Issues

### Issue: "Transaction numbers are only allowed on a replica set member"

**Cause**: Your MongoDB instance is not configured as a replica set.

**Solution**: 
- For production: Use MongoDB Atlas or configure a replica set
- For development: This is expected in standalone MongoDB
- The migration will log errors but continue processing

### Issue: "Referrer not found"

**Cause**: User has a `referredBy` code that doesn't exist in the database.

**Solution**: The script automatically places the user as a root user (level 1).

### Issue: "Unable to find tree placement"

**Cause**: Tree structure is full or has issues.

**Solution**: The script will place the user directly under their referrer as a fallback.

## Safety Features

1. **Idempotent**: Can be run multiple times safely
2. **Skip Logic**: Automatically skips already-processed items
3. **Error Handling**: Continues processing even if individual items fail
4. **Dry Run**: Preview changes before applying
5. **Verification**: Validates calculations after migration

## Rollback

If you need to rollback:

1. Restore from your database backup:
   ```bash
   mongorestore --uri="your-mongodb-uri" ./backup
   ```

2. Or manually reset (not recommended):
   ```javascript
   // Reset user tree fields
   await User.updateMany({}, {
     $set: {
       treeParent: null,
       treeLevel: 0,
       treePosition: 0,
       treeChildren: [],
       directCommissionEarned: 0,
       treeCommissionEarned: 0
     }
   });

   // Delete commission transactions
   await CommissionTransaction.deleteMany({});

   // Reset trust funds
   await TrustFund.deleteMany({});
   ```

## Testing

Run the migration tests:

```bash
npm test -- tests/migration.test.js
```

Note: Some tests may show transaction errors in standalone MongoDB (expected behavior).

## Production Checklist

Before running in production:

- [ ] Database backup completed
- [ ] Tested migration in staging environment
- [ ] Verified dry-run output
- [ ] Scheduled maintenance window
- [ ] Notified users of potential downtime
- [ ] Prepared rollback plan
- [ ] Monitoring tools ready

## Support

For issues or questions:
1. Check the error logs in console output
2. Review the README.md for detailed documentation
3. Verify prerequisites are met
4. Contact support with error details

## Performance Notes

- Migration processes users and orders sequentially
- Large datasets may take time (expect ~1-2 seconds per order)
- Database indexes are used for optimal performance
- Small delays are added to avoid overwhelming the database

## Next Steps After Migration

1. Test the referral system with new signups
2. Verify commission distribution on new orders
3. Monitor trust fund balances
4. Check user wallet updates
5. Review commission transaction logs
