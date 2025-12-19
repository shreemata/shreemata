const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPointsHistory, createVirtualReferral } = require('../services/pointsService');
const User = require('../models/User');

const router = express.Router();

/**
 * GET user's points balance
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('pointsWallet totalPointsEarned virtualReferralsCreated');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      pointsWallet: user.pointsWallet,
      totalPointsEarned: user.totalPointsEarned,
      virtualReferralsCreated: user.virtualReferralsCreated,
      canCreateVirtual: user.pointsWallet >= 100
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
 * POST create virtual referral (redeem 100 points)
 */
router.post('/redeem-virtual', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.pointsWallet < 100) {
      return res.status(400).json({ error: 'Insufficient points. Need 100 points to create virtual referral.' });
    }

    const virtualUser = await createVirtualReferral(req.user.id);
    
    res.json({
      message: 'Virtual referral created successfully',
      virtualUser: {
        name: virtualUser.name,
        referralCode: virtualUser.referralCode
      },
      remainingPoints: user.pointsWallet - 100
    });
  } catch (err) {
    console.error('Create virtual referral error:', err);
    res.status(500).json({ error: err.message || 'Error creating virtual referral' });
  }
});

module.exports = router;
