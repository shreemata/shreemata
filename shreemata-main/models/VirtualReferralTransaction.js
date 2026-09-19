// models/VirtualReferralTransaction.js
const mongoose = require("mongoose");

const virtualReferralTransactionSchema = new mongoose.Schema({
  virtualReferralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['tree_commission', 'claim_to_vip_master_card'],
    required: true,
    index: true
  },
  amountPaise: {
    type: Number,
    required: true
  },
  balanceAfterPaise: {
    type: Number,
    required: true
  },
  vipMasterCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VipMasterCard',
    default: null
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
  sourceTreeLevel: {
    type: Number,
    default: null
  }
}, { timestamps: true });

virtualReferralTransactionSchema.index({ virtualReferralId: 1, createdAt: -1 });
virtualReferralTransactionSchema.index({ ownerUserId: 1, createdAt: -1 });

module.exports = mongoose.model("VirtualReferralTransaction", virtualReferralTransactionSchema);
