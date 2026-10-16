const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  // Virtual Tree Settings (Priority 1)
  virtualTreeSettings: {
    enabled: { type: Boolean, default: true },
    pointsPerVirtualTree: { type: Number, default: 100 }, // 100 points = 1 virtual tree
    maxVirtualTreesPerUser: { type: Number, default: 5 }, // Max 5 virtual trees per user
    autoCreateEnabled: { type: Boolean, default: true } // Auto-create when points earned
  },
  
  // Cash Conversion Settings (Priority 2)
  cashConversionSettings: {
    enabled: { type: Boolean, default: true },
    pointsPerConversion: { type: Number, default: 50 }, // 50 points per conversion
    cashPerConversion: { type: Number, default: 25 }, // ₹25 per conversion
    minimumPointsForConversion: { type: Number, default: 50 } // Minimum points needed
  },
  
  // Points Earning Settings
  pointsEarningSettings: {
    pointsPerRupeeSpent: { type: Number, default: 1 }, // ₹1 spent = 1 point
    bonusPointsOnFirstPurchase: { type: Number, default: 50 },
    bonusPointsOnReferral: { type: Number, default: 100 }
  },
  
  // Commission Settings
  commissionSettings: {
    directCommissionPercentage: { type: Number, default: 10 },
    treeCommissionPercentage: { type: Number, default: 5 },
    maxTreeLevels: { type: Number, default: 5 }
  },
  
  // System Settings
  systemSettings: {
    siteName: { type: String, default: 'Shreemata' },
    supportEmail: { type: String, default: 'support@shreemata.com' },
    maintenanceMode: { type: Boolean, default: false }
  },
  
  // Read Notes Monthly Subscription Settings
  readNotesSubscriptionSettings: {
    monthlyPrice: { type: Number, default: 99, min: 1 },
    enabled: { type: Boolean, default: true },
    description: { type: String, default: 'Monthly unlimited access to all digital study notes' }
  },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Ensure only one settings document exists
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
    console.log('Created default admin settings');
  }
  return settings;
};

// Safely resolve subscription configuration with defaults for legacy documents or lean queries
adminSettingsSchema.statics.getSubscriptionConfig = function(settings) {
  const sub = settings?.readNotesSubscriptionSettings;
  return {
    monthlyPrice: (sub && typeof sub.monthlyPrice === 'number' && sub.monthlyPrice >= 1) ? sub.monthlyPrice : 99,
    enabled: (sub && typeof sub.enabled === 'boolean') ? sub.enabled : true,
    description: (sub && typeof sub.description === 'string' && sub.description.trim()) ? sub.description : 'Monthly unlimited access to all digital study notes'
  };
};

// Pure in-memory document method to apply partial updates cleanly
adminSettingsSchema.methods.applyUpdates = function(updates) {
  if (!updates || typeof updates !== 'object') {
    return this;
  }

  // Merge updates for existing settings exactly as before
  if (updates.virtualTreeSettings) {
    if (!this.virtualTreeSettings) this.virtualTreeSettings = {};
    Object.assign(this.virtualTreeSettings, updates.virtualTreeSettings);
  }
  if (updates.cashConversionSettings) {
    if (!this.cashConversionSettings) this.cashConversionSettings = {};
    Object.assign(this.cashConversionSettings, updates.cashConversionSettings);
  }
  if (updates.pointsEarningSettings) {
    if (!this.pointsEarningSettings) this.pointsEarningSettings = {};
    Object.assign(this.pointsEarningSettings, updates.pointsEarningSettings);
  }
  if (updates.commissionSettings) {
    if (!this.commissionSettings) this.commissionSettings = {};
    Object.assign(this.commissionSettings, updates.commissionSettings);
  }
  if (updates.systemSettings) {
    if (!this.systemSettings) this.systemSettings = {};
    Object.assign(this.systemSettings, updates.systemSettings);
  }
  if (updates.readNotesSubscriptionSettings) {
    if (!this.readNotesSubscriptionSettings) {
      this.readNotesSubscriptionSettings = {};
    }
    // Ensure baseline defaults exist for any unset fields
    if (this.readNotesSubscriptionSettings.monthlyPrice === undefined) {
      this.readNotesSubscriptionSettings.monthlyPrice = 99;
    }
    if (this.readNotesSubscriptionSettings.enabled === undefined) {
      this.readNotesSubscriptionSettings.enabled = true;
    }
    if (!this.readNotesSubscriptionSettings.description) {
      this.readNotesSubscriptionSettings.description = 'Monthly unlimited access to all digital study notes';
    }

    const subUpdates = updates.readNotesSubscriptionSettings;
    if (subUpdates.monthlyPrice !== undefined) {
      this.readNotesSubscriptionSettings.monthlyPrice = subUpdates.monthlyPrice;
    }
    if (subUpdates.enabled !== undefined) {
      this.readNotesSubscriptionSettings.enabled = subUpdates.enabled;
    }
    if (subUpdates.description !== undefined) {
      this.readNotesSubscriptionSettings.description = subUpdates.description;
    }
  }

  return this;
};

// Update settings method
adminSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
  const settings = await this.getSettings();
  
  settings.applyUpdates(updates);
  
  settings.lastUpdated = new Date();
  settings.updatedBy = updatedBy;
  
  await settings.save();
  console.log('Admin settings updated by:', updatedBy);
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);