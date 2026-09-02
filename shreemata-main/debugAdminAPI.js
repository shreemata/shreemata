/**
 * Debug the admin referral tree API to see what's happening
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function debugAdminAPI() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📡 Connected to MongoDB');
    
    console.log('\n🔍 Debugging Admin Referral Tree API Logic...\n');
    
    // Step 1: Check the exact query used by the admin API
    console.log('📋 Step 1: Checking root users query (what admin API uses)');
    
    const rootUsersQuery = {
      firstPurchaseDone: true, // Must have made a purchase
      treeLevel: { $gte: 1 }, // Must have tree placement
      $or: [
        { treeParent: null },
        { treeParent: { $exists: false } }
      ]
    };
    
    console.log('   Query:', JSON.stringify(rootUsersQuery, null, 2));
    
    const rootUsers = await User.find(rootUsersQuery);
    console.log(`   Result: Found ${rootUsers.length} root users`);
    
    if (rootUsers.length > 0) {
      rootUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
        console.log(`     firstPurchaseDone: ${user.firstPurchaseDone}`);
        console.log(`     treeLevel: ${user.treeLevel}`);
        console.log(`     treeParent: ${user.treeParent}`);
      });
    }
    
    // Step 2: Check what buildLevelGroupedTree returns
    console.log('\n📋 Step 2: Testing buildLevelGroupedTree function');
    
    if (rootUsers.length > 0) {
      const rootUserIds = rootUsers.map(user => user._id);
      console.log(`   Root user IDs: ${rootUserIds}`);
      
      // Simulate the buildLevelGroupedTree function
      const { buildLevelGroupedTree } = require('./routes/adminReferralTree');
      
      // Since buildLevelGroupedTree is not exported, let me simulate it
      const levels = {};
      const allUsers = [];
      
      for (const user of rootUsers) {
        const userData = {
          id: user._id,
          name: user.name,
          email: user.email,
          referralCode: user.referralCode,
          wallet: user.wallet || 0,
          treeLevel: user.treeLevel,
          treePosition: user.treePosition,
          joinDate: user.createdAt,
          referralStatus: {
            hasReferrer: !!user.referredBy,
            joinedWithoutReferrer: !user.referredBy,
            isRootUser: user.treeLevel === 1 || !user.treeParent,
            hasPurchased: user.treeLevel > 0
          },
          commissions: {
            total: (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0),
            direct: user.directCommissionEarned || 0,
            tree: user.treeCommissionEarned || 0
          },
          childrenCount: user.treeChildren.length,
          children: []
        };
        
        if (!levels[user.treeLevel]) {
          levels[user.treeLevel] = [];
        }
        levels[user.treeLevel].push(userData);
        allUsers.push(userData);
      }
      
      console.log(`   Levels object:`, Object.keys(levels));
      console.log(`   All users count: ${allUsers.length}`);
      
      // Convert to array format like the API does
      const levelsArray = Object.keys(levels)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(levelNum => ({
          level: parseInt(levelNum),
          users: levels[levelNum]
        }));
      
      console.log(`   Levels array:`, levelsArray.length, 'levels');
      levelsArray.forEach(levelData => {
        console.log(`     Level ${levelData.level}: ${levelData.users.length} users`);
        levelData.users.forEach(user => {
          console.log(`       - ${user.name} (${user.email})`);
        });
      });
      
    } else {
      console.log('   ❌ No root users found, so buildLevelGroupedTree would return empty');
    }
    
    // Step 3: Check all users regardless of filters
    console.log('\n📋 Step 3: All users in database (no filters)');
    const allUsers = await User.find({}).select('name email firstPurchaseDone treeLevel treeParent role');
    console.log(`   Total users: ${allUsers.length}`);
    
    allUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email})`);
      console.log(`     Role: ${user.role || 'user'}`);
      console.log(`     firstPurchaseDone: ${user.firstPurchaseDone}`);
      console.log(`     treeLevel: ${user.treeLevel}`);
      console.log(`     treeParent: ${user.treeParent}`);
      
      // Check if this user meets the root user criteria
      const meetsRootCriteria = user.firstPurchaseDone && 
                               user.treeLevel >= 1 && 
                               (!user.treeParent || user.treeParent === null);
      console.log(`     Meets root criteria: ${meetsRootCriteria}`);
      console.log('');
    });
    
    // Step 4: Check if there are any users with tree placement at all
    console.log('\n📋 Step 4: Users with any tree placement');
    const treeUsers = await User.find({ treeLevel: { $gt: 0 } });
    console.log(`   Users with treeLevel > 0: ${treeUsers.length}`);
    
    // Step 5: Check if there are any users with firstPurchaseDone
    console.log('\n📋 Step 5: Users with firstPurchaseDone');
    const purchasedUsers = await User.find({ firstPurchaseDone: true });
    console.log(`   Users with firstPurchaseDone: true: ${purchasedUsers.length}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Error stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

debugAdminAPI();