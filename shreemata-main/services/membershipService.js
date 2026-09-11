const User = require('../models/User');
const Order = require('../models/Order');

/**
 * Calculates the product subtotal of an order, excluding shipping and courier charges.
 * 
 * @param {Object} order - The order document or object
 * @returns {Number} Product subtotal
 */
function calculateProductSubtotal(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return 0;
  }

  const subtotal = order.items.reduce((sum, item) => {
    const price = Math.max(0, Number(item.price) || 0);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    return sum + (price * quantity);
  }, 0);

  return Number(subtotal.toFixed(2));
}

/**
 * Checks if an order qualifies a customer for membership activation (Product Subtotal >= 100).
 * If qualified and order is in a successful/qualifying status, activates membership on the user.
 * 
 * Flow:
 * Register -> Normal Customer (Member = NO)
 * Places Order
 * Eligible Product Subtotal >= 100?
 *   - NO  -> Remains Normal Customer (Member = NO)
 *   - YES -> Payment Successful / Order reaches qualifying status -> Membership Activated -> Member = YES
 * 
 * @param {Object|String} orderOrId - Order document or Order ID
 * @param {Object} options - Optional parameters { force: boolean, session: mongoose.ClientSession }
 * @returns {Promise<Object>} Result of membership check { success, isMember, activated, subtotal, reason }
 */
async function checkAndActivateMembership(orderOrId, options = {}) {
  try {
    let order = orderOrId;
    if (typeof orderOrId === 'string' || (orderOrId && !(orderOrId instanceof Order) && !orderOrId.items)) {
      const query = Order.findById(orderOrId);
      if (options.session) query.session(options.session);
      order = await query;
    }

    if (!order) {
      return { success: false, isMember: false, error: 'Order not found' };
    }

    const userId = order.user_id;
    if (!userId) {
      return { success: false, isMember: false, error: 'User ID missing in order' };
    }

    const userQuery = User.findById(userId);
    if (options.session) userQuery.session(options.session);
    const user = await userQuery;

    if (!user) {
      return { success: false, isMember: false, error: 'User not found' };
    }

    const productSubtotal = calculateProductSubtotal(order);
    const MEMBERSHIP_THRESHOLD = 100;

    // If user is already a member, preserve member status
    if (user.isMember) {
      return {
        success: true,
        isMember: true,
        activated: false,
        alreadyMember: true,
        memberActivatedAt: user.memberActivatedAt,
        subtotal: productSubtotal
      };
    }

    // Check if product subtotal meets minimum threshold of ₹100
    if (productSubtotal < MEMBERSHIP_THRESHOLD) {
      console.log(`ℹ️ Membership: User ${user.email} order #${order._id} product subtotal ₹${productSubtotal.toFixed(2)} < ₹${MEMBERSHIP_THRESHOLD}. Remains Normal Customer (Member = NO).`);
      return {
        success: true,
        isMember: false,
        activated: false,
        subtotal: productSubtotal,
        reason: `Product subtotal ₹${productSubtotal.toFixed(2)} is less than qualifying threshold of ₹${MEMBERSHIP_THRESHOLD}`
      };
    }

    // Check if order reaches a qualifying / paid status
    const isPaid = order.paymentStatus === 'Paid' || 
                   order.status === 'completed' || 
                   order.status === 'processing' ||
                   order.status === 'delivered' ||
                   order.status === 'shipped' ||
                   (order.paymentDetails && order.paymentDetails.status === 'verified');

    if (!isPaid && !options.force) {
      console.log(`ℹ️ Membership: User ${user.email} qualified with ₹${productSubtotal.toFixed(2)} product subtotal, but order #${order._id} is awaiting successful payment (status: ${order.status}, paymentStatus: ${order.paymentStatus}).`);
      return {
        success: true,
        isMember: false,
        activated: false,
        subtotal: productSubtotal,
        reason: 'Order payment not completed yet'
      };
    }

    // Activate Membership!
    user.isMember = true;
    user.memberActivatedAt = new Date();
    user.membershipOrder = order._id;
    user.membershipSubtotal = productSubtotal;

    if (!user.firstPurchaseDone) {
      user.firstPurchaseDone = true;
      user.firstPurchaseDate = new Date();
    }

    await user.save({ session: options.session || null });

    console.log(`🎉 Membership Activated! User ${user.email} is now a Member (Member = YES) via Order #${order._id} (Product Subtotal: ₹${productSubtotal.toFixed(2)} >= ₹${MEMBERSHIP_THRESHOLD})`);

    return {
      success: true,
      isMember: true,
      activated: true,
      subtotal: productSubtotal,
      memberActivatedAt: user.memberActivatedAt,
      orderId: order._id
    };
  } catch (err) {
    console.error('❌ Error in checkAndActivateMembership:', err);
    return { success: false, isMember: false, error: err.message };
  }
}

module.exports = {
  calculateProductSubtotal,
  checkAndActivateMembership
};
