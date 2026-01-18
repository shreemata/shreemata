const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Order = require('./models/Order');
const User = require('./models/User');

async function checkRevenueCalculation() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all orders and their details
        const allOrders = await Order.find({}).select('totalAmount status paymentType createdAt user_id items').populate('user_id', 'name email');
        
        console.log(`\n📊 REVENUE CALCULATION ANALYSIS`);
        console.log(`Total orders in database: ${allOrders.length}`);
        
        // Group orders by status
        const ordersByStatus = {};
        let totalRevenue = 0;
        let completedRevenue = 0;
        let pendingRevenue = 0;
        
        allOrders.forEach(order => {
            const status = order.status || 'unknown';
            const amount = order.totalAmount || 0;
            
            if (!ordersByStatus[status]) {
                ordersByStatus[status] = { count: 0, revenue: 0, orders: [] };
            }
            
            ordersByStatus[status].count++;
            ordersByStatus[status].revenue += amount;
            ordersByStatus[status].orders.push({
                id: order._id.toString().slice(-8),
                amount: amount,
                user: order.user_id?.name || 'Unknown',
                date: order.createdAt?.toLocaleDateString() || 'Unknown',
                paymentType: order.paymentType || 'online'
            });
            
            totalRevenue += amount;
            
            if (status === 'completed' || status === 'pending_payment_verification') {
                completedRevenue += amount;
            } else if (status === 'pending') {
                pendingRevenue += amount;
            }
        });
        
        console.log(`\n💰 REVENUE BREAKDOWN:`);
        console.log(`All orders total: Rs ${totalRevenue.toLocaleString('en-IN')}`);
        console.log(`Completed + Verified orders: Rs ${completedRevenue.toLocaleString('en-IN')}`);
        console.log(`Pending orders: Rs ${pendingRevenue.toLocaleString('en-IN')}`);
        
        console.log(`\n📋 ORDERS BY STATUS:`);
        Object.keys(ordersByStatus).forEach(status => {
            const data = ordersByStatus[status];
            console.log(`${status.toUpperCase()}: ${data.count} orders, Rs ${data.revenue.toLocaleString('en-IN')}`);
            
            // Show first few orders for each status
            if (data.orders.length > 0) {
                console.log(`  Sample orders:`);
                data.orders.slice(0, 3).forEach(order => {
                    console.log(`    - ${order.id}: Rs ${order.amount} (${order.user}) - ${order.date} - ${order.paymentType}`);
                });
                if (data.orders.length > 3) {
                    console.log(`    ... and ${data.orders.length - 3} more`);
                }
            }
        });
        
        // Check what the current daily report query would return
        console.log(`\n🔍 CURRENT DAILY REPORT QUERY RESULT:`);
        const reportRevenue = await Order.aggregate([
            { $match: { status: { $in: ['completed', 'pending_payment_verification'] } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        console.log(`Report shows: Rs ${reportRevenue[0]?.total?.toLocaleString('en-IN') || 0}`);
        
        // Check if there are any orders with unusual amounts
        console.log(`\n🔍 UNUSUAL AMOUNTS CHECK:`);
        const highAmountOrders = allOrders.filter(order => (order.totalAmount || 0) > 1000);
        console.log(`Orders over Rs 1000: ${highAmountOrders.length}`);
        
        highAmountOrders.forEach(order => {
            console.log(`  - ${order._id.toString().slice(-8)}: Rs ${order.totalAmount} (${order.user_id?.name || 'Unknown'}) - ${order.status} - ${order.items?.length || 0} items`);
        });
        
        // Check for any null or undefined amounts
        const invalidAmounts = allOrders.filter(order => !order.totalAmount || order.totalAmount <= 0);
        console.log(`\nOrders with invalid amounts: ${invalidAmounts.length}`);
        
        if (invalidAmounts.length > 0) {
            invalidAmounts.forEach(order => {
                console.log(`  - ${order._id.toString().slice(-8)}: Rs ${order.totalAmount} (${order.user_id?.name || 'Unknown'})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkRevenueCalculation();