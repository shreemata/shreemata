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
      'direct_commission',
      'cashback',
      'buyer_cashback',
      'referral_commission',
      'referral_registration_reward',
      'referral_fallback',
      'tree_commission',
      'tree_pool',
      'tree',
      'treeCommission',
      'tree_pool_commission',
      'admin_commission',
      'withdrawal',
      'vip_master_card_withdrawal',
      'refund',
      'adjustment',
      'test_simulation'
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
  withdrawalId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  balanceAfter: {
    type: Number,
    default: null
  }
}, { timestamps: true });

// Compound indexes for efficient queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index(
  { withdrawalId: 1, category: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      withdrawalId: { $type: "objectId" }, 
      category: 'refund' 
    } 
  }
);
walletTransactionSchema.index({ userId: 1, category: 1 });
walletTransactionSchema.index(
  { category: 1, referredUserId: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      category: 'referral_registration_reward', 
      referredUserId: { $type: "objectId" } 
    } 
  }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
