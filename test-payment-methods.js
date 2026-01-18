require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');

async function testPaymentMethods() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get all orders and check their payment methods
    const orders = await Order.find({})
      .populate('user_id', 'name email')
      .select('_id user_id totalAmount paymentType status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);
    
    console.log('📋 Recent Orders with Payment Methods:');
    console.log('='.repeat(80));
    
    if (orders.length === 0) {
      console.log('No orders found');
      return;
    }
    
    orders.forEach((order, index) => {
      const paymentMethod = order.paymentType || 'online';
      let methodDisplay = '';
      
      switch (paymentMethod.toLowerCase()) {
        case 'check':
        case 'cheque':
          methodDisplay = '📝 Cheque';
          break;
        case 'transfer':
          methodDisplay = '🏦 Bank Transfer';
          break;
        case 'online':
        default:
          methodDisplay = '💳 Online Payment';
          break;
      }
      
      console.log(`${index + 1}. ${order.user_id?.name || 'Unknown'}`);
      console.log(`   Order ID: ${order._id}`);
      console.log(`   Amount: ₹${order.totalAmount}`);
      console.log(`   Payment Method: ${methodDisplay} (${paymentMethod})`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Date: ${new Date(order.createdAt).toLocaleDateString()}`);
      console.log('');
    });
    
    // Count payment methods
    const allOrders = await Order.find({}).select('paymentType');
    const paymentMethodCounts = {
      online: 0,
      cheque: 0,
      transfer: 0,
      undefined: 0
    };
    
    allOrders.forEach(order => {
      const method = order.paymentType || 'online';
      if (method === 'check' || method === 'cheque') {
        paymentMethodCounts.cheque++;
      } else if (method === 'transfer') {
        paymentMethodCounts.transfer++;
      } else if (method === 'online') {
        paymentMethodCounts.online++;
      } else {
        paymentMethodCounts.undefined++;
      }
    });
    
    console.log('📊 Payment Method Summary:');
    console.log('='.repeat(40));
    console.log(`💳 Online Payments: ${paymentMethodCounts.online}`);
    console.log(`📝 Cheque Payments: ${paymentMethodCounts.cheque}`);
    console.log(`🏦 Bank Transfers: ${paymentMethodCounts.transfer}`);
    console.log(`❓ Undefined: ${paymentMethodCounts.undefined}`);
    console.log(`📈 Total Orders: ${allOrders.length}`);
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testPaymentMethods();