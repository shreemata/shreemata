// scripts/addCashbackNow.js
// Quick script to add ₹2.00 cashback to your account

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function addCashbackNow() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');
        console.log('✅ Connected to MongoDB');
        
        // Find the user who made the recent "cash back book" order
        console.log('🔍 Looking for recent orders with "cash back book"...');
        
        const recentOrders = await Order.find({
            'items.title': { $regex: 'cash back book', $options: 'i' },
            status: 'completed',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        }).populate('user_id', 'name email wallet').sort({ createdAt: -1 });
        
        console.log(`📦 Found ${recentOrders.length} matching orders`);
        
        if (recentOrders.length === 0) {
            console.log('❌ No recent orders found with "cash back book"');
            
            // Show all recent completed orders instead
            console.log('\n📦 All recent completed orders:');
            const allRecentOrders = await Order.find({
                status: 'completed',
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }).populate('user_id', 'name email wallet').sort({ createdAt: -1 }).limit(5);
            
            allRecentOrders.forEach((order, index) => {
                console.log(`  ${index + 1}. Order ${order._id.toString().slice(-8)} by ${order.user_id?.name || 'Unknown'}`);
                console.log(`     Email: ${order.user_id?.email || 'Unknown'}`);
                console.log(`     Wallet: ₹${order.user_id?.wallet || 0}`);
                console.log(`     Items: ${order.items.map(item => item.title).join(', ')}`);
                console.log('');
            });
            
            await mongoose.connection.close();
            return;
        }
        
        // Process the most recent matching order
        const order = recentOrders[0];
        const user = order.user_id;
        
        console.log('👤 Found user:', user.name);
        console.log('📧 Email:', user.email);
        console.log('💰 Current wallet balance:', user.wallet || 0);
        console.log('📦 Order ID:', order._id.toString().slice(-8));
        
        // Add ₹2.00 cashback
        const cashbackAmount = 2.00;
        const previousBalance = user.wallet || 0;
        user.wallet = previousBalance + cashbackAmount;
        await user.save();
        
        console.log(`✅ Added ₹${cashbackAmount.toFixed(2)} cashback`);
        console.log(`💰 New wallet balance: ₹${user.wallet.toFixed(2)}`);
        
        await mongoose.connection.close();
        console.log('\n🎉 Done! Refresh your browser to see the updated balance.');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

require('dotenv').config();
addCashbackNow();