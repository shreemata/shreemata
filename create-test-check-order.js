/**
 * Create a test check payment order and get the Google Form URL
 * This will generate a real order ID for testing
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Order = require('./models/Order');
const User = require('./models/User');

async function createTestCheckOrder() {
  try {
    console.log('🔧 Creating test check payment order...');

    // Find admin user (or create a test user)
    let testUser = await User.findOne({ email: 'shashistudy2125@gmail.com' });
    
    if (!testUser) {
      console.log('❌ Admin user not found. Please use a valid user email.');
      process.exit(1);
    }

    console.log('✅ Found user:', testUser.name, testUser.email);

    // Create test order data
    const testOrderData = {
      user_id: testUser._id,
      items: [
        {
          id: '507f1f77bcf86cd799439011', // Dummy book ID
          title: 'Test Book for Check Payment',
          author: 'Test Author',
          price: 599,
          quantity: 1,
          coverImage: 'test-cover.jpg',
          type: 'book',
          isDigital: false
        }
      ],
      totalAmount: 599,
      courierCharge: 50,
      totalWeight: 0.5,
      deliveryMethod: 'home',
      deliveryAddress: {
        homeAddress1: 'Test Address',
        taluk: 'Test Taluk',
        district: 'Test District',
        state: 'Test State',
        pincode: '560001',
        phone: '9449171605'
      },
      status: 'pending_payment_verification',
      paymentType: 'check',
      paymentDetails: {
        type: 'check',
        status: 'awaiting_upload',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      rewardApplied: false
    };

    // Create the order
    const testOrder = await Order.create(testOrderData);
    
    console.log('✅ Test order created successfully!');
    console.log('📋 Order ID:', testOrder._id);
    console.log('💰 Amount:', testOrder.totalAmount);

    // Generate Google Form URL with real order ID
    const googleFormUrl = `https://docs.google.com/forms/d/e/1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg/viewform?usp=pp_url` +
      `&entry.1788264298=${testOrder._id}` +
      `&entry.1894225499=${testOrder.totalAmount}` +
      `&entry.774046160=${encodeURIComponent(testUser.email)}` +
      `&entry.1406386079=${encodeURIComponent(testUser.name)}` +
      `&entry.632794616=${encodeURIComponent(testUser.phone || '9449171605')}` +
      `&entry.980862279=${encodeURIComponent('SBI')}` +
      `&entry.790413540=${new Date().toISOString().split('T')[0]}`;

    console.log('\n🔗 GOOGLE FORM URL (with real Order ID):');
    console.log(googleFormUrl);

    console.log('\n📋 Test Instructions:');
    console.log('1. Copy the Google Form URL above');
    console.log('2. Open it in your browser');
    console.log('3. You should see the form pre-filled with:');
    console.log(`   - Order ID: ${testOrder._id}`);
    console.log(`   - Amount: ${testOrder.totalAmount}`);
    console.log(`   - Email: ${testUser.email}`);
    console.log(`   - Name: ${testUser.name}`);
    console.log('4. Upload a test image');
    console.log('5. Submit the form');
    console.log('6. Check your server logs for webhook data');

    console.log('\n🔍 To check if the order was updated:');
    console.log(`   - Go to admin panel: https://shreemata.com/admin-check-payments.html`);
    console.log(`   - Look for order ID: ${testOrder._id}`);

  } catch (error) {
    console.error('❌ Error creating test order:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the function
createTestCheckOrder();