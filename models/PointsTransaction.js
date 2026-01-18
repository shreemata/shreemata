const mongoose = require('mongoose');

const pointsTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['earned', 'redeemed', 'auto_converted_to_cash', 'manual_converted_to_cash'],
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  // For earned points
  source: {
    type: String,
    enum: ['book_purchase', 'bundle_purchase'],
    required: function() { return this.type === 'earned'; }
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: function() { return this.type === 'earned'; }
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: function() { return this.type === 'earned'; }
  },
  // For redeemed points or cash conversion
  virtualUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.type === 'redeemed'; }
  },
  // For cash conversion
  cashAmount: {
    type: Number,
    required: function() { return this.type === 'auto_converted_to_cash' || this.type === 'manual_converted_to_cash'; }
  },
  description: String,
  // Balance after this transaction
  balanceAfter: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
pointsTransactionSchema.index({ user: 1, createdAt: -1 });
pointsTransactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('PointsTransaction', pointsTransactionSchema);
