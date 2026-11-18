// models/ProfitAuditLog.js
// Audit log tracking admin profit changes on books and bundles
const mongoose = require('mongoose');

const profitAuditLogSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ['book', 'bundle'],
    required: true,
    index: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  itemTitle: {
    type: String,
    default: ''
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminEmail: {
    type: String,
    default: ''
  },
  adminName: {
    type: String,
    default: ''
  },
  oldProfitType: {
    type: String,
    default: 'fixed'
  },
  oldProfitValue: {
    type: Number,
    default: 0
  },
  newProfitType: {
    type: String,
    required: true
  },
  newProfitValue: {
    type: Number,
    required: true
  },
  changeReason: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('ProfitAuditLog', profitAuditLogSchema);
