/**
 * utils/deleteUserCascade.js
 * 
 * Reusable utility to delete a single non-admin user and cascade delete
 * all associated records across orders, invoices, commissions, purchases, points,
 * and clean up dangling tree pointers in the referral tree.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const { Invoice } = require('../routes/invoices');
const CommissionTransaction = require('../models/CommissionTransaction');
const DigitalPurchase = require('../models/DigitalPurchase');
const PointsTransaction = require('../models/PointsTransaction');
const ReadingSession = require('../models/ReadingSession');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const Notification = require('../models/Notification');

/**
 * Cascade deletes a single user and all related documents.
 * 
 * @param {string|mongoose.Types.ObjectId} userId - The ID of the user to delete
 * @param {Object} options - Options
 * @param {boolean} [options.allowAdmin=false] - For safety, explicitly blocks admin deletion unless true
 * @returns {Promise<Object>} Summary of deleted counts
 */
async function deleteUserCascade(userId, options = {}) {
    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

    // 1. Fetch user to verify existence and check role
    const user = await User.findById(userObjectId);
    if (!user) {
        throw new Error('User not found');
    }

    if (user.role === 'admin') {
        throw new Error('Admin accounts cannot be deleted. This action is permanently disabled for admin-role accounts.');
    }

    // 2. Discover user's orders & linked invoices
    const orders = await Order.find({ user_id: userObjectId });
    const orderIds = orders.map(o => o._id);

    // 3. Delete Invoices linked to user's orders
    const deletedInvoices = await Invoice.deleteMany({ orderId: { $in: orderIds } });

    // 4. Delete Orders
    const deletedOrders = await Order.deleteMany({ user_id: userObjectId });

    // 5. Delete Purchases
    const deletedPurchases = await Purchase.deleteMany({ user_id: userObjectId });

    // 6. Delete Commission Transactions referencing user or user's orders
    const deletedCommTx = await CommissionTransaction.deleteMany({
        $or: [
            { purchaser: userObjectId },
            { directReferrer: userObjectId },
            { orderId: { $in: orderIds } },
            { 'treeCommissions.recipient': userObjectId },
            { 'treeCommissions.redirectedTo': userObjectId }
        ]
    });

    // 7. Delete Digital Purchases
    const deletedDigitalPurchases = await DigitalPurchase.deleteMany({ userId: userObjectId });

    // 8. Delete Points Transactions
    const deletedPoints = await PointsTransaction.deleteMany({
        $or: [
            { user: userObjectId },
            { virtualUserId: userObjectId }
        ]
    });

    // 9. Delete Reading Sessions
    const deletedSessions = await ReadingSession.deleteMany({ userId: userObjectId });

    // 10. Delete Password Reset Requests
    const deletedResets = await PasswordResetRequest.deleteMany({ userId: userObjectId });

    // 11. Delete Notifications created by user (if any)
    const deletedNotifications = await Notification.deleteMany({ createdBy: userObjectId });

    // 12. Tree references cleanup on all remaining users:
    // a) Remove deleted user from any parent's treeChildren array
    const treeChildrenUpdate = await User.updateMany(
        { treeChildren: userObjectId },
        { $pull: { treeChildren: userObjectId } }
    );

    // b) Null out treeParent for any user who had this user as their parent
    const treeParentUpdate = await User.updateMany(
        { treeParent: userObjectId },
        { $set: { treeParent: null } }
    );

    // 13. Delete User Document
    await User.findByIdAndDelete(userObjectId);

    return {
        success: true,
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        },
        deletedCounts: {
            orders: deletedOrders.deletedCount || 0,
            invoices: deletedInvoices.deletedCount || 0,
            purchases: deletedPurchases.deletedCount || 0,
            commissionTransactions: deletedCommTx.deletedCount || 0,
            digitalPurchases: deletedDigitalPurchases.deletedCount || 0,
            pointsTransactions: deletedPoints.deletedCount || 0,
            readingSessions: deletedSessions.deletedCount || 0,
            passwordResetRequests: deletedResets.deletedCount || 0,
            notifications: deletedNotifications.deletedCount || 0,
            treeParentsCleaned: treeParentUpdate.modifiedCount || 0,
            treeChildrenCleaned: treeChildrenUpdate.modifiedCount || 0,
            users: 1
        }
    };
}

module.exports = {
    deleteUserCascade
};
