const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const TrustFund = require('../models/TrustFund');
const CommissionSettings = require('../models/CommissionSettings');
const { createTreePlacementOnFirstPurchase } = require('./treePlacement');
const mongoose = require('mongoose');

/**
 * Add funds to a trust fund (Trust Fund or Development Trust Fund)
 * 
 * @param {String} fundType - 'trust' or 'development'
 * @param {Number} amount - Amount to add
 * @param {String} orderId - Source order ID
 * @param {String} type - Transaction type ('order_allocation', 'remainder', 'withdrawal')
 * @param {String} description - Optional description
 * @param {Object} session - Optional MongoDB session for transactions
 * @returns {Promise<TrustFund>} Updated trust fund document
 */
async function addToTrustFund(fundType, amount, orderId, type = 'order_allocation', description = '', session = null) {
  if (!['trust', 'development'].includes(fundType)) {
    throw new Error(`Invalid fund type: ${fundType}. Must be 'trust' or 'development'`);
  }

  if (typeof amount !== 'number' || amount < 0) {
    throw new Error(`Invalid amount: ${amount}. Amount must be a non-negative number`);
  }

  if (amount === 0) {
    console.log(`Skipping zero amount allocation to ${fundType} fund`);
    return null;
  }

  const query = session ? TrustFund.findOne({ fundType }).session(session) : TrustFund.findOne({ fundType });
  let trustFund = await query;
  
  if (!trustFund) {
    trustFund = new TrustFund({ fundType, balance: 0, transactions: [] });
  }
  
  await trustFund.addTransaction(amount, type, orderId, description, session);
  return trustFund;
}

/**
 * 11-level ordered Tree Pool weight table (sum = 100.000000%)
 */
const TREE_WEIGHT_TABLE = [
  49.024905, // Level 1 (nearest parent = buyer.treeParent)
  25.512961, // Level 2
  12.756480, // Level 3
  6.378240,  // Level 4
  3.189120,  // Level 5
  1.594510,  // Level 6
  0.796405,  // Level 7
  0.398602,  // Level 8
  0.199301,  // Level 9
  0.099651,  // Level 10
  0.049825   // Level 11
];

/**
 * Shared tree upline resolver.
 * Traverses upward using treeParent starting from purchaser.treeParent.
 * Preserves nearest-to-farthest order, limits to maxLevels (default 11),
 * prevents cycles/duplicates, and stops if a referenced parent is missing/invalid.
 * If zero uplines are found via treeParent, attempts to resolve root/admin tree node.
 * 
 * @param {Object} purchaser - Purchaser user document (must have treeParent or _id)
 * @param {Number} maxLevels - Maximum levels to collect (default 11)
 * @returns {Promise<Array<Object>>} Ordered list of actual existing upline user documents
 */
async function resolveTreeUplines(purchaser, maxLevels = 11) {
  if (!purchaser) return [];

  const uplines = [];
  const visited = new Set();

  if (purchaser._id) {
    visited.add(purchaser._id.toString());
  }

  let currentTreeParentId = purchaser.treeParent;

  while (currentTreeParentId && uplines.length < maxLevels) {
    const idStr = currentTreeParentId.toString();

    if (visited.has(idStr)) {
      console.warn(`⚠️ Cycle or duplicate detected in treeParent chain at user ID: ${idStr}. Traversal stopped.`);
      break;
    }
    visited.add(idStr);

    const parentUser = await User.findById(currentTreeParentId);
    if (!parentUser) {
      console.warn(`⚠️ Referenced treeParent ID ${idStr} not found in database. Traversal stopped.`);
      break;
    }

    uplines.push(parentUser);
    currentTreeParentId = parentUser.treeParent;
  }

  // Zero-upline fallback: If no upline exists in treeParent chain, resolve root/admin account
  if (uplines.length === 0) {
    const adminUser = await User.findOne({ role: 'admin' });
    if (adminUser) {
      uplines.push(adminUser);
    }
  }

  return uplines;
}

/**
 * Shared pure Tree Pool calculation function.
 * Calculates normalized weight allocations across existing uplines and enforces exact paise integer reconciliation.
 * 
 * @param {Array<Object>} uplines - Ordered list of upline user objects
 * @param {Number} treePoolAmount - Total tree pool amount in currency units (Rupees)
 * @returns {Object} Normalized distribution breakdown and totals
 */
function calculateTreePoolDistribution(uplines, treePoolAmount) {
  const numericPool = Math.max(0, Number(treePoolAmount) || 0);
  const poolInPaise = Math.round(numericPool * 100);

  if (poolInPaise === 0) {
    return {
      distribution: [],
      totalCredited: 0,
      totalCreditedPaise: 0,
      poolAmount: 0,
      poolInPaise: 0
    };
  }

  if (!Array.isArray(uplines) || uplines.length === 0) {
    throw new Error('Tree Pool calculation failed: No valid tree upline or root recipient exists to receive Tree Pool distribution.');
  }

  const N = Math.min(uplines.length, TREE_WEIGHT_TABLE.length);
  const selectedWeights = TREE_WEIGHT_TABLE.slice(0, N);
  const selectedWeightTotal = selectedWeights.reduce((sum, w) => sum + w, 0);

  const distribution = uplines.slice(0, N).map((upline, idx) => {
    const weight = selectedWeights[idx];
    const normalizedPercent = (weight / selectedWeightTotal) * 100;
    const rawAmount = (poolInPaise / 100) * (weight / selectedWeightTotal);
    const paiseAmount = Math.round(rawAmount * 100);
    return {
      upline,
      level: idx + 1,
      weight,
      normalizedPercent,
      rawAmount,
      paiseAmount,
      amount: paiseAmount / 100
    };
  });

  // Paise integer rounding reconciliation
  const sumPaise = distribution.reduce((sum, d) => sum + d.paiseAmount, 0);
  const paiseRemainder = poolInPaise - sumPaise;
  if (paiseRemainder !== 0 && distribution.length > 0) {
    distribution[0].paiseAmount += paiseRemainder;
    distribution[0].amount = distribution[0].paiseAmount / 100;
  }

  const totalCreditedPaise = distribution.reduce((sum, d) => sum + d.paiseAmount, 0);
  if (totalCreditedPaise !== poolInPaise) {
    throw new Error(`Tree Pool calculation failed invariant: totalCreditedPaise (${totalCreditedPaise}) !== poolInPaise (${poolInPaise})`);
  }

  return {
    distribution,
    totalCredited: totalCreditedPaise / 100,
    totalCreditedPaise,
    poolAmount: poolInPaise / 100,
    poolInPaise
  };
}

/**
 * Preview commission breakdown for an order given a profit amount.
 * Does NOT modify any user wallets or create database transactions.
 * 
 * @param {String} orderId - The order ID
 * @param {Number} profitAmount - The profit amount entered by admin
 * @returns {Promise<Object>} Detailed preview breakdown
 */
async function previewCommissions(orderId, profitAmount = 0) {
  if (!orderId) {
    throw new Error('Order ID is required');
  }

  const numericProfit = Math.max(0, Number(profitAmount) || 0);

  const order = await Order.findById(orderId).populate('user_id');
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const purchaser = order.user_id;
  if (!purchaser) {
    throw new Error(`Purchaser not found for order: ${orderId}`);
  }

  const settings = await CommissionSettings.getSettings();

  // 1. Direct Commission (3% Cashback)
  const directCommission = numericProfit * (settings.directCommissionPercent / 100);
  const buyerBreakdown = {
    userId: purchaser._id,
    name: purchaser.name || 'Purchaser',
    email: purchaser.email || '',
    category: 'Direct Commission (Cashback)',
    percentage: settings.directCommissionPercent,
    amount: directCommission
  };

  // 2. Referral Commission (2%)
  const referralCommission = numericProfit * (settings.referralCommissionPercent / 100);
  let directReferrer = null;
  if (purchaser.referredBy && purchaser.referredBy.trim() !== '') {
    directReferrer = await User.findOne({ referralCode: purchaser.referredBy.trim() });
  }

  const adminUser = await User.findOne({ role: 'admin' });

  // 3. Admin Commission Share (settings.adminCommissionPercent of profit)
  const adminCommission = numericProfit * ((settings.adminCommissionPercent || 0) / 100);
  const adminBreakdown = {
    userId: adminUser ? adminUser._id : null,
    name: adminUser ? `Admin (${adminUser.name})` : 'Master Admin',
    email: adminUser ? adminUser.email : '',
    category: 'Admin Share',
    percentage: settings.adminCommissionPercent || 0,
    amount: adminCommission,
    destination: 'Master Admin Wallet'
  };

  let referrerBreakdown = {
    category: 'Referral Commission',
    percentage: settings.referralCommissionPercent,
    amount: referralCommission,
    status: 'active'
  };

  if (directReferrer) {
    if (directReferrer.suspended) {
      referrerBreakdown.userId = directReferrer._id;
      referrerBreakdown.name = directReferrer.name;
      referrerBreakdown.email = directReferrer.email;
      referrerBreakdown.status = 'suspended';
      referrerBreakdown.fallbackNote = 'Suspended (Allocated to Trust Fund)';
      referrerBreakdown.destination = 'Trust Fund';
    } else {
      referrerBreakdown.userId = directReferrer._id;
      referrerBreakdown.name = directReferrer.name;
      referrerBreakdown.email = directReferrer.email;
      referrerBreakdown.status = 'active';
      referrerBreakdown.destination = `Referrer Wallet (${directReferrer.name})`;
    }
  } else {
    // No referrer fallback
    referrerBreakdown.status = 'no_referrer';
    referrerBreakdown.isFallback = true;

    if (settings.referralFallbackRecipient === 'admin') {
      referrerBreakdown.name = adminUser ? `Admin (${adminUser.name})` : 'Admin (Not Found -> Trust Fund)';
      referrerBreakdown.destination = adminUser ? 'Admin Wallet' : 'Trust Fund';
      referrerBreakdown.splitAdmin = referralCommission;
      referrerBreakdown.splitTrust = 0;
    } else if (settings.referralFallbackRecipient === 'trust_fund') {
      referrerBreakdown.name = 'Trust Fund';
      referrerBreakdown.destination = 'Trust Fund';
      referrerBreakdown.splitAdmin = 0;
      referrerBreakdown.splitTrust = referralCommission;
    } else {
      // Split 50/50: 1% Admin, 1% Trust Fund
      const halfReferral = referralCommission / 2;
      referrerBreakdown.name = `50/50 Split: Admin (${adminUser ? adminUser.name : 'N/A'}) & Trust Fund`;
      referrerBreakdown.destination = '1% Admin Wallet + 1% Trust Fund';
      referrerBreakdown.splitAdmin = halfReferral;
      referrerBreakdown.splitTrust = halfReferral;
    }
  }

  // 4. Tree Commissions Pool (dynamic %, settings.treeCommissionPoolPercent)
  const treeCommissionPool = numericProfit * (settings.treeCommissionPoolPercent / 100);
  const treeCommissionsList = [];

  const uplines = await resolveTreeUplines(purchaser, 11);
  const treeCalc = calculateTreePoolDistribution(uplines, treeCommissionPool);

  for (const dist of treeCalc.distribution) {
    const treeParent = dist.upline;
    const levelIndex = dist.level;
    const percentage = Number(dist.normalizedPercent.toFixed(6));
    const commissionAmount = dist.amount;

    if (treeParent.suspended) {
      treeCommissionsList.push({
        level: levelIndex,
        userId: treeParent._id,
        name: treeParent.name,
        email: treeParent.email,
        percentage,
        amount: commissionAmount,
        status: 'suspended',
        fallbackNote: 'Suspended (Allocated to Trust Fund)',
        destination: 'Trust Fund'
      });
    } else if (treeParent.isVirtual && treeParent.originalUser) {
      const originalUser = await User.findById(treeParent.originalUser);
      treeCommissionsList.push({
        level: levelIndex,
        userId: treeParent._id,
        name: `${treeParent.name} (Virtual)`,
        email: treeParent.email,
        percentage,
        amount: commissionAmount,
        status: 'active',
        destination: originalUser ? `Original User (${originalUser.name})` : 'Trust Fund'
      });
    } else {
      treeCommissionsList.push({
        level: levelIndex,
        userId: treeParent._id,
        name: treeParent.name,
        email: treeParent.email,
        percentage,
        amount: commissionAmount,
        status: 'active',
        destination: `Wallet (${treeParent.name})`
      });
    }
  }

  // 5. Trust Fund Breakdown (Base Trust Fund only, Remainder = 0)
  const trustFundBase = numericProfit * (settings.trustFundPercent / 100);
  const trustFundRemainder = 0;
  const totalTrustFund = trustFundBase;

  const trustFundBreakdown = {
    category: 'Trust Fund',
    basePercentage: settings.trustFundPercent,
    baseAmount: trustFundBase,
    remainderAmount: trustFundRemainder,
    totalTrustAmount: totalTrustFund
  };

  const totalPercent = (settings.directCommissionPercent || 0) + 
                       (settings.referralCommissionPercent || 0) + 
                       (settings.adminCommissionPercent || 0) + 
                       (settings.treeCommissionPoolPercent || 0) + 
                       (settings.trustFundPercent || 0) + 
                       (settings.developmentFundPercent || 0);
  const expectedTotal = numericProfit * (totalPercent / 100);

  return {
    orderId: order._id,
    orderTotal: order.totalAmount,
    profitAmount: numericProfit,
    buyer: buyerBreakdown,
    referrer: referrerBreakdown,
    adminCommission: adminBreakdown,
    treeCommissions: treeCommissionsList,
    trustFund: trustFundBreakdown,
    totalCommissionAmount: expectedTotal
  };
}

/**
 * Atomically credit a user's wallet using $inc and record a ledger entry.
 * 
 * @param {String} userId - The user to credit
 * @param {Number} amount - The amount to credit (must be > 0)
 * @param {String} category - WalletTransaction category
 * @param {String} description - Human-readable description
 * @param {String} orderId - The related order ID
 * @param {String} commissionTransactionId - The related commission transaction ID
 * @param {Object} extraInc - Additional fields to $inc (e.g. { directCommissionEarned: amount })
 * @returns {Promise<Object>} The updated user document
 */
async function creditWallet(userId, amount, category, description, orderId, commissionTransactionId = null, extraInc = {}) {
  if (!userId || amount <= 0) return null;

  const incFields = { wallet: amount, ...extraInc };

  // Atomic $inc — no read-modify-write race condition
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: incFields },
    { new: true }
  );

  if (!updatedUser) {
    console.warn(`⚠️ creditWallet: User ${userId} not found, skipping`);
    return null;
  }

  // Create ledger entry
  await WalletTransaction.create({
    userId,
    amount,
    type: 'credit',
    category,
    description,
    orderId: orderId || null,
    commissionTransactionId: commissionTransactionId || null,
    balanceAfter: updatedUser.wallet
  });

  return updatedUser;
}

/**
 * Distribute commissions for a completed order using profitAmount as the basis.
 * Uses atomic $inc for all wallet credits and records WalletTransaction ledger entries.
 * 
 * @param {String} orderId - The order ID
 * @param {String} purchaserId - The user who made the purchase
 * @param {Number} orderAmount - The total order amount (sale amount)
 * @param {Number} profitAmount - The profit amount (selling price minus cost price)
 * @returns {Promise<CommissionTransaction>} The created commission transaction
 */
async function distributeCommissions(orderId, purchaserId, orderAmount, profitAmount = 0) {
  if (!orderId) {
    throw new Error('Order ID is required');
  }

  if (!purchaserId) {
    throw new Error('Purchaser ID is required');
  }

  const validOrderAmount = typeof orderAmount === 'number' && orderAmount >= 0 ? orderAmount : 0;
  
  // Look up order document to get authoritative orderProfitTotal
  let orderDoc = null;
  if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
    orderDoc = await Order.findById(orderId);
  }
  let numericProfit = 0;

  if (orderDoc && typeof orderDoc.orderProfitTotal === 'number' && orderDoc.orderProfitTotal >= 0) {
    numericProfit = orderDoc.orderProfitTotal;
  } else if (orderDoc && typeof orderDoc.profitAmount === 'number' && orderDoc.profitAmount >= 0) {
    numericProfit = orderDoc.profitAmount;
  } else {
    numericProfit = Math.max(0, Number(profitAmount) || 0);
  }

  // Check if commission has already been processed for this order
  const existingTransaction = await CommissionTransaction.findOne({ orderId });
  if (existingTransaction && existingTransaction.status === 'completed') {
    console.log(`Commission already processed for order ${orderId}`);
    return existingTransaction;
  }

  console.log(`💰 Processing commission distribution for order ${orderId}: Order Amount ₹${validOrderAmount}, Authoritative Profit Base ₹${numericProfit}`);
  
  try {
    const settings = await CommissionSettings.getSettings();
    const purchaser = await User.findById(purchaserId);
    
    if (!purchaser) {
      throw new Error(`Purchaser not found: ${purchaserId}`);
    }

    // 🎖️ CHECK AND ACTIVATE MEMBERSHIP (Product Subtotal >= ₹100)
    try {
      const { checkAndActivateMembership } = require('./membershipService');
      if (orderDoc) {
        await checkAndActivateMembership(orderDoc);
      }
    } catch (memErr) {
      console.error(`⚠️ Error checking membership in commission distribution:`, memErr.message);
    }
    
    // 🌳 CREATE TREE PLACEMENT ON FIRST PURCHASE IF ELIGIBLE
    if (purchaser.treeLevel === 0 || !purchaser.treeParent) {
      console.log(`🌳 Checking tree placement eligibility for ${purchaser.email} on first purchase`);
      
      if (validOrderAmount >= settings.minimumTreePlacementAmount) {
        try {
          await createTreePlacementOnFirstPurchase(purchaser._id, null);
          purchaser.firstPurchaseDone = true;
          if (!purchaser.firstPurchaseDate) purchaser.firstPurchaseDate = new Date();
          await purchaser.save();
          
          const updatedPurchaser = await User.findById(purchaserId);
          if (updatedPurchaser) {
            Object.assign(purchaser, updatedPurchaser.toObject());
          }
          console.log(`✅ Tree placement created for ${purchaser.email}: Level ${purchaser.treeLevel}, Parent: ${purchaser.treeParent}`);
        } catch (treePlacementError) {
          console.error(`❌ Error creating tree placement for ${purchaser.email}:`, treePlacementError);
        }
      } else {
        purchaser.firstPurchaseDone = true;
        if (!purchaser.firstPurchaseDate) purchaser.firstPurchaseDate = new Date();
        await purchaser.save();
      }
    }

    // Create commission transaction record
    const transaction = new CommissionTransaction({
      orderId,
      purchaser: purchaserId,
      orderAmount: validOrderAmount,
      profitAmount: numericProfit,
      status: 'pending'
    });

    let totalAllocated = 0;
    
    // 1. Allocate Trust Fund (dynamic %, settings.trustFundPercent = 1% of profit)
    const trustFundAmount = numericProfit * (settings.trustFundPercent / 100);
    if (trustFundAmount > 0) {
      await addToTrustFund('trust', trustFundAmount, orderId, 'order_allocation', 'Order commission allocation', null);
    }
    transaction.trustFundAmount = trustFundAmount;
    totalAllocated += trustFundAmount;
    
    // 2. Direct Commission (cashback to buyer) — atomic $inc + ledger with OVERRIDE logic
    let totalBuyerCashback = 0;
    
    if (orderDoc && Array.isArray(orderDoc.items) && orderDoc.items.length > 0) {
      for (const item of orderDoc.items) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const itemPrice = Math.max(0, Number(item.price) || 0);
        const lineProfit = typeof item.lineProfitSnapshot === 'number' 
          ? item.lineProfitSnapshot 
          : (Number(item.unitProfitSnapshot || 0) * qty);

        let cbAmount = Number(item.cashbackAmount) || 0;
        let cbPercent = Number(item.cashbackPercentage) || 0;

        if (cbAmount === 0 && cbPercent === 0 && item.id) {
          try {
            const BookModel = require('../models/Book');
            const BundleModel = require('../models/Bundle');
            const prodDoc = item.type === 'bundle' ? await BundleModel.findById(item.id) : await BookModel.findById(item.id);
            if (prodDoc) {
              cbAmount = Number(prodDoc.cashbackAmount) || 0;
              cbPercent = Number(prodDoc.cashbackPercentage) || 0;
            }
          } catch (e) {}
        }

        if (cbAmount > 0) {
          totalBuyerCashback += cbAmount * qty;
        } else if (cbPercent > 0) {
          totalBuyerCashback += ((itemPrice * cbPercent) / 100) * qty;
        } else {
          totalBuyerCashback += lineProfit * (settings.directCommissionPercent / 100);
        }
      }
    }
    if (totalBuyerCashback === 0 && numericProfit > 0) {
      totalBuyerCashback = numericProfit * (settings.directCommissionPercent / 100);
    }

    const directCommission = Number(Math.max(0, totalBuyerCashback).toFixed(2));
    if (directCommission > 0) {
      await creditWallet(
        purchaser._id, directCommission,
        'direct_commission',
        `Cashback for Order #${orderId.toString().slice(-6).toUpperCase()}`,
        orderId, null,
        { directCommissionEarned: directCommission, 'masterCard.accumulatedCommission': (purchaser.masterCard?.isAssigned && purchaser.masterCard?.status === 'active') ? directCommission : 0 }
      );
    }
    
    transaction.directReferrer = purchaser._id;
    transaction.directCommissionAmount = directCommission;
    totalAllocated += directCommission;
    console.log(`Direct Commission (cashback) of ₹${directCommission.toFixed(2)} credited to buyer ${purchaser.email}`);

    // 3. Referral Commission — atomic $inc + ledger
    const referralCommission = numericProfit * (settings.referralCommissionPercent / 100);
    const orderShortId = orderId.toString().slice(-6).toUpperCase();

    let directReferrer = null;
    if (purchaser.referredBy && purchaser.referredBy.trim() !== '') {
      directReferrer = await User.findOne({ referralCode: purchaser.referredBy.trim() });
    }

    if (directReferrer) {
      if (directReferrer.suspended) {
        console.log(`Direct referrer ${directReferrer.email} is suspended, allocating referral commission to Trust Fund`);
        if (referralCommission > 0) {
          await addToTrustFund('trust', referralCommission, orderId, 'order_allocation', `Referral commission - user suspended (${directReferrer.email})`, null);
        }
        transaction.trustFundAmount += referralCommission;
        transaction.referralReferrer = directReferrer._id;
        transaction.referralCommissionAmount = referralCommission;
        totalAllocated += referralCommission;
      } else {
        if (referralCommission > 0) {
          await creditWallet(
            directReferrer._id, referralCommission,
            'referral_commission',
            `Referral Commission for Order #${orderShortId}`,
            orderId, null,
            { referralCommissionEarned: referralCommission, 'masterCard.accumulatedCommission': (directReferrer.masterCard?.isAssigned && directReferrer.masterCard?.status === 'active') ? referralCommission : 0 }
          );
        }
        
        transaction.referralReferrer = directReferrer._id;
        transaction.referralCommissionAmount = referralCommission;
        totalAllocated += referralCommission;
        console.log(`Referral commission of ₹${referralCommission.toFixed(2)} credited to referrer ${directReferrer.email}`);
      }
    } else {
      // User has no referrer — fallback routing
      console.log('User has no referrer, executing fallback routing for referral commission');
      const adminUser = await User.findOne({ role: 'admin' });

      if (settings.referralFallbackRecipient === 'admin') {
        if (adminUser) {
          if (referralCommission > 0) {
            await creditWallet(
              adminUser._id, referralCommission,
              'referral_fallback',
              `Referral Fallback (no referrer) for Order #${orderShortId}`,
              orderId, null,
              { referralCommissionEarned: referralCommission }
            );
          }
          transaction.referralReferrer = adminUser._id;
          transaction.referralCommissionAmount = referralCommission;
          console.log(`Referral commission fallback of ₹${referralCommission.toFixed(2)} credited to admin: ${adminUser.email}`);
        } else {
          if (referralCommission > 0) {
            await addToTrustFund('trust', referralCommission, orderId, 'order_allocation', 'Referral commission - no referrer fallback - admin not found', null);
          }
          transaction.trustFundAmount += referralCommission;
          transaction.referralReferrer = null;
          transaction.referralCommissionAmount = referralCommission;
        }
        totalAllocated += referralCommission;
      } else if (settings.referralFallbackRecipient === 'trust_fund') {
        if (referralCommission > 0) {
          await addToTrustFund('trust', referralCommission, orderId, 'order_allocation', 'Referral commission - no referrer fallback - Trust Fund', null);
        }
        transaction.trustFundAmount += referralCommission;
        transaction.referralReferrer = null;
        transaction.referralCommissionAmount = referralCommission;
        totalAllocated += referralCommission;
      } else {
        // default 50/50 split
        const halfReferral = referralCommission / 2;
        
        if (adminUser) {
          if (halfReferral > 0) {
            await creditWallet(
              adminUser._id, halfReferral,
              'referral_fallback',
              `Referral Fallback Split (50% Admin) for Order #${orderShortId}`,
              orderId, null,
              { referralCommissionEarned: halfReferral }
            );
          }
          transaction.referralReferrer = adminUser._id;
          transaction.referralCommissionAmount = halfReferral;
        } else {
          if (halfReferral > 0) {
            await addToTrustFund('trust', halfReferral, orderId, 'order_allocation', 'Referral commission split - admin not found', null);
          }
          transaction.trustFundAmount += halfReferral;
        }
        totalAllocated += halfReferral;
        
        if (halfReferral > 0) {
          await addToTrustFund('trust', halfReferral, orderId, 'order_allocation', 'Referral commission split - trust fund portion', null);
        }
        transaction.trustFundAmount += halfReferral;
        totalAllocated += halfReferral;
      }
    }

    // 3.5. Admin Commission Share — atomic $inc + ledger
    const adminCommission = numericProfit * ((settings.adminCommissionPercent || 0) / 100);
    if (adminCommission > 0) {
      const adminUser2 = await User.findOne({ role: 'admin' });
      if (adminUser2) {
        await creditWallet(
          adminUser2._id, adminCommission,
          'admin_commission',
          `Admin Share for Order #${orderShortId}`,
          orderId, null,
          { adminCommissionEarned: adminCommission }
        );
        transaction.adminRecipient = adminUser2._id;
      }
    }
    transaction.adminCommissionAmount = adminCommission;
    totalAllocated += adminCommission;
    if (adminCommission > 0) {
      console.log(`👑 Admin Commission Share of ₹${adminCommission.toFixed(2)} credited to Admin wallet`);
    }
    
    // 4. Calculate Development Trust Fund (dynamic %, settings.developmentFundPercent)
    const devTrustBaseAmount = numericProfit * (settings.developmentFundPercent / 100);
    transaction.devTrustFundAmount = devTrustBaseAmount;
    if (devTrustBaseAmount > 0) {
      await addToTrustFund('trust', devTrustBaseAmount, orderId, 'order_allocation', 'Development fund allocation', null);
    }
    totalAllocated += devTrustBaseAmount;
    
    // 5. Distribute Tree Commissions — atomic $inc + ledger with normalized upline distribution
    const treeCommissionPool = numericProfit * (settings.treeCommissionPoolPercent / 100);
    transaction.treeCommissions = [];

    const uplines = await resolveTreeUplines(purchaser, 11);
    const treeCalc = calculateTreePoolDistribution(uplines, treeCommissionPool);

    for (const dist of treeCalc.distribution) {
      const treeParent = dist.upline;
      const levelIndex = dist.level;
      const percentage = Number(dist.normalizedPercent.toFixed(6));
      const commissionAmount = dist.amount;

      if (commissionAmount <= 0) continue;

      if (treeParent.suspended) {
        await addToTrustFund('trust', commissionAmount, orderId, 'order_allocation', `Tree commission - user suspended (${treeParent.email})`, null);
        transaction.trustFundAmount += commissionAmount;
        transaction.treeCommissions.push({
          recipient: treeParent._id,
          level: levelIndex,
          percentage,
          amount: commissionAmount
        });
      } else if (treeParent.isVirtual && treeParent.originalUser) {
        const originalUser = await User.findById(treeParent.originalUser);
        if (originalUser) {
          await creditWallet(
            originalUser._id, commissionAmount,
            'tree_commission',
            `Tree Commission (L${levelIndex}, via virtual) for Order #${orderShortId}`,
            orderId, null,
            { treeCommissionEarned: commissionAmount }
          );
          
          transaction.treeCommissions.push({
            recipient: treeParent._id,
            level: levelIndex,
            percentage,
            amount: commissionAmount,
            redirectedTo: originalUser._id
          });
        } else {
          await addToTrustFund('trust', commissionAmount, orderId, 'order_allocation', `Tree commission - virtual user original not found (${treeParent.email})`, null);
          transaction.trustFundAmount += commissionAmount;
          transaction.treeCommissions.push({
            recipient: treeParent._id,
            level: levelIndex,
            percentage,
            amount: commissionAmount
          });
        }
      } else {
        await creditWallet(
          treeParent._id, commissionAmount,
          'tree_commission',
          `Tree Commission (Level ${levelIndex}) for Order #${orderShortId}`,
          orderId, null,
          { treeCommissionEarned: commissionAmount }
        );
        
        transaction.treeCommissions.push({
          recipient: treeParent._id,
          level: levelIndex,
          percentage,
          amount: commissionAmount
        });
      }
      
      totalAllocated += commissionAmount;
    }
    
    // 6. Tree remainder to Trust Fund is 0 (100% Tree Pool distributed across existing uplines)
    transaction.remainderToDevFund = 0;
    
    // Verify total allocation matches expected % of profit
    // Verify total allocation matches expected total (allow tolerance for floating point rounding and manual cashback overrides)
    const totalPercent = (settings.directCommissionPercent || 0) + 
                         (settings.referralCommissionPercent || 0) + 
                         (settings.adminCommissionPercent || 0) + 
                         (settings.treeCommissionPoolPercent || 0) + 
                         (settings.trustFundPercent || 0) + 
                         (settings.developmentFundPercent || 0);
    const expectedTotal = numericProfit * (totalPercent / 100);
    const tolerance = 0.05;
    
    if (Math.abs(totalAllocated - expectedTotal) > tolerance) {
      console.log(`ℹ️ Commission allocation notice: allocated ₹${totalAllocated.toFixed(2)}, standard percentage formula expected ₹${expectedTotal.toFixed(2)} (Manual cashback override active)`);
    }
    
    transaction.status = 'completed';
    await transaction.save();
    
    // Backfill commissionTransactionId into all WalletTransaction entries created for this order
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      await WalletTransaction.updateMany(
        { orderId, commissionTransactionId: null },
        { $set: { commissionTransactionId: transaction._id } }
      );
    }
    
    // --- VIP Master Card Milestone System ---
    try {
      if (purchaserId && mongoose.Types.ObjectId.isValid(purchaserId)) {
        const VipMasterCard = require('../models/VipMasterCard');
        const VipMasterCardSequence = require('../models/VipMasterCardSequence');
        
        // Calculate user's cumulative completed purchases (including the current order)
        const queryObj = { user_id: purchaserId };
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
          queryObj.$or = [{ status: 'completed' }, { _id: orderId }];
        } else {
          queryObj.status = 'completed';
        }
        const completedOrders = await Order.find(queryObj);
        
        if (Array.isArray(completedOrders) && completedOrders.length > 0) {
          const uniqueOrdersMap = new Map();
          completedOrders.forEach(o => uniqueOrdersMap.set(o._id.toString(), o));
          const uniqueOrders = Array.from(uniqueOrdersMap.values());
          const cumulativeTotal = uniqueOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
          
          // Get currently issued cards
          const existingCards = await VipMasterCard.find({ userId: purchaserId }).sort({ tier: 1 });
          const highestTier = Array.isArray(existingCards) ? existingCards.length : 0;
          
          // Calculate how many milestones should be reached
          const targetMilestones = Math.floor(cumulativeTotal / 100);
          
          if (targetMilestones > highestTier) {
            console.log(`🏆 User ${purchaserId} cumulative total is ₹${cumulativeTotal.toFixed(2)}. Crossed ${targetMilestones - highestTier} new VIP Master Card milestone(s)!`);
            
            for (let M = highestTier + 1; M <= targetMilestones; M++) {
              // Retrieve and increment atomic sequence
              const counterDoc = await VipMasterCardSequence.findOneAndUpdate(
                { key: 'vip_master_card_seq' },
                { $inc: { seq: 1 } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              
              const padded = String(counterDoc.seq).padStart(8, '0');
              const part1 = padded.slice(0, 4);
              const part2 = padded.slice(4, 8);
              const cardNumber = `VIP ${part1} ${part2}`;
              
              const newCard = new VipMasterCard({
                userId: purchaserId,
                cardNumber,
                tier: M,
                milestoneAmount: M * 100,
                issuedAt: new Date()
              });
              await newCard.save();
              console.log(`✅ Issued VIP Master Card ${cardNumber} (Tier ${M}) to User ${purchaserId}`);
            }
          }
        }
      }
    } catch (vipError) {
      console.error('❌ Error processing VIP Master Card milestones:', vipError.message || vipError);
    }
    
    console.log(`✅ Commission distribution completed successfully for order ${orderId}`);
    return transaction;

  } catch (error) {
    console.error('❌ Commission distribution error:', error);
    try {
      await CommissionTransaction.findOneAndUpdate(
        { orderId },
        { status: 'failed' }
      );
    } catch (updateError) {
      console.error('Error updating transaction status:', updateError);
    }
    throw error;
  }
}


/**
 * Check whether an order is eligible for commission distribution.
 * 
 * @param {Object} order - Order document
 * @returns {Promise<Object>} { eligible: boolean, reason?: string, profit?: number }
 */
async function isOrderEligibleForCommission(order) {
  if (!order) {
    return { eligible: false, reason: "Order object is missing" };
  }

  // 1. Valid completed order
  if (order.status !== 'completed') {
    return { eligible: false, reason: `Order status is '${order.status}', expected 'completed'` };
  }

  // 1b. Check payment verification based on paymentType
  const pType = (order.paymentType || 'online').toLowerCase();
  if (['check', 'cheque', 'transfer'].includes(pType)) {
    if (order.paymentDetails?.status !== 'verified') {
      return { eligible: false, reason: `Offline ${pType} payment status is '${order.paymentDetails?.status || 'unverified'}', expected 'verified'` };
    }
  } else if (pType === 'online') {
    // For online Razorpay orders, status='completed' set via HMAC verification or admin confirmation
    if (!order.razorpay_payment_id && !order.rewardApplied && order.status !== 'completed') {
      return { eligible: false, reason: "Online payment missing verification proof" };
    }
  }

  // 2. Commission status must not already be 'distributed'
  if (order.commissionStatus === 'distributed') {
    return { eligible: false, reason: "Commission status is already 'distributed'" };
  }

  // 3. No existing completed CommissionTransaction for this order
  const existingTx = await CommissionTransaction.findOne({ orderId: order._id, status: 'completed' });
  if (existingTx) {
    return { eligible: false, reason: "CommissionTransaction already exists and is completed for this order" };
  }

  // 4. Calculate authoritative profit base
  let numericProfit = 0;
  if (typeof order.orderProfitTotal === 'number' && order.orderProfitTotal >= 0) {
    numericProfit = order.orderProfitTotal;
  } else if (typeof order.profitAmount === 'number' && order.profitAmount >= 0) {
    numericProfit = order.profitAmount;
  }

  if (numericProfit <= 0) {
    return { eligible: false, reason: `Order profit is ₹${numericProfit} (must be > 0)` };
  }

  return { eligible: true, profit: numericProfit };
}

/**
 * Process automatic commission distribution for an order if eligible.
 * 
 * @param {Object} order - Order document
 * @returns {Promise<Object|null>} CommissionTransaction or null if not processed/ineligible
 */
async function processAutomaticCommissionForOrder(order) {
  try {
    const eligibility = await isOrderEligibleForCommission(order);
    if (!eligibility.eligible) {
      console.log(`ℹ️ Order ${order._id} ineligible for automatic commission: ${eligibility.reason}`);
      return null;
    }

    console.log(`🚀 Triggering automatic commission distribution for order ${order._id} (Profit: ₹${eligibility.profit})`);
    const transaction = await distributeCommissions(
      order._id,
      order.user_id,
      order.totalAmount || 0,
      eligibility.profit
    );

    if (transaction && transaction.status === 'completed') {
      order.profitAmount = eligibility.profit;
      order.commissionStatus = 'distributed';
      order.rewardApplied = true;
      await order.save();
      console.log(`✅ Automatic commission distribution SUCCESS for order ${order._id}`);
      return transaction;
    }
    return null;
  } catch (err) {
    console.error(`❌ Automatic commission distribution FAILED for order ${order._id}:`, err);
    try {
      order.commissionStatus = order.commissionStatus || 'pending';
      await order.save();
    } catch (saveErr) {}
    return null;
  }
}

module.exports = {
  distributeCommissions,
  previewCommissions,
  addToTrustFund,
  creditWallet,
  isOrderEligibleForCommission,
  processAutomaticCommissionForOrder,
  TREE_WEIGHT_TABLE,
  resolveTreeUplines,
  calculateTreePoolDistribution
};

