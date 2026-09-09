// models/WalletTransaction.js
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  category: {
    type: String,
    enum: [
      'direct_commission',     // Cashback to buyer
      'referral_commission',   // Referral earnings
      'tree_commission',       // Tree placement earnings
      'admin_commission',      // Admin share
      'referral_fallback',     // Referral fallback to admin
      'withdrawal',            // Wallet withdrawal
      'vip_master_card_withdrawal', // VIP Master Card withdrawal
      'refund',                // Order refund
      'adjustment',            // Manual admin adjustment
      'test_simulation',       // Test simulated payouts
      'referral_registration_reward' // Registration reward for introducing new user
    ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  commissionTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommissionTransaction',
    default: null
  },
  balanceAfter: {
    type: Number,
    default: null
  }
}, { timestamps: true });

// Compound indexes for efficient queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index({ userId: 1, category: 1 });
walletTransactionSchema.index(
  { category: 1, referredUserId: 1 },
  { 
    unique: true, 
    sparse: true, 
    partialFilterExpression: { 
      category: 'referral_registration_reward', 
      referredUserId: { $ne: null } 
    } 
  }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
