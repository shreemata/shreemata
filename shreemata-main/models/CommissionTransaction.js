// models/CommissionTransaction.js
const mongoose = require("mongoose");

const commissionTransactionSchema = new mongoose.Schema({
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true,
    index: true
  },
  purchaser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  orderAmount: { 
    type: Number, 
    required: true 
  },
  profitAmount: {
    type: Number,
    default: 0
  },
  
  // Direct Commission (3%)
  directReferrer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  directCommissionAmount: { 
    type: Number, 
    default: 0 
  },
  
  // Referral Commission (2%)
  referralReferrer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  referralCommissionAmount: { 
    type: Number, 
    default: 0 
  },
  
  // Admin Commission Share
  adminRecipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  adminCommissionAmount: {
    type: Number,
    default: 0
  },
  
  // Tree Commissions (Level-Based Tree Pool)
  treePoolVersion: {
    type: String,
    default: "same-level-completed-block-v1"
  },
  sameLevelEligibilityRule: {
    type: String,
    default: "completed-5-of-5-sibling-block"
  },
  buyerTreeLevel: {
    type: Number,
    default: 0
  },
  treePoolTotal: {
    type: Number,
    default: 0
  },
  treeCommissions: [{
    recipient: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true
    },
    level: { 
      type: Number, 
      required: true 
    },
    percentage: { 
      type: Number, 
      required: true 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    redirectedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    recipientLevel: {
      type: Number
    },
    bucketLevel: {
      type: Number
    },
    bucketType: {
      type: String
    },
    siblingBlockParent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    siblingBlockComplete: {
      type: Boolean,
      default: false
    },
    levelBucket: {
      type: String
    },
    originalWeight: {
      type: Number
    },
    normalizedPercent: {
      type: Number
    },
    levelBucketAmount: {
      type: Number
    },
    memberShareAmount: {
      type: Number
    },
    rolledUpRemainder: {
      type: Number,
      default: 0
    }
  }],
  
  // Trust Funds
  trustFundAmount: { 
    type: Number, 
    default: 0 
  },
  devTrustFundAmount: { 
    type: Number, 
    default: 0 
  },
  remainderToDevFund: { 
    type: Number, 
    default: 0 
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  processedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index for efficient commission history queries by user and time
commissionTransactionSchema.index({ purchaser: 1, processedAt: 1 });

module.exports = mongoose.model("CommissionTransaction", commissionTransactionSchema);
