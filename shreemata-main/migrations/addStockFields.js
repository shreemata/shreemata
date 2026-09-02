// Migration: Add stock management fields to existing books
// Run this once to add stock fields to books that don't have them

const mongoose = require('mongoose');
require('dotenv').config();

const Book = require('../models/Book');

async function addStockFields() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        console.log('📦 Adding stock fields to existing books...');
        
        // Update all books that don't have stock fields
        const result = await Book.updateMany(
            {
                $or: [
                    { stockQuantity: { $exists: false } },
                    { stockStatus: { $exists: false } },
                    { lowStockThreshold: { $exists: false } },
                    { trackStock: { $exists: false } }
                ]
            },
            {
                $set: {
                    stockQuantity: 10,           // Default stock quantity
                    stockStatus: 'in_stock',     // Default status
                    lowStockThreshold: 5,        // Default low stock threshold
                    trackStock: true             // Enable stock tracking by default
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} books with stock fields`);

        // Show sample of updated books
        const sampleBooks = await Book.find({}).limit(3).select('title stockQuantity stockStatus trackStock');
        console.log('📚 Sample updated books:');
        sampleBooks.forEach(book => {
            console.log(`  - ${book.title}: ${book.stockQuantity} units, ${book.stockStatus}, tracking: ${book.trackStock}`);
        });

        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📴 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run migration if called directly
if (require.main === module) {
    addStockFields();
}

module.exports = addStockFields;