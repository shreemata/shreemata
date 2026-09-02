/**
 * Reset one user for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function resetOneUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📡 Connected to MongoDB');
    
    // Find any user and reset them
    const user = await User.findOne({});
    if (user) {
      user.firstPurchaseDone = false;
      user.treeLevel = 0;
      user.treeParent = null;
      user.treePosition = 0;
      user.treeChildren = [];
      await user.save();
      
      console.log(`✅ Reset user: ${user.name} (${user.email})`);
      console.log(`   First Purchase Done: ${user.firstPurchaseDone}`);
      console.log(`   Tree Level: ${user.treeLevel}`);
    } else {
      console.log('❌ No users found');
    }
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

resetOneUser();