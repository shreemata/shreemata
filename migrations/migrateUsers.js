/**
 * Migration Script: Backfill Tree Structure for Existing Users
 * 
 * This script:
 * 1. Backfills treeParent, treeLevel, treePosition for existing users
 * 2. Builds tree structure based on existing referredBy relationships
 * 3. Handles users without referrers by placing them in the tree structure
 * 4. Initializes directCommissionEarned and treeCommissionEarned to 0
 * 5. Creates initial Trust Fund and Development Trust Fund documents
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const TrustFund = require('../models/TrustFund');
require('dotenv').config();

/**
 * Build tree structure from referral relationships and no-referrer users
 * Uses breadth-first approach to maintain serial ordering
 * Places all users in the tree structure, including those without referrers
 */
async function buildTreeStructure() {
  console.log('Starting tree structure migration...');
  
  // Get all users sorted by creation time (oldest first)
  const allUsers = await User.find({}).sort({ createdAt: 1 });
  console.log(`Found ${allUsers.length} users to process`);
  
  // Track users by referral code for quick lookup
  const usersByReferralCode = {};
  allUsers.forEach(user => {
    if (user.referralCode) {
      usersByReferralCode[user.referralCode] = user;
    }
  });
  
  // Initialize commission tracking fields
  let updatedCount = 0;
  for (const user of allUsers) {
    let needsUpdate = false;
    
    // Initialize commission tracking if not set
    if (user.directCommissionEarned === undefined) {
      user.directCommissionEarned = 0;
      needsUpdate = true;
    }
    if (user.treeCommissionEarned === undefined) {
      user.treeCommissionEarned = 0;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await user.save();
      updatedCount++;
    }
  }
  console.log(`Initialized commission tracking for ${updatedCount} users`);
  
  // Build tree structure - process ALL users in chronological order
  // This ensures users without referrers are also placed in the tree
  
  let placedCount = 0;
  let skippedCount = 0;
  let rootUsersCount = 0;
  
  for (const user of allUsers) {
    // Skip if already placed in tree
    if (user.treeParent && user.treeLevel > 0) {
      skippedCount++;
      continue;
    }
    
    // Check if this is the very first user or if no tree exists yet
    const existingTreeUsers = await User.countDocuments({ 
      treeLevel: { $gt: 0 } 
    });
    
    if (existingTreeUsers === 0) {
      // This is the first user - make them the root
      user.treeLevel = 1;
      user.treeParent = null;
      user.treePosition = 0;
      user.treeChildren = user.treeChildren || [];
      await user.save();
      rootUsersCount++;
      placedCount++;
      console.log(`Created first root user: ${user.email}`);
      continue;
    }
    
    // For users with referrers, try to place them under their referrer's tree
    if (user.referredBy) {
      const directReferrer = usersByReferralCode[user.referredBy];
      
      if (directReferrer && directReferrer.treeLevel > 0) {
        // Find placement using the referrer as reference
        try {
          const placement = await findTreePlacementForMigration(directReferrer._id);
          
          // Update user with tree placement
          user.treeParent = placement.parentId;
          user.treeLevel = placement.level;
          user.treePosition = placement.position;
          user.treeChildren = user.treeChildren || [];
          await user.save();
          
          // Update parent's treeChildren array
          const parent = await User.findById(placement.parentId);
          if (parent && !parent.treeChildren.includes(user._id)) {
            parent.treeChildren.push(user._id);
            await parent.save();
          }
          
          placedCount++;
          continue;
        } catch (error) {
          console.warn(`Warning: Could not place user ${user.email} under referrer tree: ${error.message}`);
          // Fall through to global placement
        }
      } else {
        console.warn(`Warning: Referrer not found or not in tree for user ${user.email} (referral code: ${user.referredBy})`);
        // Fall through to global placement
      }
    }
    
    // For users without referrers OR users whose referrer placement failed,
    // place them in the global tree using any existing user as reference
    try {
      const anyTreeUser = await User.findOne({ treeLevel: { $gt: 0 } });
      
      if (anyTreeUser) {
        const placement = await findTreePlacementForMigration(anyTreeUser._id);
        
        // Update user with tree placement
        user.treeParent = placement.parentId;
        user.treeLevel = placement.level;
        user.treePosition = placement.position;
        user.treeChildren = user.treeChildren || [];
        await user.save();
        
        // Update parent's treeChildren array
        const parent = await User.findById(placement.parentId);
        if (parent && !parent.treeChildren.includes(user._id)) {
          parent.treeChildren.push(user._id);
          await parent.save();
        }
        
        placedCount++;
        
        if (!user.referredBy) {
          console.log(`Placed no-referrer user ${user.email} in tree at level ${placement.level}`);
        }
      } else {
        // No tree exists yet, make this user a root
        user.treeLevel = 1;
        user.treeParent = null;
        user.treePosition = 0;
        user.treeChildren = user.treeChildren || [];
        await user.save();
        rootUsersCount++;
        placedCount++;
        console.log(`Created root user: ${user.email}`);
      }
    } catch (error) {
      console.error(`Error placing user ${user.email}: ${error.message}`);
      // As a last resort, make them a root user
      user.treeLevel = 1;
      user.treeParent = null;
      user.treePosition = 0;
      user.treeChildren = user.treeChildren || [];
      await user.save();
      rootUsersCount++;
      placedCount++;
      console.log(`Fallback: Created root user ${user.email}`);
    }
    
    if (placedCount % 100 === 0) {
      console.log(`Placed ${placedCount} users in tree...`);
    }
  }
  
  console.log(`Tree structure migration complete:`);
  console.log(`  - Total placed: ${placedCount} users`);
  console.log(`  - Root users created: ${rootUsersCount} users`);
  console.log(`  - Skipped (already placed): ${skippedCount} users`);
  
  // Verify tree structure
  await verifyTreeStructure();
}

/**
 * Find tree placement for a user during migration
 * Uses global breadth-first search like the production tree placement service
 * This ensures all users (with or without referrers) are placed optimally
 */
async function findTreePlacementForMigration(referenceUserId) {
  const referenceUser = await User.findById(referenceUserId);
  
  if (!referenceUser) {
    throw new Error('Reference user not found');
  }
  
  // Find the root of the tree (user with treeLevel 1 or no treeParent)
  let root = referenceUser;
  while (root.treeParent) {
    root = await User.findById(root.treeParent);
    if (!root) {
      throw new Error('Tree structure is broken - parent not found');
    }
  }
  
  // Ensure treeChildren is initialized
  if (!root.treeChildren) {
    root.treeChildren = [];
  }
  
  // If root has less than 5 children, place directly under root
  if (root.treeChildren.length < 5) {
    return {
      parentId: root._id,
      level: root.treeLevel + 1,
      position: root.treeChildren.length
    };
  }
  
  // Otherwise, find placement using breadth-first search from root
  const childrenWithTimestamps = await User.find({
    _id: { $in: root.treeChildren }
  }).select('_id treeChildren treeLevel createdAt').sort({ createdAt: 1 });
  
  const queue = childrenWithTimestamps.map(child => child._id);
  
  while (queue.length > 0) {
    const candidateId = queue.shift();
    const candidate = await User.findById(candidateId)
      .select('_id treeChildren treeLevel createdAt');
    
    if (!candidate) {
      continue;
    }
    
    // Ensure treeChildren is initialized
    if (!candidate.treeChildren) {
      candidate.treeChildren = [];
    }
    
    // If this candidate has space, place here
    if (candidate.treeChildren.length < 5) {
      return {
        parentId: candidateId,
        level: candidate.treeLevel + 1,
        position: candidate.treeChildren.length
      };
    }
    
    // Otherwise, add their children to queue in chronological order
    if (candidate.treeChildren.length > 0) {
      const nextLevelChildren = await User.find({
        _id: { $in: candidate.treeChildren }
      }).select('_id createdAt').sort({ createdAt: 1 });
      
      queue.push(...nextLevelChildren.map(c => c._id));
    }
  }
  
  // Fallback: place directly under root even if it has 5+ children
  console.warn(`Warning: Could not find placement, placing directly under root`);
  return {
    parentId: root._id,
    level: root.treeLevel + 1,
    position: root.treeChildren.length
  };
}

/**
 * Verify tree structure integrity after migration
 */
async function verifyTreeStructure() {
  console.log('\n=== Verifying Tree Structure ===');
  
  const totalUsers = await User.countDocuments();
  const usersInTree = await User.countDocuments({ treeLevel: { $gt: 0 } });
  const rootUsers = await User.countDocuments({ treeLevel: 1, treeParent: null });
  const usersWithReferrers = await User.countDocuments({ referredBy: { $ne: null } });
  const usersWithoutReferrers = await User.countDocuments({ referredBy: null });
  
  console.log(`Total users: ${totalUsers}`);
  console.log(`Users in tree: ${usersInTree}`);
  console.log(`Root users: ${rootUsers}`);
  console.log(`Users with referrers: ${usersWithReferrers}`);
  console.log(`Users without referrers: ${usersWithoutReferrers}`);
  
  // Verify all users are in the tree
  if (usersInTree !== totalUsers) {
    console.warn(`Warning: ${totalUsers - usersInTree} users are not in the tree structure`);
  } else {
    console.log('✓ All users are properly placed in the tree');
  }
  
  // Check for orphaned users (users with treeParent that doesn't exist)
  const orphanedUsers = await User.aggregate([
    {
      $match: {
        treeParent: { $ne: null }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'treeParent',
        foreignField: '_id',
        as: 'parent'
      }
    },
    {
      $match: {
        parent: { $size: 0 }
      }
    }
  ]);
  
  if (orphanedUsers.length > 0) {
    console.warn(`Warning: Found ${orphanedUsers.length} orphaned users (treeParent doesn't exist)`);
    orphanedUsers.forEach(user => {
      console.warn(`  - User ${user.email} has invalid treeParent: ${user.treeParent}`);
    });
  } else {
    console.log('✓ No orphaned users found');
  }
  
  // Check tree level consistency
  const levelInconsistencies = await User.aggregate([
    {
      $match: {
        treeParent: { $ne: null }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'treeParent',
        foreignField: '_id',
        as: 'parent'
      }
    },
    {
      $unwind: '$parent'
    },
    {
      $match: {
        $expr: {
          $ne: ['$treeLevel', { $add: ['$parent.treeLevel', 1] }]
        }
      }
    }
  ]);
  
  if (levelInconsistencies.length > 0) {
    console.warn(`Warning: Found ${levelInconsistencies.length} users with incorrect tree levels`);
  } else {
    console.log('✓ All tree levels are consistent');
  }
  
  // Display tree statistics
  const levelStats = await User.aggregate([
    {
      $match: { treeLevel: { $gt: 0 } }
    },
    {
      $group: {
        _id: '$treeLevel',
        count: { $sum: 1 },
        withReferrers: {
          $sum: {
            $cond: [{ $ne: ['$referredBy', null] }, 1, 0]
          }
        },
        withoutReferrers: {
          $sum: {
            $cond: [{ $eq: ['$referredBy', null] }, 1, 0]
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  console.log('\nTree Level Statistics:');
  levelStats.forEach(stat => {
    console.log(`  Level ${stat._id}: ${stat.count} users (${stat.withReferrers} with referrers, ${stat.withoutReferrers} without referrers)`);
  });
  
  console.log('=== Tree Structure Verification Complete ===\n');
}

/**
 * Initialize Trust Fund documents
 */
async function initializeTrustFunds() {
  console.log('Initializing Trust Funds...');
  
  // Check if Trust Fund exists
  let trustFund = await TrustFund.findOne({ fundType: 'trust' });
  if (!trustFund) {
    trustFund = new TrustFund({
      fundType: 'trust',
      balance: 0,
      transactions: []
    });
    await trustFund.save();
    console.log('Created Trust Fund');
  } else {
    console.log('Trust Fund already exists');
  }
  
  // Check if Development Trust Fund exists
  let devTrustFund = await TrustFund.findOne({ fundType: 'development' });
  if (!devTrustFund) {
    devTrustFund = new TrustFund({
      fundType: 'development',
      balance: 0,
      transactions: []
    });
    await devTrustFund.save();
    console.log('Created Development Trust Fund');
  } else {
    console.log('Development Trust Fund already exists');
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log('=== User Migration Script ===');
    console.log('Connecting to database...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');
    
    // Step 1: Initialize Trust Funds
    await initializeTrustFunds();
    
    // Step 2: Build tree structure
    await buildTreeStructure();
    
    console.log('\n=== Migration Complete ===');
    console.log('All users have been migrated successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration, buildTreeStructure, initializeTrustFunds, verifyTreeStructure };
