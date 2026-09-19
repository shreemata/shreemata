const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPointsHistory, createVirtualReferral, processUserPointsWithPriority, convertPointsToCash } = require('../services/pointsService');
const AdminSettings = require('../models/AdminSettings');
const User = require('../models/User');

const router = express.Router();

/**
 * GET user's points balance with system settings
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('pointsWallet totalPointsEarned virtualReferralsCreated wallet');
    const settings = await AdminSettings.getSettings();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate what user can do with current points
    const { virtualTreeSettings, cashConversionSettings } = settings;
    
    const canCreateVirtual = user.pointsWallet >= virtualTreeSettings.pointsPerVirtualTree && 
                            user.virtualReferralsCreated < virtualTreeSettings.maxVirtualTreesPerUser;
    
    const possibleVirtualTrees = Math.min(
      Math.floor(user.pointsWallet / virtualTreeSettings.pointsPerVirtualTree),
      virtualTreeSettings.maxVirtualTreesPerUser - user.virtualReferralsCreated
    );
    
    const pointsAfterVirtuals = user.pointsWallet - (possibleVirtualTrees * virtualTreeSettings.pointsPerVirtualTree);
    const possibleCashConversions = Math.floor(pointsAfterVirtuals / cashConversionSettings.pointsPerConversion);
    const possibleCashAmount = possibleCashConversions * cashConversionSettings.cashPerConversion;
    
    const pointsRedeemed = Math.max(0, (user.totalPointsEarned || 0) - (user.pointsWallet || 0));

    res.json({
      pointsWallet: user.pointsWallet,
      totalPointsEarned: user.totalPointsEarned,
      pointsRedeemed,
      virtualReferralsCreated: user.virtualReferralsCreated,
      cashWallet: user.wallet || 0,
      
      // System settings
      settings: {
        virtualTree: {
          cost: virtualTreeSettings.pointsPerVirtualTree,
          maxPerUser: virtualTreeSettings.maxVirtualTreesPerUser,
          enabled: virtualTreeSettings.enabled
        },
        cashConversion: {
          pointsPerConversion: cashConversionSettings.pointsPerConversion,
          cashPerConversion: cashConversionSettings.cashPerConversion,
          rate: cashConversionSettings.cashPerConversion / cashConversionSettings.pointsPerConversion,
          enabled: cashConversionSettings.enabled
        }
      },
      
      // What user can do
      capabilities: {
        canCreateVirtual,
        possibleVirtualTrees,
        possibleCashConversions,
        possibleCashAmount,
        maxVirtualTreesReached: user.virtualReferralsCreated >= virtualTreeSettings.maxVirtualTreesPerUser
      }
    });
  } catch (err) {
    console.error('Get points balance error:', err);
    res.status(500).json({ error: 'Error fetching points balance' });
  }
});

/**
 * GET user's points transaction history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await getPointsHistory(req.user.id, page, limit);
    
    res.json(result);
  } catch (err) {
    console.error('Get points history error:', err);
    res.status(500).json({ error: 'Error fetching points history' });
  }
});

/**
 * POST create virtual referral (manual creation)
 */
router.post('/redeem-virtual', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const settings = await AdminSettings.getSettings();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pointsRequired = settings.virtualTreeSettings.pointsPerVirtualTree;
    
    if (user.pointsWallet < pointsRequired) {
      return res.status(400).json({ 
        error: `Insufficient points. Need ${pointsRequired} points to create virtual referral.` 
      });
    }
    
    if (user.virtualReferralsCreated >= settings.virtualTreeSettings.maxVirtualTreesPerUser) {
      return res.status(400).json({ 
        error: `Maximum virtual trees reached (${settings.virtualTreeSettings.maxVirtualTreesPerUser})` 
      });
    }

    const virtualUser = await createVirtualReferral(req.user.id);
    
    // Get updated user data
    const updatedUser = await User.findById(req.user.id).select('pointsWallet virtualReferralsCreated wallet');
    
    res.json({
      message: 'Virtual referral created successfully',
      virtualUser: {
        name: virtualUser.name,
        referralCode: virtualUser.referralCode
      },
      remainingPoints: updatedUser.pointsWallet,
      totalVirtualTrees: updatedUser.virtualReferralsCreated,
      cashWallet: updatedUser.wallet
    });
  } catch (err) {
    console.error('Create virtual referral error:', err);
    res.status(500).json({ error: err.message || 'Error creating virtual referral' });
  }
});

/**
 * POST process user points with priority system (manual trigger)
 */
router.post('/process-points', authenticateToken, async (req, res) => {
  try {
    const result = await processUserPointsWithPriority(req.user.id);
    
    res.json({
      success: true,
      message: 'Points processed successfully',
      result: {
        virtualTreesCreated: result.virtualTreesCreated,
        cashConverted: result.cashConverted,
        finalPointsBalance: result.finalPointsBalance,
        finalCashBalance: result.finalCashBalance,
        maxVirtualTreesReached: result.maxVirtualTreesReached
      }
    });
  } catch (err) {
    console.error('Process points error:', err);
    res.status(500).json({ error: err.message || 'Error processing points' });
  }
});

/**
 * POST convert points to cash (manual conversion)
 */
router.post('/convert-to-cash', authenticateToken, async (req, res) => {
  try {
    const { pointsToConvert } = req.body;
    
    if (!pointsToConvert || pointsToConvert <= 0) {
      return res.status(400).json({ error: 'Points to convert must be greater than 0' });
    }

    const result = await convertPointsToCash(req.user.id, pointsToConvert);
    
    res.json({
      success: true,
      message: `Successfully converted ${result.pointsConverted} points to ₹${result.cashReceived}`,
      result: {
        pointsConverted: result.pointsConverted,
        cashReceived: result.cashReceived,
        remainingPoints: result.remainingPoints,
        newCashBalance: result.newCashBalance
      }
    });
  } catch (err) {
    console.error('Convert points to cash error:', err);
    res.status(400).json({ error: err.message || 'Error converting points to cash' });
  }
});

/**
 * GET user's virtual referrals with holding balances
 */
router.get('/virtual-referrals', authenticateToken, async (req, res) => {
  try {
    const VipMasterCard = require('../models/VipMasterCard');
    const virtuals = await User.find({
      originalUser: req.user.id,
      isVirtual: true
    }).populate('treeParent', 'name email').lean();

    const vipCard = await VipMasterCard.findOne({ userId: req.user.id }).sort({ tier: 1 }).lean();
    const hasVipMasterCard = !!vipCard;

    let totalAvailablePaise = 0;
    let totalLifetimePaise = 0;
    let totalClaimedPaise = 0;

    const virtualReferralsList = virtuals.map((v, index) => {
      const availPaise = v.virtualEarningsBalancePaise || 0;
      const lifePaise = v.virtualLifetimeEarningsPaise || 0;
      const claimPaise = v.virtualClaimedEarningsPaise || 0;

      totalAvailablePaise += availPaise;
      totalLifetimePaise += lifePaise;
      totalClaimedPaise += claimPaise;

      return {
        id: v._id.toString(),
        virtualReferralNumber: `VR-${String(index + 1).padStart(4, '0')}`,
        name: v.name,
        treeLevel: v.treeLevel || 0,
        treePosition: v.treePosition || 0,
        treeParentName: v.treeParent ? v.treeParent.name : 'Root',
        availableEarnings: availPaise / 100,
        availableEarningsPaise: availPaise,
        lifetimeEarnings: lifePaise / 100,
        lifetimeEarningsPaise: lifePaise,
        claimedEarnings: claimPaise / 100,
        claimedEarningsPaise: claimPaise,
        canClaim: availPaise > 0 && hasVipMasterCard,
        destination: 'VIP Master Card',
        lastVirtualClaimAt: v.lastVirtualClaimAt || null
      };
    });

    res.json({
      success: true,
      summary: {
        totalVirtualReferrals: virtuals.length,
        totalAvailableEarnings: totalAvailablePaise / 100,
        totalAvailableEarningsPaise: totalAvailablePaise,
        lifetimeVirtualEarnings: totalLifetimePaise / 100,
        lifetimeVirtualEarningsPaise: totalLifetimePaise,
        totalTransferredToVip: totalClaimedPaise / 100,
        totalTransferredToVipPaise: totalClaimedPaise,
        hasVipMasterCard,
        vipCardNumber: vipCard ? vipCard.cardNumber : null,
        vipCardBalance: vipCard ? (vipCard.balance || 0) : 0
      },
      virtualReferrals: virtualReferralsList
    });
  } catch (err) {
    console.error('Get virtual referrals error:', err);
    res.status(500).json({ error: 'Error fetching virtual referrals' });
  }
});

/**
 * POST claim virtual referral earnings into VIP Master Card (Atomic Transfer)
 */
router.post('/virtual-referrals/:virtualId/claim', authenticateToken, async (req, res) => {
  const mongoose = require('mongoose');
  const VipMasterCard = require('../models/VipMasterCard');
  const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');

  const { virtualId } = req.params;
  let session = null;

  try {
    if (mongoose.connection && mongoose.connection.readyState === 1 && typeof mongoose.connection.startSession === 'function') {
      try {
        const isReplSet = mongoose.connection.client && 
                          mongoose.connection.client.topology && 
                          typeof mongoose.connection.client.topology.hasReplicaSet === 'function' 
                          ? mongoose.connection.client.topology.hasReplicaSet() 
                          : false;
        if (isReplSet) {
          const s = await mongoose.startSession();
          try {
            s.startTransaction();
            session = s;
          } catch (txErr) {
            await s.endSession();
            session = null;
          }
        }
      } catch (e) {
        session = null;
      }
    }

    // 1. Read virtual referral
    const virtualNode = session
      ? await User.findOne({ _id: virtualId, isVirtual: true }).session(session)
      : await User.findOne({ _id: virtualId, isVirtual: true });

    if (!virtualNode) {
      if (session) { await session.abortTransaction(); session.endSession(); }
      return res.status(404).json({ success: false, message: 'Virtual referral position not found' });
    }

    // 2. Verify ownership
    if (!virtualNode.originalUser || virtualNode.originalUser.toString() !== req.user.id.toString()) {
      if (session) { await session.abortTransaction(); session.endSession(); }
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this virtual referral position' });
    }

    // 3. Verify balance > 0
    const claimAmountPaise = virtualNode.virtualEarningsBalancePaise || 0;
    if (claimAmountPaise <= 0) {
      if (session) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: 'No available virtual earnings to claim' });
    }

    // 4. Verify VIP Master Card exists
    const vipCard = session
      ? await VipMasterCard.findOne({ userId: req.user.id }).sort({ tier: 1 }).session(session)
      : await VipMasterCard.findOne({ userId: req.user.id }).sort({ tier: 1 });

    if (!vipCard) {
      if (session) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: 'VIP Master Card required to claim Virtual Referral earnings.' });
    }

    // 5. Capture claimAmountPaise
    const claimAmountRupees = claimAmountPaise / 100;

    // 6. Set virtual available balance to 0
    // 7. Increment virtual claimed earnings
    // 8. Update lastVirtualClaimAt
    const updatedVirtualNode = session
      ? await User.findOneAndUpdate(
          { _id: virtualId, isVirtual: true, originalUser: req.user.id, virtualEarningsBalancePaise: claimAmountPaise },
          {
            $set: { virtualEarningsBalancePaise: 0, lastVirtualClaimAt: new Date() },
            $inc: { virtualClaimedEarningsPaise: claimAmountPaise }
          },
          { new: true, session }
        )
      : await User.findOneAndUpdate(
          { _id: virtualId, isVirtual: true, originalUser: req.user.id, virtualEarningsBalancePaise: claimAmountPaise },
          {
            $set: { virtualEarningsBalancePaise: 0, lastVirtualClaimAt: new Date() },
            $inc: { virtualClaimedEarningsPaise: claimAmountPaise }
          },
          { new: true }
        );

    if (!updatedVirtualNode) {
      if (session) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: 'Virtual referral balance changed or already claimed' });
    }

    // 9. Credit VipMasterCard.balance
    const updatedVipCard = session
      ? await VipMasterCard.findByIdAndUpdate(
          vipCard._id,
          { $inc: { balance: claimAmountRupees } },
          { new: true, session }
        )
      : await VipMasterCard.findByIdAndUpdate(
          vipCard._id,
          { $inc: { balance: claimAmountRupees } },
          { new: true }
        );

    // 10. Create VirtualReferralTransaction
    const txOptions = session ? { session } : {};
    await VirtualReferralTransaction.create([{
      virtualReferralId: virtualNode._id,
      ownerUserId: req.user.id,
      type: 'claim_to_vip_master_card',
      amountPaise: -claimAmountPaise,
      balanceAfterPaise: 0,
      vipMasterCardId: vipCard._id,
      createdAt: new Date()
    }], txOptions);

    // 11. Commit
    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return res.json({
      success: true,
      message: `₹${claimAmountRupees.toFixed(2)} transferred to your VIP Master Card successfully.`,
      transferredAmount: claimAmountRupees,
      vipCardNumber: vipCard.cardNumber,
      newVipBalance: updatedVipCard.balance
    });

  } catch (err) {
    if (session) {
      try { await session.abortTransaction(); } catch (e) {}
      session.endSession();
    }
    console.error('Virtual referral claim error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process claim: ' + err.message });
  }
});

module.exports = router;
