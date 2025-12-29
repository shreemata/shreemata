const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: { type: String, unique: true, sparse: true },
  password: String,

  // User role (user/admin/virtual)
  role: { type: String, default: "user" },

  // Virtual User Fields
  isVirtual: {
    type: Boolean,
    default: false
  },
  originalUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Delivery Address
  address: {
    street: { type: String, default: "" }, // Legacy field for backward compatibility
    homeAddress1: { type: String, default: "" },
    homeAddress2: { type: String, default: "" },
    streetName: { type: String, default: "" },
    landmark: { type: String, default: "" },
    village: { type: String, default: "" },
    taluk: { type: String, default: "" },
    district: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    phone: { type: String, default: "" }
  },

  // Referral System
  referralCode: { type: String, unique: true, sparse: true, index: true },    // Code generated for this user
  referredBy: { type: String, default: null, index: true },      // Referral code user applied
  wallet: { type: Number, default: 0 },             // Referral earnings
  referrals: { type: Number, default: 0 },          // Number of users referred
  firstPurchaseDone: { type: Boolean, default: false }, // Locks referral after 1st purchase

  // Security Questions for Password Reset
  securityQuestions: {
    question1: {
      question: { type: String, default: "" },
      answer: { type: String, default: "" }
    },
    question2: {
      question: { type: String, default: "" },
      answer: { type: String, default: "" }
    },
    question3: {
      question: { type: String, default: "" },
      answer: { type: String, default: "" }
    },
    isSetup: { type: Boolean, default: false }
  },

  // Tree Placement System
  treeParent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null,
    index: true
  },
  treeChildren: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  treeLevel: { 
    type: Number, 
    default: 0 
  },
  treePosition: { 
    type: Number, 
    default: 0 
  },

  // Commission Tracking
  directCommissionEarned: { 
    type: Number, 
    default: 0 
  },
  treeCommissionEarned: { 
    type: Number, 
    default: 0 
  },

  // Points System
  pointsWallet: { 
    type: Number, 
    default: 0 
  },
  totalPointsEarned: { 
    type: Number, 
    default: 0 
  },
  virtualReferralsCreated: { 
    type: Number, 
    default: 0 
  },

  // Metadata
  referralJoinedAt: Date,

  // Suspension System
  suspended: { 
    type: Boolean, 
    default: false,
    index: true
  },
  suspendedAt: Date,
  suspendedReason: String,
  suspendedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },

  // Withdrawal Requests
  withdrawals: [
    {
      amount: Number,
      upi: String,
      bank: String,
      bankName: String,  // Added bank name field
      ifsc: String,
      status: { type: String, default: "pending" }, // pending, approved, rejected
      requestedAt: { type: Date, default: Date.now },
      approvedAt: Date,
      
      // Transfer tracking fields
      transferId: String,        // Razorpay payout ID
      transferDate: Date,        // When transfer was initiated
      transferMethod: String,    // UPI, Bank Transfer, etc.
      transferError: String,     // Error message if transfer failed
      transferStatus: String     // queued, processing, processed, failed
    }
  ],

  // Secure Bank Details (One-time setup)
  bankDetails: {
    isSetup: { type: Boolean, default: false },
    setupDate: Date,
    
    // Bank Account Details
    accountNumber: String,
    accountHolderName: String,
    bankName: String,
    ifscCode: String,
    
    // UPI Details
    upiId: String,
    
    // Security & Verification
    isVerified: { type: Boolean, default: false },
    verificationDate: Date,
    lastModifiedBy: { type: String, default: 'user' }, // 'user' or 'admin'
    
    // Withdrawal Limits
    dailyLimit: { type: Number, default: 5000 },
    monthlyLimit: { type: Number, default: 50000 },
    
    // Admin Notes
    adminNotes: String
  },

  // Bank Detail Change Request System
  bankChangeRequest: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Withdrawal Statistics
  withdrawalStats: {
    totalWithdrawn: { type: Number, default: 0 },
    lastWithdrawalDate: Date,
    dailyWithdrawn: { type: Number, default: 0 },
    monthlyWithdrawn: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
  }
}, { timestamps: true });

// Compound index for efficient tree traversal and position queries
userSchema.index({ treeParent: 1, treePosition: 1 });

// Method to setup bank details (one-time only)
userSchema.methods.setupBankDetails = function(bankData) {
  if (this.bankDetails.isSetup) {
    throw new Error('Bank details already setup. Contact admin to make changes.');
  }
  
  this.bankDetails = {
    ...bankData,
    isSetup: true,
    setupDate: new Date(),
    lastModifiedBy: 'user'
  };
  
  return this.save();
};

// Method to check withdrawal limits
userSchema.methods.checkWithdrawalLimits = function(amount) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Reset daily/monthly counters if needed
  if (!this.withdrawalStats.lastResetDate || this.withdrawalStats.lastResetDate < today) {
    this.withdrawalStats.dailyWithdrawn = 0;
    this.withdrawalStats.lastResetDate = today;
  }
  
  if (!this.withdrawalStats.lastResetDate || this.withdrawalStats.lastResetDate < thisMonth) {
    this.withdrawalStats.monthlyWithdrawn = 0;
  }
  
  // Check limits
  const dailyRemaining = this.bankDetails.dailyLimit - this.withdrawalStats.dailyWithdrawn;
  const monthlyRemaining = this.bankDetails.monthlyLimit - this.withdrawalStats.monthlyWithdrawn;
  
  if (amount > dailyRemaining) {
    throw new Error(`Daily withdrawal limit exceeded. Remaining: ₹${dailyRemaining}`);
  }
  
  if (amount > monthlyRemaining) {
    throw new Error(`Monthly withdrawal limit exceeded. Remaining: ₹${monthlyRemaining}`);
  }
  
  return true;
};

// Method to update withdrawal stats
userSchema.methods.updateWithdrawalStats = function(amount) {
  this.withdrawalStats.totalWithdrawn += amount;
  this.withdrawalStats.dailyWithdrawn += amount;
  this.withdrawalStats.monthlyWithdrawn += amount;
  this.withdrawalStats.lastWithdrawalDate = new Date();
};

// Method to get masked bank details for display
userSchema.methods.getMaskedBankDetails = function() {
  if (!this.bankDetails.isSetup) return null;
  
  return {
    accountNumber: this.bankDetails.accountNumber ? 
      'XXXX' + this.bankDetails.accountNumber.slice(-4) : null,
    accountHolderName: this.bankDetails.accountHolderName,
    bankName: this.bankDetails.bankName,
    ifscCode: this.bankDetails.ifscCode,
    upiId: this.bankDetails.upiId ? 
      this.bankDetails.upiId.replace(/(.{2}).*(@.*)/, '$1****$2') : null,
    isVerified: this.bankDetails.isVerified,
    setupDate: this.bankDetails.setupDate,
    dailyLimit: this.bankDetails.dailyLimit,
    monthlyLimit: this.bankDetails.monthlyLimit
  };
};

module.exports = mongoose.model("User", userSchema);
