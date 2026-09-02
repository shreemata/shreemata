// models/Bundle.js
const mongoose = require("mongoose");

const bundleSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    
    description: { 
        type: String 
    },
    
    books: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Book",
        required: true
    }],
    
    originalPrice: { 
        type: Number, 
        required: true 
    },
    
    bundlePrice: { 
        type: Number, 
        required: true 
    },
    
    discount: { 
        type: Number // Percentage discount
    },
    
    isActive: { 
        type: Boolean, 
        default: true 
    },
    
    image: { 
        type: String // Bundle cover image
    },
    
    weight: {
        type: Number,
        default: 0 // Will be calculated from books
    },
    
    courierCharge: {
        type: Number,
        default: 0,
        min: 0 // Admin-set courier charge for this bundle
    },
    
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
    
    validUntil: { 
        type: Date // Optional expiry date
    }

}, { timestamps: true });

// Method to calculate actual cashback amount
bundleSchema.methods.getCashbackAmount = function() {
  if (this.cashbackAmount > 0) {
    return this.cashbackAmount;
  } else if (this.cashbackPercentage > 0) {
    return (this.bundlePrice * this.cashbackPercentage) / 100;
  }
  return 0;
};

// Calculate discount percentage and weight before saving
bundleSchema.pre('save', async function(next) {
    if (this.originalPrice && this.bundlePrice) {
        this.discount = Math.round(((this.originalPrice - this.bundlePrice) / this.originalPrice) * 100);
    }
    
    // Calculate total weight from books if books array is populated
    if (this.books && this.books.length > 0 && this.isModified('books')) {
        try {
            const Book = require('./Book');
            const books = await Book.find({ _id: { $in: this.books } });
            this.weight = books.reduce((sum, book) => sum + (book.weight || 0.5), 0);
        } catch (err) {
            console.error('Error calculating bundle weight:', err);
        }
    }
    
    next();
});

module.exports = mongoose.model("Bundle", bundleSchema);
