// models/VipMasterCard.js
const mongoose = require("mongoose");

const vipMasterCardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  cardNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  tier: {
    type: Number,
    required: true
  },
  milestoneAmount: {
    type: Number,
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  lastWithdrawalDate: {
    type: Date,
    default: null
  },
  issuedAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("VipMasterCard", vipMasterCardSchema);
