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
    
    res.json({
      pointsWallet: user.pointsWallet,
      totalPointsEarned: user.totalPointsEarned,
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

module.exports = router;
