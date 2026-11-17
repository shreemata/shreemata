const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const LOCK_TIMEOUT_MS = 60 * 1000;

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
 * - Atomic concurrency: Safe under simultaneous execution (parallel webhooks, verify callbacks, or admin reconcile).
 *
 * @param {Object|String} orderOrId - Order Mongoose document or Order ID
 * @param {Object} [paymentInfo] - Details from Razorpay callback/webhook
 * @returns {Promise<{success: boolean, order: Object, invoice: Object|null, alreadyProcessed: boolean}>}
 */
async function finalizePaidOrder(orderOrId, paymentInfo = {}) {
  const orderId = orderOrId?._id || orderOrId;
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error('Invalid order ID provided to finalizePaidOrder');
  }

  let order = await Order.findById(orderId).populate('user_id');
  if (!order) {
    throw new Error('Order not found');
  }

  // 1. Check if already completed prior to this invocation
  // Notice: order.rewardApplied is deliberately NOT used here, because manual admin status changes
  // or repair scripts can set rewardApplied=true on pending/unfinalized orders.
  // Instead, rely on finalizedAt, completed finalizationStatus, completed payment status,
  // or existing Invoice / CommissionTransaction.
  let wasAlreadyProcessed = Boolean(
    order.finalizationStatus !== 'failed' && (
      order.finalizedAt ||
      order.finalizationStatus === 'completed' ||
      (order.status === 'completed' && (order.paymentStatus === 'completed' || order.paymentDetails?.status === 'verified'))
    )
  );

  const InvoiceModel = mongoose.models.Invoice;
  const CommissionModel = mongoose.models.CommissionTransaction;

  if (!wasAlreadyProcessed && order.finalizationStatus !== 'failed' && (InvoiceModel || CommissionModel)) {
    const [existingTaxInv, existingComm] = await Promise.all([
      InvoiceModel ? InvoiceModel.findOne({
        orderId: order._id,
        $or: [
          { documentType: 'tax_invoice' },
          { invoiceNumber: /^SM-HBL-/ },
          { 'documentNumbers.tax_invoice': { $exists: true, $ne: '' } }
        ]
      }).lean().catch(() => null) : null,
      CommissionModel ? CommissionModel.findOne({ orderId: order._id }).lean().catch(() => null) : null
    ]);
    if (existingTaxInv || existingComm) {
      wasAlreadyProcessed = true;
    }
  }

  if (wasAlreadyProcessed) {
    // If not already stamped, stamp finalizedAt and finalizationStatus for faster future checks
    if (!order.finalizedAt || order.finalizationStatus !== 'completed') {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            finalizationStatus: 'completed',
            finalizedAt: order.finalizedAt || order.updatedAt || new Date(),
            confirmationEmailSent: order.confirmationEmailSent ?? true
          }
        }
      ).catch(() => {});
    }
    const inv = InvoiceModel ? await InvoiceModel.findOne({ orderId: order._id }).lean().catch(() => null) : null;
    return {
      success: true,
      order,
      invoice: inv,
      alreadyProcessed: true,
      processing: false,
      message: "Payment verified"
    };
  }

  // 2. ATOMIC CLAIM FOR CONCURRENCY:
  // Only ONE caller claiming this order can run the side effects.
  // Condition:
  // - finalizedAt does not exist or is null
  // - finalizationStatus is not 'completed'
  // - finalizationStatus is pending/failed OR lock is stale (claimed > 60s ago)
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  const claimFilter = {
    _id: order._id,
    $and: [
      {
        $or: [
          { finalizedAt: { $exists: false } },
          { finalizedAt: null }
        ]
      },
      {
        finalizationStatus: { $ne: 'completed' }
      },
      {
        $or: [
          { finalizationStatus: { $in: ['pending', 'failed', null] } },
          { finalizationStatus: { $exists: false } },
          { finalizationClaimedAt: { $lt: staleThreshold } },
          { finalizationClaimedAt: { $exists: false } }
        ]
      }
    ]
  };

  const claimedOrder = await Order.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        finalizationStatus: 'in_progress',
        finalizationClaimedAt: now
      }
    },
    { new: true }
  ).populate('user_id');

  // If another process won the claim:
  if (!claimedOrder) {
    // Poll briefly until the winning process finishes or lock becomes stale
    const maxPollMs = paymentInfo._maxPollMs || 5000;
    const pollIntervalMs = paymentInfo._pollIntervalMs || 150;
    const startPoll = Date.now();
    while (Date.now() - startPoll < maxPollMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      const current = await Order.findById(order._id).populate('user_id');
      if (current && (current.finalizedAt || current.finalizationStatus === 'completed')) {
        const inv = InvoiceModel ? await InvoiceModel.findOne({ orderId: current._id }).lean().catch(() => null) : null;
        return {
          success: true,
          order: current,
          invoice: inv,
          alreadyProcessed: true,
          processing: false,
          message: "Payment verified"
        };
      }
      // If winner failed or lock expired, re-attempt claim
      if (current && (current.finalizationStatus === 'failed' || (current.finalizationClaimedAt && current.finalizationClaimedAt < new Date(Date.now() - LOCK_TIMEOUT_MS)))) {
        return finalizePaidOrder(order._id, paymentInfo);
      }
    }

    const latest = await Order.findById(order._id).populate('user_id');
    const isCompleted = Boolean(latest && (latest.finalizedAt || latest.finalizationStatus === 'completed'));
    const inv = isCompleted && InvoiceModel ? await InvoiceModel.findOne({ orderId: latest._id }).lean().catch(() => null) : null;
    return {
      success: true,
      order: latest || order,
      invoice: inv,
      alreadyProcessed: isCompleted,
      processing: !isCompleted,
      message: isCompleted ? "Payment verified" : "Payment received, still being finalized"
    };
  }

  // WINNER: Execute side effects with safety catch block to release lock on failure
  let heartbeat = null;
  try {
    // Periodically refresh the claim timestamp (every 15s) while actively working so slow
    // external calls (SMTP, Razorpay API, PDF generation) don't trigger stale lock expiry.
    heartbeat = setInterval(async () => {
      try {
        await Order.updateOne(
          { _id: claimedOrder._id, finalizationStatus: 'in_progress' },
          { $set: { finalizationClaimedAt: new Date() } }
        );
      } catch (_) {}
    }, 15000);
    if (heartbeat.unref) heartbeat.unref();

    // 3. Update order status & payment details
    claimedOrder.status = 'completed';
    claimedOrder.paymentStatus = 'completed';
    claimedOrder.paymentDetails = claimedOrder.paymentDetails || {};
    claimedOrder.paymentDetails.status = 'verified';
    claimedOrder.paymentDetails.verifiedAt = claimedOrder.paymentDetails.verifiedAt || new Date();

    if (paymentInfo.razorpay_payment_id) {
      claimedOrder.razorpay_payment_id = paymentInfo.razorpay_payment_id;
      claimedOrder.paymentDetails.razorpay_payment_id = paymentInfo.razorpay_payment_id;
    }
    if (paymentInfo.razorpay_order_id) {
      claimedOrder.razorpay_order_id = paymentInfo.razorpay_order_id;
      claimedOrder.paymentDetails.razorpay_order_id = paymentInfo.razorpay_order_id;
    }
    if (paymentInfo.razorpay_signature) {
      claimedOrder.paymentDetails.razorpay_signature = paymentInfo.razorpay_signature;
    }
    if (paymentInfo.items && Array.isArray(paymentInfo.items) && paymentInfo.items.length > 0) {
      const existingSnapshots = new Map();
      if (Array.isArray(claimedOrder.items)) {
        claimedOrder.items.forEach(it => {
          const key = String(it.id || it._id || '');
          if (key && (Number(it.unitProfitSnapshot) || 0) > 0) {
            existingSnapshots.set(key, it);
          }
        });
      }

      claimedOrder.items = paymentInfo.items.map(newItem => {
        const key = String(newItem.id || newItem._id || '');
        const existing = existingSnapshots.get(key);
        if (existing) {
          const qty = Math.max(1, Number(newItem.quantity) || 1);
          return {
            ...newItem,
            profitTypeSnapshot: existing.profitTypeSnapshot,
            profitValueSnapshot: existing.profitValueSnapshot,
            unitProfitSnapshot: existing.unitProfitSnapshot,
            lineProfitSnapshot: Number((existing.unitProfitSnapshot * qty).toFixed(2)),
            cashbackAmount: existing.cashbackAmount,
            cashbackPercentage: existing.cashbackPercentage
          };
        }
        return newItem;
      });
    }
    if (paymentInfo.totalAmount && !isNaN(paymentInfo.totalAmount) && Number(paymentInfo.totalAmount) > 0) {
      claimedOrder.totalAmount = Number(paymentInfo.totalAmount);
    }
    if (paymentInfo.deliveryAddress && typeof paymentInfo.deliveryAddress === 'object' && Object.keys(paymentInfo.deliveryAddress).length > 0) {
      claimedOrder.deliveryAddress = paymentInfo.deliveryAddress;
    }

    // Ensure authoritative profit snapshot and orderProfitTotal exist on claimedOrder
    const { buildOrderProfitSnapshot, calculateOrderProfitTotal } = require('./orderProfit');
    const hasValidSnapshots = Array.isArray(claimedOrder.items) &&
      claimedOrder.items.length > 0 &&
      claimedOrder.items.some(i => (Number(i.unitProfitSnapshot) || 0) > 0);

    const hasValidProfitTotal = typeof claimedOrder.orderProfitTotal === 'number' && claimedOrder.orderProfitTotal > 0;

    if (!hasValidProfitTotal || !hasValidSnapshots) {
      claimedOrder.items = await buildOrderProfitSnapshot(claimedOrder.items || []);
      const calculatedTotal = calculateOrderProfitTotal(claimedOrder.items);
      if (!hasValidProfitTotal || calculatedTotal > 0) {
        claimedOrder.orderProfitTotal = calculatedTotal;
        claimedOrder.profitAmount = calculatedTotal;
      }
    }

    await claimedOrder.save();

    // 4. Auto-generate Tax Invoice (Idempotent)
    const { autoGenerateInvoiceForOrder } = require('../routes/invoices');
    const invoice = await autoGenerateInvoiceForOrder(claimedOrder);

    // 5. Automatic commission distribution (Idempotent)
    const { processAutomaticCommissionForOrder } = require('./commissionDistribution');
    await processAutomaticCommissionForOrder(claimedOrder);

    // 6. Check and activate membership if product subtotal >= ₹100
    const { checkAndActivateMembership } = require('./membershipService');
    await checkAndActivateMembership(claimedOrder);

    // 7. Tree placement & First Purchase tracking
    const user = await User.findById(claimedOrder.user_id?._id || claimedOrder.user_id);
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

    // 8. Award Points for purchased items (Idempotent)
    const PointsTransaction = require('../models/PointsTransaction');
    const existingPointsTx = await PointsTransaction.findOne({ orderId: claimedOrder._id });

    if (!existingPointsTx && claimedOrder.items && claimedOrder.items.length > 0) {
      const { awardPoints } = require('./pointsService');
      const Book = require('../models/Book');
      const Bundle = require('../models/Bundle');

      for (const item of claimedOrder.items) {
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
            claimedOrder.user_id?._id || claimedOrder.user_id,
            points,
            item.type === 'book' ? 'book_purchase' : 'bundle_purchase',
            item.id,
            claimedOrder._id
          );
        }
      }
    }

    // 9. Send confirmation emails (Idempotent, retryable)
    // If asyncEmails option is true, email delivery is handled asynchronously after HTTP response
    if (!paymentInfo.asyncEmails) {
      try {
        const emailSent = await dispatchOrderEmails(claimedOrder._id);
        if (emailSent) {
          claimedOrder.confirmationEmailSent = true;
          claimedOrder.emailSentAt = new Date();
        }
      } catch (emailErr) {
        console.error('⚠️ Email notification error in finalizePaidOrder:', emailErr.message);
      }
    }

    // 10. Mark completed, set finalizedAt, rewardApplied, clear lock
    claimedOrder.finalizationStatus = 'completed';
    claimedOrder.finalizedAt = new Date();
    claimedOrder.finalizationError = '';
    claimedOrder.rewardApplied = true;
    await claimedOrder.save();

    return {
      success: true,
      order: claimedOrder,
      invoice,
      alreadyProcessed: false,
      processing: false,
      message: "Payment verified"
    };
  } catch (err) {
    // If winner crashes, mark status as failed so retry/reconcile can re-claim immediately
    await Order.updateOne(
      { _id: claimedOrder._id },
      {
        $set: {
          finalizationStatus: 'failed',
          finalizationError: err.message || String(err),
          finalizationClaimedAt: null
        }
      }
    ).catch(() => {});
    throw err;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

/**
 * Dispatches confirmation emails.
 * Uses a short-lived atomic claim (emailDispatchClaimedAt) with a 30s stale window.
 * confirmationEmailSent is set ONLY after successful delivery.
 * On error, the claim is released immediately so retries do not wait for stale window.
 */
async function dispatchOrderEmails(orderOrId) {
  const orderId = orderOrId?._id || orderOrId;
  if (!orderId) return false;

  const staleWindowMs = 30 * 1000;
  const staleThreshold = new Date(Date.now() - staleWindowMs);

  // Atomically claim email delivery to guarantee exactly-once dispatch
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      confirmationEmailSent: { $ne: true },
      $or: [
        { emailDispatchClaimedAt: null },
        { emailDispatchClaimedAt: { $exists: false } },
        { emailDispatchClaimedAt: { $lt: staleThreshold } }
      ]
    },
    {
      $set: { emailDispatchClaimedAt: new Date() }
    },
    { new: true }
  ).populate('user_id');

  if (!claimed) {
    return false; // Already sent or currently claimed by another active worker
  }

  try {
    const user = claimed.user_id;
    const { sendOrderConfirmationEmail, sendAdminNotification } = require('../utils/emailService');
    if (user && user.email) {
      await sendOrderConfirmationEmail(claimed, user);
      await sendAdminNotification(claimed, user);
    }

    // Set confirmationEmailSent ONLY after successful email delivery
    await Order.findByIdAndUpdate(claimed._id, {
      $set: {
        confirmationEmailSent: true,
        emailSentAt: new Date(),
        emailDispatchError: null
      },
      $unset: {
        emailDispatchClaimedAt: ""
      }
    });

    return true;
  } catch (emailErr) {
    console.error('⚠️ Email notification error in dispatchOrderEmails:', emailErr.message);
    // Release claim immediately on error so retries do not wait for stale window
    await Order.findByIdAndUpdate(claimed._id, {
      $set: {
        emailDispatchError: emailErr.message
      },
      $unset: {
        emailDispatchClaimedAt: ""
      }
    });
    return false;
  }
}

module.exports = {
  finalizePaidOrder,
  dispatchOrderEmails
};
