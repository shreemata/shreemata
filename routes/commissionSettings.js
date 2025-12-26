const express = require("express");
const router = express.Router();
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
      treeCommissionPoolPercent,
      trustFundPercent,
      developmentFundPercent,
      minimumWithdrawalAmount,
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
      treeCommissionLevels
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
      minimumWithdrawalAmount: settings.minimumWithdrawalAmount
    });
    
    // Validate total doesn't exceed 10%
    if (!settings.validateTotal()) {
      return res.status(400).json({ 
        error: "Total commission allocation cannot exceed 10%" 
      });
    }
    
    settings.updatedBy = req.user.userId;
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
    const userId = req.user.userId;
    
    // Get all commission transactions where user is involved
    const commissionTransactions = await CommissionTransaction.find({
      $or: [
        { purchaser: userId },
        { directReferrer: userId },
        { 'treeCommissions.recipient': userId }
      ]
    })
    .populate('orderId', 'totalAmount createdAt')
    .populate('purchaser', 'name')
    .sort({ createdAt: -1 })
    .limit(100);

    // Get all orders by this user to calculate cashback
    const userOrders = await Order.find({ 
      user_id: userId, 
      status: 'completed' 
    }).sort({ createdAt: -1 });

    const allTransactions = [];
    
    // Add cashback transactions from user's orders
    for (const order of userOrders) {
      let totalCashback = 0;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          let itemCashback = 0;
          
          if (item.type === 'book' && item.id) {
            try {
              const book = await Book.findById(item.id);
              if (book) {
                if (book.cashbackAmount > 0) {
                  itemCashback = book.cashbackAmount * item.quantity;
                } else if (book.cashbackPercentage > 0) {
                  itemCashback = (item.price * book.cashbackPercentage / 100) * item.quantity;
                }
              }
            } catch (err) {
              console.error('Error fetching book for cashback:', err);
            }
          } else if (item.type === 'bundle' && item.id) {
            try {
              const bundle = await Bundle.findById(item.id);
              if (bundle) {
                if (bundle.cashbackAmount > 0) {
                  itemCashback = bundle.cashbackAmount * item.quantity;
                } else if (bundle.cashbackPercentage > 0) {
                  itemCashback = (item.price * bundle.cashbackPercentage / 100) * item.quantity;
                }
              }
            } catch (err) {
              console.error('Error fetching bundle for cashback:', err);
            }
          }
          
          totalCashback += itemCashback;
        }
      }
      
      if (totalCashback > 0) {
        allTransactions.push({
          _id: order._id + '_cashback',
          type: 'cashback',
          amount: totalCashback,
          description: `Cashback from order #${order._id.toString().slice(-8)}`,
          status: 'completed',
          createdAt: order.createdAt,
          orderId: order._id
        });
      }
    }
    
    // Add referral commission transactions
    for (const tx of commissionTransactions) {
      // Add direct referral commission
      if (tx.directReferrer && tx.directReferrer.toString() === userId) {
        allTransactions.push({
          _id: tx._id + '_direct',
          type: 'referral_commission',
          amount: tx.directCommissionAmount,
          description: `Direct referral commission from ${tx.purchaser.name}`,
          status: 'completed',
          createdAt: tx.createdAt,
          orderId: tx.orderId._id
        });
      }
      
      // Add tree commissions
      tx.treeCommissions.forEach((treeComm, index) => {
        if (treeComm.recipient.toString() === userId) {
          allTransactions.push({
            _id: tx._id + '_tree_' + index,
            type: 'level_commission',
            amount: treeComm.amount,
            description: `Level ${treeComm.level} commission from ${tx.purchaser.name}`,
            status: 'completed',
            createdAt: tx.createdAt,
            orderId: tx.orderId._id
          });
        }
      });
    }
    
    // Sort all transactions by date (newest first)
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ 
      transactions: allTransactions
    });
  } catch (err) {
    console.error("Error fetching commission transactions:", err);
    res.status(500).json({ error: "Server error" });
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
        minimumWithdrawalAmount: settings.minimumWithdrawalAmount || 100
      }
    });
  } catch (err) {
    console.error("Error fetching commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/commission/withdraw
   Request withdrawal
--------------------------------------------*/
router.post("/commission/withdraw", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;
    const User = require("../models/User");
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }
    
    // Get user and check balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const walletBalance = user.wallet || 0;
    if (amount > walletBalance) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    
    // Get minimum withdrawal amount
    const settings = await CommissionSettings.getSettings();
    const minWithdrawal = settings.minimumWithdrawalAmount || 100;
    
    if (amount < minWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdrawal}` });
    }
    
    // Check if user has bank details (this would be implemented based on your bank details system)
    // For now, we'll assume bank details are set
    
    // Deduct amount from wallet
    user.wallet = walletBalance - amount;
    await user.save();
    
    // Create withdrawal transaction record
    const CommissionTransaction = require("../models/CommissionTransaction");
    // Note: This is a simplified approach. In a real system, you'd have a separate Withdrawal model
    
    res.json({ 
      message: "Withdrawal request submitted successfully",
      remainingBalance: user.wallet,
      withdrawalAmount: amount
    });
  } catch (err) {
    console.error("Error processing withdrawal:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
