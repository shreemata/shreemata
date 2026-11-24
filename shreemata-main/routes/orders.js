// routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const Bundle = require("../models/Bundle");
const Book = require("../models/Book");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { sendDeliveryStatusEmail } = require("../utils/emailService");
const { autoGenerateInvoiceForOrder } = require("./invoices");
const { isPaymentVerified } = require("../utils/paymentHelper");
const { validateCourierAddress, isServerOrderDigitalOnly, isBookEntityDigital, isBundleEntityDigital, getAuthoritativeItemDetails } = require("../utils/deliveryAddressValidator");
const { calculateAuthoritativeOrder } = require("../utils/orderPricingCalculator");

const router = express.Router();

/**
 * GET PENDING CHEQUE PAYMENTS (Admin Only)
 */
router.get("/cheque-payments/pending", authenticateToken, isAdmin, async (req, res) => {
    try {
        console.log("📋 Admin fetching pending cheque payments and bank transfers...");

        // Find orders with cheque/check payment OR bank transfer pending verification
        const orders = await Order.find({
            $or: [
                { paymentType: 'check' },
                { paymentType: 'cheque' },
                { paymentType: 'transfer' }
            ],
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

        console.log(`✅ Found ${orders.length} pending payments (cheque + bank transfer)`);
        console.log(`   - Cheque payments: ${orders.filter(o => o.paymentType === 'cheque' || o.paymentType === 'check').length}`);
        console.log(`   - Bank transfers: ${orders.filter(o => o.paymentType === 'transfer').length}`);

        res.json({
            success: true,
            orders: formattedOrders,
            stats: stats
        });

    } catch (error) {
        console.error("Error fetching pending cheque payments:", error);
        res.status(500).json({ error: "Error fetching pending cheque payments" });
    }
});

/**
 * BACKWARD COMPATIBILITY: GET PENDING CHECK PAYMENTS (Admin Only)
 */
router.get("/check-payments/pending", authenticateToken, isAdmin, async (req, res) => {
    console.log("📝 Legacy check-payments/pending endpoint called - redirecting to cheque endpoint");
    
    try {
        // Find orders with check/cheque payment OR bank transfer pending verification
        const orders = await Order.find({
            $or: [
                { paymentType: 'check' },
                { paymentType: 'cheque' },
                { paymentType: 'transfer' }
            ],
            'paymentDetails.status': 'pending_verification'
        })
        .populate('user_id', 'name email phone')
        .sort({ 'paymentDetails.updatedAt': -1 })
        .lean();

        // Format orders for frontend
        const formattedOrders = orders.map(order => ({
            ...order,
            _id: order._id.toString(),
            user_id: order.user_id ? {
                ...order.user_id,
                _id: order.user_id._id.toString()
            } : null
        }));

        console.log(`✅ Found ${orders.length} pending payments (legacy endpoint)`);

        res.json({
            success: true,
            orders: formattedOrders,
            stats: {
                total: orders.length,
                checkPayments: orders.filter(o => o.paymentType === 'check' || o.paymentType === 'cheque').length,
                bankTransfers: orders.filter(o => o.paymentType === 'transfer').length
            }
        });

    } catch (error) {
        console.error("Error fetching pending check payments (legacy):", error);
        res.status(500).json({ error: "Error fetching pending check payments" });
    }
});

/**
 * CREATE ORDER (Referral rewards applied ONLY after payment verification)
 */
router.post("/", authenticateToken, async (req, res) => {
    try {
        const { items, totalAmount, deliveryMethod, deliveryAddress, courierCharge } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "No items in order" });
        }

        for (const it of items) {
            const details = await getAuthoritativeItemDetails(it);
            if (!details.found) {
                return res.status(400).json({ error: "Item not found", message: `Item not found: ${it.id || it.title}` });
            }
        }

        const isDigitalOnly = await isServerOrderDigitalOnly(items);
        const isPickupOrder = (deliveryMethod === 'pickup');

        let validatedAddress = null;
        if (!isDigitalOnly && !isPickupOrder) {
            const val = validateCourierAddress(deliveryAddress, req.user);
            if (!val.isValid) {
                return res.status(400).json({
                    error: val.error,
                    message: val.message,
                    missingFields: val.missingFields,
                    field: val.field,
                    requiresAddressSetup: true
                });
            }
            validatedAddress = val.sanitizedAddress;
        }

        // 🔒 Server authoritative pricing calculation
        const pricingResult = await calculateAuthoritativeOrder({
            items,
            deliveryMethod,
            clientCourierCharge: courierCharge,
            clientAmount: totalAmount
        });

        if (!pricingResult.success) {
            return res.status(400).json({ error: pricingResult.error, message: pricingResult.message || pricingResult.error });
        }

        const { buildOrderProfitSnapshot, calculateOrderProfitTotal } = require("../services/orderProfit");
        const orderItems = await buildOrderProfitSnapshot(pricingResult.processedItems);
        const calculatedProfit = calculateOrderProfitTotal(orderItems);

        // Create Order - rewards will be applied after payment is verified
        const order = await Order.create({
            user_id: req.user.id,
            items: orderItems,
            totalAmount: pricingResult.expectedTotal,
            orderProfitTotal: calculatedProfit,
            profitAmount: calculatedProfit,
            deliveryMethod: isDigitalOnly ? 'digital' : (deliveryMethod || 'pickup'),
            deliveryAddress: validatedAddress,
            courierCharge: pricingResult.courierCharge,
            totalWeight: pricingResult.totalWeight,
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
 * CREATE PENDING ORDER (For Cheque/Bank Transfer Payments)
 */
router.post("/create-pending", authenticateToken, async (req, res) => {
    try {
        console.log('📝 Create pending order request:', req.body);
        
        const { 
            bookId, 
            quantity, 
            deliveryMethod, 
            paymentType, 
            basePrice, 
            courierCharge, 
            totalAmount,
            deliveryAddress,
            itemType = 'book' // Default to book, can be 'bundle'
        } = req.body;

        console.log('Extracted fields:', {
            bookId,
            quantity,
            deliveryMethod,
            paymentType,
            basePrice,
            courierCharge,
            totalAmount,
            itemType
        });

        if (!bookId || !quantity || !paymentType) {
            console.error('Missing required fields:', { bookId, quantity, paymentType });
            return res.status(400).json({ error: "Missing required fields" });
        }

        const details = await getAuthoritativeItemDetails({ id: bookId, type: itemType });
        if (!details.found) {
            console.error('Item not found:', bookId);
            return res.status(400).json({ error: "Item not found", message: `Item not found with ID ${bookId}` });
        }

        const isDigitalItem = details.isDigital;
        console.log('Item resolved:', details.entity.title || details.entity.name, 'kind:', details.kind, 'isDigital:', isDigitalItem);
        const itemData = {
            id: String(details.entity._id),
            title: details.entity.title || details.entity.name,
            author: details.entity.author || (details.kind === 'bundle' ? 'Bundle' : 'Unknown'),
            quantity: quantity,
            price: basePrice / quantity, // Convert total price to per-item price
            coverImage: details.entity.cover_image || details.entity.image || details.entity.coverImage || "",
            type: details.kind,
            isDigital: isDigitalItem
        };

        // Authoritative server-side address validation: skip for pickup and verified digital items
        const isPickupOrder = (deliveryMethod === 'pickup');
        let validatedAddress = null;
        if (!isDigitalItem && !isPickupOrder) {
            const val = validateCourierAddress(deliveryAddress, req.user);
            if (!val.isValid) {
                return res.status(400).json({
                    error: val.error,
                    message: val.message,
                    missingFields: val.missingFields,
                    field: val.field,
                    requiresAddressSetup: true
                });
            }
            validatedAddress = val.sanitizedAddress;
        }

        // 🔒 Server authoritative pricing calculation
        const pricingResult = await calculateAuthoritativeOrder({
            items: [{ id: bookId, type: itemType, quantity: Number(quantity) }],
            deliveryMethod,
            clientCourierCharge: courierCharge,
            clientAmount: totalAmount
        });

        if (!pricingResult.success) {
            return res.status(400).json({ error: pricingResult.error, message: pricingResult.message || pricingResult.error });
        }

        const { buildOrderProfitSnapshot, calculateOrderProfitTotal } = require("../services/orderProfit");
        const orderItems = await buildOrderProfitSnapshot(pricingResult.processedItems);
        const calculatedProfit = calculateOrderProfitTotal(orderItems);

        // Create Order in pending state
        const order = await Order.create({
            user_id: req.user.id,
            items: orderItems,
            totalAmount: pricingResult.expectedTotal,
            orderProfitTotal: calculatedProfit,
            profitAmount: calculatedProfit,
            deliveryMethod: isDigitalItem ? 'digital' : (deliveryMethod || 'pickup'),
            deliveryAddress: validatedAddress,
            courierCharge: pricingResult.courierCharge,
            totalWeight: pricingResult.totalWeight,
            paymentType, // 'cheque' or 'transfer'
            status: "pending_payment_verification",
            rewardApplied: false,
            paymentDetails: {
                type: paymentType,
                status: 'awaiting_upload',
                createdAt: new Date()
            }
        });

        console.log('✅ Order created successfully:', order._id);

        // Auto-generate invoice for pending cheque/transfer order quietly in background
        try {
            await autoGenerateInvoiceForOrder(order);
        } catch (invErr) {
            console.error("⚠️ Invoice auto-generation error in /create-pending:", invErr.message);
        }

        return res.json({ 
            message: "Pending order created", 
            orderId: order._id.toString(),
            order 
        });

    } catch (err) {
        console.error("❌ Pending order create error:", err);
        console.error("Error stack:", err.stack);
        res.status(500).json({ error: "Error creating pending order: " + err.message });
    }
});

/**
 * USER ORDER HISTORY
 */
router.get("/", authenticateToken, async (req, res) => {
    try {
        // Check if this is for previous addresses (only completed orders)
        // or for order history (all orders)
        const { status } = req.query;
        
        let query = { user_id: req.user.id };
        
        // If status filter is provided, use it
        if (status) {
            query.status = status;
        }
        
        const orders = await Order.find(query)
            .sort({ createdAt: -1 });

        res.json({ orders });
    } catch (err) {
        console.error("Order fetch error:", err);
        res.status(500).json({ error: "Error fetching orders" });
    }
});

/**
 * PUBLIC ORDER TRACKING ROUTE (SAFE FOR CUSTOMERS)
 */
router.get("/track/:orderId", async (req, res) => {
    try {
        const rawId = (req.params.orderId || '').trim();
        if (!rawId) {
            return res.status(400).json({ error: "Order ID or Number is required" });
        }

        let order = null;

        // 1. Try finding by MongoDB ObjectId
        if (mongoose.Types.ObjectId.isValid(rawId)) {
            order = await Order.findById(rawId)
                .populate("user_id", "name email phone")
                .lean();
        }

        // 2. Try finding by razorpay_order_id or payment reference
        if (!order) {
            order = await Order.findOne({
                $or: [
                    { razorpay_order_id: rawId },
                    { 'paymentDetails.utrNumber': rawId },
                    { 'paymentDetails.checkNumber': rawId },
                    { 'paymentDetails.transferNumber': rawId }
                ]
            })
            .populate("user_id", "name email phone")
            .lean();
        }

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const sanitized = sanitizeOrderForCustomer(order, req);
        res.json({ success: true, order: sanitized });
    } catch (err) {
        console.error("Error in GET /orders/track/:orderId:", err);
        res.status(500).json({ error: "Server error tracking order" });
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
        if (status === "completed") {
            order.commissionStatus = order.commissionStatus || 'pending';
        }
        await order.save();

        // If status changed to "completed"
        if (status === "completed" && previousStatus !== "completed") {
            try {
                const { processAutomaticCommissionForOrder } = require("../services/commissionDistribution");
                await processAutomaticCommissionForOrder(order);
            } catch (commErr) {
                console.error("⚠️ Automatic commission distribution error in update-status:", commErr.message);
            }

            // Check and activate membership if product subtotal >= ₹100
            try {
                const { checkAndActivateMembership } = require("../services/membershipService");
                await checkAndActivateMembership(order);
            } catch (memErr) {
                console.error("⚠️ Error checking/activating membership:", memErr.message);
            }

            // Check user membership status after checkAndActivateMembership
            try {
                const User = require("../models/User");
                const user = await User.findById(order.user_id);
                if (user && user.isMember && (user.treeLevel === 0 || !user.treeParent)) {
                    const { createTreePlacementOnFirstPurchase } = require("../services/treePlacement");
                    await createTreePlacementOnFirstPurchase(user._id);
                    console.log(`🌳 Admin: Created tree placement for user: ${user.email}`);
                }
            } catch (treeErr) {
                console.error("⚠️ Error in order completion tree placement:", treeErr.message);
            }
            
            try {
                for (const item of order.items) {
                    try {
                        const details = await getAuthoritativeItemDetails(item);
                        // Skip stock reduction for digital items (authoritatively identified from DB)
                        if (details.found ? details.isDigital : item.isDigital) {
                            console.log(`📱 Skipping stock reduction for digital item: ${item.title}`);
                            continue;
                        }
                        
                        const itemKind = details.found ? details.kind : item.type;
                        if (itemKind === 'book') {
                            const book = await Book.findById(item.id);
                            if (book && book.trackStock) {
                                book.reduceStock(item.quantity);
                                await book.save();
                                console.log(`📦 Reduced stock for book ${book.title}: ${item.quantity} units`);
                            }
                        } else if (itemKind === 'bundle') {
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
 * ADMIN — CHECK WITH RAZORPAY & FINISH ORDER
 * Fetches payments for razorpay_order_id from Razorpay server-side.
 * If one is captured, calls finalizePaidOrder.
 * Indicates whether commissions were already applied. No bulk run.
 */
async function handleReconcileRazorpay(req, res) {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId).populate("user_id", "name email phone");
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const razorpayOrderId = order.razorpay_order_id || order.paymentDetails?.razorpay_order_id;
        if (!razorpayOrderId) {
            return res.status(400).json({
                error: "Order does not have a Razorpay Order ID. Cannot verify with Razorpay."
            });
        }

        const Razorpay = require("razorpay");
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            return res.status(500).json({
                error: "Razorpay credentials are not configured on the server."
            });
        }

        const razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
        let paymentsData;
        try {
            paymentsData = await razorpayInstance.orders.fetchPayments(razorpayOrderId);
        } catch (rzpErr) {
            console.error("Razorpay fetchPayments error:", rzpErr.message);
            return res.status(502).json({
                error: `Razorpay API error: ${rzpErr.message}`
            });
        }

        const items = paymentsData?.items || [];
        const capturedPayment = items.find(p => p.status === 'captured');

        if (!capturedPayment) {
            const statuses = items.map(p => `${p.id}: ${p.status}`).join(', ') || 'none';
            return res.json({
                success: true,
                captured: false,
                orderNumber: order.orderNumber || order._id,
                paymentsFound: items.length,
                paymentStatuses: statuses,
                message: items.length === 0
                    ? "No payments found in Razorpay for this order."
                    : `No captured payment found in Razorpay for this order (found ${items.length}: ${statuses}).`
            });
        }

        // A captured payment was found! Finalize the order idempotently
        const { finalizePaidOrder, dispatchOrderEmails } = require("../services/orderFinalizer");
        const finalResult = await finalizePaidOrder(order, {
            razorpay_payment_id: capturedPayment.id,
            razorpay_order_id: razorpayOrderId
        });

        // Ensure missing confirmation email is delivered on reconcile
        if (!finalResult.order?.confirmationEmailSent) {
            await dispatchOrderEmails(finalResult.order._id).catch(e => console.error("⚠️ Reconcile email dispatch warning:", e.message));
        }

        const refreshedOrder = finalResult.order;
        const commissionsAlreadyApplied = Boolean(
            refreshedOrder.commissionStatus === 'distributed' || refreshedOrder.rewardApplied
        );

        return res.json({
            success: true,
            captured: true,
            paymentId: capturedPayment.id,
            orderId: refreshedOrder._id,
            orderStatus: refreshedOrder.status,
            paymentStatus: refreshedOrder.paymentStatus,
            commissionsApplied: commissionsAlreadyApplied,
            commissionStatus: refreshedOrder.commissionStatus,
            invoiceNumber: finalResult.invoice?.invoiceNumber || refreshedOrder.documentNumbers?.tax_invoice || null,
            message: `Payment verified as captured (${capturedPayment.id}). Order marked completed and invoice generated. Commissions: ${refreshedOrder.commissionStatus}.`
        });

    } catch (err) {
        console.error("Error in reconcile-razorpay:", err);
        return res.status(500).json({ error: err.message || "Failed to reconcile order with Razorpay" });
    }
}

router.post("/admin/reconcile-razorpay/:id", authenticateToken, isAdmin, handleReconcileRazorpay);
router.post("/:id/reconcile-razorpay", authenticateToken, isAdmin, handleReconcileRazorpay);

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
        if (!order.paymentType || !['check', 'cheque', 'transfer'].includes(order.paymentType)) {
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
 * CREATE CART PENDING ORDER (For Cheque/Bank Transfer Payments - Multiple Items)
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
            totalWeight,
            deliveryAddress
        } = req.body;

        if (!cartItems || cartItems.length === 0 || !paymentType) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const isDigitalOnly = await isServerOrderDigitalOnly(cartItems);
        const isPickupOrder = (deliveryMethod === 'pickup');

        let validatedAddress = null;
        if (!isDigitalOnly && !isPickupOrder) {
            const val = validateCourierAddress(deliveryAddress, req.user);
            if (!val.isValid) {
                return res.status(400).json({
                    error: val.error,
                    message: val.message,
                    missingFields: val.missingFields,
                    field: val.field,
                    requiresAddressSetup: true
                });
            }
            validatedAddress = val.sanitizedAddress;
        }

        // 🔒 Server authoritative pricing calculation
        const pricingResult = await calculateAuthoritativeOrder({
            items: cartItems,
            deliveryMethod,
            clientCourierCharge: courierCharge,
            clientAmount: totalAmount
        });

        if (!pricingResult.success) {
            return res.status(400).json({ error: pricingResult.error, message: pricingResult.message || pricingResult.error });
        }

        const { buildOrderProfitSnapshot, calculateOrderProfitTotal } = require("../services/orderProfit");
        const orderItems = await buildOrderProfitSnapshot(pricingResult.processedItems);
        const calculatedProfit = calculateOrderProfitTotal(orderItems);

        // Create Order in pending state with all cart items
        const order = await Order.create({
            user_id: req.user.id,
            items: orderItems,
            totalAmount: pricingResult.expectedTotal,
            orderProfitTotal: calculatedProfit,
            profitAmount: calculatedProfit,
            deliveryMethod: isDigitalOnly ? 'digital' : (deliveryMethod || 'pickup'),
            deliveryAddress: validatedAddress,
            courierCharge: pricingResult.courierCharge,
            totalWeight: pricingResult.totalWeight,
            paymentType, // 'cheque' or 'transfer'
            status: "pending_payment_verification",
            rewardApplied: false,
            paymentDetails: {
                type: paymentType,
                status: 'awaiting_upload',
                createdAt: new Date(),
                cartOrder: true, // Flag to indicate this was a cart order
                itemCount: orderItems.length
            }
        });

        // Auto-generate invoice for pending cart order quietly in background
        try {
            await autoGenerateInvoiceForOrder(order);
        } catch (invErr) {
            console.error("⚠️ Invoice auto-generation error in /create-pending-cart:", invErr.message);
        }

        return res.json({ 
            message: "Cart pending order created", 
            orderId: order._id.toString(),
            order,
            itemCount: orderItems.length
        });

    } catch (err) {
        console.error("Cart pending order create error:", err);
        res.status(500).json({ error: "Error creating cart order" });
    }
});

/**
 * ADMIN — DELETE ORDER
 */
router.delete("/admin/delete/:orderId", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;

        console.log(`🗑️ Admin attempting to delete order: ${orderId}`);

        // Find the order first to verify it exists
        const order = await Order.findById(orderId);
        if (!order) {
            console.log(`❌ Order not found: ${orderId}`);
            return res.status(404).json({ error: "Order not found" });
        }

        // Log order details before deletion
        console.log(`📋 Order details before deletion:`, {
            orderId: order._id,
            userId: order.user_id,
            totalAmount: order.totalAmount,
            status: order.status,
            createdAt: order.createdAt
        });

        // Delete the order
        await Order.findByIdAndDelete(orderId);

        console.log(`✅ Order deleted successfully: ${orderId}`);

        res.json({ 
            message: "Order deleted successfully",
            deletedOrderId: orderId
        });

    } catch (err) {
        console.error("❌ Delete order error:", err);
        res.status(500).json({ error: "Error deleting order: " + err.message });
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

/**
 * PREVIEW ORDER COMMISSIONS (Admin Only)
 */
const { buildOrderProfitSnapshot, calculateOrderProfitTotal } = require("../services/orderProfit");

// Helper to sanitize order output for non-admin customer responses
function sanitizeOrderForCustomer(order, req) {
    if (!order) return order;
    if (req && req.user && req.user.role === 'admin') return order;

    const obj = typeof order.toObject === 'function' ? order.toObject() : { ...order };
    delete obj.profitAmount;
    delete obj.orderProfitTotal;

    if (Array.isArray(obj.items)) {
        obj.items = obj.items.map(item => {
            const itemObj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
            delete itemObj.profitTypeSnapshot;
            delete itemObj.profitValueSnapshot;
            delete itemObj.unitProfitSnapshot;
            delete itemObj.lineProfitSnapshot;
            return itemObj;
        });
    }

    return obj;
}

/**
 * ADMIN — VERIFY PAYMENT (Manual UPI / PhonePe / Cheque / Bank Transfer)
 * Updates payment-specific fields ONLY: paymentStatus, paymentDetails.status, utrNumber, verifiedAt, verifiedBy.
 * Keeps deliveryStatus and fulfillment status separate.
 */
router.post("/admin/verify-payment/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { utrNumber, paymentMethod, adminNotes } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Update payment-specific fields ONLY
        order.paymentStatus = 'completed';
        order.paymentDetails = order.paymentDetails || {};
        order.paymentDetails.status = 'verified';
        if (utrNumber && utrNumber.trim()) {
            order.paymentDetails.utrNumber = utrNumber.trim();
        }
        order.paymentDetails.verifiedAt = new Date();
        order.paymentDetails.verifiedBy = req.user.id;
        if (paymentMethod && paymentMethod.trim()) {
            order.paymentType = paymentMethod.trim().toLowerCase();
        }
        if (adminNotes && adminNotes.trim()) {
            order.paymentDetails.adminNotes = adminNotes.trim();
        }
        order.rewardApplied = true;

        await order.save();
        console.log(`✅ Admin verified payment for order ${orderId}: UTR ${order.paymentDetails.utrNumber || 'N/A'}, Method: ${order.paymentType}`);

        // Post-verification actions
        try {
            await autoGenerateInvoiceForOrder(order);
        } catch (invErr) {
            console.error("⚠️ Invoice auto-generation error in verify-payment:", invErr.message);
        }

        try {
            const { processAutomaticCommissionForOrder } = require("../services/commissionDistribution");
            await processAutomaticCommissionForOrder(order);
        } catch (commErr) {
            console.error("⚠️ Automatic commission distribution error in verify-payment:", commErr.message);
        }

        try {
            const { checkAndActivateMembership } = require("../services/membershipService");
            await checkAndActivateMembership(order);
        } catch (memErr) {
            console.error("⚠️ Error checking/activating membership in verify-payment:", memErr.message);
        }

        try {
            const user = await User.findById(order.user_id);
            if (user) {
                if (!user.firstPurchaseDone) {
                    user.firstPurchaseDone = true;
                    user.firstPurchaseDate = new Date();
                    await user.save();
                }
                if (user.treeLevel === 0 || !user.treeParent) {
                    const { createTreePlacementOnFirstPurchase } = require("../services/treePlacement");
                    await createTreePlacementOnFirstPurchase(user._id);
                }
            }
        } catch (treeErr) {
            console.error("⚠️ Tree placement error in verify-payment:", treeErr.message);
        }

        res.json({
            success: true,
            message: "Payment verified successfully",
            order
        });
    } catch (error) {
        console.error("Error verifying payment:", error);
        res.status(500).json({ error: error.message || "Failed to verify payment" });
    }
});

const { previewCommissions, distributeCommissions } = require("../services/commissionDistribution");

router.post(["/admin/:id/preview-commissions", "/:id/preview-commissions"], authenticateToken, isAdmin, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (!isPaymentVerified(order)) {
            return res.status(400).json({ error: "Payment must be verified before previewing commissions." });
        }

        let profitAmount = typeof order.orderProfitTotal === 'number' && order.orderProfitTotal > 0
            ? order.orderProfitTotal
            : Number(req.body.profitAmount);

        if (isNaN(profitAmount) || profitAmount <= 0) {
            // Build snapshot if missing
            order.items = await buildOrderProfitSnapshot(order.items);
            order.orderProfitTotal = calculateOrderProfitTotal(order.items);
            await order.save();
            profitAmount = order.orderProfitTotal;
        }

        const preview = await previewCommissions(orderId, profitAmount);
        res.json({
            success: true,
            preview
        });
    } catch (error) {
        console.error("Error previewing commissions:", error);
        res.status(500).json({ error: error.message || "Failed to preview commissions" });
    }
});

/**
 * APPROVE & DISTRIBUTE COMMISSIONS (Admin Only)
 * Uses Authoritative order.orderProfitTotal Snapshot
 */
router.post(["/admin/:id/distribute-commissions", "/:id/distribute-commissions"], authenticateToken, isAdmin, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (!isPaymentVerified(order)) {
            return res.status(400).json({ error: "Payment must be verified before approving or distributing commissions." });
        }

        if (order.commissionStatus === 'distributed') {
            return res.status(400).json({ error: "Commissions have already been distributed for this order." });
        }

        // Authoritative Write-Once Snapshot Check
        if (typeof order.orderProfitTotal !== 'number' || order.orderProfitTotal <= 0 || !order.items.some(i => (Number(i.unitProfitSnapshot) || 0) > 0)) {
            order.items = await buildOrderProfitSnapshot(order.items);
            order.orderProfitTotal = calculateOrderProfitTotal(order.items);
            await order.save();
        }

        const profitAmount = order.orderProfitTotal;

        // Call the distributeCommissions service with authoritative profitAmount
        const transaction = await distributeCommissions(
            order._id,
            order.user_id,
            order.totalAmount || 0,
            profitAmount
        );

        // Update order record
        order.profitAmount = profitAmount;
        order.commissionStatus = 'distributed';
        order.rewardApplied = true;
        await order.save();

        console.log(`✅ Admin approved commissions for order ${orderId} using authoritative snapshot profit ₹${profitAmount}`);

        res.json({
            success: true,
            message: "Commissions approved and distributed successfully",
            order: {
                _id: order._id,
                profitAmount: order.profitAmount,
                orderProfitTotal: order.orderProfitTotal,
                commissionStatus: order.commissionStatus
            },
            transaction
        });
    } catch (error) {
        console.error("Error distributing commissions:", error);
        res.status(500).json({ error: error.message || "Failed to distribute commissions" });
    }
});

/**
 * REPAIR ZERO-PROFIT COMMISSION (Admin Only)
 * Safe, one-order-at-a-time repair for orders finalized with ₹0 commission.
 * Supports mode: 'preview' (dry-run, modifies nothing) and mode: 'confirm' (executes repair).
 */
router.post(["/admin/:id/repair-zero-profit-commission", "/:id/repair-zero-profit-commission"], authenticateToken, isAdmin, async (req, res) => {
    let claim = null;
    try {
        const orderId = req.params.id;
        const mode = (req.body && req.body.mode) ? String(req.body.mode).toLowerCase().trim() : 'preview';

        if (mode !== 'preview' && mode !== 'confirm') {
            return res.status(400).json({ error: "Invalid mode. Must be 'preview' or 'confirm'." });
        }

        const order = await Order.findById(orderId).populate('user_id');
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Guard 1: Order completed and payment verified/completed
        if (order.status !== 'completed' || !isPaymentVerified(order)) {
            return res.status(400).json({ 
                error: "Order must have status 'completed' and verified payment to repair commission." 
            });
        }

        // Guard 2: Order has not already been repaired
        if (order.isRepaired || order.repairedAt || order.repairStatus === 'completed') {
            return res.status(400).json({ error: "Order has already been repaired." });
        }

        // Guard 3: CommissionTransaction exists and ALL its amounts are 0
        const CommissionTransaction = require("../models/CommissionTransaction");
        const existingCommissions = await CommissionTransaction.find({ orderId: order._id });
        if (!existingCommissions || existingCommissions.length === 0) {
            return res.status(400).json({ 
                error: "No commission record found for this order. Only orders finalized with zero commission are eligible for repair." 
            });
        }

        for (const ct of existingCommissions) {
            if (ct.status === 'superseded') continue;
            const direct = Number(ct.directCommissionAmount) || 0;
            const referral = Number(ct.referralCommissionAmount) || 0;
            const adminShare = Number(ct.adminCommissionAmount) || 0;
            const treePool = Number(ct.treePoolTotal) || 0;
            const trust = Number(ct.trustFundAmount) || 0;
            const devTrust = Number(ct.devTrustFundAmount) || 0;
            const remainder = Number(ct.remainderToDevFund) || 0;
            const profit = Number(ct.profitAmount) || 0;

            let treeAmountsTotal = 0;
            if (Array.isArray(ct.treeCommissions)) {
                for (const tc of ct.treeCommissions) {
                    treeAmountsTotal += (Number(tc.amount) || 0);
                }
            }

            if (direct > 0 || referral > 0 || adminShare > 0 || treePool > 0 || trust > 0 || devTrust > 0 || remainder > 0 || profit > 0 || treeAmountsTotal > 0) {
                return res.status(400).json({ 
                    error: "Order already has non-zero commission amounts recorded. Repair is strictly forbidden for orders that already paid commissions." 
                });
            }
        }

        // Guard 4: No WalletTransaction (or other ledger entry) with amount > 0 is linked to this order
        const WalletTransaction = require("../models/WalletTransaction");
        const existingWalletTx = await WalletTransaction.findOne({ orderId: order._id, amount: { $gt: 0 } });
        if (existingWalletTx) {
            return res.status(400).json({ 
                error: `Non-zero wallet transaction (${existingWalletTx.category} ₹${existingWalletTx.amount}) already exists for this order.` 
            });
        }

        try {
            const VirtualReferralTransaction = require("../models/VirtualReferralTransaction");
            const existingVirtTx = await VirtualReferralTransaction.findOne({ orderId: order._id, amountPaise: { $gt: 0 } });
            if (existingVirtTx) {
                return res.status(400).json({ 
                    error: "Non-zero virtual referral transaction already exists for this order." 
                });
            }
        } catch (e) {}

        // Guard 5: Recompute profit from book/bundle's CURRENT profit settings
        const freshItems = (order.items || []).map(item => {
            const copy = typeof item.toObject === 'function' ? item.toObject() : { ...item };
            if ((Number(copy.unitProfitSnapshot) || 0) === 0) {
                delete copy.unitProfitSnapshot;
                delete copy.lineProfitSnapshot;
                delete copy.profitValueSnapshot;
            }
            return copy;
        });

        const recomputedItems = await buildOrderProfitSnapshot(freshItems);
        const recomputedProfit = calculateOrderProfitTotal(recomputedItems);

        if (recomputedProfit <= 0) {
            return res.status(400).json({ 
                error: `Recomputed order profit is ₹${recomputedProfit}. Please configure book or bundle profit before repairing.` 
            });
        }

        // Calculate preview via engine (changes NOTHING)
        const preview = await previewCommissions(order._id, recomputedProfit);
        const customerName = (order.user_id && order.user_id.name) ? order.user_id.name : "Customer";

        const buyerAmount = preview.buyer ? Number(preview.buyer.amount.toFixed(2)) : 0;
        const referrerAmount = preview.referrer ? Number(preview.referrer.amount.toFixed(2)) : 0;
        const treePoolAmount = Number((preview.treePoolTotal || 0).toFixed(2));
        const trustFundAmount = preview.trustFund ? Number(preview.trustFund.totalTrustAmount.toFixed(2)) : 0;
        const adminShareAmount = preview.adminCommission ? Number(preview.adminCommission.amount.toFixed(2)) : 0;
        const totalCommissionAmount = preview.totalCommissionAmount 
            ? Number(preview.totalCommissionAmount.toFixed(2)) 
            : Number((buyerAmount + referrerAmount + treePoolAmount + trustFundAmount + adminShareAmount).toFixed(2));

        if (mode === 'preview') {
            return res.json({
                success: true,
                mode: 'preview',
                orderId: order._id,
                customerName, // Customer name ONLY, NO email
                orderTotal: order.totalAmount,
                profitBase: recomputedProfit,
                amounts: {
                    buyerCashback: buyerAmount,
                    referrerCommission: referrerAmount,
                    treePool: treePoolAmount,
                    trustFund: trustFundAmount,
                    adminShare: adminShareAmount,
                    totalCommission: totalCommissionAmount
                },
                breakdown: {
                    buyer: {
                        name: preview.buyer?.name || customerName,
                        category: preview.buyer?.category || 'Direct Cashback',
                        percentage: preview.buyer?.percentage || 0,
                        amount: buyerAmount
                    },
                    referrer: {
                        name: preview.referrer?.name || 'Referrer',
                        destination: preview.referrer?.destination || '',
                        percentage: preview.referrer?.percentage || 0,
                        amount: referrerAmount,
                        status: preview.referrer?.status || 'active'
                    },
                    treePool: {
                        percentage: preview.treePoolTotal ? (recomputedProfit > 0 ? (preview.treePoolTotal / recomputedProfit) * 100 : 0) : 0,
                        amount: treePoolAmount,
                        recipientCount: (preview.treeCommissions || []).length
                    },
                    trustFund: {
                        percentage: preview.trustFund?.basePercentage || 0,
                        baseAmount: preview.trustFund?.baseAmount || 0,
                        remainderAmount: preview.trustFund?.remainderAmount || 0,
                        totalTrustAmount: trustFundAmount
                    },
                    adminShare: {
                        name: preview.adminCommission?.name || 'Admin',
                        percentage: preview.adminCommission?.percentage || 0,
                        amount: adminShareAmount
                    }
                }
            });
        }

        // 4. Confirm mode: Atomic claim first
        claim = await Order.findOneAndUpdate(
            {
                _id: order._id,
                isRepaired: { $ne: true },
                repairedAt: { $exists: false },
                repairStatus: { $ne: 'completed' },
                $or: [
                    { repairClaimedAt: { $exists: false } },
                    { repairClaimedAt: null },
                    { repairClaimedAt: { $lt: new Date(Date.now() - 30000) } }
                ]
            },
            {
                $set: {
                    repairStatus: 'in_progress',
                    repairClaimedAt: new Date()
                }
            },
            { new: true }
        );

        if (!claim) {
            const checkOrder = await Order.findById(order._id);
            if (checkOrder && (checkOrder.isRepaired || checkOrder.repairedAt || checkOrder.repairStatus === 'completed')) {
                return res.status(400).json({ error: "Order has already been repaired." });
            }
            return res.status(400).json({ error: "Order repair is currently in progress or has already been repaired." });
        }

        // Audit Trail: Mark old zero record(s) as superseded (DO NOT DELETE)
        await CommissionTransaction.updateMany(
            { orderId: order._id, status: { $ne: 'superseded' } },
            { $set: { status: 'superseded' } }
        );

        // Update order items snapshot and profit amount on order so distributeCommissions reads authoritative values
        claim.items = recomputedItems;
        claim.orderProfitTotal = recomputedProfit;
        claim.profitAmount = recomputedProfit;
        await claim.save();

        // Run commission distribution through normal engine
        const transaction = await distributeCommissions(
            claim._id,
            claim.user_id,
            claim.totalAmount || 0,
            recomputedProfit
        );

        // Store audit details on the order
        const repairAmounts = {
            buyerCashback: transaction.directCommissionAmount || 0,
            referralCommission: transaction.referralCommissionAmount || 0,
            adminShare: transaction.adminCommissionAmount || 0,
            treePool: transaction.treePoolTotal || 0,
            trustFund: transaction.trustFundAmount || 0,
            devTrustFund: transaction.devTrustFundAmount || 0,
            totalCommission: (transaction.directCommissionAmount || 0) +
                             (transaction.referralCommissionAmount || 0) +
                             (transaction.adminCommissionAmount || 0) +
                             (transaction.treePoolTotal || 0) +
                             (transaction.trustFundAmount || 0) +
                             (transaction.devTrustFundAmount || 0)
        };

        claim.isRepaired = true;
        claim.repairedAt = new Date();
        claim.repairedBy = req.user.id;
        claim.repairReason = (req.body && req.body.reason) ? String(req.body.reason).trim() : "Manual ₹0 commission repair after book profit updated";
        claim.repairProfitBase = recomputedProfit;
        claim.repairAmounts = repairAmounts;
        claim.repairStatus = 'completed';
        claim.commissionStatus = 'distributed';
        claim.rewardApplied = true;
        await claim.save();

        console.log(`✅ Zero-profit commission repaired for order ${order._id} by admin ${req.user.id}: Base ₹${recomputedProfit}, Total ₹${repairAmounts.totalCommission}`);

        return res.json({
            success: true,
            mode: 'confirm',
            message: "Zero-profit commission successfully repaired and distributed.",
            customerName,
            order: {
                _id: claim._id,
                totalAmount: claim.totalAmount,
                orderProfitTotal: claim.orderProfitTotal,
                isRepaired: claim.isRepaired,
                repairedAt: claim.repairedAt,
                repairedBy: claim.repairedBy,
                repairReason: claim.repairReason,
                repairProfitBase: claim.repairProfitBase,
                repairAmounts: claim.repairAmounts,
                commissionStatus: claim.commissionStatus
            },
            transaction
        });

    } catch (error) {
        if (claim && claim._id && claim.repairStatus === 'in_progress' && !claim.isRepaired) {
            try {
                await Order.findByIdAndUpdate(claim._id, { $set: { repairStatus: 'none', repairClaimedAt: null } });
            } catch (unlockErr) {}
        }
        console.error("Error repairing zero-profit commission:", error);
        res.status(500).json({ error: error.message || "Failed to repair commission" });
    }
});

module.exports = router;
