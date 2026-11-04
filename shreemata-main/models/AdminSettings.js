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
  
  // Read Notes Monthly Subscription Settings (Legacy support)
  readNotesSubscriptionSettings: {
    monthlyPrice: { type: Number, default: 99, min: 1 },
    enabled: { type: Boolean, default: true },
    description: { type: String, default: 'Monthly unlimited access to all digital study notes' }
  },

  // 4-Section Subscription Plans Configuration
  sectionSubscriptionPlans: {
    notes: {
      name: { type: String, default: 'Study Notes Pass', trim: true },
      price: { type: Number, default: 99, min: 1 },
      durationDays: { type: Number, default: 30, min: 1 },
      active: { type: Boolean, default: true },
      description: { type: String, default: 'Monthly unlimited access to all digital study notes', trim: true }
    },
    question_papers: {
      name: { type: String, default: 'Question Papers Pass', trim: true },
      price: { type: Number, default: 99, min: 1 },
      durationDays: { type: Number, default: 30, min: 1 },
      active: { type: Boolean, default: false },
      description: { type: String, default: 'Access to question papers and solved model papers', trim: true }
    },
    videos: {
      name: { type: String, default: 'Video Lectures Pass', trim: true },
      price: { type: Number, default: 199, min: 1 },
      durationDays: { type: Number, default: 30, min: 1 },
      active: { type: Boolean, default: false },
      description: { type: String, default: 'Unlimited streaming access to video lectures', trim: true }
    }
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

// Authoritative per-section plan resolver
adminSettingsSchema.statics.getSectionPlan = function(settings, section = 'notes') {
  const validSections = ['notes', 'question_papers', 'videos'];
  const targetSection = validSections.includes(section) ? section : 'notes';
  
  const plans = settings?.sectionSubscriptionPlans;
  const targetPlan = plans?.[targetSection];

  // If notes plan is not fully defined, fall back to readNotesSubscriptionSettings
  if (targetSection === 'notes') {
    const legacy = settings?.readNotesSubscriptionSettings;
    const legacyPrice = (legacy && typeof legacy.monthlyPrice === 'number' && legacy.monthlyPrice >= 1) ? legacy.monthlyPrice : 99;
    const legacyActive = (legacy && typeof legacy.enabled === 'boolean') ? legacy.enabled : true;
    const legacyDesc = (legacy && typeof legacy.description === 'string' && legacy.description.trim()) ? legacy.description : 'Monthly unlimited access to all digital study notes';

    return {
      name: (targetPlan && targetPlan.name) ? targetPlan.name : 'Study Notes Pass',
      price: (targetPlan && typeof targetPlan.price === 'number' && targetPlan.price >= 1) ? targetPlan.price : legacyPrice,
      durationDays: (targetPlan && typeof targetPlan.durationDays === 'number' && targetPlan.durationDays >= 1) ? targetPlan.durationDays : 30,
      active: (targetPlan && typeof targetPlan.active === 'boolean') ? targetPlan.active : legacyActive,
      description: (targetPlan && targetPlan.description) ? targetPlan.description : legacyDesc
    };
  }

  if (targetSection === 'question_papers') {
    return {
      name: (targetPlan && targetPlan.name) ? targetPlan.name : 'Question Papers Pass',
      price: (targetPlan && typeof targetPlan.price === 'number' && targetPlan.price >= 1) ? targetPlan.price : 99,
      durationDays: (targetPlan && typeof targetPlan.durationDays === 'number' && targetPlan.durationDays >= 1) ? targetPlan.durationDays : 30,
      active: (targetPlan && typeof targetPlan.active === 'boolean') ? targetPlan.active : false,
      description: (targetPlan && targetPlan.description) ? targetPlan.description : 'Access to question papers and solved model papers'
    };
  }

  // videos
  return {
    name: (targetPlan && targetPlan.name) ? targetPlan.name : 'Video Lectures Pass',
    price: (targetPlan && typeof targetPlan.price === 'number' && targetPlan.price >= 1) ? targetPlan.price : 199,
    durationDays: (targetPlan && typeof targetPlan.durationDays === 'number' && targetPlan.durationDays >= 1) ? targetPlan.durationDays : 30,
    active: (targetPlan && typeof targetPlan.active === 'boolean') ? targetPlan.active : false,
    description: (targetPlan && targetPlan.description) ? targetPlan.description : 'Unlimited streaming access to video lectures'
  };
};

// Pure in-memory document method to apply partial updates cleanly
adminSettingsSchema.methods.applyUpdates = function(updates) {
  if (!updates || typeof updates !== 'object') {
    return this;
  }

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

  // Handle sectionSubscriptionPlans partial updates
  if (updates.sectionSubscriptionPlans && typeof updates.sectionSubscriptionPlans === 'object') {
    if (!this.sectionSubscriptionPlans) {
      this.sectionSubscriptionPlans = {};
    }
    const sections = ['notes', 'question_papers', 'videos'];
    for (const sec of sections) {
      const secUpdate = updates.sectionSubscriptionPlans[sec];
      if (secUpdate && typeof secUpdate === 'object') {
        if (!this.sectionSubscriptionPlans[sec]) {
          this.sectionSubscriptionPlans[sec] = {};
        }
        if (secUpdate.name !== undefined && typeof secUpdate.name === 'string') {
          this.sectionSubscriptionPlans[sec].name = secUpdate.name.trim();
        }
        if (secUpdate.price !== undefined && typeof secUpdate.price === 'number' && secUpdate.price >= 1) {
          this.sectionSubscriptionPlans[sec].price = secUpdate.price;
          if (sec === 'notes') {
            if (!this.readNotesSubscriptionSettings) this.readNotesSubscriptionSettings = {};
            this.readNotesSubscriptionSettings.monthlyPrice = secUpdate.price;
          }
        }
        if (secUpdate.durationDays !== undefined && typeof secUpdate.durationDays === 'number' && secUpdate.durationDays >= 1) {
          this.sectionSubscriptionPlans[sec].durationDays = secUpdate.durationDays;
        }
        if (secUpdate.active !== undefined && typeof secUpdate.active === 'boolean') {
          this.sectionSubscriptionPlans[sec].active = secUpdate.active;
          if (sec === 'notes') {
            if (!this.readNotesSubscriptionSettings) this.readNotesSubscriptionSettings = {};
            this.readNotesSubscriptionSettings.enabled = secUpdate.active;
          }
        }
        if (secUpdate.description !== undefined && typeof secUpdate.description === 'string') {
          this.sectionSubscriptionPlans[sec].description = secUpdate.description.trim();
          if (sec === 'notes') {
            if (!this.readNotesSubscriptionSettings) this.readNotesSubscriptionSettings = {};
            this.readNotesSubscriptionSettings.description = secUpdate.description.trim();
          }
        }
      }
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
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
