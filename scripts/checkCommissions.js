/**
 * Check Commission Status
 * 
 * This script analyzes your database to show:
 * - User wallet balances
 * - Commission breakdowns
 * - Transaction records
 * - Any discrepancies
 * 
 * Usage: node scripts/checkCommissions.js [email]
 * If email is provided, shows detailed info for that user
 * Otherwise, shows summary for all users
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
const Order = require('../models/Order');

async function checkCommissions(targetEmail = null) {
  try {
    console.log('🔍 Checking Commission Status...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    if (targetEmail) {
      // Check specific user
      await checkSpecificUser(targetEmail);
    } else {
      // Check all users
      await checkAllUsers();
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

async function checkSpecificUser(email) {
  const user = await User.findOne({ email });
  
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    return;
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`👤 USER: ${user.name} (${user.email})`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Current balances
  console.log('💰 CURRENT BALANCES:');
  console.log(`   Wallet: ₹${user.wallet.toFixed(2)}`);
  console.log(`   Direct Commission Earned: ₹${(user.directCommissionEarned || 0).toFixed(2)}`);
  console.log(`   Tree Commission Earned: ₹${(user.treeCommissionEarned || 0).toFixed(2)}`);
  console.log(`   Total Tracked: ₹${((user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0)).toFixed(2)}`);
  
  const discrepancy = user.wallet - ((user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0));
  if (Math.abs(discrepancy) > 0.01) {
    console.log(`   ⚠️  DISCREPANCY: ₹${discrepancy.toFixed(2)}`);
  } else {
    console.log(`   ✅ Balances match!`);
  }

  // Commission transactions
  console.log('\n📊 COMMISSION TRANSACTIONS:');
  const transactions = await CommissionTransaction.find({ recipient: user._id })
    .populate('order', 'totalAmount createdAt')
    .populate('buyer', 'name email')
    .sort({ createdAt: -1 });

  if (transactions.length === 0) {
    console.log('   No commission transactions found');
  } else {
    let directTotal = 0;
    let treeTotal = 0;

    transactions.forEach((tx, index) => {
      console.log(`\n   ${index + 1}. ${tx.type.toUpperCase()} Commission`);
      console.log(`      Amount: ₹${tx.amount.toFixed(2)}`);
      console.log(`      From: ${tx.buyer?.name || 'Unknown'} (${tx.buyer?.email || 'N/A'})`);
      console.log(`      Level: ${tx.level}`);
      console.log(`      Order Amount: ₹${tx.order?.totalAmount?.toFixed(2) || 'N/A'}`);
      console.log(`      Date: ${tx.createdAt.toLocaleString()}`);

      if (tx.type === 'direct') directTotal += tx.amount;
      else if (tx.type === 'tree') treeTotal += tx.amount;
    });

    console.log(`\n   📈 TRANSACTION TOTALS:`);
    console.log(`      Direct: ₹${directTotal.toFixed(2)}`);
    console.log(`      Tree: ₹${treeTotal.toFixed(2)}`);
    console.log(`      Total: ₹${(directTotal + treeTotal).toFixed(2)}`);

    // Compare with user fields
    const directDiff = (user.directCommissionEarned || 0) - directTotal;
    const treeDiff = (user.treeCommissionEarned || 0) - treeTotal;

    if (Math.abs(directDiff) > 0.01 || Math.abs(treeDiff) > 0.01) {
      console.log(`\n   ⚠️  MISMATCH DETECTED:`);
      if (Math.abs(directDiff) > 0.01) {
        console.log(`      Direct: User field (₹${(user.directCommissionEarned || 0).toFixed(2)}) vs Transactions (₹${directTotal.toFixed(2)}) = Diff: ₹${directDiff.toFixed(2)}`);
      }
      if (Math.abs(treeDiff) > 0.01) {
        console.log(`      Tree: User field (₹${(user.treeCommissionEarned || 0).toFixed(2)}) vs Transactions (₹${treeTotal.toFixed(2)}) = Diff: ₹${treeDiff.toFixed(2)}`);
      }
    } else {
      console.log(`\n   ✅ Transaction totals match user fields!`);
    }
  }

  // Referral info
  console.log('\n👥 REFERRAL INFO:');
  console.log(`   Referral Code: ${user.referralCode || 'None'}`);
  console.log(`   Referred By: ${user.referredBy || 'None'}`);
  
  const directReferrals = await User.countDocuments({ referredBy: user.referralCode });
  console.log(`   Direct Referrals: ${directReferrals}`);
  
  const treeChildren = await User.countDocuments({ treeParent: user._id });
  console.log(`   Tree Children: ${treeChildren}`);
  console.log(`   Tree Level: ${user.treeLevel}`);

  // Orders
  console.log('\n🛒 PURCHASE HISTORY:');
  const orders = await Order.find({ user_id: user._id, status: 'completed' })
    .sort({ createdAt: -1 });
  
  if (orders.length === 0) {
    console.log('   No completed orders');
  } else {
    console.log(`   Total Orders: ${orders.length}`);
    const totalSpent = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    console.log(`   Total Spent: ₹${totalSpent.toFixed(2)}`);
    
    console.log('\n   Recent Orders:');
    orders.slice(0, 5).forEach((order, index) => {
      console.log(`      ${index + 1}. ₹${order.totalAmount.toFixed(2)} - ${order.createdAt.toLocaleDateString()}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

async function checkAllUsers() {
  const users = await User.find({
    $or: [
      { wallet: { $gt: 0 } },
      { directCommissionEarned: { $gt: 0 } },
      { treeCommissionEarned: { $gt: 0 } }
    ]
  }).sort({ wallet: -1 });

  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 COMMISSION SUMMARY - ${users.length} Users with Earnings`);
  console.log('═══════════════════════════════════════════════════════\n');

  let totalWallet = 0;
  let totalDirect = 0;
  let totalTree = 0;
  let usersWithDiscrepancy = 0;

  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Name                 │ Wallet    │ Direct    │ Tree      │ Status          │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');

  for (const user of users) {
    const wallet = user.wallet;
    const direct = user.directCommissionEarned || 0;
    const tree = user.treeCommissionEarned || 0;
    const tracked = direct + tree;
    const diff = wallet - tracked;

    totalWallet += wallet;
    totalDirect += direct;
    totalTree += tree;

    const status = Math.abs(diff) > 0.01 ? `⚠️  +₹${diff.toFixed(2)}` : '✅ OK';
    if (Math.abs(diff) > 0.01) usersWithDiscrepancy++;

    const name = user.name.padEnd(20).substring(0, 20);
    const walletStr = `₹${wallet.toFixed(2)}`.padEnd(9);
    const directStr = `₹${direct.toFixed(2)}`.padEnd(9);
    const treeStr = `₹${tree.toFixed(2)}`.padEnd(9);
    const statusStr = status.padEnd(15);

    console.log(`│ ${name} │ ${walletStr} │ ${directStr} │ ${treeStr} │ ${statusStr} │`);
  }

  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n📈 TOTALS:');
  console.log(`   Total Wallet Balance: ₹${totalWallet.toFixed(2)}`);
  console.log(`   Total Direct Commission: ₹${totalDirect.toFixed(2)}`);
  console.log(`   Total Tree Commission: ₹${totalTree.toFixed(2)}`);
  console.log(`   Total Tracked: ₹${(totalDirect + totalTree).toFixed(2)}`);
  console.log(`   Discrepancy: ₹${(totalWallet - (totalDirect + totalTree)).toFixed(2)}`);

  console.log('\n⚠️  ISSUES:');
  console.log(`   Users with discrepancies: ${usersWithDiscrepancy}`);

  if (usersWithDiscrepancy > 0) {
    console.log('\n💡 TIP: Run "node migrations/fixDoubleCommissions.js" to fix discrepancies');
  }

  console.log('\n💡 TIP: Run "node scripts/checkCommissions.js <email>" for detailed user info');
  console.log('\n═══════════════════════════════════════════════════════\n');
}

// Get email from command line argument
const targetEmail = process.argv[2];

checkCommissions(targetEmail);
