/**
 * Fix Double Commission Payments
 * 
 * This script fixes the issue where both old and new commission systems
 * were running simultaneously, causing double payments.
 * 
 * What it does:
 * 1. Calculates correct commission totals from CommissionTransaction records
 * 2. Updates user.wallet to match the correct commission totals
 * 3. Ensures directCommissionEarned and treeCommissionEarned are accurate
 * 
 * Usage: node migrations/fixDoubleCommissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');

async function fixDoubleCommissions() {
  try {
    console.log('🔧 Starting Double Commission Fix...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users who have earned commissions
    const users = await User.find({
      $or: [
        { directCommissionEarned: { $gt: 0 } },
        { treeCommissionEarned: { $gt: 0 } },
        { wallet: { $gt: 0 } }
      ]
    });

    console.log(`Found ${users.length} users with commission earnings\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      console.log(`\n📊 Checking user: ${user.name} (${user.email})`);
      console.log(`   Current wallet: ₹${user.wallet.toFixed(2)}`);
      console.log(`   Direct commission: ₹${(user.directCommissionEarned || 0).toFixed(2)}`);
      console.log(`   Tree commission: ₹${(user.treeCommissionEarned || 0).toFixed(2)}`);

      // Calculate correct totals from CommissionTransaction records
      const transactions = await CommissionTransaction.find({ 
        recipient: user._id 
      });

      let correctDirectTotal = 0;
      let correctTreeTotal = 0;

      transactions.forEach(tx => {
        if (tx.type === 'direct') {
          correctDirectTotal += tx.amount;
        } else if (tx.type === 'tree') {
          correctTreeTotal += tx.amount;
        }
      });

      const correctTotal = correctDirectTotal + correctTreeTotal;

      console.log(`   Calculated from transactions:`);
      console.log(`   - Direct: ₹${correctDirectTotal.toFixed(2)}`);
      console.log(`   - Tree: ₹${correctTreeTotal.toFixed(2)}`);
      console.log(`   - Total: ₹${correctTotal.toFixed(2)}`);

      // Check if there's a discrepancy
      const walletDiff = Math.abs(user.wallet - correctTotal);
      const directDiff = Math.abs((user.directCommissionEarned || 0) - correctDirectTotal);
      const treeDiff = Math.abs((user.treeCommissionEarned || 0) - correctTreeTotal);

      if (walletDiff > 0.01 || directDiff > 0.01 || treeDiff > 0.01) {
        console.log(`   ⚠️  Discrepancy found! Fixing...`);
        
        // Update user with correct values
        user.wallet = correctTotal;
        user.directCommissionEarned = correctDirectTotal;
        user.treeCommissionEarned = correctTreeTotal;
        await user.save();

        console.log(`   ✅ Fixed! New wallet: ₹${user.wallet.toFixed(2)}`);
        fixedCount++;
      } else {
        console.log(`   ✓ Already correct, skipping`);
        skippedCount++;
      }
    }

    console.log(`\n\n📈 Summary:`);
    console.log(`   Total users checked: ${users.length}`);
    console.log(`   Users fixed: ${fixedCount}`);
    console.log(`   Users already correct: ${skippedCount}`);
    console.log(`\n✅ Migration completed successfully!`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the migration
fixDoubleCommissions();
