/**
 * Migration: Reset Tree Placement for Non-Purchasing Users
 * 
 * This migration resets tree placement for users who haven't made any purchases.
 * Only users with firstPurchaseDone: true should have tree placement.
 * 
 * Run this after implementing the "tree only on purchase" feature.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function resetTreeForNonPurchasers() {
  try {
    console.log('🔄 Starting migration: Reset tree placement for non-purchasing users');
    
    // Find all users who haven't made purchases but have tree placement
    const usersToReset = await User.find({
      firstPurchaseDone: false,
      $or: [
        { treeLevel: { $gt: 0 } },
        { treeParent: { $ne: null } },
        { treeChildren: { $ne: [] } }
      ]
    });
    
    console.log(`📊 Found ${usersToReset.length} users who need tree reset`);
    
    if (usersToReset.length === 0) {
      console.log('✅ No users need tree reset - migration complete');
      return;
    }
    
    // Show users that will be reset
    console.log('👥 Users to be reset:');
    usersToReset.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - Level: ${user.treeLevel}, Parent: ${user.treeParent}, Children: ${user.treeChildren.length}`);
    });
    
    // Reset tree placement for non-purchasing users
    const resetResult = await User.updateMany(
      {
        firstPurchaseDone: false,
        $or: [
          { treeLevel: { $gt: 0 } },
          { treeParent: { $ne: null } },
          { treeChildren: { $ne: [] } }
        ]
      },
      {
        $set: {
          treeLevel: 0,
          treeParent: null,
          treePosition: 0,
          treeChildren: []
        }
      }
    );
    
    console.log(`✅ Reset tree placement for ${resetResult.modifiedCount} users`);
    
    // Also need to remove these users from other users' treeChildren arrays
    console.log('🔄 Cleaning up treeChildren arrays...');
    
    const userIdsToRemove = usersToReset.map(user => user._id);
    
    const cleanupResult = await User.updateMany(
      { treeChildren: { $in: userIdsToRemove } },
      { $pullAll: { treeChildren: userIdsToRemove } }
    );
    
    console.log(`✅ Cleaned up treeChildren arrays for ${cleanupResult.modifiedCount} users`);
    
    // Show final statistics
    const totalUsers = await User.countDocuments();
    const usersInTree = await User.countDocuments({ 
      firstPurchaseDone: true,
      treeLevel: { $gte: 1 } 
    });
    const usersWithPurchases = await User.countDocuments({ firstPurchaseDone: true });
    const usersWithoutPurchases = await User.countDocuments({ firstPurchaseDone: false });
    
    console.log('\n📊 Final Statistics:');
    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   Users with Purchases: ${usersWithPurchases}`);
    console.log(`   Users without Purchases: ${usersWithoutPurchases}`);
    console.log(`   Users in Tree: ${usersInTree}`);
    console.log(`   Users Hidden from Tree: ${usersWithoutPurchases}`);
    
    console.log('\n✅ Migration completed successfully!');
    console.log('🎯 Now only users who have made purchases will appear in the referral tree');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  // Connect to MongoDB using the same configuration as the main app
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('📡 Connected to MongoDB');
    return resetTreeForNonPurchasers();
  }).then(() => {
    console.log('🎉 Migration completed successfully');
    mongoose.connection.close();
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Migration failed:', error);
    mongoose.connection.close();
    process.exit(1);
  });
}

module.exports = { resetTreeForNonPurchasers };