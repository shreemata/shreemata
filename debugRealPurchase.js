/**
 * Debug script to check what happens during a real purchase
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');
const { distributeCommissions } = require('./services/commissionDistribution');

async function debugRealPurchase() {
  try {
    console.log('🔍 Debug: Checking real purchase flow');
    
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📡 Connected to MongoDB');
    
    // Find a user who hasn't made a purchase
    const testUser = await User.findOne({ firstPurchaseDone: false });
    
    if (!testUser) {
      console.log('❌ No users found who haven\'t made purchases');
      return;
    }
    
    console.log('\n📊 User before purchase:');
    console.log(`   Name: ${testUser.name}`);
    console.log(`   Email: ${testUser.email}`);
    console.log(`   First Purchase Done: ${testUser.firstPurchaseDone}`);
    console.log(`   Tree Level: ${testUser.treeLevel}`);
    console.log(`   Tree Parent: ${testUser.treeParent}`);
    console.log(`   Referred By: ${testUser.referredBy || 'None'}`);
    
    // Create a fake order to simulate the payment flow
    const fakeOrder = await Order.create({
      user_id: testUser._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        title: 'Test Book',
        price: 100,
        quantity: 1,
        type: 'book'
      }],
      totalAmount: 100,
      status: 'completed',
      rewardApplied: false
    });
    
    console.log('\n💰 Simulating payment verification flow...');
    console.log(`   Created order: ${fakeOrder._id}`);
    
    // Simulate the exact payment verification flow
    try {
      console.log("💰 Distributing commissions for order:", fakeOrder._id);
      const commissionTransaction = await distributeCommissions(
        fakeOrder._id,
        fakeOrder.user_id,
        fakeOrder.totalAmount
      );
      console.log("✅ Commission distribution completed:", commissionTransaction._id);
      
      // Mark user's first purchase as done after successful commission distribution
      const user = await User.findById(fakeOrder.user_id);
      if (user && !user.firstPurchaseDone) {
        user.firstPurchaseDone = true;
        await user.save();
        console.log(`✅ Marked first purchase as done for user: ${user.email}`);
      }
      
      // Check user after the flow
      const updatedUser = await User.findById(testUser._id);
      
      console.log('\n📊 User after purchase flow:');
      console.log(`   Name: ${updatedUser.name}`);
      console.log(`   Email: ${updatedUser.email}`);
      console.log(`   First Purchase Done: ${updatedUser.firstPurchaseDone}`);
      console.log(`   Tree Level: ${updatedUser.treeLevel}`);
      console.log(`   Tree Parent: ${updatedUser.treeParent}`);
      console.log(`   Tree Position: ${updatedUser.treePosition}`);
      console.log(`   Tree Children: ${updatedUser.treeChildren.length}`);
      console.log(`   Wallet: ₹${updatedUser.wallet}`);
      
      if (updatedUser.treeLevel > 0) {
        console.log('\n✅ SUCCESS: Tree placement created during real purchase flow!');
      } else {
        console.log('\n❌ ISSUE: Tree placement NOT created during real purchase flow');
        console.log('   This indicates an issue with the commission distribution logic');
      }
      
    } catch (commissionError) {
      console.error('❌ Commission distribution failed:', commissionError);
      console.error('Error details:', commissionError.stack);
    }
    
    // Clean up - delete the fake order
    await Order.findByIdAndDelete(fakeOrder._id);
    console.log('\n🧹 Cleaned up fake order');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Error stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

// Run debug
debugRealPurchase();