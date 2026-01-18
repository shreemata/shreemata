const mongoose = require('mongoose');

const digitalPurchaseSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  bookId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Book', 
    required: true 
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true 
  },
  
  purchaseDate: { type: Date, default: Date.now },
  
  readingProgress: {
    currentPage: { type: Number, default: 1 },
    totalPages: { type: Number, default: 0 },
    lastReadAt: { type: Date, default: null }
  },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Index for fast lookups
digitalPurchaseSchema.index({ userId: 1, bookId: 1 });
digitalPurchaseSchema.index({ orderId: 1 });

module.exports = mongoose.model('DigitalPurchase', digitalPurchaseSchema);
