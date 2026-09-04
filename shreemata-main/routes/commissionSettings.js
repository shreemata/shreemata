const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const CommissionSettings = require("../models/CommissionSettings");
const { authenticateToken, isAdmin } = require("../middleware/auth");

/* -------------------------------------------
   GET /api/admin/commission-settings
   Get current commission settings
--------------------------------------------*/
router.get("/commission-settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    res.json({ settings });
  } catch (err) {
    console.error("Error fetching commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/shipping-settings (PUBLIC)
   Get shipping settings for cart calculations
--------------------------------------------*/
router.get("/shipping-settings", async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    // Return both legacy and new shipping settings
    res.json({ 
      shippingSettings: {
        baseShippingCharge: settings.baseShippingCharge,
        shippingRatePerKg: settings.shippingRatePerKg,
        freeShippingThreshold: settings.freeShippingThreshold,
        shippingRates: settings.shippingRates || [
          { minWeight: 0, maxWeight: 0.99, rate: 25 },
          { minWeight: 1, maxWeight: 1.99, rate: 35 },
          { minWeight: 2, maxWeight: 2.99, rate: 45 },
          { minWeight: 3, maxWeight: 4.99, rate: 55 },
          { minWeight: 5, maxWeight: 9.99, rate: 75 }
        ]
      }
    });
  } catch (err) {
    console.error("Error fetching shipping settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/store-details
   Get store details for pickup (public endpoint)
--------------------------------------------*/
router.get("/store-details", async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    
    // Only return store-related settings, not commission data
    res.json({ 
      storeName: settings.storeName,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeHours: settings.storeHours,
      pickupInstructions: settings.pickupInstructions,
      storeMapLink: settings.storeMapLink
    });
  } catch (err) {
    console.error("Error fetching store details:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   PUT /api/admin/commission-settings
   Update commission settings
--------------------------------------------*/
router.put("/commission-settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('🔍 Commission settings update request received');
    console.log('📦 Request body:', req.body);
    
    const {
      directCommissionPercent,
      referralCommissionPercent,
      adminCommissionPercent,
      adminCommissionPercentage,
      treeCommissionPoolPercent,
      trustFundPercent,
      developmentFundPercent,
      minimumWithdrawalAmount,
      minimumTreePlacementAmount,
      baseShippingCharge,
      shippingRatePerKg,
      freeShippingThreshold,
      shippingRates,
      storeName,
      storeAddress,
      storePhone,
      storeHours,
      pickupInstructions,
      storeMapLink,
      treeCommissionLevels,
      directFallbackRecipient,
      referralFallbackRecipient
    } = req.body;
    
    console.log('🚚 Shipping fields received:', {
      baseShippingCharge,
      shippingRatePerKg,
      freeShippingThreshold
    });
    
    let settings = await CommissionSettings.getSettings();
    
    // Update fields if provided
    if (directCommissionPercent !== undefined) {
      settings.directCommissionPercent = directCommissionPercent;
    }
    if (referralCommissionPercent !== undefined) {
      settings.referralCommissionPercent = referralCommissionPercent;
    }
    if (adminCommissionPercent !== undefined) {
      settings.adminCommissionPercent = adminCommissionPercent;
    } else if (adminCommissionPercentage !== undefined) {
      settings.adminCommissionPercent = adminCommissionPercentage;
    }
    if (directFallbackRecipient !== undefined) {
      settings.directFallbackRecipient = directFallbackRecipient;
    }
    if (referralFallbackRecipient !== undefined) {
      settings.referralFallbackRecipient = referralFallbackRecipient;
    }
    if (treeCommissionPoolPercent !== undefined) {
      settings.treeCommissionPoolPercent = treeCommissionPoolPercent;
    }
    if (trustFundPercent !== undefined) {
      settings.trustFundPercent = trustFundPercent;
    }
    if (developmentFundPercent !== undefined) {
      settings.developmentFundPercent = developmentFundPercent;
    }
    if (treeCommissionLevels !== undefined) {
      settings.treeCommissionLevels = treeCommissionLevels;
    }
    if (minimumWithdrawalAmount !== undefined) {
      settings.minimumWithdrawalAmount = minimumWithdrawalAmount;
    }
    if (minimumTreePlacementAmount !== undefined) {
      settings.minimumTreePlacementAmount = minimumTreePlacementAmount;
    }
    if (baseShippingCharge !== undefined) {
      settings.baseShippingCharge = baseShippingCharge;
    }
    if (shippingRatePerKg !== undefined) {
      settings.shippingRatePerKg = shippingRatePerKg;
    }
    if (freeShippingThreshold !== undefined) {
      settings.freeShippingThreshold = freeShippingThreshold;
    }
    if (shippingRates !== undefined) {
      settings.shippingRates = shippingRates;
      console.log('📦 Updated shipping rates:', shippingRates);
    }
    if (storeName !== undefined) {
      settings.storeName = storeName;
    }
    if (storeAddress !== undefined) {
      settings.storeAddress = storeAddress;
    }
    if (storePhone !== undefined) {
      settings.storePhone = storePhone;
    }
    if (storeHours !== undefined) {
      settings.storeHours = storeHours;
    }
    if (pickupInstructions !== undefined) {
      settings.pickupInstructions = pickupInstructions;
    }
    if (storeMapLink !== undefined) {
      settings.storeMapLink = storeMapLink;
    }
    
    console.log('💾 Settings after update:', {
      baseShippingCharge: settings.baseShippingCharge,
      shippingRatePerKg: settings.shippingRatePerKg,
      freeShippingThreshold: settings.freeShippingThreshold,
      minimumWithdrawalAmount: settings.minimumWithdrawalAmount,
      minimumTreePlacementAmount: settings.minimumTreePlacementAmount
    });
    
    // Calculate total percentage dynamically
    const total = (settings.directCommissionPercent || 0) + 
                  (settings.referralCommissionPercent || 0) + 
                  (settings.adminCommissionPercent || 0) + 
                  (settings.treeCommissionPoolPercent || 0) + 
                  (settings.trustFundPercent || 0) + 
                  (settings.developmentFundPercent || 0);
    settings.totalAllocationPercent = total;
    
    // Auto-scale tree levels to match treeCommissionPoolPercent (no strict validation)
    if (settings.treeCommissionLevels && settings.treeCommissionLevels.length > 0) {
      const treeLevelsSum = settings.treeCommissionLevels.reduce((sum, lvl) => sum + (lvl.percentage || 0), 0);
      const targetPool = settings.treeCommissionPoolPercent || 0;
      if (treeLevelsSum > 0 && targetPool > 0 && Math.abs(treeLevelsSum - targetPool) >= 0.001) {
        const scaleFactor = targetPool / treeLevelsSum;
        settings.treeCommissionLevels = settings.treeCommissionLevels.map(lvl => ({
          ...lvl,
          percentage: parseFloat((lvl.percentage * scaleFactor).toFixed(4))
        }));
        console.log(`🔄 Auto-scaled tree levels by factor ${scaleFactor.toFixed(4)} to match pool ${targetPool}%`);
      }
    }
    
    settings.updatedBy = req.user.id || req.user.userId;
    await settings.save();
    
    res.json({ 
      message: "Commission settings updated successfully",
      settings 
    });
  } catch (err) {
    console.error("Error updating commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/admin/commission-settings/reset
   Reset to default settings
--------------------------------------------*/
router.post("/commission-settings/reset", authenticateToken, isAdmin, async (req, res) => {
  try {
    await CommissionSettings.deleteMany({});
    const settings = await CommissionSettings.getSettings();
    
    res.json({ 
      message: "Commission settings reset to defaults",
      settings 
    });
  } catch (err) {
    console.error("Error resetting commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/commission/transactions
   Get user's commission transactions including cashback
--------------------------------------------*/
router.get("/commission/transactions", authenticateToken, async (req, res) => {
  try {
    const CommissionTransaction = require("../models/CommissionTransaction");
    const Order = require("../models/Order");
    const Book = require("../models/Book");
    const Bundle = require("../models/Bundle");
    const WalletTransaction = require("../models/WalletTransaction");
    const User = require("../models/User");
    const userId = req.user.id || req.user.userId;

    // Fetch user for hiddenTransactions, adminDeletedTransactions, and role
    const userDoc = await User.findById(userId).select("hiddenTransactions adminDeletedTransactions role");
    const hiddenTransactions = userDoc?.hiddenTransactions || [];
    const adminDeletedTransactions = userDoc?.adminDeletedTransactions || [];
    const hiddenSet = new Set(hiddenTransactions.map(String));
    const adminDeletedSet = new Set(adminDeletedTransactions.map(String));
    const isAdmin = (req.user && req.user.role === 'admin') || (userDoc && userDoc.role === 'admin');
    
    // Get all commission transactions where user is involved
    const commissionTransactions = await CommissionTransaction.find({
      $or: [
        { purchaser: userId },
        { directReferrer: userId },
        { referralReferrer: userId },
        { 'treeCommissions.recipient': userId }
      ]
    })
    .populate('orderId', 'totalAmount createdAt')
    .populate('purchaser', 'name')
    .sort({ createdAt: -1 })
    .limit(100);

    // Get all orders by this user to calculate cashback (lean projection)
    const userOrders = await Order.find({ 
      user_id: userId, 
      status: 'completed' 
    }).select('items totalAmount createdAt').sort({ createdAt: -1 }).lean();

    // Collect all unique book and bundle IDs to batch query
    const bookIds = [];
    const bundleIds = [];
    for (const order of userOrders) {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.type === 'book' && item.id && mongoose.Types.ObjectId.isValid(item.id)) {
            bookIds.push(item.id);
          } else if (item.type === 'bundle' && item.id && mongoose.Types.ObjectId.isValid(item.id)) {
            bundleIds.push(item.id);
          }
        }
      }
    }

    // Batch query books and bundles in parallel
    const [books, bundles] = await Promise.all([
      bookIds.length > 0 ? Book.find({ _id: { $in: bookIds } }).select('cashbackAmount cashbackPercentage').lean() : [],
      bundleIds.length > 0 ? Bundle.find({ _id: { $in: bundleIds } }).select('cashbackAmount cashbackPercentage').lean() : []
    ]);

    const bookMap = new Map((books || []).map(b => [b._id.toString(), b]));
    const bundleMap = new Map((bundles || []).map(b => [b._id.toString(), b]));

    const allTransactions = [];
    
    // Add cashback transactions from user's orders (excluding admin-deleted)
    for (const order of userOrders) {
      const cashbackTxId = order._id.toString() + '_cashback';
      if (adminDeletedSet.has(cashbackTxId) || adminDeletedSet.has(order._id.toString())) {
        continue;
      }

      let totalCashback = 0;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          let itemCashback = 0;
          
          if (item.type === 'book' && item.id) {
            const book = bookMap.get(item.id.toString());
            if (book) {
              if (book.cashbackAmount > 0) {
                itemCashback = book.cashbackAmount * (item.quantity || 1);
              } else if (book.cashbackPercentage > 0) {
                itemCashback = (item.price * book.cashbackPercentage / 100) * (item.quantity || 1);
              }
            }
          } else if (item.type === 'bundle' && item.id) {
            const bundle = bundleMap.get(item.id.toString());
            if (bundle) {
              if (bundle.cashbackAmount > 0) {
                itemCashback = bundle.cashbackAmount * (item.quantity || 1);
              } else if (bundle.cashbackPercentage > 0) {
                itemCashback = (item.price * bundle.cashbackPercentage / 100) * (item.quantity || 1);
              }
            }
          }
          
          totalCashback += itemCashback;
        }
      }
      
      if (totalCashback > 0) {
        allTransactions.push({
          _id: cashbackTxId,
          recordId: order._id.toString(),
          sourceType: 'cashback',
          type: 'cashback',
          amount: totalCashback,
          description: `Cashback from order #${order._id.toString().slice(-8)}`,
          status: 'completed',
          createdAt: order.createdAt,
          orderId: order._id
        });
      }
    }
    
    // Add referral commission transactions (excluding admin-deleted)
    for (const tx of commissionTransactions) {
      // Direct referral commission (3%)
      const directTxId = tx._id.toString() + '_direct';
      if (!adminDeletedSet.has(directTxId) && !adminDeletedSet.has(tx._id.toString())) {
        if (tx.directReferrer && tx.directReferrer.toString() === userId && tx.directCommissionAmount > 0) {
          const isSelf = tx.purchaser && tx.purchaser._id.toString() === userId;
          allTransactions.push({
            _id: directTxId,
            recordId: tx._id.toString(),
            sourceType: 'commission_direct',
            type: 'direct_commission',
            amount: tx.directCommissionAmount,
            description: isSelf ? `Direct Commission (Cashback) from own purchase` : `Direct commission from ${tx.purchaser?.name || 'User'}`,
            status: 'completed',
            createdAt: tx.createdAt,
            orderId: tx.orderId?._id
          });
        }
      }
      
      // Referral commission (2%)
      const referralTxId = tx._id.toString() + '_referral';
      if (!adminDeletedSet.has(referralTxId) && !adminDeletedSet.has(tx._id.toString())) {
        if (tx.referralReferrer && tx.referralReferrer.toString() === userId && tx.referralCommissionAmount > 0) {
          allTransactions.push({
            _id: referralTxId,
            recordId: tx._id.toString(),
            sourceType: 'commission_referral',
            type: 'referral_commission',
            amount: tx.referralCommissionAmount,
            description: `Referral commission from ${tx.purchaser?.name || 'User'}`,
            status: 'completed',
            createdAt: tx.createdAt,
            orderId: tx.orderId?._id
          });
        }
      }
      
      // Tree commissions
      tx.treeCommissions.forEach((treeComm, index) => {
        const treeTxId = tx._id.toString() + '_tree_' + index;
        if (!adminDeletedSet.has(treeTxId) && !adminDeletedSet.has(tx._id.toString())) {
          if (treeComm.recipient.toString() === userId) {
            allTransactions.push({
              _id: treeTxId,
              recordId: tx._id.toString(),
              sourceType: 'commission_tree',
              type: 'level_commission',
              amount: treeComm.amount,
              description: `Level ${treeComm.level} commission from ${tx.purchaser?.name || 'User'}`,
              status: 'completed',
              createdAt: tx.createdAt,
              orderId: tx.orderId?._id
            });
          }
        }
      });
    }

    // Add debit and refund ledger records from WalletTransaction (excluding admin-deleted)
    const walletRecords = await WalletTransaction.find({ 
      userId, 
      $or: [{ type: 'debit' }, { category: 'refund' }]
    }).sort({ createdAt: -1 });

    for (const wtx of walletRecords) {
      const wtxIdStr = wtx._id.toString();
      if (adminDeletedSet.has(wtxIdStr)) {
        continue;
      }

      let txType = 'withdrawal';
      if (wtx.category === 'vip_master_card_withdrawal') {
        txType = 'vip_master_card_withdrawal';
      } else if (wtx.category === 'refund') {
        txType = 'refund';
      }

      allTransactions.push({
        _id: wtxIdStr,
        recordId: wtxIdStr,
        sourceType: 'wallet_transaction',
        type: txType,
        amount: wtx.amount,
        description: wtx.description || (txType === 'refund' ? 'Withdrawal Refund' : 'Withdrawal'),
        status: 'completed',
        createdAt: wtx.createdAt,
        balanceAfter: wtx.balanceAfter
      });
    }
    
    // Sort all transactions by date (newest first)
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const mappedTransactions = allTransactions.map(tx => ({
      ...tx,
      isHidden: hiddenSet.has(String(tx._id))
    }));

    res.json({ 
      transactions: mappedTransactions,
      hiddenTransactions: Array.from(hiddenSet),
      isAdmin: Boolean(isAdmin)
    });
  } catch (err) {
    console.error("Error fetching commission transactions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/commission/transactions/hide
   Soft-hide a transaction from customer history
--------------------------------------------*/
router.post("/commission/transactions/hide", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: "Transaction ID is required" });
    }
    const User = require("../models/User");
    await User.findByIdAndUpdate(userId, {
      $addToSet: { hiddenTransactions: String(transactionId) }
    });
    res.json({ 
      success: true, 
      message: "Transaction hidden from history", 
      transactionId: String(transactionId) 
    });
  } catch (err) {
    console.error("Error hiding transaction:", err);
    res.status(500).json({ error: "Failed to hide transaction" });
  }
});

/* -------------------------------------------
   POST /api/commission/transactions/restore
   Restore a soft-hidden transaction to customer history
--------------------------------------------*/
router.post("/commission/transactions/restore", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: "Transaction ID is required" });
    }
    const User = require("../models/User");
    await User.findByIdAndUpdate(userId, {
      $pull: { hiddenTransactions: String(transactionId) }
    });
    res.json({ 
      success: true, 
      message: "Transaction restored to history", 
      transactionId: String(transactionId) 
    });
  } catch (err) {
    console.error("Error restoring transaction:", err);
    res.status(500).json({ error: "Failed to restore transaction" });
  }
});

/* -------------------------------------------
   DELETE /api/commission/transactions/:id
   ADMIN ONLY: Permanent delete financial transaction
--------------------------------------------*/
router.delete("/commission/transactions/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const User = require("../models/User");
    const userDoc = await User.findById(userId).select("role");
    const isAdmin = (req.user && req.user.role === 'admin') || (userDoc && userDoc.role === 'admin');
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied: Admin authorization required" });
    }

    const txId = (req.params.id || '').trim();
    if (!txId) {
      return res.status(400).json({ error: "Invalid transaction identifier: ID is missing" });
    }

    console.log("🗑️ Admin permanent delete requested for ID:", txId, "by admin:", userId);

    // Multi-source identifier resolution
    let sourceType = req.body?.sourceType;
    let recordId = req.body?.recordId;

    if (!sourceType || !recordId) {
      if (txId.endsWith('_cashback')) {
        sourceType = 'cashback';
        recordId = txId.replace('_cashback', '');
      } else if (txId.endsWith('_direct')) {
        sourceType = 'commission_direct';
        recordId = txId.replace('_direct', '');
      } else if (txId.endsWith('_referral')) {
        sourceType = 'commission_referral';
        recordId = txId.replace('_referral', '');
      } else if (txId.includes('_tree_')) {
        sourceType = 'commission_tree';
        recordId = txId.split('_tree_')[0];
      } else if (mongoose.Types.ObjectId.isValid(txId)) {
        sourceType = 'wallet_transaction';
        recordId = txId;
      } else {
        sourceType = 'custom';
        recordId = txId;
      }
    }

    // Process source-specific deletion
    if (sourceType === 'wallet_transaction' && mongoose.Types.ObjectId.isValid(recordId)) {
      const WalletTransaction = require("../models/WalletTransaction");
      await WalletTransaction.findByIdAndDelete(recordId);
      
      // If matching withdrawal entry in user's withdrawals array, clean it up
      await User.findByIdAndUpdate(userId, {
        $pull: { withdrawals: { _id: recordId } }
      });
    } else if (sourceType === 'cashback') {
      const Order = require("../models/Order");
      if (mongoose.Types.ObjectId.isValid(recordId)) {
        const orderExists = await Order.findById(recordId).select("_id user_id");
        if (orderExists && orderExists.user_id) {
          await User.findByIdAndUpdate(orderExists.user_id, {
            $addToSet: { adminDeletedTransactions: String(txId) }
          });
        }
      }
    } else if (sourceType.startsWith('commission_')) {
      const CommissionTransaction = require("../models/CommissionTransaction");
      if (mongoose.Types.ObjectId.isValid(recordId)) {
        await CommissionTransaction.findById(recordId).select("_id");
      }
    }

    // Persist exclusion on user document so transaction is never returned in history
    await User.findByIdAndUpdate(userId, {
      $addToSet: { adminDeletedTransactions: String(txId) },
      $pull: { hiddenTransactions: String(txId) }
    });

    // Clean up hidden arrays system-wide
    await User.updateMany({}, { $pull: { hiddenTransactions: String(txId) } });

    console.log("✅ Admin permanent delete completed successfully for:", { txId, sourceType, recordId });

    return res.status(200).json({ 
      success: true, 
      message: "Transaction permanently deleted by admin", 
      transactionId: txId,
      sourceType: sourceType 
    });
  } catch (err) {
    console.error("❌ Error permanently deleting transaction:", err);
    return res.status(500).json({ error: err.message || "Failed to delete transaction" });
  }
});

/* -------------------------------------------
   GET /api/commission/settings
   Get commission settings (public for withdrawal limits)
--------------------------------------------*/
router.get("/commission/settings", authenticateToken, async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    res.json({ 
      settings: {
        minimumWithdrawalAmount: settings.minimumWithdrawalAmount || 100,
        vipMinimumWithdrawalAmount: 500,
        vipMandatoryReserveBalance: 50
      }
    });
  } catch (err) {
    console.error("Error fetching commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/commission/withdraw
   Request standard wallet withdrawal
--------------------------------------------*/
router.post("/commission/withdraw", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id || req.user.userId;
    const User = require("../models/User");
    const WalletTransaction = require("../models/WalletTransaction");
    
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }
    
    // Get user and check balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const walletBalance = user.wallet || 0;
    if (numericAmount > walletBalance) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    
    // Get minimum withdrawal amount
    const settings = await CommissionSettings.getSettings();
    const minWithdrawal = settings.minimumWithdrawalAmount || 100;
    
    if (numericAmount < minWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdrawal}` });
    }
    
    // Payment Details Validation (Bank or UPI)
    const { accountHolderName, accountNumber, bankName, ifscCode, upiId, qrCodeData, scannerImage, scannerImageUrl, paymentProof } = req.body;
    const scannerPath = scannerImageUrl || scannerImage || qrCodeData || paymentProof || user.bankDetails?.scannerImageUrl || user.bankDetails?.scannerImage || user.bankDetails?.qrCodeData || null;
    const isBankSetup = user.bankDetails && user.bankDetails.isSetup;

    if (!isBankSetup) {
      const hasUpi = Boolean(upiId && upiId.trim());
      const hasBank = Boolean(accountNumber && accountNumber.trim() && bankName && bankName.trim() && ifscCode && ifscCode.trim());

      if (!hasUpi && !hasBank) {
        return res.status(400).json({
          error: "Payment destination required. Please provide either complete Bank details (Account Number, Bank Name, IFSC Code) or a UPI ID.",
          requiresPaymentDetails: true
        });
      }

      // Save to user bank details
      user.bankDetails = {
        ...(user.bankDetails || {}),
        accountHolderName: (accountHolderName || user.name || 'User').trim(),
        accountNumber: accountNumber ? accountNumber.trim() : null,
        bankName: bankName ? bankName.trim() : null,
        ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : null,
        upiId: upiId ? upiId.trim().toLowerCase() : null,
        scannerImageUrl: scannerPath,
        scannerImage: scannerPath,
        qrCode: scannerPath,
        qrCodeData: scannerPath,
        isSetup: true,
        setupDate: new Date(),
        lastModifiedBy: 'user'
      };
    } else if (scannerPath && (!user.bankDetails.scannerImageUrl && !user.bankDetails.scannerImage)) {
      user.bankDetails.scannerImageUrl = scannerPath;
      user.bankDetails.scannerImage = scannerPath;
      user.bankDetails.qrCodeData = scannerPath;
    }

    const balanceBefore = walletBalance;
    user.wallet = walletBalance - numericAmount;
    const balanceAfter = user.wallet;

    // Update withdrawal statistics
    if (!user.withdrawalStats) {
      user.withdrawalStats = { totalWithdrawn: 0, dailyWithdrawn: 0, monthlyWithdrawn: 0, lastResetDate: new Date() };
    }
    user.withdrawalStats.totalWithdrawn = (user.withdrawalStats.totalWithdrawn || 0) + numericAmount;
    user.withdrawalStats.lastWithdrawalDate = new Date();

    user.withdrawals.push({
      amount: numericAmount,
      source: 'wallet',
      balanceBefore,
      balanceAfter,
      upi: user.bankDetails?.upiId || null,
      bankName: user.bankDetails?.bankName || null,
      bank: user.bankDetails?.accountNumber || null,
      ifsc: user.bankDetails?.ifscCode || null,
      scannerImageUrl: scannerPath,
      scannerImage: scannerPath,
      qrCodeData: scannerPath,
      paymentProof: scannerPath,
      paymentDetails: {
        scannerImageUrl: scannerPath,
        scannerImage: scannerPath,
        upiId: user.bankDetails?.upiId || null,
        accountNumber: user.bankDetails?.accountNumber || null,
        bankName: user.bankDetails?.bankName || null,
        ifscCode: user.bankDetails?.ifscCode || null,
        accountHolderName: user.bankDetails?.accountHolderName || null
      },
      status: "pending",
      requestedAt: new Date()
    });
    
    await user.save();

    // Create ledger transaction
    const ledgerTx = new WalletTransaction({
      userId: user._id,
      amount: numericAmount,
      type: 'debit',
      category: 'withdrawal',
      description: `Commission Wallet Withdrawal`,
      balanceAfter
    });
    await ledgerTx.save();
    
    const newWithdrawal = user.withdrawals[user.withdrawals.length - 1];

    res.json({ 
      success: true,
      message: "Withdrawal request submitted successfully",
      remainingBalance: user.wallet,
      withdrawalAmount: numericAmount,
      withdrawalId: newWithdrawal?._id,
      transactionId: ledgerTx._id
    });
  } catch (err) {
    console.error("Error processing withdrawal:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/commission/withdraw/cancel/:withdrawId & DELETE /api/commission/withdraw/:withdrawId
   Cancel or delete user withdrawal request
--------------------------------------------*/
const handleUserCancelWithdrawal = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const withdrawId = req.params.withdrawId || req.body.withdrawId;

    if (!withdrawId) {
      return res.status(400).json({ error: "Withdrawal ID is required" });
    }

    const User = require("../models/User");
    const WalletTransaction = require("../models/WalletTransaction");

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const withdrawal = user.withdrawals.id(withdrawId);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal request not found" });

    if (withdrawal.status === "pending") {
      // Refund wallet balance
      user.wallet += (withdrawal.amount || 0);

      const refundTx = new WalletTransaction({
        userId: user._id,
        amount: withdrawal.amount,
        type: 'credit',
        category: 'refund',
        description: `Refund for cancelled ${withdrawal.source === 'vip_master_card' ? 'VIP Master Card' : 'wallet'} withdrawal`,
        balanceAfter: user.wallet
      });
      await refundTx.save();
    }

    // Remove from withdrawals list
    user.withdrawals.pull({ _id: withdrawId });
    await user.save();

    res.json({
      success: true,
      message: "Withdrawal request removed successfully",
      remainingBalance: user.wallet
    });

  } catch (err) {
    console.error("Cancel withdrawal error:", err);
    res.status(500).json({ error: "Server error cancelling withdrawal" });
  }
};

router.post("/commission/withdraw/cancel/:withdrawId", authenticateToken, handleUserCancelWithdrawal);
router.post("/commission/withdraw/cancel", authenticateToken, handleUserCancelWithdrawal);
router.delete("/commission/withdraw/:withdrawId", authenticateToken, handleUserCancelWithdrawal);
router.post("/withdraw/cancel/:withdrawId", authenticateToken, handleUserCancelWithdrawal);
router.post("/withdraw/cancel", authenticateToken, handleUserCancelWithdrawal);
router.delete("/withdraw/:withdrawId", authenticateToken, handleUserCancelWithdrawal);

/* -------------------------------------------
   POST /api/commission/vip-withdraw & /api/vip-withdraw
   Request VIP Master Card commission withdrawal
   Validation Rules:
   - Minimum withdrawal amount allowed: ₹500
   - Mandatory minimum balance remaining: ₹50
   - Reject if (Available Balance - Requested Amount) < 50 OR Requested Amount < 500
--------------------------------------------*/
const handleVipWithdrawRequest = async (req, res) => {
  try {
    const { 
      amount, 
      cardNumber: requestedCardNumber, 
      cardId,
      cardTier: requestedTier,
      accountHolderName, 
      accountNumber, 
      bankName, 
      ifscCode, 
      upiId,
      bankDetails 
    } = req.body;

    const userId = req.user.id || req.user.userId;
    const User = require("../models/User");
    const VipMasterCard = require("../models/VipMasterCard");
    const WalletTransaction = require("../models/WalletTransaction");
    const sendMail = require("../utils/sendMail");

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: "Please enter a valid withdrawal amount." 
      });
    }

    // Rule 1: Minimum withdrawal is ₹500
    if (numericAmount < 500) {
      return res.status(400).json({ 
        success: false,
        error: "Minimum withdrawal amount allowed for VIP Master Card is ₹500.",
        minAmount: 500
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // Check VIP card ownership
    const userCards = await VipMasterCard.find({ userId: user._id }).sort({ tier: -1 });
    const hasVipCards = userCards.length > 0 || (user.masterCard && user.masterCard.isAssigned);

    if (!hasVipCards) {
      return res.status(403).json({ 
        success: false,
        error: "No active VIP Master Card found for your account." 
      });
    }

    let targetCard = null;
    let cardNumber = '';
    let cardTier = 1;

    if (requestedCardNumber) {
      targetCard = userCards.find(c => c.cardNumber === requestedCardNumber);
      if (targetCard) {
        cardNumber = targetCard.cardNumber;
        cardTier = targetCard.tier;
      } else if (user.masterCard && user.masterCard.isAssigned && user.masterCard.cardNumber === requestedCardNumber) {
        cardNumber = user.masterCard.cardNumber;
        cardTier = 1;
      } else {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: You can only withdraw from a VIP Master Card assigned to your account."
        });
      }
    } else if (cardId) {
      targetCard = userCards.find(c => String(c._id) === String(cardId) || c.cardNumber === cardId);
      if (targetCard) {
        cardNumber = targetCard.cardNumber;
        cardTier = targetCard.tier;
      } else if (user.masterCard && user.masterCard.isAssigned) {
        cardNumber = user.masterCard.cardNumber || 'VIP Master Card';
        cardTier = 1;
      }
    } else {
      if (userCards.length > 0) {
        targetCard = userCards[0];
        cardNumber = targetCard.cardNumber;
        cardTier = targetCard.tier;
      } else if (user.masterCard && user.masterCard.isAssigned && user.masterCard.cardNumber) {
        cardNumber = user.masterCard.cardNumber;
        cardTier = 1;
      } else {
        cardNumber = 'VIP Master Card';
        cardTier = 1;
      }
    }

    const availableBalance = Number(user.wallet || 0);

    // Rule 2 & 3: Check balance and mandatory reserve of ₹50
    if (numericAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Your available VIP card balance is ₹${availableBalance.toFixed(2)}.`,
        availableBalance
      });
    }

    const remainingAfterWithdrawal = availableBalance - numericAmount;
    if (remainingAfterWithdrawal < 50) {
      const maxWithdrawable = Math.max(0, availableBalance - 50);
      return res.status(400).json({
        success: false,
        error: `A mandatory minimum balance of ₹50 must remain in your VIP Master Card balance after withdrawal. Available: ₹${availableBalance.toFixed(2)}, Maximum withdrawable: ₹${maxWithdrawable.toFixed(2)}.`,
        availableBalance,
        mandatoryReserve: 50,
        maxWithdrawable
      });
    }

    // Payment Details Validation (Bank or UPI)
    const { 
      qrCodeData, 
      scannerImage, 
      scannerImageUrl,
      paymentProof 
    } = req.body;
    const scannerPath = scannerImageUrl || scannerImage || qrCodeData || paymentProof || user.bankDetails?.scannerImageUrl || user.bankDetails?.scannerImage || user.bankDetails?.qrCodeData || null;

    const holderName = (accountHolderName || bankDetails?.accountHolderName || bankDetails?.holderName || '').trim();
    const accNum = (accountNumber || bankDetails?.accountNumber || bankDetails?.accNumber || '').trim();
    const bName = (bankName || bankDetails?.bankName || '').trim();
    const ifsc = (ifscCode || bankDetails?.ifscCode || bankDetails?.ifsc || '').trim().toUpperCase();
    const upi = (upiId || bankDetails?.upiId || bankDetails?.upi || '').trim().toLowerCase();

    const isBankSetup = user.bankDetails && user.bankDetails.isSetup;

    if (!isBankSetup) {
      const hasUpi = Boolean(upi);
      const hasBank = Boolean(accNum && bName && ifsc);

      if (!hasUpi && !hasBank) {
        return res.status(400).json({
          success: false,
          error: "Payment destination required. Please provide either complete Bank details (Account Number, Bank Name, IFSC Code) or a UPI ID.",
          requiresPaymentDetails: true
        });
      }

      // Save to user bank details for this and future withdrawals
      user.bankDetails = {
        ...(user.bankDetails || {}),
        accountHolderName: holderName || user.name || 'User',
        accountNumber: accNum || null,
        bankName: bName || null,
        ifscCode: ifsc || null,
        upiId: upi || null,
        scannerImageUrl: scannerPath,
        scannerImage: scannerPath,
        qrCode: scannerPath,
        qrCodeData: scannerPath,
        isSetup: true,
        setupDate: new Date(),
        lastModifiedBy: 'user'
      };
    } else if (scannerPath && (!user.bankDetails.scannerImageUrl && !user.bankDetails.scannerImage)) {
      user.bankDetails.scannerImageUrl = scannerPath;
      user.bankDetails.scannerImage = scannerPath;
      user.bankDetails.qrCodeData = scannerPath;
    }

    // Real-time balance updates
    const balanceBefore = availableBalance;
    user.wallet = remainingAfterWithdrawal;
    const balanceAfter = user.wallet;

    if (!user.withdrawalStats) {
      user.withdrawalStats = { totalWithdrawn: 0, dailyWithdrawn: 0, monthlyWithdrawn: 0, lastResetDate: new Date() };
    }
    user.withdrawalStats.totalWithdrawn = (user.withdrawalStats.totalWithdrawn || 0) + numericAmount;
    user.withdrawalStats.lastWithdrawalDate = new Date();

    const withdrawalEntry = {
      amount: numericAmount,
      source: 'vip_master_card',
      cardNumber,
      cardTier,
      cardId: targetCard ? targetCard._id : null,
      balanceBefore,
      balanceAfter,
      mandatoryReserve: 50,
      upi: user.bankDetails?.upiId || null,
      bankName: user.bankDetails?.bankName || null,
      bank: user.bankDetails?.accountNumber || null,
      ifsc: user.bankDetails?.ifscCode || null,
      scannerImageUrl: scannerPath,
      scannerImage: scannerPath,
      qrCodeData: scannerPath,
      paymentProof: scannerPath,
      paymentDetails: {
        scannerImageUrl: scannerPath,
        scannerImage: scannerPath,
        upiId: user.bankDetails?.upiId || null,
        accountNumber: user.bankDetails?.accountNumber || null,
        bankName: user.bankDetails?.bankName || null,
        ifscCode: user.bankDetails?.ifscCode || null,
        accountHolderName: user.bankDetails?.accountHolderName || null
      },
      status: "pending",
      requestedAt: new Date()
    };
    user.withdrawals.push(withdrawalEntry);
    await user.save();

    // Update VIP Master Card document if exists
    if (targetCard) {
      targetCard.totalWithdrawn = (targetCard.totalWithdrawn || 0) + numericAmount;
      targetCard.lastWithdrawalDate = new Date();
      await targetCard.save();
    }

    // Real-time Ledger Tracking
    const ledgerTx = new WalletTransaction({
      userId: user._id,
      amount: numericAmount,
      type: 'debit',
      category: 'vip_master_card_withdrawal',
      description: `VIP Master Card Withdrawal (${cardNumber} - Tier ${cardTier})`,
      balanceAfter
    });
    await ledgerTx.save();

    // Send confirmation email (non-blocking)
    try {
      if (user.email) {
        await sendMail(
          user.email,
          "👑 VIP Master Card Withdrawal Request Submitted",
          `
          <h2>Hello ${user.name},</h2>
          <p>Your VIP Master Card withdrawal request of <b>₹${numericAmount.toFixed(2)}</b> has been received and is pending admin approval.</p>
          <p><strong>Card:</strong> ${cardNumber} (Tier ${cardTier})</p>
          <p><strong>Remaining Balance:</strong> ₹${balanceAfter.toFixed(2)} (Mandatory ₹50 reserve maintained)</p>
          <p>Status: <b>Pending Admin Approval</b></p>
          <p>Funds will be transferred to your registered bank account or UPI ID within 24-48 hours.</p>
          <br>
          <p>Warm regards,<br>Shree Mata Team</p>
          `
        );
      }
    } catch (emailErr) {
      console.warn("Could not send VIP withdrawal email:", emailErr.message);
    }

    res.json({
      success: true,
      message: "VIP Master Card withdrawal request submitted successfully",
      withdrawalAmount: numericAmount,
      remainingBalance: balanceAfter,
      mandatoryReserve: 50,
      cardNumber,
      cardTier,
      transactionId: ledgerTx._id,
      withdrawalId: user.withdrawals[user.withdrawals.length - 1]._id
    });

  } catch (err) {
    console.error("Error processing VIP Master Card withdrawal:", err);
    res.status(500).json({ success: false, error: "Server error processing VIP Master Card withdrawal." });
  }
};

router.post("/commission/vip-withdraw", authenticateToken, handleVipWithdrawRequest);
router.post("/vip-withdraw", authenticateToken, handleVipWithdrawRequest);
router.post("/vip-withdrawal", authenticateToken, handleVipWithdrawRequest);

/* -------------------------------------------
   POST /api/admin/simulate-commission-payout
   Simulate commission payout crediting to Admin wallet
--------------------------------------------*/
router.post("/simulate-commission-payout", authenticateToken, isAdmin, async (req, res) => {
  try {
    const profitInput = parseFloat(req.body.profitInput);
    if (isNaN(profitInput) || profitInput <= 0) {
      return res.status(400).json({ error: "Invalid profit input. Must be greater than 0." });
    }

    const User = require("../models/User");
    const adminUser = await User.findById(req.user.id || req.user.userId);
    if (!adminUser) {
      return res.status(404).json({ error: "Admin user not found" });
    }

    const settings = await CommissionSettings.getSettings();

    // Calculate total commission percentage
    const totalPercent = (settings.directCommissionPercent || 0) + 
                         (settings.referralCommissionPercent || 0) + 
                         (settings.adminCommissionPercent || 0) + 
                         (settings.treeCommissionPoolPercent || 0) + 
                         (settings.trustFundPercent || 0) + 
                         (settings.developmentFundPercent || 0);

    // Total payout amount
    const totalAmount = parseFloat((profitInput * (totalPercent / 100)).toFixed(4));
    
    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Calculated commission payout is 0 based on current settings." });
    }

    // Using the creditWallet helper
    const { creditWallet } = require("../services/commissionDistribution");
    const updatedAdmin = await creditWallet(
      adminUser._id,
      totalAmount,
      "test_simulation",
      `Simulated Payout for test profit ₹${profitInput.toFixed(2)} (Total percentage: ${totalPercent}%)`,
      null
    );

    res.json({
      message: "Simulation completed successfully",
      totalAmount,
      newBalance: updatedAdmin.wallet
    });
  } catch (err) {
    console.error("Error in simulate-commission-payout:", err);
    res.status(500).json({ error: "Server error during payout simulation" });
  }
});

module.exports = router;
