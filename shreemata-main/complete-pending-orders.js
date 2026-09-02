// Complete pending orders that should have been processed by webhook
require('dotenv').config();

const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');
const { distributeCommissions } = require('./services/commissionDistribution');
const { awardPoints } = require('./services/pointsService');
const { sendOrderConfirmationEmail, sendAdminNotification } = require('./utils/emailService');
const Book = require('./models/Book');
const Bundle = require('./models/Bundle');

mongoose.connect(process.env.MONGO_URI);

async function completePendingOrders() {
  try {
    console.log('🔧 COMPLETING PENDING ORDERS\n');
    
    // Find pending orders that are likely paid but not confirmed
    const pendingOrders = await Order.find({ 
      status: 'pending',
      razorpay_order_id: { $exists: true },
      rewardApplied: false,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).sort({ createdAt: -1 });
    
    if (pendingOrders.length === 0) {
      console.log('✅ No pending orders found to process');
      return;
    }
    
    console.log(`📦 Found ${pendingOrders.length} pending orders to process:\n`);
    
    for (let i = 0; i < pendingOrders.length; i++) {
      const order = pendingOrders[i];
      const timeDiff = Math.round((Date.now() - order.createdAt) / (1000 * 60));
      
      console.log(`${i + 1}. Processing Order ${order._id}`);
      console.log(`   - Razorpay Order ID: ${order.razorpay_order_id}`);
      console.log(`   - Amount: ₹${order.totalAmount}`);
      console.log(`   - Created: ${timeDiff} minutes ago`);
      
      try {
        // Update order status
        order.status = 'completed';
        order.razorpay_payment_id = 'manual_completion_' + Date.now();
        order.rewardApplied = true;
        await order.save();
        
        console.log('   ✅ Order marked as completed');
        
        // Apply commissions
        try {
          const commissionTransaction = await distributeCommissions(
            order._id,
            order.user_id,
            order.totalAmount
          );
          console.log(`   ✅ Commissions distributed: ${commissionTransaction._id}`);
        } catch (commissionError) {
          console.log(`   ❌ Commission error: ${commissionError.message}`);
        }
        
        // Award points
        try {
          for (const item of order.items) {
            let points = 0;
            
            if (item.type === 'book') {
              const book = await Book.findById(item.id);
              if (book && book.rewardPoints > 0) {
                points = book.rewardPoints * item.quantity;
              }
            } else if (item.type === 'bundle') {
              const bundle = await Bundle.findById(item.id);
              if (bundle && bundle.rewardPoints > 0) {
                points = bundle.rewardPoints * item.quantity;
              }
            }
            
            if (points > 0) {
              await awardPoints(
                order.user_id,
                points,
                item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
                item.id,
                order._id
              );
              console.log(`   ✅ Awarded ${points} points for ${item.title}`);
            }
          }
        } catch (pointsError) {
          console.log(`   ❌ Points error: ${pointsError.message}`);
        }
        
        // Award cashback
        try {
          let totalCashback = 0;
          
          for (const item of order.items) {
            let itemCashback = 0;
            
            if (item.type === 'book') {
              const book = await Book.findById(item.id);
              if (book) {
                const bookCashback = book.getCashbackAmount();
                itemCashback = bookCashback * item.quantity;
              }
            } else if (item.type === 'bundle') {
              const bundle = await Bundle.findById(item.id);
              if (bundle) {
                const bundleCashback = bundle.getCashbackAmount();
                itemCashback = bundleCashback * item.quantity;
              }
            }
            
            if (itemCashback > 0) {
              totalCashback += itemCashback;
            }
          }
          
          if (totalCashback > 0) {
            const user = await User.findById(order.user_id);
            if (user) {
              const previousBalance = user.wallet || 0;
              user.wallet = previousBalance + totalCashback;
              await user.save();
              console.log(`   ✅ Added ₹${totalCashback.toFixed(2)} cashback to wallet`);
            }
          }
        } catch (cashbackError) {
          console.log(`   ❌ Cashback error: ${cashbackError.message}`);
        }
        
        // Send email notifications
        try {
          const user = await User.findById(order.user_id);
          if (user && user.email) {
            await sendOrderConfirmationEmail(order, user);
            await sendAdminNotification(order, user);
            console.log(`   ✅ Email notifications sent to ${user.email}`);
          }
        } catch (emailError) {
          console.log(`   ❌ Email error: ${emailError.message}`);
        }
        
        // Mark user's first purchase as done
        try {
          const user = await User.findById(order.user_id);
          if (user && !user.firstPurchaseDone) {
            user.firstPurchaseDone = true;
            user.firstPurchaseDate = new Date();
            await user.save();
            console.log(`   ✅ Marked first purchase as done for user at ${user.firstPurchaseDate}`);
          }
        } catch (userError) {
          console.log(`   ❌ User update error: ${userError.message}`);
        }
        
        console.log(`   🎉 Order ${order._id} completed successfully!\n`);
        
      } catch (orderError) {
        console.log(`   ❌ Error processing order: ${orderError.message}\n`);
      }
    }
    
    console.log('🎯 SUMMARY:');
    console.log(`   Processed: ${pendingOrders.length} orders`);
    console.log('   All pending orders have been completed');
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Configure Razorpay webhook to prevent future issues');
    console.log('   2. Follow the RAZORPAY_WEBHOOK_SETUP_GUIDE.md');
    console.log('   3. Test with a new payment to verify webhook works');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

completePendingOrders();