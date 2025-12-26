// models/Book.js
const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  cover_image: { type: String, default: '' },
  preview_images: { type: [String], default: [] },
  
  // Updated fields for educational books
  class: { type: String, default: '' }, // Class (1, 2, 3, etc.)
  subject: { type: String, default: '' }, // Subject (Math, Science, etc.)
  
  // Keep category for backward compatibility
  category: { type: String, default: 'uncategorized' }, // store category slug
  
  weight: { type: Number, default: 0.5 }, // weight in kg, default 0.5kg
  ratings_average: { type: Number, default: 0 }, // will be used later
  ratings_count: { type: Number, default: 0 },
  
  // Points System
  rewardPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Cashback System
  cashbackAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  cashbackPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Stock Management
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'limited_stock'],
    default: 'in_stock'
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
    min: 0
  },
  trackStock: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Method to calculate actual cashback amount
bookSchema.methods.getCashbackAmount = function() {
  if (this.cashbackAmount > 0) {
    return this.cashbackAmount;
  } else if (this.cashbackPercentage > 0) {
    return (this.price * this.cashbackPercentage) / 100;
  }
  return 0;
};

// Method to get display-friendly stock status
bookSchema.methods.getStockStatusDisplay = function() {
  if (!this.trackStock) return 'Available';
  
  switch (this.stockStatus) {
    case 'in_stock':
      return this.stockQuantity > this.lowStockThreshold ? 'In Stock' : 'Limited Stock';
    case 'limited_stock':
      return 'Limited Stock';
    case 'out_of_stock':
      return 'Out of Stock';
    default:
      return 'Available';
  }
};

// Method to check if book is available for purchase
bookSchema.methods.isAvailable = function() {
  if (!this.trackStock) return true;
  return this.stockStatus !== 'out_of_stock' && this.stockQuantity > 0;
};

// Method to update stock after purchase
bookSchema.methods.reduceStock = function(quantity = 1) {
  if (!this.trackStock) return;
  
  this.stockQuantity = Math.max(0, this.stockQuantity - quantity);
  
  // Auto-update status based on quantity
  if (this.stockQuantity === 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.stockQuantity <= this.lowStockThreshold) {
    this.stockStatus = 'limited_stock';
  } else {
    this.stockStatus = 'in_stock';
  }
};

module.exports = mongoose.model('Book', bookSchema);
