const express = require("express");
const User = require("../models/User");
const CommissionTransaction = require("../models/CommissionTransaction");
const CommissionSettings = require("../models/CommissionSettings");
const { authenticateToken } = require("../middleware/auth");
const sendMail = require("../utils/sendMail");

const router = express.Router();

// Get minimum withdrawal amount
router.get("/withdrawal-settings", authenticateToken, async (req, res) => {
    try {
        const settings = await CommissionSettings.getSettings();
        res.json({
            minimumWithdrawalAmount: settings.minimumWithdrawalAmount || 100
        });
    } catch (err) {
        console.error("Error fetching withdrawal settings:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/details", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('treeParent', 'name email referralCode')
            .populate('treeChildren', 'name email referralCode treeLevel');

        // Check if user joined without a referrer
        const hasReferrer = user.referredBy !== null && user.referredBy !== undefined;
        
        // Tree placement information
        const treePlacement = {
            treeLevel: user.treeLevel,
            treePosition: user.treePosition,
            treeParent: user.treeParent ? {
                id: user.treeParent._id,
                name: user.treeParent.name,
                email: user.treeParent.email,
                referralCode: user.treeParent.referralCode
            } : null,
            treeChildrenCount: user.treeChildren.length,
            treeChildren: user.treeChildren.map(child => ({
                id: child._id,
                name: child.name,
                email: child.email,
                referralCode: child.referralCode,
                treeLevel: child.treeLevel
            }))
        };

        // Commission breakdown
        const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);
        const commissionBreakdown = {
            totalEarned: totalCommissionEarned,  // Use sum of tracked commissions, not wallet
            walletBalance: user.wallet,  // Actual wallet balance (may include old system payments)
            directCommission: user.directCommissionEarned || 0,
            treeCommission: user.treeCommissionEarned || 0,
            directPercentage: totalCommissionEarned > 0 
                ? ((user.directCommissionEarned || 0) / totalCommissionEarned * 100).toFixed(2)
                : 0,
            treePercentage: totalCommissionEarned > 0 
                ? ((user.treeCommissionEarned || 0) / totalCommissionEarned * 100).toFixed(2)
                : 0
        };

        // Find all people directly referred by this user (using referralCode)
        const directReferrals = await User.find({ referredBy: user.referralCode })
            .select("name email firstPurchaseDone createdAt referralCode treeLevel treeParent")
            .sort({ createdAt: 1 });

        // Format direct referrals with additional info
        const formattedDirectReferrals = directReferrals.map(ref => ({
            id: ref._id,
            name: ref.name,
            email: ref.email,
            referralCode: ref.referralCode,
            firstPurchaseDone: ref.firstPurchaseDone,
            joinedDate: ref.createdAt,
            treeLevel: ref.treeLevel,
            isDirectTreeChild: ref.treeParent && ref.treeParent.toString() === user._id.toString(),
            placementType: ref.treeParent && ref.treeParent.toString() === user._id.toString() 
                ? 'direct' 
                : 'spillover'
        }));

        // Get tree structure (users placed under this user in the tree)
        const treeStructure = await User.find({ treeParent: user._id })
            .select("name email firstPurchaseDone createdAt referralCode treeLevel referredBy")
            .sort({ treePosition: 1 });

        // Format tree structure
        const formattedTreeStructure = treeStructure.map(child => ({
            id: child._id,
            name: child.name,
            email: child.email,
            referralCode: child.referralCode,
            firstPurchaseDone: child.firstPurchaseDone,
            joinedDate: child.createdAt,
            treeLevel: child.treeLevel,
            isDirectReferral: child.referredBy === user.referralCode,
            placementType: child.referredBy === user.referralCode ? 'direct' : 'spillover'
        }));

        // Referral status and messaging for no-referrer users
        const referralStatus = {
            hasReferrer: hasReferrer,
            referrerCode: user.referredBy,
            canRefer: true, // All users can refer others regardless of how they joined
            message: hasReferrer 
                ? `You joined using referral code: ${user.referredBy}` 
                : "You joined without a referral code, but you can still refer others and earn commissions!",
            directCommissionNote: hasReferrer 
                ? "You earn 3% direct commission when your referrals make purchases"
                : "When you make purchases, your 3% direct commission goes to the Trust Fund to support platform development"
        };

        res.json({
            // Basic referral info
            referralCode: user.referralCode,
            wallet: user.wallet,
            referrals: user.referrals || 0,
            
            // Referral status and messaging
            referralStatus: referralStatus,
            
            // Tree placement information
            treePlacement: treePlacement,
            
            // Commission breakdown
            commissionBreakdown: commissionBreakdown,
            
            // Direct referrals (people who used this user's referral code)
            directReferrals: {
                count: formattedDirectReferrals.length,
                users: formattedDirectReferrals
            },
            
            // Tree structure (people placed under this user in the tree)
            treeStructure: {
                count: formattedTreeStructure.length,
                users: formattedTreeStructure
            }
        });

    } catch (err) {
        console.error("Referral fetch error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/withdraw", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const amount = Number(req.body.amount);
        
        // Get minimum withdrawal amount from settings
        const settings = await CommissionSettings.getSettings();
        const minWithdrawal = settings.minimumWithdrawalAmount || 100;

        if (!amount || amount < minWithdrawal) {
            return res.status(400).json({ 
                error: `Minimum withdrawal is ₹${minWithdrawal}`,
                minimumAmount: minWithdrawal
            });
        }

        if (user.wallet < amount) {
            return res.status(400).json({ error: "Insufficient balance" });
        }

        // Deduct from wallet immediately
        user.wallet -= amount;

        // Extract bank details from request
        const { upi, bankName, bank, ifsc } = req.body;

        // Log withdrawal entry
        user.withdrawals.push({
            amount,
            upi: upi || null,
            bankName: bankName || null,
            bank: bank || null,
            ifsc: ifsc || null,
            date: new Date(),
            status: "pending"
        });

        await user.save();

        await sendMail(
    user.email,
    "Withdrawal Request Submitted",
    `
    <h2>Hello ${user.name},</h2>
    <p>Your withdrawal request of <b>₹${amount}</b> has been submitted.</p>
    <p>Status: <b>Pending Admin Approval</b></p>
    <br>
    <p>BookStore Team</p>
    `
);


        return res.json({ message: "Withdrawal request submitted!" });

    } catch (err) {
        console.error("Withdraw error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

// Get referral history with commission details
router.get("/history", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        // Find all people referred by this user
        const referredUsers = await User.find({ referredBy: user.referralCode })
            .select("name email firstPurchaseDone createdAt")
            .sort({ createdAt: -1 });

        // Calculate commission for each referral (3% of their first purchase)
        // For now, we'll show estimated commission
        const referrals = referredUsers.map(ref => ({
            name: ref.name,
            email: ref.email,
            firstPurchaseDone: ref.firstPurchaseDone,
            createdAt: ref.createdAt,
            commission: ref.firstPurchaseDone ? 0 : 0 // Will be calculated from actual purchases
        }));

        res.json({
            referrals
        });

    } catch (err) {
        console.error("Referral history error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get commission history with filtering and pagination
router.get("/commissions", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Parse query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        // Parse filters
        const commissionType = req.query.type; // 'direct', 'tree', or undefined for all
        const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.processedAt = {};
            if (startDate) dateFilter.processedAt.$gte = startDate;
            if (endDate) dateFilter.processedAt.$lte = endDate;
        }
        
        const commissions = [];
        let totalDirectCommission = 0;
        let totalTreeCommission = 0;
        
        // Query direct commissions
        if (!commissionType || commissionType === 'direct') {
            const directCommissionQuery = {
                directReferrer: userId,
                status: 'completed',
                ...dateFilter
            };
            
            const directCommissions = await CommissionTransaction.find(directCommissionQuery)
                .populate('purchaser', 'name email')
                .populate('orderId', 'orderNumber totalAmount')
                .sort({ processedAt: -1 });
            
            directCommissions.forEach(transaction => {
                if (transaction.directCommissionAmount > 0) {
                    commissions.push({
                        _id: transaction._id,
                        date: transaction.processedAt,
                        amount: transaction.directCommissionAmount,
                        commissionType: 'direct',
                        orderAmount: transaction.orderAmount,
                        orderId: transaction.orderId?._id,
                        orderNumber: transaction.orderId?.orderNumber,
                        purchaser: {
                            name: transaction.purchaser?.name,
                            email: transaction.purchaser?.email
                        },
                        level: 1,
                        percentage: 3
                    });
                    totalDirectCommission += transaction.directCommissionAmount;
                }
            });
        }
        
        // Query tree commissions
        if (!commissionType || commissionType === 'tree') {
            const treeCommissionQuery = {
                'treeCommissions.recipient': userId,
                status: 'completed',
                ...dateFilter
            };
            
            const treeCommissions = await CommissionTransaction.find(treeCommissionQuery)
                .populate('purchaser', 'name email')
                .populate('orderId', 'orderNumber totalAmount')
                .sort({ processedAt: -1 });
            
            treeCommissions.forEach(transaction => {
                // Find the specific tree commission for this user
                const userTreeCommission = transaction.treeCommissions.find(
                    tc => tc.recipient.toString() === userId
                );
                
                if (userTreeCommission && userTreeCommission.amount > 0) {
                    commissions.push({
                        _id: transaction._id,
                        date: transaction.processedAt,
                        amount: userTreeCommission.amount,
                        commissionType: 'tree',
                        orderAmount: transaction.orderAmount,
                        orderId: transaction.orderId?._id,
                        orderNumber: transaction.orderId?.orderNumber,
                        purchaser: {
                            name: transaction.purchaser?.name,
                            email: transaction.purchaser?.email
                        },
                        level: userTreeCommission.level,
                        percentage: userTreeCommission.percentage
                    });
                    totalTreeCommission += userTreeCommission.amount;
                }
            });
        }
        
        // Sort all commissions by date (most recent first)
        commissions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Calculate totals
        const totalCommission = totalDirectCommission + totalTreeCommission;
        const totalCount = commissions.length;
        
        // Apply pagination
        const paginatedCommissions = commissions.slice(skip, skip + limit);
        
        res.json({
            commissions: paginatedCommissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount: totalCount,
                limit: limit,
                hasNextPage: skip + limit < totalCount,
                hasPrevPage: page > 1
            },
            summary: {
                totalCommission: totalCommission,
                totalDirectCommission: totalDirectCommission,
                totalTreeCommission: totalTreeCommission,
                directCommissionCount: commissions.filter(c => c.commissionType === 'direct').length,
                treeCommissionCount: commissions.filter(c => c.commissionType === 'tree').length
            }
        });

    } catch (err) {
        console.error("Commission history error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
