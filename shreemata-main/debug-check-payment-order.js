/**
 * Debug script to check what's actually saved in the database for check payment orders
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Order = require('./models/Order');

async function debugCheckPaymentOrder() {
  try {
    console.log('🔍 Debugging check payment orders...');

    // Find the most recent check payment order
    const recentOrder = await Order.findOne({
      paymentType: 'check'
    }).sort({ createdAt: -1 });

    if (!recentOrder) {
      console.log('❌ No check payment orders found');
      return;
    }

    console.log('\n📋 Most Recent Check Payment Order:');
    console.log('Order ID:', recentOrder._id);
    console.log('User ID:', recentOrder.user_id);
    console.log('Total Amount:', recentOrder.totalAmount);
    console.log('Status:', recentOrder.status);
    console.log('Payment Type:', recentOrder.paymentType);

    console.log('\n💳 Payment Details:');
    console.log(JSON.stringify(recentOrder.paymentDetails, null, 2));

    // Check specifically for image fields
    console.log('\n🖼️ Image Field Analysis:');
    console.log('checkImageUrl exists:', !!recentOrder.paymentDetails?.checkImageUrl);
    console.log('checkImageUrl value:', recentOrder.paymentDetails?.checkImageUrl);
    console.log('checkImageDriveId exists:', !!recentOrder.paymentDetails?.checkImageDriveId);
    console.log('checkImageDriveId value:', recentOrder.paymentDetails?.checkImageDriveId);
    console.log('driveFileIds exists:', !!recentOrder.paymentDetails?.driveFileIds);
    console.log('driveFileIds value:', recentOrder.paymentDetails?.driveFileIds);

    // Test the condition used in admin panel
    const hasImages = recentOrder.paymentDetails?.checkImageUrl || recentOrder.paymentDetails?.checkImageDriveId;
    console.log('\n🔍 Admin Panel Condition Test:');
    console.log('hasImages (checkImageUrl || checkImageDriveId):', hasImages);

    // Find all check payment orders for comparison
    const allCheckOrders = await Order.find({
      paymentType: 'check'
    }).sort({ createdAt: -1 }).limit(5);

    console.log(`\n📊 Found ${allCheckOrders.length} check payment orders:`);
    allCheckOrders.forEach((order, index) => {
      console.log(`${index + 1}. Order ${order._id}:`);
      console.log(`   Status: ${order.paymentDetails?.status || 'no status'}`);
      console.log(`   Has checkImageUrl: ${!!order.paymentDetails?.checkImageUrl}`);
      console.log(`   Has driveFileIds: ${!!order.paymentDetails?.driveFileIds?.length}`);
      console.log(`   Updated: ${order.paymentDetails?.updatedAt || 'never'}`);
    });

  } catch (error) {
    console.error('❌ Error debugging orders:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the debug function
debugCheckPaymentOrder();