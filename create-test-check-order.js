// Test script to create a sample check payment order
// Run this with: node create-test-check-order.js

const mongoose = require('mongoose');
require('dotenv').config();

// Import your models
const Order = require('./models/Order');
const User = require('./models/User');

async function createTestCheckOrder() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to database');

        // Find an admin user (or create one)
        let testUser = await User.findOne({ email: 'test@example.com' });
        if (!testUser) {
            testUser = await User.create({
                name: 'Test User',
                email: 'test@example.com',
                phone: '9876543210',
                password: 'hashedpassword', // This won't be used
                role: 'user'
            });
            console.log('✅ Created test user');
        }

        // Create a test check payment order
        const testOrder = await Order.create({
            user_id: testUser._id,
            items: [{
                id: 'test-book-123',
                title: 'Test Book',
                author: 'Test Author',
                price: 599,
                quantity: 1,
                coverImage: 'https://via.placeholder.com/150',
                type: 'book'
            }],
            totalAmount: 599,
            courierCharge: 0,
            totalWeight: 0.5,
            deliveryMethod: 'home',
            deliveryAddress: {
                street: '123 Test Street',
                taluk: 'Test Taluk',
                district: 'Test District',
                state: 'Test State',
                pincode: '123456',
                phone: '9876543210'
            },
            status: 'pending_payment_verification',
            paymentType: 'check',
            paymentDetails: {
                type: 'check',
                status: 'pending_verification',
                checkNumber: 'TEST123456',
                bankName: 'Test Bank',
                checkDate: new Date(),
                utrNumber: 'TEST_UTR_789',
                googleFormSubmissionId: 'test_response_123',
                checkImageUrl: 'https://via.placeholder.com/300x200?text=Test+Check+Image',
                checkImageDriveId: 'test_drive_file_id',
                driveFileIds: ['test_drive_file_id'],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            rewardApplied: false
        });

        console.log('✅ Created test check payment order:', testOrder._id);
        console.log('📋 Order details:');
        console.log('   - Order ID:', testOrder._id);
        console.log('   - User:', testUser.name, '(' + testUser.email + ')');
        console.log('   - Amount: ₹' + testOrder.totalAmount);
        console.log('   - Status:', testOrder.status);
        console.log('   - Payment Type:', testOrder.paymentType);
        console.log('   - Check Number:', testOrder.paymentDetails.checkNumber);

        console.log('\n🎯 Now check your admin panel at: /admin-check-payments.html');

    } catch (error) {
        console.error('❌ Error creating test order:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from database');
    }
}

createTestCheckOrder();