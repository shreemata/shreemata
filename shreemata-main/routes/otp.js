const express = require("express");
const twilio = require("twilio");

const router = express.Router();

// Initialize Twilio client with error handling
let client;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
        console.warn("Twilio credentials not found in environment variables");
    }
} catch (error) {
    console.error("Error initializing Twilio client:", error);
}

// Store OTPs temporarily (in production, use Redis or database)
// Use global storage to share with login OTP system
global.otpStore = global.otpStore || new Map();
const otpStore = global.otpStore;

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP
router.post("/send-otp", async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                error: "Phone number is required" 
            });
        }

        // Check if starts with 0 (common mistake)
        if (phone.startsWith('0')) {
            return res.status(400).json({ 
                success: false, 
                error: "Please enter mobile number without leading 0 (e.g., 9449171605 not 09449171605)." 
            });
        }

        // Validate phone number format (10 digits)
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: "Please enter a valid 10-digit mobile number." 
            });
        }

        // Check for common invalid patterns (all same digits)
        if (/^(\d)\1{9}$/.test(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: "Please enter a valid mobile number." 
            });
        }
        
        // Check if starts with valid Indian mobile prefixes
        if (!/^[6-9]/.test(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: "Please enter a valid Indian mobile number (should start with 6, 7, 8, or 9)." 
            });
        }

        // Generate OTP
        const otp = generateOTP();
        
        // Store OTP with expiration (5 minutes)
        otpStore.set(phone, {
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0
        });

        // Format phone number for India (+91)
        const formattedPhone = `+91${phone}`;

        // Check if Twilio client is initialized
        if (!client) {
            return res.status(500).json({ 
                success: false, 
                error: "SMS service not configured. Please contact support." 
            });
        }

        try {
            // Send OTP via Twilio
            await client.messages.create({
                body: `Your BookStore verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone
            });

            console.log(`OTP sent to ${formattedPhone}: ${otp}`);

            res.json({ 
                success: true, 
                message: "OTP sent successfully" 
            });

        } catch (twilioError) {
            console.error("Twilio error:", twilioError);
            console.error("Twilio error details:", {
                status: twilioError.status,
                code: twilioError.code,
                message: twilioError.message,
                moreInfo: twilioError.moreInfo
            });
            
            // Check if it's an authentication error
            if (twilioError.code === 20003) {
                console.error("Twilio Authentication Error - Check credentials:");
                console.error("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "Set" : "Missing");
                console.error("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "Set" : "Missing");
                console.error("TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER ? "Set" : "Missing");
            }
            
            // Handle specific Twilio errors
            if (twilioError.code === 21211) {
                return res.status(400).json({ 
                    success: false, 
                    error: "Please enter a valid mobile number." 
                });
            }
            
            if (twilioError.code === 21614) {
                return res.status(400).json({ 
                    success: false, 
                    error: "This mobile number is not valid. Please check and try again." 
                });
            }
            
            if (twilioError.code === 21408) {
                return res.status(400).json({ 
                    success: false, 
                    error: "Unable to send SMS to this number. Please try a different number." 
                });
            }
            
            if (twilioError.code === 20003) {
                return res.status(500).json({ 
                    success: false, 
                    error: "SMS service authentication failed. Please contact support." 
                });
            }
            
            return res.status(500).json({ 
                success: false, 
                error: "Failed to send OTP. Please check your number and try again." 
            });
        }

    } catch (error) {
        console.error("Send OTP error:", error);
        res.status(500).json({ 
            success: false, 
            error: "Server error while sending OTP" 
        });
    }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ 
                success: false, 
                error: "Phone number and OTP are required" 
            });
        }

        // Get stored OTP data
        const storedData = otpStore.get(phone);

        if (!storedData) {
            return res.status(400).json({ 
                success: false, 
                error: "OTP not found or expired. Please request a new OTP." 
            });
        }

        // Check if OTP is expired
        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({ 
                success: false, 
                error: "OTP has expired. Please request a new OTP." 
            });
        }

        // Check attempt limit (max 3 attempts)
        if (storedData.attempts >= 3) {
            otpStore.delete(phone);
            return res.status(400).json({ 
                success: false, 
                error: "Too many failed attempts. Please request a new OTP." 
            });
        }

        // Verify OTP
        if (storedData.otp !== otp) {
            storedData.attempts += 1;
            otpStore.set(phone, storedData);
            
            return res.status(400).json({ 
                success: false, 
                error: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.` 
            });
        }

        // OTP verified successfully
        otpStore.delete(phone);
        
        console.log(`OTP verified successfully for ${phone}`);

        res.json({ 
            success: true, 
            message: "Phone number verified successfully" 
        });

    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ 
            success: false, 
            error: "Server error while verifying OTP" 
        });
    }
});

// Resend OTP (with rate limiting)
router.post("/resend-otp", async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                error: "Phone number is required" 
            });
        }

        // Check if there's an existing OTP that's still valid
        const storedData = otpStore.get(phone);
        if (storedData && (Date.now() < storedData.expiresAt - 4 * 60 * 1000)) {
            return res.status(400).json({ 
                success: false, 
                error: "Please wait before requesting a new OTP" 
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        
        // Store new OTP
        otpStore.set(phone, {
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000,
            attempts: 0
        });

        // Format phone number for India (+91)
        const formattedPhone = `+91${phone}`;

        // Check if Twilio client is initialized
        if (!client) {
            return res.status(500).json({ 
                success: false, 
                error: "SMS service not configured. Please contact support." 
            });
        }

        try {
            // Send OTP via Twilio
            await client.messages.create({
                body: `Your BookStore verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone
            });

            console.log(`OTP resent to ${formattedPhone}: ${otp}`);

            res.json({ 
                success: true, 
                message: "OTP resent successfully" 
            });

        } catch (twilioError) {
            console.error("Twilio resend error:", twilioError);
            return res.status(500).json({ 
                success: false, 
                error: "Failed to resend OTP. Please try again." 
            });
        }

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ 
            success: false, 
            error: "Server error while resending OTP" 
        });
    }
});

// Clean up expired OTPs (run periodically)
setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of otpStore.entries()) {
        if (now > data.expiresAt) {
            otpStore.delete(phone);
        }
    }
}, 60000); // Clean up every minute

module.exports = router;