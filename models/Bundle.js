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
    
    // Points System
    rewardPoints: {
        type: Number,
        default: 0,
        min: 0
    },
    
    validUntil: { 
        type: Date // Optional expiry date
    }

}, { timestamps: true });

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
