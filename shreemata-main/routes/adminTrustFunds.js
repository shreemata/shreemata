const express = require("express");
const TrustFund = require("../models/TrustFund");
const User = require("../models/User");
const Order = require("../models/Order");
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

/* -------------------------------------------
   GET /api/admin/trust-funds/statistics
   Get total income and withdrawal statistics for admin dashboard
   Requirements: Admin overview
--------------------------------------------*/
router.get("/trust-funds/statistics", authenticateToken, isAdmin, async (req, res) => {
    try {
        console.log("📊 Statistics endpoint called");
        
        // Get all orders to calculate total income
        const orders = await Order.find({ status: "delivered" });
        console.log(`Found ${orders.length} delivered orders`);
        
        const totalIncome = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
        const totalTransactions = orders.length;

        // Get all approved withdrawals to calculate total withdrawals
        const users = await User.find({
            "withdrawals.status": "approved"
        }).select("withdrawals");
        
        console.log(`Found ${users.length} users with approved withdrawals`);

        let totalWithdrawals = 0;
        let totalWithdrawalRequests = 0;

        users.forEach(user => {
            user.withdrawals.forEach(withdrawal => {
                if (withdrawal.status === "approved") {
                    totalWithdrawals += withdrawal.amount || 0;
                    totalWithdrawalRequests++;
                }
            });
        });

        console.log(`Total withdrawals: ₹${totalWithdrawals}, Requests: ${totalWithdrawalRequests}`);

        // Get total user wallet balances
        const allUsers = await User.find({ 
            isVirtual: { $ne: true },
            wallet: { $gt: 0 }
        }).select("wallet");
        
        const totalUserWallets = allUsers.reduce((sum, user) => sum + (user.wallet || 0), 0);
        const usersWithBalance = allUsers.length;
        
        console.log(`Total user wallets: ₹${totalUserWallets}, Users with balance: ${usersWithBalance}`);

        // Get trust fund data for existing cards
        const trustFund = await TrustFund.findOne({ fundType: 'trust' });
        const developmentFund = await TrustFund.findOne({ fundType: 'development' });

        const response = {
            totalIncome: {
                amount: totalIncome,
                transactions: totalTransactions
            },
            totalWithdrawals: {
                amount: totalWithdrawals,
                requests: totalWithdrawalRequests
            },
            totalUserWallets: {
                amount: totalUserWallets,
                usersWithBalance: usersWithBalance
            },
            trustFund: {
                balance: trustFund?.balance || 0,
                transactions: trustFund?.transactions?.length || 0
            },
            developmentFund: {
                balance: developmentFund?.balance || 0,
                transactions: developmentFund?.transactions?.length || 0
            },
            summary: {
                totalAdminIncome: (trustFund?.balance || 0) + (developmentFund?.balance || 0),
                totalTransactions: (trustFund?.transactions?.length || 0) + (developmentFund?.transactions?.length || 0)
            }
        };

        console.log("📊 Statistics response:", response);
        res.json(response);

    } catch (err) {
        console.error("Statistics fetch error:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

/* -------------------------------------------
   GET /api/admin/trust-fund/summary
   Get Trust Fund summary KPIs and Sources breakdown (IST date based)
--------------------------------------------*/
router.get(["/trust-fund/summary", "/trust-funds/summary"], authenticateToken, isAdmin, async (req, res) => {
    try {
        const trustFund = await TrustFund.findOne({ fundType: 'trust' });
        if (!trustFund) {
            return res.json({
                success: true,
                summary: {
                    currentBalance: 0,
                    today: 0,
                    thisMonth: 0,
                    transactionCount: 0,
                    sources: {
                        baseTrust: 0,
                        unusedTreePool: 0,
                        missingDirectReferral: 0,
                        other: 0
                    }
                }
            });
        }

        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffsetMs);
        const year = istNow.getUTCFullYear();
        const month = istNow.getUTCMonth();
        const date = istNow.getUTCDate();

        const startOfTodayIST = new Date(Date.UTC(year, month, date) - istOffsetMs);
        const startOfMonthIST = new Date(Date.UTC(year, month, 1) - istOffsetMs);

        let todayCredits = 0;
        let thisMonthCredits = 0;

        let baseTrust = 0;
        let unusedTreePool = 0;
        let missingDirectReferral = 0;
        let other = 0;

        const transactions = trustFund.transactions || [];

        transactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            if (amt > 0) {
                const ts = new Date(t.timestamp);
                if (ts >= startOfTodayIST) todayCredits += amt;
                if (ts >= startOfMonthIST) thisMonthCredits += amt;

                const desc = t.description || '';
                if (desc.includes('Order commission allocation') || desc.includes('Development fund allocation')) {
                    baseTrust += amt;
                } else if (desc.includes('Tree remainder')) {
                    unusedTreePool += amt;
                } else if (desc.includes('Referral commission') || desc.includes('Direct commission')) {
                    missingDirectReferral += amt;
                } else {
                    other += amt;
                }
            }
        });

        const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

        res.json({
            success: true,
            summary: {
                currentBalance: trustFund.balance || 0,
                today: round2(todayCredits),
                thisMonth: round2(thisMonthCredits),
                transactionCount: transactions.length,
                sources: {
                    baseTrust: round2(baseTrust),
                    unusedTreePool: round2(unusedTreePool),
                    missingDirectReferral: round2(missingDirectReferral),
                    other: round2(other)
                }
            }
        });
    } catch (err) {
        console.error("Trust fund summary error:", err);
        res.status(500).json({ error: "Server error fetching Trust Fund summary" });
    }
});

/* -------------------------------------------
   GET /api/admin/trust-fund/transactions
   Get Trust Fund paginated & filtered transactions history
--------------------------------------------*/
router.get(["/trust-fund/transactions", "/trust-funds/transactions"], authenticateToken, isAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 15,
            dateRange = 'all',
            startDate,
            endDate,
            type = 'all',
            search = ''
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 15);

        const trustFund = await TrustFund.findOne({ fundType: 'trust' })
            .populate('transactions.orderId', 'orderNumber totalAmount orderProfitTotal commissionStatus createdAt');

        if (!trustFund || !Array.isArray(trustFund.transactions)) {
            return res.json({
                success: true,
                transactions: [],
                pagination: { page: pageNum, limit: limitNum, totalCount: 0, totalPages: 0 }
            });
        }

        // Group transactions by orderId where available
        const groupedByOrder = new Map();
        const standaloneList = [];

        trustFund.transactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            const desc = t.description || '';
            const orderDoc = t.orderId && typeof t.orderId === 'object' && t.orderId._id ? t.orderId : null;
            const orderIdStr = orderDoc ? orderDoc._id.toString() : (t.orderId ? t.orderId.toString() : null);

            if (!orderIdStr) {
                standaloneList.push({
                    _id: t._id,
                    orderId: null,
                    orderNumber: 'N/A',
                    timestamp: t.timestamp,
                    type: desc.includes('withdrawal') ? 'Withdrawal' : 'Other',
                    typeCategories: desc.includes('withdrawal') ? ['withdrawal'] : ['other'],
                    description: desc || 'Trust Fund Entry',
                    baseTrust: 0,
                    treeRemainder: 0,
                    otherAmount: amt,
                    totalCredit: amt,
                    status: amt >= 0 ? 'Credited' : 'Withdrawn'
                });
                return;
            }

            if (!groupedByOrder.has(orderIdStr)) {
                const orderNum = orderDoc && orderDoc.orderNumber 
                    ? orderDoc.orderNumber 
                    : `#SM${orderIdStr.slice(-6).toUpperCase()}`;

                groupedByOrder.set(orderIdStr, {
                    _id: t._id,
                    orderId: orderIdStr,
                    orderNumber: orderNum,
                    timestamp: t.timestamp,
                    baseTrust: 0,
                    treeRemainder: 0,
                    missingDirectReferral: 0,
                    other: 0,
                    totalCredit: 0,
                    descriptions: [],
                    orderProfit: orderDoc ? orderDoc.orderProfitTotal : 0
                });
            }

            const group = groupedByOrder.get(orderIdStr);
            if (new Date(t.timestamp) > new Date(group.timestamp)) {
                group.timestamp = t.timestamp;
            }
            group.totalCredit += amt;

            if (desc.includes('Order commission allocation') || desc.includes('Development fund allocation')) {
                group.baseTrust += amt;
            } else if (desc.includes('Tree remainder')) {
                group.treeRemainder += amt;
            } else if (desc.includes('Referral commission') || desc.includes('Direct commission')) {
                group.missingDirectReferral += amt;
            } else {
                group.other += amt;
            }
            group.descriptions.push(desc);
        });

        // Convert grouped orders to display rows
        const groupedRows = Array.from(groupedByOrder.values()).map(grp => {
            const types = [];
            const categories = [];

            if (grp.baseTrust > 0) {
                types.push('Base Trust');
                categories.push('base_trust');
            }
            if (grp.treeRemainder > 0) {
                types.push('Tree Remainder');
                categories.push('tree_remainder');
            }
            if (grp.missingDirectReferral > 0) {
                types.push('Missing Direct Referrer');
                categories.push('missing_direct_referral');
            }
            if (grp.other > 0) {
                types.push('Other');
                categories.push('other');
            }

            const displayType = types.length > 0 ? types.join(' + ') : 'Trust Credit';
            const primaryDesc = grp.descriptions.find(d => d.includes('Order commission allocation')) 
                || grp.descriptions[0] 
                || 'Order commission allocation';

            const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

            return {
                _id: grp._id,
                orderId: grp.orderId,
                orderNumber: grp.orderNumber,
                timestamp: grp.timestamp,
                type: displayType,
                typeCategories: categories,
                description: primaryDesc,
                baseTrust: round2(grp.baseTrust),
                treeRemainder: round2(grp.treeRemainder),
                otherAmount: round2(grp.missingDirectReferral + grp.other),
                totalCredit: round2(grp.totalCredit),
                status: 'Credited'
            };
        });

        let allRows = [...groupedRows, ...standaloneList];

        // 1. Date Range Filtering (IST)
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const now = new Date();
        const istNow = new Date(now.getTime() + istOffsetMs);
        const year = istNow.getUTCFullYear();
        const month = istNow.getUTCMonth();
        const date = istNow.getUTCDate();

        let filterStart = null;
        let filterEnd = null;

        if (dateRange === 'today') {
            filterStart = new Date(Date.UTC(year, month, date) - istOffsetMs);
            filterEnd = new Date(Date.UTC(year, month, date + 1) - istOffsetMs - 1);
        } else if (dateRange === 'week') {
            const dayOfWeek = istNow.getUTCDay();
            filterStart = new Date(Date.UTC(year, month, date - dayOfWeek) - istOffsetMs);
        } else if (dateRange === 'month') {
            filterStart = new Date(Date.UTC(year, month, 1) - istOffsetMs);
        } else if (dateRange === 'custom') {
            if (startDate) filterStart = new Date(startDate);
            if (endDate) {
                const e = new Date(endDate);
                e.setHours(23, 59, 59, 999);
                filterEnd = e;
            }
        }

        if (filterStart) {
            allRows = allRows.filter(r => new Date(r.timestamp) >= filterStart);
        }
        if (filterEnd) {
            allRows = allRows.filter(r => new Date(r.timestamp) <= filterEnd);
        }

        // 2. Type Filtering
        if (type && type !== 'all') {
            allRows = allRows.filter(r => r.typeCategories && r.typeCategories.includes(type));
        }

        // 3. Search Filtering (Order ID / Order Number)
        if (search && search.trim() !== '') {
            const q = search.trim().toLowerCase();
            allRows = allRows.filter(r => 
                (r.orderNumber && r.orderNumber.toLowerCase().includes(q)) ||
                (r.orderId && r.orderId.toLowerCase().includes(q)) ||
                (r.description && r.description.toLowerCase().includes(q))
            );
        }

        // 4. Sort Newest First
        allRows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 5. Pagination
        const totalCount = allRows.length;
        const totalPages = Math.ceil(totalCount / limitNum) || 1;
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedRows = allRows.slice(startIndex, startIndex + limitNum);

        res.json({
            success: true,
            transactions: paginatedRows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalCount,
                totalPages
            }
        });

    } catch (err) {
        console.error("Trust fund transactions list error:", err);
        res.status(500).json({ error: "Server error fetching Trust Fund transactions" });
    }
});

/* -------------------------------------------
   GET /api/admin/trust-fund/transactions/:id
   Get single transaction detail for modal breakdown
--------------------------------------------*/
router.get(["/trust-fund/transactions/:id", "/trust-funds/transactions/:id"], authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const trustFund = await TrustFund.findOne({ fundType: 'trust' });

        if (!trustFund || !Array.isArray(trustFund.transactions)) {
            return res.status(404).json({ error: "Trust Fund record not found" });
        }

        // Check if id is an orderId or a tx _id
        let targetOrderId = id;
        const txById = trustFund.transactions.find(t => t._id.toString() === id);
        if (txById && txById.orderId) {
            targetOrderId = txById.orderId.toString();
        }

        const txsForOrder = trustFund.transactions.filter(t => t.orderId && t.orderId.toString() === targetOrderId.toString());

        const orderDoc = await Order.findById(targetOrderId).populate('user_id', 'name email mobile');
        const commTxDoc = await CommissionTransaction.findOne({ orderId: targetOrderId });

        let baseTrust = 0;
        let unusedTreePool = 0;
        let missingDirectReferral = 0;
        let other = 0;

        if (txsForOrder.length > 0) {
            txsForOrder.forEach(t => {
                const amt = Number(t.amount) || 0;
                const desc = t.description || '';
                if (desc.includes('Order commission allocation') || desc.includes('Development fund allocation')) {
                    baseTrust += amt;
                } else if (desc.includes('Tree remainder')) {
                    unusedTreePool += amt;
                } else if (desc.includes('Referral commission') || desc.includes('Direct commission')) {
                    missingDirectReferral += amt;
                } else {
                    other += amt;
                }
            });
        } else if (txById) {
            const amt = Number(txById.amount) || 0;
            const desc = txById.description || '';
            if (desc.includes('Order commission allocation')) baseTrust = amt;
            else if (desc.includes('Tree remainder')) unusedTreePool = amt;
            else if (desc.includes('Referral commission') || desc.includes('Direct commission')) missingDirectReferral = amt;
            else other = amt;
        }

        const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;
        const totalTrustCredit = round2(baseTrust + unusedTreePool + missingDirectReferral + other);

        let treeStats = null;
        if (commTxDoc) {
            const profit = commTxDoc.profitAmount || (orderDoc ? orderDoc.orderProfitTotal : 0);
            const treePoolAvailable = round2(profit * 0.4);
            let treePaid = 0;
            if (Array.isArray(commTxDoc.treeCommissions)) {
                treePaid = commTxDoc.treeCommissions.reduce((s, tc) => s + (tc.amount || 0), 0);
            }
            const treeRemainder = commTxDoc.remainderToDevFund !== undefined 
                ? commTxDoc.remainderToDevFund 
                : round2(treePoolAvailable - treePaid);

            treeStats = {
                treePoolAvailable,
                treePaid: round2(treePaid),
                treeRemainder: round2(treeRemainder)
            };
        }

        const detailObj = {
            orderId: targetOrderId,
            orderNumber: orderDoc 
                ? (orderDoc.orderNumber || `#SM${orderDoc._id.toString().slice(-6).toUpperCase()}`) 
                : `#SM${targetOrderId.slice(-6).toUpperCase()}`,
            orderDate: orderDoc ? orderDoc.createdAt : (txsForOrder[0] ? txsForOrder[0].timestamp : null),
            buyer: orderDoc && orderDoc.user_id ? {
                name: orderDoc.user_id.name || 'N/A',
                email: orderDoc.user_id.email || 'N/A'
            } : null,
            orderProfit: commTxDoc ? commTxDoc.profitAmount : (orderDoc ? (orderDoc.orderProfitTotal || 0) : 0),
            commissionStatus: commTxDoc ? commTxDoc.status : (orderDoc ? orderDoc.commissionStatus : 'completed'),
            baseTrust: round2(baseTrust),
            unusedTreePool: round2(unusedTreePool),
            missingDirectReferral: round2(missingDirectReferral),
            other: round2(other),
            totalTrustCredit,
            createdAt: txsForOrder[0] ? txsForOrder[0].timestamp : (txById ? txById.timestamp : new Date()),
            treeStats
        };

        res.json({
            success: true,
            transaction: detailObj
        });

    } catch (err) {
        console.error("Trust fund transaction detail error:", err);
        res.status(500).json({ error: "Server error fetching transaction detail" });
    }
});

module.exports = router;

