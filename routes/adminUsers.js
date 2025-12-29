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

/* -------------------------------------------
   GET /api/admin/users/:userId/commissions
   Get detailed commission history for a specific user
--------------------------------------------*/
router.get("/users/:userId/commissions", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      type, // 'direct', 'tree', or 'all'
      startDate, 
      endDate 
    } = req.query;
    
    // Verify user exists
    const user = await User.findById(userId).select('name email referralCode wallet directCommissionEarned treeCommissionEarned');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const CommissionTransaction = require("../models/CommissionTransaction");
    
    // Build query for commission transactions
    const query = {
      $or: [
        { directReferrer: userId }, // Direct commissions earned
        { 'treeCommissions.recipient': userId } // Tree commissions earned
      ]
    };
    
    // Add date filtering if provided
    if (startDate || endDate) {
      query.processedAt = {};
      if (startDate) {
        query.processedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.processedAt.$lte = new Date(endDate);
      }
    }
    
    const skip = (page - 1) * limit;
    
    // Get commission transactions
    const transactions = await CommissionTransaction.find(query)
      .populate('purchaser', 'name email')
      .populate('orderId', 'totalAmount createdAt')
      .sort({ processedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await CommissionTransaction.countDocuments(query);
    
    // Process transactions to extract user-specific commission data
    const commissions = [];
    
    for (const transaction of transactions) {
      // Check for direct commission
      if (transaction.directReferrer && transaction.directReferrer.toString() === userId) {
        commissions.push({
          id: transaction._id,
          orderId: transaction.orderId._id,
          orderAmount: transaction.orderAmount,
          orderDate: transaction.orderId.createdAt,
          purchaser: transaction.purchaser,
          type: 'direct',
          amount: transaction.directCommissionAmount,
          percentage: ((transaction.directCommissionAmount / transaction.orderAmount) * 100).toFixed(2),
          processedAt: transaction.processedAt,
          status: transaction.status
        });
      }
      
      // Check for tree commissions
      const treeCommission = transaction.treeCommissions.find(
        tc => tc.recipient.toString() === userId
      );
      
      if (treeCommission) {
        commissions.push({
          id: transaction._id,
          orderId: transaction.orderId._id,
          orderAmount: transaction.orderAmount,
          orderDate: transaction.orderId.createdAt,
          purchaser: transaction.purchaser,
          type: 'tree',
          level: treeCommission.level,
          amount: treeCommission.amount,
          percentage: treeCommission.percentage,
          processedAt: transaction.processedAt,
          status: transaction.status
        });
      }
    }
    
    // Filter by commission type if specified
    let filteredCommissions = commissions;
    if (type && type !== 'all') {
      filteredCommissions = commissions.filter(c => c.type === type);
    }
    
    // Sort by processed date (newest first)
    filteredCommissions.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));
    
    // Calculate summary statistics
    const directCommissions = commissions.filter(c => c.type === 'direct');
    const treeCommissions = commissions.filter(c => c.type === 'tree');
    
    const summary = {
      totalDirectCommissions: directCommissions.reduce((sum, c) => sum + c.amount, 0),
      totalTreeCommissions: treeCommissions.reduce((sum, c) => sum + c.amount, 0),
      directCommissionCount: directCommissions.length,
      treeCommissionCount: treeCommissions.length,
      totalCommissions: user.directCommissionEarned + user.treeCommissionEarned,
      currentWallet: user.wallet
    };
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        wallet: user.wallet,
        directCommissionEarned: user.directCommissionEarned,
        treeCommissionEarned: user.treeCommissionEarned
      },
      commissions: filteredCommissions,
      summary,
      pagination: {
        total: filteredCommissions.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(filteredCommissions.length / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching user commissions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
