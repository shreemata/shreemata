const mongoose = require("mongoose");

const passwordResetRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Original security questions and answers (from user profile)
  originalSecurityQuestions: {
    question1: {
      question: String,
      answer: String
    },
    question2: {
      question: String,
      answer: String
    },
    question3: {
      question: String,
      answer: String
    }
  },
  
  // New answers provided during password reset
  resetAnswers: {
    answer1: String,
    answer2: String,
    answer3: String
  },
  
  // Answer verification results
  answerVerification: {
    answer1Correct: { type: Boolean, default: false },
    answer2Correct: { type: Boolean, default: false },
    answer3Correct: { type: Boolean, default: false },
    correctCount: { type: Number, default: 0 },
    matchPercentage: { type: Number, default: 0 }
  },
  
  // New password (hashed)
  newPasswordHash: {
    type: String,
    required: true
  },
  
  // Request status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Admin who processed the request
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  processedAt: {
    type: Date,
    default: null
  },
  
  // Admin notes
  adminNotes: {
    type: String,
    default: ""
  },
  
  // Request metadata
  requestedAt: {
    type: Date,
    default: Date.now
  },
  
  ipAddress: String,
  userAgent: String,
  
  // Expiry (24 hours)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}, { timestamps: true });

// Index for cleanup of expired requests
passwordResetRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetRequest", passwordResetRequestSchema);