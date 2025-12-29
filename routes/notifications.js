const express = require("express");
const Notification = require("../models/Notification");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

// Get all active notifications (public)
router.get("/", async (req, res) => {
    try {
        const notifications = await Notification.find({ 
            isActive: true,
            $or: [
                { validUntil: { $exists: false } },
                { validUntil: null },
                { validUntil: { $gte: new Date() } }
            ]
        }).sort({ createdAt: -1 });

        res.json({ notifications });
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ error: "Error fetching notifications" });
    }
});

// Check applicable offers for a cart amount
router.post("/check-offers", async (req, res) => {
    try {
        const { cartTotal } = req.body;

        console.log("Checking offers for cart total:", cartTotal);

        if (!cartTotal || cartTotal <= 0) {
            return res.json({ applicableOffer: null });
        }

        // Find active offers with threshold-based discounts
        const offers = await Notification.find({
            isActive: true,
            type: { $in: ["offer", "discount"] },
            "offerDetails.minAmount": { $exists: true, $lte: cartTotal },
            $or: [
                { validUntil: { $exists: false } },
                { validUntil: null },
                { validUntil: { $gte: new Date() } }
            ]
        });

        console.log("Found offers:", offers.length);

        if (offers.length > 0) {
            // Calculate actual savings for each offer and pick the best one
            let bestOffer = null;
            let maxSavings = 0;

            for (const offer of offers) {
                let savings = 0;
                let discountedAmount = cartTotal;

                if (offer.offerDetails.discountType === 'percentage') {
                    // Percentage discount
                    savings = (cartTotal * offer.offerDetails.discountValue) / 100;
                    discountedAmount = cartTotal - savings;
                } else {
                    // Fixed amount discount
                    savings = offer.offerDetails.discountValue;
                    discountedAmount = cartTotal - savings;
                }

                console.log(`Offer: ${offer.title}, Savings: ${savings}`);

                if (savings > maxSavings) {
                    maxSavings = savings;
                    bestOffer = {
                        offer: offer,
                        savings: savings,
                        discountedAmount: discountedAmount
                    };
                }
            }

            if (bestOffer) {
                console.log("Best offer selected:", bestOffer.offer.title);
                res.json({ 
                    applicableOffer: bestOffer.offer,
                    originalAmount: cartTotal,
                    discountedAmount: Math.round(bestOffer.discountedAmount * 100) / 100,
                    savings: Math.round(bestOffer.savings * 100) / 100
                });
            } else {
                res.json({ applicableOffer: null });
            }
        } else {
            console.log("No applicable offers found");
            res.json({ applicableOffer: null });
        }
    } catch (err) {
        console.error("Error checking offers:", err);
        res.status(500).json({ error: "Error checking offers" });
    }
});

// Get all notifications (admin)
router.get("/admin/all", authenticateToken, isAdmin, async (req, res) => {
    try {
        const notifications = await Notification.find()
            .sort({ createdAt: -1 })
            .populate("createdBy", "name email");

        res.json({ notifications });
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ error: "Error fetching notifications" });
    }
});

// Create notification (admin)
router.post("/admin/create", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { title, message, type, validUntil, offerDetails } = req.body;

        console.log("=== Creating Notification ===");
        console.log("Request body:", req.body);

        if (!title || !message) {
            return res.status(400).json({ error: "Title and message are required" });
        }

        const notificationData = {
            title,
            message,
            type: type || "announcement",
            validUntil: validUntil || null,
            createdBy: req.user.id,
            isActive: true
        };

        // Add offer details if provided
        if (offerDetails && (type === 'offer' || type === 'discount')) {
            notificationData.offerDetails = offerDetails;
            console.log("Offer details included:", offerDetails);
        }

        const notification = await Notification.create(notificationData);
        console.log("✅ Notification created:", notification._id);

        res.json({ message: "Notification created", notification });
    } catch (err) {
        console.error("❌ Error creating notification:", err);
        res.status(500).json({ error: "Error creating notification" });
    }
});

// Toggle notification active status (admin)
router.patch("/admin/toggle/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        notification.isActive = !notification.isActive;
        await notification.save();

        res.json({ message: "Notification toggled", notification });
    } catch (err) {
        console.error("Error toggling notification:", err);
        res.status(500).json({ error: "Error toggling notification" });
    }
});

// Delete notification (admin)
router.delete("/admin/delete/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ message: "Notification deleted" });
    } catch (err) {
        console.error("Error deleting notification:", err);
        res.status(500).json({ error: "Error deleting notification" });
    }
});

module.exports = router;
