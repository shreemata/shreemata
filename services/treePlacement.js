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

module.exports = {
  findTreePlacement
};
