// Completely remove user from tree structure
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI);

async function removeFromTreeCompletely() {
  try {
    console.log('🌳 COMPLETELY REMOVING USER FROM TREE STRUCTURE\n');
    
    // Find Basavaraj Akki
    const user = await User.findOne({ 
      name: { $regex: /basavaraj.*akki/i }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 Found user:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Tree Level: ${user.treeLevel || 'None'}`);
    console.log(`   Tree Position: ${user.treePosition || 'None'}`);
    console.log(`   Tree Parent: ${user.treeParent || 'None'}`);
    console.log(`   Tree Children: ${user.treeChildren?.length || 0}`);
    
    // Step 1: Remove from parent's children array
    if (user.treeParent) {
      console.log('\n🔗 Removing from parent\'s children array...');
      const parent = await User.findById(user.treeParent);
      if (parent) {
        console.log(`   Parent: ${parent.name}`);
        console.log(`   Children before: ${parent.treeChildren.length}`);
        
        // Remove user from parent's children array
        parent.treeChildren = parent.treeChildren.filter(
          childId => !childId.equals(user._id)
        );
        await parent.save();
        
        console.log(`   Children after: ${parent.treeChildren.length}`);
        console.log('   ✅ Removed from parent\'s children array');
      }
    }
    
    // Step 2: Handle user's children (if any)
    if (user.treeChildren && user.treeChildren.length > 0) {
      console.log(`\n👶 Handling ${user.treeChildren.length} children...`);
      
      for (const childId of user.treeChildren) {
        const child = await User.findById(childId);
        if (child) {
          console.log(`   Child: ${child.name}`);
          
          // Option 1: Move children to user's parent (if exists)
          if (user.treeParent) {
            const newParent = await User.findById(user.treeParent);
            if (newParent) {
              child.treeParent = newParent._id;
              child.treeLevel = newParent.treeLevel + 1;
              child.treePosition = newParent.treeChildren.length;
              
              newParent.treeChildren.push(child._id);
              await newParent.save();
              await child.save();
              
              console.log(`     ✅ Moved to new parent: ${newParent.name}`);
            }
          } else {
            // Option 2: Make children independent (remove tree placement)
            child.treeParent = null;
            child.treeLevel = 0;
            child.treePosition = 0;
            await child.save();
            
            console.log(`     ✅ Made independent (removed tree placement)`);
          }
        }
      }
    }
    
    // Step 3: Clear user's tree data
    console.log('\n🧹 Clearing user\'s tree data...');
    user.treeParent = null;
    user.treeLevel = 0;
    user.treePosition = 0;
    user.treeChildren = [];
    await user.save();
    
    console.log('✅ OPERATION COMPLETED');
    console.log(`   ${user.name} completely removed from tree structure`);
    console.log(`   Account and orders preserved`);
    console.log(`   Wallet balance maintained: ₹${user.wallet || 0}`);
    
    // Verify removal
    console.log('\n🔍 Verification:');
    const updatedUser = await User.findById(user._id);
    console.log(`   Tree Level: ${updatedUser.treeLevel}`);
    console.log(`   Tree Parent: ${updatedUser.treeParent || 'None'}`);
    console.log(`   Tree Children: ${updatedUser.treeChildren.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

removeFromTreeCompletely();