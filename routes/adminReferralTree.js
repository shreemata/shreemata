const express = require("express");
const User = require("../models/User");
const CommissionTransaction = require("../models/CommissionTransaction");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

/**
 * Build tree structure grouped by levels for horizontal display
 * Instead of nested children, group all users by their tree level
 */
async function buildLevelGroupedTree(rootUsers, currentDepth = 0, maxDepth = 20) {
    if (currentDepth >= maxDepth || !rootUsers || rootUsers.length === 0) {
        return { levels: {}, allUsers: [] };
    }

    const levels = {};
    const allUsers = [];
    const processedUsers = new Set();

    async function processUsersAtLevel(userIds, level) {
        if (level > maxDepth || userIds.length === 0) return;

        const users = await User.find({ 
            _id: { $in: userIds },
            firstPurchaseDone: true // Only show users who made purchases
        }).select("name email referralCode wallet treeLevel treePosition treeChildren treeParent referredBy createdAt directCommissionEarned treeCommissionEarned firstPurchaseDone isVirtual originalUserId");

        for (const user of users) {
            if (processedUsers.has(user._id.toString())) continue;
            processedUsers.add(user._id.toString());

            // Calculate total commission earned
            const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);

            // Determine referral status
            const referralStatus = {
                hasReferrer: !!user.referredBy,
                joinedWithoutReferrer: !user.referredBy,
                isRootUser: user.treeLevel === 1 || !user.treeParent,
                hasPurchased: user.treeLevel > 0
            };

            const userData = {
                id: user._id,
                name: user.name,
                email: user.email,
                referralCode: user.referralCode,
                wallet: user.wallet || 0,
                treeLevel: user.treeLevel,
                treePosition: user.treePosition,
                treeParent: user.treeParent, // Include parent ID for positioning
                joinDate: user.createdAt,
                referralStatus: referralStatus,
                commissions: {
                    total: totalCommissionEarned,
                    direct: user.directCommissionEarned || 0,
                    tree: user.treeCommissionEarned || 0
                },
                childrenCount: user.treeChildren.length,
                children: [], // No nested children for horizontal layout
                isVirtual: user.isVirtual || false, // Include virtual status
                originalUserId: user.originalUserId || null // Include original user reference
            };

            // Group by level
            if (!levels[user.treeLevel]) {
                levels[user.treeLevel] = [];
            }
            levels[user.treeLevel].push(userData);
            allUsers.push(userData);

            // Process children at next level
            if (user.treeChildren.length > 0) {
                await processUsersAtLevel(user.treeChildren, user.treeLevel + 1);
            }
        }
    }

    // Start processing from root users
    await processUsersAtLevel(rootUsers, 1);

    return { levels, allUsers };
}

/**
 * Build complete tree structure starting from root users
 * @param {Array} rootUsers - Array of root user IDs
 * @param {number} currentDepth - Current depth in recursion
 * @param {number} maxDepth - Maximum depth to traverse
 * @returns {Promise<Array>} Complete tree structure
 */
async function buildCompleteTree(rootUsers, currentDepth = 0, maxDepth = 20) {
    if (currentDepth >= maxDepth || !rootUsers || rootUsers.length === 0) {
        return [];
    }

    const result = [];

    for (const userId of rootUsers) {
        const user = await User.findById(userId)
            .select("name email referralCode wallet treeLevel treePosition treeChildren referredBy createdAt directCommissionEarned treeCommissionEarned firstPurchaseDone isVirtual originalUserId")
            .populate('treeChildren', '_id');

        if (!user) continue;
        
        // Skip users who haven't made purchases (should not appear in tree)
        if (!user.firstPurchaseDone || user.treeLevel === 0) {
            console.log(`Skipping user ${user.email} - no purchase made (firstPurchaseDone: ${user.firstPurchaseDone}, treeLevel: ${user.treeLevel})`);
            continue;
        }

        // Calculate total commission earned
        const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);

        // Determine referral status
        const referralStatus = {
            hasReferrer: !!user.referredBy,
            joinedWithoutReferrer: !user.referredBy,
            isRootUser: user.treeLevel === 1 || !user.treeParent, // Level 1 is root for purchased users
            hasPurchased: user.treeLevel > 0 // Only users with purchases have treeLevel > 0
        };

        // Get children recursively
        const childrenIds = user.treeChildren.map(child => child._id);
        const children = await buildCompleteTree(childrenIds, currentDepth + 1, maxDepth);

        result.push({
            id: user._id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            wallet: user.wallet || 0,
            treeLevel: user.treeLevel,
            treePosition: user.treePosition,
            joinDate: user.createdAt,
            referralStatus: referralStatus,
            commissions: {
                total: totalCommissionEarned,
                direct: user.directCommissionEarned || 0,
                tree: user.treeCommissionEarned || 0
            },
            childrenCount: user.treeChildren.length,
            children: children,
            isVirtual: user.isVirtual || false, // Include virtual status
            originalUserId: user.originalUserId || null // Include original user reference
        });
    }

    return result;
}

/**
 * GET /api/admin/referral-tree/complete
 * Build complete tree structure starting from root users
 * Include user details (name, join date, referral status, commissions)
 * Highlight users who joined without referral codes
 * Implement pagination for large trees
 * Requirements: 11.1, 11.2, 11.3
 */
router.get("/complete", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Audit log for admin access
        console.log(`🔍 ADMIN AUDIT: User ${req.user.name} (${req.user.email}) accessed complete referral tree at ${new Date().toISOString()}`);
        console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
        console.log(`   User Agent: ${req.get('User-Agent')}`);
        console.log(`   Query params: ${JSON.stringify(req.query)}`);
        
        // Parse query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const maxDepth = Math.min(parseInt(req.query.maxDepth) || 10, 20);
        const skip = (page - 1) * limit;

        // Find root users (users who have made purchases AND have tree placement)
        // Only show users who have both purchased and been placed in tree
        const totalRootUsers = await User.countDocuments({
            firstPurchaseDone: true, // Must have made a purchase
            treeLevel: { $gte: 1 }, // Must have tree placement
            $or: [
                { treeParent: null },
                { treeParent: { $exists: false } }
            ]
        });

        const rootUsers = await User.find({
            firstPurchaseDone: true, // Must have made a purchase
            treeLevel: { $gte: 1 }, // Must have tree placement
            $or: [
                { treeParent: null },
                { treeParent: { $exists: false } }
            ]
        })
        .select("_id")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit);

        const rootUserIds = rootUsers.map(user => user._id);

        // Build level-grouped tree structure for horizontal display
        const treeData = await buildLevelGroupedTree(rootUserIds, 0, maxDepth);
        
        // Convert levels object to array format for frontend
        const levelsArray = Object.keys(treeData.levels)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(levelNum => ({
                level: parseInt(levelNum),
                users: treeData.levels[levelNum]
            }));

        // Calculate statistics
        const stats = {
            totalRootUsers: totalRootUsers,
            currentPageRoots: rootUsers.length,
            maxDepthTraversed: maxDepth
        };

        // Calculate statistics from level-grouped data
        stats.usersWithoutReferrers = treeData.allUsers.filter(user => user.referralStatus.joinedWithoutReferrer).length;
        stats.totalUsersInCurrentTree = treeData.allUsers.length;

        res.json({
            tree: treeData.allUsers, // For visual tree compatibility - flat array of all users
            levels: levelsArray, // Send level-grouped data for horizontal display
            allUsers: treeData.allUsers,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalRootUsers / limit),
                totalRootUsers: totalRootUsers,
                limit: limit,
                hasNextPage: skip + limit < totalRootUsers,
                hasPrevPage: page > 1
            },
            stats: stats,
            maxDepth: maxDepth
        });

    } catch (err) {
        console.error("Complete referral tree error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * GET /api/admin/referral-tree/level/:level
 * Return all users at specific tree level
 * Show fill status for that level (occupied/total positions)
 * Include user details and referral relationships
 * Requirements: 11.4
 */
router.get("/level/:level", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Audit log for admin access
        console.log(`🔍 ADMIN AUDIT: User ${req.user.name} (${req.user.email}) accessed referral tree level ${req.params.level} at ${new Date().toISOString()}`);
        console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
        console.log(`   User Agent: ${req.get('User-Agent')}`);
        console.log(`   Query params: ${JSON.stringify(req.query)}`);
        
        const level = parseInt(req.params.level);
        
        // Validate level parameter - must be >= 1 (only show users who made purchases)
        if (isNaN(level) || level < 1) {
            return res.status(400).json({ 
                error: "Invalid level parameter. Must be 1 or higher (level 0 users haven't made purchases yet)." 
            });
        }

        // Parse pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;

        // Get all users at the specified level who have made purchases
        const totalUsersAtLevel = await User.countDocuments({ 
            treeLevel: level,
            firstPurchaseDone: true 
        });
        
        const usersAtLevel = await User.find({ 
            treeLevel: level,
            firstPurchaseDone: true 
        })
            .select("name email referralCode wallet treePosition treeParent treeChildren referredBy createdAt directCommissionEarned treeCommissionEarned isVirtual originalUserId")
            .populate('treeParent', 'name email referralCode')
            .populate('treeChildren', 'name email referralCode')
            .sort({ treePosition: 1, createdAt: 1 })
            .skip(skip)
            .limit(limit);

        // Format user data with referral relationships
        const formattedUsers = usersAtLevel.map(user => {
            const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);
            
            return {
                id: user._id,
                name: user.name,
                email: user.email,
                referralCode: user.referralCode,
                wallet: user.wallet || 0,
                treeLevel: user.treeLevel,
                treePosition: user.treePosition,
                joinDate: user.createdAt,
                referralStatus: {
                    hasReferrer: !!user.referredBy,
                    joinedWithoutReferrer: !user.referredBy,
                    referredByCode: user.referredBy
                },
                commissions: {
                    total: totalCommissionEarned,
                    direct: user.directCommissionEarned || 0,
                    tree: user.treeCommissionEarned || 0
                },
                relationships: {
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
                        referralCode: child.referralCode
                    }))
                },
                isVirtual: user.isVirtual || false, // Include virtual status
                originalUserId: user.originalUserId || null // Include original user reference
            };
        });

        // Calculate theoretical capacity for this level
        // Level 0: 1 position (root), Level 1: 5 positions, Level 2: 25 positions, etc.
        let theoreticalCapacity;
        if (level === 0) {
            theoreticalCapacity = 1; // Root level
        } else {
            theoreticalCapacity = Math.pow(5, level);
        }

        // Calculate fill status
        const fillStatus = {
            occupied: totalUsersAtLevel,
            theoretical: theoreticalCapacity,
            fillRate: theoreticalCapacity > 0 ? ((totalUsersAtLevel / theoreticalCapacity) * 100).toFixed(2) : 0,
            available: Math.max(0, theoreticalCapacity - totalUsersAtLevel)
        };

        // Count users without referrers at this level
        const usersWithoutReferrers = formattedUsers.filter(user => user.referralStatus.joinedWithoutReferrer).length;

        res.json({
            level: level,
            users: formattedUsers,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalUsersAtLevel / limit),
                totalUsers: totalUsersAtLevel,
                limit: limit,
                hasNextPage: skip + limit < totalUsersAtLevel,
                hasPrevPage: page > 1
            },
            fillStatus: fillStatus,
            statistics: {
                totalUsersAtLevel: totalUsersAtLevel,
                usersWithoutReferrers: usersWithoutReferrers,
                usersWithReferrers: totalUsersAtLevel - usersWithoutReferrers,
                averageCommission: formattedUsers.length > 0 
                    ? (formattedUsers.reduce((sum, user) => sum + user.commissions.total, 0) / formattedUsers.length).toFixed(2)
                    : 0
            }
        });

    } catch (err) {
        console.error("Level referral tree error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * GET /api/admin/referral-tree/stats
 * Calculate tree statistics (total levels, users per level, fill rates)
 * Show growth metrics and trends
 * Include no-referrer user statistics
 * Requirements: 11.4
 */
router.get("/stats", authenticateToken, isAdmin, async (req, res) => {
    try {
        // Audit log for admin access
        console.log(`🔍 ADMIN AUDIT: User ${req.user.name} (${req.user.email}) accessed referral tree statistics at ${new Date().toISOString()}`);
        console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
        console.log(`   User Agent: ${req.get('User-Agent')}`);
        console.log(`   Query params: ${JSON.stringify(req.query)}`);
        
        // Get basic tree statistics
        const totalUsers = await User.countDocuments();
        const usersInTree = await User.countDocuments({ 
            firstPurchaseDone: true, 
            treeLevel: { $gte: 1 } 
        }); // Only users who made purchases AND have tree placement
        const usersWithoutPurchases = await User.countDocuments({ firstPurchaseDone: false }); // Users who haven't purchased
        const rootUsers = await User.countDocuments({
            firstPurchaseDone: true, // Must have made a purchase
            treeLevel: { $gte: 1 }, // Must have tree placement
            $or: [
                { treeParent: null },
                { treeParent: { $exists: false } }
            ]
        });

        // Get deepest level in the tree
        const deepestLevelResult = await User.findOne()
            .sort({ treeLevel: -1 })
            .select('treeLevel');
        const deepestLevel = deepestLevelResult?.treeLevel || 0;

        // Get users per level distribution (only for users who made purchases)
        const levelDistribution = await User.aggregate([
            { 
                $match: { 
                    firstPurchaseDone: true, // Must have made a purchase
                    treeLevel: { $gte: 1 } // Must have tree placement
                } 
            },
            {
                $group: {
                    _id: '$treeLevel',
                    count: { $sum: 1 },
                    usersWithoutReferrers: {
                        $sum: {
                            $cond: [{ $eq: ['$referredBy', null] }, 1, 0]
                        }
                    },
                    usersWithReferrers: {
                        $sum: {
                            $cond: [{ $ne: ['$referredBy', null] }, 1, 0]
                        }
                    },
                    totalCommissions: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$directCommissionEarned', 0] },
                                { $ifNull: ['$treeCommissionEarned', 0] }
                            ]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Calculate fill rates for each level
        const levelStats = levelDistribution.map(level => {
            let theoreticalCapacity;
            if (level._id === 0) {
                theoreticalCapacity = 1; // Root level
            } else {
                theoreticalCapacity = Math.pow(5, level._id);
            }

            const fillRate = theoreticalCapacity > 0 
                ? ((level.count / theoreticalCapacity) * 100).toFixed(2) 
                : 0;

            const averageCommission = level.count > 0 
                ? (level.totalCommissions / level.count).toFixed(2) 
                : 0;

            return {
                level: level._id,
                userCount: level.count,
                usersWithoutReferrers: level.usersWithoutReferrers,
                usersWithReferrers: level.usersWithReferrers,
                theoreticalCapacity: theoreticalCapacity,
                fillRate: parseFloat(fillRate),
                available: Math.max(0, theoreticalCapacity - level.count),
                totalCommissions: level.totalCommissions,
                averageCommission: parseFloat(averageCommission)
            };
        });

        // Calculate no-referrer user statistics
        const totalUsersWithoutReferrers = await User.countDocuments({ referredBy: null });
        const noReferrerStats = await User.aggregate([
            { $match: { referredBy: null } },
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalCommissions: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$directCommissionEarned', 0] },
                                { $ifNull: ['$treeCommissionEarned', 0] }
                            ]
                        }
                    },
                    averageCommission: {
                        $avg: {
                            $add: [
                                { $ifNull: ['$directCommissionEarned', 0] },
                                { $ifNull: ['$treeCommissionEarned', 0] }
                            ]
                        }
                    }
                }
            }
        ]);

        // Calculate growth metrics (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: '$treeLevel',
                    newUsers: { $sum: 1 },
                    newUsersWithoutReferrers: {
                        $sum: {
                            $cond: [{ $eq: ['$referredBy', null] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Calculate overall tree health metrics
        const totalTheoreticalCapacity = levelStats.reduce((sum, level) => sum + level.theoreticalCapacity, 0);
        const totalOccupied = levelStats.reduce((sum, level) => sum + level.userCount, 0);
        const overallFillRate = totalTheoreticalCapacity > 0 
            ? ((totalOccupied / totalTheoreticalCapacity) * 100).toFixed(2) 
            : 0;

        // Calculate commission statistics
        const commissionStats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalDirectCommissions: { $sum: { $ifNull: ['$directCommissionEarned', 0] } },
                    totalTreeCommissions: { $sum: { $ifNull: ['$treeCommissionEarned', 0] } },
                    usersWithCommissions: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $add: [{ $ifNull: ['$directCommissionEarned', 0] }, { $ifNull: ['$treeCommissionEarned', 0] }] },
                                        0
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const totalCommissions = (commissionStats[0]?.totalDirectCommissions || 0) + (commissionStats[0]?.totalTreeCommissions || 0);

        res.json({
            overview: {
                totalUsers: totalUsers,
                usersInTree: usersInTree, // Users who have made purchases and are in tree
                usersWithoutPurchases: usersWithoutPurchases, // Users who haven't made purchases yet
                rootUsers: rootUsers,
                deepestLevel: deepestLevel,
                totalLevels: deepestLevel + 1,
                usersWithoutReferrers: totalUsersWithoutReferrers,
                percentageWithoutReferrers: totalUsers > 0 
                    ? ((totalUsersWithoutReferrers / totalUsers) * 100).toFixed(2) 
                    : 0,
                percentageInTree: totalUsers > 0 
                    ? ((usersInTree / totalUsers) * 100).toFixed(2) 
                    : 0
            },
            levelDistribution: levelStats,
            fillRates: {
                overall: parseFloat(overallFillRate),
                totalTheoreticalCapacity: totalTheoreticalCapacity,
                totalOccupied: totalOccupied,
                totalAvailable: totalTheoreticalCapacity - totalOccupied
            },
            noReferrerStatistics: {
                totalCount: totalUsersWithoutReferrers,
                percentage: totalUsers > 0 
                    ? ((totalUsersWithoutReferrers / totalUsers) * 100).toFixed(2) 
                    : 0,
                totalCommissions: noReferrerStats[0]?.totalCommissions || 0,
                averageCommission: noReferrerStats[0]?.averageCommission || 0
            },
            growthMetrics: {
                last30Days: {
                    totalNewUsers: recentGrowth.reduce((sum, level) => sum + level.newUsers, 0),
                    newUsersWithoutReferrers: recentGrowth.reduce((sum, level) => sum + level.newUsersWithoutReferrers, 0),
                    levelBreakdown: recentGrowth
                }
            },
            commissionStatistics: {
                totalCommissionsPaid: totalCommissions,
                totalDirectCommissions: commissionStats[0]?.totalDirectCommissions || 0,
                totalTreeCommissions: commissionStats[0]?.totalTreeCommissions || 0,
                usersEarningCommissions: commissionStats[0]?.usersWithCommissions || 0,
                averageCommissionPerEarner: (commissionStats[0]?.usersWithCommissions || 0) > 0 
                    ? (totalCommissions / (commissionStats[0]?.usersWithCommissions || 1)).toFixed(2) 
                    : 0
            }
        });

    } catch (err) {
        console.error("Tree stats error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;