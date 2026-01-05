/**
 * Debug script to test tree creation on purchase
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { distributeCommissions } = require('./services/commissionDistribution');

async function debugTreeCreation() {
  try {
    console.log('🔍 Debug: Testing tree creation on purchase');
    
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📡 Connected to MongoDB');
    
    // Find a user who hasn't made a purchase
    const testUser = await User.findOne({ firstPurchaseDone: false });
    
    if (!testUser) {
      console.log('❌ No users found who haven\'t made purchases');
      console.log('Creating a test user...');
      
      const newUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        referralCode: 'TEST123456',
        firstPurchaseDone: false,
        treeLevel: 0,
        treeParent: null,
        treePosition: 0,
        treeChildren: []
      });
      
      console.log('✅ Created test user:', newUser.email);
      testUser = newUser;
    }
    
    console.log('\n📊 User before purchase:');
    console.log(`   Name: ${testUser.name}`);
    console.log(`   Email: ${testUser.email}`);
    console.log(`   First Purchase Done: ${testUser.firstPurchaseDone}`);
    console.log(`   Tree Level: ${testUser.treeLevel}`);
    console.log(`   Tree Parent: ${testUser.treeParent}`);
    console.log(`   Referred By: ${testUser.referredBy || 'None'}`);
    
    // Simulate a purchase by calling commission distribution
    console.log('\n💰 Simulating purchase - calling commission distribution...');
    
    try {
      const fakeOrderId = new mongoose.Types.ObjectId();
      const purchaseAmount = 100; // ₹100 purchase
      
      const commissionTransaction = await distributeCommissions(
        fakeOrderId,
        testUser._id,
        purchaseAmount
      );
      
      console.log('✅ Commission distribution completed:', commissionTransaction._id);
      
      // Check user after commission distribution
      const updatedUser = await User.findById(testUser._id);
      
      console.log('\n📊 User after purchase:');
      console.log(`   Name: ${updatedUser.name}`);
      console.log(`   Email: ${updatedUser.email}`);
      console.log(`   First Purchase Done: ${updatedUser.firstPurchaseDone}`);
      console.log(`   Tree Level: ${updatedUser.treeLevel}`);
      console.log(`   Tree Parent: ${updatedUser.treeParent}`);
      console.log(`   Tree Position: ${updatedUser.treePosition}`);
      console.log(`   Tree Children: ${updatedUser.treeChildren.length}`);
      console.log(`   Wallet: ₹${updatedUser.wallet}`);
      
      if (updatedUser.treeLevel > 0) {
        console.log('\n✅ SUCCESS: Tree placement created!');
      } else {
        console.log('\n❌ ISSUE: Tree placement NOT created');
      }
      
    } catch (commissionError) {
      console.error('❌ Commission distribution failed:', commissionError);
      console.error('Error details:', commissionError.stack);
    }
    
    // Check all users in tree
    console.log('\n📊 All users currently in tree:');
    const usersInTree = await User.find({ 
      treeLevel: { $gte: 1 },
      firstPurchaseDone: true 
    }).select('name email treeLevel treeParent firstPurchaseDone');
    
    if (usersInTree.length === 0) {
      console.log('   No users in tree');
    } else {
      usersInTree.forEach(user => {
        console.log(`   - ${user.name} (${user.email}) - Level: ${user.treeLevel}, Purchased: ${user.firstPurchaseDone}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Error stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

// Run debug
debugTreeCreation();