const mongoose = require("mongoose");

const otpSendLimitSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    sendCount: {
      type: Number,
      required: true,
      default: 0
    },
    lastSentAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// TTL index to automatically purge records after 24 hours of inactivity
otpSendLimitSchema.index({ lastSentAt: 1 }, { expireAfterSeconds: 86400 });

// Model for IP rate limiting
const otpIpLimitSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    count: {
      type: Number,
      required: true,
      default: 0
    },
    firstSentAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

otpIpLimitSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

const OtpSendLimit = mongoose.model("OtpSendLimit", otpSendLimitSchema);
const OtpIpLimit = mongoose.model("OtpIpLimit", otpIpLimitSchema);

// Model for Daily IP rate limiting (24-hour fixed window / TTL)
const otpDailyIpLimitSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    count: {
      type: Number,
      required: true,
      default: 0
    },
    firstSentAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

otpDailyIpLimitSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

const OtpDailyIpLimit = mongoose.model("OtpDailyIpLimit", otpDailyIpLimitSchema);

module.exports = OtpSendLimit;
module.exports.OtpIpLimit = OtpIpLimit;
module.exports.OtpDailyIpLimit = OtpDailyIpLimit;

