const User = require('../models/User');
const PointsTransaction = require('../models/PointsTransaction');
const AdminSettings = require('../models/AdminSettings');
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

  // Process points with priority system (Virtual Trees → Cash)
  await processUserPointsWithPriority(userId, session);

  return transaction;
}

/**
 * Process user points with priority system: Virtual Trees FIRST, then keep points
 */
async function processUserPointsWithPriority(userId, session = null) {
  const user = await User.findById(userId).session(session);
  const settings = await AdminSettings.getSettings();
  
  if (!user) {
    throw new Error('User not found');
  }

  const { virtualTreeSettings } = settings;
  
  console.log(`🎯 Processing points for ${user.email}: ${user.pointsWallet} points, ${user.virtualReferralsCreated} virtual trees`);
  
  let virtualTreesCreated = 0;
  
  // PRIORITY 1: Create Virtual Trees (if enabled and under limit)
  if (virtualTreeSettings.enabled && virtualTreeSettings.autoCreateEnabled) {
    while (user.pointsWallet >= virtualTreeSettings.pointsPerVirtualTree && 
           user.virtualReferralsCreated < virtualTreeSettings.maxVirtualTreesPerUser) {
      
      await createVirtualReferral(userId, session);
      
      // Refresh user data after each creation
      const refreshedUser = await User.findById(userId).session(session);
      user.pointsWallet = refreshedUser.pointsWallet;
      user.virtualReferralsCreated = refreshedUser.virtualReferralsCreated;
      
      virtualTreesCreated++;
      
      console.log(`🌳 Created virtual tree #${user.virtualReferralsCreated}. Remaining points: ${user.pointsWallet}`);
    }
  }
  
  // NO AUTOMATIC CASH CONVERSION - Points remain as points until user manually converts
  
  const maxVirtualTreesReached = user.virtualReferralsCreated >= virtualTreeSettings.maxVirtualTreesPerUser;
  
  return {
    virtualTreesCreated,
    cashConverted: 0, // No automatic conversion
    maxVirtualTreesReached,
    remainingPoints: user.pointsWallet
  };
}

/**
 * Create a virtual referral user and place in tree
 */
async function createVirtualReferral(userId, session = null) {
  const user = await User.findById(userId).session(session);
  const settings = await AdminSettings.getSettings();
  
  if (!user) {
    throw new Error('User not found');
  }

  const pointsRequired = settings.virtualTreeSettings.pointsPerVirtualTree;
  
  if (user.pointsWallet < pointsRequired) {
    throw new Error(`Insufficient points for virtual referral. Need ${pointsRequired} points.`);
  }

  if (user.virtualReferralsCreated >= settings.virtualTreeSettings.maxVirtualTreesPerUser) {
    throw new Error(`Maximum virtual trees reached (${settings.virtualTreeSettings.maxVirtualTreesPerUser})`);
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
    originalUser: userId,
    firstPurchaseDone: true // Mark as purchased so it appears in tree
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
  user.pointsWallet -= pointsRequired;
  user.virtualReferralsCreated += 1;
  await user.save({ session });

  // Create redemption transaction
  const transaction = new PointsTransaction({
    user: userId,
    type: 'redeemed',
    points: -pointsRequired,
    virtualUserId: virtualUser._id,
    description: `Redeemed ${pointsRequired} points for virtual referral: ${virtualUser.name}`,
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

/**
 * Manually convert points to cash (user-initiated)
 */
async function convertPointsToCash(userId, pointsToConvert, session = null) {
  const user = await User.findById(userId).session(session);
  const settings = await AdminSettings.getSettings();
  
  if (!user) {
    throw new Error('User not found');
  }

  const { cashConversionSettings } = settings;
  
  if (!cashConversionSettings.enabled) {
    throw new Error('Cash conversion is currently disabled');
  }

  if (pointsToConvert <= 0) {
    throw new Error('Points to convert must be greater than 0');
  }

  if (user.pointsWallet < pointsToConvert) {
    throw new Error(`Insufficient points. You have ${user.pointsWallet} points, trying to convert ${pointsToConvert}`);
  }

  // Check if points are in valid conversion increments
  if (pointsToConvert % cashConversionSettings.pointsPerConversion !== 0) {
    throw new Error(`Points must be in increments of ${cashConversionSettings.pointsPerConversion}. You can convert: ${Math.floor(user.pointsWallet / cashConversionSettings.pointsPerConversion) * cashConversionSettings.pointsPerConversion} points`);
  }

  const conversions = pointsToConvert / cashConversionSettings.pointsPerConversion;
  const cashToAdd = conversions * cashConversionSettings.cashPerConversion;

  // Convert points to cash
  user.pointsWallet -= pointsToConvert;
  user.wallet += cashToAdd;
  await user.save({ session });

  // Create conversion transaction
  const transaction = new PointsTransaction({
    user: userId,
    type: 'manual_converted_to_cash',
    points: -pointsToConvert,
    cashAmount: cashToAdd,
    description: `Manually converted ${pointsToConvert} points to ₹${cashToAdd} (${conversions} conversions)`,
    balanceAfter: user.pointsWallet
  });
  await transaction.save({ session });

  console.log(`User ${user.email} manually converted ${pointsToConvert} points to ₹${cashToAdd}`);

  return {
    pointsConverted: pointsToConvert,
    cashReceived: cashToAdd,
    remainingPoints: user.pointsWallet,
    newCashBalance: user.wallet
  };
}

module.exports = {
  awardPoints,
  processUserPointsWithPriority,
  createVirtualReferral,
  convertPointsToCash,
  getPointsHistory
};
