const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const WalletTransaction = require("../models/WalletTransaction");
const CommissionTransaction = require("../models/CommissionTransaction");
const CommissionSettings = require("../models/CommissionSettings");
const { authenticateToken } = require("../middleware/auth");
const sendMail = require("../utils/sendMail");

const router = express.Router();

// Get minimum withdrawal amount
router.get("/withdrawal-settings", authenticateToken, async (req, res) => {
    try {
        const settings = await CommissionSettings.getSettings();
        const user = await User.findById(req.user.id);
        
        console.log('Withdrawal settings debug:');
        console.log('User ID:', req.user.id);
        console.log('User found:', user ? user.name : 'Not found');
        console.log('User wallet:', user ? user.wallet : 'N/A');
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        res.json({
            minimumWithdrawalAmount: settings.minimumWithdrawalAmount || 100,
            walletBalance: user.wallet || 0, // Add wallet balance to response
            bankDetailsSetup: user.bankDetails.isSetup,
            maskedBankDetails: user.getMaskedBankDetails(),
            withdrawalStats: user.withdrawalStats
        });
    } catch (err) {
        console.error("Error fetching withdrawal settings:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Setup or update bank details
router.post("/setup-bank-details", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const { accountNumber, accountHolderName, bankName, ifscCode, upiId } = req.body;

        // Validate required fields
        if (!accountHolderName) {
            return res.status(400).json({ error: "Account holder name is required" });
        }

        if (!upiId && (!accountNumber || !bankName || !ifscCode)) {
            return res.status(400).json({ 
                error: "Either UPI ID or complete bank details (Account Number, Bank Name, IFSC) are required" 
            });
        }

        // Setup/update bank details
        await user.setupBankDetails({
            accountNumber: accountNumber ? accountNumber.trim() : null,
            accountHolderName: accountHolderName.trim(),
            bankName: bankName ? bankName.trim() : null,
            ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : null,
            upiId: upiId ? upiId.trim().toLowerCase() : null
        });

        // Send confirmation email
        try {
            await sendMail(
                user.email,
                "Bank Details Updated - Shree Mata",
                `
                <h2>Hello ${user.name},</h2>
                <p>Your bank/UPI details have been successfully saved for withdrawal requests.</p>
                <p>You can use these details for instant withdrawals or update them whenever needed from your Referral Dashboard or Account page.</p>
                <br>
                <p>Shree Mata Team</p>
                `
            );
        } catch (mailErr) {
            console.warn("Could not send bank setup confirmation email:", mailErr.message);
        }

        res.json({ 
            success: true,
            message: "Bank details saved successfully",
            maskedBankDetails: user.getMaskedBankDetails()
        });

    } catch (err) {
        console.error("Error setting up bank details:", err);
        res.status(500).json({ error: err.message || "Server error" });
    }
});

// Delete / reset saved bank details
router.delete("/bank-details", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (typeof user.clearBankDetails === "function") {
            await user.clearBankDetails();
        } else {
            user.bankDetails = {
                isSetup: false,
                setupDate: null,
                accountNumber: null,
                accountHolderName: null,
                bankName: null,
                ifscCode: null,
                upiId: null,
                scannerImageUrl: null,
                scannerImage: null,
                qrCode: null,
                qrCodeData: null,
                isVerified: false,
                verificationDate: null,
                lastModifiedBy: "user",
                dailyLimit: 5000,
                monthlyLimit: 50000,
                adminNotes: null
            };
            await user.save();
        }

        res.json({
            success: true,
            message: "Saved bank details removed successfully"
        });

    } catch (err) {
        console.error("Error deleting bank details:", err);
        res.status(500).json({ error: err.message || "Failed to delete saved bank details" });
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
        const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.referralCommissionEarned || 0) + (user.treeCommissionEarned || 0);
        const combinedDirectCommission = (user.directCommissionEarned || 0) + (user.referralCommissionEarned || 0);
        const commissionBreakdown = {
            totalEarned: totalCommissionEarned,  // Use sum of tracked commissions, not wallet
            walletBalance: user.wallet,  // Actual wallet balance (may include old system payments)
            directCommission: combinedDirectCommission,
            treeCommission: user.treeCommissionEarned || 0,
            directPercentage: totalCommissionEarned > 0 
                ? (combinedDirectCommission / totalCommissionEarned * 100).toFixed(2)
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
        
        // Check if bank details are setup or provided in request
        const { accountHolderName, accountNumber, bankName, ifscCode, upiId, scannerImageUrl, scannerImage, qrCodeData, paymentProof } = req.body;
        const scannerPath = scannerImageUrl || scannerImage || qrCodeData || paymentProof || user.bankDetails?.scannerImageUrl || user.bankDetails?.scannerImage || null;
        const isBankSetup = user.bankDetails && user.bankDetails.isSetup;

        if (!isBankSetup) {
            const hasUpi = Boolean(upiId && upiId.trim());
            const hasBank = Boolean(accountNumber && accountNumber.trim() && bankName && bankName.trim() && ifscCode && ifscCode.trim());

            if (!hasUpi && !hasBank) {
                return res.status(400).json({ 
                    error: "Payment destination required. Please provide either complete Bank details (Account Number, Bank Name, IFSC Code) or a UPI ID.",
                    requiresPaymentDetails: true,
                    requiresBankSetup: true
                });
            }

            user.bankDetails = {
                ...(user.bankDetails || {}),
                accountHolderName: (accountHolderName || user.name || 'User').trim(),
                accountNumber: accountNumber ? accountNumber.trim() : null,
                bankName: bankName ? bankName.trim() : null,
                ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : null,
                upiId: upiId ? upiId.trim().toLowerCase() : null,
                scannerImageUrl: scannerPath,
                scannerImage: scannerPath,
                qrCode: scannerPath,
                qrCodeData: scannerPath,
                isSetup: true,
                setupDate: new Date(),
                lastModifiedBy: 'user'
            };
        } else if (scannerPath && (!user.bankDetails.scannerImageUrl && !user.bankDetails.scannerImage)) {
            user.bankDetails.scannerImageUrl = scannerPath;
            user.bankDetails.scannerImage = scannerPath;
            user.bankDetails.qrCodeData = scannerPath;
        }

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

        // Check withdrawal limits
        try {
            user.checkWithdrawalLimits(amount);
        } catch (limitError) {
            return res.status(400).json({ error: limitError.message });
        }

        // Deduct from wallet immediately
        user.wallet -= amount;

        // Update withdrawal stats
        user.updateWithdrawalStats(amount);

        // Create withdrawal request using saved bank details
        user.withdrawals.push({
            amount,
            upi: user.bankDetails.upiId,
            bankName: user.bankDetails.bankName,
            bank: user.bankDetails.accountNumber,
            ifsc: user.bankDetails.ifscCode,
            scannerImageUrl: scannerPath,
            scannerImage: scannerPath,
            qrCodeData: scannerPath,
            paymentProof: scannerPath,
            paymentDetails: {
                scannerImageUrl: scannerPath,
                scannerImage: scannerPath,
                upiId: user.bankDetails.upiId || null,
                accountNumber: user.bankDetails.accountNumber || null,
                bankName: user.bankDetails.bankName || null,
                ifscCode: user.bankDetails.ifscCode || null,
                accountHolderName: user.bankDetails.accountHolderName || null
            },
            date: new Date(),
            status: "pending" // Set to pending for admin approval
        });

        await user.save();

        // Send confirmation email
        await sendMail(
            user.email,
            "Withdrawal Request Submitted",
            `
            <h2>Hello ${user.name},</h2>
            <p>Your withdrawal request of <b>₹${amount}</b> has been submitted.</p>
            <p>Status: <b>Pending Admin Approval</b></p>
            <p>The amount will be transferred to your registered bank account/UPI.</p>
            <br>
            <p>Shree Mata Team</p>
            `
        );

        res.json({ 
            message: "Withdrawal request submitted successfully",
            amount,
            status: "pending",
            remainingBalance: user.wallet,
            dailyLimitRemaining: user.bankDetails.dailyLimit - user.withdrawalStats.dailyWithdrawn,
            monthlyLimitRemaining: user.bankDetails.monthlyLimit - user.withdrawalStats.monthlyWithdrawn
        });

    } catch (err) {
        console.error("Withdrawal error:", err);
        res.status(500).json({ error: err.message || "Server error" });
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
        const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');
        
        // Parse query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        // Parse filters
        const commissionType = req.query.type; // 'direct', 'referral', 'tree', 'virtual_tree_income', or undefined for all
        const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = startDate;
            if (endDate) dateFilter.createdAt.$lte = endDate;
        }

        const userDoc = await User.findById(userId).select('wallet name email');
        if (!userDoc) {
            return res.status(404).json({ error: 'User not found' });
        }

        const earningsCategories = [
            'direct_commission', 'cashback', 'buyer_cashback',
            'referral_commission', 'referral_registration_reward', 'referral_fallback',
            'tree_commission', 'tree_pool', 'tree', 'treeCommission', 'tree_pool_commission'
        ];

        const wtxQuery = {
            userId: userId,
            type: 'credit',
            category: { $in: earningsCategories },
            ...dateFilter
        };

        const walletTxs = await WalletTransaction.find(wtxQuery)
            .populate({
                path: 'orderId',
                select: 'orderNumber totalAmount user_id',
                populate: { path: 'user_id', select: 'name' }
            })
            .sort({ createdAt: -1 });

        // Query virtual referral positions to map VR-000x numbers
        const virtualUsers = await User.find({ originalUser: userId, isVirtual: true })
            .select('_id name treeLevel treePosition createdAt')
            .sort({ createdAt: 1 })
            .lean();

        const vrNumberMap = new Map();
        virtualUsers.forEach((v, index) => {
            vrNumberMap.set(v._id.toString(), `VR-${String(index + 1).padStart(4, '0')}`);
        });

        // Query VirtualReferralTransaction for tree_commission ONLY (excluding internal transfers)
        const vtxQuery = {
            ownerUserId: userId,
            type: 'tree_commission',
            ...dateFilter
        };

        const virtualTxs = await VirtualReferralTransaction.find(vtxQuery)
            .populate({
                path: 'virtualReferralId',
                select: 'name email treeLevel treePosition'
            })
            .populate({
                path: 'orderId',
                select: 'orderNumber totalAmount user_id',
                populate: { path: 'user_id', select: 'name' }
            })
            .sort({ createdAt: -1 })
            .lean();

        const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

        let totalDirectCommission = 0;    // Direct Referral
        let totalCashbackCommission = 0;  // Buyer Cashback
        let totalTreeCommission = 0;      // Real Node Tree Earnings
        let totalVirtualTreeIncome = 0;   // Virtual Node Tree Earnings
        let directCount = 0;
        let cashbackCount = 0;
        let treeCount = 0;
        let virtualTreeCount = 0;

        const allCommissions = [];

        // 1. Process Wallet Transactions
        for (const tx of walletTxs) {
            const cat = (tx.category || '').toLowerCase();
            let commType = 'other';
            let isVirtual = false;
            let level = 1;

            const levelMatch = tx.description ? tx.description.match(/Level\s*(\d+)|L(\d+)/i) : null;
            if (levelMatch) {
                level = parseInt(levelMatch[1] || levelMatch[2]);
            }
            if (tx.description && /via virtual/i.test(tx.description)) {
                isVirtual = true;
            }

            if (['tree_commission', 'tree_pool', 'tree', 'treecommission', 'tree_pool_commission'].includes(cat)) {
                commType = 'tree';
                totalTreeCommission += tx.amount;
                treeCount++;
            } else if (['direct_commission', 'cashback', 'buyer_cashback'].includes(cat)) {
                commType = 'direct'; // maps to Buyer Cashback
                totalCashbackCommission += tx.amount;
                cashbackCount++;
            } else if (['referral_commission', 'referral_registration_reward', 'referral_fallback'].includes(cat)) {
                commType = 'referral'; // maps to Direct Referral
                totalDirectCommission += tx.amount;
                directCount++;
            }

            const orderObj = tx.orderId;
            const orderNum = orderObj ? orderObj.orderNumber : null;
            const orderIdVal = orderObj ? orderObj._id : null;
            const purchaserObj = orderObj ? (orderObj.purchaser || orderObj.user_id) : null;
            const purchaserName = purchaserObj ? purchaserObj.name : 'Customer';

            allCommissions.push({
                _id: tx._id,
                id: tx._id.toString(),
                date: tx.createdAt,
                createdAt: tx.createdAt,
                amount: tx.amount,
                commissionType: commType,
                type: commType,
                displayCategory: commType === 'direct' ? 'Buyer Cashback' : (commType === 'referral' ? 'Direct Referral' : 'Tree Commission'),
                category: tx.category,
                description: tx.description,
                orderAmount: orderObj ? orderObj.totalAmount : 0,
                orderId: orderIdVal,
                orderNumber: orderNum,
                purchaser: {
                    name: purchaserName
                },
                level: level,
                isVirtual: isVirtual,
                status: 'completed',
                statusText: 'Credited'
            });
        }

        // 2. Process VirtualReferralTransactions (type === 'tree_commission' ONLY)
        for (const vtx of virtualTxs) {
            const amountRupees = round2((vtx.amountPaise || 0) / 100);
            totalVirtualTreeIncome += amountRupees;
            virtualTreeCount++;

            const vrIdStr = vtx.virtualReferralId ? vtx.virtualReferralId._id.toString() : '';
            const vrNumber = vrNumberMap.get(vrIdStr) || (vtx.virtualReferralId ? vtx.virtualReferralId.name : 'Virtual Node');
            const orderObj = vtx.orderId;
            const orderNum = orderObj ? orderObj.orderNumber : null;
            const orderIdVal = orderObj ? orderObj._id : null;
            const purchaserObj = orderObj ? (orderObj.purchaser || orderObj.user_id) : null;
            const purchaserName = purchaserObj ? purchaserObj.name : 'Customer';

            allCommissions.push({
                _id: vtx._id,
                id: vtx._id.toString(),
                date: vtx.createdAt,
                createdAt: vtx.createdAt,
                amount: amountRupees,
                amountPaise: vtx.amountPaise,
                commissionType: 'virtual_tree_income',
                type: 'virtual_tree_income',
                displayCategory: 'Virtual Tree Income',
                category: 'virtual_tree_income',
                description: `Virtual Tree Pool Commission from Level ${vtx.sourceTreeLevel || 1}`,
                orderAmount: orderObj ? orderObj.totalAmount : 0,
                orderId: orderIdVal,
                orderNumber: orderNum,
                purchaser: {
                    name: purchaserName
                },
                level: vtx.sourceTreeLevel || 1,
                sourceTreeLevel: vtx.sourceTreeLevel || 1,
                virtualReferralId: vrIdStr,
                virtualReferralNumber: vrNumber,
                isVirtual: true,
                status: 'held',
                statusText: 'Held in Virtual Balance'
            });
        }

        // Sort combined list by date descending
        allCommissions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Apply type filter if requested
        let filteredCommissions = allCommissions;
        if (commissionType) {
            const reqType = commissionType.toLowerCase();
            if (['virtual_tree_income', 'virtual_tree', 'virtual'].includes(reqType)) {
                filteredCommissions = allCommissions.filter(c => c.commissionType === 'virtual_tree_income');
            } else if (['direct', 'buyer_cashback', 'cashback'].includes(reqType)) {
                filteredCommissions = allCommissions.filter(c => c.commissionType === 'direct');
            } else if (['referral', 'direct_referral'].includes(reqType)) {
                filteredCommissions = allCommissions.filter(c => c.commissionType === 'referral');
            } else if (['tree', 'tree_commission'].includes(reqType)) {
                filteredCommissions = allCommissions.filter(c => c.commissionType === 'tree');
            } else {
                filteredCommissions = allCommissions.filter(c => c.commissionType === commissionType);
            }
        }

        totalDirectCommission = round2(totalDirectCommission);
        totalCashbackCommission = round2(totalCashbackCommission);
        totalTreeCommission = round2(totalTreeCommission);
        totalVirtualTreeIncome = round2(totalVirtualTreeIncome);

        // Enforce Total Earnings Invariant: totalCommission = direct + tree + cashback + virtualTreeIncome
        const totalCommission = round2(totalDirectCommission + totalTreeCommission + totalCashbackCommission + totalVirtualTreeIncome);
        const totalCount = filteredCommissions.length;
        const paginatedCommissions = filteredCommissions.slice(skip, skip + limit);

        res.json({
            commissions: paginatedCommissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                totalCount: totalCount,
                limit: limit,
                hasNextPage: skip + limit < totalCount,
                hasPrevPage: page > 1
            },
            summary: {
                totalCommission: totalCommission,
                totalEarnings: totalCommission,
                totalDirectCommission: totalDirectCommission,
                totalTreeCommission: totalTreeCommission,
                totalCashbackCommission: totalCashbackCommission,
                totalVirtualTreeIncome: totalVirtualTreeIncome,
                virtualTreeIncome: totalVirtualTreeIncome,
                directReferral: totalDirectCommission,
                treeEarnings: totalTreeCommission,
                buyerCashback: totalCashbackCommission,
                directCommissionCount: directCount,
                treeCommissionCount: treeCount,
                cashbackCommissionCount: cashbackCount,
                virtualTreeIncomeCount: virtualTreeCount,
                walletBalance: round2(userDoc.wallet || 0),
                availableWallet: round2(userDoc.wallet || 0)
            },
            counts: {
                all: allCommissions.length,
                buyerCashback: cashbackCount,
                directReferral: directCount,
                treeCommission: treeCount,
                virtualTreeIncome: virtualTreeCount
            }
        });

    } catch (err) {
        console.error("Commission history error:", err.stack || err);
        res.status(500).json({ error: "Failed to fetch commission history" });
    }
});

// Request bank detail change (user submits request)
router.post("/request-bank-change", authenticateToken, async (req, res) => {
    console.log('🔄 Bank change request endpoint hit!');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user?.id);
    
    try {
        const user = await User.findById(req.user.id);
        console.log('User found:', user?.name, 'Bank setup:', user?.bankDetails?.isSetup);
        
        if (!user.bankDetails.isSetup) {
            console.log('❌ No bank details setup');
            return res.status(400).json({ error: "No bank details found to change" });
        }

        // Check if there's already a pending request
        if (user.bankChangeRequest && user.bankChangeRequest.status === 'pending') {
            console.log('❌ Already has pending request');
            return res.status(400).json({ 
                error: "You already have a pending bank change request. Please wait for admin approval.",
                requestDate: user.bankChangeRequest.requestedAt
            });
        }

        const { accountNumber, accountHolderName, bankName, ifscCode, upiId, reason } = req.body;
        console.log('Extracted data:', { accountNumber, accountHolderName, bankName, ifscCode, upiId, reason });

        // Validate required fields
        if (!accountHolderName) {
            console.log('❌ Missing account holder name');
            return res.status(400).json({ error: "Account holder name is required" });
        }

        if (!reason || reason.trim().length < 10) {
            console.log('❌ Invalid reason:', reason);
            return res.status(400).json({ error: "Please provide a detailed reason for the change (minimum 10 characters)" });
        }

        if (!upiId && (!accountNumber || !bankName || !ifscCode)) {
            console.log('❌ Missing bank details or UPI');
            return res.status(400).json({ 
                error: "Either UPI ID or complete bank details (Account Number, Bank Name, IFSC) are required" 
            });
        }

        // Store the change request
        const bankChangeRequest = {
            newBankDetails: {
                accountNumber: accountNumber || null,
                accountHolderName: accountHolderName.trim(),
                bankName: bankName ? bankName.trim() : null,
                ifscCode: ifscCode ? ifscCode.toUpperCase().trim() : null,
                upiId: upiId ? upiId.toLowerCase().trim() : null
            },
            reason: reason.trim(),
            requestedAt: new Date(),
            status: 'pending'
        };
        
        console.log('Creating bank change request:', bankChangeRequest);
        user.bankChangeRequest = bankChangeRequest;

        console.log('Saving user with bank change request...');
        await user.save();
        console.log('✅ Bank change request saved successfully!');

        // Verify it was saved
        const savedUser = await User.findById(req.user.id);
        console.log('Verification - saved request:', savedUser.bankChangeRequest);

        res.json({ 
            message: "Bank detail change request submitted successfully",
            requestId: user._id,
            status: "pending",
            estimatedProcessingTime: "2-3 business days"
        });

    } catch (err) {
        console.error("❌ Bank change request error:", err);
        res.status(500).json({ error: err.message || "Server error" });
    }
});

// Get bank change request status
router.get("/bank-change-status", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user.bankChangeRequest) {
            return res.json({ hasRequest: false });
        }

        res.json({
            hasRequest: true,
            status: user.bankChangeRequest.status,
            requestedAt: user.bankChangeRequest.requestedAt,
            reason: user.bankChangeRequest.reason,
            processedAt: user.bankChangeRequest.processedAt,
            adminNotes: user.bankChangeRequest.adminNotes
        });

    } catch (err) {
        console.error("Error fetching bank change status:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;

// Admin: Get all bank change requests
router.get("/admin/bank-change-requests", authenticateToken, async (req, res) => {
    try {
        console.log('Admin bank change requests endpoint called');
        
        // Check if user is admin
        const adminUser = await User.findById(req.user.id);
        console.log('Admin user:', adminUser?.name, 'Role:', adminUser?.role);
        
        if (adminUser.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const { status = 'pending', page = 1, limit = 20 } = req.query;
        console.log('Query params:', { status, page, limit });
        
        // First, let's check if there are any users with bankChangeRequest at all
        console.log('🔍 Checking for users with bankChangeRequest field...');
        
        // Get all users and check manually
        const allUsers = await User.find({}).select('name email bankChangeRequest');
        console.log('Total users in database:', allUsers.length);
        
        const usersWithBankChangeField = allUsers.filter(user => 
            user.bankChangeRequest && 
            user.bankChangeRequest.status === status
        );
        console.log(`Users with bankChangeRequest status '${status}':`, usersWithBankChangeField.length);
        
        usersWithBankChangeField.forEach(user => {
            console.log(`- ${user.name}: status=${user.bankChangeRequest?.status}, requestedAt=${user.bankChangeRequest?.requestedAt}`);
        });
        
        // Use the filtered results instead of MongoDB query
        const users = usersWithBankChangeField.slice((page - 1) * limit, page * limit);
        const total = usersWithBankChangeField.length;

        console.log('Filtered users for status', status, ':', users.length);
        console.log('Total count:', total);

        console.log('Total count:', total);

        const response = {
            requests: users.map(user => ({
                userId: user._id,
                name: user.name,
                email: user.email,
                referralCode: user.referralCode,
                currentBankDetails: user.getMaskedBankDetails(),
                changeRequest: user.bankChangeRequest
            })),
            pagination: {
                current: page,
                total: Math.ceil(total / limit),
                count: users.length,
                totalRequests: total
            }
        };
        
        console.log('Sending response:', JSON.stringify(response, null, 2));
        res.json(response);

    } catch (err) {
        console.error("Error fetching bank change requests:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Admin: Process bank change request (approve/reject)
router.post("/admin/process-bank-change/:userId", authenticateToken, async (req, res) => {
    console.log('🔄 Backend: Processing bank change request');
    console.log('🔄 Backend: User ID:', req.params.userId);
    console.log('🔄 Backend: Request body:', req.body);
    
    try {
        // Check if user is admin
        const adminUser = await User.findById(req.user.id);
        console.log('🔄 Backend: Admin user:', adminUser?.name, 'Role:', adminUser?.role);
        
        if (adminUser.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const { action, adminNotes } = req.body; // action: 'approve' or 'reject'
        const userId = req.params.userId;

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
        }

        const user = await User.findById(userId);
        console.log('🔄 Backend: Target user found:', user?.name);
        console.log('🔄 Backend: Current bank change request:', user?.bankChangeRequest);
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.bankChangeRequest || user.bankChangeRequest.status !== 'pending') {
            console.log('❌ Backend: No pending request found');
            return res.status(400).json({ error: "No pending bank change request found" });
        }

        const oldBankDetails = { ...user.bankDetails };
        console.log('🔄 Backend: Old bank details:', oldBankDetails);

        if (action === 'approve') {
            console.log('🔄 Backend: Approving request - updating bank details');
            console.log('🔄 Backend: New bank details:', user.bankChangeRequest.newBankDetails);
            
            // Update bank details with new information
            user.bankDetails = {
                ...user.bankDetails,
                ...user.bankChangeRequest.newBankDetails,
                lastModifiedBy: 'admin',
                isVerified: false, // Reset verification status
                verificationDate: null
            };
            
            console.log('🔄 Backend: Updated bank details:', user.bankDetails);
        }

        // Update request status
        console.log('🔄 Backend: Updating request status to:', action === 'approve' ? 'approved' : 'rejected');
        user.bankChangeRequest.status = action === 'approve' ? 'approved' : 'rejected';
        user.bankChangeRequest.processedAt = new Date();
        user.bankChangeRequest.processedBy = req.user.id;
        user.bankChangeRequest.adminNotes = adminNotes || '';

        console.log('🔄 Backend: Final bank change request:', user.bankChangeRequest);
        console.log('🔄 Backend: Saving user...');
        
        // Mark the field as modified to ensure MongoDB saves it
        user.markModified('bankChangeRequest');
        user.markModified('bankDetails');
        
        await user.save();
        console.log('✅ Backend: User saved successfully!');
        
        // Verify the save worked
        const savedUser = await User.findById(userId);
        console.log('🔍 Backend: Verification - saved status:', savedUser.bankChangeRequest?.status);

        // Send email notification to user
        const emailSubject = action === 'approve' ? 
            'Bank Details Updated Successfully' : 
            'Bank Detail Change Request Rejected';

        const emailContent = action === 'approve' ? `
            <h2>✅ Bank Details Updated Successfully</h2>
            <p>Dear ${user.name},</p>
            
            <p>Your bank detail change request has been <strong>approved</strong> and your account has been updated.</p>
            
            <div style="background: #d4edda; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>✅ What's Updated:</h3>
                <ul>
                    <li>Your new bank details are now active</li>
                    <li>You can make withdrawals using the new details</li>
                    <li>Old bank details have been replaced</li>
                </ul>
            </div>
            
            ${adminNotes ? `
            <div style="background: #e3f2fd; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>📝 Admin Notes:</h3>
                <p>${adminNotes}</p>
            </div>
            ` : ''}
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>🔒 Security Notice:</h3>
                <p>For security reasons, your account verification status has been reset. Your first withdrawal with the new details may require additional verification.</p>
            </div>
            
            <p>Thank you for using our secure banking system!</p>
            <p><strong>Shree Mata Team</strong></p>
        ` : `
            <h2>❌ Bank Detail Change Request Rejected</h2>
            <p>Dear ${user.name},</p>
            
            <p>We regret to inform you that your bank detail change request has been <strong>rejected</strong>.</p>
            
            <div style="background: #f8d7da; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>📋 Request Details:</h3>
                <p><strong>Submitted:</strong> ${new Date(user.bankChangeRequest.requestedAt).toLocaleString()}</p>
                <p><strong>Processed:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            ${adminNotes ? `
            <div style="background: #fff3cd; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>📝 Reason for Rejection:</h3>
                <p>${adminNotes}</p>
            </div>
            ` : ''}
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3>🔄 Next Steps:</h3>
                <ul>
                    <li>Your current bank details remain unchanged and active</li>
                    <li>You can submit a new change request if needed</li>
                    <li>Contact our support team if you have questions</li>
                </ul>
            </div>
            
            <p>Thank you for your understanding.</p>
            <p><strong>Shree Mata Team</strong></p>
        `;

        try {
            await sendMail(user.email, emailSubject, emailContent);
        } catch (emailErr) {
            console.error("Failed to send notification email:", emailErr);
        }

        // Send confirmation email to admin
        try {
            await sendMail(
                process.env.ADMIN_EMAIL || 'admin@shreemata.com',
                `Bank Change Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
                `
                <h2>🔄 Bank Change Request Processed</h2>
                <p><strong>Action:</strong> ${action === 'approve' ? 'APPROVED ✅' : 'REJECTED ❌'}</p>
                <p><strong>User:</strong> ${user.name} (${user.email})</p>
                <p><strong>Processed By:</strong> ${adminUser.name} (${adminUser.email})</p>
                <p><strong>Processed At:</strong> ${new Date().toLocaleString()}</p>
                
                ${action === 'approve' ? `
                <h3>📋 Bank Details Updated:</h3>
                <ul>
                    <li><strong>Account Holder:</strong> ${user.bankDetails.accountHolderName}</li>
                    ${user.bankDetails.accountNumber ? `<li><strong>Account:</strong> ${user.bankDetails.accountNumber}</li>` : ''}
                    ${user.bankDetails.bankName ? `<li><strong>Bank:</strong> ${user.bankDetails.bankName}</li>` : ''}
                    ${user.bankDetails.ifscCode ? `<li><strong>IFSC:</strong> ${user.bankDetails.ifscCode}</li>` : ''}
                    ${user.bankDetails.upiId ? `<li><strong>UPI ID:</strong> ${user.bankDetails.upiId}</li>` : ''}
                </ul>
                ` : ''}
                
                ${adminNotes ? `<p><strong>Admin Notes:</strong> ${adminNotes}</p>` : ''}
                `
            );
        } catch (emailErr) {
            console.error("Failed to send admin confirmation email:", emailErr);
        }

        res.json({
            message: `Bank change request ${action}d successfully`,
            action,
            userId,
            processedAt: new Date(),
            userNotified: true
        });

    } catch (err) {
        console.error("Error processing bank change request:", err);
        res.status(500).json({ error: err.message || "Server error" });
    }
});