// Fix Razorpay matching issues by updating pending orders
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

async function fixRazorpayMatchingIssue() {
  try {
    console.log('🔧 FIXING RAZORPAY MATCHING ISSUES\n');
    
    // Get recent captured payments from Razorpay
    console.log('1️⃣ FETCHING RECENT CAPTURED PAYMENTS FROM RAZORPAY:');
    const razorpayPayments = await razorpay.payments.all({
      count: 20,
      from: Math.floor(new Date('2026-01-18').getTime() / 1000), // From Jan 18, 2026
      to: Math.floor(new Date().getTime() / 1000)
    });
    
    const capturedPayments = razorpayPayments.items.filter(p => p.status === 'captured');
    console.log(`Found ${capturedPayments.length} captured payments in Razorpay`);
    
    // Check each captured payment against database
    console.log('\n2️⃣ CHECKING EACH PAYMENT AGAINST DATABASE:');
    
    let matchedCount = 0;
    let unmatchedCount = 0;
    let updatedCount = 0;
    
    for (const payment of capturedPayments) {
      console.log(`\n🔍 Checking payment: ${payment.id}`);
      console.log(`   Order ID: ${payment.order_id}`);
      console.log(`   Amount: ₹${(payment.amount / 100).toFixed(2)}`);
      console.log(`   Email: ${payment.email}`);
      
      // Try to find matching order
      let order = null;
      if (payment.order_id) {
        order = await Order.findOne({ razorpay_order_id: payment.order_id }).populate('user_id', 'name email phone');
      }
      
      if (order) {
        console.log(`   ✅ MATCHED with order: ${order._id}`);
        console.log(`   User: ${order.user_id?.name}`);
        console.log(`   DB Status: ${order.status}`);
        console.log(`   DB Payment ID: ${order.razorpay_payment_id || 'None'}`);
        
        matchedCount++;
        
        // Update order if it's still pending but payment is captured
        if (order.status === 'pending' && !order.razorpay_payment_id) {
          console.log(`   🔄 UPDATING pending order to completed...`);
          
          order.status = 'completed';
          order.razorpay_payment_id = payment.id;
          order.rewardApplied = true; // Mark as processed
          await order.save();
          
          console.log(`   ✅ Order updated to completed!`);
          updatedCount++;
        }
      } else {
        console.log(`   ❌ NO MATCH FOUND`);
        unmatchedCount++;
        
        // Try to find by amount and email
        const potentialMatches = await Order.find({
          totalAmount: (payment.amount / 100),
          createdAt: {
            $gte: new Date(payment.created_at * 1000 - 2 * 60 * 60 * 1000), // 2 hours before
            $lte: new Date(payment.created_at * 1000 + 2 * 60 * 60 * 1000)   // 2 hours after
          }
        }).populate('user_id', 'name email phone');
        
        if (potentialMatches.length > 0) {
          console.log(`   💡 Potential matches by amount and time:`);
          potentialMatches.forEach((match, idx) => {
            const emailMatch = match.user_id?.email?.toLowerCase() === payment.email?.toLowerCase();
            console.log(`      ${idx + 1}. Order ${match._id} - ${match.user_id?.name}`);
            console.log(`         Email: ${match.user_id?.email} ${emailMatch ? '✅' : '❌'}`);
            console.log(`         Status: ${match.status}`);
            console.log(`         Razorpay Order ID: ${match.razorpay_order_id || 'Missing'}`);
          });
        }
      }
    }
    
    console.log('\n3️⃣ SUMMARY:');
    console.log(`✅ Matched payments: ${matchedCount}`);
    console.log(`❌ Unmatched payments: ${unmatchedCount}`);
    console.log(`🔄 Updated orders: ${updatedCount}`);
    
    // Now test the enhanced API
    console.log('\n4️⃣ TESTING ENHANCED API LOGIC:');
    
    if (capturedPayments.length > 0) {
      const testPayment = capturedPayments[0];
      console.log(`\nTesting enhancement for payment: ${testPayment.id}`);
      
      // Simulate the enhancement logic from the API
      let order = null;
      if (testPayment.order_id) {
        order = await Order.findOne({ razorpay_order_id: testPayment.order_id }).populate('user_id', 'name email phone');
      }
      if (!order && testPayment.id) {
        order = await Order.findOne({ razorpay_payment_id: testPayment.id }).populate('user_id', 'name email phone');
      }

      const enhancedPayment = {
        ...testPayment,
        user_name: order?.user_id?.name || 'Unknown User',
        user_email: order?.user_id?.email || testPayment.email || 'No Email',
        user_phone: order?.user_id?.phone || testPayment.contact || 'No Phone',
        order_found: !!order,
        db_order_id: order?._id || null
      };

      console.log('\n📊 ENHANCED PAYMENT DATA:');
      console.log(`   Payment ID: ${enhancedPayment.id}`);
      console.log(`   Order Found: ${enhancedPayment.order_found ? '✅ Yes' : '❌ No'}`);
      console.log(`   User Name: ${enhancedPayment.user_name}`);
      console.log(`   User Email: ${enhancedPayment.user_email}`);
      console.log(`   User Phone: ${enhancedPayment.user_phone}`);
      
      if (enhancedPayment.order_found) {
        console.log(`   ✅ This payment will show user data in reports`);
      } else {
        console.log(`   ⚠️  This payment will show "Unknown User" in reports`);
      }
    }
    
    console.log('\n✅ FIXING COMPLETED');
    
    if (updatedCount > 0) {
      console.log(`\n🎉 SUCCESS: Updated ${updatedCount} pending orders to completed!`);
      console.log('These orders should now show proper user data in Razorpay reports.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

fixRazorpayMatchingIssue();