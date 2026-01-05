const User = require('../models/User');

/**
 * Find the appropriate tree placement for a new user
 * Implements global breadth-first search with serial ordering based on timestamps
 * Always searches from the root of the tree to ensure balanced, level-by-level filling
 * 
 * @param {String} referenceUserId - The ID of a user to use as reference for finding the tree root
 * @returns {Object} Placement information: { parentId, level, position }
 */
async function findTreePlacement(referenceUserId) {
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
  
  // Start BFS from the root to find first available spot
  // This ensures global, level-by-level filling regardless of who referred
  
  // If root has less than 5 children, place directly under root
  if (root.treeChildren.length < 5) {
    return {
      parentId: root._id,
      level: root.treeLevel + 1,
      position: root.treeChildren.length
    };
  }
  
  // Otherwise, find placement using breadth-first search from root
  // Start with the root's children, ordered by their creation time
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
  
  // Fallback (should never reach here in normal operation)
  throw new Error('Unable to find tree placement');
}

/**
 * Create tree placement for a user on their first purchase
 * This function handles both referred and non-referred users
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
    // User was referred - find their direct referrer and place in tree
    const referrerQuery = session ? 
      User.findOne({ referralCode: user.referredBy }).session(session) : 
      User.findOne({ referralCode: user.referredBy });
    const directReferrer = await referrerQuery;
    
    if (directReferrer) {
      console.log(`Direct referrer found: ${directReferrer.email}`);
      
      // Check if referrer has tree placement (has made a purchase)
      if (directReferrer.treeLevel > 0 && directReferrer.treeParent !== undefined) {
        // Referrer has tree placement - place under them
        console.log(`Referrer ${directReferrer.email} has tree placement - placing under them`);
        const placement = await findTreePlacement(directReferrer._id);
        treePlacementData = placement;
      } else {
        // Referrer hasn't made a purchase yet - place purchaser as root
        console.log(`Referrer ${directReferrer.email} hasn't purchased yet - placing purchaser as root`);
        treePlacementData = await findRootPlacement(session);
      }
    } else {
      console.log(`Direct referrer not found for code: ${user.referredBy}`);
      // Invalid referral code - place as root user
      treePlacementData = await findRootPlacement(session);
    }
  } else {
    // User without referrer - place in tree using existing users as reference
    console.log("User without referrer, finding tree placement...");
    treePlacementData = await findRootPlacement(session);
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
 * Find placement for users without referrers or when referrer is not found
 * Uses existing tree structure to find optimal placement
 * 
 * @param {Object} session - Optional MongoDB session for transactions
 */
async function findRootPlacement(session = null) {
  // Find any existing user with tree placement to use as reference
  const query = session ? 
    User.findOne({ treeLevel: { $gte: 1 } }).sort({ createdAt: 1 }).session(session) :
    User.findOne({ treeLevel: { $gte: 1 } }).sort({ createdAt: 1 });
  const anyExistingUser = await query;
  
  if (anyExistingUser) {
    // Use the tree placement algorithm starting from any existing user
    const placement = await findTreePlacement(anyExistingUser._id);
    return placement;
  } else {
    // First user ever - becomes root
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
