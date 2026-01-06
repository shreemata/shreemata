require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkCurrentTreeDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get all users with tree placement
    const allUsers = await User.find({ firstPurchaseDone: true })
      .select('name email treeLevel treePosition treeParent role')
      .populate('treeParent', 'name')
      .sort({ treeLevel: 1, treePosition: 1 });

    console.log('🌳 Current Tree Structure:');
    console.log('='.repeat(80));

    let currentLevel = 0;
    allUsers.forEach(user => {
      if (user.treeLevel !== currentLevel) {
        currentLevel = user.treeLevel;
        console.log(`\n--- Level ${currentLevel} ---`);
      }
      const parentName = user.treeParent ? user.treeParent.name : 'ROOT';
      const roleInfo = user.role === 'admin' ? ' (ADMIN)' : '';
      console.log(`  ${user.name}${roleInfo} - Position: ${user.treePosition}, Parent: ${parentName}`);
    });

    // Check for issues
    console.log('\n🔍 Issues Found:');
    
    // Issue 1: Multiple Level 1 users
    const level1Users = allUsers.filter(u => u.treeLevel === 1);
    if (level1Users.length > 1) {
      console.log(`❌ Issue 1: Multiple Level 1 users found (${level1Users.length})`);
      level1Users.forEach(user => {
        console.log(`   - ${user.name} (${user.role})`);
      });
      console.log('   Solution: Only admin should be at Level 1');
    }

    // Issue 2: Users without proper parents
    const orphanUsers = allUsers.filter(u => u.treeLevel > 1 && !u.treeParent);
    if (orphanUsers.length > 0) {
      console.log(`❌ Issue 2: Users without parents (${orphanUsers.length})`);
      orphanUsers.forEach(user => {
        console.log(`   - ${user.name} at Level ${user.treeLevel}`);
      });
    }

    // Issue 3: Duplicate positions under same parent
    const positionGroups = {};
    allUsers.forEach(user => {
      const parentKey = user.treeParent ? user.treeParent._id.toString() : 'ROOT';
      if (!positionGroups[parentKey]) {
        positionGroups[parentKey] = {};
      }
      if (!positionGroups[parentKey][user.treePosition]) {
        positionGroups[parentKey][user.treePosition] = [];
      }
      positionGroups[parentKey][user.treePosition].push(user.name);
    });

    Object.keys(positionGroups).forEach(parentKey => {
      Object.keys(positionGroups[parentKey]).forEach(position => {
        const users = positionGroups[parentKey][position];
        if (users.length > 1) {
          const parentName = parentKey === 'ROOT' ? 'ROOT' : 'Parent';
          console.log(`❌ Issue 3: Duplicate position ${position} under ${parentName}: ${users.join(', ')}`);
        }
      });
    });

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (level1Users.length > 1) {
      const adminUser = level1Users.find(u => u.role === 'admin');
      const nonAdminUsers = level1Users.filter(u => u.role !== 'admin');
      
      if (adminUser && nonAdminUsers.length > 0) {
        console.log('1. Move non-admin users from Level 1 to Level 2 under admin:');
        nonAdminUsers.forEach((user, index) => {
          console.log(`   - Move ${user.name} to Level 2, Position ${index + 1}, Parent: ${adminUser.name}`);
        });
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCurrentTreeDB();