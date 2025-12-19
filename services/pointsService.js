const User = require('../models/User');
const PointsTransaction = require('../models/PointsTransaction');
const { findTreePlacement } = require('./treePlacement');

/**
 * Award points to user for a purchase
 */
async function awardPoints(userId, points, source, sourceId, orderId, session = null) {
  if (points <= 0) return null;

  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new Error('User not found');
  }

  // Update user points
  user.pointsWallet += points;
  user.totalPointsEarned += points;
  await user.save({ session });

  // Create transaction record
  const transaction = new PointsTransaction({
    user: userId,
    type: 'earned',
    points,
    source,
    sourceId,
    orderId,
    description: `Earned ${points} points from ${source.replace('_', ' ')}`,
    balanceAfter: user.pointsWallet
  });
  await transaction.save({ session });

  console.log(`Awarded ${points} points to user ${user.email}`);

  // Check if user can create virtual referral
  await checkAndCreateVirtualReferral(userId, session);

  return transaction;
}

/**
 * Check if user has 100+ points and create virtual referral
 */
async function checkAndCreateVirtualReferral(userId, session = null) {
  const user = await User.findById(userId).session(session);
  
  if (user.pointsWallet >= 100) {
    await createVirtualReferral(userId, session);
  }
}

/**
 * Create a virtual referral user and place in tree
 */
async function createVirtualReferral(userId, session = null) {
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.pointsWallet < 100) {
    throw new Error('Insufficient points for virtual referral');
  }

  // Create virtual user
  const virtualUserCount = user.virtualReferralsCreated + 1;
  const virtualUser = new User({
    name: `${user.name}-Virtual-${virtualUserCount}`,
    email: `virtual-${user._id}-${virtualUserCount}@system.local`,
    password: 'virtual-user-no-login',
    referralCode: `VIR${user._id.toString().slice(-6)}${virtualUserCount}`,
    referredBy: user.referralCode,
    role: 'virtual',
    isVirtual: true,
    originalUser: userId
  });

  // Find tree placement for virtual user
  const placement = await findTreePlacement(userId);
  virtualUser.treeParent = placement.parentId;
  virtualUser.treeLevel = placement.level;
  virtualUser.treePosition = placement.position;
  
  await virtualUser.save({ session });

  // Update parent's children array
  const parent = await User.findById(placement.parentId).session(session);
  parent.treeChildren.push(virtualUser._id);
  await parent.save({ session });

  // Deduct points from user
  user.pointsWallet -= 100;
  user.virtualReferralsCreated += 1;
  await user.save({ session });

  // Create redemption transaction
  const transaction = new PointsTransaction({
    user: userId,
    type: 'redeemed',
    points: -100,
    virtualUserId: virtualUser._id,
    description: `Redeemed 100 points for virtual referral: ${virtualUser.name}`,
    balanceAfter: user.pointsWallet
  });
  await transaction.save({ session });

  console.log(`Created virtual referral ${virtualUser.name} for user ${user.email}`);
  
  return virtualUser;
}

/**
 * Get user's points history
 */
async function getPointsHistory(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const transactions = await PointsTransaction.find({ user: userId })
    .populate('sourceId')
    .populate('virtualUserId', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await PointsTransaction.countDocuments({ user: userId });

  return {
    transactions,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}

module.exports = {
  awardPoints,
  checkAndCreateVirtualReferral,
  createVirtualReferral,
  getPointsHistory
};
