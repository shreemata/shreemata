// routes/fixDuplicateRewards.js
// One-time script to fix duplicate referral rewards
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

/**
 * ADMIN ONLY - Fix duplicate rewards by marking old orders as rewardApplied
 * This prevents the system from applying rewards again
 */
router.post("/mark-old-orders", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Mark all completed orders as rewardApplied to prevent re-processing
        const result = await Order.updateMany(
            { 
                status: "completed",
                rewardApplied: { $ne: true }
            },
            { 
                $set: { rewardApplied: true }
            }
        );

        res.json({ 
            message: "Old orders marked as processed",
            modifiedCount: result.modifiedCount
        });

    } catch (err) {
        console.error("Fix error:", err);
        res.status(500).json({ error: "Error fixing orders" });
    }
});

/**
 * ADMIN ONLY - View orders that might have duplicate rewards
 */
router.get("/check-duplicates", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Find completed orders without rewardApplied flag
        const suspiciousOrders = await Order.find({
            status: "completed",
            rewardApplied: { $ne: true }
        }).populate("user_id", "name email referredBy");

        res.json({ 
            count: suspiciousOrders.length,
            orders: suspiciousOrders
        });

    } catch (err) {
        console.error("Check error:", err);
        res.status(500).json({ error: "Error checking orders" });
    }
});

module.exports = router;
