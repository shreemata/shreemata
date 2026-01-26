const mongoose = require('mongoose');

const readingSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  digitalPurchaseId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DigitalPurchase', 
    required: true 
  },
  
  sessionToken: { type: String, required: true, unique: true },
  startTime: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Index for fast session lookups
readingSessionSchema.index({ sessionToken: 1 });
readingSessionSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('ReadingSession', readingSessionSchema);
