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
                
                // Reduce stock for completed orders (skip digital items)
                console.log("📦 Reducing stock for completed order items...");
                const Book = require("../models/Book");
                const Bundle = require("../models/Bundle");
                
                for (const item of order.items) {
                    try {
                        // Skip stock reduction for digital items
                        if (item.isDigital) {
                            console.log(`📱 Skipping stock reduction for digital item: ${item.title}`);
                            continue;
                        }
                        
                        if (item.type === 'book') {
                            const book = await Book.findById(item.id);
                            if (book && book.trackStock) {
                                book.reduceStock(item.quantity);
                                await book.save();
                                console.log(`📦 Reduced stock for book ${book.title}: ${item.quantity} units`);
                            }
                        } else if (item.type === 'bundle') {
                            const bundle = await Bundle.findById(item.id);
                            if (bundle && bundle.books) {
                                // Reduce stock for each book in the bundle
                                for (const bundleBook of bundle.books) {
                                    const book = await Book.findById(bundleBook._id || bundleBook.id);
                                    if (book && book.trackStock) {
                                        book.reduceStock(item.quantity);
                                        await book.save();
                                        console.log(`📦 Reduced stock for bundle book ${book.title}: ${item.quantity} units`);
                                    }
                                }
                            }
                        }
                    } catch (stockError) {
                        console.error(`❌ Error reducing stock for item ${item.id}:`, stockError);
                        // Continue with other items even if one fails
                    }
                }
                console.log("✅ Stock reduction completed for order:", order._id);
                
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

        // Prepare tracking info update
        let trackingUpdate = {};
        
        if (trackingInfo && typeof trackingInfo === 'object') {
            // New structure with website and ID
            trackingUpdate = {
                trackingWebsite: trackingInfo.trackingWebsite || '',
                trackingId: trackingInfo.trackingId || '',
                trackingUrl: trackingInfo.trackingUrl || '',
                updatedAt: new Date(),
                updatedBy: req.user.id
            };
        } else if (trackingInfo && typeof trackingInfo === 'string') {
            // Legacy support for old string format
            trackingUpdate = {
                trackingWebsite: '',
                trackingId: trackingInfo,
                trackingUrl: '',
                updatedAt: new Date(),
                updatedBy: req.user.id
            };
        } else {
            // No tracking info provided
            trackingUpdate = {
                trackingWebsite: '',
                trackingId: '',
                trackingUrl: '',
                updatedAt: new Date(),
                updatedBy: req.user.id
            };
        }

        const order = await Order.findByIdAndUpdate(
            orderId,
            {
                deliveryStatus,
                trackingInfo: trackingUpdate
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
                console.log(`   Tracking: ${JSON.stringify(trackingUpdate)}`);
                
                const emailResult = await sendDeliveryStatusEmail(
                    order, 
                    user, 
                    deliveryStatus, 
                    trackingUpdate
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
