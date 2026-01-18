require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const PointsTransaction = require('./models/PointsTransaction');

async function deleteEnoshVirtualTree() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find Enosh
    const enosh = await User.findOne({ 
      name: { $regex: /enosh/i },
      isVirtual: { $ne: true }
    });
    
    if (!enosh) {
      console.log('❌ Enosh not found');
      return;
    }
    
    console.log(`📋 Current Enosh status:`);
    console.log(`Name: ${enosh.name}`);
    console.log(`Points: ${enosh.pointsWallet}`);
    console.log(`Total Points Earned: ${enosh.totalPointsEarned}`);
    console.log(`Virtual Trees: ${enosh.virtualReferralsCreated}`);
    console.log(`Wallet: ₹${enosh.wallet}`);
    
    // Find Enosh's virtual users
    const virtualUsers = await User.find({ 
      originalUser: enosh._id,
      isVirtual: true 
    }).sort({ createdAt: -1 }); // Get newest first
    
    console.log(`\n🌳 Enosh's virtual trees: ${virtualUsers.length}`);
    virtualUsers.forEach((vu, index) => {
      console.log(`${index + 1}. ${vu.name} (ID: ${vu._id}) - Created: ${vu.createdAt}`);
    });
    
    if (virtualUsers.length < 3) {
      console.log('❌ Enosh does not have 3 virtual trees to delete');
      return;
    }
    
    // Get the 3rd virtual tree (newest one)
    const virtualTreeToDelete = virtualUsers[0]; // First in sorted array = newest
    
    console.log(`\n⚠️  Will delete: ${virtualTreeToDelete.name}`);
    console.log(`⚠️  Will add back 100 points to Enosh's account`);
    console.log(`⚠️  Will reduce virtual tree counter from 3 to 2`);
    
    console.log('\n⏳ Starting deletion in 3 seconds... (Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // 1. Remove virtual user from tree structure
      if (virtualTreeToDelete.treeParent) {
        const parent = await User.findById(virtualTreeToDelete.treeParent);
        if (parent) {
          parent.treeChildren = parent.treeChildren.filter(
            childId => !childId.equals(virtualTreeToDelete._id)
          );
          await parent.save();
          console.log(`✅ Removed from parent's (${parent.name}) children array`);
        }
      }
      
      // 2. Delete the virtual user
      await User.findByIdAndDelete(virtualTreeToDelete._id);
      console.log(`✅ Deleted virtual user: ${virtualTreeToDelete.name}`);
      
      // 3. Update Enosh's virtual tree counter and add back points
      enosh.virtualReferralsCreated = Math.max(0, enosh.virtualReferralsCreated - 1);
      enosh.pointsWallet += 100; // Add back the 100 points
      await enosh.save();
      console.log(`✅ Updated Enosh: -1 virtual tree, +100 points`);
      
      // 4. Create a points transaction record
      const transaction = new PointsTransaction({
        user: enosh._id,
        type: 'refund',
        points: 100,
        description: `Refunded 100 points for deleted virtual tree: ${virtualTreeToDelete.name}`,
        balanceAfter: enosh.pointsWallet
      });
      await transaction.save();
      console.log(`✅ Created transaction record`);
      
      // Show final status
      const updatedEnosh = await User.findById(enosh._id);
      console.log(`\n📊 Updated Enosh status:`);
      console.log(`Points: ${updatedEnosh.pointsWallet} (+100)`);
      console.log(`Virtual Trees: ${updatedEnosh.virtualReferralsCreated} (-1)`);
      console.log(`Wallet: ₹${updatedEnosh.wallet} (unchanged)`);
      
      // Verify remaining virtual trees
      const remainingVirtual = await User.find({ 
        originalUser: enosh._id,
        isVirtual: true 
      });
      console.log(`\n🌳 Remaining virtual trees: ${remainingVirtual.length}`);
      remainingVirtual.forEach((vu, index) => {
        console.log(`${index + 1}. ${vu.name}`);
      });
      
      console.log(`\n🎉 Successfully deleted Enosh's 3rd virtual tree!`);
      
    } catch (err) {
      console.error('❌ Operation failed:', err);
      throw err;
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

deleteEnoshVirtualTree();