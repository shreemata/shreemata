const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { findTreePlacement } = require("../services/treePlacement");

const router = express.Router();

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

    // Handle tree placement for all users (with or without referrer)
    let treePlacementData = {
      treeParent: null,
      treeLevel: 1, // Root level for users without referrer
      treePosition: 0
    };

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

      // Find tree placement for the new user
      try {
        const placement = await findTreePlacement(directReferrer._id);
        treePlacementData = {
          treeParent: placement.parentId,
          treeLevel: placement.level,
          treePosition: placement.position
        };
      } catch (error) {
        console.error("Tree placement error:", error);
        return res.status(500).json({ 
          error: "Error determining tree placement",
          code: "TREE_PLACEMENT_ERROR",
          details: error.message 
        });
      }
    } else {
      // For users without referrer, still place them in the tree using the same algorithm
      // Find any existing user to use as a reference point for tree placement
      try {
        const anyExistingUser = await User.findOne({ treeLevel: { $gte: 1 } }).sort({ createdAt: 1 });
        
        if (anyExistingUser) {
          // Use the tree placement algorithm starting from any existing user
          const placement = await findTreePlacement(anyExistingUser._id);
          treePlacementData = {
            treeParent: placement.parentId,
            treeLevel: placement.level,
            treePosition: placement.position
          };
        }
        // If no existing users, keep default root level placement
      } catch (error) {
        console.error("Tree placement error for no-referrer user:", error);
        // Keep default root level placement if tree placement fails
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

    // Create user with referral system fields and tree placement
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
      treeParent: treePlacementData.treeParent,
      treeLevel: treePlacementData.treeLevel,
      treePosition: treePlacementData.treePosition,
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

    // Add new user to tree parent's children array (for both referred and non-referred users)
    if (treePlacementData.treeParent) {
      const treeParent = await User.findById(treePlacementData.treeParent);
      if (treeParent) {
        treeParent.treeChildren.push(newUser._id);
        await treeParent.save();
        console.log(`Added ${newUser.email} to tree parent ${treeParent.email}'s children`);
      }
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
        body: `Your BookStore login OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
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

    // Check each field individually for better debugging
    const fieldChecks = {
      address: !!address,
      street: address && !!address.street && address.street.trim() !== '',
      taluk: address && !!address.taluk && address.taluk.trim() !== '',
      district: address && !!address.district && address.district.trim() !== '',
      state: address && !!address.state && address.state.trim() !== '',
      pincode: address && !!address.pincode && address.pincode.trim() !== '',
      phone: address && !!address.phone && address.phone.trim() !== ''
    };
    
    console.log('🔍 Field validation checks:', fieldChecks);

    if (!address) {
      console.log('❌ No address object provided');
      return res.status(400).json({ 
        error: "Address object is required",
        received: req.body
      });
    }

    // Check each field with trimmed values
    const street = address.street ? address.street.trim() : '';
    const taluk = address.taluk ? address.taluk.trim() : '';
    const district = address.district ? address.district.trim() : '';
    const state = address.state ? address.state.trim() : '';
    const pincode = address.pincode ? address.pincode.trim() : '';
    const phone = address.phone ? address.phone.trim() : '';

    if (!street || !taluk || !district || !state || !pincode || !phone) {
      console.log('❌ Validation failed - missing or empty required fields');
      const missingFields = [];
      if (!street) missingFields.push('street');
      if (!taluk) missingFields.push('taluk');
      if (!district) missingFields.push('district');
      if (!state) missingFields.push('state');
      if (!pincode) missingFields.push('pincode');
      if (!phone) missingFields.push('phone');
      
      return res.status(400).json({ 
        error: `Missing or empty required fields: ${missingFields.join(', ')}`,
        received: address,
        fieldChecks: fieldChecks,
        missingFields: missingFields
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
    
    user.address = {
      street: street,
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
