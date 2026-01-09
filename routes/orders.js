// routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { sendDeliveryStatusEmail } = require("../utils/emailService");

const router = express.Router();

/**
 * GET PENDING CHECK PAYMENTS (Admin Only)
 */
router.get("/check-payments/pending", authenticateToken, isAdmin, async (req, res) => {
    try {
        console.log("📋 Admin fetching pending check payments...");

        // Find orders with check payment pending verification
        const orders = await Order.find({
            paymentType: 'check',
            'paymentDetails.status': 'pending_verification'
        })
        .populate('user_id', 'name email phone')
        .sort({ 'paymentDetails.updatedAt': -1 })
        .lean();

        // Calculate stats
        const stats = {
            pendingCount: orders.length,
            totalAmount: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
            todayCount: orders.filter(order => {
                const today = new Date();
                const orderDate = new Date(order.paymentDetails?.updatedAt || order.createdAt);
                return orderDate.toDateString() === today.toDateString();
            }).length
        };

        // Format orders for frontend
        const formattedOrders = orders.map(order => ({
            ...order,
            user: order.user_id // Rename for easier access
        }));

        console.log(`✅ Found ${orders.length} pending check payments`);

        res.json({
            success: true,
            orders: formattedOrders,
            stats: stats
        });

    } catch (error) {
        console.error("Error fetching pending check payments:", error);
        res.status(500).json({ error: "Error fetching pending check payments" });
    }
});

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
 * CREATE PENDING ORDER (For Check/Bank Transfer Payments)
 */
router.post("/create-pending", authenticateToken, async (req, res) => {
    try {
        const { 
            bookId, 
            quantity, 
            deliveryMethod, 
            paymentType, 
            basePrice, 
            courierCharge, 
            totalAmount,
            itemType = 'book' // Default to book, can be 'bundle'
        } = req.body;

        if (!bookId || !quantity || !paymentType) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        let itemData;
        
        if (itemType === 'bundle') {
            // Fetch bundle details
            const Bundle = require("../models/Bundle");
            const bundle = await Bundle.findById(bookId);
            
            if (!bundle) {
                return res.status(404).json({ error: "Bundle not found" });
            }
            
            itemData = {
                id: bookId,
                title: bundle.name,
                author: "Bundle",
                quantity: quantity,
                price: basePrice / quantity, // Convert total price to per-item price
                coverImage: bundle.image || "",
                type: 'bundle'
            };
        } else {
            // Fetch book details
            const Book = require("../models/Book");
            const book = await Book.findById(bookId);
            
            if (!book) {
                return res.status(404).json({ error: "Book not found" });
            }
            
            itemData = {
                id: bookId,
                title: book.title,
                author: book.author || "Unknown",
                quantity: quantity,
                price: basePrice / quantity, // Convert total price to per-item price
                coverImage: book.cover_image || "",
                type: 'book'
            };
        }

        // Create order item with all required fields
        const items = [itemData];

        // Create Order in pending state
        const order = await Order.create({
            user_id: req.user.id,
            items,
            totalAmount,
            deliveryMethod,
            courierCharge,
            paymentType, // 'check' or 'transfer'
            status: "pending_payment_verification",
            rewardApplied: false,
            paymentDetails: {
                type: paymentType,
                status: 'awaiting_upload',
                createdAt: new Date()
            }
        });

        return res.json({ 
            message: "Pending order created", 
            orderId: order._id.toString(),
            order 
        });

    } catch (err) {
        console.error("Pending order create error:", err);
        res.status(500).json({ error: "Error creating pending order" });
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
                
                // Mark user's first purchase as done after successful commission distribution
                const User = require("../models/User");
                const user = await User.findById(order.user_id);
                if (user && !user.firstPurchaseDone) {
                    user.firstPurchaseDone = true;
                    await user.save();
                    console.log(`✅ Admin: Marked first purchase as done for user: ${user.email}`);
                }
                
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

/**
 * UPDATE UTR NUMBER (User can add UTR after check clears)
 */
router.put("/update-utr/:orderId", authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { utrNumber, transferDate } = req.body;

        if (!utrNumber || !utrNumber.trim()) {
            return res.status(400).json({ error: "UTR number is required" });
        }

        // Find order and verify ownership
        const order = await Order.findOne({ 
            _id: orderId, 
            user_id: req.user.id 
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Verify order is eligible for UTR update
        if (!order.paymentType || !['check', 'transfer'].includes(order.paymentType)) {
            return res.status(400).json({ error: "This order doesn't support UTR updates" });
        }

        // Update UTR information
        order.paymentDetails = {
            ...order.paymentDetails,
            utrNumber: utrNumber.trim(),
            transferDate: transferDate ? new Date(transferDate) : new Date(),
            status: 'pending_verification',
            updatedAt: new Date()
        };

        // Update main order status if still pending
        if (order.status === 'pending_payment_verification') {
            order.status = 'pending';
        }

        await order.save();

        res.json({ 
            message: "UTR number updated successfully", 
            order: {
                _id: order._id,
                paymentDetails: order.paymentDetails,
                status: order.status
            }
        });

    } catch (err) {
        console.error("UTR update error:", err);
        res.status(500).json({ error: "Error updating UTR number" });
    }
});

/**
 * CREATE CART PENDING ORDER (For Check/Bank Transfer Payments - Multiple Items)
 */
router.post("/create-cart-pending", authenticateToken, async (req, res) => {
    try {
        const { 
            cartItems,
            deliveryMethod, 
            paymentType, 
            itemsTotal,
            courierCharge, 
            totalAmount,
            totalWeight
        } = req.body;

        if (!cartItems || cartItems.length === 0 || !paymentType) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Process cart items and fetch details for each
        const processedItems = [];
        
        for (const cartItem of cartItems) {
            let itemData;
            
            if (cartItem.isBundle || cartItem.bundleId) {
                // Handle bundle item
                const Bundle = require("../models/Bundle");
                const bundle = await Bundle.findById(cartItem.bundleId);
                
                if (!bundle) {
                    console.warn(`Bundle not found: ${cartItem.bundleId}`);
                    continue; // Skip this item but continue with others
                }
                
                itemData = {
                    id: cartItem.bundleId,
                    title: bundle.name,
                    author: "Bundle",
                    quantity: cartItem.quantity,
                    price: bundle.bundlePrice,
                    coverImage: bundle.image || "",
                    type: 'bundle'
                };
            } else {
                // Handle book item
                const Book = require("../models/Book");
                const book = await Book.findById(cartItem.id);
                
                if (!book) {
                    console.warn(`Book not found: ${cartItem.id}`);
                    continue; // Skip this item but continue with others
                }
                
                itemData = {
                    id: cartItem.id,
                    title: book.title,
                    author: book.author || "Unknown",
                    quantity: cartItem.quantity,
                    price: book.price,
                    coverImage: book.cover_image || "",
                    type: 'book'
                };
            }
            
            processedItems.push(itemData);
        }

        if (processedItems.length === 0) {
            return res.status(400).json({ error: "No valid items found in cart" });
        }

        // Create Order in pending state with all cart items
        const order = await Order.create({
            user_id: req.user.id,
            items: processedItems,
            totalAmount,
            deliveryMethod,
            courierCharge,
            paymentType, // 'check' or 'transfer'
            status: "pending_payment_verification",
            rewardApplied: false,
            paymentDetails: {
                type: paymentType,
                status: 'awaiting_upload',
                createdAt: new Date(),
                cartOrder: true, // Flag to indicate this was a cart order
                itemCount: processedItems.length
            }
        });

        return res.json({ 
            message: "Cart pending order created", 
            orderId: order._id.toString(),
            order,
            itemCount: processedItems.length
        });

    } catch (err) {
        console.error("Cart pending order create error:", err);
        res.status(500).json({ error: "Error creating cart order" });
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
