// models/TrustFund.js
const mongoose = require("mongoose");

const trustFundSchema = new mongoose.Schema({
  fundType: { 
    type: String, 
    enum: ['trust', 'development'], 
    required: true, 
    unique: true 
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  transactions: [{
    orderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Order' 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['order_allocation', 'remainder', 'withdrawal'], 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    description: String
  }],
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Method to add a transaction and update balance
trustFundSchema.methods.addTransaction = async function(amount, type, orderId, description, session = null) {
  // Validate amount
  if (typeof amount !== 'number') {
    throw new Error('Transaction amount must be a number');
  }

  // For withdrawals (negative amounts), check if sufficient balance exists
  if (amount < 0 && Math.abs(amount) > this.balance) {
    throw new Error(`Insufficient balance for withdrawal. Available: ${this.balance}, Requested: ${Math.abs(amount)}`);
  }

  // Calculate new balance
  const newBalance = this.balance + amount;

  // Prevent negative balance
  if (newBalance < 0) {
    throw new Error(`Transaction would result in negative balance. Current: ${this.balance}, Change: ${amount}`);
  }

  this.transactions.push({
    orderId,
    amount,
    type,
    timestamp: new Date(),
    description
  });
  this.balance = newBalance;
  this.lastUpdated = new Date();
  return this.save({ session });
};

// Method to update balance (for withdrawals)
trustFundSchema.methods.updateBalance = async function(amount) {
  // Validate amount
  if (typeof amount !== 'number') {
    throw new Error('Balance update amount must be a number');
  }

  const newBalance = this.balance + amount;

  // Prevent negative balance
  if (newBalance < 0) {
    throw new Error(`Balance update would result in negative balance. Current: ${this.balance}, Change: ${amount}`);
  }

  this.balance = newBalance;
  this.lastUpdated = new Date();
  return this.save();
};

module.exports = mongoose.model("TrustFund", trustFundSchema);
