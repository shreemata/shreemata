// routes/subscriptions.js
// Dedicated billing, Razorpay order creation, and payment verification for 4-Section subscriptions
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
const NoteSubscription = require("../models/NoteSubscription");
const SubscriptionOrder = require("../models/SubscriptionOrder");
const AdminSettings = require("../models/AdminSettings");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { FEATURES } = require("../config/features");

const router = express.Router();

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
 * Calendar-month calculation for legacy orders without explicit durationDays
 */
function addOneCalendarMonth(baseDate) {
  const d = new Date(baseDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
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

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay, hours, minutes, seconds, ms));
}

function getLockKey(userId, section = 'notes') {
  if (section === 'notes') {
    return String(userId);
  }
  return `${userId}:${section}`;
}

function getTimelineId(userId, section = 'notes') {
  if (section === 'notes') {
    try {
      return new mongoose.Types.ObjectId(String(userId));
    } catch (_) {
      return String(userId);
    }
  }
  return `${userId}:${section}`;
}

// In-memory verification lock
const userVerificationLocks = new Map();

async function withUserVerificationLock(lockKey, fn) {
  const key = String(lockKey);
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

// Database-level distributed lock schema
const subscriptionLockSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.Mixed, required: true },
  lockToken: { type: String, required: true },
  lockedAt: { type: Date, required: true, default: Date.now },
  leaseExpiresAt: { type: Date, required: true, index: true }
}, { collection: 'notesubscriptionlocks' });

const NoteSubscriptionLock = mongoose.models.NoteSubscriptionLock || mongoose.model('NoteSubscriptionLock', subscriptionLockSchema);

// Subscription Timeline Schema
const subscriptionTimelineSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.Mixed, required: true },
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

async function acquireUserRenewalDbLock(lockId, ttlMs = 15000, maxRetries = 35, retryDelayMs = 150) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + ttlMs);
    const lockToken = crypto.randomUUID();

    try {
      const reclaimed = await NoteSubscriptionLock.findOneAndUpdate(
        {
          _id: lockId,
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
              await NoteSubscriptionLock.deleteOne({ _id: lockId, lockToken });
            } catch (_) {}
          },
          isValid: async () => {
            const doc = await NoteSubscriptionLock.findOne({
              _id: lockId,
              lockToken,
              leaseExpiresAt: { $gt: new Date() }
            });
            return Boolean(doc);
          }
        };
      }

      try {
        await NoteSubscriptionLock.create({
          _id: lockId,
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
              await NoteSubscriptionLock.deleteOne({ _id: lockId, lockToken });
            } catch (_) {}
          },
          isValid: async () => {
            const doc = await NoteSubscriptionLock.findOne({
              _id: lockId,
              lockToken,
              leaseExpiresAt: { $gt: new Date() }
            });
            return Boolean(doc);
          }
        };
      } catch (createErr) {
        if (createErr.code !== 11000) {
          console.warn("Notice in subscription DB lock creation:", createErr.message);
        }
      }
    } catch (err) {
      console.warn("Notice in subscription DB lock acquisition:", err.message);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return {
    acquired: false,
    lockToken: null,
    release: async () => {},
    isValid: async () => false
  };
}

async function withUserRenewalLock(userId, section, fn) {
  const inProcessKey = getLockKey(userId, section);
  const dbLockId = getTimelineId(userId, section);

  return withUserVerificationLock(inProcessKey, async () => {
    const dbLock = await acquireUserRenewalDbLock(dbLockId);
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

function checkSectionEnabled(section) {
  if (section === 'notes') return Boolean(FEATURES.readNotes);
  if (section === 'question_papers') return Boolean(FEATURES.questionPapers);
  if (section === 'videos') return Boolean(FEATURES.videos);
  return false;
}

// =========================================================================
// 1. GET /api/subscriptions/pricing (Public, optional ?section=)
// =========================================================================
router.get("/pricing", async (req, res) => {
  try {
    const rawSection = (req.query.section || 'notes').toLowerCase().trim();
    const validSections = ['notes', 'question_papers', 'videos'];
    if (!validSections.includes(rawSection)) {
      return res.status(400).json({ error: "Invalid section parameter" });
    }

    const rawSettings = await AdminSettings.findOne().lean();
    const plan = AdminSettings.getSectionPlan(rawSettings, rawSection);
    const isEnabled = Boolean(plan.active && checkSectionEnabled(rawSection));

    // Keep response shape identical for default calls
    return res.json({
      success: true,
      pricing: {
        planType: "monthly",
        currency: "INR",
        monthlyPrice: plan.price,
        amountInPaise: Math.round(plan.price * 100),
        enabled: isEnabled,
        description: plan.description,
        section: rawSection,
        name: plan.name,
        durationDays: plan.durationDays
      }
    });
  } catch (err) {
    console.error("Error fetching subscription pricing:", err.message);
    return res.status(500).json({ error: "Failed to fetch subscription pricing" });
  }
});

// =========================================================================
// 2. GET /api/subscriptions/my-status (Authenticated, optional ?section=)
// =========================================================================
router.get("/my-status", authenticateToken, async (req, res) => {
  try {
    const rawSection = (req.query.section || 'notes').toLowerCase().trim();
    const validSections = ['notes', 'question_papers', 'videos'];
    if (!validSections.includes(rawSection)) {
      return res.status(400).json({ error: "Invalid section parameter" });
    }

    const now = new Date();

    const activeSubQuery = {
      userId: req.user.id,
      status: "active",
      expiresAt: { $gt: now }
    };
    if (rawSection === 'notes') {
      activeSubQuery.$or = [
        { section: 'notes' },
        { section: { $exists: false } },
        { section: null }
      ];
    } else {
      activeSubQuery.section = rawSection;
    }

    const activeSub = await NoteSubscription.findOne(activeSubQuery).sort({ expiresAt: -1 }).lean();

    if (activeSub) {
      const daysRemaining = Math.max(0, Math.ceil((new Date(activeSub.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return res.json({
        success: true,
        hasActiveSubscription: true,
        subscription: {
          id: activeSub._id,
          section: activeSub.section || 'notes',
          planType: activeSub.planType,
          status: activeSub.status,
          startDate: activeSub.startDate,
          expiresAt: activeSub.expiresAt,
          daysRemaining
        }
      });
    }

    // Check if user had a previous subscription that is now expired
    const lastSubQuery = { userId: req.user.id };
    if (rawSection === 'notes') {
      lastSubQuery.$or = [
        { section: 'notes' },
        { section: { $exists: false } },
        { section: null }
      ];
    } else {
      lastSubQuery.section = rawSection;
    }

    const lastSub = await NoteSubscription.findOne(lastSubQuery).sort({ expiresAt: -1 }).lean();

    return res.json({
      success: true,
      hasActiveSubscription: false,
      subscription: null,
      section: rawSection,
      lastSubscription: lastSub ? {
        id: lastSub._id,
        section: lastSub.section,
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
// 3. POST /api/subscriptions/create-order (Authenticated, accepts { section })
// =========================================================================
router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const rawSection = (req.body.section || 'notes').toLowerCase().trim();
    const validSections = ['notes', 'question_papers', 'videos'];
    if (!validSections.includes(rawSection)) {
      return res.status(400).json({ error: "Invalid section. Must be one of: notes, question_papers, videos" });
    }

    if (!checkSectionEnabled(rawSection)) {
      return res.status(400).json({
        error: `${rawSection} subscriptions are currently disabled.`
      });
    }

    const rawSettings = await AdminSettings.findOne().lean();
    const plan = AdminSettings.getSectionPlan(rawSettings, rawSection);

    if (!plan.active) {
      return res.status(400).json({
        error: `${plan.name} subscriptions are currently disabled by administration.`
      });
    }

    const amountInPaise = Math.round(plan.price * 100);

    const rzpConfig = getRazorpayConfig();
    const razorpay = getRazorpayClient();
    if (!rzpConfig || !razorpay) {
      console.error("Subscription payment error: Missing server-configured Razorpay credentials.");
      return res.status(500).json({
        error: "Payment gateway configuration error. Subscription payment credentials are not configured on the server."
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `sub_${rawSection.slice(0, 3)}_${req.user.id.toString().slice(-6)}_${Date.now()}`,
      notes: {
        subscriptionUserId: req.user.id.toString(),
        section: rawSection,
        planType: "standard",
        durationDays: String(plan.durationDays)
      }
    });

    await SubscriptionOrder.create({
      razorpayOrderId: razorpayOrder.id,
      userId: req.user.id,
      section: rawSection,
      durationDays: plan.durationDays,
      amountPaise: amountInPaise,
      currency: "INR",
      planType: "standard",
      status: "created"
    });

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      key: rzpConfig.keyId,
      section: rawSection
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required payment verification parameters" });
    }

    const orderId = String(razorpay_order_id).trim();
    const paymentId = String(razorpay_payment_id).trim();
    const signature = String(razorpay_signature).trim();

    // Gate 1: Signature check
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

    // Gate 2: Fetch and verify server-authoritative order record
    const subOrder = await SubscriptionOrder.findOne({ razorpayOrderId: orderId });
    if (!subOrder) {
      return res.status(400).json({ error: "Subscription order record not found or unverified" });
    }

    if (subOrder.userId.toString() !== req.user.id.toString()) {
      console.warn(`SECURITY ALERT: Order ownership mismatch. Order ${orderId} belongs to ${subOrder.userId}, attempted by ${req.user.id}`);
      return res.status(403).json({ error: "Order ownership mismatch. Access denied." });
    }

    // Use ONLY subOrder.section and subOrder.durationDays (ignore client-sent values)
    const targetSection = subOrder.section || 'notes';
    const targetDurationDays = subOrder.durationDays;

    return await withUserRenewalLock(req.user.id, targetSection, async (dbLock) => {
      // Gate 3: Idempotency & replay check
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

      // Gate 4: Live Razorpay gateway fetch
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

      if (Number(livePayment.amount) !== Number(subOrder.amountPaise)) {
        return res.status(400).json({
          error: `Payment amount (${livePayment.amount}) does not match expected order amount (${subOrder.amountPaise})`
        });
      }

      // Gate 5: Fencing check
      if (dbLock && typeof dbLock.isValid === 'function') {
        const isLeaseValid = await dbLock.isValid();
        if (!isLeaseValid) {
          return res.status(409).json({
            error: "Subscription renewal lease expired before activation could complete. Please retry."
          });
        }
      }

      const timelineId = getTimelineId(req.user.id, targetSection);

      // Gate 6: Stacking & Expiry Calculation
      let createdSub = null;
      let allocatedTimeline = null;
      let allocatedReservation = null;
      const MAX_STACKING_ATTEMPTS = 5;

      for (let attempt = 0; attempt < MAX_STACKING_ATTEMPTS; attempt++) {
        let timeline = await NoteSubscriptionTimeline.findById(timelineId);

        const existingRes = timeline?.reservations?.find(r => r.paymentId === paymentId);
        if (existingRes) {
          allocatedTimeline = timeline;
          allocatedReservation = existingRes;
        } else {
          const now = new Date();
          let baseDate = now;

          const currentActiveSub = await NoteSubscription.findOne({
            userId: req.user.id,
            section: targetSection,
            status: "active",
            expiresAt: { $gt: now }
          }).sort({ expiresAt: -1 });

          if (currentActiveSub && new Date(currentActiveSub.expiresAt) > baseDate) {
            baseDate = new Date(currentActiveSub.expiresAt);
          }
          if (timeline && timeline.activeExpiresAt && new Date(timeline.activeExpiresAt) > baseDate) {
            baseDate = new Date(timeline.activeExpiresAt);
          }

          // Expiry calculation: durationDays if defined, fallback to addOneCalendarMonth for legacy notes
          let calculatedExpiresAt;
          if (targetDurationDays && typeof targetDurationDays === 'number' && targetDurationDays >= 1) {
            calculatedExpiresAt = new Date(baseDate.getTime() + targetDurationDays * 86400000);
          } else {
            calculatedExpiresAt = addOneCalendarMonth(baseDate);
          }

          const expectedPreviousExpiry = timeline ? timeline.activeExpiresAt : null;
          const expectedPreviousSequence = timeline ? (timeline.sequenceNumber || 0) : 0;
          const nextSequence = expectedPreviousSequence + 1;

          let casResult = null;
          try {
            if (!timeline) {
              casResult = await NoteSubscriptionTimeline.findOneAndUpdate(
                {
                  _id: timelineId,
                  sequenceNumber: { $in: [null, 0] }
                },
                {
                  $set: {
                    activeExpiresAt: calculatedExpiresAt,
                    sequenceNumber: 1
                  },
                  $push: {
                    reservations: {
                      paymentId,
                      orderId,
                      expiresAt: calculatedExpiresAt,
                      sequenceNumber: 1,
                      status: "reserved",
                      createdAt: new Date()
                    }
                  }
                },
                { upsert: true, new: true }
              );
            } else {
              casResult = await NoteSubscriptionTimeline.findOneAndUpdate(
                {
                  _id: timelineId,
                  activeExpiresAt: expectedPreviousExpiry,
                  sequenceNumber: expectedPreviousSequence,
                  "reservations.paymentId": { $ne: paymentId }
                },
                {
                  $set: {
                    activeExpiresAt: calculatedExpiresAt
                  },
                  $inc: { sequenceNumber: 1 },
                  $push: {
                    reservations: {
                      paymentId,
                      orderId,
                      expiresAt: calculatedExpiresAt,
                      sequenceNumber: nextSequence,
                      status: "reserved",
                      createdAt: new Date()
                    }
                  }
                },
                { new: true }
              );
            }
          } catch (err) {
            if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
              await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
              continue;
            }
            throw err;
          }

          if (!casResult) {
            const reloaded = await NoteSubscriptionTimeline.findById(timelineId);
            const selfRes = reloaded?.reservations?.find(r => r.paymentId === paymentId);
            if (selfRes) {
              allocatedTimeline = reloaded;
              allocatedReservation = selfRes;
            } else {
              await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
              continue;
            }
          } else {
            allocatedTimeline = casResult;
            allocatedReservation = casResult.reservations.find(r => r.paymentId === paymentId);
          }
        }

        if (!allocatedReservation) continue;

        const finalExpiresAt = allocatedReservation.expiresAt;
        const finalSequence = allocatedReservation.sequenceNumber;

        try {
          const subscriptionDocs = await NoteSubscription.create([{
            userId: req.user.id,
            section: targetSection,
            planType: subOrder.planType || "standard",
            durationDays: targetDurationDays || 30,
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
          }]);

          createdSub = subscriptionDocs[0];

          await NoteSubscriptionTimeline.updateOne(
            { _id: timelineId, "reservations.paymentId": paymentId },
            { $set: { "reservations.$.status": "committed" } }
          ).catch(() => {});

          break;
        } catch (insertErr) {
          if (insertErr.code === 11000) {
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

            if (attempt < MAX_STACKING_ATTEMPTS - 1) {
              continue;
            }
          }
          throw insertErr;
        }
      }

      if (!createdSub) {
        return res.status(409).json({
          error: "Subscription timeline conflict during renewal. Please retry in a few seconds."
        });
      }

      subOrder.status = "paid";
      subOrder.subscriptionId = createdSub._id;
      subOrder.razorpayPaymentId = paymentId;
      subOrder.razorpaySignature = signature;
      await subOrder.save();

      return res.json({
        success: true,
        message: "Subscription activated successfully",
        subscription: createdSub
      });
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

// =========================================================================
// 5. GET /api/subscriptions/admin/subscribers (Admin Only, optional ?section=)
// =========================================================================
router.get("/admin/subscribers", authenticateToken, isAdmin, async (req, res) => {
  try {
    const now = new Date();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const statusFilter = (req.query.status || "all").toLowerCase().trim();
    const sectionFilter = (req.query.section || "all").toLowerCase().trim();
    const search = (req.query.search || "").trim();

    const query = {};

    if (sectionFilter !== "all" && ['notes', 'question_papers', 'videos'].includes(sectionFilter)) {
      query.section = sectionFilter;
    }

    if (statusFilter === "active") {
      query.status = "active";
      query.expiresAt = { $gt: now };
    } else if (statusFilter === "expired") {
      query.$or = [
        { status: "expired" },
        { expiresAt: { $lte: now } }
      ];
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearch, "i");

      const matchedUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ]
      }).select("_id").lean();

      const matchedUserIds = matchedUsers.map((u) => u._id);

      const searchConditions = [
        { userId: { $in: matchedUserIds } },
        { razorpayOrderId: searchRegex },
        { razorpayPaymentId: searchRegex }
      ];

      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchConditions }
        ];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const [rawSubscribers, totalCount, activeCount, expiredCount, totalAll] = await Promise.all([
      NoteSubscription.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email phone role")
        .lean(),
      NoteSubscription.countDocuments(query),
      NoteSubscription.countDocuments({ ...query, status: "active", expiresAt: { $gt: now } }),
      NoteSubscription.countDocuments({ ...query, $or: [{ status: "expired" }, { expiresAt: { $lte: now } }] }),
      NoteSubscription.countDocuments(sectionFilter !== "all" ? { section: sectionFilter } : {})
    ]);

    const subscribers = rawSubscribers.map((sub) => {
      const isExpired = !sub.expiresAt || new Date(sub.expiresAt).getTime() <= now.getTime();
      const computedStatus = (sub.status === "active" && !isExpired) ? "active" : (isExpired ? "expired" : sub.status);
      const daysRemaining = isExpired
        ? 0
        : Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

      const customer = sub.userId
        ? {
            id: sub.userId._id,
            name: sub.userId.name || "N/A",
            email: sub.userId.email || "N/A",
            phone: sub.userId.phone || "N/A"
          }
        : {
            id: null,
            name: "Unknown / Deleted User",
            email: "N/A",
            phone: "N/A"
          };

      return {
        id: sub._id,
        customer,
        section: sub.section || "notes",
        planType: sub.planType,
        amountPaid: sub.amountPaid,
        currency: sub.currency || "INR",
        status: computedStatus,
        rawStatus: sub.status,
        startDate: sub.startDate,
        expiresAt: sub.expiresAt,
        daysRemaining,
        subscriptionIndex: sub.subscriptionIndex || 1,
        orderId: sub.razorpayOrderId,
        createdAt: sub.createdAt
      };
    });

    return res.json({
      success: true,
      subscribers,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1
      },
      summary: {
        totalCount: totalAll,
        activeCount,
        expiredCount
      }
    });
  } catch (err) {
    console.error("Error fetching admin subscribers:", err);
    return res.status(500).json({ error: "Failed to fetch subscribers list" });
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
  getLockKey,
  getTimelineId,
  NoteSubscriptionLock,
  NoteSubscriptionTimeline
};

module.exports = router;
