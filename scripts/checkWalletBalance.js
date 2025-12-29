// scripts/checkWalletBalance.js
// Quick script to check user wallet balance in database

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function checkWalletBalance() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');
        console.log('✅ Connected to MongoDB');
        
        // First, let's find all users to see what emails exist
        console.log('\n👥 All users in database:');
        const allUsers = await User.find({}, 'name email walletBalance').limit(10);
        allUsers.forEach(user => {
            console.log(`  - ${user.name} (${user.email}) - Wallet: ₹${user.walletBalance || 0}`);
        });
        
        // Find recent orders to see which user made them
        console.log('\n📦 Recent completed orders:');
        const recentOrders = await Order.find({ status: 'completed' })
            .populate('user_id', 'name email walletBalance')
            .sort({ createdAt: -1 })
            .limit(5);
            
        recentOrders.forEach(order => {
            if (order.user_id) {
                console.log(`  - Order ${order._id.toString().slice(-8)} by ${order.user_id.name} (${order.user_id.email})`);
                console.log(`    Wallet: ₹${order.user_id.walletBalance || 0}, Date: ${order.createdAt.toDateString()}`);
            }
        });
        
        // Try to find user by partial email match
        console.log('\n🔍 Looking for users with "natu" in email...');
        const natuUsers = await User.find({ 
            email: { $regex: 'natu', $options: 'i' } 
        }, 'name email walletBalance');
        
        natuUsers.forEach(user => {
            console.log(`  - ${user.name} (${user.email}) - Wallet: ₹${user.walletBalance || 0}`);
        });
        
        await mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Load environment variables and run
require('dotenv').config();
checkWalletBalance();