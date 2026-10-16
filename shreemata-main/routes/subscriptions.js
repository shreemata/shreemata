// routes/subscriptions.js
// Dedicated billing, Razorpay order creation, and payment verification for READ NOTES subscriptions
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
const NoteSubscription = require("../models/NoteSubscription");
const SubscriptionOrder = require("../models/SubscriptionOrder");
const AdminSettings = require("../models/AdminSettings");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Safely obtain server-configured Razorpay credentials without hard-coded fallbacks
function getRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
}

function getRazorpayClient() {
  const config = getRazorpayConfig();
  if (!config) {
    return null;
  }
  return new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret
  });
}

/**
 * Timezone-independent UTC calendar-month calculation with documented Month-End Clamp Policy.
 * Policy:
 * Target the exact same day of the next calendar month in UTC.
 * If the resulting month has fewer days than the start date (e.g. Jan 31 -> Feb),
 * clamp to the last valid day of that month (Feb 28 or Feb 29 in leap years).
 * Preserves exact UTC hours, minutes, seconds, and milliseconds.
 */
function addOneCalendarMonth(baseDate) {
  const d = new Date(baseDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0 to 11
  const day = d.getUTCDate();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  let targetYear = year;
  let targetMonth = month + 1;
  if (targetMonth > 11) {
    targetYear += 1;
    targetMonth = 0;
  }

  // Days in targetMonth of targetYear:
  // Date.UTC(targetYear, targetMonth + 1, 0) gives the last day of targetMonth
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay, hours, minutes, seconds, ms));
}

// In-memory async lock to serialize concurrent payment verifications within the same Node.js process
const userVerificationLocks = new Map();

async function withUserVerificationLock(userId, fn) {
  const key = String(userId);
  while (userVerificationLocks.has(key)) {
    try {
      await userVerificationLocks.get(key);
    } catch (_) {}
  }
  let unlock;
  const lockPromise = new Promise((resolve) => {
    unlock = resolve;
  });
  userVerificationLocks.set(key, lockPromise);
  try {
    return await fn();
  } finally {
    userVerificationLocks.delete(key);
    unlock();
  }
}

// Database-level distributed lock schema for multi-worker / cluster-mode subscription renewal serialization
const subscriptionLockSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true }, // userId
  lockToken: { type: String, required: true },
  lockedAt: { type: Date, required: true, default: Date.now },
  leaseExpiresAt: { type: Date, required: true, index: true }
}, { collection: 'notesubscriptionlocks' });

const NoteSubscriptionLock = mongoose.models.NoteSubscriptionLock || mongoose.model('NoteSubscriptionLock', subscriptionLockSchema);

// Authoritative Atomic Subscription Timeline & CAS Fencing Schema
// Serializes renewal stacking and guarantees interval non-overlap on standalone MongoDB
const subscriptionTimelineSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true }, // userId
  activeExpiresAt: { type: Date, default: null },
  sequenceNumber: { type: Number, default: 0, required: true },
  reservations: [{
    paymentId: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    sequenceNumber: { type: Number, required: true },
    status: { type: String, enum: ['reserved', 'committed'], default: 'reserved' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { collection: 'notesubscriptiontimelines', timestamps: true });

const NoteSubscriptionTimeline = mongoose.models.NoteSubscriptionTimeline || mongoose.model('NoteSubscriptionTimeline', subscriptionTimelineSchema);


async function acquireUserRenewalDbLock(userId, ttlMs = 15000, maxRetries = 35, retryDelayMs = 150) {
  let userOid;
  try {
    userOid = new mongoose.Types.ObjectId(String(userId));
  } catch (_) {
    userOid = userId;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + ttlMs);
    const lockToken = crypto.randomUUID();

    try {
      // 1. First, attempt to atomically reclaim an expired lease
      const reclaimed = await NoteSubscriptionLock.findOneAndUpdate(
        {
          _id: userOid,
          leaseExpiresAt: { $lt: now }
        },
        {
          $set: {
            lockToken,
            lockedAt: now,
            leaseExpiresAt
          }
        },
        { new: true }
      );

      if (reclaimed) {
        return {
          acquired: true,
          lockToken,
          leaseExpiresAt,
          release: async () => {
            try {
              // Fencing safety: ONLY delete if lockToken matches our active lease
              await NoteSubscriptionLock.deleteOne({ _id: userOid, lockToken });
            } catch (_) {}
          },
          isValid: async () => {
            const doc = await NoteSubscriptionLock.findOne({
              _id: userOid,
              lockToken,
              leaseExpiresAt: { $gt: new Date() }
            });
            return Boolean(doc);
          }
        };
      }

      // 2. If no expired lease, attempt to create a fresh lock if none exists
      try {
        await NoteSubscriptionLock.create({
          _id: userOid,
          lockToken,
          lockedAt: now,
          leaseExpiresAt
        });

        return {
          acquired: true,
          lockToken,
          leaseExpiresAt,
          release: async () => {
            try {
              // Fencing safety: ONLY delete if lockToken matches our active lease
              await NoteSubscriptionLock.deleteOne({ _id: userOid, lockToken });
            } catch (_) {}
          },
          isValid: async () => {
            const doc = await NoteSubscriptionLock.findOne({
              _id: userOid,
              lockToken,
              leaseExpiresAt: { $gt: new Date() }
            });
            return Boolean(doc);
          }
        };
      } catch (createErr) {
        // E11000 duplicate key error indicates another worker already holds the unexpired lock
        if (createErr.code !== 11000) {
          console.warn("Notice in subscription DB lock creation:", createErr.message);
        }
      }
    } catch (err) {
      console.warn("Notice in subscription DB lock acquisition:", err.message);
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return {
    acquired: false,
    lockToken: null,
    release: async () => {},
    isValid: async () => false
  };
}

async function withUserRenewalLock(userId, fn) {
  // Layer 1: In-process mutex for single-worker thread scheduling
  return withUserVerificationLock(userId, async () => {
    // Layer 2: Database-level distributed lease across all PM2 workers / instances
    const dbLock = await acquireUserRenewalDbLock(userId);
    if (!dbLock.acquired) {
      const lockError = new Error("Subscription renewal is currently being processed by another worker. Please retry.");
      lockError.status = 409;
      lockError.isLockTimeout = true;
      throw lockError;
    }
    try {
      return await fn(dbLock);
    } finally {
      await dbLock.release();
    }
  });
}

// =========================================================================
// 1. GET /api/subscriptions/pricing (Public)
// =========================================================================
router.get("/pricing", async (req, res) => {
  try {
    const rawSettings = await AdminSettings.findOne().lean();
    const config = AdminSettings.getSubscriptionConfig(rawSettings);

    return res.json({
      success: true,
      pricing: {
        planType: "monthly",
        currency: "INR",
        monthlyPrice: config.monthlyPrice,
        amountInPaise: Math.round(config.monthlyPrice * 100),
        enabled: config.enabled,
        description: config.description
      }
    });
  } catch (err) {
    console.error("Error fetching subscription pricing:", err.message);
    return res.status(500).json({ error: "Failed to fetch subscription pricing" });
  }
});

// =========================================================================
// 2. GET /api/subscriptions/my-status (Authenticated)
// =========================================================================
router.get("/my-status", authenticateToken, async (req, res) => {
  try {
    const now = new Date();

    // Query most recent active subscription for user
    const activeSub = await NoteSubscription.findOne({
      userId: req.user.id,
      status: "active",
      expiresAt: { $gt: now }
    }).sort({ expiresAt: -1 }).lean();

    if (activeSub) {
      const daysRemaining = Math.max(0, Math.ceil((new Date(activeSub.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return res.json({
        success: true,
        hasActiveSubscription: true,
        subscription: {
          id: activeSub._id,
          planType: activeSub.planType,
          status: activeSub.status,
          startDate: activeSub.startDate,
          expiresAt: activeSub.expiresAt,
          daysRemaining
        }
      });
    }

    // Self-healing: Check if an uncommitted reservation exists in NoteSubscriptionTimeline
    const timeline = await NoteSubscriptionTimeline.findById(req.user.id).lean();
    const pendingReservation = timeline?.reservations?.find(
      r => r.status === 'reserved' && new Date(r.expiresAt) > now
    );
    if (pendingReservation) {
      try {
        const order = await SubscriptionOrder.findOne({ razorpayOrderId: pendingReservation.orderId });

        // 1. Independent order ownership verification
        if (order && order.userId.toString() === req.user.id.toString()) {
          const razorpay = getRazorpayClient();
          if (razorpay) {
            // 2. Gateway ground truth fetch & validation
            const livePayment = await razorpay.payments.fetch(pendingReservation.paymentId);
            const isValidCapturedPayment = Boolean(
              livePayment &&
              livePayment.status === "captured" &&
              livePayment.currency === "INR" &&
              livePayment.order_id === order.razorpayOrderId &&
              Number(livePayment.amount) === Number(order.amountPaise)
            );

            if (isValidCapturedPayment) {
              // 3. Atomic transition to prevent duplicate concurrent auto-recovery
              const claimUpdate = await NoteSubscriptionTimeline.findOneAndUpdate(
                {
                  _id: req.user.id,
                  "reservations.paymentId": pendingReservation.paymentId,
                  "reservations.status": "reserved"
                },
                {
                  $set: { "reservations.$.status": "committed" }
                },
                { new: true }
              );

              // If another concurrent request already committed or claimed it, find the committed subscription
              let sub = await NoteSubscription.findOne({ razorpayPaymentId: pendingReservation.paymentId });
              if (!sub && claimUpdate) {
                sub = await NoteSubscription.findOneAndUpdate(
                  { razorpayPaymentId: pendingReservation.paymentId },
                  {
                    $setOnInsert: {
                      userId: req.user.id,
                      planType: "monthly",
                      amountPaid: order.amountPaise / 100,
                      currency: order.currency || "INR",
                      status: "active",
                      startDate: new Date(),
                      expiresAt: pendingReservation.expiresAt,
                      subscriptionIndex: pendingReservation.sequenceNumber,
                      razorpayOrderId: pendingReservation.orderId,
                      razorpayPaymentId: pendingReservation.paymentId,
                      razorpaySignature: "auto_reconciled"
                    }
                  },
                  { upsert: true, new: true }
                );
              } else if (!sub && !claimUpdate) {
                // Another thread claimed the reservation: wait briefly for it to complete subscription insertion
                for (let poll = 0; poll < 6; poll++) {
                  await new Promise(r => setTimeout(r, 35));
                  sub = await NoteSubscription.findOne({ razorpayPaymentId: pendingReservation.paymentId });
                  if (sub) break;
                }
              }

              if (sub) {
                if (order.status !== "paid" || !order.subscriptionId) {
                  order.status = "paid";
                  order.razorpayPaymentId = pendingReservation.paymentId;
                  order.subscriptionId = sub._id;
                  await order.save();
                }

                const daysRemaining = Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
                return res.json({
                  success: true,
                  hasActiveSubscription: true,
                  subscription: {
                    id: sub._id,
                    planType: sub.planType,
                    status: sub.status,
                    startDate: sub.startDate,
                    expiresAt: sub.expiresAt,
                    daysRemaining
                  }
                });
              }
            } else {
              console.warn(`Auto-recovery rejected for user ${req.user.id}: payment ${pendingReservation.paymentId} failed gateway verification (status=${livePayment?.status}, amount=${livePayment?.amount})`);
            }
          }
        } else if (order) {
          console.warn(`SECURITY ALERT: Auto-recovery rejected for user ${req.user.id}: order ${pendingReservation.orderId} belongs to ${order.userId}`);
        }
      } catch (recErr) {
        console.warn("Auto-reconciliation notice in my-status:", recErr.message);
      }
    }

    // Check if user had a previous subscription that is now expired
    const lastSub = await NoteSubscription.findOne({
      userId: req.user.id
    }).sort({ expiresAt: -1 }).lean();

    return res.json({
      success: true,
      hasActiveSubscription: false,
      subscription: null,
      lastSubscription: lastSub ? {
        id: lastSub._id,
        status: lastSub.status,
        expiresAt: lastSub.expiresAt
      } : null
    });
  } catch (err) {
    console.error("Error fetching subscription status:", err.message);
    return res.status(500).json({ error: "Failed to fetch subscription status" });
  }
});

// =========================================================================
// 3. POST /api/subscriptions/create-order (Authenticated)
// =========================================================================
router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const rawSettings = await AdminSettings.findOne().lean();
    const config = AdminSettings.getSubscriptionConfig(rawSettings);

    if (!config.enabled) {
      return res.status(400).json({
        error: "READ NOTES monthly subscriptions are currently disabled by administration."
      });
    }

    const amountInPaise = Math.round(config.monthlyPrice * 100);

    const rzpConfig = getRazorpayConfig();
    const razorpay = getRazorpayClient();
    if (!rzpConfig || !razorpay) {
      console.error("Subscription payment error: Missing server-configured Razorpay credentials.");
      return res.status(500).json({
        error: "Payment gateway configuration error. Subscription payment credentials are not configured on the server."
      });
    }

    // Call Razorpay API to generate order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `sub_rcpt_${req.user.id.toString().slice(-6)}_${Date.now()}`,
      notes: {
        subscriptionUserId: req.user.id.toString(),
        planType: "monthly",
        orderType: "READ_NOTES_SUBSCRIPTION"
      }
    });

    // Persist server-authoritative mapping
    await SubscriptionOrder.create({
      razorpayOrderId: razorpayOrder.id,
      userId: req.user.id,
      amountPaise: amountInPaise,
      currency: "INR",
      planType: "monthly",
      status: "created"
    });

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      key: rzpConfig.keyId
    });
  } catch (err) {
    console.error("Subscription create-order error:", err.message);
    return res.status(500).json({
      error: "Unable to create subscription payment order",
      details: err.error?.description || err.message
    });
  }
});

// =========================================================================
// 4. POST /api/subscriptions/verify-order (Authenticated & Hardened)
// =========================================================================
router.post("/verify-order", authenticateToken, async (req, res) => {
  try {
    return await withUserRenewalLock(req.user.id, async (dbLock) => {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // Gate 1: Parameter formatting & presence
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing required payment verification parameters" });
  }

  const orderId = String(razorpay_order_id).trim();
  const paymentId = String(razorpay_payment_id).trim();
  const signature = String(razorpay_signature).trim();

  // Gate 2: Constant-Time Cryptographic Signature Check & Server Credential Validation
  const rzpConfig = getRazorpayConfig();
  const razorpay = getRazorpayClient();
  if (!rzpConfig || !razorpay) {
    console.error("CRITICAL: Server Razorpay credentials not configured for subscription verification");
    return res.status(500).json({ error: "Payment verification configuration error" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", rzpConfig.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return res.status(400).json({ error: "Invalid payment signature verification failed" });
  }

  // Gate 3: Server-Authoritative Order Ownership & Amount Mapping Check
  const subOrder = await SubscriptionOrder.findOne({ razorpayOrderId: orderId });
  if (!subOrder) {
    return res.status(400).json({ error: "Subscription order record not found or unverified" });
  }

  if (subOrder.userId.toString() !== req.user.id.toString()) {
    console.warn(`SECURITY ALERT: Order ownership mismatch. Order ${orderId} belongs to ${subOrder.userId}, attempted by ${req.user.id}`);
    return res.status(403).json({ error: "Order ownership mismatch. Access denied." });
  }

  // Gate 4: Replay & Idempotency Check (Existing Payment Record)
  const existingSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
  if (existingSub) {
    if (
      existingSub.userId.toString() === req.user.id.toString() &&
      existingSub.razorpayOrderId === orderId
    ) {
      if (subOrder.status !== "paid" || !subOrder.subscriptionId) {
        subOrder.status = "paid";
        subOrder.subscriptionId = existingSub._id;
        subOrder.razorpayPaymentId = paymentId;
        subOrder.razorpaySignature = signature;
        await subOrder.save();
      }
      // Also ensure reservation status is updated to committed if present
      await NoteSubscriptionTimeline.updateOne(
        { _id: req.user.id, "reservations.paymentId": paymentId },
        { $set: { "reservations.$.status": "committed" } }
      ).catch(() => {});
      return res.json({
        success: true,
        message: "Subscription already active for this payment",
        duplicate: true,
        subscription: existingSub
      });
    }

    console.warn(`SECURITY ALERT: Existing payment record mismatch for user ${req.user.id}, order ${orderId}, payment ${paymentId}`);
    return res.status(409).json({
      error: "Duplicate payment verification conflict. Payment belongs to a different subscription or user."
    });
  }

  // Gate 5: Live Razorpay Server-to-Server Ground Truth Fetch
  let livePayment;
  try {
    livePayment = await razorpay.payments.fetch(paymentId);
  } catch (rzpErr) {
    console.error("Razorpay payments.fetch error:", rzpErr.message);
    return res.status(502).json({ error: "Unable to verify payment status with payment gateway" });
  }

  if (livePayment.order_id !== orderId) {
    return res.status(400).json({ error: "Payment does not correspond to the requested order ID" });
  }

  if (livePayment.status !== "captured") {
    return res.status(400).json({ error: `Payment not captured. Current gateway status: ${livePayment.status}` });
  }

  if (livePayment.currency !== "INR") {
    return res.status(400).json({ error: "Invalid currency. Only INR payments are supported" });
  }

  // Validate amount against the original server-authoritative order record
  if (Number(livePayment.amount) !== Number(subOrder.amountPaise)) {
    return res.status(400).json({
      error: `Payment amount (${livePayment.amount}) does not match expected order amount (${subOrder.amountPaise})`
    });
  }

  // Gate 6 & 7: Atomic Database Activation with Calendar-Month Expiry Calculation
  // Fencing verification: ensure worker has not lost its lease before database mutation
  if (dbLock && typeof dbLock.isValid === 'function') {
    const isLeaseValid = await dbLock.isValid();
    if (!isLeaseValid) {
      console.error(`FENCING VIOLATION: Worker lost renewal lease for user ${req.user.id} before database activation.`);
      return res.status(409).json({
        error: "Subscription renewal lease expired before activation could complete. Please retry."
      });
    }
  }
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  const isReplicaSet = Boolean(
    topologyType &&
    topologyType !== 'Single' &&
    topologyType !== 'Unknown' &&
    !process.env.DISABLE_MONGO_TRANSACTIONS
  );
  let session = null;

  if (isReplicaSet && typeof mongoose.startSession === 'function') {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionErr) {
      console.warn("MongoDB transactions unavailable, proceeding with atomic document sequence:", sessionErr.message);
      if (session) {
        try { await session.endSession(); } catch (_) {}
      }
      session = null;
    }
  }

  let createdSub = null;

  try {
    // Re-check existing in transaction if session active
    if (session) {
      const activeCheck = await NoteSubscription.findOne({ razorpayPaymentId: paymentId }).session(session);
      if (activeCheck) {
        if (
          activeCheck.userId.toString() === req.user.id.toString() &&
          activeCheck.razorpayOrderId === orderId
        ) {
          await session.commitTransaction();
          return res.json({
            success: true,
            message: "Subscription already active for this payment",
            duplicate: true,
            subscription: activeCheck
          });
        }
        await session.abortTransaction();
        return res.status(409).json({
          error: "Duplicate payment verification conflict within transaction."
        });
      }
    }

    // Atomic CAS Subscription Timeline Allocation & Consecutive Stacking
    let createdSub = null;
    let allocatedTimeline = null;
    let allocatedReservation = null;
    const MAX_STACKING_ATTEMPTS = 5;

    for (let attempt = 0; attempt < MAX_STACKING_ATTEMPTS; attempt++) {
      // 1. Pre-mutation fencing check on initial attempt
      if (attempt === 0 && dbLock && typeof dbLock.isValid === 'function') {
        const isStillValid = await dbLock.isValid();
        if (!isStillValid) {
          console.error(`FENCING VIOLATION: Worker lost renewal lease for user ${req.user.id} immediately before NoteSubscription write.`);
          if (session) {
            try { await session.abortTransaction(); } catch (_) {}
          }
          return res.status(409).json({
            error: "Subscription renewal lease expired before activation could complete. Please retry."
          });
        }
      }

      // 2. Fetch authoritative timeline state
      let timeline = await NoteSubscriptionTimeline.findById(req.user.id);

      // Durable reservation recovery check: if this exact payment already reserved a slot
      const existingRes = timeline?.reservations?.find(r => r.paymentId === paymentId);
      if (existingRes) {
        allocatedTimeline = timeline;
        allocatedReservation = existingRes;
      } else {
        // Query active subscription and timeline state to determine baseline date
        const now = new Date();
        let baseDate = now;

        const currentActiveQuery = NoteSubscription.findOne({
          userId: req.user.id,
          status: "active",
          expiresAt: { $gt: now }
        }).sort({ expiresAt: -1 });

        if (session) currentActiveQuery.session(session);
        const currentActiveSub = await currentActiveQuery;

        if (currentActiveSub && new Date(currentActiveSub.expiresAt) > baseDate) {
          baseDate = new Date(currentActiveSub.expiresAt);
        }
        // Authoritative: timeline's activeExpiresAt tracks all committed AND reserved periods
        if (timeline && timeline.activeExpiresAt && new Date(timeline.activeExpiresAt) > baseDate) {
          baseDate = new Date(timeline.activeExpiresAt);
        }

        const calculatedExpiresAt = addOneCalendarMonth(baseDate);
        const expectedPreviousExpiry = timeline ? timeline.activeExpiresAt : null;
        const expectedPreviousSequence = timeline ? (timeline.sequenceNumber || 0) : 0;
        const nextSequence = expectedPreviousSequence + 1;

        // 3. Atomic Compare-And-Swap (CAS) timeline reservation allocation
        let casResult = null;
        try {
          if (!timeline) {
            casResult = await NoteSubscriptionTimeline.findOneAndUpdate(
              {
                _id: req.user.id,
                sequenceNumber: { $in: [null, 0] }
              },
              {
                $set: {
                  activeExpiresAt: calculatedExpiresAt,
                  sequenceNumber: 1
                },
                $push: {
                  reservations: {
                    paymentId: paymentId,
                    orderId: orderId,
                    expiresAt: calculatedExpiresAt,
                    sequenceNumber: 1,
                    status: "reserved",
                    createdAt: new Date()
                  }
                }
              },
              {
                upsert: true,
                new: true
              }
            );
          } else {
            casResult = await NoteSubscriptionTimeline.findOneAndUpdate(
              {
                _id: req.user.id,
                activeExpiresAt: expectedPreviousExpiry,
                sequenceNumber: expectedPreviousSequence,
                "reservations.paymentId": { $ne: paymentId }
              },
              {
                $set: {
                  activeExpiresAt: calculatedExpiresAt
                },
                $inc: {
                  sequenceNumber: 1
                },
                $push: {
                  reservations: {
                    paymentId: paymentId,
                    orderId: orderId,
                    expiresAt: calculatedExpiresAt,
                    sequenceNumber: nextSequence,
                    status: "reserved",
                    createdAt: new Date()
                  }
                }
              },
              {
                new: true
              }
            );
          }
        } catch (err) {
          if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
            console.warn(`Upsert race for user ${req.user.id} (attempt ${attempt + 1}). Retrying against created timeline...`);
            await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
            continue;
          }
          throw err;
        }

        if (!casResult) {
          // Check if another concurrent worker for the same payment completed the reservation
          const reloaded = await NoteSubscriptionTimeline.findById(req.user.id);
          const selfRes = reloaded?.reservations?.find(r => r.paymentId === paymentId);
          if (selfRes) {
            allocatedTimeline = reloaded;
            allocatedReservation = selfRes;
          } else {
            console.warn(`CAS timeline conflict for user ${req.user.id} (attempt ${attempt + 1}). Re-stacking onto new timeline...`);
            await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
            continue;
          }
        } else {
          allocatedTimeline = casResult;
          allocatedReservation = casResult.reservations.find(r => r.paymentId === paymentId);
        }
      }

      if (!allocatedReservation) {
        continue;
      }

      const finalExpiresAt = allocatedReservation.expiresAt;
      const finalSequence = allocatedReservation.sequenceNumber;

      try {
        const subscriptionDocs = await NoteSubscription.create([{
          userId: req.user.id,
          planType: "monthly",
          amountPaid: livePayment.amount / 100,
          currency: "INR",
          status: "active",
          startDate: new Date(),
          expiresAt: finalExpiresAt,
          subscriptionIndex: finalSequence,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          paymentDetails: {
            method: livePayment.method || "razorpay",
            capturedAt: new Date()
          }
        }], session ? { session } : undefined);

        createdSub = subscriptionDocs[0];

        // Transition reservation status to 'committed'
        await NoteSubscriptionTimeline.updateOne(
          { _id: req.user.id, "reservations.paymentId": paymentId },
          { $set: { "reservations.$.status": "committed" } }
        ).catch(() => {});

        break; // Successfully committed
      } catch (insertErr) {
        if (insertErr.code === 11000) {
          const isSequenceCollision = Boolean(
            (insertErr.keyPattern && (insertErr.keyPattern.subscriptionIndex || insertErr.keyPattern.expiresAt)) ||
            (insertErr.message && (insertErr.message.includes("subscriptionIndex") || insertErr.message.includes("expiresAt")))
          );
          const isPaymentIdCollision = Boolean(
            (insertErr.keyPattern && insertErr.keyPattern.razorpayPaymentId) ||
            (insertErr.message && insertErr.message.includes("razorpayPaymentId"))
          );

          if (isPaymentIdCollision) {
            const existing = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
            if (existing) {
              createdSub = existing;
              break;
            }
          }

          if (isSequenceCollision && !isPaymentIdCollision && attempt < MAX_STACKING_ATTEMPTS - 1) {
            console.warn(`Concurrency collision on subscription insert for user ${req.user.id}. Retrying allocation (attempt ${attempt + 1})...`);
            continue;
          }
        }
        throw insertErr;
      }
    }

    if (!allocatedTimeline || !createdSub) {
      console.error(`Exhausted timeline allocation attempts for user ${req.user.id}`);
      return res.status(409).json({
        error: "Subscription timeline conflict during renewal. Please retry in a few seconds."
      });
    }

    // Mark server order as fulfilled
    subOrder.status = "paid";
    subOrder.subscriptionId = createdSub._id;
    subOrder.razorpayPaymentId = paymentId;
    subOrder.razorpaySignature = signature;
    if (session) {
      await subOrder.save({ session });
      await session.commitTransaction();
    } else {
      await subOrder.save();
    }

    return res.json({
      success: true,
      message: "Subscription activated successfully",
      subscription: createdSub
    });
  } catch (err) {
    if (session) {
      try { await session.abortTransaction(); } catch (_) {}
    } else if (createdSub) {
      // In standalone MongoDB, NoteSubscription represents the verified financial entitlement.
      // Do not destroy a confirmed paid subscription if the auxiliary order record update encounters a transient failure;
      // instead, the order status is safely reconciled to 'paid' upon client retry via Gate 4 idempotency.
      console.warn(`Notice: Subscription ${createdSub._id} created, but order update failed. Preserving subscription; Gate 4 will reconcile on retry.`);
    }
    if (err.code === 11000) {
      // Confirm collision is specifically on razorpayPaymentId
      const isPaymentIdCollision = Boolean(
        (err.keyPattern && err.keyPattern.razorpayPaymentId) ||
        (err.keyValue && err.keyValue.razorpayPaymentId) ||
        (err.message && err.message.includes("razorpayPaymentId"))
      );

      if (isPaymentIdCollision) {
        const duplicateRecord = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });

        if (
          duplicateRecord &&
          duplicateRecord.userId.toString() === req.user.id.toString() &&
          duplicateRecord.razorpayOrderId === orderId
        ) {
          if (subOrder.status !== "paid") {
            subOrder.status = "paid";
            await subOrder.save();
          }
          return res.json({
            success: true,
            message: "Subscription activated successfully",
            duplicate: true,
            subscription: duplicateRecord
          });
        }

        console.warn(`SECURITY ALERT: E11000 payment duplicate mismatch for user ${req.user.id}, order ${orderId}, payment ${paymentId}`);
        return res.status(409).json({
          error: "Duplicate payment verification conflict. Payment cannot be assigned to this subscription."
        });
      }

      console.error("Non-payment unique index collision:", err.message);
      return res.status(409).json({
        error: "Database constraint conflict during subscription activation."
      });
    }
    console.error("Subscription verification transaction error:", err);
    return res.status(500).json({ error: "Failed to activate subscription in database" });
    } finally {
      if (session) {
        session.endSession();
      }
    }
  });
  } catch (outerErr) {
    if (outerErr.isLockTimeout || outerErr.status === 409) {
      return res.status(409).json({
        error: "Subscription renewal is currently being processed. Please retry in a few seconds."
      });
    }
    console.error("Unexpected subscription verification error:", outerErr);
    return res.status(500).json({ error: "Failed to process subscription verification" });
  }
});

// Export helper for unit testing
router._testHelpers = {
  addOneCalendarMonth,
  getRazorpayConfig,
  getRazorpayClient,
  withUserVerificationLock,
  acquireUserRenewalDbLock,
  withUserRenewalLock,
  NoteSubscriptionLock,
  NoteSubscriptionTimeline
};

module.exports = router;

