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

// Update settings method
adminSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
  const settings = await this.getSettings();
  
  // Merge updates
  if (updates.virtualTreeSettings) {
    Object.assign(settings.virtualTreeSettings, updates.virtualTreeSettings);
  }
  if (updates.cashConversionSettings) {
    Object.assign(settings.cashConversionSettings, updates.cashConversionSettings);
  }
  if (updates.pointsEarningSettings) {
    Object.assign(settings.pointsEarningSettings, updates.pointsEarningSettings);
  }
  if (updates.commissionSettings) {
    Object.assign(settings.commissionSettings, updates.commissionSettings);
  }
  if (updates.systemSettings) {
    Object.assign(settings.systemSettings, updates.systemSettings);
  }
  
  settings.lastUpdated = new Date();
  settings.updatedBy = updatedBy;
  
  await settings.save();
  console.log('Admin settings updated by:', updatedBy);
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);