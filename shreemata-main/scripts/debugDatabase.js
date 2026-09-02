// scripts/debugDatabase.js
// Comprehensive script to debug the database and find your data

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function debugDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');
        console.log('✅ Connected to MongoDB');
        
        // 1. Check all users
        console.log('\n👥 ALL USERS IN DATABASE:');
        const allUsers = await User.find({}, 'name email wallet role').limit(10);
        allUsers.forEach((user, index) => {
            console.log(`  ${index + 1}. ${user.name} (${user.email}) - Wallet: ₹${user.wallet || 0} - Role: ${user.role}`);
        });
        
        // 2. Check all orders (regardless of status)
        console.log('\n📦 ALL ORDERS (LAST 7 DAYS):');
        const allOrders = await Order.find({
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).populate('user_id', 'name email wallet').sort({ createdAt: -1 }).limit(10);
        
        allOrders.forEach((order, index) => {
            console.log(`  ${index + 1}. Order ${order._id.toString().slice(-8)} - Status: ${order.status}`);
            console.log(`     User: ${order.user_id?.name || 'Unknown'} (${order.user_id?.email || 'Unknown'})`);
            console.log(`     Wallet: ₹${order.user_id?.wallet || 0}`);
            console.log(`     Date: ${order.createdAt.toDateString()}`);
            console.log(`     Items: ${order.items.map(item => `${item.title} (₹${item.price})`).join(', ')}`);
            console.log('');
        });
        
        // 3. Look specifically for orders with "cash" in the title
        console.log('\n🔍 ORDERS WITH "CASH" IN TITLE:');
        const cashOrders = await Order.find({
            'items.title': { $regex: 'cash', $options: 'i' }
        }).populate('user_id', 'name email wallet').sort({ createdAt: -1 }).limit(5);
        
        cashOrders.forEach((order, index) => {
            console.log(`  ${index + 1}. Order ${order._id.toString().slice(-8)} - Status: ${order.status}`);
            console.log(`     User: ${order.user_id?.name || 'Unknown'} (${order.user_id?.email || 'Unknown'})`);
            console.log(`     Wallet: ₹${order.user_id?.wallet || 0}`);
            console.log(`     Date: ${order.createdAt.toDateString()}`);
            console.log(`     Items: ${order.items.map(item => `${item.title} (₹${item.price})`).join(', ')}`);
            console.log('');
        });
        
        // 4. Check order statuses
        console.log('\n📊 ORDER STATUS SUMMARY:');
        const statusCounts = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        statusCounts.forEach(status => {
            console.log(`  ${status._id}: ${status.count} orders`);
        });
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

require('dotenv').config();
debugDatabase();