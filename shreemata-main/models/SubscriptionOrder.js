// models/SubscriptionOrder.js
// Server-authoritative mapping for Razorpay subscription orders
const mongoose = require('mongoose');

const subscriptionOrderSchema = new mongoose.Schema({
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amountPaise: {
    type: Number,
    required: true,
    min: 100 // minimum ₹1 (100 paise)
  },
  currency: {
    type: String,
    enum: ['INR'],
    default: 'INR',
    required: true
  },
  planType: {
    type: String,
    enum: ['monthly'],
    default: 'monthly',
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'expired', 'failed'],
    default: 'created',
    index: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NoteSubscription',
    index: true
  },
  razorpayPaymentId: {
    type: String,
    trim: true,
    index: true
  },
  razorpaySignature: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SubscriptionOrder', subscriptionOrderSchema);
