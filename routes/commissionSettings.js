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
   GET /api/shipping-settings (PUBLIC)
   Get shipping settings for cart calculations
--------------------------------------------*/
router.get("/shipping-settings", async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    // Return both legacy and new shipping settings
    res.json({ 
      shippingSettings: {
        baseShippingCharge: settings.baseShippingCharge,
        shippingRatePerKg: settings.shippingRatePerKg,
        freeShippingThreshold: settings.freeShippingThreshold,
        shippingRates: settings.shippingRates || [
          { minWeight: 0, maxWeight: 0.99, rate: 25 },
          { minWeight: 1, maxWeight: 1.99, rate: 35 },
          { minWeight: 2, maxWeight: 2.99, rate: 45 },
          { minWeight: 3, maxWeight: 4.99, rate: 55 },
          { minWeight: 5, maxWeight: 9.99, rate: 75 }
        ]
      }
    });
  } catch (err) {
    console.error("Error fetching shipping settings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/store-details
   Get store details for pickup (public endpoint)
--------------------------------------------*/
router.get("/store-details", async (req, res) => {
  try {
    const settings = await CommissionSettings.getSettings();
    
    // Only return store-related settings, not commission data
    res.json({ 
      storeName: settings.storeName,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeHours: settings.storeHours,
      pickupInstructions: settings.pickupInstructions,
      storeMapLink: settings.storeMapLink
    });
  } catch (err) {
    console.error("Error fetching store details:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   PUT /api/admin/commission-settings
   Update commission settings
--------------------------------------------*/
router.put("/commission-settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('🔍 Commission settings update request received');
    console.log('📦 Request body:', req.body);
    
    const {
      directCommissionPercent,
      treeCommissionPoolPercent,
      trustFundPercent,
      developmentFundPercent,
      minimumWithdrawalAmount,
      baseShippingCharge,
      shippingRatePerKg,
      freeShippingThreshold,
      shippingRates,
      storeName,
      storeAddress,
      storePhone,
      storeHours,
      pickupInstructions,
      storeMapLink,
      treeCommissionLevels
    } = req.body;
    
    console.log('🚚 Shipping fields received:', {
      baseShippingCharge,
      shippingRatePerKg,
      freeShippingThreshold
    });
    
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
    if (baseShippingCharge !== undefined) {
      settings.baseShippingCharge = baseShippingCharge;
    }
    if (shippingRatePerKg !== undefined) {
      settings.shippingRatePerKg = shippingRatePerKg;
    }
    if (freeShippingThreshold !== undefined) {
      settings.freeShippingThreshold = freeShippingThreshold;
    }
    if (shippingRates !== undefined) {
      settings.shippingRates = shippingRates;
      console.log('📦 Updated shipping rates:', shippingRates);
    }
    if (storeName !== undefined) {
      settings.storeName = storeName;
    }
    if (storeAddress !== undefined) {
      settings.storeAddress = storeAddress;
    }
    if (storePhone !== undefined) {
      settings.storePhone = storePhone;
    }
    if (storeHours !== undefined) {
      settings.storeHours = storeHours;
    }
    if (pickupInstructions !== undefined) {
      settings.pickupInstructions = pickupInstructions;
    }
    if (storeMapLink !== undefined) {
      settings.storeMapLink = storeMapLink;
    }
    
    console.log('💾 Settings after update:', {
      baseShippingCharge: settings.baseShippingCharge,
      shippingRatePerKg: settings.shippingRatePerKg,
      freeShippingThreshold: settings.freeShippingThreshold,
      minimumWithdrawalAmount: settings.minimumWithdrawalAmount
    });
    
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
