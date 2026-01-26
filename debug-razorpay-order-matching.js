// Debug Razorpay order matching issue
require('dotenv').config();

const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');
const Razorpay = require('razorpay');

mongoose.connect(process.env.MONGO_URI);

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function debugRazorpayOrderMatching() {
  try {
    console.log('🔍 DEBUGGING RAZORPAY ORDER MATCHING\n');
    
    // 1. Check recent Razorpay payments
    console.log('1️⃣ FETCHING RECENT RAZORPAY PAYMENTS:');
    const razorpayPayments = await razorpay.payments.all({
      count: 10
    });
    
    console.log(`Found ${razorpayPayments.items.length} recent Razorpay payments:`);
    
    for (let i = 0; i < Math.min(5, razorpayPayments.items.length); i++) {
      const payment = razorpayPayments.items[i];
      console.log(`\n${i + 1}. Razorpay Payment:`);
      console.log(`   Payment ID: ${payment.id}`);
      console.log(`   Order ID: ${payment.order_id || 'None'}`);
      console.log(`   Amount: ₹${(payment.amount / 100).toFixed(2)}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Email: ${payment.email || 'None'}`);
      console.log(`   Contact: ${payment.contact || 'None'}`);
      console.log(`   Created: ${new Date(payment.created_at * 1000).toLocaleString()}`);
    }
    
    // 2. Check recent database orders
    console.log('\n\n2️⃣ CHECKING DATABASE ORDERS:');
    const dbOrders = await Order.find({
      $or: [
        { razorpay_order_id: { $exists: true, $ne: null } },
        { razorpay_payment_id: { $exists: true, $ne: null } }
      ]
    }).populate('user_id', 'name email phone').sort({ createdAt: -1 }).limit(10);
    
    console.log(`Found ${dbOrders.length} database orders with Razorpay data:`);
    
    dbOrders.forEach((order, index) => {
      console.log(`\n${index + 1}. Database Order:`);
      console.log(`   Order ID: ${order._id}`);
      console.log(`   User: ${order.user_id?.name || 'No user'}`);
      console.log(`   Email: ${order.user_id?.email || 'No email'}`);
      console.log(`   Phone: ${order.user_id?.phone || 'No phone'}`);
      console.log(`   Amount: ₹${order.totalAmount}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Razorpay Order ID: ${order.razorpay_order_id || 'None'}`);
      console.log(`   Razorpay Payment ID: ${order.razorpay_payment_id || 'None'}`);
      console.log(`   Created: ${order.createdAt.toLocaleString()}`);
    });
    
    // 3. Test matching logic
    console.log('\n\n3️⃣ TESTING MATCHING LOGIC:');
    
    if (razorpayPayments.items.length > 0 && dbOrders.length > 0) {
      const testPayment = razorpayPayments.items[0];
      console.log(`\nTesting with Razorpay payment: ${testPayment.id}`);
      console.log(`Razorpay order_id: ${testPayment.order_id || 'None'}`);
      
      // Try to find matching order
      let matchedOrder = null;
      
      // Method 1: Match by razorpay_order_id
      if (testPayment.order_id) {
        console.log(`\n🔍 Searching by razorpay_order_id: ${testPayment.order_id}`);
        matchedOrder = await Order.findOne({ 
          razorpay_order_id: testPayment.order_id 
        }).populate('user_id', 'name email phone');
        
        if (matchedOrder) {
          console.log(`✅ FOUND by razorpay_order_id!`);
          console.log(`   Order: ${matchedOrder._id}`);
          console.log(`   User: ${matchedOrder.user_id?.name}`);
        } else {
          console.log(`❌ NOT FOUND by razorpay_order_id`);
        }
      }
      
      // Method 2: Match by razorpay_payment_id
      if (!matchedOrder) {
        console.log(`\n🔍 Searching by razorpay_payment_id: ${testPayment.id}`);
        matchedOrder = await Order.findOne({ 
          razorpay_payment_id: testPayment.id 
        }).populate('user_id', 'name email phone');
        
        if (matchedOrder) {
          console.log(`✅ FOUND by razorpay_payment_id!`);
          console.log(`   Order: ${matchedOrder._id}`);
          console.log(`   User: ${matchedOrder.user_id?.name}`);
        } else {
          console.log(`❌ NOT FOUND by razorpay_payment_id`);
        }
      }
      
      if (!matchedOrder) {
        console.log(`\n⚠️  NO MATCH FOUND for payment ${testPayment.id}`);
        console.log(`This explains why you're seeing "Unknown User" in the reports`);
        
        // Check if there are any orders with similar amounts
        const similarAmountOrders = await Order.find({
          totalAmount: (testPayment.amount / 100),
          createdAt: {
            $gte: new Date(testPayment.created_at * 1000 - 24 * 60 * 60 * 1000), // 1 day before
            $lte: new Date(testPayment.created_at * 1000 + 24 * 60 * 60 * 1000)   // 1 day after
          }
        }).populate('user_id', 'name email phone');
        
        if (similarAmountOrders.length > 0) {
          console.log(`\n💡 Found ${similarAmountOrders.length} orders with similar amount and date:`);
          similarAmountOrders.forEach((order, idx) => {
            console.log(`   ${idx + 1}. Order ${order._id} - ${order.user_id?.name} - ₹${order.totalAmount}`);
            console.log(`      Razorpay Order ID: ${order.razorpay_order_id || 'Missing'}`);
            console.log(`      Razorpay Payment ID: ${order.razorpay_payment_id || 'Missing'}`);
          });
        }
      }
    }
    
    // 4. Check for data inconsistencies
    console.log('\n\n4️⃣ CHECKING FOR DATA INCONSISTENCIES:');
    
    const ordersWithoutRazorpayData = await Order.find({
      status: 'completed',
      $and: [
        { razorpay_order_id: { $in: [null, ''] } },
        { razorpay_payment_id: { $in: [null, ''] } }
      ]
    }).populate('user_id', 'name email phone').limit(5);
    
    if (ordersWithoutRazorpayData.length > 0) {
      console.log(`⚠️  Found ${ordersWithoutRazorpayData.length} completed orders WITHOUT Razorpay data:`);
      ordersWithoutRazorpayData.forEach((order, idx) => {
        console.log(`   ${idx + 1}. Order ${order._id} - ${order.user_id?.name} - ₹${order.totalAmount}`);
        console.log(`      Status: ${order.status} (but no Razorpay IDs)`);
      });
    }
    
    console.log('\n✅ DEBUG COMPLETED');
    console.log('\n📋 SUMMARY:');
    console.log(`• Razorpay payments found: ${razorpayPayments.items.length}`);
    console.log(`• Database orders with Razorpay data: ${dbOrders.length}`);
    console.log(`• Completed orders without Razorpay data: ${ordersWithoutRazorpayData.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

debugRazorpayOrderMatching();