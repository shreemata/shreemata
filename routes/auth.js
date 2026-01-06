const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendEmailOTP, sendPasswordResetOTP } = require("../utils/emailService");

const router = express.Router();

// EMAIL OTP - Send OTP for email verification
router.post("/send-email-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid email format" 
      });
    }

    // Check if email is already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is already registered" 
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`📧 Generated email OTP for ${email}: ${otp}`);

    // Store OTP for email verification
    global.emailOtpStore = global.emailOtpStore || new Map();
    global.emailOtpStore.set(email, {
      otp: otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      isEmailVerification: true
    });

    // Send OTP via email
    try {
      const emailResult = await sendEmailOTP(email, otp);
      
      if (emailResult.success) {
        console.log(`Email OTP sent to ${email}: ${otp}`);
        res.json({
          success: true,
          message: "Verification code sent to your email"
        });
      } else {
        console.error('Email service error:', emailResult.error);
        res.status(500).json({ 
          success: false, 
          error: "Failed to send verification email. Please try again." 
        });
      }
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      res.status(500).json({ 
        success: false, 
        error: "Failed to send verification email. Please try again." 
      });
    }

  } catch (error) {
    console.error("Email OTP send error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error sending verification code. Please try again." 
    });
  }
});

// EMAIL OTP - Verify OTP for email verification
router.post("/verify-email-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and verification code are required" 
      });
    }

    // Get stored OTP data
    global.emailOtpStore = global.emailOtpStore || new Map();
    const storedData = global.emailOtpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        error: "Verification code not found or expired. Please request a new code." 
      });
    }

    // Check if OTP is expired
    if (Date.now() > storedData.expiresAt) {
      global.emailOtpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        error: "Verification code has expired. Please request a new code." 
      });
    }

    // Check attempt limit
    if (storedData.attempts >= 3) {
      global.emailOtpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        error: "Too many failed attempts. Please request a new code." 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      global.emailOtpStore.set(email, storedData);
      
      return res.status(400).json({ 
        success: false, 
        error: `Invalid verification code. ${3 - storedData.attempts} attempts remaining.` 
      });
    }

    // Mark email as verified
    storedData.verified = true;
    global.emailOtpStore.set(email, storedData);

    console.log(`Email OTP verified for ${email}`);

    res.json({
      success: true,
      message: "Email verified successfully"
    });

  } catch (error) {
    console.error("Email OTP verify error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error verifying code. Please try again." 
    });
  }
});

// FORGOT PASSWORD - Send Email OTP
router.post("/forgot-password-send-email-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid email format" 
      });
    }

    // Check if email exists in database
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: "No account found with this email address" 
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔐 Generated password reset OTP for ${email}: ${otp}`);

    // Store OTP for password reset
    global.passwordResetOtpStore = global.passwordResetOtpStore || new Map();
    global.passwordResetOtpStore.set(email, {
      otp: otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      userId: user._id,
      isPasswordReset: true
    });

    // Send OTP via email
    try {
      const emailResult = await sendPasswordResetOTP(email, otp);
      
      if (emailResult.success) {
        console.log(`Password reset OTP sent to ${email}: ${otp}`);
        res.json({
          success: true,
          message: "Password reset code sent to your email"
        });
      } else {
        console.error('Email service error:', emailResult.error);
        res.status(500).json({ 
          success: false, 
          error: "Failed to send password reset email. Please try again." 
        });
      }
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      res.status(500).json({ 
        success: false, 
        error: "Failed to send password reset email. Please try again." 
      });
    }

  } catch (error) {
    console.error("Password reset OTP send error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error sending password reset code. Please try again." 
    });
  }
});

// FORGOT PASSWORD - Verify Email OTP
router.post("/forgot-password-verify-email-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and verification code are required" 
      });
    }

    // Get stored OTP data
    global.passwordResetOtpStore = global.passwordResetOtpStore || new Map();
    const storedData = global.passwordResetOtpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        error: "Verification code not found or expired. Please request a new code." 
      });
    }

    // Check if OTP is expired
    if (Date.now() > storedData.expiresAt) {
      global.passwordResetOtpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        error: "Verification code has expired. Please request a new code." 
      });
    }

    // Check attempt limit
    if (storedData.attempts >= 3) {
      global.passwordResetOtpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        error: "Too many failed attempts. Please request a new code." 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      global.passwordResetOtpStore.set(email, storedData);
      
      return res.status(400).json({ 
        success: false, 
        error: `Invalid verification code. ${3 - storedData.attempts} attempts remaining.` 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: storedData.userId, email, type: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minutes to reset password
    );

    // Clear OTP from store
    global.passwordResetOtpStore.delete(email);

    console.log(`Password reset OTP verified for ${email}`);

    res.json({
      success: true,
      message: "Code verified successfully",
      resetToken
    });

  } catch (error) {
    console.error("Password reset OTP verify error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error verifying code. Please try again." 
    });
  }
});

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, referredBy } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password)
      return res.status(400).json({ 
        error: "All fields are required",
        code: "MISSING_FIELDS" 
      });

    // Check if email was verified
    global.emailOtpStore = global.emailOtpStore || new Map();
    const emailVerificationData = global.emailOtpStore.get(email);
    
    if (!emailVerificationData || !emailVerificationData.verified) {
      return res.status(400).json({ 
        error: "Please verify your email address before creating account",
        code: "EMAIL_NOT_VERIFIED" 
      });
    }

    // Clean up email OTP after successful verification check
    global.emailOtpStore.delete(email);

    // Validate phone number format (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ 
        error: "Invalid phone number format. Please enter 10 digits.",
        code: "INVALID_PHONE_FORMAT" 
      });
    }

    if (password.length < 6)
      return res.status(400).json({ 
        error: "Password must be at least 6 characters",
        code: "INVALID_PASSWORD_LENGTH" 
      });

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: "Invalid email format",
        code: "INVALID_EMAIL_FORMAT" 
      });
    }

    // Check for existing email or phone
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          error: "Email already registered",
          code: "EMAIL_EXISTS" 
        });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ 
          error: "Phone number already registered",
          code: "PHONE_EXISTS" 
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique referral code with retry logic
    async function generateUniqueReferralCode(maxRetries = 5) {
      for (let i = 0; i < maxRetries; i++) {
        const code = "REF" + Math.floor(100000 + Math.random() * 900000);
        const existingCode = await User.findOne({ referralCode: code });
        if (!existingCode) {
          return code;
        }
      }
      throw new Error("Unable to generate unique referral code");
    }

    let directReferrer = null;

    if (referredBy) {
      // Validate referral code format
      if (!/^REF\d{6}$/.test(referredBy)) {
        return res.status(400).json({ 
          error: "Invalid referral code format",
          code: "INVALID_REFERRAL_FORMAT" 
        });
      }

      // Find the direct referrer
      directReferrer = await User.findOne({ referralCode: referredBy });
      
      if (!directReferrer) {
        return res.status(400).json({ 
          error: "Referral code does not exist",
          code: "REFERRAL_CODE_NOT_FOUND" 
        });
      }
    }

    // Generate unique referral code
    let newReferralCode;
    try {
      newReferralCode = await generateUniqueReferralCode();
    } catch (error) {
      console.error("Referral code generation error:", error);
      return res.status(500).json({ 
        error: "Error generating referral code",
        code: "REFERRAL_CODE_GENERATION_ERROR" 
      });
    }

    // Create user WITHOUT tree placement (tree placement happens on first purchase only)
    const newUser = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role: "user",
      referralCode: newReferralCode,
      referredBy: referredBy || null,
      wallet: 0,
      referrals: 0,
      firstPurchaseDone: false,
      // Tree placement fields - will be set on first purchase
      treeParent: null,
      treeLevel: 0, // 0 means not yet placed in tree
      treePosition: 0,
      treeChildren: [],
      referralJoinedAt: referredBy ? new Date() : null
    });

    // Prevent self-referral check (after user creation to get their code)
    if (referredBy && referredBy === newUser.referralCode) {
      // This should never happen due to timing, but adding as safety check
      await User.findByIdAndDelete(newUser._id);
      return res.status(400).json({ 
        error: "Cannot refer yourself",
        code: "SELF_REFERRAL_NOT_ALLOWED" 
      });
    }

    // Update tree parent's children array and increment referrer's referral count
    if (referredBy && directReferrer) {
      // Increment direct referrer's referral count
      directReferrer.referrals += 1;
      await directReferrer.save();
      console.log(`Referral count incremented for ${directReferrer.email}: ${directReferrer.referrals}`);
    }

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        referralCode: newUser.referralCode
      }
    });

  } catch (err) {
    console.error("Signup error:", err);
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      if (err.keyPattern?.email) {
        return res.status(400).json({ 
          error: "Email already registered",
          code: "EMAIL_EXISTS" 
        });
      }
      if (err.keyPattern?.phone) {
        return res.status(400).json({ 
          error: "Phone number already registered",
          code: "PHONE_EXISTS" 
        });
      }
      if (err.keyPattern?.referralCode) {
        return res.status(500).json({ 
          error: "Error generating unique referral code",
          code: "REFERRAL_CODE_DUPLICATE" 
        });
      }
    }
    
    res.status(500).json({ 
      error: "Error creating user",
      code: "SIGNUP_ERROR" 
    });
  }
});

// LOGIN (Email & Password)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Invalid email or password" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Error logging in" });
  }
});

// LOGIN (Phone & Password)
router.post("/login-phone", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password)
      return res.status(400).json({ error: "Phone number and password are required" });

    // Validate phone format
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(400).json({ error: "Invalid phone or password" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ error: "Invalid phone or password" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error("Phone login error:", err);
    res.status(500).json({ error: "Error logging in" });
  }
});

// PHONE LOGIN - Send OTP
router.post("/login-send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: "Phone number is required" 
      });
    }

    // Validate phone number format
    if (!/^\d{10}$/.test(phone) || !/^[6-9]/.test(phone)) {
      return res.status(400).json({ 
        success: false, 
        error: "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9" 
      });
    }

    // Check if phone number is registered
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "This mobile number is not registered. Please sign up first." 
      });
    }

    // Initialize Twilio client
    const twilio = require("twilio");
    let client;
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        console.log("🔧 Initializing Twilio client for login OTP...");
        console.log("Account SID:", process.env.TWILIO_ACCOUNT_SID ? "✅ Set" : "❌ Missing");
        console.log("Auth Token:", process.env.TWILIO_AUTH_TOKEN ? "✅ Set" : "❌ Missing");
        console.log("Phone Number:", process.env.TWILIO_PHONE_NUMBER ? "✅ Set" : "❌ Missing");
        client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      } else {
        return res.status(500).json({ 
          success: false, 
          error: "SMS service not configured. Please contact support." 
        });
      }
    } catch (error) {
      console.error("Error initializing Twilio client:", error);
      return res.status(500).json({ 
        success: false, 
        error: "SMS service error. Please try again." 
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Use the same OTP storage as the regular OTP system
    // Import the otpStore from the otp routes
    const otpModule = require("./otp");
    
    // Store OTP with user info for login
    global.otpStore = global.otpStore || new Map();
    global.otpStore.set(phone, {
      otp: otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      userId: user._id, // Store user ID for login
      isLogin: true // Flag to identify login OTP
    });

    const formattedPhone = `+91${phone}`;
    
    try {
      await client.messages.create({
        body: `Your Shree Mata login OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone
      });

      console.log(`Login OTP sent to ${formattedPhone}: ${otp}`);

      res.json({
        success: true,
        message: "OTP sent to your registered mobile number",
        userName: user.name
      });

    } catch (twilioError) {
      console.error("Twilio error:", twilioError);
      
      // Handle specific Twilio errors
      if (twilioError.code === 21211) {
        return res.status(400).json({ 
          success: false, 
          error: "Please enter a valid mobile number." 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        error: "Failed to send OTP. Please check your number and try again." 
      });
    }

  } catch (error) {
    console.error("Login OTP send error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error sending OTP. Please try again." 
    });
  }
});

// PHONE LOGIN - Verify OTP and Login
router.post("/login-verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: "Phone number and OTP are required" 
      });
    }

    // Get stored OTP data from the same storage as regular OTP
    global.otpStore = global.otpStore || new Map();
    const storedData = global.otpStore.get(phone);

    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        error: "OTP not found or expired. Please request a new OTP." 
      });
    }

    // Check if OTP is expired
    if (Date.now() > storedData.expiresAt) {
      global.otpStore.delete(phone);
      return res.status(400).json({ 
        success: false, 
        error: "OTP has expired. Please request a new OTP." 
      });
    }

    // Check attempt limit
    if (storedData.attempts >= 3) {
      global.otpStore.delete(phone);
      return res.status(400).json({ 
        success: false, 
        error: "Too many failed attempts. Please request a new OTP." 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      global.otpStore.set(phone, storedData);
      
      return res.status(400).json({ 
        success: false, 
        error: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.` 
      });
    }

    // For login OTP, we need to get the user from the stored userId
    let user;
    if (storedData.isLogin && storedData.userId) {
      user = await User.findById(storedData.userId);
      if (!user) {
        global.otpStore.delete(phone);
        return res.status(404).json({ 
          success: false, 
          error: "User not found" 
        });
      }
    } else {
      // For regular signup OTP, find user by phone
      user = await User.findOne({ phone });
      if (!user) {
        global.otpStore.delete(phone);
        return res.status(404).json({ 
          success: false, 
          error: "User not found" 
        });
      }
    }

    // Clean up OTP
    global.otpStore.delete(phone);

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`Phone login successful for ${user.email}`);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone,
        role: user.role 
      }
    });

  } catch (error) {
    console.error("Login OTP verify error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error verifying OTP. Please try again." 
    });
  }
});

// FORGOT PASSWORD - Send OTP
router.post("/forgot-password-send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: "Phone number is required" 
      });
    }

    // Validate phone format
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid phone number format" 
      });
    }

    // Check if user exists
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: "No account found with this phone number" 
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔐 Generated forgot password OTP for ${phone}: ${otp}`);

    // Store OTP for password reset
    global.otpStore = global.otpStore || new Map();
    global.otpStore.set(phone, {
      otp: otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      userId: user._id,
      isPasswordReset: true
    });

    // Send OTP via Twilio
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        const formattedPhone = `+91${phone}`;
        
        await client.messages.create({
          body: `Your password reset OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
          to: formattedPhone,
          from: process.env.TWILIO_PHONE_NUMBER
        });

        console.log(`Password reset OTP sent to ${formattedPhone}: ${otp}`);
      }
    } catch (twilioError) {
      console.error("Twilio error:", twilioError);
      // Continue without failing - OTP is still stored for testing
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
      userName: user.name
    });

  } catch (error) {
    console.error("Forgot password OTP send error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to send OTP" 
    });
  }
});

// FORGOT PASSWORD - Verify OTP
router.post("/forgot-password-verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: "Phone number and OTP are required" 
      });
    }

    // Check OTP store
    const storedData = global.otpStore?.get(phone);
    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        error: "OTP not found or expired" 
      });
    }

    // Check if OTP is for password reset
    if (!storedData.isPasswordReset) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid OTP type" 
      });
    }

    // Check expiration
    if (Date.now() > storedData.expiresAt) {
      global.otpStore.delete(phone);
      return res.status(400).json({ 
        success: false, 
        error: "OTP has expired" 
      });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      global.otpStore.delete(phone);
      return res.status(400).json({ 
        success: false, 
        error: "Too many failed attempts" 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts++;
      return res.status(400).json({ 
        success: false, 
        error: "Invalid OTP" 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: storedData.userId, phone, type: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minutes to reset password
    );

    // Clear OTP from store
    global.otpStore.delete(phone);

    console.log(`Password reset OTP verified for ${phone}`);

    res.json({
      success: true,
      message: "OTP verified successfully",
      resetToken
    });

  } catch (error) {
    console.error("Forgot password OTP verify error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to verify OTP" 
    });
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: "Reset token and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 6 characters long" 
      });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid or expired reset token" 
      });
    }

    if (decoded.type !== 'password-reset') {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid token type" 
      });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    await user.save();

    console.log(`Password reset successfully for user ${user.email}`);

    res.json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to reset password" 
    });
  }
});

module.exports = router;

const { authenticateToken } = require("../middleware/auth");

// VALIDATE REFERRAL CODE
router.post("/validate-referral-code", async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({ 
        error: "Referral code is required",
        code: "MISSING_REFERRAL_CODE",
        valid: false 
      });
    }

    // Validate referral code format
    if (!/^REF\d{6}$/.test(referralCode)) {
      return res.status(400).json({ 
        error: "Invalid referral code format",
        code: "INVALID_REFERRAL_FORMAT",
        valid: false 
      });
    }

    // Check if referral code exists
    const referrer = await User.findOne({ referralCode }).select('name email referralCode');
    
    if (!referrer) {
      return res.status(404).json({ 
        error: "Referral code does not exist",
        code: "REFERRAL_CODE_NOT_FOUND",
        valid: false 
      });
    }

    res.json({ 
      valid: true,
      message: "Valid referral code",
      referrer: {
        name: referrer.name,
        referralCode: referrer.referralCode
      }
    });

  } catch (err) {
    console.error("Referral code validation error:", err);
    res.status(500).json({ 
      error: "Error validating referral code",
      code: "VALIDATION_ERROR",
      valid: false 
    });
  }
});

// UPDATE PROFILE
router.put("/users/update", authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email)
      return res.status(400).json({ error: "Name and email required" });

    const user = await User.findById(req.user.id);
    if (!user)
      return res.status(404).json({ error: "User not found" });

    user.name = name;
    user.email = email;

    await user.save();

    res.json({ message: "Profile updated successfully", user });

  } catch (err) {
    console.error("PROFILE UPDATE ERROR:", err);
    res.status(500).json({ error: "Server error updating profile" });
  }
});

// GET USER PROFILE
router.get("/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user)
      return res.status(404).json({ error: "User not found" });

    res.json({ user });

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ error: "Server error fetching profile" });
  }
});

// UPDATE DELIVERY ADDRESS
router.put("/users/update-address", authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Address update request received');
    console.log('👤 User from token:', req.user);
    console.log('📦 Full request body:', JSON.stringify(req.body, null, 2));
    
    const { address } = req.body;
    console.log('📍 Extracted address:', JSON.stringify(address, null, 2));

    if (!address) {
      console.log('❌ No address object provided');
      return res.status(400).json({ 
        error: "Address object is required",
        received: req.body
      });
    }

    // Extract and trim all address fields (both new and legacy)
    const homeAddress1 = address.homeAddress1 ? address.homeAddress1.trim() : (address.street ? address.street.trim() : '');
    const homeAddress2 = address.homeAddress2 ? address.homeAddress2.trim() : '';
    const streetName = address.streetName ? address.streetName.trim() : '';
    const landmark = address.landmark ? address.landmark.trim() : '';
    const village = address.village ? address.village.trim() : '';
    const taluk = address.taluk ? address.taluk.trim() : '';
    const district = address.district ? address.district.trim() : '';
    const state = address.state ? address.state.trim() : '';
    const pincode = address.pincode ? address.pincode.trim() : '';
    const phone = address.phone ? address.phone.trim() : '';

    // Check required fields
    if (!homeAddress1 || !taluk || !district || !state || !pincode || !phone) {
      console.log('❌ Validation failed - missing or empty required fields');
      const missingFields = [];
      if (!homeAddress1) missingFields.push('homeAddress1');
      if (!taluk) missingFields.push('taluk');
      if (!district) missingFields.push('district');
      if (!state) missingFields.push('state');
      if (!pincode) missingFields.push('pincode');
      if (!phone) missingFields.push('phone');
      
      console.log('❌ Missing fields:', missingFields);
      return res.status(400).json({ 
        error: "All required address fields must be provided",
        missingFields: missingFields,
        received: {
          homeAddress1: homeAddress1,
          taluk: taluk,
          district: district,
          state: state,
          pincode: pincode,
          phone: phone
        }
      });
    }
    // Validate pincode (6 digits)
    if (!/^\d{6}$/.test(pincode)) {
      console.log('❌ Invalid pincode format:', pincode);
      return res.status(400).json({ error: "Invalid pincode format - must be 6 digits" });
    }

    // Validate phone (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      console.log('❌ Invalid phone format:', phone);
      return res.status(400).json({ error: "Invalid phone number format - must be 10 digits" });
    }

    const userId = req.user.id;
    console.log('🔍 Looking for user with ID:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ error: "User not found" });
    }

    console.log('✅ All validations passed, updating address');
    
    // Update address with all new fields
    user.address = {
      street: homeAddress1, // Legacy compatibility
      homeAddress1: homeAddress1,
      homeAddress2: homeAddress2,
      streetName: streetName,
      landmark: landmark,
      village: village,
      taluk: taluk,
      district: district,
      state: state,
      pincode: pincode,
      phone: phone
    };

    await user.save();
    
    console.log('✅ Address updated successfully');
    console.log('📍 New address:', user.address);
    
    res.json({ message: "Address updated successfully", user });

  } catch (err) {
    console.error("ADDRESS UPDATE ERROR:", err);
    res.status(500).json({ error: "Server error updating address" });
  }
});
