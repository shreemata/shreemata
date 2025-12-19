const express = require("express");
const router = express.Router();
const CommissionSettings = require("../models/CommissionSettings");
const { authenticateToken, isAdmin } = require("../middleware/auth");

/* -------------------------------------------
   GET /api/admin/commission-settings
   Get current commission settings
--------------------------------------------*/
router.get("/commission-settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    res.json({ settings });
  } catch (err) {
    console.error("Error fetching commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   PUT /api/admin/commission-settings
   Update commission settings
--------------------------------------------*/
router.put("/commission-settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      directCommissionPercent,
      treeCommissionPoolPercent,
      trustFundPercent,
      developmentFundPercent,
      minimumWithdrawalAmount,
      treeCommissionLevels
    } = req.body;
    
    let settings = await CommissionSettings.getSettings();
    
    // Update fields if provided
    if (directCommissionPercent !== undefined) {
      settings.directCommissionPercent = directCommissionPercent;
    }
    if (treeCommissionPoolPercent !== undefined) {
      settings.treeCommissionPoolPercent = treeCommissionPoolPercent;
    }
    if (trustFundPercent !== undefined) {
      settings.trustFundPercent = trustFundPercent;
    }
    if (developmentFundPercent !== undefined) {
      settings.developmentFundPercent = developmentFundPercent;
    }
    if (treeCommissionLevels !== undefined) {
      settings.treeCommissionLevels = treeCommissionLevels;
    }
    if (minimumWithdrawalAmount !== undefined) {
      settings.minimumWithdrawalAmount = minimumWithdrawalAmount;
    }
    
    // Validate total doesn't exceed 10%
    if (!settings.validateTotal()) {
      return res.status(400).json({ 
        error: "Total commission allocation cannot exceed 10%" 
      });
    }
    
    settings.updatedBy = req.user.userId;
    await settings.save();
    
    res.json({ 
      message: "Commission settings updated successfully",
      settings 
    });
  } catch (err) {
    console.error("Error updating commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/admin/commission-settings/reset
   Reset to default settings
--------------------------------------------*/
router.post("/commission-settings/reset", authenticateToken, isAdmin, async (req, res) => {
  try {
    await CommissionSettings.deleteMany({});
    const settings = await CommissionSettings.getSettings();
    
    res.json({ 
      message: "Commission settings reset to defaults",
      settings 
    });
  } catch (err) {
    console.error("Error resetting commission settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
