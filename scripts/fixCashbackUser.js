// scripts/fixCashbackUser.js
// Script to fix cashback added to wrong user

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function fixCashbackUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');
        console.log('✅ Connected to MongoDB');
        
        // Find the user who should have received cashback (from your browser)
        const correctUserId = '694e35d422b57b62a8a47cbf'; // Your actual user ID
        const correctUser = await User.findById(correctUserId);
        
        if (!correctUser) {
            console.log('❌ Correct user not found');
            return;
        }
        
        console.log('👤 Correct user:', correctUser.name, correctUser.email);
        console.log('💰 Current wallet balance:', correctUser.walletBalance || 0);
        
        // Find recent orders by this user
        const recentOrders = await Order.find({ 
            user_id: correctUserId,
            status: 'completed',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        }).sort({ createdAt: -1 });
        
        console.log(`📦 Found ${recentOrders.length} recent completed orders`);
        
        let totalCashbackToAdd = 0;
        
        for (const order of recentOrders) {
            console.log(`\n🔍 Processing order ${order._id}`);
            
            let orderCashback = 0;
            
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    let itemCashback = 0;
                    
                    if (item.type === 'book' && item.id) {
                        try {
                            const Book = require('../models/Book');
                            const book = await Book.findById(item.id);
                            if (book) {
                                if (book.cashbackAmount > 0) {
                                    itemCashback = book.cashbackAmount * item.quantity;
                                } else if (book.cashbackPercentage > 0) {
                                    itemCashback = (item.price * book.cashbackPercentage / 100) * item.quantity;
                                }
                                
                                if (itemCashback > 0) {
                                    console.log(`  📚 "${item.title}": ₹${itemCashback.toFixed(2)} cashback`);
                                }
                            }
                        } catch (err) {
                            console.error(`  ❌ Error fetching book:`, err.message);
                        }
                    }
                    
                    orderCashback += itemCashback;
                }
            }
            
            totalCashbackToAdd += orderCashback;
        }
        
        if (totalCashbackToAdd > 0) {
            // Add cashback to correct user
            const previousBalance = correctUser.walletBalance || 0;
            correctUser.walletBalance = previousBalance + totalCashbackToAdd;
            await correctUser.save();
            
            console.log(`\n✅ Added ₹${totalCashbackToAdd.toFixed(2)} cashback to ${correctUser.name}'s wallet`);
            console.log(`💰 Wallet balance: ₹${previousBalance.toFixed(2)} → ₹${correctUser.walletBalance.toFixed(2)}`);
        } else {
            console.log('\nℹ️ No cashback to add (no eligible items found)');
        }
        
        await mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

require('dotenv').config();
fixCashbackUser();