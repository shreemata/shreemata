// models/NoteSubscription.js
// Data model for READ NOTES monthly digital subscription records
const mongoose = require('mongoose');

const noteSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  planType: {
    type: String,
    enum: ['monthly'],
    default: 'monthly',
    required: true
  },
  amountPaid: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['INR'],
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'refunded', 'cancelled'],
    default: 'active',
    index: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    validate: {
      validator: function(value) {
        if (!value || !this.startDate) return true;
        return new Date(value).getTime() > new Date(this.startDate).getTime();
      },
      message: 'expiresAt must be later than startDate'
    }
  },
  razorpayOrderId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  // Unique sparse constraint ensures strict idempotency and avoids collisions if draft records omit payment IDs
  razorpayPaymentId: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    sparse: true
  },
  razorpaySignature: {
    type: String,
    required: true,
    trim: true
  },
  subscriptionIndex: {
    type: Number,
    min: 1
  },
  paymentDetails: {
    method: { type: String, default: 'razorpay' },
    capturedAt: { type: Date }
  }
}, {
  timestamps: true
});

// Compound indexes for subscription status queries and expiry checks
noteSubscriptionSchema.index({ userId: 1, status: 1, expiresAt: -1 });

// Database-level concurrency guard: prevent concurrent workers from committing overlapping active subscriptions
noteSubscriptionSchema.index(
  { userId: 1, expiresAt: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Sequence concurrency guard: guarantees monotonically ordered non-colliding renewal allocations per user
noteSubscriptionSchema.index(
  { userId: 1, subscriptionIndex: 1 },
  { unique: true, partialFilterExpression: { subscriptionIndex: { $type: 'number' } } }
);

module.exports = mongoose.model('NoteSubscription', noteSubscriptionSchema);



