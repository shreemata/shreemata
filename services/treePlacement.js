const User = require('../models/User');

/**
 * Find the appropriate tree placement using 5-person horizontal filling
 * Algorithm: Fill left-to-right across each level, max 5 children per node
 * 
 * Tree Structure:
 *                    ADMIN (Root)
 *                 /  /  |  \  \
 *            User1 User2 User3 User4 User5
 *           /||\\\  /||\\\  /||\\\
 *      U1.1-U1.5  U2.1-U2.5  U3.1-U3.5
 * 
 * @param {String} referenceUserId - The ID of a user to use as reference for finding the tree root
 * @returns {Object} Placement information: { parentId, level, position }
 */
async function findTreePlacement(referenceUserId) {
  const referenceUser = await User.findById(referenceUserId);
  
  if (!referenceUser) {
    throw new Error('Reference user not found');
  }
  
  // Find the root of the tree (admin or user with treeLevel 1 and no treeParent)
  let root = referenceUser;
  while (root.treeParent) {
    root = await User.findById(root.treeParent);
    if (!root) {
      throw new Error('Tree structure is broken - parent not found');
    }
  }
  
  console.log(`🌳 Starting tree placement search from root: ${root.name || root.email}`);
  
  // Start level-by-level search for available spot
  return await findAvailableSpotInTree(root);
}

/**
 * Find available spot in tree using breadth-first, left-to-right filling
 * Each node can have maximum 5 children
 */
async function findAvailableSpotInTree(root) {
  // Check if root has space (< 5 children)
  if (root.treeChildren.length < 5) {
    console.log(`🎯 Found space under root ${root.name || root.email}: position ${root.treeChildren.length}`);
    return {
      parentId: root._id,
      level: root.treeLevel + 1,
      position: root.treeChildren.length
    };
  }
  
  console.log(`🔍 Root is full (${root.treeChildren.length}/5), searching levels...`);
  
  // Root is full, search level by level
  let currentLevel = root.treeLevel + 1;
  
  while (true) {
    console.log(`🔍 Searching level ${currentLevel}...`);
    
    // Get all users at current level, ordered by creation time (left to right)
    const usersAtLevel = await User.find({ 
      treeLevel: currentLevel,
      firstPurchaseDone: true // Only consider users who have made purchases
    }).sort({ createdAt: 1 });
    
    if (usersAtLevel.length === 0) {
      console.log(`❌ No users found at level ${currentLevel}`);
      break;
    }
    
    console.log(`📊 Found ${usersAtLevel.length} users at level ${currentLevel}`);
    
    // Check each user at this level (left to right) for available space
    for (const user of usersAtLevel) {
      if (user.treeChildren.length < 5) {
        console.log(`🎯 Found space under ${user.name || user.email} at level ${currentLevel}: position ${user.treeChildren.length}`);
        return {
          parentId: user._id,
          level: currentLevel + 1,
          position: user.treeChildren.length
        };
      }
    }
    
    console.log(`⏭️ Level ${currentLevel} is full, moving to next level`);
    currentLevel++;
    
    // Safety check to prevent infinite loop
    if (currentLevel > 20) {
      throw new Error('Tree depth limit exceeded (20 levels)');
    }
  }
  
  // If we reach here, no existing users have space, place under root
  console.log(`🎯 No available spots found, placing under root as fallback`);
  return {
    parentId: root._id,
    level: root.treeLevel + 1,
    position: root.treeChildren.length
  };
}

/**
 * Create tree placement for a user on their first purchase
 * This function handles both referred and non-referred users
 * IMPORTANT: Only creates tree placement for the purchasing user, not their referrers
 * 
 * @param {String} userId - The ID of the user making their first purchase
 * @param {Object} session - Optional MongoDB session for transactions
 * @returns {Object} Tree placement information: { parentId, level, position }
 */
async function createTreePlacementOnFirstPurchase(userId, session = null) {
  const query = session ? User.findById(userId).session(session) : User.findById(userId);
  const user = await query;
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if user already has tree placement
  if (user.treeLevel > 0 || user.treeParent) {
    console.log(`User ${user.email} already has tree placement`);
    return {
      parentId: user.treeParent,
      level: user.treeLevel,
      position: user.treePosition
    };
  }
  
  console.log(`Creating tree placement for user ${user.email} on first purchase`);
  
  let treePlacementData = {
    parentId: null,
    level: 1, // Root level for users without referrer
    position: 0
  };
  
  if (user.referredBy) {
    // User was referred - find their direct referrer
    const referrerQuery = session ? 
      User.findOne({ referralCode: user.referredBy }).session(session) : 
      User.findOne({ referralCode: user.referredBy });
    const directReferrer = await referrerQuery;
    
    if (directReferrer) {
      console.log(`Direct referrer found: ${directReferrer.email}`);
      
      // Check if referrer has tree placement (has made a purchase)
      if (directReferrer.treeLevel > 0 && directReferrer.treeParent !== undefined) {
        // Referrer has tree placement - use tree algorithm starting from referrer
        console.log(`Referrer ${directReferrer.email} has tree placement - using as reference`);
        const placement = await findTreePlacement(directReferrer._id);
        treePlacementData = placement;
      } else {
        // Referrer hasn't made a purchase yet - use global tree placement
        console.log(`Referrer ${directReferrer.email} hasn't purchased yet - using global tree placement`);
        treePlacementData = await findGlobalTreePlacement(session, user._id);
      }
    } else {
      console.log(`Direct referrer not found for code: ${user.referredBy}`);
      // Invalid referral code - use global tree placement
      treePlacementData = await findGlobalTreePlacement(session, user._id);
    }
  } else {
    // User without referrer - use global tree placement
    console.log("User without referrer, using global tree placement...");
    treePlacementData = await findGlobalTreePlacement(session, user._id);
  }
  
  // Update user with tree placement
  user.treeParent = treePlacementData.parentId;
  user.treeLevel = treePlacementData.level;
  user.treePosition = treePlacementData.position;
  
  const saveOptions = session ? { session } : {};
  await user.save(saveOptions);
  
  // Add user to tree parent's children array
  if (treePlacementData.parentId) {
    const treeParentQuery = session ? 
      User.findById(treePlacementData.parentId).session(session) : 
      User.findById(treePlacementData.parentId);
    const treeParent = await treeParentQuery;
    
    if (treeParent) {
      treeParent.treeChildren.push(user._id);
      await treeParent.save(saveOptions);
      console.log(`Added ${user.email} to tree parent ${treeParent.email}'s children`);
    }
  }
  
  console.log(`Tree placement created for ${user.email}:`, treePlacementData);
  return treePlacementData;
}

/**
 * Find placement for users without referrers or when referrer hasn't purchased
 * Uses global tree structure to find optimal placement
 */
async function findGlobalTreePlacement(session = null, excludeUserId = null) {
  // Find admin user (root of tree) - exclude the current user
  const adminQuery = session ? 
    User.findOne({ 
      role: 'admin',
      _id: { $ne: excludeUserId } // Don't place user under themselves
    }).session(session) : 
    User.findOne({ 
      role: 'admin',
      _id: { $ne: excludeUserId } // Don't place user under themselves
    });
  let admin = await adminQuery;
  
  if (!admin) {
    // No admin found, find any user with treeLevel 1 (root level) - exclude current user
    const rootUserQuery = session ? 
      User.findOne({ 
        treeLevel: 1, 
        firstPurchaseDone: true,
        _id: { $ne: excludeUserId } // Don't place user under themselves
      }).sort({ createdAt: 1 }).session(session) :
      User.findOne({ 
        treeLevel: 1, 
        firstPurchaseDone: true,
        _id: { $ne: excludeUserId } // Don't place user under themselves
      }).sort({ createdAt: 1 });
    admin = await rootUserQuery;
  }
  
  if (admin) {
    // Use the tree placement algorithm starting from admin/root
    const placement = await findAvailableSpotInTree(admin);
    return placement;
  } else {
    // First user ever - becomes root
    console.log("First user ever - placing as root");
    return {
      parentId: null,
      level: 1,
      position: 0
    };
  }
}

module.exports = {
  findTreePlacement,
  createTreePlacementOnFirstPurchase
};