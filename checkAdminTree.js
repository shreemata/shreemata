/**
 * Check what the admin tree API returns
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkAdminTree() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📡 Connected to MongoDB');
    
    // Check all users and their tree status
    const allUsers = await User.find({}).select('name email firstPurchaseDone treeLevel treeParent treeChildren role');
    
    console.log('\n📊 All Users in Database:');
    allUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email})`);
      console.log(`     Role: ${user.role || 'user'}`);
      console.log(`     First Purchase: ${user.firstPurchaseDone}`);
      console.log(`     Tree Level: ${user.treeLevel}`);
      console.log(`     Tree Parent: ${user.treeParent || 'null'}`);
      console.log(`     Children Count: ${user.treeChildren.length}`);
      console.log('');
    });
    
    // Check users who should appear in admin tree
    const treeUsers = await User.find({
      firstPurchaseDone: true,
      treeLevel: { $gte: 1 }
    }).select('name email treeLevel treeParent firstPurchaseDone');
    
    console.log('\n🌳 Users Who Should Appear in Admin Tree:');
    if (treeUsers.length === 0) {
      console.log('   ❌ No users found who should appear in tree');
      console.log('   This means either:');
      console.log('   1. No users have made purchases (firstPurchaseDone: false)');
      console.log('   2. No users have tree placement (treeLevel: 0)');
    } else {
      treeUsers.forEach(user => {
        console.log(`   ✅ ${user.name} (${user.email})`);
        console.log(`      Level: ${user.treeLevel}, Parent: ${user.treeParent || 'root'}`);
      });
    }
    
    // Check root users specifically
    const rootUsers = await User.find({
      firstPurchaseDone: true,
      treeLevel: { $gte: 1 },
      $or: [
        { treeParent: null },
        { treeParent: { $exists: false } }
      ]
    }).select('name email treeLevel');
    
    console.log('\n🌲 Root Users (Should appear at top of tree):');
    if (rootUsers.length === 0) {
      console.log('   ❌ No root users found');
    } else {
      rootUsers.forEach(user => {
        console.log(`   ✅ ${user.name} (${user.email}) - Level ${user.treeLevel}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkAdminTree();