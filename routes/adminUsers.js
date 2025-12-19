const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");

/* -------------------------------------------
   GET /api/admin/users
   Get all users with pagination and filtering
--------------------------------------------*/
router.get("/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, suspended, search } = req.query;
    
    const query = {};
    
    // Filter by suspension status
    if (suspended !== undefined) {
      query.suspended = suspended === 'true';
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const users = await User.find(query)
      .select('name email referralCode wallet suspended suspendedAt suspendedReason directCommissionEarned treeCommissionEarned referrals treeLevel createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/admin/users/:userId/suspend
   Suspend a user
--------------------------------------------*/
router.post("/users/:userId/suspend", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: "Suspension reason is required" });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (user.role === 'admin') {
      return res.status(403).json({ error: "Cannot suspend admin users" });
    }
    
    if (user.suspended) {
      return res.status(400).json({ error: "User is already suspended" });
    }
    
    user.suspended = true;
    user.suspendedAt = new Date();
    user.suspendedReason = reason;
    user.suspendedBy = req.user.userId;
    
    await user.save();
    
    res.json({
      message: "User suspended successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        suspended: user.suspended,
        suspendedAt: user.suspendedAt,
        suspendedReason: user.suspendedReason
      }
    });
  } catch (err) {
    console.error("Error suspending user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/admin/users/:userId/activate
   Reactivate a suspended user
--------------------------------------------*/
router.post("/users/:userId/activate", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (!user.suspended) {
      return res.status(400).json({ error: "User is not suspended" });
    }
    
    user.suspended = false;
    user.suspendedAt = null;
    user.suspendedReason = null;
    user.suspendedBy = null;
    
    await user.save();
    
    res.json({
      message: "User activated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        suspended: user.suspended
      }
    });
  } catch (err) {
    console.error("Error activating user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/admin/users/:userId
   Get detailed user information
--------------------------------------------*/
router.get("/users/:userId", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password')
      .populate('suspendedBy', 'name email');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ user });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   GET /api/admin/users/:userId/tree
   Get user's referral tree (for admin view)
--------------------------------------------*/
router.get("/users/:userId/tree", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { maxDepth = 10 } = req.query;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Build tree recursively
    async function buildTree(userId, currentDepth = 0) {
      if (currentDepth >= maxDepth) {
        return null;
      }
      
      const user = await User.findById(userId)
        .select('name email referralCode wallet treeLevel treeChildren directCommissionEarned treeCommissionEarned referrals suspended')
        .populate('treeChildren', '_id');
      
      if (!user) {
        return null;
      }
      
      const children = [];
      for (const childId of user.treeChildren) {
        const childTree = await buildTree(childId._id, currentDepth + 1);
        if (childTree) {
          children.push(childTree);
        }
      }
      
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        wallet: user.wallet,
        treeLevel: user.treeLevel,
        directCommissionEarned: user.directCommissionEarned,
        treeCommissionEarned: user.treeCommissionEarned,
        referrals: user.referrals,
        suspended: user.suspended,
        childrenCount: user.treeChildren.length,
        children: children
      };
    }
    
    const tree = await buildTree(userId);
    
    res.json({ tree });
  } catch (err) {
    console.error("Error fetching user tree:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
