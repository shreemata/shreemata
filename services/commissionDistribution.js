const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
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
  // Validate fund type
  if (!['trust', 'development'].includes(fundType)) {
    throw new Error(`Invalid fund type: ${fundType}. Must be 'trust' or 'development'`);
  }

  // Validate amount is non-negative
  if (typeof amount !== 'number' || amount < 0) {
    throw new Error(`Invalid amount: ${amount}. Amount must be a non-negative number`);
  }

  // Skip if amount is zero
  if (amount === 0) {
    console.log(`Skipping zero amount allocation to ${fundType} fund`);
    return null;
  }

  const query = session ? TrustFund.findOne({ fundType }).session(session) : TrustFund.findOne({ fundType });
  let trustFund = await query;
  
  // Initialize trust fund if it doesn't exist
  if (!trustFund) {
    trustFund = new TrustFund({ fundType, balance: 0, transactions: [] });
  }
  
  // Add transaction and update balance
  await trustFund.addTransaction(amount, type, orderId, description, session);
  
  return trustFund;
}

/**
 * Distribute commissions for a completed order
 * Implements the 10% allocation strategy:
 * - 6% direct commission to referrer
 * - 3% for tree commissions (with halving pattern: 1.5%, 0.75%, 0.375%, etc.)
 * - 1% to Development Trust Fund
 * - Remainder to Development Trust Fund
 * 
 * @param {String} orderId - The order ID
 * @param {String} purchaserId - The user who made the purchase
 * @param {Number} orderAmount - The total order amount
 * @returns {Promise<CommissionTransaction>} The created commission transaction
 */
async function distributeCommissions(orderId, purchaserId, orderAmount) {
  // Validate input parameters
  if (!orderId) {
    throw new Error('Order ID is required');
  }

  if (!purchaserId) {
    throw new Error('Purchaser ID is required');
  }

  if (typeof orderAmount !== 'number' || orderAmount <= 0) {
    throw new Error(`Invalid order amount: ${orderAmount}. Must be a positive number`);
  }

  // Check if commission has already been processed for this order
  const existingTransaction = await CommissionTransaction.findOne({ orderId });
  if (existingTransaction && existingTransaction.status === 'completed') {
    console.log(`Commission already processed for order ${orderId}`);
    return existingTransaction;
  }

  // For development environments without replica sets, we'll skip transactions
  // In production with replica sets, transactions should be enabled
  console.log('⚠️ Running commission distribution without transactions (development mode)');
  
  try {
    // Get commission settings
    const settings = await CommissionSettings.getSettings();
    
    const purchaser = await User.findById(purchaserId);
    
    if (!purchaser) {
      throw new Error(`Purchaser not found: ${purchaserId}`);
    }
    
    // 🌳 CREATE TREE PLACEMENT ON FIRST PURCHASE
    // Check if this is the user's first purchase and they don't have tree placement yet
    // Also check if the order amount meets the minimum threshold for tree placement
    if (!purchaser.firstPurchaseDone && (purchaser.treeLevel === 0 || !purchaser.treeParent)) {
      console.log(`🌳 Checking tree placement eligibility for ${purchaser.email} on first purchase`);
      
      // Check if order amount meets minimum threshold for tree placement
      if (orderAmount >= settings.minimumTreePlacementAmount) {
        console.log(`✅ Order amount ₹${orderAmount} meets minimum threshold ₹${settings.minimumTreePlacementAmount} - creating tree placement`);
        
        try {
          // Create tree placement for this user
          await createTreePlacementOnFirstPurchase(purchaser._id, null);
          
          // Mark first purchase as done with timestamp
          purchaser.firstPurchaseDone = true;
          purchaser.firstPurchaseDate = new Date();
          await purchaser.save();
          console.log(`✅ Marked first purchase as done for ${purchaser.email} at ${purchaser.firstPurchaseDate}`);
          
          // Refresh purchaser data to get updated tree information
          const updatedPurchaser = await User.findById(purchaserId);
          if (updatedPurchaser) {
            // Update the purchaser reference to use the updated data
            Object.assign(purchaser, updatedPurchaser.toObject());
          }
          
          console.log(`✅ Tree placement created for ${purchaser.email}: Level ${purchaser.treeLevel}, Parent: ${purchaser.treeParent}`);
        } catch (treePlacementError) {
          console.error(`❌ Error creating tree placement for ${purchaser.email}:`, treePlacementError);
          // Don't fail the entire commission distribution if tree placement fails
          // The commission distribution can still proceed
        }
      } else {
        console.log(`⚠️ Order amount ₹${orderAmount} below minimum threshold ₹${settings.minimumTreePlacementAmount} - skipping tree placement`);
        console.log(`   User will receive commissions but won't be placed in tree until threshold is met`);
        
        // Mark first purchase as done even if tree placement is skipped
        purchaser.firstPurchaseDone = true;
        purchaser.firstPurchaseDate = new Date();
        await purchaser.save();
        console.log(`✅ Marked first purchase as done for ${purchaser.email} at ${purchaser.firstPurchaseDate} (tree placement deferred)`);
      }
    } else if (purchaser.firstPurchaseDone) {
      console.log(`User ${purchaser.email} already has completed their first purchase`);
    } else {
      console.log(`User ${purchaser.email} already has tree placement: Level ${purchaser.treeLevel}`);
    }
    
    // Create commission transaction record
    const transaction = new CommissionTransaction({
      orderId,
      purchaser: purchaserId,
      orderAmount,
      status: 'pending'
    });
    
    // 1. Allocate Trust Fund (dynamic %)
    const trustFundAmount = orderAmount * (settings.trustFundPercent / 100);
    if (trustFundAmount < 0) {
      throw new Error('Trust fund amount cannot be negative');
    }
    await addToTrustFund('trust', trustFundAmount, orderId, 'order_allocation', 'Order commission allocation', null);
    transaction.trustFundAmount = trustFundAmount;
    
    // 2. Calculate and credit Direct Commission (dynamic %)
    const directCommission = orderAmount * (settings.directCommissionPercent / 100);
    if (directCommission < 0) {
      throw new Error('Direct commission amount cannot be negative');
    }

    // Handle users without referrers (referredBy = null)
    if (purchaser.referredBy === null || purchaser.referredBy === undefined || purchaser.referredBy === '') {
      // User has no referrer, allocate 3% direct commission to Trust Fund
      console.log('User has no referrer (referredBy = null), allocating direct commission to Trust Fund');
      await addToTrustFund('trust', directCommission, orderId, 'order_allocation', 'Direct commission - no referrer user', null);
      transaction.trustFundAmount += directCommission;
      transaction.directReferrer = null; // Explicitly set to null
      transaction.directCommissionAmount = directCommission; // Still record the amount for tracking
    } else {
      // User has a referral code, try to find the referrer
      const directReferrer = await User.findOne({ referralCode: purchaser.referredBy });
      
      if (directReferrer) {
        // Check if user is suspended
        if (directReferrer.suspended) {
          console.log(`Direct referrer ${directReferrer.email} is suspended, allocating commission to Trust Fund`);
          await addToTrustFund('trust', directCommission, orderId, 'order_allocation', `Direct commission - user suspended (${directReferrer.email})`, null);
          transaction.trustFundAmount += directCommission;
          transaction.directReferrer = directReferrer._id;
          transaction.directCommissionAmount = directCommission;
        } else {
          // Validate wallet update won't result in negative balance
          if (directReferrer.wallet + directCommission < 0) {
            throw new Error('Wallet update would result in negative balance');
          }

          directReferrer.wallet += directCommission;
          directReferrer.directCommissionEarned += directCommission;
          await directReferrer.save();
          
          transaction.directReferrer = directReferrer._id;
          transaction.directCommissionAmount = directCommission;
          
          console.log(`Direct commission of ${directCommission} credited to ${directReferrer.email}`);
        }
      } else {
        // Referral code exists but referrer not found, allocate to Trust Fund
        console.log(`Direct referrer not found for code ${purchaser.referredBy}, allocating to Trust Fund`);
        await addToTrustFund('trust', directCommission, orderId, 'order_allocation', 'Direct commission - referrer not found', null);
        transaction.trustFundAmount += directCommission;
        transaction.directReferrer = null;
        transaction.directCommissionAmount = directCommission;
      }
    }
    
    // 3. Calculate Development Trust Fund (dynamic %, will be added later with remainder)
    const devTrustBaseAmount = orderAmount * (settings.developmentFundPercent / 100);
    if (devTrustBaseAmount < 0) {
      throw new Error('Development trust fund amount cannot be negative');
    }
    transaction.devTrustFundAmount = devTrustBaseAmount;
    
    // 4. Distribute Tree Commissions based on TREE PLACEMENT (not referral chain)
    // This ensures commissions flow to tree parents regardless of referral relationships
    const treeCommissionPool = orderAmount * (settings.treeCommissionPoolPercent / 100);
    let remainingPool = treeCommissionPool;
    let currentTreeParent = purchaser.treeParent; // Start from purchaser's tree parent
    let levelIndex = 0;
    const maxLevels = settings.treeCommissionLevels.length || 20; // Use configured levels
    
    console.log(`🌳 Starting tree placement commission distribution from purchaser ${purchaser.email}`);
    console.log(`   Purchaser tree parent: ${currentTreeParent || 'None'}`);
    
    while (currentTreeParent && remainingPool > 0.01 && levelIndex < maxLevels) {
      const treeParent = await User.findById(currentTreeParent);
      
      if (!treeParent) {
        console.log(`Tree parent not found for ID ${currentTreeParent} at level ${levelIndex + 1}, stopping commission distribution`);
        break;
      }
      
      console.log(`   Level ${levelIndex + 1}: Found tree parent ${treeParent.email} (${treeParent.name})`);
      
      // Get percentage for this level from settings
      const levelConfig = settings.treeCommissionLevels[levelIndex];
      if (!levelConfig) {
        console.log(`   No commission configured for level ${levelIndex + 1}, stopping`);
        break;
      }
      
      const percentage = levelConfig.percentage;
      const commissionAmount = orderAmount * (percentage / 100);
      
      // Validate commission amount
      if (commissionAmount < 0) {
        throw new Error('Tree commission amount cannot be negative');
      }
      
      // Only distribute if we have enough in the pool
      if (commissionAmount <= remainingPool) {
        // Check if user is suspended
        if (treeParent.suspended) {
          console.log(`   Tree parent ${treeParent.email} is suspended, allocating commission to Trust Fund`);
          await addToTrustFund('trust', commissionAmount, orderId, 'order_allocation', `Tree commission - user suspended (${treeParent.email})`, null);
          transaction.trustFundAmount += commissionAmount;
          
          transaction.treeCommissions.push({
            recipient: treeParent._id,
            level: levelIndex + 1,
            percentage,
            amount: commissionAmount
          });
        } else {
          // Check if this is a virtual user - redirect commission to original user
          if (treeParent.isVirtual && treeParent.originalUser) {
            console.log(`   Tree parent ${treeParent.email} is virtual, redirecting commission to original user`);
            
            // Get the original user
            const originalUser = await User.findById(treeParent.originalUser);
            if (originalUser) {
              // Validate wallet update for original user
              if (originalUser.wallet + commissionAmount < 0) {
                throw new Error('Original user wallet update would result in negative balance');
              }

              // Credit commission to original user
              originalUser.wallet += commissionAmount;
              originalUser.treeCommissionEarned += commissionAmount;
              await originalUser.save();
              
              // Record transaction with virtual user as recipient but note the redirection
              transaction.treeCommissions.push({
                recipient: treeParent._id, // Virtual user ID for tracking
                level: levelIndex + 1,
                percentage,
                amount: commissionAmount,
                redirectedTo: originalUser._id // Track where money actually went
              });
              
              console.log(`   Tree commission of ${commissionAmount} (${percentage}%) credited to original user ${originalUser.email} (via virtual user ${treeParent.email}) at level ${levelIndex + 1}`);
            } else {
              console.log(`   Original user not found for virtual user ${treeParent.email}, allocating to Trust Fund`);
              await addToTrustFund('trust', commissionAmount, orderId, 'order_allocation', `Tree commission - virtual user original not found (${treeParent.email})`, null);
              transaction.trustFundAmount += commissionAmount;
              
              transaction.treeCommissions.push({
                recipient: treeParent._id,
                level: levelIndex + 1,
                percentage,
                amount: commissionAmount
              });
            }
          } else {
            // Regular user - credit commission normally
            // Validate wallet update
            if (treeParent.wallet + commissionAmount < 0) {
              throw new Error('Wallet update would result in negative balance');
            }

            treeParent.wallet += commissionAmount;
            treeParent.treeCommissionEarned += commissionAmount;
            await treeParent.save();
            
            transaction.treeCommissions.push({
              recipient: treeParent._id,
              level: levelIndex + 1,
              percentage,
              amount: commissionAmount
            });
            
            console.log(`   Tree commission of ${commissionAmount} (${percentage}%) credited to ${treeParent.email} at level ${levelIndex + 1}`);
          }
        }
        
        remainingPool -= commissionAmount;
        currentTreeParent = treeParent.treeParent; // Move up the tree
        levelIndex++;
      } else {
        console.log(`   Insufficient pool remaining (${remainingPool}) for commission amount ${commissionAmount}`);
        break;
      }
    }

    if (levelIndex >= maxLevels) {
      console.warn(`Reached maximum configured tree levels (${maxLevels}), stopping distribution`);
    }
    
    console.log(`🌳 Tree placement commission distribution completed. Remaining pool: ${remainingPool}`);
    
    // 5. Add Development Trust Fund (1% + any remainder from tree commission)
    transaction.remainderToDevFund = remainingPool;
    const totalDevFundAmount = devTrustBaseAmount + remainingPool;
    
    if (totalDevFundAmount < 0) {
      throw new Error('Development trust fund amount cannot be negative');
    }
    
    if (totalDevFundAmount > 0) {
      await addToTrustFund(
        'development', 
        totalDevFundAmount, 
        orderId, 
        'order_allocation', 
        `Order commission: ${settings.developmentFundPercent}% (₹${devTrustBaseAmount.toFixed(2)}) + Tree remainder (₹${remainingPool.toFixed(2)})`, 
        null
      );
      console.log(`Development Trust Fund: ₹${totalDevFundAmount.toFixed(2)} (1% + remainder)`);
    }
    
    // Verify total allocation equals 10%
    // Note: For no-referrer users, directCommissionAmount is included in trustFundAmount,
    // so we only count it separately if there's an actual directReferrer
    const directCommissionToCount = transaction.directReferrer ? transaction.directCommissionAmount : 0;
    const totalAllocated = transaction.trustFundAmount + 
                          directCommissionToCount + 
                          transaction.devTrustFundAmount + 
                          transaction.treeCommissions.reduce((sum, tc) => sum + tc.amount, 0) +
                          (transaction.remainderToDevFund || 0);
    
    const expectedTotal = orderAmount * 0.10;
    const tolerance = 0.01; // Allow 1 cent tolerance for rounding
    
    if (Math.abs(totalAllocated - expectedTotal) > tolerance) {
      throw new Error(
        `Commission allocation mismatch: allocated ${totalAllocated}, expected ${expectedTotal}`
      );
    }
    
    transaction.status = 'completed';
    await transaction.save();
    
    console.log(`Commission distribution completed successfully for order ${orderId}`);
    
    return transaction;

  } catch (error) {
    console.error('Commission distribution error:', error);
    
    // Update transaction status to failed if it was created
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

module.exports = {
  distributeCommissions,
  addToTrustFund
};
