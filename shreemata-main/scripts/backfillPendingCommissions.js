/**
 * SHREE MATA — BACKFILL PENDING COMMISSIONS SCRIPT (scripts/backfillPendingCommissions.js)
 * 
 * Safe backfill utility to process eligible pending orders that have not had commissions distributed.
 * 
 * Usage:
 *   DRY RUN (default): node scripts/backfillPendingCommissions.js
 *   APPLY MODE:       node scripts/backfillPendingCommissions.js --apply
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/mongo');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionSettings = require('../models/CommissionSettings');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const { isOrderEligibleForCommission, distributeCommissions } = require('../services/commissionDistribution');
const { runBackup } = require('./backup-database');

async function findUserByIdOrRef(ref) {
  if (!ref) return null;
  if (require('mongoose').Types.ObjectId.isValid(ref)) {
    const u = await User.findById(ref);
    if (u) return u;
  }
  const u2 = await User.findOne({ $or: [{ referralCode: String(ref) }, { phone: String(ref) }] });
  return u2;
}

async function runBackfill() {
  const isApplyMode = process.argv.includes('--apply');
  console.log('==================================================');
  console.log(`[BACKFILL COMMISSIONS] Starting in ${isApplyMode ? '⚡ APPLY MODE' : '🔍 DRY RUN MODE'}`);
  console.log('==================================================\n');

  await connectDB();

  // Load Settings
  const settings = await CommissionSettings.getSettings();
  console.log('📋 Current Commission Settings:');
  console.log(`   Buyer Cashback: ${settings.directCommissionPercent}%`);
  console.log(`   Direct Referral: ${settings.referralCommissionPercent}%`);
  console.log(`   Tree Commission Pool: ${settings.treeCommissionPoolPercent}%`);
  console.log(`   Trust Fund: ${settings.trustFundPercent}%`);
  console.log(`   Admin Share: ${settings.adminCommissionPercent}%\n`);

  // Query ALL completed orders where commissionStatus !== 'distributed'
  const candidateOrders = await Order.find({
    status: 'completed',
    commissionStatus: { $ne: 'distributed' }
  }).sort({ createdAt: 1 });

  console.log(`🔍 Found ${candidateOrders.length} completed order(s) with commissionStatus != 'distributed'.\n`);

  const eligibleOrders = [];
  for (const order of candidateOrders) {
    const eligibility = await isOrderEligibleForCommission(order);
    if (eligibility.eligible) {
      eligibleOrders.push({ order, profit: eligibility.profit });
    }
  }

  console.log(`==================================================`);
  console.log(`ELIGIBLE ORDERS TO PROCESS: ${eligibleOrders.length}`);
  console.log(`==================================================\n`);

  if (eligibleOrders.length === 0) {
    console.log('✅ No pending eligible orders found for commission distribution.');
    process.exit(0);
  }

  let totalExpectedCashback = 0;
  let totalExpectedDirect = 0;
  let totalExpectedTree = 0;
  let totalExpectedTrust = 0;

  for (let i = 0; i < eligibleOrders.length; i++) {
    const { order, profit } = eligibleOrders[i];
    const buyer = await User.findById(order.user_id);
    const directReferrer = buyer ? await findUserByIdOrRef(buyer.referredBy) : null;

    // Build tree chain
    let treeChain = [];
    let currentAncestorId = buyer?.treeParent;
    let lvl = 1;
    while (currentAncestorId && lvl <= 5) {
      const ancestor = await findUserByIdOrRef(currentAncestorId);
      if (!ancestor) break;
      treeChain.push({ level: lvl, name: ancestor.name, id: ancestor._id });
      currentAncestorId = ancestor.treeParent;
      lvl++;
    }

    // Calculations
    const cb = profit * (settings.directCommissionPercent / 100);
    const dir = profit * (settings.referralCommissionPercent / 100);
    const tree = profit * (settings.treeCommissionPoolPercent / 100);
    const trust = profit * (settings.trustFundPercent / 100);

    totalExpectedCashback += cb;
    totalExpectedDirect += dir;
    totalExpectedTree += tree;
    totalExpectedTrust += trust;

    const existingCommTxs = await CommissionTransaction.find({ orderId: order._id });

    console.log(`--------------------------------------------------`);
    console.log(`[ORDER ${i + 1}/${eligibleOrders.length}] ID: ${order._id}`);
    console.log(`--------------------------------------------------`);
    console.log(`   Buyer: ${buyer ? `${buyer.name} (${buyer._id})` : 'MISSING USER'}`);
    console.log(`   Order Total: ₹${order.totalAmount}`);
    console.log(`   Order Profit: ₹${profit}`);
    console.log(`   Buyer Cashback Expected: ₹${cb.toFixed(2)}`);
    console.log(`   Direct Referrer: ${directReferrer ? `${directReferrer.name} (${directReferrer._id})` : 'NONE (Fallback Split)'}`);
    console.log(`   Direct Commission Expected: ₹${dir.toFixed(2)}`);
    console.log(`   Tree Path: ${treeChain.length > 0 ? treeChain.map(t => `L${t.level}:${t.name}`).join(' -> ') : 'None'}`);
    console.log(`   Tree Pool Expected: ₹${tree.toFixed(2)}`);
    console.log(`   Trust Fund Expected: ₹${trust.toFixed(2)}`);
    console.log(`   Existing CommissionTransactions: ${existingCommTxs.length}`);
    console.log(`   Action: ${isApplyMode ? '⚡ WILL DISTRIBUTE & CREDIT WALLETS' : '🔍 DRY RUN (NO CHANGES MADE)'}\n`);
  }

  console.log(`==================================================`);
  console.log(`DRY RUN / PREVIEW SUMMARY TOTALS`);
  console.log(`==================================================`);
  console.log(`Total Orders Eligible: ${eligibleOrders.length}`);
  console.log(`Total Expected Buyer Cashback: ₹${totalExpectedCashback.toFixed(2)}`);
  console.log(`Total Expected Direct Commission: ₹${totalExpectedDirect.toFixed(2)}`);
  console.log(`Total Expected Tree Pool: ₹${totalExpectedTree.toFixed(2)}`);
  console.log(`Total Expected Trust Fund: ₹${totalExpectedTrust.toFixed(2)}`);
  console.log(`Total Expected Payout: ₹${(totalExpectedCashback + totalExpectedDirect + totalExpectedTree + totalExpectedTrust).toFixed(2)}\n`);

  if (!isApplyMode) {
    console.log('ℹ️ DRY RUN COMPLETE. No database records or wallet balances were altered.');
    console.log('👉 To perform distribution, run: node scripts/backfillPendingCommissions.js --apply\n');
    process.exit(0);
  }

  // ==================================================
  // APPLY MODE: HARD-GATED MONGODUMP BACKUP
  // ==================================================
  console.log('\n==================================================');
  console.log('🛡️ MANDATORY PRE-APPLY DATABASE BACKUP');
  console.log('==================================================');

  const backupResult = await runBackup({ manual: true });
  console.log(`Backup Result Status: ${backupResult.status}`);
  console.log(`Backup File: ${backupResult.filename}`);
  console.log(`Backup Size: ${(backupResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);

  if (backupResult.status === 'FAILED' || backupResult.sizeBytes <= 0 || !backupResult.checksumSha256) {
    console.error('❌ CRITICAL: Database backup failed or created an invalid file! ABORTING APPLY.');
    process.exit(1);
  }

  console.log('✅ DATABASE BACKUP VERIFIED SUCCESSFULLY. Proceeding with commission distribution...\n');

  // ==================================================
  // APPLYING DISTRIBUTION
  // ==================================================
  let processedCount = 0;
  let failedCount = 0;
  const affectedUserIds = new Set();

  for (let i = 0; i < eligibleOrders.length; i++) {
    const { order, profit } = eligibleOrders[i];
    console.log(`⚡ Processing order [${i + 1}/${eligibleOrders.length}] ${order._id}...`);

    try {
      // Re-verify eligibility inside apply loop
      const eligibility = await isOrderEligibleForCommission(order);
      if (!eligibility.eligible) {
        console.log(`⚠️ Skipping order ${order._id}: ${eligibility.reason}`);
        continue;
      }

      const tx = await distributeCommissions(order._id, order.user_id, order.totalAmount || 0, profit);
      if (tx && tx.status === 'completed') {
        order.profitAmount = profit;
        order.commissionStatus = 'distributed';
        order.rewardApplied = true;
        await order.save();
        processedCount++;
        console.log(`✅ Order ${order._id} commissions distributed successfully!`);

        // Track affected user IDs for post-verification
        if (order.user_id) affectedUserIds.add(String(order.user_id));
        if (tx.directReferrer) affectedUserIds.add(String(tx.directReferrer));
        if (tx.referralReferrer) affectedUserIds.add(String(tx.referralReferrer));
        if (Array.isArray(tx.treeCommissions)) {
          tx.treeCommissions.forEach(tc => {
            if (tc.recipient) affectedUserIds.add(String(tc.recipient));
          });
        }
      } else {
        failedCount++;
        console.error(`❌ Order ${order._id} commission distribution returned non-completed transaction.`);
      }
    } catch (err) {
      failedCount++;
      console.error(`❌ Error processing order ${order._id}:`, err);
    }
  }

  console.log('\n==================================================');
  console.log('10. POST-DISTRIBUTION RECONCILIATION VERIFICATION');
  console.log('==================================================');
  console.log(`Processed Orders: ${processedCount}`);
  console.log(`Failed Orders: ${failedCount}`);
  console.log(`Distinct Affected Users: ${affectedUserIds.size}`);

  let reconciliationPass = true;
  for (const userId of affectedUserIds) {
    const userDoc = await User.findById(userId);
    if (!userDoc) continue;

    const wtxs = await WalletTransaction.find({ userId: userDoc._id });
    const ledgerSum = wtxs.reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
    const storedWallet = Number(userDoc.wallet || 0);

    const diff = Math.abs(ledgerSum - storedWallet);
    const pass = diff < 0.01;
    if (!pass) reconciliationPass = false;

    console.log(`   User: ${userDoc.name} (${userDoc._id}) | Stored Wallet: ₹${storedWallet.toFixed(2)} | Ledger Net: ₹${ledgerSum.toFixed(2)} | Status: ${pass ? 'PASS ✅' : 'MISMATCH ❌'}`);
  }

  console.log('\n==================================================');
  console.log(`FINAL BACKFILL REPORT`);
  console.log('==================================================');
  console.log(`Backup Successful: YES`);
  console.log(`Backfill Applied: YES`);
  console.log(`Orders Processed: ${processedCount}`);
  console.log(`Orders Failed: ${failedCount}`);
  console.log(`Wallet/Ledger Reconciliation: ${reconciliationPass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('==================================================\n');

  process.exit(0);
}

runBackfill();
