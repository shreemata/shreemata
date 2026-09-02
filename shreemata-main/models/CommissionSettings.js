const mongoose = require('mongoose');

const commissionSettingsSchema = new mongoose.Schema({
  // There should only be one settings document
  settingsId: {
    type: String,
    default: 'default',
    unique: true
  },
  
  // Direct commission percentage (default 3%)
  directCommissionPercent: {
    type: Number,
    default: 3,
    min: 0,
    max: 100
  },

  // Referral commission percentage (default 2%)
  referralCommissionPercent: {
    type: Number,
    default: 2,
    min: 0,
    max: 100
  },
  
  // Admin Commission Share percentage (default 0%)
  adminCommissionPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Tree commission levels with halving pattern
  // Level 1: 2%, Level 2: 1%, Level 3: 0.5%, etc.
  treeCommissionLevels: [{
    level: Number,
    percentage: Number
  }],
  
  // Maximum tree commission pool (default 4%)
  treeCommissionPoolPercent: {
    type: Number,
    default: 4,
    min: 0,
    max: 100
  },
  
  // Trust Fund percentage (default 1%)
  trustFundPercent: {
    type: Number,
    default: 1,
    min: 0,
    max: 100
  },
  
  // Development Trust Fund percentage (default 0%)
  developmentFundPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Total allocation percentage (should always be 10%)
  totalAllocationPercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },

  // Direct Commission fallback recipient when purchaser has no referrer
  directFallbackRecipient: {
    type: String,
    enum: ['trust_fund', 'admin'],
    default: 'trust_fund'
  },
  
  // Referral Commission fallback recipient when purchaser has no referrer
  referralFallbackRecipient: {
    type: String,
    enum: ['split_admin_trust', 'admin', 'trust_fund'],
    default: 'split_admin_trust'
  },
  
  // Minimum withdrawal amount (default ₹100)
  minimumWithdrawalAmount: {
    type: Number,
    default: 100,
    min: 1
  },
  
  // Minimum purchase amount for tree placement (default ₹0 - no minimum)
  minimumTreePlacementAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Shipping Settings
  // Base shipping charge (default ₹50)
  baseShippingCharge: {
    type: Number,
    default: 50,
    min: 0
  },
  
  // Shipping rate per kg (default ₹25)
  shippingRatePerKg: {
    type: Number,
    default: 25,
    min: 0
  },
  
  // Free shipping threshold (default ₹500, 0 = disabled)
  freeShippingThreshold: {
    type: Number,
    default: 500,
    min: 0
  },
  
  // Weight-based shipping rates
  shippingRates: [{
    minWeight: {
      type: Number,
      required: true,
      min: 0
    },
    maxWeight: {
      type: Number,
      required: true,
      min: 0
    },
    rate: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Store Details for Pickup
  storeName: {
    type: String,
    default: 'Shree Mata'
  },
  
  storeAddress: {
    type: String,
    default: 'Main Road, Your City'
  },
  
  storePhone: {
    type: String,
    default: '+91 9449171605'
  },
  
  storeHours: {
    type: String,
    default: 'Mon-Sat 10AM-8PM, Sun 11AM-6PM'
  },
  
  pickupInstructions: {
    type: String,
    default: "We'll call you when your order is ready for pickup!"
  },
  
  storeMapLink: {
    type: String,
    default: ''
  },
  
  // Last updated by
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Method to get or create default settings
commissionSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ settingsId: 'default' });
  
  if (!settings) {
    // Create default settings with halving pattern
    settings = await this.create({
      settingsId: 'default',
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      adminCommissionPercent: 0,
      treeCommissionPoolPercent: 4,
      trustFundPercent: 1,
      developmentFundPercent: 0,
      totalAllocationPercent: 10,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'split_admin_trust',
      minimumWithdrawalAmount: 100,
      minimumTreePlacementAmount: 0, // No minimum by default
      baseShippingCharge: 50,
      shippingRatePerKg: 25,
      freeShippingThreshold: 500,
      storeName: 'Shree Mata',
      storeAddress: 'Main Road, Your City',
      storePhone: '+91 9449171605',
      storeHours: 'Mon-Sat 10AM-8PM, Sun 11AM-6PM',
      pickupInstructions: "We'll call you when your order is ready for pickup!",
      treeCommissionLevels: [
        { level: 1, percentage: 2 },
        { level: 2, percentage: 1 },
        { level: 3, percentage: 0.5 },
        { level: 4, percentage: 0.25 },
        { level: 5, percentage: 0.125 }
      ]
    });
  }
  
  return settings;
};

// Method to validate total doesn't exceed 10%
commissionSettingsSchema.methods.validateTotal = function() {
  const total = (this.directCommissionPercent || 0) + 
                (this.referralCommissionPercent || 0) + 
                (this.adminCommissionPercent || 0) + 
                (this.treeCommissionPoolPercent || 0) + 
                (this.trustFundPercent || 0) + 
                (this.developmentFundPercent || 0);
  
  const tolerance = 0.001;
  const isTotalValid = Math.abs(total - this.totalAllocationPercent) < tolerance;
  
  // Validate tree levels sum equals treeCommissionPoolPercent
  let treeLevelsSum = 0;
  if (this.treeCommissionLevels && this.treeCommissionLevels.length > 0) {
    treeLevelsSum = this.treeCommissionLevels.reduce((sum, lvl) => sum + (lvl.percentage || 0), 0);
  }
  const isTreeSumValid = Math.abs(treeLevelsSum - this.treeCommissionPoolPercent) < tolerance;
  
  return isTotalValid && isTreeSumValid;
};

module.exports = mongoose.model('CommissionSettings', commissionSettingsSchema);
