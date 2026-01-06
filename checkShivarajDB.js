require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkShivarajDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find Shivaraj
    const shivaraj = await User.findOne({ name: 'Shivaraj' });
    
    if (!shivaraj) {
      console.log('❌ Shivaraj not found in database');
      process.exit(0);
    }

    console.log('✅ Found Shivaraj:');
    console.log('📋 Shivaraj Details:');
    console.log(`   ID: ${shivaraj._id}`);
    console.log(`   Name: ${shivaraj.name}`);
    console.log(`   Email: ${shivaraj.email}`);
    console.log(`   Tree Level: ${shivaraj.treeLevel}`);
    console.log(`   Tree Position: ${shivaraj.treePosition}`);
    console.log(`   Tree Parent: ${shivaraj.treeParent || 'None (ROOT) ❌'}`);
    console.log(`   Referred By: ${shivaraj.referredBy || 'None'}`);
    console.log(`   First Purchase Done: ${shivaraj.firstPurchaseDone}`);
    console.log(`   Tree Children: ${shivaraj.treeChildren.length} children`);
    console.log(`   Referral Code: ${shivaraj.referralCode}`);
    console.log(`   Created: ${shivaraj.createdAt}`);

    // Check current tree structure to see where Shivaraj should be placed
    console.log('\n🌳 Current Tree Structure:');
    const allUsers = await User.find({ firstPurchaseDone: true })
      .select('name treeLevel treePosition treeParent treeChildren')
      .populate('treeParent', 'name')
      .sort({ treeLevel: 1, treePosition: 1 });

    let currentLevel = 0;
    allUsers.forEach(user => {
      if (user.treeLevel !== currentLevel) {
        currentLevel = user.treeLevel;
        console.log(`\n--- Level ${currentLevel} ---`);
      }
      const parentName = user.treeParent ? user.treeParent.name : 'ROOT';
      const childrenCount = user.treeChildren.length;
      console.log(`  ${user.name} (Pos ${user.treePosition}) - Parent: ${parentName}, Children: ${childrenCount}/5`);
    });

    // Analyze where Shivaraj should be placed
    console.log('\n🔍 Tree Placement Analysis:');
    
    // Find next available position following 5-person algorithm
    const level2Users = allUsers.filter(u => u.treeLevel === 2);
    console.log(`Level 2 has ${level2Users.length} users`);
    
    for (const user of level2Users) {
      const childrenCount = user.treeChildren.length;
      if (childrenCount < 5) {
        console.log(`✅ ${user.name} can take more children (${childrenCount}/5)`);
        console.log(`   Next position under ${user.name}: ${childrenCount + 1}`);
        break;
      } else {
        console.log(`❌ ${user.name} is full (${childrenCount}/5)`);
      }
    }

    // Check if Shivaraj is incorrectly placed as root
    if (!shivaraj.treeParent) {
      console.log('\n⚠️  ISSUE: Shivaraj is placed as ROOT user!');
      console.log('   This is incorrect - only the first admin should be root.');
      console.log('   Shivaraj should be placed following the tree algorithm.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkShivarajDB();