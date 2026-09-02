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
      'refund',                // Order refund
      'adjustment',            // Manual admin adjustment
      'test_simulation'        // Test simulated payouts
    ],
    required: true
  },
  description: {
    type: String,
    required: true
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

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
