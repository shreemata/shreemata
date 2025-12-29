const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ----------------------------------------------
// AUTHENTICATE USER (Verify Token)
// ----------------------------------------------
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1]; // Extract token

    if (!token)
      return res.status(401).json({ error: "Invalid token format" });

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from DB
    const user = await User.findById(decoded.id);

    if (!user)
      return res.status(401).json({ error: "User not found" });

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err) {
    // Audit log for authentication failures
    console.log(`🚨 SECURITY AUDIT: Authentication failure at ${new Date().toISOString()}`);
    console.log(`   Attempted endpoint: ${req.method} ${req.originalUrl}`);
    console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
    console.log(`   User Agent: ${req.get('User-Agent')}`);
    console.log(`   Error: ${err.message}`);
    
    return res.status(401).json({ error: "Unauthorized" });
  }
};

// ----------------------------------------------
// CHECK ADMIN ACCESS
// ----------------------------------------------
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    // Audit log for unauthorized access attempt
    console.log(`🚨 SECURITY AUDIT: Unauthorized admin access attempt by user ${req.user.email} (ID: ${req.user.id}) at ${new Date().toISOString()}`);
    console.log(`   Attempted endpoint: ${req.method} ${req.originalUrl}`);
    console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
    console.log(`   User Agent: ${req.get('User-Agent')}`);
    
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
};

module.exports = { authenticateToken, isAdmin };
