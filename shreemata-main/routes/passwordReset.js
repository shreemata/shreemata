const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const PasswordResetRequest = require("../models/PasswordResetRequest");
const { authenticateToken, isAdmin } = require("../middleware/auth");

// Predefined security questions
const SECURITY_QUESTIONS = [
  "What is your pet's name?",
  "What was your childhood nickname?",
  "What is your school name?",
  "What is your favorite dish?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What is your first car model?",
  "What is your favorite color?",
  "What is your best friend's name?"
];

/* -------------------------------------------
   GET /api/password-reset/security-questions
   Get list of available security questions
--------------------------------------------*/
router.get("/security-questions", (req, res) => {
  res.json({
    success: true,
    questions: SECURITY_QUESTIONS
  });
});

/* -------------------------------------------
   POST /api/password-reset/setup-security
   Setup security questions during registration
--------------------------------------------*/
router.post("/setup-security", authenticateToken, async (req, res) => {
  try {
    const { question1, answer1, question2, answer2, question3, answer3 } = req.body;
    
    // Validate input
    if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
      return res.status(400).json({
        success: false,
        error: "All security questions and answers are required"
      });
    }
    
    // Ensure all questions are different
    if (question1 === question2 || question2 === question3 || question1 === question3) {
      return res.status(400).json({
        success: false,
        error: "Please select different security questions"
      });
    }
    
    // Validate questions are from predefined list
    if (!SECURITY_QUESTIONS.includes(question1) || 
        !SECURITY_QUESTIONS.includes(question2) || 
        !SECURITY_QUESTIONS.includes(question3)) {
      return res.status(400).json({
        success: false,
        error: "Invalid security questions selected"
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    // Hash the answers for security
    const hashedAnswer1 = await bcrypt.hash(answer1.toLowerCase().trim(), 10);
    const hashedAnswer2 = await bcrypt.hash(answer2.toLowerCase().trim(), 10);
    const hashedAnswer3 = await bcrypt.hash(answer3.toLowerCase().trim(), 10);
    
    // Update user security questions
    user.securityQuestions = {
      question1: { question: question1, answer: hashedAnswer1 },
      question2: { question: question2, answer: hashedAnswer2 },
      question3: { question: question3, answer: hashedAnswer3 },
      isSetup: true
    };
    
    await user.save();
    
    res.json({
      success: true,
      message: "Security questions setup successfully"
    });
    
  } catch (error) {
    console.error("Error setting up security questions:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* -------------------------------------------
   POST /api/password-reset/get-questions
   Get user's security questions for password reset
--------------------------------------------*/
router.post("/get-questions", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    if (!user.securityQuestions.isSetup) {
      return res.status(400).json({
        success: false,
        error: "Security questions not setup for this account"
      });
    }
    
    // Return only the questions, not the answers
    res.json({
      success: true,
      questions: {
        question1: user.securityQuestions.question1.question,
        question2: user.securityQuestions.question2.question,
        question3: user.securityQuestions.question3.question
      },
      userId: user._id
    });
    
  } catch (error) {
    console.error("Error getting security questions:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* -------------------------------------------
   POST /api/password-reset/submit-request
   Submit password reset request with security answers
--------------------------------------------*/
router.post("/submit-request", async (req, res) => {
  try {
    const { userId, answer1, answer2, answer3, newPassword, confirmPassword } = req.body;
    
    // Validate input
    if (!userId || !answer1 || !answer2 || !answer3 || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "All fields are required"
      });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "Passwords do not match"
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long"
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    if (!user.securityQuestions.isSetup) {
      return res.status(400).json({
        success: false,
        error: "Security questions not setup for this account"
      });
    }
    
    // Check if there's already a pending request
    const existingRequest = await PasswordResetRequest.findOne({
      userId: userId,
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: "A password reset request is already pending approval"
      });
    }
    
    // Verify security answers against stored hashes
    console.log('🔍 Verifying security answers for user:', user.email);
    console.log('Answer 1 provided:', answer1.toLowerCase().trim());
    console.log('Answer 2 provided:', answer2.toLowerCase().trim());
    console.log('Answer 3 provided:', answer3.toLowerCase().trim());
    
    const answer1Match = await bcrypt.compare(answer1.toLowerCase().trim(), user.securityQuestions.question1.answer);
    const answer2Match = await bcrypt.compare(answer2.toLowerCase().trim(), user.securityQuestions.question2.answer);
    const answer3Match = await bcrypt.compare(answer3.toLowerCase().trim(), user.securityQuestions.question3.answer);
    
    console.log('Verification results:', {
      answer1Match,
      answer2Match,
      answer3Match
    });
    
    // Calculate match score
    const correctAnswers = [answer1Match, answer2Match, answer3Match].filter(Boolean).length;
    const matchPercentage = Math.round((correctAnswers / 3) * 100);
    
    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Create password reset request with verification results
    const resetRequest = new PasswordResetRequest({
      userId: userId,
      originalSecurityQuestions: {
        question1: {
          question: user.securityQuestions.question1.question,
          answer: user.securityQuestions.question1.answer
        },
        question2: {
          question: user.securityQuestions.question2.question,
          answer: user.securityQuestions.question2.answer
        },
        question3: {
          question: user.securityQuestions.question3.question,
          answer: user.securityQuestions.question3.answer
        }
      },
      resetAnswers: {
        answer1: answer1.toLowerCase().trim(),
        answer2: answer2.toLowerCase().trim(),
        answer3: answer3.toLowerCase().trim()
      },
      // Add verification results
      answerVerification: {
        answer1Correct: answer1Match,
        answer2Correct: answer2Match,
        answer3Correct: answer3Match,
        correctCount: correctAnswers,
        matchPercentage: matchPercentage
      },
      newPasswordHash: hashedNewPassword,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    await resetRequest.save();
    
    // Different response based on match percentage
    let message = "Password reset request submitted successfully.";
    if (matchPercentage === 100) {
      message += " All security answers matched - high priority for approval.";
    } else if (matchPercentage >= 67) {
      message += " Most security answers matched - pending admin review.";
    } else {
      message += " Some security answers didn't match - admin will review carefully.";
    }
    
    res.json({
      success: true,
      message: message,
      matchPercentage: matchPercentage
    });
    
  } catch (error) {
    console.error("Error submitting password reset request:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* -------------------------------------------
   GET /api/password-reset/admin/requests
   Get all password reset requests for admin
--------------------------------------------*/
router.get("/admin/requests", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status !== 'all') {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const requests = await PasswordResetRequest.find(query)
      .populate('userId', 'name email phone')
      .populate('processedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PasswordResetRequest.countDocuments(query);
    
    res.json({
      success: true,
      requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error("Error fetching password reset requests:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* -------------------------------------------
   POST /api/password-reset/admin/process
   Process password reset request (approve/reject)
--------------------------------------------*/
router.post("/admin/process", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { requestId, action, adminNotes = "" } = req.body;
    
    if (!requestId || !action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: "Invalid request parameters"
      });
    }
    
    const resetRequest = await PasswordResetRequest.findById(requestId)
      .populate('userId', 'name email');
    
    if (!resetRequest) {
      return res.status(404).json({
        success: false,
        error: "Password reset request not found"
      });
    }
    
    if (resetRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: "Request has already been processed"
      });
    }
    
    // Check if request has expired
    if (new Date() > resetRequest.expiresAt) {
      resetRequest.status = 'rejected';
      resetRequest.adminNotes = 'Request expired';
      resetRequest.processedBy = req.user.id;
      resetRequest.processedAt = new Date();
      await resetRequest.save();
      
      return res.status(400).json({
        success: false,
        error: "Request has expired"
      });
    }
    
    if (action === 'approve') {
      // Update user's password
      const user = await User.findById(resetRequest.userId);
      if (user) {
        user.password = resetRequest.newPasswordHash;
        await user.save();
      }
      
      resetRequest.status = 'approved';
    } else {
      resetRequest.status = 'rejected';
    }
    
    resetRequest.processedBy = req.user.id;
    resetRequest.processedAt = new Date();
    resetRequest.adminNotes = adminNotes;
    
    await resetRequest.save();
    
    res.json({
      success: true,
      message: `Password reset request ${action}d successfully`
    });
    
  } catch (error) {
    console.error("Error processing password reset request:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* -------------------------------------------
   POST /api/password-reset/test-answers
   Test endpoint to debug answer verification (REMOVE IN PRODUCTION)
--------------------------------------------*/
router.post("/test-answers", async (req, res) => {
  try {
    const { email, answer1, answer2, answer3 } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    if (!user.securityQuestions.isSetup) {
      return res.status(400).json({
        success: false,
        error: "Security questions not setup"
      });
    }
    
    // Test verification
    const processedAnswer1 = answer1.toLowerCase().trim();
    const processedAnswer2 = answer2.toLowerCase().trim();
    const processedAnswer3 = answer3.toLowerCase().trim();
    
    const answer1Match = await bcrypt.compare(processedAnswer1, user.securityQuestions.question1.answer);
    const answer2Match = await bcrypt.compare(processedAnswer2, user.securityQuestions.question2.answer);
    const answer3Match = await bcrypt.compare(processedAnswer3, user.securityQuestions.question3.answer);
    
    res.json({
      success: true,
      debug: {
        processedAnswers: {
          answer1: processedAnswer1,
          answer2: processedAnswer2,
          answer3: processedAnswer3
        },
        verification: {
          answer1Match,
          answer2Match,
          answer3Match
        },
        questions: {
          question1: user.securityQuestions.question1.question,
          question2: user.securityQuestions.question2.question,
          question3: user.securityQuestions.question3.question
        },
        hashedAnswersExist: {
          answer1: !!user.securityQuestions.question1.answer,
          answer2: !!user.securityQuestions.question2.answer,
          answer3: !!user.securityQuestions.question3.answer
        }
      }
    });
    
  } catch (error) {
    console.error("Error testing answers:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message
    });
  }
});

module.exports = router;