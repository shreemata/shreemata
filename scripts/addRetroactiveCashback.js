// scripts/addRetroactiveCashback.js
// Script to add cashback for orders completed before the cashback system was fixed

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const User = require('../models/User');

// Connect to MongoDB
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

async function addRetroactiveCashback() {
    console.log('🔍 Starting retroactive cashback processing...');
    
    try {
        // Get all completed orders
        const completedOrders = await Order.find({ 
            status: 'completed',
            createdAt: { $gte: new Date('2024-01-01') } // Adjust date as needed
        }).sort({ createdAt: -1 });
        
        console.log(`📦 Found ${completedOrders.length} completed orders to process`);
        
        let totalOrdersProcessed = 0;
        let totalCashbackAdded = 0;
        
        for (const order of completedOrders) {
            console.log(`\n🔍 Processing order ${order._id} (${order.createdAt.toDateString()})`);
            
            let orderCashback = 0;
            
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    let itemCashback = 0;
                    
                    if (item.type === 'book' && item.id) {
                        try {
                            const book = await Book.findById(item.id);
                            if (book) {
                                if (book.cashbackAmount > 0) {
                                    itemCashback = book.cashbackAmount * item.quantity;
                                } else if (book.cashbackPercentage > 0) {
                                    itemCashback = (item.price * book.cashbackPercentage / 100) * item.quantity;
                                }
                                
                                if (itemCashback > 0) {
                                    console.log(`  📚 Book "${item.title}": ₹${itemCashback.toFixed(2)} cashback`);
                                }
                            }
                        } catch (err) {
                            console.error(`  ❌ Error fetching book ${item.id}:`, err.message);
                        }
                    } else if (item.type === 'bundle' && item.id) {
                        try {
                            const bundle = await Bundle.findById(item.id);
                            if (bundle) {
                                if (bundle.cashbackAmount > 0) {
                                    itemCashback = bundle.cashbackAmount * item.quantity;
                                } else if (bundle.cashbackPercentage > 0) {
                                    itemCashback = (item.price * bundle.cashbackPercentage / 100) * item.quantity;
                                }
                                
                                if (itemCashback > 0) {
                                    console.log(`  📦 Bundle "${item.title}": ₹${itemCashback.toFixed(2)} cashback`);
                                }
                            }
                        } catch (err) {
                            console.error(`  ❌ Error fetching bundle ${item.id}:`, err.message);
                        }
                    }
                    
                    orderCashback += itemCashback;
                }
            }
            
            if (orderCashback > 0) {
                // Add cashback to user's wallet
                const user = await User.findById(order.user_id);
                if (user) {
                    const previousBalance = user.walletBalance || 0;
                    user.walletBalance = previousBalance + orderCashback;
                    await user.save();
                    
                    console.log(`  ✅ Added ₹${orderCashback.toFixed(2)} to ${user.name}'s wallet`);
                    console.log(`  💰 Wallet: ₹${previousBalance.toFixed(2)} → ₹${user.walletBalance.toFixed(2)}`);
                    
                    totalCashbackAdded += orderCashback;
                } else {
                    console.log(`  ❌ User not found for order ${order._id}`);
                }
            } else {
                console.log(`  ℹ️ No cashback for this order`);
            }
            
            totalOrdersProcessed++;
        }
        
        console.log('\n🎉 Retroactive cashback processing completed!');
        console.log(`📊 Summary:`);
        console.log(`   Orders processed: ${totalOrdersProcessed}`);
        console.log(`   Total cashback added: ₹${totalCashbackAdded.toFixed(2)}`);
        
    } catch (error) {
        console.error('❌ Error processing retroactive cashback:', error);
    }
}

// Main execution
async function main() {
    console.log('🚀 Retroactive Cashback Processor');
    console.log('==================================');
    
    await connectDB();
    await addRetroactiveCashback();
    
    console.log('\n✅ Process completed. Closing database connection...');
    await mongoose.connection.close();
    process.exit(0);
}

// Run the script
if (require.main === module) {
    // Load environment variables
    require('dotenv').config();
    main().catch(console.error);
}

module.exports = { addRetroactiveCashback };