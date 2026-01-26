// Test the enhanced Razorpay reports API
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

async function testEnhancedRazorpayReports() {
  try {
    console.log('🧪 TESTING ENHANCED RAZORPAY REPORTS API\n');
    
    // Simulate the API call with recent date range
    const fromDate = '2026-01-19'; // Recent date with known payments
    const toDate = '2026-01-21';
    const status = 'captured';
    const count = 10;
    const skip = 0;
    
    console.log(`📅 Testing with date range: ${fromDate} to ${toDate}`);
    console.log(`🔍 Status filter: ${status}`);
    
    // Build Razorpay API options (same as in the API)
    const options = {
      count: Math.min(parseInt(count), 100),
      skip: parseInt(skip),
      from: Math.floor(new Date(fromDate).getTime() / 1000),
      to: Math.floor(new Date(toDate + 'T23:59:59').getTime() / 1000)
    };
    
    console.log('\n1️⃣ FETCHING PAYMENTS FROM RAZORPAY:');
    const payments = await razorpay.payments.all(options);
    console.log(`Found ${payments.items.length} total payments`);
    
    // Filter by status
    let filteredPayments = payments.items;
    if (status && status !== 'all') {
      filteredPayments = payments.items.filter(payment => payment.status === status);
    }
    console.log(`Found ${filteredPayments.length} ${status} payments`);
    
    // Enhance payments (same logic as API)
    console.log('\n2️⃣ ENHANCING PAYMENTS WITH USER DATA:');
    
    const enhancedPayments = await Promise.all(
      filteredPayments.map(async (payment, index) => {
        console.log(`\n${index + 1}. Processing payment: ${payment.id}`);
        console.log(`   Order ID: ${payment.order_id || 'None'}`);
        console.log(`   Amount: ₹${(payment.amount / 100).toFixed(2)}`);
        console.log(`   Email: ${payment.email || 'None'}`);
        
        try {
          let order = null;
          let matchMethod = 'none';
          
          // Method 1: Search by razorpay_order_id
          if (payment.order_id) {
            console.log(`   🔍 Searching by order_id: ${payment.order_id}`);
            order = await Order.findOne({ razorpay_order_id: payment.order_id }).populate('user_id', 'name email phone');
            if (order) {
              matchMethod = 'order_id';
              console.log(`   ✅ Found by order_id!`);
            }
          }
          
          // Method 2: Search by razorpay_payment_id
          if (!order && payment.id) {
            console.log(`   🔍 Searching by payment_id: ${payment.id}`);
            order = await Order.findOne({ razorpay_payment_id: payment.id }).populate('user_id', 'name email phone');
            if (order) {
              matchMethod = 'payment_id';
              console.log(`   ✅ Found by payment_id!`);
            }
          }
          
          // Method 3: Search by email and amount
          if (!order && payment.email && payment.amount) {
            console.log(`   🔍 Searching by email and amount...`);
            const paymentAmount = payment.amount / 100;
            const paymentDate = new Date(payment.created_at * 1000);
            
            const potentialOrders = await Order.find({
              totalAmount: paymentAmount,
              createdAt: {
                $gte: new Date(paymentDate.getTime() - 24 * 60 * 60 * 1000),
                $lte: new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000)
              }
            }).populate('user_id', 'name email phone');
            
            order = potentialOrders.find(o => 
              o.user_id?.email?.toLowerCase() === payment.email?.toLowerCase()
            );
            
            if (order) {
              matchMethod = 'email_match';
              console.log(`   ✅ Found by email match!`);
            }
          }
          
          if (order) {
            console.log(`   👤 User: ${order.user_id?.name}`);
            console.log(`   📧 Email: ${order.user_id?.email}`);
            console.log(`   📱 Phone: ${order.user_id?.phone}`);
            console.log(`   🔗 Match method: ${matchMethod}`);
          } else {
            console.log(`   ❌ No order found - will show as "Unknown User"`);
          }

          const enhancedPayment = {
            ...payment,
            user_name: order?.user_id?.name || 'Unknown User',
            user_email: order?.user_id?.email || payment.email || 'No Email',
            user_phone: order?.user_id?.phone || payment.contact || 'No Phone',
            order_found: !!order,
            db_order_id: order?._id || null,
            match_method: matchMethod
          };

          return enhancedPayment;
        } catch (error) {
          console.error(`   ❌ Error enhancing payment:`, error.message);
          return {
            ...payment,
            user_name: 'Error Loading',
            user_email: payment.email || 'No Email',
            user_phone: payment.contact || 'No Phone',
            order_found: false,
            db_order_id: null,
            match_method: 'error'
          };
        }
      })
    );
    
    console.log('\n3️⃣ ENHANCED PAYMENTS SUMMARY:');
    
    let foundCount = 0;
    let unknownCount = 0;
    
    enhancedPayments.forEach((payment, index) => {
      const status = payment.order_found ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${payment.user_name} - ${payment.user_email} - ₹${(payment.amount / 100).toFixed(2)}`);
      
      if (payment.order_found) {
        foundCount++;
      } else {
        unknownCount++;
      }
    });
    
    console.log(`\n📊 RESULTS:`);
    console.log(`✅ Orders found: ${foundCount}`);
    console.log(`❌ Unknown users: ${unknownCount}`);
    console.log(`📈 Success rate: ${((foundCount / enhancedPayments.length) * 100).toFixed(1)}%`);
    
    if (unknownCount > 0) {
      console.log('\n⚠️  UNKNOWN USERS ANALYSIS:');
      const unknownPayments = enhancedPayments.filter(p => !p.order_found);
      
      for (const payment of unknownPayments) {
        console.log(`\n❌ Unknown: ${payment.id}`);
        console.log(`   Amount: ₹${(payment.amount / 100).toFixed(2)}`);
        console.log(`   Email: ${payment.email || 'None'}`);
        console.log(`   Date: ${new Date(payment.created_at * 1000).toLocaleString()}`);
        
        // Check if there are any orders with similar characteristics
        if (payment.email) {
          const userWithEmail = await User.findOne({ 
            email: { $regex: new RegExp(payment.email, 'i') }
          });
          if (userWithEmail) {
            console.log(`   💡 Found user with this email: ${userWithEmail.name}`);
            
            const userOrders = await Order.find({ user_id: userWithEmail._id }).sort({ createdAt: -1 }).limit(3);
            if (userOrders.length > 0) {
              console.log(`   📦 Recent orders from this user:`);
              userOrders.forEach((order, idx) => {
                console.log(`      ${idx + 1}. ₹${order.totalAmount} - ${order.status} - ${order.createdAt.toLocaleDateString()}`);
              });
            }
          }
        }
      }
    }
    
    console.log('\n✅ TEST COMPLETED');
    
    if (foundCount === enhancedPayments.length) {
      console.log('🎉 PERFECT! All payments matched with users.');
      console.log('The Razorpay reports should now show all user names and emails correctly.');
    } else {
      console.log('⚠️  Some payments show as "Unknown User" - this could be due to:');
      console.log('• Older payments before your system was fully integrated');
      console.log('• Test payments or payments from external sources');
      console.log('• Webhook processing delays or failures');
      console.log('• Different email addresses used in Razorpay vs your system');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

testEnhancedRazorpayReports();