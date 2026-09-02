// Remove pending orders that were never paid
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI);

async function removePendingOrders(userId) {
  try {
    console.log('🔍 REMOVING PENDING ORDERS\n');
    
    if (!userId) {
      console.log('❌ Please provide a user ID');
      console.log('Usage: node remove-pending-orders.js <user-id>');
      console.log('Example: node remove-pending-orders.js 69707b6bb536b901c983819a');
      return;
    }
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 User Details:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Phone: ${user.phone}`);
    
    // Find all orders for this user
    const allOrders = await Order.find({ user_id: userId }).sort({ createdAt: -1 });
    const pendingOrders = allOrders.filter(order => 
      order.status === 'pending' || order.status === 'pending_payment_verification'
    );
    const completedOrders = allOrders.filter(order => order.status === 'completed');
    
    console.log(`\n📊 Order Summary:`);
    console.log(`   Total Orders: ${allOrders.length}`);
    console.log(`   Completed Orders: ${completedOrders.length}`);
    console.log(`   Pending Orders: ${pendingOrders.length}`);
    
    if (completedOrders.length > 0) {
      console.log(`\n✅ Completed Orders:`);
      completedOrders.forEach((order, index) => {
        console.log(`   ${index + 1}. Order ${order._id}`);
        console.log(`      - Amount: ₹${order.totalAmount}`);
        console.log(`      - Date: ${order.createdAt?.toLocaleDateString()}`);
        console.log(`      - Payment ID: ${order.razorpay_payment_id}`);
      });
    }
    
    if (pendingOrders.length > 0) {
      console.log(`\n⏳ Pending Orders to Remove:`);
      pendingOrders.forEach((order, index) => {
        const timeDiff = Math.round((Date.now() - order.createdAt) / (1000 * 60));
        console.log(`   ${index + 1}. Order ${order._id}`);
        console.log(`      - Amount: ₹${order.totalAmount}`);
        console.log(`      - Status: ${order.status}`);
        console.log(`      - Created: ${timeDiff} minutes ago`);
        console.log(`      - Payment Type: ${order.paymentType || 'online'}`);
        console.log(`      - Razorpay Order ID: ${order.razorpay_order_id || 'None'}`);
      });
      
      // Remove pending orders
      console.log(`\n🗑️  Removing ${pendingOrders.length} pending orders...`);
      
      for (const order of pendingOrders) {
        try {
          await Order.findByIdAndDelete(order._id);
          console.log(`   ✅ Removed order ${order._id} (₹${order.totalAmount})`);
        } catch (deleteError) {
          console.log(`   ❌ Failed to remove order ${order._id}: ${deleteError.message}`);
        }
      }
      
      console.log(`\n🎉 Successfully removed ${pendingOrders.length} pending orders!`);
      
    } else {
      console.log(`\n✅ No pending orders found for this user`);
    }
    
    // Final summary
    const remainingOrders = await Order.find({ user_id: userId });
    console.log(`\n📋 Final Summary:`);
    console.log(`   User: ${user.name}`);
    console.log(`   Remaining Orders: ${remainingOrders.length}`);
    console.log(`   Wallet Balance: ₹${user.wallet || 0}`);
    console.log(`   Status: ${remainingOrders.length > 0 ? 'Active customer' : 'No orders'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Get user ID from command line argument
const userId = process.argv[2];
removePendingOrders(userId);