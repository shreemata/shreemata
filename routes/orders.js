// routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { sendDeliveryStatusEmail } = require("../utils/emailService");

const router = express.Router();

/**
 * CREATE ORDER (Referral rewards applied ONLY after payment verification)
 */
router.post("/", authenticateToken, async (req, res) => {
    try {
        const { items, totalAmount } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "No items in order" });
        }

        // Create Order - rewards will be applied after payment is verified
        const order = await Order.create({
            user_id: req.user.id,
            items,
            totalAmount,
            status: "pending",
            rewardApplied: false
        });

        return res.json({ message: "Order created", order });

    } catch (err) {
        console.error("Order create error:", err);
        res.status(500).json({ error: "Error creating order" });
    }
});

/**
 * USER ORDER HISTORY
 */
router.get("/", authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ user_id: req.user.id })
            .sort({ createdAt: -1 });

        res.json({ orders });
    } catch (err) {
        console.error("Order fetch error:", err);
        res.status(500).json({ error: "Error fetching orders" });
    }
});

/**
 * ADMIN — GET ALL ORDERS
 */
router.get("/admin/all", authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await Order.find()
            .populate("user_id", "name email")
            .sort({ createdAt: -1 });

        res.json({ orders });
    } catch (err) {
        console.error("Admin order fetch error:", err);
        res.status(500).json({ error: "Error fetching all orders" });
    }
});

/**
 * ADMIN — UPDATE ORDER STATUS
 */
router.put("/admin/update-status/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status } = req.body;

        const allowed = ["pending", "completed", "cancelled", "failed"];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const previousStatus = order.status;
        order.status = status;
        await order.save();

        // If status changed to "completed" and commissions haven't been distributed yet
        if (status === "completed" && previousStatus !== "completed" && !order.rewardApplied) {
            try {
                console.log("💰 Admin status update: Distributing commissions for order:", order._id);
                const { distributeCommissions } = require("../services/commissionDistribution");
                const commissionTransaction = await distributeCommissions(
                    order._id,
                    order.user_id,
                    order.totalAmount
                );
                console.log("✅ Commission distribution completed:", commissionTransaction._id);
                
                // Mark reward as applied
                order.rewardApplied = true;
                await order.save();
            } catch (commissionError) {
                console.error("❌ Commission distribution error:", commissionError);
                // Log error but don't fail the status update
            }
        }

        res.json({ message: "Order status updated", order });

    } catch (err) {
        console.error("Update status error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;

/**
 * UPDATE DELIVERY STATUS (Admin only)
 */
router.put("/admin/update-delivery/:orderId", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { deliveryStatus, trackingInfo } = req.body;

        const validStatuses = ["pending", "processing", "shipped", "delivered"];
        if (!validStatuses.includes(deliveryStatus)) {
            return res.status(400).json({ error: "Invalid delivery status" });
        }

        const order = await Order.findByIdAndUpdate(
            orderId,
            {
                deliveryStatus,
                trackingInfo: trackingInfo || ""
            },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Send email notification to customer about status update
        try {
            const user = await User.findById(order.user_id);
            if (user && user.email) {
                console.log(`📧 Sending delivery status email to: ${user.email}`);
                console.log(`   Status: ${deliveryStatus}`);
                
                const emailResult = await sendDeliveryStatusEmail(
                    order, 
                    user, 
                    deliveryStatus, 
                    trackingInfo || ''
                );
                
                if (emailResult.success) {
                    console.log('✅ Delivery status email sent successfully');
                } else {
                    console.error('❌ Failed to send delivery status email:', emailResult.error);
                }
            }
        } catch (emailError) {
            console.error('❌ Email error (non-blocking):', emailError);
            // Don't fail the status update if email fails
        }

        res.json({ message: "Delivery status updated", order });
    } catch (err) {
        console.error("Update delivery error:", err);
        res.status(500).json({ error: "Error updating delivery status" });
    }
});
