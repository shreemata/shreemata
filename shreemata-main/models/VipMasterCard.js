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
  issuedAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("VipMasterCard", vipMasterCardSchema);
