// models/WithdrawalOperation.js
const mongoose = require("mongoose");

/**
 * Durable Persistent Operation Record for Withdrawal Processing.
 * 
 * Ensures crash-safe consistency and idempotency across multi-collection
 * updates (User wallet + WalletTransaction ledger) when multi-document
 * transactions are either active or unavailable.
 */
const withdrawalOperationSchema = new mongoose.Schema({
  withdrawId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  operationType: {
    type: String,
    enum: ['reject_refund', 'approve_payout'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['initiated', 'wallet_credited', 'completed', 'failed'],
    default: 'initiated',
    index: true
  },
  rejectionReason: {
    type: String,
    default: null
  },
  walletCredited: {
    type: Boolean,
    default: false
  },
  ledgerWritten: {
    type: Boolean,
    default: false
  },
  walletTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  },
  recoveryLocked: {
    type: Boolean,
    default: false,
    index: true
  },
  recoveryStartedAt: {
    type: Date,
    default: null
  },
  strategyUsed: {
    type: String,
    enum: ['transaction', 'durable_state_machine'],
    default: 'durable_state_machine'
  },
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

withdrawalOperationSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("WithdrawalOperation", withdrawalOperationSchema);
