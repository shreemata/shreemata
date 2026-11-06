const express = require('express');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const AdminSettings = require('../models/AdminSettings');
const User = require('../models/User');
const { processUserPointsWithPriority } = require('../services/pointsService');

const router = express.Router();

/**
 * GET /api/admin/settings - Get current admin settings
 */
router.get('/settings', authenticateToken, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    res.json({
      success: true,
      settings: {
        virtualTreeSettings: settings.virtualTreeSettings,
        cashConversionSettings: settings.cashConversionSettings,
        pointsEarningSettings: settings.pointsEarningSettings,
        commissionSettings: settings.commissionSettings,
        systemSettings: settings.systemSettings,
        readNotesSubscriptionSettings: AdminSettings.getSubscriptionConfig(settings),
        sectionSubscriptionPlans: settings.sectionSubscriptionPlans,
        lastUpdated: settings.lastUpdated,
        updatedBy: settings.updatedBy
      }
    });
  } catch (err) {
    console.error('Get admin settings error:', err);
    res.status(500).json({ error: 'Error fetching admin settings' });
  }
});

/**
 * PUT /api/admin/settings - Update admin settings
 */
router.put('/settings', authenticateToken, isAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const updatedBy = req.user.id;
    
    // Validate settings
    if (updates.virtualTreeSettings) {
      const { pointsPerVirtualTree, maxVirtualTreesPerUser } = updates.virtualTreeSettings;
      
      if (pointsPerVirtualTree && (pointsPerVirtualTree < 10 || pointsPerVirtualTree > 10000)) {
        return res.status(400).json({ error: 'Points per virtual tree must be between 10 and 10,000' });
      }
      
      if (maxVirtualTreesPerUser && (maxVirtualTreesPerUser < 1 || maxVirtualTreesPerUser > 100)) {
        return res.status(400).json({ error: 'Max virtual trees per user must be between 1 and 100' });
      }
    }
    
    if (updates.cashConversionSettings) {
      const { pointsPerConversion, cashPerConversion } = updates.cashConversionSettings;
      
      if (pointsPerConversion && (pointsPerConversion < 1 || pointsPerConversion > 10000)) {
        return res.status(400).json({ error: 'Points per conversion must be between 1 and 10,000' });
      }
      
      if (cashPerConversion && (cashPerConversion < 0.1 || cashPerConversion > 1000)) {
        return res.status(400).json({ error: 'Cash per conversion must be between ₹0.1 and ₹1,000' });
      }
    }

    if (updates.readNotesSubscriptionSettings) {
      if (typeof updates.readNotesSubscriptionSettings !== 'object' || updates.readNotesSubscriptionSettings === null) {
        return res.status(400).json({ error: 'Subscription settings must be an object' });
      }
      const { monthlyPrice, enabled, description } = updates.readNotesSubscriptionSettings;
      if (monthlyPrice !== undefined) {
        if (typeof monthlyPrice !== 'number' || Number.isNaN(monthlyPrice) || monthlyPrice < 1 || monthlyPrice > 100000) {
          return res.status(400).json({ error: 'Monthly subscription price must be between ₹1 and ₹1,00,000' });
        }
      }
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Subscription enabled status must be a boolean' });
      }
      if (description !== undefined && typeof description === 'string' && description.length > 300) {
        return res.status(400).json({ error: 'Subscription description cannot exceed 300 characters' });
      }
    }

    if (updates.sectionSubscriptionPlans) {
      if (typeof updates.sectionSubscriptionPlans !== 'object' || updates.sectionSubscriptionPlans === null) {
        return res.status(400).json({ error: 'sectionSubscriptionPlans must be an object' });
      }
      const allowedSections = ['notes', 'question_papers', 'videos', 'others'];
      for (const sec of allowedSections) {
        const plan = updates.sectionSubscriptionPlans[sec];
        if (plan) {
          if (typeof plan !== 'object' || plan === null) {
            return res.status(400).json({ error: `Plan for section ${sec} must be an object` });
          }
          if (plan.price !== undefined) {
            if (typeof plan.price !== 'number' || Number.isNaN(plan.price) || plan.price < 1 || plan.price > 100000) {
              return res.status(400).json({ error: `Plan price for ${sec} must be between ₹1 and ₹1,00,000` });
            }
          }
          if (plan.durationDays !== undefined) {
            if (typeof plan.durationDays !== 'number' || Number.isNaN(plan.durationDays) || plan.durationDays < 1 || plan.durationDays > 3650) {
              return res.status(400).json({ error: `durationDays for ${sec} must be between 1 and 3650 days` });
            }
          }
          if (plan.active !== undefined && typeof plan.active !== 'boolean') {
            return res.status(400).json({ error: `active flag for ${sec} must be a boolean` });
          }
          if (plan.name !== undefined && (typeof plan.name !== 'string' || plan.name.trim().length > 100)) {
            return res.status(400).json({ error: `Plan name for ${sec} must be text up to 100 characters` });
          }
          if (plan.description !== undefined && (typeof plan.description !== 'string' || plan.description.length > 300)) {
            return res.status(400).json({ error: `Plan description for ${sec} cannot exceed 300 characters` });
          }
        }
      }
    }
    
    // Update settings
    const settings = await AdminSettings.updateSettings(updates, updatedBy);
    
    res.json({
      success: true,
      message: 'Admin settings updated successfully',
      settings: {
        virtualTreeSettings: settings.virtualTreeSettings,
        cashConversionSettings: settings.cashConversionSettings,
        pointsEarningSettings: settings.pointsEarningSettings,
        commissionSettings: settings.commissionSettings,
        systemSettings: settings.systemSettings,
        readNotesSubscriptionSettings: AdminSettings.getSubscriptionConfig(settings),
        sectionSubscriptionPlans: settings.sectionSubscriptionPlans,
        lastUpdated: settings.lastUpdated
      }
    });
  } catch (err) {
    console.error('Update admin settings error:', err);
    res.status(500).json({ error: err.message || 'Error updating admin settings' });
  }
});

/**
 * POST /api/admin/settings/process-all-users - Process all users with new settings
 */
router.post('/settings/process-all-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ 
      pointsWallet: { $gt: 0 },
      isVirtual: { $ne: true }
    }).select('_id name email pointsWallet virtualReferralsCreated');
    
    let processedCount = 0;
    let totalVirtualTreesCreated = 0;
    let totalCashConverted = 0;
    const results = [];
    
    for (const user of users) {
      try {
        const result = await processUserPointsWithPriority(user._id);
        
        results.push({
          userId: user._id,
          name: user.name,
          email: user.email,
          virtualTreesCreated: result.virtualTreesCreated,
          cashConverted: result.cashConverted,
          finalPointsBalance: result.finalPointsBalance,
          finalCashBalance: result.finalCashBalance
        });
        
        totalVirtualTreesCreated += result.virtualTreesCreated;
        totalCashConverted += result.cashConverted;
        processedCount++;
        
      } catch (userError) {
        console.error(`Error processing user ${user.email}:`, userError);
        results.push({
          userId: user._id,
          name: user.name,
          email: user.email,
          error: userError.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${processedCount} users with new settings`,
      summary: {
        usersProcessed: processedCount,
        totalUsers: users.length,
        totalVirtualTreesCreated,
        totalCashConverted
      },
      results
    });
    
  } catch (err) {
    console.error('Process all users error:', err);
    res.status(500).json({ error: 'Error processing users with new settings' });
  }
});

/**
 * GET /api/admin/settings/stats - Get system statistics
 */
router.get('/settings/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    // Get user statistics
    const totalUsers = await User.countDocuments({ isVirtual: { $ne: true } });
    const virtualUsers = await User.countDocuments({ isVirtual: true });
    const usersWithPoints = await User.countDocuments({ 
      pointsWallet: { $gt: 0 },
      isVirtual: { $ne: true }
    });
    
    // Get users at max virtual trees
    const usersAtMaxVirtual = await User.countDocuments({
      virtualReferralsCreated: { $gte: settings.virtualTreeSettings.maxVirtualTreesPerUser },
      isVirtual: { $ne: true }
    });
    
    // Calculate total points and cash
    const pointsStats = await User.aggregate([
      { $match: { isVirtual: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalPointsInSystem: { $sum: '$pointsWallet' },
          totalCashInSystem: { $sum: '$wallet' },
          totalPointsEarned: { $sum: '$totalPointsEarned' }
        }
      }
    ]);
    
    const stats = pointsStats[0] || {
      totalPointsInSystem: 0,
      totalCashInSystem: 0,
      totalPointsEarned: 0
    };
    
    // Calculate conversion rates
    const conversionRate = settings.cashConversionSettings.cashPerConversion / settings.cashConversionSettings.pointsPerConversion;
    const virtualTreeCost = settings.virtualTreeSettings.pointsPerVirtualTree;
    
    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          virtual: virtualUsers,
          withPoints: usersWithPoints,
          atMaxVirtual: usersAtMaxVirtual
        },
        points: {
          totalInSystem: stats.totalPointsInSystem,
          totalEverEarned: stats.totalPointsEarned,
          totalCashInSystem: stats.totalCashInSystem
        },
        rates: {
          pointsToCashRate: conversionRate,
          virtualTreeCost: virtualTreeCost,
          maxVirtualTreesPerUser: settings.virtualTreeSettings.maxVirtualTreesPerUser
        },
        settings: {
          virtualTreesEnabled: settings.virtualTreeSettings.enabled,
          cashConversionEnabled: settings.cashConversionSettings.enabled,
          autoCreateEnabled: settings.virtualTreeSettings.autoCreateEnabled
        }
      }
    });
    
  } catch (err) {
    console.error('Get admin stats error:', err);
    res.status(500).json({ error: 'Error fetching system statistics' });
  }
});

module.exports = router;
