// models/VipCard.js
const mongoose = require("mongoose");

const vipCardSchema = new mongoose.Schema({
  cardNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  cardTier: {
    type: String,
    required: true,
    enum: ['Gold', 'Platinum', 'Diamond', 'VIP']
  },
  status: {
    type: String,
    enum: ['Active', 'Revoked', 'Expired'],
    default: 'Active',
    required: true
  },
  issueDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("VipCard", vipCardSchema);
