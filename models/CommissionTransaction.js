// models/CommissionTransaction.js
const mongoose = require("mongoose");

const commissionTransactionSchema = new mongoose.Schema({
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true,
    index: true
  },
  purchaser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  orderAmount: { 
    type: Number, 
    required: true 
  },
  
  // Direct Commission (3%)
  directReferrer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  directCommissionAmount: { 
    type: Number, 
    default: 0 
  },
  
  // Tree Commissions (up to 3% total)
  treeCommissions: [{
    recipient: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true
    },
    level: { 
      type: Number, 
      required: true 
    },
    percentage: { 
      type: Number, 
      required: true 
    },
    amount: { 
      type: Number, 
      required: true 
    }
  }],
  
  // Trust Funds
  trustFundAmount: { 
    type: Number, 
    default: 0 
  },
  devTrustFundAmount: { 
    type: Number, 
    default: 0 
  },
  remainderToDevFund: { 
    type: Number, 
    default: 0 
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  processedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index for efficient commission history queries by user and time
commissionTransactionSchema.index({ purchaser: 1, processedAt: 1 });

module.exports = mongoose.model("CommissionTransaction", commissionTransactionSchema);
