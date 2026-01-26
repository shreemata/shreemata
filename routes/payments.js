// routes/payments.js
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { sendOrderConfirmationEmail, sendAdminNotification } = require("../utils/emailService");
const { distributeCommissions } = require("../services/commissionDistribution");
const { awardPoints } = require("../services/pointsService");
const Book = require("../models/Book");
const Bundle = require("../models/Bundle");

const router = express.Router();

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * Generate 7% multi-level distribution:
 * 3 → 1.5 → 0.75 → 0.375 → ...
 */
function getReferralPercentages(levels = 10) {
  const arr = [];
  let percent = 3; // Level 1 gets 3%
  for (let i = 0; i < levels; i++) {
    arr.push(percent);
    percent = percent / 2;
  }
  return arr;
}

/**
 * Apply referral commission
 * NOTE: This function should only be called AFTER atomic update has marked rewardApplied=true
 * The duplicate prevention is handled at the database level, not here
 */
async function applyReferralRewardForOrder(order) {
  if (!order) return { applied: false, reason: "no-order" };

  const buyer = await User.findById(order.user_id);
  if (!buyer) return { applied: false, reason: "buyer-not-found" };

  // Must have been referred
  if (!buyer.referredBy) {
    return { applied: false, reason: "no-referrer" };
  }

  const totalAmount = order.totalAmount;
  const ADMIN_PERCENT = 3; // Admin gets 3%
  const REFERRAL_LEVELS = getReferralPercentages(10); // Referral chain gets 6% (3+1.5+0.75+...)

  console.log("=== Referral Reward Calculation ===");
  console.log("Order Total Amount (after discount):", totalAmount);
  if (order.appliedOffer) {
    console.log("Offer Applied:", order.appliedOffer.offerTitle);
    console.log("Original Amount:", order.appliedOffer.originalAmount);
    console.log("Discounted Amount:", order.appliedOffer.discountedAmount);
    console.log("Savings:", order.appliedOffer.savings);
    console.log("✅ Referral rewards will be calculated on:", totalAmount, "(discounted amount)");
  } else {
    console.log("No offer applied. Referral rewards on full amount:", totalAmount);
  }

  let results = [];

  // ---------------------------------------
  // A: Admin Commission (3%)
  // ---------------------------------------
  const admin = await User.findOne({ role: "admin" });
  if (admin) {
    const adminAmount = (totalAmount * ADMIN_PERCENT) / 100;
    admin.wallet += adminAmount;
    await admin.save();

    results.push({
      type: "admin",
      percent: ADMIN_PERCENT,
      amount: adminAmount,
      userId: admin._id
    });
  }

  // ---------------------------------------
  // B: Referral Chain Commission (7%)
  // ---------------------------------------
  let parent = await User.findOne({ referralCode: buyer.referredBy });
  let level = 0;

  while (parent && level < REFERRAL_LEVELS.length) {
    const percent = REFERRAL_LEVELS[level];
    const amount = (totalAmount * percent) / 100;

    parent.wallet += amount;
    await parent.save();

    results.push({
      type: "referral",
      level: level + 1,
      percent,
      amount,
      userId: parent._id
    });

    // next in chain
    parent = await User.findOne({ referralCode: parent.referredBy });
    level++;
  }

  // Lock referral after FIRST purchase
  if (!buyer.firstPurchaseDone) {
    buyer.firstPurchaseDone = true;
    buyer.firstPurchaseDate = new Date();
    await buyer.save();
  }

  // Note: rewardApplied is already set to true by the atomic update
  // No need to save again here
  
  console.log(`✅ Rewards applied for order ${order._id}`);

  return { applied: true, chain: results };
}

// =====================================================
// 1️⃣ CREATE RAZORPAY ORDER OR PENDING CHECK ORDER
// =====================================================
router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const { amount, items, deliveryAddress, appliedOffer, courierCharge, totalWeight, deliveryMethod, paymentMethod } = req.body;

    console.log("Create order request:", { 
      amount, 
      itemsCount: items?.length, 
      hasAddress: !!deliveryAddress, 
      deliveryMethod: deliveryMethod,
      paymentMethod: paymentMethod || 'online',
      hasOffer: !!appliedOffer,
      courierCharge,
      totalWeight
    });
    console.log("Items type:", typeof items, "Is array:", Array.isArray(items));
    
    // Ensure items is an array
    if (!Array.isArray(items)) {
      console.error("Items is not an array:", items);
      return res.status(400).json({ error: "Items must be an array" });
    }

    // Check if order contains digital items
    const hasDigitalItems = items.some(item => item.isDigital === true);
    const isDigitalOnly = items.length > 0 && items.every(item => item.isDigital === true);
    
    console.log("Order type analysis:", { hasDigitalItems, isDigitalOnly });

    // 🚨 MANDATORY DELIVERY ADDRESS VALIDATION (Skip for digital-only orders and pickup orders)
    const isPickupOrder = deliveryMethod === 'pickup' || deliveryMethod === 'home';
    
    if (isPickupOrder) {
      console.log("✅ Pickup order detected, skipping delivery address validation");
    }
    
    if (!isDigitalOnly && !isPickupOrder && (!deliveryAddress || 
        !deliveryAddress.homeAddress1 || 
        !deliveryAddress.taluk || 
        !deliveryAddress.district || 
        !deliveryAddress.state || 
        !deliveryAddress.pincode || 
        !deliveryAddress.phone)) {
      
      console.log("❌ Delivery address validation failed:", deliveryAddress);
      
      return res.status(400).json({ 
        error: "Complete delivery address is required",
        message: "Please set your complete delivery address before proceeding with payment",
        missingFields: {
          homeAddress1: !deliveryAddress?.homeAddress1,
          taluk: !deliveryAddress?.taluk,
          district: !deliveryAddress?.district,
          state: !deliveryAddress?.state,
          pincode: !deliveryAddress?.pincode,
          phone: !deliveryAddress?.phone
        },
        requiresAddressSetup: true
      });
    }

    // Validate address fields are not empty strings (Skip for digital-only orders and pickup orders)
    if (!isDigitalOnly && !isPickupOrder && deliveryAddress) {
      const addressFields = ['homeAddress1', 'taluk', 'district', 'state', 'pincode', 'phone'];
      const emptyFields = addressFields.filter(field => 
        !deliveryAddress[field] || deliveryAddress[field].trim() === ''
      );

      if (emptyFields.length > 0) {
        console.log("❌ Empty address fields found:", emptyFields);
        
        return res.status(400).json({ 
          error: "All delivery address fields must be filled",
          message: "Please complete your delivery address information",
          emptyFields: emptyFields,
          requiresAddressSetup: true
        });
      }

      // Validate phone number format (basic validation)
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(deliveryAddress.phone)) {
        return res.status(400).json({ 
          error: "Invalid phone number",
          message: "Please enter a valid 10-digit Indian mobile number",
          requiresAddressSetup: true
        });
      }

      // Validate pincode format (basic validation)
      const pincodeRegex = /^\d{6}$/;
      if (!pincodeRegex.test(deliveryAddress.pincode)) {
        return res.status(400).json({ 
          error: "Invalid pincode",
          message: "Please enter a valid 6-digit pincode",
          requiresAddressSetup: true
        });
      }
    }

    if (!isDigitalOnly) {
      console.log("✅ Delivery address validation passed");
    } else {
      console.log("✅ Digital-only order, skipping delivery address validation");
    }

    // 📦 STOCK VALIDATION - Check if all items are available (Skip for digital items)
    console.log("📦 Validating stock availability for order items...");
    const Book = require("../models/Book");
    const Bundle = require("../models/Bundle");
    
    for (const item of items) {
      try {
        // Skip stock validation for digital items
        if (item.isDigital) {
          console.log(`📱 Skipping stock validation for digital item: ${item.title}`);
          
          // Validate digital content availability
          if (item.type === 'book') {
            const book = await Book.findById(item.id);
            if (!book) {
              return res.status(400).json({ 
                error: "Book not found",
                message: `The book "${item.title}" is no longer available`
              });
            }
            
            if (!book.hasDigitalContent()) {
              return res.status(400).json({ 
                error: "Digital content not available",
                message: `Digital reading is not available for "${book.title}"`
              });
            }
          }
          continue;
        }
        
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          if (!book) {
            return res.status(400).json({ 
              error: "Book not found",
              message: `The book "${item.title}" is no longer available`
            });
          }
          
          // Check stock availability
          if (book.trackStock) {
            if (book.stockStatus === 'out_of_stock' || book.stockQuantity < item.quantity) {
              return res.status(400).json({ 
                error: "Insufficient stock",
                message: `Sorry, "${book.title}" is ${book.stockStatus === 'out_of_stock' ? 'out of stock' : `only available in quantity of ${book.stockQuantity}`}. Please update your cart.`,
                outOfStockItem: {
                  id: book._id,
                  title: book.title,
                  availableQuantity: book.stockQuantity,
                  requestedQuantity: item.quantity
                }
              });
            }
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id).populate('books');
          if (!bundle) {
            return res.status(400).json({ 
              error: "Bundle not found",
              message: `The bundle "${item.title}" is no longer available`
            });
          }
          
          // Check stock for each book in the bundle
          if (bundle.books) {
            for (const bundleBook of bundle.books) {
              const book = await Book.findById(bundleBook._id || bundleBook.id);
              if (book && book.trackStock) {
                if (book.stockStatus === 'out_of_stock' || book.stockQuantity < item.quantity) {
                  return res.status(400).json({ 
                    error: "Insufficient stock in bundle",
                    message: `Sorry, the book "${book.title}" in bundle "${bundle.title}" is ${book.stockStatus === 'out_of_stock' ? 'out of stock' : `only available in quantity of ${book.stockQuantity}`}. Please update your cart.`,
                    outOfStockItem: {
                      bundleId: bundle._id,
                      bundleTitle: bundle.title,
                      bookId: book._id,
                      bookTitle: book.title,
                      availableQuantity: book.stockQuantity,
                      requestedQuantity: item.quantity
                    }
                  });
                }
              }
            }
          }
        }
      } catch (stockError) {
        console.error(`❌ Error validating stock for item ${item.id}:`, stockError);
        return res.status(500).json({ 
          error: "Stock validation failed",
          message: "Unable to verify stock availability. Please try again."
        });
      }
    }
    console.log("✅ Stock validation passed - all items available");

    // =====================================================
    // CHEQUE PAYMENT METHOD HANDLING
    // =====================================================
    if (paymentMethod === 'cheque') {
      console.log("📝 Creating pending order for cheque payment...");
      
      // Prepare delivery address with defaults (null for digital-only orders and pickup orders)
      const addressData = (!isDigitalOnly && !isPickupOrder && deliveryAddress) ? {
        street: deliveryAddress.homeAddress1 || deliveryAddress.street || "", // Legacy compatibility
        homeAddress1: deliveryAddress.homeAddress1 || "",
        homeAddress2: deliveryAddress.homeAddress2 || "",
        streetName: deliveryAddress.streetName || "",
        landmark: deliveryAddress.landmark || "",
        village: deliveryAddress.village || "",
        taluk: deliveryAddress.taluk || "",
        district: deliveryAddress.district || "",
        state: deliveryAddress.state || "",
        pincode: deliveryAddress.pincode || "",
        phone: deliveryAddress.phone || ""
      } : null;

      // Prepare items array properly
      const orderItems = items.map(item => ({
        id: item.id,
        title: item.title,
        author: item.author,
        price: Number(item.price),
        quantity: Number(item.quantity),
        coverImage: item.coverImage,
        type: item.type || 'book',
        isDigital: Boolean(item.isDigital),
        digitalPrice: item.isDigital ? Number(item.price) : null
      }));

      // Prepare offer data if applicable
      const offerData = appliedOffer ? {
        offerId: appliedOffer.offerId,
        offerTitle: appliedOffer.offerTitle,
        discountType: appliedOffer.discountType,
        discountValue: appliedOffer.discountValue,
        originalAmount: appliedOffer.originalAmount,
        discountedAmount: appliedOffer.discountedAmount,
        savings: appliedOffer.savings
      } : undefined;

      // Create pending order for cheque payment
      const pendingOrder = await Order.create({
        user_id: req.user.id,
        items: orderItems,
        totalAmount: amount,
        courierCharge: isDigitalOnly ? 0 : (courierCharge || 0),
        totalWeight: isDigitalOnly ? 0 : (totalWeight || 0),
        deliveryMethod: isDigitalOnly ? 'digital' : (deliveryMethod || 'home'),
        appliedOffer: offerData,
        deliveryAddress: addressData,
        status: "pending_payment_verification", // Special status for cheque payments
        paymentType: "cheque",
        paymentDetails: {
          type: "cheque",
          status: "awaiting_upload",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        rewardApplied: false
      });

      console.log("✅ Pending check order created:", pendingOrder._id);

      // Get user details for Google Form pre-filling
      const user = await User.findById(req.user.id);
      
      // Create Google Form URL with pre-filled data (using your working form)
      const googleFormUrl = `https://docs.google.com/forms/d/e/1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg/viewform?usp=pp_url` +
        `&entry.1788264298=${pendingOrder._id}` +
        `&entry.1894225499=${amount}` +
        
        `&entry.774046160=${encodeURIComponent(user.email || '')}` +
        `&entry.1406386079=${encodeURIComponent(user.name || '')}` +
        `&entry.632794616=${encodeURIComponent(user.phone || '')}` +
        `&entry.980862279=${encodeURIComponent('Bank Name')}` +
        `&entry.790413540=${new Date().toISOString().split('T')[0]}`;

      console.log('✅ Generated Google Form URL:', googleFormUrl);
      console.log('✅ User details:', { name: user.name, email: user.email, phone: user.phone });

      return res.json({ 
        success: true,
        orderType: 'check',
        order: pendingOrder,
        googleFormUrl: googleFormUrl,
        message: "Pending order created. Please complete the cheque payment verification form."
      });
    }

    // =====================================================
    // ONLINE PAYMENT (RAZORPAY) HANDLING
    // =====================================================

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "order_" + Date.now()
    };

    const razorpayOrder = await razorpay.orders.create(options);
    console.log("Razorpay order created:", razorpayOrder.id);

    // Prepare delivery address with defaults (null for digital-only orders and pickup orders)
    const addressData = (!isDigitalOnly && !isPickupOrder && deliveryAddress) ? {
      street: deliveryAddress.homeAddress1 || deliveryAddress.street || "", // Legacy compatibility
      homeAddress1: deliveryAddress.homeAddress1 || "",
      homeAddress2: deliveryAddress.homeAddress2 || "",
      streetName: deliveryAddress.streetName || "",
      landmark: deliveryAddress.landmark || "",
      village: deliveryAddress.village || "",
      taluk: deliveryAddress.taluk || "",
      district: deliveryAddress.district || "",
      state: deliveryAddress.state || "",
      pincode: deliveryAddress.pincode || "",
      phone: deliveryAddress.phone || ""
    } : null;

    // Prepare items array properly
    const orderItems = items.map(item => ({
      id: item.id,
      title: item.title,
      author: item.author,
      price: Number(item.price),
      quantity: Number(item.quantity),
      coverImage: item.coverImage,
      type: item.type || 'book',
      isDigital: Boolean(item.isDigital),
      digitalPrice: item.isDigital ? Number(item.price) : null
    }));

    console.log("Prepared order items:", orderItems);

    // Prepare offer data if applicable
    const offerData = appliedOffer ? {
      offerId: appliedOffer.offerId,
      offerTitle: appliedOffer.offerTitle,
      discountType: appliedOffer.discountType,
      discountValue: appliedOffer.discountValue,
      originalAmount: appliedOffer.originalAmount,
      discountedAmount: appliedOffer.discountedAmount,
      savings: appliedOffer.savings
    } : undefined;

    if (offerData) {
      console.log("Applied offer:", offerData);
    }

    const dbOrder = await Order.create({
      user_id: req.user.id,
      items: orderItems,
      totalAmount: amount,
      courierCharge: isDigitalOnly ? 0 : (courierCharge || 0), // No courier charge for digital-only
      totalWeight: isDigitalOnly ? 0 : (totalWeight || 0), // No weight for digital-only
      deliveryMethod: isDigitalOnly ? 'digital' : (deliveryMethod || 'home'), // Digital delivery method
      appliedOffer: offerData,
      deliveryAddress: addressData,
      status: "pending",
      rewardApplied: false,
      razorpay_order_id: razorpayOrder.id
    });

    console.log("DB order created:", dbOrder._id);

    res.json({ order: razorpayOrder, dbOrder });
  } catch (err) {
    console.error("Create order error:", err);
    console.error("Error details:", err.message);
    res.status(500).json({ error: "Unable to create Razorpay order", details: err.message });
  }
});

// =====================================================
// 2️⃣ VERIFY PAYMENT
// =====================================================
router.post("/verify", authenticateToken, async (req, res) => {
  console.log("\n🔍 ===== PAYMENT VERIFICATION STARTED =====");
  console.log("   Environment:", process.env.NODE_ENV || 'development');
  console.log("   Razorpay Order ID:", req.body.razorpay_order_id);
  console.log("   Razorpay Payment ID:", req.body.razorpay_payment_id);
  console.log("   Server Time:", new Date().toISOString());
  
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      totalAmount,
      items,
      deliveryAddress
    } = req.body;

    // Signature check
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // ATOMIC UPDATE: Find order and mark as processing in one operation
    // This prevents race condition between verify and webhook
    const order = await Order.findOneAndUpdate(
      { 
        razorpay_order_id,
        rewardApplied: false  // Only update if not already processed
      },
      {
        status: "completed",
        razorpay_payment_id,
        items,
        totalAmount,
        deliveryAddress: deliveryAddress || {},
        rewardApplied: true  // Mark immediately to prevent duplicate
      },
      { new: true }
    );

    if (!order) {
      // Either order not found OR already processed
      const existingOrder = await Order.findOne({ razorpay_order_id });
      if (existingOrder && existingOrder.rewardApplied) {
        console.log("⚠️ Verify: Rewards already applied, skipping");
        return res.json({ message: "Payment already processed", order: existingOrder });
      }
      return res.status(404).json({ error: "Order not found" });
    }

    console.log("✅ Verify: Order marked as processed, applying rewards...");
    console.log("✅ Order details:", {
      id: order._id,
      user_id: order.user_id,
      totalAmount: order.totalAmount,
      itemsCount: order.items?.length,
      status: order.status,
      rewardApplied: order.rewardApplied
    });

    // APPLY NEW COMMISSION DISTRIBUTION SYSTEM
    try {
      console.log("💰 Distributing commissions for order:", order._id);
      const commissionTransaction = await distributeCommissions(
        order._id,
        order.user_id,
        order.totalAmount
      );
      console.log("✅ Commission distribution completed:", commissionTransaction._id);
      
      // Mark user's first purchase as done after successful commission distribution
      const user = await User.findById(order.user_id);
      if (user && !user.firstPurchaseDone) {
        user.firstPurchaseDone = true;
        user.firstPurchaseDate = new Date();
        await user.save();
        console.log(`✅ Marked first purchase as done for user: ${user.email} at ${user.firstPurchaseDate}`);
      }
    } catch (commissionError) {
      console.error("❌ Commission distribution error:", commissionError);
      console.error("❌ Commission error details:", commissionError.stack);
      // Log error but don't fail the payment verification
      // Implement retry logic here if needed
    }

    // AWARD POINTS FOR PURCHASED ITEMS
    try {
      console.log("🎁 Awarding points for order:", order._id);
      for (const item of order.items) {
        let points = 0;
        
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          if (book && book.rewardPoints > 0) {
            points = book.rewardPoints * item.quantity;
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id);
          if (bundle && bundle.rewardPoints > 0) {
            points = bundle.rewardPoints * item.quantity;
          }
        }
        
        if (points > 0) {
          await awardPoints(
            order.user_id,
            points,
            item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
            item.id,
            order._id
          );
          console.log(`✅ Awarded ${points} points for ${item.title}`);
        }
      }
    } catch (pointsError) {
      console.error("❌ Points awarding error:", pointsError);
      // Log error but don't fail the payment verification
    }

    // AWARD CASHBACK FOR PURCHASED ITEMS
    try {
      console.log("💰 ===== CASHBACK PROCESSING STARTED =====");
      console.log("💰 Processing cashback for order:", order._id);
      console.log("💰 Order items:", order.items.map(item => ({ id: item.id, title: item.title, type: item.type, quantity: item.quantity })));
      console.log("💰 Database connection status:", require('mongoose').connection.readyState); // 1 = connected
      
      let totalCashback = 0;
      
      for (const item of order.items) {
        let itemCashback = 0;
        
        console.log(`💰 Processing cashback for item: ${item.title} (${item.type})`);
        
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          console.log(`💰 Book found:`, book ? {
            id: book._id,
            title: book.title,
            price: book.price,
            cashbackAmount: book.cashbackAmount,
            cashbackPercentage: book.cashbackPercentage
          } : 'NOT FOUND');
          
          if (book) {
            const bookCashback = book.getCashbackAmount();
            itemCashback = bookCashback * item.quantity;
            console.log(`💰 Book cashback calculation: ₹${bookCashback} × ${item.quantity} = ₹${itemCashback}`);
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id);
          console.log(`💰 Bundle found:`, bundle ? {
            id: bundle._id,
            title: bundle.title,
            bundlePrice: bundle.bundlePrice,
            cashbackAmount: bundle.cashbackAmount,
            cashbackPercentage: bundle.cashbackPercentage
          } : 'NOT FOUND');
          
          if (bundle) {
            const bundleCashback = bundle.getCashbackAmount();
            itemCashback = bundleCashback * item.quantity;
            console.log(`💰 Bundle cashback calculation: ₹${bundleCashback} × ${item.quantity} = ₹${itemCashback}`);
          }
        }
        
        if (itemCashback > 0) {
          totalCashback += itemCashback;
          console.log("Cashback for " + item.title + ": " + itemCashback.toFixed(2));
        } else {
          console.log("No cashback for " + item.title);
        }
      }
      
      console.log("Total cashback calculated: " + totalCashback.toFixed(2));
      
      if (totalCashback > 0) {
        // Add cashback to user's wallet
        console.log("Attempting to add cashback to user wallet...");
        const user = await User.findById(order.user_id);
        console.log("User lookup result:", user ? {
          id: user._id,
          name: user.name,
          email: user.email,
          currentWallet: user.wallet || 0
        } : 'USER NOT FOUND');
        
        if (user) {
          const previousBalance = user.wallet || 0;
          user.wallet = previousBalance + totalCashback;
          
          console.log("Saving user with new wallet balance...");
          const saveResult = await user.save();
          console.log("User save result:", saveResult ? 'SUCCESS' : 'FAILED');
          
          console.log("Added " + totalCashback.toFixed(2) + " cashback to user wallet");
          console.log("User wallet balance: " + previousBalance.toFixed(2) + " -> " + user.wallet.toFixed(2));
          
          // Verify the save by re-fetching the user
          const verifyUser = await User.findById(order.user_id);
          console.log("Verification - User wallet after save:", verifyUser ? verifyUser.wallet : 'USER NOT FOUND');
          
        } else {
          console.log("User not found for cashback: " + order.user_id);
        }
      } else {
        console.log("No cashback to add (total: " + totalCashback.toFixed(2) + ")");
      }
      
      console.log("===== CASHBACK PROCESSING COMPLETED =====");
    } catch (cashbackError) {
      console.error("===== CASHBACK PROCESSING ERROR =====");
      console.error("Cashback processing error:", cashbackError);
      console.error("Error stack:", cashbackError.stack);
      // Log error but don't fail the payment verification
    }

    // OLD REFERRAL SYSTEM DISABLED - Using new commission distribution system only
    // The old system was causing double payments by adding to wallet twice
    // const result = await applyReferralRewardForOrder(order);
    // console.log("Referral Result:", result);

    // SEND EMAIL NOTIFICATIONS - ALWAYS EXECUTE
    console.log("\n🔍 ===== EMAIL NOTIFICATION PROCESS STARTED =====");
    
    // Fetch user
    console.log("🔍 Fetching user for order:", order.user_id);
    const user = await User.findById(order.user_id);
    
    if (!user) {
      console.error("❌ CRITICAL: User not found for order:", order.user_id);
      console.log("🔍 ===== EMAIL NOTIFICATION PROCESS ENDED (NO USER) =====\n");
    } else {
      console.log("✅ User found:", user.name);
      console.log("   User email:", user.email || "❌ NO EMAIL SET");
      
      if (!user.email) {
        console.error("❌ CRITICAL: User has no email address!");
        console.log("🔍 ===== EMAIL NOTIFICATION PROCESS ENDED (NO EMAIL) =====\n");
      } else {
        // Send customer confirmation email
        console.log("\n📧 Attempting to send order confirmation email...");
        console.log("   To:", user.email);
        console.log("   Order ID:", order._id);
        
        try {
          const customerEmail = await sendOrderConfirmationEmail(order, user);
          if (customerEmail.success) {
            console.log("✅ SUCCESS: Customer email sent!");
            console.log("   Message ID:", customerEmail.messageId);
          } else {
            console.error("❌ FAILED: Customer email not sent");
            console.error("   Error:", customerEmail.error);
          }
        } catch (emailError) {
          console.error("❌ EXCEPTION: Error sending customer email");
          console.error("   Error:", emailError.message);
          console.error("   Stack:", emailError.stack);
        }

        // Send admin notification email
        console.log("\n📧 Attempting to send admin notification...");
        console.log("   To:", process.env.MAIL_USER);
        
        try {
          const adminEmail = await sendAdminNotification(order, user);
          if (adminEmail.success) {
            console.log("✅ SUCCESS: Admin notification sent!");
            console.log("   Message ID:", adminEmail.messageId);
          } else {
            console.error("❌ FAILED: Admin notification not sent");
            console.error("   Error:", adminEmail.error);
          }
        } catch (emailError) {
          console.error("❌ EXCEPTION: Error sending admin notification");
          console.error("   Error:", emailError.message);
          console.error("   Stack:", emailError.stack);
        }
        
        console.log("\n🔍 ===== EMAIL NOTIFICATION PROCESS COMPLETED =====\n");
      }
    }

    res.json({ message: "Payment verified", order });

  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ error: "Error verifying payment" });
  }
});

// =====================================================
// 2.5️⃣ CANCEL PAYMENT
// =====================================================
router.post("/cancel", authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    
    if (!razorpay_order_id) {
      return res.status(400).json({ error: "Razorpay order ID is required" });
    }

    // Mark order as cancelled
    const order = await Order.findOneAndUpdate(
      { 
        razorpay_order_id,
        user_id: req.user.id, // Ensure user can only cancel their own orders
        status: "pending" // Only allow cancelling pending orders
      },
      { 
        status: "cancelled",
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ 
        error: "Order not found or cannot be cancelled" 
      });
    }

    console.log(`✅ Order ${order._id} cancelled by user ${req.user.id}`);
    
    res.json({ 
      message: "Order cancelled successfully", 
      orderId: order._id 
    });

  } catch (err) {
    console.error("Cancel payment error:", err);
    res.status(500).json({ error: "Error cancelling payment" });
  }
});

// =====================================================
// 2.6️⃣ CLEANUP ABANDONED ORDERS
// =====================================================
router.post("/cleanup-abandoned", async (req, res) => {
  try {
    // Find orders that are pending for more than 1 hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const abandonedOrders = await Order.updateMany(
      {
        status: "pending",
        createdAt: { $lt: oneHourAgo },
        rewardApplied: false
      },
      {
        status: "abandoned",
        abandonedAt: new Date()
      }
    );

    console.log(`✅ Cleaned up ${abandonedOrders.modifiedCount} abandoned orders`);
    
    res.json({ 
      message: "Cleanup completed", 
      cleanedCount: abandonedOrders.modifiedCount 
    });

  } catch (err) {
    console.error("Cleanup error:", err);
    res.status(500).json({ error: "Error during cleanup" });
  }
});

// =====================================================
// 3️⃣ WEBHOOK (backup referral application)
// =====================================================
router.post("/webhook", async (req, res) => {
  try {
    const rawBody = req.body;
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const data = JSON.parse(rawBody);
    const event = data.event;

    if (!data.payload?.payment?.entity) {
      return res.send("OK");
    }

    const payment = data.payload.payment.entity;

    if (event === "payment.captured") {
      // ATOMIC UPDATE: Only process if not already done
      const order = await Order.findOneAndUpdate(
        { 
          razorpay_order_id: payment.order_id,
          rewardApplied: false  // Only update if not already processed
        },
        {
          status: "completed",
          razorpay_payment_id: payment.id,
          rewardApplied: true  // Mark immediately
        },
        { new: true }
      );

      if (order) {
        console.log("✅ Webhook: Order marked as processed, applying rewards...");
        
        // APPLY NEW COMMISSION DISTRIBUTION SYSTEM
        try {
          console.log("💰 Webhook: Distributing commissions for order:", order._id);
          const commissionTransaction = await distributeCommissions(
            order._id,
            order.user_id,
            order.totalAmount
          );
          console.log("✅ Webhook: Commission distribution completed:", commissionTransaction._id);
          
          // Mark user's first purchase as done after successful commission distribution
          const user = await User.findById(order.user_id);
          if (user && !user.firstPurchaseDone) {
            user.firstPurchaseDone = true;
            user.firstPurchaseDate = new Date();
            await user.save();
            console.log(`✅ Webhook: Marked first purchase as done for user: ${user.email} at ${user.firstPurchaseDate}`);
          }
        } catch (commissionError) {
          console.error("❌ Webhook: Commission distribution error:", commissionError);
          // Implement retry logic here if needed
        }

        // AWARD POINTS FOR PURCHASED ITEMS
        try {
          console.log("🎁 Webhook: Awarding points for order:", order._id);
          for (const item of order.items) {
            let points = 0;
            
            if (item.type === 'book') {
              const book = await Book.findById(item.id);
              if (book && book.rewardPoints > 0) {
                points = book.rewardPoints * item.quantity;
              }
            } else if (item.type === 'bundle') {
              const bundle = await Bundle.findById(item.id);
              if (bundle && bundle.rewardPoints > 0) {
                points = bundle.rewardPoints * item.quantity;
              }
            }
            
            if (points > 0) {
              await awardPoints(
                order.user_id,
                points,
                item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
                item.id,
                order._id
              );
              console.log(`✅ Webhook: Awarded ${points} points for ${item.title}`);
            }
          }
        } catch (pointsError) {
          console.error("❌ Webhook: Points awarding error:", pointsError);
        }

        // AWARD CASHBACK FOR PURCHASED ITEMS
        try {
          console.log("💰 Webhook: Processing cashback for order:", order._id);
          console.log("💰 Webhook: Order items:", order.items.map(item => ({ id: item.id, title: item.title, type: item.type, quantity: item.quantity })));
          let totalCashback = 0;
          
          for (const item of order.items) {
            let itemCashback = 0;
            
            console.log(`💰 Webhook: Processing cashback for item: ${item.title} (${item.type})`);
            
            if (item.type === 'book') {
              const book = await Book.findById(item.id);
              console.log(`💰 Webhook: Book found:`, book ? {
                id: book._id,
                title: book.title,
                price: book.price,
                cashbackAmount: book.cashbackAmount,
                cashbackPercentage: book.cashbackPercentage
              } : 'NOT FOUND');
              
              if (book) {
                const bookCashback = book.getCashbackAmount();
                itemCashback = bookCashback * item.quantity;
                console.log(`💰 Webhook: Book cashback calculation: ₹${bookCashback} × ${item.quantity} = ₹${itemCashback}`);
              }
            } else if (item.type === 'bundle') {
              const bundle = await Bundle.findById(item.id);
              console.log(`💰 Webhook: Bundle found:`, bundle ? {
                id: bundle._id,
                title: bundle.title,
                bundlePrice: bundle.bundlePrice,
                cashbackAmount: bundle.cashbackAmount,
                cashbackPercentage: bundle.cashbackPercentage
              } : 'NOT FOUND');
              
              if (bundle) {
                const bundleCashback = bundle.getCashbackAmount();
                itemCashback = bundleCashback * item.quantity;
                console.log(`💰 Webhook: Bundle cashback calculation: ₹${bundleCashback} × ${item.quantity} = ₹${itemCashback}`);
              }
            }
            
            if (itemCashback > 0) {
              totalCashback += itemCashback;
              console.log(`💰 Webhook: Cashback for ${item.title}: ₹${itemCashback.toFixed(2)}`);
            } else {
              console.log(`💰 Webhook: No cashback for ${item.title}`);
            }
          }
          
          console.log(`💰 Webhook: Total cashback calculated: ₹${totalCashback.toFixed(2)}`);
          
          if (totalCashback > 0) {
            // Add cashback to user's wallet
            const user = await User.findById(order.user_id);
            if (user) {
              const previousBalance = user.wallet || 0;
              user.wallet = previousBalance + totalCashback;
              await user.save();
              
              console.log("Webhook: Added " + totalCashback.toFixed(2) + " cashback to user wallet");
              console.log("Webhook: User wallet balance: " + previousBalance.toFixed(2) + " -> " + user.wallet.toFixed(2));
            } else {
              console.log(`❌ Webhook: User not found for cashback: ${order.user_id}`);
            }
          } else {
            console.log("Webhook: No cashback to add (total: " + totalCashback.toFixed(2) + ")");
          }
        } catch (cashbackError) {
          console.error("❌ Webhook: Cashback processing error:", cashbackError);
        }
        
        // OLD REFERRAL SYSTEM DISABLED - Using new commission distribution system only
        // The old system was causing double payments by adding to wallet twice
        // await applyReferralRewardForOrder(order);
        
        // Send email notification from webhook as backup
        console.log("🔍 Webhook: Sending email notification...");
        try {
          const user = await User.findById(order.user_id);
          if (user && user.email) {
            await sendOrderConfirmationEmail(order, user);
            await sendAdminNotification(order, user);
            console.log("✅ Webhook: Email notifications sent");
          }
        } catch (emailError) {
          console.error("❌ Webhook: Email error:", emailError.message);
        }
      } else {
        console.log("⚠️ Webhook: Order already processed or not found, skipping");
      }
    }

    if (event === "payment.failed") {
      await Order.findOneAndUpdate(
        { razorpay_order_id: payment.order_id },
        { status: "failed" }
      );
      console.log(`✅ Webhook: Order marked as failed for payment ${payment.id}`);
    }

    res.send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Webhook error");
  }
});

// =====================================================
// TEST CASHBACK ENDPOINT (for debugging production)
// =====================================================
router.post("/test-cashback", authenticateToken, async (req, res) => {
  try {
    console.log("===== TESTING CASHBACK FUNCTIONALITY =====");
    console.log("Environment:", process.env.NODE_ENV || 'development');
    console.log("Database connection:", require('mongoose').connection.readyState);
    console.log("User ID:", req.user.id);
    
    const { bookId, amount } = req.body;
    
    // Test book lookup
    const book = await Book.findById(bookId);
    console.log("Book found:", book ? {
      id: book._id,
      title: book.title,
      price: book.price,
      cashbackAmount: book.cashbackAmount,
      cashbackPercentage: book.cashbackPercentage
    } : 'NOT FOUND');
    
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }
    
    // Test cashback calculation
    const cashbackAmount = book.getCashbackAmount();
    console.log("Cashback calculation:", cashbackAmount);
    
    if (cashbackAmount <= 0) {
      return res.json({ 
        message: "No cashback configured for this book",
        book: { title: book.title, cashbackAmount: book.cashbackAmount, cashbackPercentage: book.cashbackPercentage }
      });
    }
    
    // Test user lookup and wallet update
    const user = await User.findById(req.user.id);
    console.log("User found:", user ? {
      id: user._id,
      name: user.name,
      currentWallet: user.wallet || 0
    } : 'NOT FOUND');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const previousBalance = user.wallet || 0;
    user.wallet = previousBalance + cashbackAmount;
    await user.save();
    
    console.log("Wallet updated:", previousBalance, "->", user.wallet);
    
    // Verify the update
    const verifyUser = await User.findById(req.user.id);
    console.log("Verification wallet:", verifyUser ? verifyUser.wallet : 'USER NOT FOUND');
    
    res.json({
      success: true,
      message: "Cashback test completed",
      cashbackAmount: cashbackAmount,
      previousBalance: previousBalance,
      newBalance: user.wallet,
      verified: verifyUser ? verifyUser.wallet : null
    });
    
  } catch (error) {
    console.error("Test cashback error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// 🔄 CHEQUE PAYMENT WEBHOOK (Google Form Submission)
// =====================================================
router.post("/webhook/cheque-payment-submitted", async (req, res) => {
  try {
    console.log("📝 Cheque payment form submitted - RAW BODY:", JSON.stringify(req.body, null, 2));
    
    const { 
      orderId, 
      chequeNumber, 
      bankName, 
      chequeDate, 
      utrNumber, 
      formResponseId,
      driveFileIds,
      chequeImageUrl,
      chequeImageDriveId,
      allResponses,  // Add this field
      paymentType    // Add this field to detect cheque vs transfer
    } = req.body;

    console.log("🔍 Extracted fields:");
    console.log("  orderId:", orderId);
    console.log("  paymentType:", paymentType);
    console.log("  checkImageUrl:", checkImageUrl);
    console.log("  checkImageDriveId:", checkImageDriveId);
    console.log("  driveFileIds:", driveFileIds);
    console.log("  formResponseId:", formResponseId);
    console.log("  allResponses:", allResponses ? 'Present' : 'Missing');

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log(`❌ Invalid ObjectId format: "${orderId}"`);
      return res.status(400).json({ 
        error: "Invalid Order ID format", 
        message: "Order ID must be a valid MongoDB ObjectId",
        receivedOrderId: orderId,
        expectedFormat: "24-character hex string (e.g., 507f1f77bcf86cd799439011)"
      });
    }

    // Update order with cheque payment details including image URLs
    const updateData = {
      'paymentDetails.status': 'pending_verification',
      'paymentDetails.chequeNumber': chequeNumber,
      'paymentDetails.bankName': bankName,
      'paymentDetails.chequeDate': chequeDate ? new Date(chequeDate) : null,
      'paymentDetails.utrNumber': utrNumber,
      'paymentDetails.googleFormSubmissionId': formResponseId,
      'paymentDetails.updatedAt': new Date()
    };

    // Update payment type if provided (for unified form handling)
    if (paymentType && (paymentType === 'check' || paymentType === 'cheque' || paymentType === 'transfer')) {
      updateData['paymentType'] = paymentType;
      updateData['paymentDetails.type'] = paymentType;
      console.log('💾 ✅ Updated payment type to:', paymentType);
    }

    // Add image URLs if provided - with detailed logging
    if (chequeImageUrl) {
      updateData['paymentDetails.chequeImageUrl'] = chequeImageUrl;
      console.log('💾 ✅ Saving chequeImageUrl:', chequeImageUrl);
    } else {
      console.log('💾 ❌ No chequeImageUrl provided');
    }
    
    if (chequeImageDriveId) {
      updateData['paymentDetails.chequeImageDriveId'] = chequeImageDriveId;
      console.log('💾 ✅ Saving chequeImageDriveId:', chequeImageDriveId);
    } else {
      console.log('💾 ❌ No chequeImageDriveId provided');
    }
    
    if (driveFileIds && Array.isArray(driveFileIds) && driveFileIds.length > 0) {
      updateData['paymentDetails.driveFileIds'] = driveFileIds;
      console.log('💾 ✅ Saving driveFileIds:', driveFileIds);
    } else {
      console.log('💾 ❌ No driveFileIds provided or empty array');
    }

    // Add form responses data
    if (allResponses && typeof allResponses === 'object') {
      updateData['allResponses'] = allResponses;
      console.log('💾 ✅ Saving allResponses:', Object.keys(allResponses).length, 'fields');
    } else {
      console.log('💾 ❌ No allResponses provided');
    }

    console.log('💾 Complete updateData being sent to MongoDB:', JSON.stringify(updateData, null, 2));

    const order = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    console.log('✅ Order updated successfully');
    console.log('🔍 Final paymentDetails in database:', JSON.stringify(order.paymentDetails, null, 2));
    console.log('🔍 Final allResponses in database:', order.allResponses ? 'Present' : 'Missing');

    // Send notification to admin (optional)
    try {
      const user = await User.findById(order.user_id);
      if (user) {
        console.log(`📧 Cheque payment submitted by ${user.name} for order ${orderId}`);
        // You can send admin notification email here
      }
    } catch (emailError) {
      console.error("Error sending admin notification:", emailError);
    }

    res.json({ 
      success: true, 
      message: "Cheque payment details received",
      orderId: orderId,
      status: "pending_verification"
    });

  } catch (error) {
    console.error("Cheque payment webhook error:", error);
    res.status(500).json({ error: "Error processing cheque payment submission" });
  }
});

// =====================================================
// 🔄 BACKWARD COMPATIBILITY: OLD CHECK PAYMENT WEBHOOK
// =====================================================
router.post("/webhook/check-payment-submitted", async (req, res) => {
  // Redirect to the new cheque payment webhook for backward compatibility
  console.log("📝 Legacy check payment webhook called - redirecting to cheque webhook");
  
  // Forward the request to the cheque payment handler
  try {
    // Re-use the same logic as the cheque payment webhook
    const { 
      orderId, 
      chequeNumber, 
      bankName, 
      chequeDate, 
      utrNumber, 
      formResponseId,
      driveFileIds,
      chequeImageUrl,
      chequeImageDriveId,
      allResponses,
      paymentType
    } = req.body;

    // Update order with cheque payment details including image URLs
    const updateData = {
      'paymentDetails.status': 'pending_verification',
      'paymentDetails.chequeNumber': chequeNumber,
      'paymentDetails.bankName': bankName,
      'paymentDetails.chequeDate': chequeDate ? new Date(chequeDate) : null,
      'paymentDetails.utrNumber': utrNumber,
      'paymentDetails.googleFormSubmissionId': formResponseId,
      'paymentDetails.updatedAt': new Date()
    };

    // Update payment type if provided (for unified form handling)
    if (paymentType && (paymentType === 'check' || paymentType === 'cheque' || paymentType === 'transfer')) {
      updateData['paymentType'] = paymentType;
      updateData['paymentDetails.type'] = paymentType;
    }

    // Add image URLs if provided
    if (chequeImageUrl) {
      updateData['paymentDetails.chequeImageUrl'] = chequeImageUrl;
    }
    
    if (chequeImageDriveId) {
      updateData['paymentDetails.chequeImageDriveId'] = chequeImageDriveId;
    }
    
    if (driveFileIds && Array.isArray(driveFileIds) && driveFileIds.length > 0) {
      updateData['paymentDetails.driveFileIds'] = driveFileIds;
    }

    const order = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ 
      success: true, 
      message: "Check payment details received (legacy endpoint)",
      orderId: orderId,
      status: "pending_verification"
    });

  } catch (error) {
    console.error("Legacy check payment webhook error:", error);
    res.status(500).json({ error: "Error processing check payment submission" });
  }
});

// =====================================================
// 🔄 BANK TRANSFER WEBHOOK (Google Form Submission)
// =====================================================
router.post("/webhook/bank-transfer-submitted", async (req, res) => {
  try {
    console.log("🏦 Bank transfer form submitted - RAW BODY:", JSON.stringify(req.body, null, 2));
    
    const { 
      orderId, 
      transferNumber, 
      bankName, 
      transferDate, 
      utrNumber, 
      accountNumber,
      ifscCode,
      formResponseId,
      driveFileIds,
      transferReceiptUrl,
      transferReceiptDriveId,
      allResponses,
      paymentType = 'transfer'  // Default to transfer
    } = req.body;

    console.log("🔍 Extracted bank transfer fields:");
    console.log("  orderId:", orderId);
    console.log("  transferReceiptUrl:", transferReceiptUrl);
    console.log("  transferReceiptDriveId:", transferReceiptDriveId);
    console.log("  driveFileIds:", driveFileIds);
    console.log("  utrNumber:", utrNumber);
    console.log("  formResponseId:", formResponseId);
    console.log("  allResponses:", allResponses ? 'Present' : 'Missing');

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log(`❌ Invalid ObjectId format: "${orderId}"`);
      return res.status(400).json({ 
        error: "Invalid Order ID format", 
        message: "Order ID must be a valid MongoDB ObjectId",
        receivedOrderId: orderId,
        expectedFormat: "24-character hex string (e.g., 507f1f77bcf86cd799439011)"
      });
    }

    // Update order with bank transfer details
    const updateData = {
      'paymentDetails.status': 'pending_verification',
      'paymentDetails.transferNumber': transferNumber,
      'paymentDetails.bankName': bankName,
      'paymentDetails.transferDate': transferDate ? new Date(transferDate) : null,
      'paymentDetails.utrNumber': utrNumber,
      'paymentDetails.accountNumber': accountNumber,
      'paymentDetails.ifscCode': ifscCode,
      'paymentDetails.googleFormSubmissionId': formResponseId,
      'paymentDetails.updatedAt': new Date(),
      'paymentType': 'transfer'  // Ensure payment type is set
    };

    // Add receipt URLs if provided - with detailed logging
    if (transferReceiptUrl) {
      updateData['paymentDetails.transferReceiptUrl'] = transferReceiptUrl;
      console.log('💾 ✅ Saving transferReceiptUrl:', transferReceiptUrl);
    } else {
      console.log('💾 ❌ No transferReceiptUrl provided');
    }
    
    if (transferReceiptDriveId) {
      updateData['paymentDetails.transferReceiptDriveId'] = transferReceiptDriveId;
      console.log('💾 ✅ Saving transferReceiptDriveId:', transferReceiptDriveId);
    } else {
      console.log('💾 ❌ No transferReceiptDriveId provided');
    }
    
    if (driveFileIds && Array.isArray(driveFileIds) && driveFileIds.length > 0) {
      updateData['paymentDetails.driveFileIds'] = driveFileIds;
      console.log('💾 ✅ Saving driveFileIds:', driveFileIds);
    } else {
      console.log('💾 ❌ No driveFileIds provided or empty array');
    }

    // Add form responses data
    if (allResponses && typeof allResponses === 'object') {
      updateData['allResponses'] = allResponses;
      console.log('💾 ✅ Saving allResponses:', Object.keys(allResponses).length, 'fields');
    } else {
      console.log('💾 ❌ No allResponses provided');
    }

    console.log('💾 Complete bank transfer updateData being sent to MongoDB:', JSON.stringify(updateData, null, 2));

    const order = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    console.log('✅ Bank transfer order updated successfully');
    console.log('🔍 Final paymentDetails in database:', JSON.stringify(order.paymentDetails, null, 2));
    console.log('🔍 Final allResponses in database:', order.allResponses ? 'Present' : 'Missing');

    // Send notification to admin (optional)
    try {
      const user = await User.findById(order.user_id);
      if (user) {
        console.log(`📧 Bank transfer submitted by ${user.name} for order ${orderId}`);
        // You can send admin notification email here
      }
    } catch (emailError) {
      console.error("Error sending admin notification:", emailError);
    }

    res.json({ 
      success: true, 
      message: "Bank transfer details received",
      orderId: orderId,
      status: "pending_verification"
    });

  } catch (error) {
    console.error("Bank transfer webhook error:", error);
    res.status(500).json({ error: "Error processing bank transfer submission" });
  }
});

// =====================================================
// 🔍 ADMIN: CHECK UTR DUPLICATE
// =====================================================
router.post("/admin/check-utr-duplicate", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { utrNumber, currentOrderId } = req.body;
    
    if (!utrNumber) {
      return res.status(400).json({ error: 'UTR number is required' });
    }
    
    console.log(`🔍 Checking UTR duplicate: ${utrNumber} (excluding order: ${currentOrderId})`);
    
    // Search for orders with the same UTR number (excluding current order)
    const duplicateOrder = await Order.findOne({
      'paymentDetails.utrNumber': utrNumber,
      _id: { $ne: currentOrderId }, // Exclude current order
      status: { $in: ['completed', 'pending_payment_verification'] } // Only check processed orders
    }).populate('user_id', 'name email').sort({ createdAt: -1 });
    
    if (duplicateOrder) {
      console.log(`⚠️ Duplicate UTR found: Order ${duplicateOrder._id} by ${duplicateOrder.user_id?.name}`);
      
      return res.json({
        isDuplicate: true,
        existingOrder: {
          _id: duplicateOrder._id,
          user: {
            name: duplicateOrder.user_id?.name,
            email: duplicateOrder.user_id?.email
          },
          createdAt: duplicateOrder.createdAt,
          totalAmount: duplicateOrder.totalAmount,
          status: duplicateOrder.status
        },
        message: `UTR number ${utrNumber} was previously used by ${duplicateOrder.user_id?.name || 'Unknown User'}`
      });
    }
    
    console.log(`✅ UTR number ${utrNumber} is unique`);
    
    res.json({
      isDuplicate: false,
      message: 'UTR number is unique'
    });
    
  } catch (err) {
    console.error('UTR duplicate check error:', err);
    res.status(500).json({ error: 'Error checking UTR duplicate', details: err.message });
  }
});

// =====================================================
// 🔄 ADMIN: APPROVE CHEQUE PAYMENT
// =====================================================
router.post("/admin/approve-cheque-payment/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { approvalNotes } = req.body;

    // Verify admin access
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    console.log(`🔍 Admin ${adminUser.email} approving cheque payment for order: ${orderId}`);

    // Find and update the order (support both check/cheque and transfer payments)
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId,
        $or: [
          { paymentType: 'check' },
          { paymentType: 'cheque' },
          { paymentType: 'transfer' }
        ],
        'paymentDetails.status': 'pending_verification'
      },
      {
        status: 'completed',
        'paymentDetails.status': 'verified',
        'paymentDetails.adminNotes': approvalNotes || '',
        'paymentDetails.updatedAt': new Date(),
        rewardApplied: true // Mark to trigger automated processes
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ 
        error: "Order not found or not eligible for approval" 
      });
    }

    console.log(`✅ ${order.paymentType === 'transfer' ? 'Bank transfer' : 'Cheque payment'} approved for order: ${orderId}`);

    // Trigger all automated processes (same as online payment)
    await processApprovedChequeOrder(order, adminUser);

    res.json({ 
      success: true, 
      message: `${order.paymentType === 'transfer' ? 'Bank transfer' : 'Cheque payment'} approved successfully`,
      orderId: orderId,
      order: order
    });

  } catch (error) {
    console.error("Cheque payment approval error:", error);
    res.status(500).json({ error: "Error approving cheque payment" });
  }
});

// =====================================================
// 🔄 ADMIN: REJECT CHEQUE PAYMENT
// =====================================================
router.post("/admin/reject-cheque-payment/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rejectionReason } = req.body;

    // Verify admin access
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    console.log(`🔍 Admin ${adminUser.email} rejecting cheque payment for order: ${orderId}`);

    // Find and update the order (support both check/cheque and transfer payments)
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId,
        $or: [
          { paymentType: 'check' },
          { paymentType: 'cheque' },
          { paymentType: 'transfer' }
        ],
        'paymentDetails.status': 'pending_verification'
      },
      {
        status: 'cancelled',
        'paymentDetails.status': 'rejected',
        'paymentDetails.adminNotes': rejectionReason || '',
        'paymentDetails.updatedAt': new Date()
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ 
        error: "Order not found or not eligible for rejection" 
      });
    }

    console.log(`❌ ${order.paymentType === 'transfer' ? 'Bank transfer' : 'Cheque payment'} rejected for order: ${orderId}`);

    // Send rejection notification to user
    try {
      const user = await User.findById(order.user_id);
      if (user && user.email) {
        // You can create a rejection email function here
        console.log(`📧 Sending rejection notification to ${user.email}`);
      }
    } catch (emailError) {
      console.error("Error sending rejection notification:", emailError);
    }

    res.json({ 
      success: true, 
      message: `${order.paymentType === 'transfer' ? 'Bank transfer' : 'Cheque payment'} rejected`,
      orderId: orderId,
      order: order
    });

  } catch (error) {
    console.error("Cheque payment rejection error:", error);
    res.status(500).json({ error: "Error rejecting cheque payment" });
  }
});

// =====================================================
// 🔄 BACKWARD COMPATIBILITY: OLD ADMIN ENDPOINTS
// =====================================================

// Legacy approve endpoint
router.post("/admin/approve-check-payment/:orderId", authenticateToken, async (req, res) => {
  console.log("📝 Legacy approve-check-payment endpoint called - redirecting to cheque endpoint");
  
  try {
    const { orderId } = req.params;
    const adminUser = req.user;

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Find and update the order (support both check/cheque and transfer payments)
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId,
        $or: [
          { paymentType: 'check' },
          { paymentType: 'cheque' },
          { paymentType: 'transfer' }
        ],
        'paymentDetails.status': 'pending_verification'
      },
      {
        status: 'completed',
        'paymentDetails.status': 'verified',
        'paymentDetails.updatedAt': new Date(),
        rewardApplied: true
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found or already processed" });
    }

    // Trigger all automated processes
    await processApprovedChequeOrder(order, adminUser);

    res.json({ 
      success: true, 
      message: `${order.paymentType === 'transfer' ? 'Bank transfer' : 'Check payment'} approved successfully (legacy endpoint)`,
      orderId: orderId,
      order: order
    });

  } catch (error) {
    console.error("Legacy check payment approval error:", error);
    res.status(500).json({ error: "Error approving check payment" });
  }
});

// Legacy reject endpoint
router.post("/admin/reject-check-payment/:orderId", authenticateToken, async (req, res) => {
  console.log("📝 Legacy reject-check-payment endpoint called - redirecting to cheque endpoint");
  
  try {
    const { orderId } = req.params;
    const adminUser = req.user;

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Find and update the order
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId,
        $or: [
          { paymentType: 'check' },
          { paymentType: 'cheque' },
          { paymentType: 'transfer' }
        ],
        'paymentDetails.status': 'pending_verification'
      },
      {
        status: 'cancelled',
        'paymentDetails.status': 'rejected',
        'paymentDetails.updatedAt': new Date()
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found or already processed" });
    }

    res.json({ 
      success: true, 
      message: `${order.paymentType === 'transfer' ? 'Bank transfer' : 'Check payment'} rejected (legacy endpoint)`,
      orderId: orderId,
      order: order
    });

  } catch (error) {
    console.error("Legacy check payment rejection error:", error);
    res.status(500).json({ error: "Error rejecting check payment" });
  }
});

/**
 * Process approved cheque order - trigger all automated systems
 */
async function processApprovedChequeOrder(order, adminUser) {
  try {
    console.log(`🔄 Processing approved check order: ${order._id}`);

    // 1. COMMISSION DISTRIBUTION
    try {
      console.log("💰 Distributing commissions for approved check order:", order._id);
      const commissionTransaction = await distributeCommissions(
        order._id,
        order.user_id,
        order.totalAmount
      );
      console.log("✅ Commission distribution completed:", commissionTransaction._id);
      
      // Mark user's first purchase as done
      const user = await User.findById(order.user_id);
      if (user && !user.firstPurchaseDone) {
        user.firstPurchaseDone = true;
        user.firstPurchaseDate = new Date();
        await user.save();
        console.log(`✅ Marked first purchase as done for user: ${user.email} at ${user.firstPurchaseDate}`);
      }
    } catch (commissionError) {
      console.error("❌ Commission distribution error:", commissionError);
    }

    // 2. AWARD POINTS
    try {
      console.log("🎁 Awarding points for approved check order:", order._id);
      for (const item of order.items) {
        let points = 0;
        
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          if (book && book.rewardPoints > 0) {
            points = book.rewardPoints * item.quantity;
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id);
          if (bundle && bundle.rewardPoints > 0) {
            points = bundle.rewardPoints * item.quantity;
          }
        }
        
        if (points > 0) {
          await awardPoints(
            order.user_id,
            points,
            item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
            item.id,
            order._id
          );
          console.log(`✅ Awarded ${points} points for ${item.title}`);
        }
      }
    } catch (pointsError) {
      console.error("❌ Points awarding error:", pointsError);
    }

    // 3. AWARD CASHBACK
    try {
      console.log("💰 Processing cashback for approved check order:", order._id);
      let totalCashback = 0;
      
      for (const item of order.items) {
        let itemCashback = 0;
        
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          if (book) {
            const bookCashback = book.getCashbackAmount();
            itemCashback = bookCashback * item.quantity;
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id);
          if (bundle) {
            const bundleCashback = bundle.getCashbackAmount();
            itemCashback = bundleCashback * item.quantity;
          }
        }
        
        if (itemCashback > 0) {
          totalCashback += itemCashback;
          console.log(`💰 Cashback for ${item.title}: ₹${itemCashback.toFixed(2)}`);
        }
      }
      
      if (totalCashback > 0) {
        const user = await User.findById(order.user_id);
        if (user) {
          const previousBalance = user.wallet || 0;
          user.wallet = previousBalance + totalCashback;
          await user.save();
          
          console.log(`✅ Added ₹${totalCashback.toFixed(2)} cashback to user wallet`);
          console.log(`💰 User wallet: ₹${previousBalance.toFixed(2)} → ₹${user.wallet.toFixed(2)}`);
        }
      }
    } catch (cashbackError) {
      console.error("❌ Cashback processing error:", cashbackError);
    }

    // 4. SEND EMAIL NOTIFICATIONS
    try {
      console.log("📧 Sending email notifications for approved check order...");
      const user = await User.findById(order.user_id);
      if (user && user.email) {
        await sendOrderConfirmationEmail(order, user);
        await sendAdminNotification(order, user);
        console.log("✅ Email notifications sent");
      }
    } catch (emailError) {
      console.error("❌ Email notification error:", emailError);
    }

    console.log(`✅ Approved check order processing completed: ${order._id}`);

  } catch (error) {
    console.error("❌ Error processing approved check order:", error);
    throw error;
  }
}

// =====================================================
// 🔄 SIMPLE CHEQUE PAYMENT FORM SUBMISSION
// =====================================================
router.post("/simple-cheque-payment-submit", authenticateToken, async (req, res) => {
  try {
    console.log("📝 Simple cheque payment form submitted:", req.body);
    
    const { 
      orderId, 
      chequeNumber, 
      bankName, 
      chequeDate, 
      utrNumber
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Find the order and verify it belongs to the user
    const order = await Order.findOne({
      _id: orderId,
      user_id: req.user.id,
      $or: [
        { paymentType: 'check' },
        { paymentType: 'cheque' }
      ],
      status: 'pending_payment_verification'
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found or not eligible for cheque payment" });
    }

    // Update order with cheque payment details
    const updateData = {
      'paymentDetails.status': 'pending_verification', // This is what admin panel looks for
      'paymentDetails.chequeNumber': chequeNumber,
      'paymentDetails.bankName': bankName,
      'paymentDetails.chequeDate': chequeDate ? new Date(chequeDate) : null,
      'paymentDetails.utrNumber': utrNumber,
      'paymentDetails.updatedAt': new Date()
    };

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    console.log(`✅ Cheque payment details updated for order: ${orderId}`);
    console.log(`📋 Order status: ${updatedOrder.status}`);
    console.log(`📋 Payment details status: ${updatedOrder.paymentDetails.status}`);

    res.json({ 
      success: true, 
      message: "Cheque payment details submitted successfully",
      orderId: orderId,
      status: "pending_verification"
    });

  } catch (error) {
    console.error("Simple cheque payment submission error:", error);
    res.status(500).json({ error: "Error processing cheque payment submission" });
  }
});

// =====================================================
// 🔄 UPLOAD CHECK IMAGE TO CLOUDINARY
// =====================================================
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (using your existing config)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage (no temp files needed)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

router.post("/upload-check-image", authenticateToken, upload.single('checkImage'), async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Find the order and verify it belongs to the user
    const order = await Order.findOne({
      _id: orderId,
      user_id: req.user.id,
      paymentType: 'check'
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    console.log(`📤 Uploading check image to Cloudinary for order: ${orderId}`);

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'check-payments',
          public_id: `check_${orderId}_${Date.now()}`,
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit', quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      uploadStream.end(req.file.buffer);
    });
    
    // Update order with Cloudinary image details
    const updateData = {
      'paymentDetails.checkImageUrl': uploadResult.secure_url,
      'paymentDetails.checkImagePublicId': uploadResult.public_id,
      'paymentDetails.checkImageFileName': req.file.originalname,
      'paymentDetails.updatedAt': new Date()
    };

    await Order.findByIdAndUpdate(orderId, updateData);

    console.log(`✅ Check image uploaded to Cloudinary for order: ${orderId}`);
    console.log(`📷 Cloudinary URL: ${uploadResult.secure_url}`);

    res.json({ 
      success: true, 
      message: "Check image uploaded successfully to Cloudinary",
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: req.file.originalname
    });

  } catch (error) {
    console.error("Check image upload error:", error);
    res.status(500).json({ 
      error: "Error uploading check image to Cloudinary",
      details: error.message 
    });
  }
});

module.exports = router;
