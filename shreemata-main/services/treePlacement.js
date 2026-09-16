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
 * Find available spot in tree using strict queue-based serial breadth-first search (BFS).
 * Maximum 5 children per parent (positions 0 to 4).
 * 
 * Traversal Guarantee:
 * 1. Root fills positions 0..4 first.
 * 2. Position 0 under Root fills 1A..1E (positions 0..4) before Position 1 under Root is checked.
 * 3. Position 1 fills 2A..2E, Position 2 fills 3A..3E, Position 3 fills 4A..4E, Position 4 fills 5A..5E.
 * 4. Only after all 25 positions at Level 2 are full does Level 3 begin (under 1A).
 */
async function findAvailableSpotInTree(root) {
  const queue = [root];

  while (queue.length > 0) {
    const parent = queue.shift();

    // Query real placed User documents under this parent (positions 0..4)
    const children = await User.find({
      treeParent: parent._id,
      treePosition: { $gte: 0, $lte: 4 }
    }).sort({ treePosition: 1, firstPurchaseDate: 1, createdAt: 1, _id: 1 });

    const occupiedPositions = new Set(children.map(c => c.treePosition));

    if (occupiedPositions.size < 5) {
      let freeSlot = 0;
      while (occupiedPositions.has(freeSlot) && freeSlot < 5) {
        freeSlot++;
      }
      console.log(`🎯 Found available slot under ${parent.name || parent.email} (ID: ${parent._id}): position ${freeSlot} (occupied: ${occupiedPositions.size}/5)`);
      return {
        parentId: parent._id,
        level: parent.treeLevel + 1,
        position: freeSlot
      };
    }

    // Parent is full (5/5). Enqueue children in exact slot order 0, 1, 2, 3, 4
    for (const child of children) {
      queue.push(child);
    }
  }

  // Fallback
  console.log(`🎯 Queue fallback: placing under root`);
  return {
    parentId: root._id,
    level: root.treeLevel + 1,
    position: 0
  };
}

/**
 * Create tree placement for a user on their first purchase
 * Handles both referred and non-referred users
 * Includes E11000 collision retry loop (up to 5 retries) for concurrent placements
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
  
  const MAX_RETRIES = 5;
  let attempt = 0;
  let treePlacementData = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      if (user.referredBy) {
        const referrerQuery = session ? 
          User.findOne({ referralCode: user.referredBy }).session(session) : 
          User.findOne({ referralCode: user.referredBy });
        const directReferrer = await referrerQuery;
        
        if (directReferrer && directReferrer.treeLevel > 0 && directReferrer.treeParent !== undefined) {
          treePlacementData = await findTreePlacement(directReferrer._id);
        } else {
          treePlacementData = await findGlobalTreePlacement(session, user._id);
        }
      } else {
        treePlacementData = await findGlobalTreePlacement(session, user._id);
      }
      
      // Update user with tree placement
      user.treeParent = treePlacementData.parentId;
      user.treeLevel = treePlacementData.level;
      user.treePosition = treePlacementData.position;
      
      const saveOptions = session ? { session } : {};
      await user.save(saveOptions);

      // Successfully saved! Break retry loop.
      break;
    } catch (saveError) {
      // Check for E11000 duplicate slot collision
      if (saveError.code === 11000 && saveError.message.includes('treeParent') && attempt < MAX_RETRIES) {
        console.warn(`⚠️ E11000 slot collision on attempt ${attempt}/${MAX_RETRIES} for user ${user.email}. Retrying placement search...`);
        // Reset local placement properties before retrying
        user.treeParent = null;
        user.treeLevel = 0;
        user.treePosition = 0;
        continue;
      }
      throw saveError;
    }
  }
  
  // Synchronize tree parent's denormalized treeChildren array
  if (treePlacementData && treePlacementData.parentId) {
    const treeParentQuery = session ? 
      User.findById(treePlacementData.parentId).session(session) : 
      User.findById(treePlacementData.parentId);
    const treeParent = await treeParentQuery;
    
    if (treeParent) {
      const realChildrenQuery = session ?
        User.find({ treeParent: treeParent._id }).session(session) :
        User.find({ treeParent: treeParent._id });
      const realChildren = await realChildrenQuery;
      treeParent.treeChildren = realChildren.map(c => c._id);
      const saveOptions = session ? { session } : {};
      await treeParent.save(saveOptions);
      console.log(`Synced ${user.email} into tree parent ${treeParent.email}'s children list (${treeParent.treeChildren.length} children)`);
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
  console.log(`🔍 Finding global tree placement (excluding user: ${excludeUserId})`);
  
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
  
  console.log(`🔍 Admin search result:`, admin ? `Found ${admin.name} (${admin.email})` : 'Not found');
  
  if (!admin) {
    // No admin found, find any user with treeLevel 1 (root level) - exclude current user
    console.log(`🔍 No admin found, searching for Level 1 users...`);
    const rootUserQuery = session ? 
      User.findOne({ 
        treeLevel: 1, 
        firstPurchaseDone: true,
        _id: { $ne: excludeUserId } // Don't place user under themselves
      }).sort({ firstPurchaseDate: 1 }).session(session) :
      User.findOne({ 
        treeLevel: 1, 
        firstPurchaseDone: true,
        _id: { $ne: excludeUserId } // Don't place user under themselves
      }).sort({ firstPurchaseDate: 1 });
    admin = await rootUserQuery;
    console.log(`🔍 Level 1 user search result:`, admin ? `Found ${admin.name} (${admin.email})` : 'Not found');
  }
  
  if (admin) {
    // Use the tree placement algorithm starting from admin/root
    console.log(`🎯 Using tree placement algorithm starting from ${admin.name}`);
    const placement = await findAvailableSpotInTree(admin);
    console.log(`🎯 Global placement result:`, placement);
    return placement;
  } else {
    // This should NEVER happen unless it's truly the first user ever
    console.log("⚠️ WARNING: No admin or Level 1 users found - this should only happen for the very first user");
    console.log("🎯 Placing as root (Level 1)");
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