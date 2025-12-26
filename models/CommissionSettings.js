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
  
  // Tree commission levels with halving pattern
  // Level 1: 1.5%, Level 2: 0.75%, Level 3: 0.375%, etc.
  treeCommissionLevels: [{
    level: Number,
    percentage: Number
  }],
  
  // Maximum tree commission pool (default 3%)
  treeCommissionPoolPercent: {
    type: Number,
    default: 3,
    min: 0,
    max: 100
  },
  
  // Trust Fund percentage (default 3%)
  trustFundPercent: {
    type: Number,
    default: 3,
    min: 0,
    max: 100
  },
  
  // Development Trust Fund percentage (default 1%)
  developmentFundPercent: {
    type: Number,
    default: 1,
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
  
  // Minimum withdrawal amount (default ₹100)
  minimumWithdrawalAmount: {
    type: Number,
    default: 100,
    min: 1
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
      treeCommissionPoolPercent: 3,
      trustFundPercent: 3,
      developmentFundPercent: 1,
      totalAllocationPercent: 10,
      minimumWithdrawalAmount: 100,
      baseShippingCharge: 50,
      shippingRatePerKg: 25,
      freeShippingThreshold: 500,
      storeName: 'Shree Mata',
      storeAddress: 'Main Road, Your City',
      storePhone: '+91 9449171605',
      storeHours: 'Mon-Sat 10AM-8PM, Sun 11AM-6PM',
      pickupInstructions: "We'll call you when your order is ready for pickup!",
      treeCommissionLevels: [
        { level: 1, percentage: 1.5 },
        { level: 2, percentage: 0.75 },
        { level: 3, percentage: 0.375 },
        { level: 4, percentage: 0.1875 },
        { level: 5, percentage: 0.09375 }
      ]
    });
  }
  
  return settings;
};

// Method to validate total doesn't exceed 10%
commissionSettingsSchema.methods.validateTotal = function() {
  const total = this.directCommissionPercent + 
                this.treeCommissionPoolPercent + 
                this.trustFundPercent + 
                this.developmentFundPercent;
  
  return total <= this.totalAllocationPercent;
};

module.exports = mongoose.model('CommissionSettings', commissionSettingsSchema);
