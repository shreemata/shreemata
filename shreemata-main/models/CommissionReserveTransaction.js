// models/CommissionReserveTransaction.js
const mongoose = require('mongoose');

const commissionReserveTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  transactionType: {
    type: String,
    enum: [
      'opening_balance',    // Initial verified reserve establishment
      'deposit',            // External funds added into commission reserve
      'withdrawal',         // Reserve funds utilized for payouts or administrative reserve reallocations
      'correction_credit',  // Auditable reversal or correcting entry increasing reserve
      'correction_debit'    // Auditable reversal or correcting entry decreasing reserve
    ],
    required: true,
    index: true
  },
  amountPaise: {
    type: Number,
    required: true,
    min: 1 // Integer paise, must be positive
  },
  status: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected', 'reversed'],
    default: 'pending_verification',
    index: true
  },
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  referenceNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fundingSource: {
    type: String,
    enum: [
      'bank_transfer',
      'director_infusion',
      'internal_cash_reserve',
      'escrow_allocation',
      'operating_account',
      'other'
    ],
    default: 'bank_transfer'
  },
  purpose: {
    type: String,
    required: true,
    trim: true
  },
  linkedPayoutId: {
    type: String,
    default: null,
    trim: true,
    index: true
  },
  supportingDocument: {
    type: String,
    default: null,
    trim: true
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommissionReserveTransaction',
    default: null
  },
  reversalReason: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Ensure uniqueness of non-reversed/non-rejected reference numbers for deposits and opening balances
commissionReserveTransactionSchema.index(
  { referenceNumber: 1, transactionType: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending_verification', 'verified'] } }
  }
);

// Method to safely convert paise to rupees
commissionReserveTransactionSchema.methods.getAmountRupees = function() {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
};

module.exports = mongoose.model('CommissionReserveTransaction', commissionReserveTransactionSchema);
