const express = require("express");
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

/**
 * Build tree structure recursively from user's treeChildren
 * @param {string} userId - The user ID to build tree from
 * @param {string} directReferrerCode - The referral code of the direct referrer
 * @param {number} currentDepth - Current depth in the tree
 * @param {number} maxDepth - Maximum depth to traverse (default 10)
 * @returns {Promise<Array>} Array of child nodes with their subtrees
 */
async function buildTreeFromChildren(userId, directReferrerCode, currentDepth = 0, maxDepth = 10) {
    // Prevent infinite recursion and performance issues
    if (currentDepth >= maxDepth) {
        return [];
    }

    const user = await User.findById(userId)
        .select("name referralCode wallet treeLevel treeChildren referredBy")
        .populate('treeChildren', 'name referralCode wallet treeLevel treeChildren referredBy');

    if (!user || !user.treeChildren || user.treeChildren.length === 0) {
        return [];
    }

    const result = [];

    for (const child of user.treeChildren) {
        // Determine if this is a direct referral or spillover placement
        const isDirectReferral = child.referredBy === directReferrerCode;
        
        // Check if child joined without a referrer
        const hasReferrer = child.referredBy !== null && child.referredBy !== undefined;

        const subtree = await buildTreeFromChildren(
            child._id, 
            directReferrerCode, 
            currentDepth + 1, 
            maxDepth
        );

        result.push({
            id: child._id,
            name: child.name,
            referralCode: child.referralCode,
            wallet: child.wallet || 0,
            level: child.treeLevel,
            isDirectReferral: isDirectReferral,
            placementType: isDirectReferral ? 'direct' : 'spillover',
            hasReferrer: hasReferrer,
            joinedWithoutReferrer: !hasReferrer,
            children: subtree
        });
    }

    return result;
}

/**
 * Build unlimited-level referral tree (downline) - Legacy function using referredBy
 */
async function buildTree(referralCode) {
    const children = await User.find({ referredBy: referralCode })
        .select("name referralCode wallet referrals");

    const result = [];

    for (const child of children) {
        const subtree = await buildTree(child.referralCode);

        result.push({
            id: child._id,
            name: child.name,
            referralCode: child.referralCode,
            wallet: child.wallet || 0,
            referrals: child.referrals || 0,
            children: subtree
        });
    }

    return result;
}

/**
 * GET /api/referral/tree
 * Returns referral tree of the logged-in user based on tree placement structure
 * Query params:
 *   - maxDepth: Maximum depth to traverse (default 10, max 20)
 */
router.get("/tree", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("name referralCode wallet treeLevel treeChildren referredBy treeParent")
            .populate('treeParent', 'name referralCode treeLevel');

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Parse maxDepth from query params, default to 10, cap at 20
        let maxDepth = parseInt(req.query.maxDepth) || 10;
        maxDepth = Math.min(maxDepth, 20);

        const tree = await buildTreeFromChildren(
            user._id, 
            user.referralCode, 
            0, 
            maxDepth
        );

        // Check if current user joined without a referrer
        const hasReferrer = user.referredBy !== null && user.referredBy !== undefined;

        // Tree position information
        const treePosition = {
            hasReferrer: hasReferrer,
            joinedWithoutReferrer: !hasReferrer,
            treeParent: user.treeParent ? {
                id: user.treeParent._id,
                name: user.treeParent.name,
                referralCode: user.treeParent.referralCode,
                level: user.treeParent.treeLevel
            } : null,
            message: hasReferrer 
                ? `You were referred by ${user.referredBy} and placed in the tree`
                : "You joined without a referrer but were placed in the tree to enable your referral network growth"
        };

        // Calculate referral network growth statistics
        const networkStats = {
            totalTreeChildren: tree.length,
            directReferrals: tree.filter(child => child.isDirectReferral).length,
            spilloverPlacements: tree.filter(child => !child.isDirectReferral).length,
            childrenWithoutReferrers: tree.filter(child => child.joinedWithoutReferrer).length
        };

        res.json({
            root: {
                id: user._id,
                name: user.name,
                referralCode: user.referralCode,
                wallet: user.wallet || 0,
                level: user.treeLevel,
                hasReferrer: hasReferrer,
                joinedWithoutReferrer: !hasReferrer
            },
            treePosition: treePosition,
            networkStats: networkStats,
            children: tree,
            maxDepth: maxDepth
        });

    } catch (e) {
        console.error("TREE ERROR", e);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
