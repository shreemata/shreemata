// Change Basavaraj Akki's order status to pending
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI);

async function changeOrderStatusToPending() {
  try {
    console.log('📋 CHANGING ORDER STATUS TO PENDING\n');
    
    // Find Basavaraj Akki
    const user = await User.findOne({ 
      name: { $regex: /basavaraj.*akki/i }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 Found user:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   User ID: ${user._id}`);
    
    // Find their orders
    const orders = await Order.find({ user_id: user._id });
    console.log(`\n📦 Found ${orders.length} order(s):`);
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      console.log(`\n${i + 1}. Order Details:`);
      console.log(`   Order ID: ${order._id}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Amount: ₹${order.totalAmount}`);
      console.log(`   Date: ${order.createdAt.toLocaleDateString()}`);
      console.log(`   Payment ID: ${order.razorpay_payment_id || 'None'}`);
      console.log(`   Reward Applied: ${order.rewardApplied}`);
      
      if (order.status === 'completed') {
        console.log(`\n🔄 Changing order ${order._id} status to pending...`);
        
        // Update order status
        order.status = 'pending';
        order.rewardApplied = false;
        
        // Optionally remove payment ID to make it look unpaid
        if (order.razorpay_payment_id) {
          console.log(`   Removing payment ID: ${order.razorpay_payment_id}`);
          order.razorpay_payment_id = null;
        }
        
        await order.save();
        console.log(`   ✅ Order status changed to: ${order.status}`);
        console.log(`   ✅ Reward applied set to: ${order.rewardApplied}`);
      } else {
        console.log(`   ℹ️  Order already has status: ${order.status} (no change needed)`);
      }
    }
    
    console.log('\n✅ OPERATION COMPLETED');
    console.log(`   All orders for ${user.name} have been processed`);
    console.log(`   Orders will now show as "pending" in admin panel`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

changeOrderStatusToPending();