// Comprehensive webhook diagnostic script
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGO_URI);

const Order = require('./models/Order');
const User = require('./models/User');

async function diagnoseWebhookIssues() {
    console.log('=== WEBHOOK DIAGNOSTIC REPORT ===\n');
    
    try {
        // 1. Check recent orders with pending status
        console.log('1. CHECKING RECENT PENDING ORDERS...');
        const pendingOrders = await Order.find({ 
            status: 'pending',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }).sort({ createdAt: -1 }).limit(10);
        
        console.log(`Found ${pendingOrders.length} pending orders in last 7 days:`);
        pendingOrders.forEach(order => {
            console.log(`- Order ${order._id}: ₹${order.totalAmount}, Created: ${order.createdAt}, Razorpay Order: ${order.razorpay_order_id}`);
        });
        
        // 2. Check orders with Razorpay order ID but no payment ID
        console.log('\n2. CHECKING ORDERS WITH RAZORPAY ORDER ID BUT NO PAYMENT ID...');
        const ordersWithoutPaymentId = await Order.find({
            razorpay_order_id: { $exists: true, $ne: null },
            razorpay_payment_id: { $exists: false },
            status: 'pending'
        }).sort({ createdAt: -1 }).limit(10);
        
        console.log(`Found ${ordersWithoutPaymentId.length} orders with Razorpay order ID but no payment ID:`);
        ordersWithoutPaymentId.forEach(order => {
            console.log(`- Order ${order._id}: ₹${order.totalAmount}, Razorpay Order: ${order.razorpay_order_id}, Status: ${order.status}`);
        });
        
        // 3. Check completed orders to see webhook processing
        console.log('\n3. CHECKING RECENT COMPLETED ORDERS...');
        const completedOrders = await Order.find({ 
            status: 'completed',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 }).limit(5);
        
        console.log(`Found ${completedOrders.length} completed orders in last 7 days:`);
        completedOrders.forEach(order => {
            console.log(`- Order ${order._id}: ₹${order.totalAmount}, Payment ID: ${order.razorpay_payment_id}, Rewards Applied: ${order.rewardApplied}`);
        });
        
        // 4. Environment check
        console.log('\n4. ENVIRONMENT CONFIGURATION CHECK...');
        console.log(`- Razorpay Key ID: ${process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing'}`);
        console.log(`- Razorpay Key Secret: ${process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing'}`);
        console.log(`- Webhook Secret: ${process.env.RAZORPAY_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing'}`);
        console.log(`- Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
        
        // 5. Webhook URL check
        console.log('\n5. WEBHOOK CONFIGURATION...');
        console.log(`Expected Webhook URL: ${process.env.FRONTEND_URL}/api/payments/webhook`);
        console.log(`Webhook Secret: ${process.env.RAZORPAY_WEBHOOK_SECRET}`);
        console.log('Required Events: payment.captured, payment.failed');
        
        // 6. Recommendations
        console.log('\n6. RECOMMENDATIONS...');
        
        if (pendingOrders.length > 0) {
            console.log('❌ ISSUE DETECTED: You have pending orders that may need webhook processing');
            console.log('   → Check Razorpay dashboard for webhook delivery status');
            console.log('   → Verify webhook URL is accessible from internet');
            console.log('   → Check server logs for webhook calls');
        }
        
        if (ordersWithoutPaymentId.length > 0) {
            console.log('❌ ISSUE DETECTED: Orders created but payments not captured');
            console.log('   → These orders likely had successful payments but webhook failed');
            console.log('   → Check Razorpay dashboard for actual payment status');
            console.log('   → Consider manual verification for these orders');
        }
        
        console.log('\n7. WEBHOOK TESTING STEPS...');
        console.log('1. Go to Razorpay Dashboard → Settings → Webhooks');
        console.log('2. Verify webhook URL: https://shreemata.com/api/payments/webhook');
        console.log('3. Check webhook secret matches: Shashi@2003');
        console.log('4. Ensure events are enabled: payment.captured, payment.failed');
        console.log('5. Test webhook using Razorpay webhook tester');
        console.log('6. Check webhook delivery logs in Razorpay dashboard');
        
        // 7. Create a test webhook call script
        console.log('\n8. MANUAL WEBHOOK TEST...');
        console.log('You can test webhook manually by running:');
        console.log('curl -X POST https://shreemata.com/api/payments/webhook \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -H "x-razorpay-signature: test_signature" \\');
        console.log('  -d \'{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test","order_id":"order_test"}}}}\'');
        
    } catch (error) {
        console.error('Diagnostic error:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run diagnostic
diagnoseWebhookIssues();