const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

/**
 * Shared, idempotent function to finalize a paid order.
 * Has exactly the same side effects as the successful /api/payments/verify path:
 * - Updates status, paymentStatus, and paymentDetails
 * - Auto-generates Tax Invoice
 * - Distributes referral/profit commissions
 * - Activates membership if qualified
 * - Awards points for purchased books/bundles (once)
 * - Creates tree placement for qualified first purchases
 * - Sends customer order confirmation and admin notification emails (once)
 * - Safe on repeated delivery: Calling twice does not duplicate commissions, points, emails, or invoices.
 *
 * @param {Object|String} orderOrId - Order Mongoose document or Order ID
 * @param {Object} [paymentInfo] - Details from Razorpay callback/webhook
 * @returns {Promise<{success: boolean, order: Object, invoice: Object|null, alreadyProcessed: boolean}>}
 */
async function finalizePaidOrder(orderOrId, paymentInfo = {}) {
  let order = orderOrId;
  if (typeof orderOrId === 'string' || (mongoose.Types.ObjectId.isValid(orderOrId) && !orderOrId.save)) {
    order = await Order.findById(orderOrId).populate('user_id');
  } else if (order && order.user_id && !order.user_id.email && mongoose.Types.ObjectId.isValid(order.user_id)) {
    order = await Order.findById(order._id).populate('user_id');
  }

  if (!order) {
    throw new Error('Order not found');
  }

  // Track if this order was already processed prior to this invocation
  const wasAlreadyProcessed = Boolean(
    order.status === 'completed' &&
    order.paymentStatus === 'completed' &&
    order.paymentDetails?.status === 'verified' &&
    order.rewardApplied
  );

  // 1. Update order status & payment details
  order.status = 'completed';
  order.paymentStatus = 'completed';
  order.paymentDetails = order.paymentDetails || {};
  order.paymentDetails.status = 'verified';
  order.paymentDetails.verifiedAt = order.paymentDetails.verifiedAt || new Date();

  if (paymentInfo.razorpay_payment_id) {
    order.razorpay_payment_id = paymentInfo.razorpay_payment_id;
    order.paymentDetails.razorpay_payment_id = paymentInfo.razorpay_payment_id;
  }
  if (paymentInfo.razorpay_order_id) {
    order.razorpay_order_id = paymentInfo.razorpay_order_id;
    order.paymentDetails.razorpay_order_id = paymentInfo.razorpay_order_id;
  }
  if (paymentInfo.razorpay_signature) {
    order.paymentDetails.razorpay_signature = paymentInfo.razorpay_signature;
  }
  if (paymentInfo.items && Array.isArray(paymentInfo.items) && paymentInfo.items.length > 0) {
    order.items = paymentInfo.items;
  }
  if (paymentInfo.totalAmount && !isNaN(paymentInfo.totalAmount) && Number(paymentInfo.totalAmount) > 0) {
    order.totalAmount = Number(paymentInfo.totalAmount);
  }
  if (paymentInfo.deliveryAddress && typeof paymentInfo.deliveryAddress === 'object' && Object.keys(paymentInfo.deliveryAddress).length > 0) {
    order.deliveryAddress = paymentInfo.deliveryAddress;
  }

  await order.save();

  // 2. Auto-generate Tax Invoice (Idempotent: returns existing Tax Invoice if already generated)
  let invoice = null;
  try {
    const { autoGenerateInvoiceForOrder } = require('../routes/invoices');
    invoice = await autoGenerateInvoiceForOrder(order);
  } catch (invErr) {
    console.error('⚠️ Invoice auto-generation error in finalizePaidOrder:', invErr.message);
  }

  // 3. Automatic commission distribution (Idempotent: guarded by commissionStatus === 'distributed' and CommissionTransaction lookup)
  try {
    const { processAutomaticCommissionForOrder } = require('./commissionDistribution');
    await processAutomaticCommissionForOrder(order);
  } catch (commErr) {
    console.error('⚠️ Automatic commission distribution error in finalizePaidOrder:', commErr.message);
  }

  // 4. Check and activate membership if product subtotal >= ₹100
  try {
    const { checkAndActivateMembership } = require('./membershipService');
    await checkAndActivateMembership(order);
  } catch (memErr) {
    console.error('⚠️ Membership activation error in finalizePaidOrder:', memErr.message);
  }

  // 5. Tree placement & First Purchase tracking
  try {
    const user = await User.findById(order.user_id?._id || order.user_id);
    if (user) {
      if (!user.firstPurchaseDone) {
        user.firstPurchaseDone = true;
        user.firstPurchaseDate = user.firstPurchaseDate || new Date();
        await user.save();
      }
      if (user.isMember && (user.treeLevel === 0 || !user.treeParent)) {
        const { createTreePlacementOnFirstPurchase } = require('./treePlacement');
        await createTreePlacementOnFirstPurchase(user._id);
      }
    }
  } catch (treeErr) {
    console.error('⚠️ Tree placement error in finalizePaidOrder:', treeErr.message);
  }

  // 6. Award Points for purchased items (Idempotent: check if points were already awarded for this orderId)
  try {
    const PointsTransaction = require('../models/PointsTransaction');
    const existingPointsTx = await PointsTransaction.findOne({ orderId: order._id });

    if (!existingPointsTx && order.items && order.items.length > 0) {
      const { awardPoints } = require('./pointsService');
      const Book = require('../models/Book');
      const Bundle = require('../models/Bundle');

      for (const item of order.items) {
        let points = 0;
        if (item.type === 'book') {
          const book = await Book.findById(item.id);
          if (book && book.rewardPoints > 0) {
            points = book.rewardPoints * (item.quantity || 1);
          }
        } else if (item.type === 'bundle') {
          const bundle = await Bundle.findById(item.id);
          if (bundle && bundle.rewardPoints > 0) {
            points = bundle.rewardPoints * (item.quantity || 1);
          }
        }

        if (points > 0) {
          await awardPoints(
            order.user_id?._id || order.user_id,
            points,
            item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
            item.id,
            order._id
          );
        }
      }
    }
  } catch (pointsErr) {
    console.error('⚠️ Points awarding error in finalizePaidOrder:', pointsErr.message);
  }

  // 7. Send confirmation emails (Idempotent: track confirmationEmailSent flag on order)
  try {
    if (!order.confirmationEmailSent && !wasAlreadyProcessed) {
      const { sendOrderConfirmationEmail, sendAdminNotification } = require('../utils/emailService');
      const user = await User.findById(order.user_id?._id || order.user_id);
      if (user && user.email) {
        await sendOrderConfirmationEmail(order, user);
        await sendAdminNotification(order, user);
      }
      order.confirmationEmailSent = true;
      order.emailSentAt = new Date();
    }
  } catch (emailErr) {
    console.error('⚠️ Email notification error in finalizePaidOrder:', emailErr.message);
  }

  // 8. Mark reward applied and save final state
  order.rewardApplied = true;
  await order.save();

  return {
    success: true,
    order,
    invoice,
    alreadyProcessed: wasAlreadyProcessed
  };
}

module.exports = {
  finalizePaidOrder
};

