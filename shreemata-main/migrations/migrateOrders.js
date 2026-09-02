/**
 * Migration Script: Process Existing Orders for Commission Calculation
 * 
 * This script:
 * 1. Processes completed orders to create CommissionTransaction records
 * 2. Recalculates commissions using new algorithm (including no-referrer handling)
 * 3. Updates user wallet balances if needed
 * 4. Updates trust fund balances
 * 5. Handles users without referrers by allocating their direct commission to Trust Fund
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
const { distributeCommissions } = require('../services/commissionDistribution');
require('dotenv').config();

/**
 * Process all completed orders and calculate commissions
 */
async function processExistingOrders(dryRun = false) {
  console.log('Starting order migration...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE (changes will be saved)'}`);
  
  // Find all completed orders that haven't been processed for commissions
  const completedOrders = await Order.find({ 
    status: 'completed'
  }).sort({ createdAt: 1 });
  
  console.log(`Found ${completedOrders.length} completed orders to process`);
  
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (const order of completedOrders) {
    try {
      // Check if commission already exists for this order
      const existingTransaction = await CommissionTransaction.findOne({ 
        orderId: order._id 
      });
      
      if (existingTransaction && existingTransaction.status === 'completed') {
        console.log(`Skipping order ${order._id} - commission already processed`);
        skippedCount++;
        continue;
      }
      
      // Verify the order has a valid user
      const purchaser = await User.findById(order.user_id);
      if (!purchaser) {
        console.warn(`Warning: User not found for order ${order._id}`);
        skippedCount++;
        continue;
      }
      
      // Verify order has a valid amount
      if (!order.totalAmount || order.totalAmount <= 0) {
        console.warn(`Warning: Invalid order amount for order ${order._id}: ${order.totalAmount}`);
        skippedCount++;
        continue;
      }
      
      if (dryRun) {
        // In dry run mode, just log what would happen
        console.log(`[DRY RUN] Would process order ${order._id}:`);
        console.log(`  - Purchaser: ${purchaser.email}`);
        console.log(`  - Amount: ${order.totalAmount}`);
        console.log(`  - Referrer: ${purchaser.referredBy || 'None'}`);
        console.log(`  - Tree Parent: ${purchaser.treeParent || 'None'}`);
        
        // Calculate what commissions would be
        const trustFund = order.totalAmount * 0.03;
        const directCommission = order.totalAmount * 0.03;
        const devTrustFund = order.totalAmount * 0.01;
        const treePool = order.totalAmount * 0.03;
        
        console.log(`  - Trust Fund: ${trustFund}`);
        console.log(`  - Direct Commission: ${directCommission} ${!purchaser.referredBy ? '(will go to Trust Fund - no referrer)' : ''}`);
        console.log(`  - Dev Trust Fund: ${devTrustFund}`);
        console.log(`  - Tree Commission Pool: ${treePool}`);
        
        processedCount++;
      } else {
        // Actually process the commission
        console.log(`Processing order ${order._id} (${processedCount + 1}/${completedOrders.length - skippedCount})`);
        
        const transaction = await distributeCommissions(
          order._id,
          order.user_id,
          order.totalAmount
        );
        
        console.log(`  ✓ Commission distributed successfully`);
        console.log(`    - Trust Fund: ${transaction.trustFundAmount}`);
        console.log(`    - Direct Commission: ${transaction.directCommissionAmount}`);
        console.log(`    - Dev Trust Fund: ${transaction.devTrustFundAmount}`);
        console.log(`    - Tree Commissions: ${transaction.treeCommissions.length} levels`);
        console.log(`    - Remainder: ${transaction.remainderToDevFund || 0}`);
        
        processedCount++;
      }
      
      // Add a small delay to avoid overwhelming the database
      if (processedCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Error processing order ${order._id}:`, error.message);
      errors.push({
        orderId: order._id,
        error: error.message
      });
      errorCount++;
    }
  }
  
  console.log('\n=== Order Migration Summary ===');
  console.log(`Total orders found: ${completedOrders.length}`);
  console.log(`Processed: ${processedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(err => {
      console.log(`  - Order ${err.orderId}: ${err.error}`);
    });
  }
  
  return {
    total: completedOrders.length,
    processed: processedCount,
    skipped: skippedCount,
    errors: errorCount,
    errorDetails: errors
  };
}

/**
 * Verify commission calculations are correct, including no-referrer handling
 */
async function verifyCommissions() {
  console.log('\n=== Verifying Commission Calculations ===');
  
  const transactions = await CommissionTransaction.find({ status: 'completed' });
  console.log(`Verifying ${transactions.length} commission transactions...`);
  
  let validCount = 0;
  let invalidCount = 0;
  let noReferrerCount = 0;
  const issues = [];
  
  for (const transaction of transactions) {
    // For no-referrer users, directCommissionAmount is included in trustFundAmount
    // so we need to adjust the calculation to avoid double counting
    const directCommissionToCount = transaction.directReferrer ? transaction.directCommissionAmount : 0;
    
    const totalAllocated = 
      transaction.trustFundAmount + 
      directCommissionToCount + 
      transaction.devTrustFundAmount + 
      transaction.treeCommissions.reduce((sum, tc) => sum + tc.amount, 0) +
      (transaction.remainderToDevFund || 0);
    
    const expectedTotal = transaction.orderAmount * 0.10;
    const tolerance = 0.01; // 1 cent tolerance
    
    // Track no-referrer transactions
    if (!transaction.directReferrer) {
      noReferrerCount++;
    }
    
    if (Math.abs(totalAllocated - expectedTotal) > tolerance) {
      invalidCount++;
      issues.push({
        transactionId: transaction._id,
        orderId: transaction.orderId,
        allocated: totalAllocated,
        expected: expectedTotal,
        difference: totalAllocated - expectedTotal,
        hasReferrer: !!transaction.directReferrer,
        trustFundAmount: transaction.trustFundAmount,
        directCommissionAmount: transaction.directCommissionAmount
      });
    } else {
      validCount++;
    }
  }
  
  console.log(`Valid transactions: ${validCount}`);
  console.log(`Invalid transactions: ${invalidCount}`);
  console.log(`No-referrer transactions: ${noReferrerCount}`);
  
  if (issues.length > 0) {
    console.log('\nIssues found:');
    issues.forEach(issue => {
      console.log(`  - Transaction ${issue.transactionId}:`);
      console.log(`    Order: ${issue.orderId}`);
      console.log(`    Has Referrer: ${issue.hasReferrer}`);
      console.log(`    Trust Fund: ${issue.trustFundAmount}`);
      console.log(`    Direct Commission: ${issue.directCommissionAmount}`);
      console.log(`    Allocated: ${issue.allocated}`);
      console.log(`    Expected: ${issue.expected}`);
      console.log(`    Difference: ${issue.difference}`);
    });
  }
  
  return {
    valid: validCount,
    invalid: invalidCount,
    noReferrer: noReferrerCount,
    issues
  };
}

/**
 * Display summary statistics
 */
async function displaySummary() {
  console.log('\n=== Migration Summary Statistics ===');
  
  // User statistics
  const totalUsers = await User.countDocuments();
  const usersWithReferrals = await User.countDocuments({ referredBy: { $ne: null } });
  const usersWithoutReferrals = await User.countDocuments({ referredBy: null });
  const usersInTree = await User.countDocuments({ treeParent: { $ne: null } });
  
  console.log('\nUser Statistics:');
  console.log(`  Total users: ${totalUsers}`);
  console.log(`  Users with referrals: ${usersWithReferrals}`);
  console.log(`  Users without referrals: ${usersWithoutReferrals}`);
  console.log(`  Users in tree: ${usersInTree}`);
  
  // Commission statistics
  const totalTransactions = await CommissionTransaction.countDocuments();
  const completedTransactions = await CommissionTransaction.countDocuments({ status: 'completed' });
  const noReferrerTransactions = await CommissionTransaction.countDocuments({ 
    status: 'completed', 
    directReferrer: null 
  });
  const withReferrerTransactions = await CommissionTransaction.countDocuments({ 
    status: 'completed', 
    directReferrer: { $ne: null } 
  });
  
  console.log('\nCommission Statistics:');
  console.log(`  Total transactions: ${totalTransactions}`);
  console.log(`  Completed transactions: ${completedTransactions}`);
  console.log(`  Transactions with referrer: ${withReferrerTransactions}`);
  console.log(`  Transactions without referrer: ${noReferrerTransactions}`);
  
  // Calculate total commissions
  const commissionStats = await CommissionTransaction.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: null,
        totalTrustFund: { $sum: '$trustFundAmount' },
        totalDirectCommission: { $sum: '$directCommissionAmount' },
        totalDevTrustFund: { $sum: '$devTrustFundAmount' },
        totalRemainder: { $sum: '$remainderToDevFund' }
      }
    }
  ]);
  
  if (commissionStats.length > 0) {
    const stats = commissionStats[0];
    console.log(`  Total Trust Fund: ${stats.totalTrustFund.toFixed(2)}`);
    console.log(`  Total Direct Commission: ${stats.totalDirectCommission.toFixed(2)}`);
    console.log(`  Total Dev Trust Fund: ${stats.totalDevTrustFund.toFixed(2)}`);
    console.log(`  Total Remainder: ${stats.totalRemainder.toFixed(2)}`);
  }
  
  // User wallet statistics
  const walletStats = await User.aggregate([
    {
      $group: {
        _id: null,
        totalWalletBalance: { $sum: '$wallet' },
        totalDirectCommission: { $sum: '$directCommissionEarned' },
        totalTreeCommission: { $sum: '$treeCommissionEarned' }
      }
    }
  ]);
  
  if (walletStats.length > 0) {
    const stats = walletStats[0];
    console.log('\nUser Wallet Statistics:');
    console.log(`  Total wallet balance: ${stats.totalWalletBalance.toFixed(2)}`);
    console.log(`  Total direct commission earned: ${stats.totalDirectCommission.toFixed(2)}`);
    console.log(`  Total tree commission earned: ${stats.totalTreeCommission.toFixed(2)}`);
  }
}

/**
 * Main migration function
 */
async function runMigration(options = {}) {
  const { dryRun = false, verify = true } = options;
  
  try {
    console.log('=== Order Migration Script ===');
    console.log('Connecting to database...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');
    
    // Process orders
    const result = await processExistingOrders(dryRun);
    
    if (!dryRun && verify) {
      // Verify calculations
      await verifyCommissions();
    }
    
    // Display summary
    await displaySummary();
    
    console.log('\n=== Migration Complete ===');
    
    return result;
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration if called directly
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipVerify = args.includes('--skip-verify');
  
  if (dryRun) {
    console.log('Running in DRY RUN mode - no changes will be made');
  }
  
  runMigration({ dryRun, verify: !skipVerify })
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { 
  runMigration, 
  processExistingOrders, 
  verifyCommissions,
  displaySummary 
};
