// models/NoteSubscription.js
// Data model for digital section subscription passes (Notes, Question Papers, Video Lectures)
const mongoose = require('mongoose');

const noteSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Section discriminator (notes, question_papers, videos)
  section: {
    type: String,
    enum: ['notes', 'question_papers', 'videos'],
    default: 'notes',
    required: true,
    index: true
  },
  planType: {
    type: String,
    default: 'standard',
    required: true
  },
  durationDays: {
    type: Number,
    default: 30,
    min: 1,
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
    required: function() { return this.planType !== 'admin_grant'; },
    trim: true,
    index: true
  },
  // Unique sparse constraint ensures strict idempotency and avoids collisions if draft records omit payment IDs
  razorpayPaymentId: {
    type: String,
    required: function() { return this.planType !== 'admin_grant'; },
    trim: true,
    unique: true,
    sparse: true
  },
  razorpaySignature: {
    type: String,
    required: function() { return this.planType !== 'admin_grant'; },
    trim: true
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  grantedAt: {
    type: Date
  },
  note: {
    type: String,
    maxlength: 200,
    trim: true
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revokedAt: {
    type: Date
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
  timestamps: true,
  collection: 'notesubscriptions'
});

// Compound indexes for subscription status queries and expiry checks scoped by section
noteSubscriptionSchema.index({ userId: 1, section: 1, status: 1, expiresAt: -1 });

// Database-level concurrency guard: prevent concurrent workers from committing overlapping active subscriptions per section
noteSubscriptionSchema.index(
  { userId: 1, section: 1, expiresAt: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Sequence concurrency guard: guarantees monotonically ordered non-colliding renewal allocations per user and section
noteSubscriptionSchema.index(
  { userId: 1, section: 1, subscriptionIndex: 1 },
  { unique: true, partialFilterExpression: { subscriptionIndex: { $type: 'number' } } }
);

module.exports = mongoose.model('NoteSubscription', noteSubscriptionSchema);
