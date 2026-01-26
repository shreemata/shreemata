const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/mongo");
const authRoutes = require("./routes/auth");
const bookRoutes = require("./routes/books");
const categoryRoutes = require("./routes/categories");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");
const dailyReportRoutes = require("./routes/dailyReport");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect DB
connectDB();

// CORS - Allow requests from main domain and API subdomain
app.use(cors({
  origin: [
    'https://shreemata.com',
    'https://www.shreemata.com',
    'https://api.shreemata.com',
    'http://localhost:3000'
  ],
  credentials: true
}));

// =====================================
// 1️⃣ RAW BODY FOR RAZORPAY WEBHOOK 
// must be BEFORE express.json()
// =====================================
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.isWebhook = true;
    next();
  }
);

// =====================================
// Normal body parser (after webhook)
// Increased limits for image uploads
// =====================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =====================================
// Routes
// =====================================
app.use("/api/payments", paymentRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/referral", require("./routes/referral"));
app.use("/api/referral", require("./routes/referralTree"));
app.use("/api/admin/withdrawals", require("./routes/adminWithdraw"));
app.use("/api/admin/fix-rewards", require("./routes/fixDuplicateRewards"));
app.use("/api/admin", require("./routes/adminSettings"));
app.use("/api/admin", require("./routes/adminTrustFunds"));
app.use("/api/admin", require("./routes/adminUsers"));
app.use("/api/admin/referral-tree", require("./routes/adminReferralTree"));
app.use("/api/admin", dailyReportRoutes);
app.use("/api/admin", require("./routes/commissionSettings"));
app.use("/api", require("./routes/commissionSettings")); // Also mount publicly for shipping settings
app.use("/api", require("./routes/receiptSettings")); // Receipt settings routes
app.use("/api/bundles", require("./routes/bundles"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/home-settings", require("./routes/homeSettings")); // Home page settings
app.use("/api/points", require("./routes/points"));
app.use("/api", require("./routes/otp"));
app.use("/api/password-reset", require("./routes/passwordReset"));
app.use("/api/razorpay-reports", require("./routes/razorpayReports")); // Razorpay payment reports
app.use("/api/employees", require("./routes/employees")); // Employee salary management
app.use(express.static(path.join(__dirname, "public")));

app.get("/sitemap.xml", (req, res) => {
  res.setHeader("Content-Type", "application/xml");
  res.status(200);
  res.sendFile(path.join(__dirname, "public", "sitemap.xml"));
});


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Debug endpoint to check Cloudinary config (REMOVE AFTER TESTING)
app.get('/api/debug-cloudinary', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY,
    apiSecret: (process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET) ? '***' + (process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET).slice(-4) : 'NOT SET',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET_NEW || process.env.CLOUDINARY_UPLOAD_PRESET
  });
});

// Test Cloudinary connection
app.get('/api/test-cloudinary', async (req, res) => {
  try {
    const crypto = require('crypto');
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET;
    
    // Test signature generation manually
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `test-${timestamp}`;
    
    // Create signature manually
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(stringToSign + apiSecret).digest('hex');
    
    res.json({
      success: true,
      message: 'Manual signature test',
      cloudName,
      apiKey,
      apiSecret: apiSecret ? '***' + apiSecret.slice(-4) : 'NOT SET',
      timestamp,
      publicId,
      stringToSign,
      signature,
      expectedUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error
    });
  }
});

// Cloudinary config endpoint (for direct uploads from browser)
app.get('/api/cloudinary-config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET_NEW || process.env.CLOUDINARY_UPLOAD_PRESET || 'bookstore_preset'
  });
});

// Static
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Global error handler for API routes
app.use((err, req, res, next) => {
  // Only handle API routes with JSON errors
  if (req.path.startsWith('/api/')) {
    console.error('API Error:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  next(err);
});

// SPA fallback (only for non-API routes and non-static files)
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Don't redirect if it's a static file request (has file extension)
  if (req.path.includes('.')) {
    return res.status(404).send('File not found');
  }
  
  // Only redirect routes without extensions (SPA routes)
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Server start
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
