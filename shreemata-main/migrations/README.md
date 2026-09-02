# Multi-Level Referral System Migration Scripts

This directory contains migration scripts to transition existing data to the new multi-level referral system with tree-based commission distribution.

## Overview

The migration process consists of two main steps:

1. **User Migration** (`migrateUsers.js`): Backfills tree structure for existing users
2. **Order Migration** (`migrateOrders.js`): Processes existing orders to calculate commissions

## Prerequisites

- Ensure your `.env` file is configured with the correct `MONGO_URI`
- Backup your database before running migrations
- Ensure all users have been created and referral relationships exist

## Running Migrations

### Option 1: Run All Migrations (Recommended)

Run both migrations in the correct order:

```bash
# Dry run (preview changes without saving)
node migrations/runMigration.js --dry-run

# Live run (apply changes)
node migrations/runMigration.js
```

### Option 2: Run Individual Migrations

#### User Migration

Backfills tree structure and initializes trust funds:

```bash
node migrations/migrateUsers.js
```

This script will:
- Initialize `directCommissionEarned` and `treeCommissionEarned` to 0 for all users
- Build tree structure based on existing `referredBy` relationships
- Set `treeParent`, `treeLevel`, and `treePosition` for each user
- Create Trust Fund and Development Trust Fund documents

#### Order Migration

Processes existing orders and calculates commissions:

```bash
# Dry run (preview without making changes)
node migrations/migrateOrders.js --dry-run

# Live run (apply changes)
node migrations/migrateOrders.js

# Skip verification step
node migrations/migrateOrders.js --skip-verify
```

This script will:
- Find all completed orders
- Calculate commissions using the new algorithm
- Create `CommissionTransaction` records
- Update user wallet balances
- Update trust fund balances
- Verify all calculations are correct

## What Each Migration Does

### User Migration Details

1. **Initialize Commission Tracking**
   - Sets `directCommissionEarned = 0`
   - Sets `treeCommissionEarned = 0`

2. **Build Tree Structure**
   - Identifies root users (no referrer)
   - Places users with referrals in tree using breadth-first search
   - Maintains serial ordering based on creation timestamps
   - Respects 5-child limit per node

3. **Initialize Trust Funds**
   - Creates Trust Fund document (if not exists)
   - Creates Development Trust Fund document (if not exists)

### Order Migration Details

1. **Process Completed Orders**
   - Finds all orders with `status: 'completed'`
   - Skips orders already processed
   - Validates order data (user exists, valid amount)

2. **Calculate Commissions**
   - 3% to Trust Fund
   - 3% direct commission to referrer
   - 1% to Development Trust Fund
   - 3% distributed across tree (halving pattern)
   - Remainder to Development Trust Fund

3. **Update Balances**
   - Credits user wallets
   - Updates `directCommissionEarned` and `treeCommissionEarned`
   - Records trust fund transactions

4. **Verification**
   - Verifies total allocation equals 10% of order amount
   - Reports any discrepancies

## Migration Output

The scripts provide detailed console output including:

- Number of users/orders processed
- Number of items skipped
- Errors encountered
- Summary statistics
- Verification results

### Example Output

```
=== User Migration Script ===
Connected to database
Initializing Trust Funds...
Created Trust Fund
Created Development Trust Fund
Starting tree structure migration...
Found 150 users to process
Initialized commission tracking for 150 users
Found 10 root users (no referrer)
Processing 140 users with referrals
Placed 100 users in tree...
Tree structure migration complete:
  - Placed: 140 users
  - Skipped (already placed): 0 users

=== Order Migration Script ===
Found 50 completed orders to process
Processing order 507f1f77bcf86cd799439011 (1/50)
  ✓ Commission distributed successfully
    - Trust Fund: 15.00
    - Direct Commission: 15.00
    - Dev Trust Fund: 5.00
    - Tree Commissions: 3 levels
    - Remainder: 0.50

=== Migration Summary Statistics ===
User Statistics:
  Total users: 150
  Users with referrals: 140
  Users in tree: 140

Commission Statistics:
  Total transactions: 50
  Completed transactions: 50
  Total Trust Fund: 750.00
  Total Direct Commission: 750.00
  Total Dev Trust Fund: 250.00
```

## Safety Features

1. **Dry Run Mode**: Preview changes without applying them
2. **Skip Logic**: Automatically skips already-processed items
3. **Transaction Safety**: Uses MongoDB transactions for atomicity
4. **Error Handling**: Continues processing even if individual items fail
5. **Verification**: Validates calculations after migration

## Troubleshooting

### Issue: "Referrer not found"

**Cause**: User has a `referredBy` code that doesn't exist in the database

**Solution**: The script will place the user as a root user (level 1)

### Issue: "Unable to find tree placement"

**Cause**: Tree structure is full or corrupted

**Solution**: The script will place the user directly under their referrer

### Issue: "Commission allocation mismatch"

**Cause**: Rounding errors or calculation issues

**Solution**: Check the tolerance setting (default 1 cent) and verify order amounts

### Issue: Migration fails midway

**Cause**: Database connection issues or data validation errors

**Solution**: 
1. Check error logs for specific issues
2. Fix the problematic data
3. Re-run the migration (it will skip already-processed items)

## Post-Migration Verification

After running migrations, verify:

1. **User Tree Structure**
   ```javascript
   // Check a sample user
   const user = await User.findOne({ email: 'test@example.com' });
   console.log({
     treeParent: user.treeParent,
     treeLevel: user.treeLevel,
     treePosition: user.treePosition,
     treeChildren: user.treeChildren.length
   });
   ```

2. **Commission Transactions**
   ```javascript
   // Check commission records
   const transactions = await CommissionTransaction.find({ status: 'completed' });
   console.log(`Total transactions: ${transactions.length}`);
   ```

3. **Trust Fund Balances**
   ```javascript
   // Check trust funds
   const trustFund = await TrustFund.findOne({ fundType: 'trust' });
   const devFund = await TrustFund.findOne({ fundType: 'development' });
   console.log({
     trustFund: trustFund.balance,
     devFund: devFund.balance
   });
   ```

4. **User Wallets**
   ```javascript
   // Check user balances
   const users = await User.find({ wallet: { $gt: 0 } });
   console.log(`Users with commissions: ${users.length}`);
   ```

## Rollback

If you need to rollback the migration:

1. Restore from your database backup
2. Or manually reset the fields:

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

## Support

If you encounter issues during migration:

1. Check the error logs in the console output
2. Verify your database connection
3. Ensure all prerequisites are met
4. Run in dry-run mode first to preview changes
5. Contact support with the error details

## Notes

- The migration is idempotent - you can run it multiple times safely
- Already-processed items will be skipped automatically
- Use `--dry-run` flag to preview changes before applying
- Always backup your database before running migrations
- Monitor the console output for warnings and errors
