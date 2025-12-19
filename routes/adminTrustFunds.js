const express = require("express");
const TrustFund = require("../models/TrustFund");
const User = require("../models/User");
const CommissionTransaction = require("../models/CommissionTransaction");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

/* -------------------------------------------
   GET /api/admin/trust-funds
   Return both Trust Fund and Development Trust Fund balances
   Include transaction history for each fund
   Require admin authentication
   Requirements: 6.3, 6.4
--------------------------------------------*/
router.get("/trust-funds", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Fetch both trust funds
        const trustFund = await TrustFund.findOne({ fundType: 'trust' })
            .populate('transactions.orderId', 'orderNumber totalAmount');
        
        const developmentFund = await TrustFund.findOne({ fundType: 'development' })
            .populate('transactions.orderId', 'orderNumber totalAmount');

        // Format response
        const response = {
            trustFund: {
                fundType: 'trust',
                balance: trustFund?.balance || 0,
                lastUpdated: trustFund?.lastUpdated || null,
                transactionCount: trustFund?.transactions?.length || 0,
                transactions: trustFund?.transactions.map(t => ({
                    _id: t._id,
                    orderId: t.orderId?._id,
                    orderNumber: t.orderId?.orderNumber,
                    orderAmount: t.orderId?.totalAmount,
                    amount: t.amount,
                    type: t.type,
                    timestamp: t.timestamp,
                    description: t.description
                })) || []
            },
            developmentFund: {
                fundType: 'development',
                balance: developmentFund?.balance || 0,
                lastUpdated: developmentFund?.lastUpdated || null,
                transactionCount: developmentFund?.transactions?.length || 0,
                transactions: developmentFund?.transactions.map(t => ({
                    _id: t._id,
                    orderId: t.orderId?._id,
                    orderNumber: t.orderId?.orderNumber,
                    orderAmount: t.orderId?.totalAmount,
                    amount: t.amount,
                    type: t.type,
                    timestamp: t.timestamp,
                    description: t.description
                })) || []
            },
            summary: {
                totalBalance: (trustFund?.balance || 0) + (developmentFund?.balance || 0),
                totalTransactions: (trustFund?.transactions?.length || 0) + (developmentFund?.transactions?.length || 0)
            }
        };

        res.json(response);

    } catch (err) {
        console.error("Trust funds fetch error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   GET /api/admin/referral-analytics
   Calculate total number of referral relationships
   Calculate total commissions paid out
   Display trust fund balances
   Calculate deepest tree level
   Calculate average commissions per user
   Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
--------------------------------------------*/
router.get("/referral-analytics", authenticateToken, isAdmin, async (req, res) => {
    try {
        // 1. Calculate total number of referral relationships (Requirement 9.1)
        const totalReferralRelationships = await User.countDocuments({ 
            referredBy: { $ne: null } 
        });

        // 2. Calculate total commissions paid out (Requirement 9.2)
        const commissionStats = await CommissionTransaction.aggregate([
            { $match: { status: 'completed' } },
            {
                $group: {
                    _id: null,
                    totalDirectCommissions: { $sum: '$directCommissionAmount' },
                    totalTreeCommissions: { 
                        $sum: { 
                            $sum: '$treeCommissions.amount' 
                        } 
                    },
                    totalTransactions: { $sum: 1 }
                }
            }
        ]);

        const totalDirectCommissions = commissionStats[0]?.totalDirectCommissions || 0;
        const totalTreeCommissions = commissionStats[0]?.totalTreeCommissions || 0;
        const totalCommissionsPaid = totalDirectCommissions + totalTreeCommissions;
        const totalCommissionTransactions = commissionStats[0]?.totalTransactions || 0;

        // 3. Display trust fund balances (Requirement 9.3)
        const trustFund = await TrustFund.findOne({ fundType: 'trust' });
        const developmentFund = await TrustFund.findOne({ fundType: 'development' });

        const trustFundBalance = trustFund?.balance || 0;
        const developmentFundBalance = developmentFund?.balance || 0;

        // 4. Calculate deepest tree level (Requirement 9.4)
        const deepestLevelResult = await User.findOne()
            .sort({ treeLevel: -1 })
            .select('treeLevel');
        
        const deepestTreeLevel = deepestLevelResult?.treeLevel || 0;

        // 5. Calculate average commissions per user (Requirement 9.5)
        const usersWithCommissions = await User.aggregate([
            {
                $match: {
                    $or: [
                        { directCommissionEarned: { $gt: 0 } },
                        { treeCommissionEarned: { $gt: 0 } }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalDirectCommissions: { $sum: '$directCommissionEarned' },
                    totalTreeCommissions: { $sum: '$treeCommissionEarned' },
                    totalCommissions: { 
                        $sum: { 
                            $add: ['$directCommissionEarned', '$treeCommissionEarned'] 
                        } 
                    }
                }
            }
        ]);

        const usersWithCommissionsCount = usersWithCommissions[0]?.totalUsers || 0;
        const averageCommissionPerUser = usersWithCommissionsCount > 0 
            ? (totalCommissionsPaid / usersWithCommissionsCount) 
            : 0;

        // Additional useful analytics
        const totalUsers = await User.countDocuments();
        const usersWithReferralCode = await User.countDocuments({ 
            referralCode: { $ne: null } 
        });

        // Tree structure analytics
        const treeDistribution = await User.aggregate([
            { $match: { treeLevel: { $gt: 0 } } },
            {
                $group: {
                    _id: '$treeLevel',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const response = {
            referralRelationships: {
                total: totalReferralRelationships,
                usersWithReferralCode: usersWithReferralCode,
                percentageOfUsers: totalUsers > 0 
                    ? ((totalReferralRelationships / totalUsers) * 100).toFixed(2) 
                    : 0
            },
            commissions: {
                totalPaid: totalCommissionsPaid,
                totalDirectCommissions: totalDirectCommissions,
                totalTreeCommissions: totalTreeCommissions,
                totalTransactions: totalCommissionTransactions,
                averagePerUser: averageCommissionPerUser,
                usersEarningCommissions: usersWithCommissionsCount
            },
            trustFunds: {
                trustFundBalance: trustFundBalance,
                developmentFundBalance: developmentFundBalance,
                totalBalance: trustFundBalance + developmentFundBalance
            },
            treeStructure: {
                deepestLevel: deepestTreeLevel,
                levelDistribution: treeDistribution.map(level => ({
                    level: level._id,
                    userCount: level.count
                })),
                totalUsersInTree: treeDistribution.reduce((sum, level) => sum + level.count, 0)
            },
            users: {
                total: totalUsers,
                withReferralCode: usersWithReferralCode,
                inReferralTree: totalReferralRelationships
            }
        };

        res.json(response);

    } catch (err) {
        console.error("Referral analytics error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   POST /api/admin/trust-funds/withdraw
   Withdraw from trust funds with validation
   Requirements: 6.1, 6.2
--------------------------------------------*/
router.post("/trust-funds/withdraw", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { fundType, amount, description } = req.body;

        // Validate fund type
        if (!fundType || !['trust', 'development'].includes(fundType)) {
            return res.status(400).json({ 
                error: "Invalid fund type. Must be 'trust' or 'development'",
                code: "INVALID_FUND_TYPE" 
            });
        }

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ 
                error: "Invalid withdrawal amount. Must be a positive number",
                code: "INVALID_AMOUNT" 
            });
        }

        // Find the trust fund
        const trustFund = await TrustFund.findOne({ fundType });
        
        if (!trustFund) {
            return res.status(404).json({ 
                error: `${fundType} fund not found`,
                code: "FUND_NOT_FOUND" 
            });
        }

        // Validate sufficient balance
        if (trustFund.balance < amount) {
            return res.status(400).json({ 
                error: `Insufficient balance. Available: ${trustFund.balance}, Requested: ${amount}`,
                code: "INSUFFICIENT_BALANCE",
                details: {
                    available: trustFund.balance,
                    requested: amount
                }
            });
        }

        // Perform withdrawal with retry logic
        const maxRetries = 3;
        let retryCount = 0;
        let success = false;
        let error = null;

        while (retryCount < maxRetries && !success) {
            try {
                // Add withdrawal transaction (negative amount)
                await trustFund.addTransaction(
                    -amount, 
                    'withdrawal', 
                    null, 
                    description || `Admin withdrawal from ${fundType} fund`
                );
                success = true;
            } catch (err) {
                retryCount++;
                error = err;
                console.error(`Withdrawal attempt ${retryCount} failed:`, err);
                
                if (retryCount < maxRetries) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
                }
            }
        }

        if (!success) {
            console.error('Withdrawal failed after all retries:', error);
            return res.status(500).json({ 
                error: "Failed to process withdrawal after multiple attempts",
                code: "WITHDRAWAL_FAILED",
                details: error.message 
            });
        }

        // Reconciliation check: verify balance matches transaction history
        const calculatedBalance = trustFund.transactions.reduce((sum, t) => sum + t.amount, 0);
        if (Math.abs(calculatedBalance - trustFund.balance) > 0.01) {
            console.error(`Balance mismatch detected for ${fundType} fund: calculated ${calculatedBalance}, stored ${trustFund.balance}`);
            
            // Auto-correct the balance
            trustFund.balance = calculatedBalance;
            await trustFund.save();
            
            console.log(`Balance corrected for ${fundType} fund to ${calculatedBalance}`);
        }

        res.json({ 
            message: "Withdrawal successful",
            fundType: trustFund.fundType,
            withdrawnAmount: amount,
            newBalance: trustFund.balance,
            transactionId: trustFund.transactions[trustFund.transactions.length - 1]._id
        });

    } catch (err) {
        console.error("Trust fund withdrawal error:", err);
        res.status(500).json({ 
            error: "Server error processing withdrawal",
            code: "SERVER_ERROR" 
        });
    }
});

/* -------------------------------------------
   POST /api/admin/trust-funds/reconcile
   Reconcile trust fund balances with transaction history
   Requirements: 6.1, 6.2
--------------------------------------------*/
router.post("/trust-funds/reconcile", authenticateToken, isAdmin, async (req, res) => {
    try {
        const results = [];

        // Reconcile both trust funds
        for (const fundType of ['trust', 'development']) {
            const trustFund = await TrustFund.findOne({ fundType });
            
            if (!trustFund) {
                results.push({
                    fundType,
                    status: 'not_found',
                    message: `${fundType} fund not found`
                });
                continue;
            }

            // Calculate balance from transaction history
            const calculatedBalance = trustFund.transactions.reduce((sum, t) => sum + t.amount, 0);
            const storedBalance = trustFund.balance;
            const discrepancy = Math.abs(calculatedBalance - storedBalance);

            if (discrepancy > 0.01) {
                // Mismatch detected, correct it
                const oldBalance = trustFund.balance;
                trustFund.balance = calculatedBalance;
                await trustFund.save();

                results.push({
                    fundType,
                    status: 'corrected',
                    oldBalance,
                    newBalance: calculatedBalance,
                    discrepancy,
                    transactionCount: trustFund.transactions.length
                });

                console.log(`Reconciled ${fundType} fund: ${oldBalance} -> ${calculatedBalance}`);
            } else {
                results.push({
                    fundType,
                    status: 'ok',
                    balance: storedBalance,
                    transactionCount: trustFund.transactions.length
                });
            }
        }

        res.json({ 
            message: "Reconciliation complete",
            results 
        });

    } catch (err) {
        console.error("Trust fund reconciliation error:", err);
        res.status(500).json({ 
            error: "Server error during reconciliation",
            code: "RECONCILIATION_ERROR" 
        });
    }
});

module.exports = router;
