// tests/subscriptionRoutes.test.js
// Automated test suite exercising the actual Express subscription API routes
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_subscription_routes_8822';
process.env.DISABLE_MONGO_TRANSACTIONS = 'true'; // Allow atomic fallback in single-node test runner

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock Razorpay SDK network calls
const mockOrdersCreate = jest.fn();
const mockPaymentsFetch = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation((config) => {
    return {
      config,
      orders: {
        create: mockOrdersCreate
      },
      payments: {
        fetch: mockPaymentsFetch
      }
    };
  });
});

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const AdminSettings = require('../models/AdminSettings');

const subscriptionsRoutes = require('../routes/subscriptions');
const notesRoutes = require('../routes/notes');
const adminSettingsRoutes = require('../routes/adminSettings');
const { addOneCalendarMonth, acquireUserRenewalDbLock, NoteSubscriptionLock, NoteSubscriptionTimeline, withUserRenewalLock } = subscriptionsRoutes._testHelpers;

jest.setTimeout(60000);

let server;
let client;
let userA;
let userB;
let adminUser;
let tokenA;
let tokenB;
let tokenAdmin;
let tempPdfPath;
let tempPdfKey;

beforeAll(async () => {
  await setupTestDB();

  // Safety Assertion: Explicitly ensure tests cannot connect to production
  const dbHost = mongoose.connection.host;
  const dbName = mongoose.connection.name;
  expect(dbHost).toMatch(/127\.0\.0\.1|localhost/);
  expect(dbName).not.toMatch(/prod|production/i);

  // Guarantee schema indexes are fully initialized in the test database
  await NoteSubscription.init();
  await SubscriptionOrder.init();
  await NoteSubscriptionTimeline.init();



  // Create temporary dummy PDF file inside safe storageDir for stream testing
  const storageDir = process.env.READ_NOTES_STORAGE_DIR
    ? path.resolve(process.env.READ_NOTES_STORAGE_DIR)
    : path.resolve(__dirname, '../storage/notes/private');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  tempPdfKey = `test_study_doc_${Date.now()}.pdf`;
  tempPdfPath = path.join(storageDir, tempPdfKey);
  fs.writeFileSync(tempPdfPath, '%PDF-1.4\n%EOF\nDummy test PDF buffer for subscription stream');

  const app = express();
  app.use(express.json());

  app.use('/api/subscriptions', subscriptionsRoutes);
  app.use('/api/notes', notesRoutes);
  app.use('/api/admin', adminSettingsRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api`,
        validateStatus: () => true
      });
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (tempPdfPath && fs.existsSync(tempPdfPath)) {
    try {
      fs.unlinkSync(tempPdfPath);
      fs.rmdirSync(path.dirname(tempPdfPath));
    } catch (_) {}
  }
  await teardownTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.clearAllMocks();
  if (mockPaymentsFetch && typeof mockPaymentsFetch.mockReset === 'function') {
    mockPaymentsFetch.mockReset();
  }

  // Default test credentials
  process.env.RAZORPAY_KEY_ID = 'rzp_test_validSecretKeyId123';
  process.env.RAZORPAY_KEY_SECRET = 'valid_test_secret_sha256_key';

  // Seed AdminSettings
  await AdminSettings.create({
    virtualTreeSettings: {
      enabled: true,
      pointsPerVirtualTree: 100,
      maxVirtualTreesPerUser: 5,
      autoCreateEnabled: true
    },
    readNotesSubscriptionSettings: {
      enabled: true,
      monthlyPrice: 49,
      description: 'Monthly unlimited digital study notes access'
    }
  });

  // Create test users
  userA = await User.create({
    name: 'Subscriber User A',
    email: 'user_a@example.com',
    phone: '9876543210',
    password: 'password123',
    role: 'buyer'
  });

  userB = await User.create({
    name: 'Subscriber User B',
    email: 'user_b@example.com',
    phone: '9876543211',
    password: 'password123',
    role: 'buyer'
  });

  adminUser = await User.create({
    name: 'Administrator User',
    email: 'admin@shreemata.com',
    phone: '9876543219',
    password: 'password123',
    role: 'admin'
  });

  tokenA = jwt.sign({ id: userA._id }, process.env.JWT_SECRET);
  tokenB = jwt.sign({ id: userB._id }, process.env.JWT_SECRET);
  tokenAdmin = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET);
});

describe('Subscription API Routes Test Suite', () => {

  // =========================================================================
  // 1. Missing Razorpay Credentials
  // =========================================================================
  describe('1. Missing / Unconfigured Razorpay Credentials', () => {
    test('POST /api/subscriptions/create-order returns safe 500 error when credentials missing', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      const res = await client.post(
        '/subscriptions/create-order',
        {},
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(500);
      expect(res.data.error).toMatch(/Payment gateway configuration error/i);
      expect(res.data.key).toBeUndefined();
      expect(res.data).not.toHaveProperty('key');
      expect(JSON.stringify(res.data)).not.toContain('rzp_live_');
    });

    test('POST /api/subscriptions/verify-order returns safe 500 error when credentials missing', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: 'order_dummy_123',
          razorpay_payment_id: 'pay_dummy_123',
          razorpay_signature: 'sig_dummy_123'
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(500);
      expect(res.data.error).toMatch(/Payment verification configuration error/i);
    });
  });

  // =========================================================================
  // 2. Admin Subscription Settings Validation
  // =========================================================================
  describe('2. Admin Subscription Settings Validation', () => {
    test('PUT /api/admin/settings updates subscription settings with valid values and preserves existing settings', async () => {
      const res = await client.put(
        '/admin/settings',
        {
          readNotesSubscriptionSettings: {
            monthlyPrice: 149,
            enabled: false,
            description: '  Updated promotional description  '
          }
        },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const subConfig = res.data.settings.readNotesSubscriptionSettings;
      expect(subConfig.monthlyPrice).toBe(149);
      expect(subConfig.enabled).toBe(false);
      expect(subConfig.description).toBe('Updated promotional description'); // Trimmed

      // Verify preservation of other admin settings
      expect(res.data.settings.virtualTreeSettings.pointsPerVirtualTree).toBe(100);
    });

    test('PUT /api/admin/settings rejects invalid monthlyPrice (< 1, > 100000, non-number)', async () => {
      // Less than 1
      let res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { monthlyPrice: 0 } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/between ₹1 and ₹1,00,000/);

      // Greater than 100,000
      res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { monthlyPrice: 100001 } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/between ₹1 and ₹1,00,000/);

      // Non-number / NaN
      res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { monthlyPrice: 'free' } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/between ₹1 and ₹1,00,000/);
    });

    test('PUT /api/admin/settings rejects non-boolean enabled flag', async () => {
      const res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { enabled: 'yes' } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/must be a boolean/);
    });

    test('PUT /api/admin/settings rejects non-string or description exceeding 300 characters', async () => {
      // Non-string
      let res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { description: 12345 } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/must be a text string/);

      // Exceeding 300 chars
      res = await client.put(
        '/admin/settings',
        { readNotesSubscriptionSettings: { description: 'A'.repeat(301) } },
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/cannot exceed 300 characters/);
    });

    test('POST /api/subscriptions/create-order returns 400 when disabled in AdminSettings', async () => {
      await AdminSettings.updateOne(
        {},
        { $set: { 'readNotesSubscriptionSettings.enabled': false } }
      );

      const res = await client.post(
        '/subscriptions/create-order',
        {},
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/currently disabled/i);
      expect(mockOrdersCreate).not.toHaveBeenCalled();
    });

    test('GET /api/subscriptions/pricing reflects updated price and disabled status', async () => {
      await AdminSettings.updateOne(
        {},
        { $set: { 'readNotesSubscriptionSettings.enabled': false, 'readNotesSubscriptionSettings.monthlyPrice': 99 } }
      );

      const res = await client.get('/subscriptions/pricing');

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.pricing.enabled).toBe(false);
      expect(res.data.pricing.monthlyPrice).toBe(99);
      expect(res.data.pricing.amountInPaise).toBe(9900);
    });
  });

  // =========================================================================
  // 3. Order Creation with Valid Server Credentials
  // =========================================================================
  describe('3. Order Creation', () => {
    test('POST /api/subscriptions/create-order generates order and persists mapping', async () => {
      mockOrdersCreate.mockResolvedValueOnce({
        id: 'order_rzp_test_1001',
        amount: 4900,
        currency: 'INR',
        status: 'created'
      });

      const res = await client.post(
        '/subscriptions/create-order',
        {},
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.orderId).toBe('order_rzp_test_1001');
      expect(res.data.amount).toBe(4900);
      expect(res.data.currency).toBe('INR');
      expect(res.data.key).toBe('rzp_test_validSecretKeyId123');

      // Verify server record
      const orderRecord = await SubscriptionOrder.findOne({ razorpayOrderId: 'order_rzp_test_1001' });
      expect(orderRecord).toBeTruthy();
      expect(orderRecord.userId.toString()).toBe(userA._id.toString());
      expect(orderRecord.status).toBe('created');
      expect(orderRecord.amountPaise).toBe(4900);
    });
  });

  // =========================================================================
  // 4. Order Ownership Protection
  // =========================================================================
  describe('4. Server-Authoritative Order Ownership', () => {
    test('POST /api/subscriptions/verify-order rejects verification when order belongs to different user', async () => {
      const orderId = 'order_rzp_owned_by_a';
      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const paymentId = 'pay_attempt_by_b';
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenB}` } }
      );

      expect(res.status).toBe(403);
      expect(res.data.error).toMatch(/ownership mismatch/i);
    });
  });

  // =========================================================================
  // 5. Payment Signature & Gateway Validation
  // =========================================================================
  describe('5. Payment Signature & Gateway Validation', () => {
    test('rejects tampered cryptographic signature with 400', async () => {
      const orderId = 'order_sig_test_1';
      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: 'pay_sig_test_1',
          razorpay_signature: 'tampered_invalid_hex_signature_abcdef1234567890abcdef1234567890'
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/signature verification failed/i);
    });

    test('rejects payment when status is not captured or currency is not INR', async () => {
      const orderId = 'order_curr_test';
      const paymentId = 'pay_curr_test';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      // Status not captured
      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'failed',
        currency: 'INR',
        amount: 4900
      });

      let res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/Payment not captured/);

      // Currency not INR
      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'USD',
        amount: 4900
      });

      res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/Only INR payments are supported/);
    });

    test('rejects payment when live amount mismatches order amount', async () => {
      const orderId = 'order_amount_mismatch';
      const paymentId = 'pay_amount_mismatch';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'INR',
        amount: 2500 // Expected 4900
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/does not match expected order amount/i);
    });

    test('activates first-time subscription starting from current server time', async () => {
      const orderId = 'order_valid_activate';
      const paymentId = 'pay_valid_activate';
      const beforeTime = new Date();

      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'INR',
        amount: 4900,
        method: 'upi'
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toMatch(/activated successfully/i);

      // Verify NoteSubscription in DB
      const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
      expect(sub).toBeTruthy();
      expect(sub.userId.toString()).toBe(userA._id.toString());
      expect(sub.status).toBe('active');
      expect(new Date(sub.startDate).getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
      expect(new Date(sub.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // Verify SubscriptionOrder updated to paid
      const updatedOrder = await SubscriptionOrder.findOne({ razorpayOrderId: orderId });
      expect(updatedOrder.status).toBe('paid');
    });

    test('renewal before expiry extends from existing expiry date rather than discarding remaining access', async () => {
      // User A already has an active subscription expiring 10 days in the future
      const existingExpiry = new Date(Date.now() + 10 * 86400000);
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(Date.now() - 20 * 86400000),
        expiresAt: existingExpiry,
        razorpayOrderId: 'order_initial_active',
        razorpayPaymentId: 'pay_initial_active',
        razorpaySignature: 'sig_initial'
      });

      // User A purchases an early renewal
      const renewOrderId = 'order_renew_extension';
      const renewPaymentId = 'pay_renew_extension';

      await SubscriptionOrder.create({
        razorpayOrderId: renewOrderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${renewOrderId}|${renewPaymentId}`)
        .digest('hex');

      mockPaymentsFetch.mockResolvedValueOnce({
        id: renewPaymentId,
        order_id: renewOrderId,
        status: 'captured',
        currency: 'INR',
        amount: 4900,
        method: 'card'
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: renewOrderId,
          razorpay_payment_id: renewPaymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const renewedSub = await NoteSubscription.findOne({ razorpayPaymentId: renewPaymentId });
      expect(renewedSub).toBeTruthy();

      // Calculation must extend from existingExpiry: exactly addOneCalendarMonth(existingExpiry)
      const expectedNewExpiry = addOneCalendarMonth(existingExpiry);
      expect(new Date(renewedSub.expiresAt).getTime()).toBe(expectedNewExpiry.getTime());
      expect(new Date(renewedSub.expiresAt).getTime()).toBeGreaterThan(existingExpiry.getTime());
    });
  });

  // =========================================================================
  // 6. Duplicate Callbacks & Idempotency
  // =========================================================================
  describe('6. Duplicate Payment Callbacks & Replay Protection', () => {
    test('returns idempotent success for same user duplicate verification', async () => {
      const orderId = 'order_replay_1';
      const paymentId = 'pay_replay_1';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'paid'
      });

      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'sig_existing'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.duplicate).toBe(true);
      expect(res.data.message).toMatch(/already active/i);
    });

    test('rejects duplicate verification when payment belongs to different user with 409', async () => {
      const orderIdA = 'order_user_a';
      const orderIdB = 'order_user_b';
      const paymentId = 'pay_collision_test';

      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        razorpayOrderId: orderIdA,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'sig_a'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdB,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdB}|${paymentId}`)
        .digest('hex');

      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderIdB,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderIdB,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenB}` } }
      );

      expect(res.status).toBe(409);
      expect(res.data.error).toMatch(/Duplicate payment verification conflict/i);
    });

    test('handles concurrent verification requests for same user and stacks expiry consecutively', async () => {
      // User A starts with an active subscription expiring in 5 days
      const baseNow = Date.now();
      const currentExpiry = new Date(baseNow + 5 * 86400000);
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(baseNow - 25 * 86400000),
        expiresAt: currentExpiry,
        razorpayOrderId: 'order_initial_active',
        razorpayPaymentId: 'pay_initial_active',
        razorpaySignature: 'sig_initial'
      });

      const orderId1 = 'order_concurrent_1';
      const paymentId1 = 'pay_concurrent_1';
      const orderId2 = 'order_concurrent_2';
      const paymentId2 = 'pay_concurrent_2';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId1,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderId2,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sig1 = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId1}|${paymentId1}`)
        .digest('hex');

      const sig2 = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId2}|${paymentId2}`)
        .digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentId1) {
          return { id: paymentId1, order_id: orderId1, status: 'captured', currency: 'INR', amount: 4900 };
        }
        if (id === paymentId2) {
          return { id: paymentId2, order_id: orderId2, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      // Dispatch both payment verifications simultaneously
      const [res1, res2] = await Promise.all([
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderId1, razorpay_payment_id: paymentId1, razorpay_signature: sig1 },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        ),
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderId2, razorpay_payment_id: paymentId2, razorpay_signature: sig2 },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        )
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.data.success).toBe(true);
      expect(res2.data.success).toBe(true);

      // Verify subscriptions in DB: the two new subscriptions must stack consecutively
      const subs = await NoteSubscription.find({ userId: userA._id, status: 'active' }).sort({ expiresAt: 1 });
      expect(subs.length).toBe(3); // initial + 2 renewals

      const exp0 = new Date(subs[0].expiresAt).toISOString();
      const exp1 = new Date(subs[1].expiresAt).toISOString();
      const exp2 = new Date(subs[2].expiresAt).toISOString();

      const expectedExp1 = addOneCalendarMonth(currentExpiry).toISOString();
      const expectedExp2 = addOneCalendarMonth(addOneCalendarMonth(currentExpiry)).toISOString();

      expect(exp0).toBe(currentExpiry.toISOString());
      expect(exp1).toBe(expectedExp1);
      expect(exp2).toBe(expectedExp2);
    });

    test('recovers from partial failure where subscription exists but order status remained unfulfilled', async () => {
      const orderId = 'order_recovery_unfulfilled';
      const paymentId = 'pay_recovery_unfulfilled';

      // Simulate partial failure: order exists in 'created' status
      const subOrder = await SubscriptionOrder.create({
        razorpayOrderId: orderId,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      // But subscription was already recorded in database
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'sig_recovery_existing'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      // User retries verification after crash
      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.duplicate).toBe(true);
      expect(res.data.subscription).toBeTruthy();

      // Confirm subOrder was reconciled and updated to 'paid'
      const refreshedOrder = await SubscriptionOrder.findById(subOrder._id);
      expect(refreshedOrder.status).toBe('paid');
    });

    test('database-level distributed lock enforces mutual exclusion across simulated workers and allows release for next worker', async () => {
      const testUserId = new mongoose.Types.ObjectId();

      // Worker 1 acquires lock
      const lock1 = await acquireUserRenewalDbLock(testUserId, 5000, 5, 50);
      expect(lock1.acquired).toBe(true);

      // Verify lock document exists in MongoDB
      const lockDoc = await NoteSubscriptionLock.findById(testUserId);
      expect(lockDoc).toBeTruthy();
      expect(new Date(lockDoc.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());

      // Worker 2 attempts to acquire lock for same user -> must fail (timeout after 3 retries)
      const lock2 = await acquireUserRenewalDbLock(testUserId, 5000, 3, 50);
      expect(lock2.acquired).toBe(false);

      // Worker 1 releases lock
      await lock1.release();

      // Verify lock document deleted
      const lockDocAfter = await NoteSubscriptionLock.findById(testUserId);
      expect(lockDocAfter).toBeNull();

      // Worker 2 can now acquire lock
      const lock2AfterRelease = await acquireUserRenewalDbLock(testUserId, 5000, 5, 50);
      expect(lock2AfterRelease.acquired).toBe(true);
      await lock2AfterRelease.release();
    });

    test('database-level distributed lock reclaims expired leases automatically (crash recovery)', async () => {
      const testUserId = new mongoose.Types.ObjectId();

      // Simulate a crashed worker whose lock expired 2 seconds ago
      await NoteSubscriptionLock.create({
        _id: testUserId,
        lockToken: 'crashed_worker_token_123',
        lockedAt: new Date(Date.now() - 10000),
        leaseExpiresAt: new Date(Date.now() - 2000)
      });

      // New worker should reclaim the expired lease immediately without blocking
      const newLock = await acquireUserRenewalDbLock(testUserId, 5000, 3, 50);
      expect(newLock.acquired).toBe(true);

      const refreshedDoc = await NoteSubscriptionLock.findById(testUserId);
      expect(new Date(refreshedDoc.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(refreshedDoc.lockToken).not.toBe('crashed_worker_token_123');

      await newLock.release();
    });

    test('fencing guarantee: delayed worker cannot delete another worker\'s lease and fails isValid check', async () => {
      const testUserId = new mongoose.Types.ObjectId();

      // Worker 1 acquires lock with short 80ms TTL
      const lock1 = await acquireUserRenewalDbLock(testUserId, 80, 5, 20);
      expect(lock1.acquired).toBe(true);
      expect(await lock1.isValid()).toBe(true);

      // Wait for Worker 1 lease to expire
      await new Promise((r) => setTimeout(r, 120));

      // Worker 1 is now expired
      expect(await lock1.isValid()).toBe(false);

      // Worker 2 claims the expired lease
      const lock2 = await acquireUserRenewalDbLock(testUserId, 5000, 5, 20);
      expect(lock2.acquired).toBe(true);
      expect(await lock2.isValid()).toBe(true);

      // Worker 1 finally tries to release its old lock -> MUST NOT delete Worker 2's lock
      await lock1.release();

      // Verify Worker 2's lock is still intact and valid
      const lockDoc = await NoteSubscriptionLock.findById(testUserId);
      expect(lockDoc).toBeTruthy();
      expect(lockDoc.lockToken).toBe(lock2.lockToken);
      expect(await lock2.isValid()).toBe(true);

      await lock2.release();
    });

    test('multi-worker simulation: handles distinct concurrent renewals via database lease and stacks consecutive calendar months without race conditions', async () => {
      // User B starts with an active subscription expiring in 10 days
      const baseNow = Date.now();
      const initialExpiry = new Date(baseNow + 10 * 86400000);
      await NoteSubscription.create({
        userId: userB._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(baseNow - 20 * 86400000),
        expiresAt: initialExpiry,
        razorpayOrderId: 'order_mw_initial',
        razorpayPaymentId: 'pay_mw_initial',
        razorpaySignature: 'sig_mw_initial'
      });

      const orderIdA = 'order_mw_renew_1';
      const paymentIdA = 'pay_mw_renew_1';
      const orderIdB = 'order_mw_renew_2';
      const paymentIdB = 'pay_mw_renew_2';

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdA,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdB,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sigA = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdA}|${paymentIdA}`)
        .digest('hex');

      const sigB = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdB}|${paymentIdB}`)
        .digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentIdA) {
          // Add artificial delay to simulate worker 1 holding the lock during slow external fetch
          await new Promise((r) => setTimeout(r, 80));
          return { id: paymentIdA, order_id: orderIdA, status: 'captured', currency: 'INR', amount: 4900 };
        }
        if (id === paymentIdB) {
          return { id: paymentIdB, order_id: orderIdB, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      // Dispatch concurrent verification requests
      const [resA, resB] = await Promise.all([
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderIdA, razorpay_payment_id: paymentIdA, razorpay_signature: sigA },
          { headers: { Authorization: `Bearer ${tokenB}` } }
        ),
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderIdB, razorpay_payment_id: paymentIdB, razorpay_signature: sigB },
          { headers: { Authorization: `Bearer ${tokenB}` } }
        )
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.data.success).toBe(true);
      expect(resB.data.success).toBe(true);

      // Verify that NoteSubscription records stack consecutively without overlapping
      const allUserBSubs = await NoteSubscription.find({ userId: userB._id, status: 'active' }).sort({ expiresAt: 1 });
      expect(allUserBSubs.length).toBe(3); // initial + renewal 1 + renewal 2

      const expectedExpiry1 = addOneCalendarMonth(initialExpiry).toISOString();
      const expectedExpiry2 = addOneCalendarMonth(addOneCalendarMonth(initialExpiry)).toISOString();

      expect(new Date(allUserBSubs[0].expiresAt).toISOString()).toBe(initialExpiry.toISOString());
      expect(new Date(allUserBSubs[1].expiresAt).toISOString()).toBe(expectedExpiry1);
      expect(new Date(allUserBSubs[2].expiresAt).toISOString()).toBe(expectedExpiry2);

      // Confirm lock was cleanly released
      const lingeringLock = await NoteSubscriptionLock.findById(userB._id);
      expect(lingeringLock).toBeNull();
    });

    test('pre-write fencing check prevents stale worker from committing changes if lease expires during execution', async () => {
      const orderIdFencing = 'order_fencing_test';
      const paymentIdFencing = 'pay_fencing_test';

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdFencing,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdFencing}|${paymentIdFencing}`)
        .digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentIdFencing) {
          // While the worker is fetching payment, simulate its lease expiring
          // and another worker updating NoteSubscriptionLock with a different lockToken
          await NoteSubscriptionLock.findOneAndUpdate(
            { _id: userA._id },
            {
              $set: {
                lockToken: 'preempting_worker_token',
                lockedAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + 5000)
              }
            }
          );
          return { id: paymentIdFencing, order_id: orderIdFencing, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      // Execute verify-order: worker should detect fencing violation at pre-write check
      const res = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderIdFencing,
          razorpay_payment_id: paymentIdFencing,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      // Verify that the stale worker was aborted with 409
      expect(res.status).toBe(409);
      expect(res.data.error).toMatch(/Subscription renewal lease expired before activation could complete/i);

      // Confirm that no subscription was created by the stale worker
      const createdSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentIdFencing });
      expect(createdSub).toBeNull();

      // Clean up preempting lock so subsequent retry succeeds
      await NoteSubscriptionLock.deleteOne({ _id: userA._id });

      // Client retries renewal: should now acquire fresh lease and succeed cleanly
      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentIdFencing,
        order_id: orderIdFencing,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      const retryRes = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderIdFencing,
          razorpay_payment_id: paymentIdFencing,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(retryRes.status).toBe(200);
      expect(retryRes.data.success).toBe(true);

      const verifiedSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentIdFencing });
      expect(verifiedSub).toBeTruthy();
    });

    test('storage engine unique constraint physically rejects duplicate active expiresAt for same user (E11000)', async () => {
      const fixedExpiry = new Date(Date.now() + 25 * 86400000);

      // Insert first active subscription for userA with fixedExpiry
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: fixedExpiry,
        razorpayOrderId: 'order_constraint_1',
        razorpayPaymentId: 'pay_constraint_1',
        razorpaySignature: 'sig_constraint_1'
      });

      // Attempting to insert a second active subscription for userA with the SAME expiresAt MUST reject with E11000
      let duplicateError = null;
      try {
        await NoteSubscription.create({
          userId: userA._id,
          planType: 'monthly',
          amountPaid: 49,
          currency: 'INR',
          status: 'active',
          startDate: new Date(),
          expiresAt: fixedExpiry,
          razorpayOrderId: 'order_constraint_2',
          razorpayPaymentId: 'pay_constraint_2',
          razorpaySignature: 'sig_constraint_2'
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeTruthy();
      expect(duplicateError.code).toBe(11000);

      // Verify that an expired subscription for userA with the same expiresAt is allowed due to partialFilterExpression
      const expiredSub = await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'expired',
        startDate: new Date(Date.now() - 40 * 86400000),
        expiresAt: fixedExpiry,
        razorpayOrderId: 'order_constraint_expired',
        razorpayPaymentId: 'pay_constraint_expired',
        razorpaySignature: 'sig_constraint_expired'
      });
      expect(expiredSub).toBeTruthy();
      expect(expiredSub.status).toBe('expired');

      // Verify that another user (userB) can hold an active subscription with the same expiresAt
      const userBSub = await NoteSubscription.create({
        userId: userB._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: fixedExpiry,
        razorpayOrderId: 'order_constraint_user_b',
        razorpayPaymentId: 'pay_constraint_user_b',
        razorpaySignature: 'sig_constraint_user_b'
      });
      expect(userBSub).toBeTruthy();
    });

    test('exact race window: worker whose lease expires immediately after validity check re-stacks renewal consecutively onto newly committed active subscription via database constraint', async () => {
      // User A starts with an initial active subscription expiring at T0
      const t0 = new Date(Date.now() + 15 * 86400000);
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: t0,
        razorpayOrderId: 'order_rw_initial',
        razorpayPaymentId: 'pay_rw_initial',
        razorpaySignature: 'sig_rw_initial'
      });

      const orderId1 = 'order_rw_worker1';
      const paymentId1 = 'pay_rw_worker1';
      const orderId2 = 'order_rw_worker2';
      const paymentId2 = 'pay_rw_worker2';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId1,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderId2,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId1}|${paymentId1}`).digest('hex');
      const sig2 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId2}|${paymentId2}`).digest('hex');
      const t1 = addOneCalendarMonth(t0);

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentId1) {
          return { id: paymentId1, order_id: orderId1, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      // Hook NoteSubscriptionTimeline.findById:
      // In attempt 0, Worker 1 reads T0 from timeline. Immediately after Worker 1 reads T0,
      // Worker 2 atomically commits T1 to NoteSubscriptionTimeline and creates its NoteSubscription record.
      // Worker 1 proceeds to CAS with T0, which fails atomically because activeExpiresAt is now T1!
      // Worker 1 logs CAS conflict, re-queries timeline in attempt 1, receives T1, and re-stacks to T2!
      const origFindById = NoteSubscriptionTimeline.findById.bind(NoteSubscriptionTimeline);
      let casConflictTriggered = false;

      const findByIdSpy = jest.spyOn(NoteSubscriptionTimeline, 'findById').mockImplementation(async function(...args) {
        const doc = await origFindById(...args);
        if (!casConflictTriggered) {
          casConflictTriggered = true;
          // Competing worker commits T1 to the timeline and database
          await NoteSubscriptionTimeline.findOneAndUpdate(
            { _id: userA._id },
            {
              $set: {
                activeExpiresAt: t1,
                lastPaymentId: paymentId2,
                lastAllocatedExpiresAt: t1
              },
              $inc: { sequenceNumber: 1 }
            },
            { upsert: true }
          );
          await NoteSubscription.create({
            userId: userA._id,
            planType: 'monthly',
            amountPaid: 49,
            currency: 'INR',
            status: 'active',
            startDate: new Date(),
            expiresAt: t1,
            subscriptionIndex: 1,
            razorpayOrderId: orderId2,
            razorpayPaymentId: paymentId2,
            razorpaySignature: sig2
          });
          await SubscriptionOrder.findOneAndUpdate({ razorpayOrderId: orderId2 }, { status: 'paid' });
        }
        return doc;
      });

      try {
        const res1 = await client.post(
          '/subscriptions/verify-order',
          {
            razorpay_order_id: orderId1,
            razorpay_payment_id: paymentId1,
            razorpay_signature: sig1
          },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        );

        expect(res1.status).toBe(200);
        expect(res1.data.success).toBe(true);
        expect(casConflictTriggered).toBe(true);

        // Verify that all active subscriptions for user A are stacked consecutively: T0 -> T1 -> T2
        const userASubs = await NoteSubscription.find({ userId: userA._id, status: 'active' }).sort({ expiresAt: 1 });
        expect(userASubs.length).toBe(3);

        const t2 = addOneCalendarMonth(t1);
        expect(new Date(userASubs[0].expiresAt).toISOString()).toBe(t0.toISOString());
        expect(new Date(userASubs[1].expiresAt).toISOString()).toBe(t1.toISOString());
        expect(new Date(userASubs[2].expiresAt).toISOString()).toBe(t2.toISOString());

        // Verify order 1 was fulfilled
        const order1Doc = await SubscriptionOrder.findOne({ razorpayOrderId: orderId1 });
        expect(order1Doc.status).toBe('paid');
      } finally {
        findByIdSpy.mockRestore();
      }

    });

    test('recovery path handles crash after subscription creation but before order is marked paid without granting access twice or losing renewal', async () => {
      const orderIdCrash = 'order_crash_unmarked_paid';
      const paymentIdCrash = 'pay_crash_unmarked_paid';
      const crashExpiresAt = new Date(Date.now() + 30 * 86400000);

      // Create order in 'created' state
      const subOrder = await SubscriptionOrder.create({
        razorpayOrderId: orderIdCrash,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      // Simulate process crash: NoteSubscription was committed to database, but node process crashed before subOrder.save()
      const initialSub = await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: crashExpiresAt,
        razorpayOrderId: orderIdCrash,
        razorpayPaymentId: paymentIdCrash,
        razorpaySignature: 'sig_crash_test_valid'
      });

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdCrash}|${paymentIdCrash}`)
        .digest('hex');

      // Verify initial pre-retry state: exactly 1 subscription, order status is 'created'
      expect(await NoteSubscription.countDocuments({ razorpayPaymentId: paymentIdCrash })).toBe(1);
      expect((await SubscriptionOrder.findById(subOrder._id)).status).toBe('created');

      // Client retries verification after process recovery
      const retryRes1 = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderIdCrash,
          razorpay_payment_id: paymentIdCrash,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(retryRes1.status).toBe(200);
      expect(retryRes1.data.success).toBe(true);
      expect(retryRes1.data.duplicate).toBe(true);
      expect(retryRes1.data.subscription._id.toString()).toBe(initialSub._id.toString());

      // 1. Order status is now marked 'paid'
      const refreshedOrder = await SubscriptionOrder.findById(subOrder._id);
      expect(refreshedOrder.status).toBe('paid');

      // 2. Exactly 1 subscription exists in database (cannot grant access twice)
      const subDocsAfterRetry1 = await NoteSubscription.find({ razorpayPaymentId: paymentIdCrash });
      expect(subDocsAfterRetry1.length).toBe(1);
      expect(subDocsAfterRetry1[0]._id.toString()).toBe(initialSub._id.toString());
      expect(new Date(subDocsAfterRetry1[0].expiresAt).toISOString()).toBe(crashExpiresAt.toISOString());

      // 3. Paid renewal was not lost: subscriber still has active access
      const userStatusRes = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      expect(userStatusRes.status).toBe(200);
      expect(userStatusRes.data.hasActiveSubscription).toBe(true);
      expect(new Date(userStatusRes.data.subscription.expiresAt).toISOString()).toBe(crashExpiresAt.toISOString());

      // 4. Client retries a 2nd time: perfectly idempotent
      const retryRes2 = await client.post(
        '/subscriptions/verify-order',
        {
          razorpay_order_id: orderIdCrash,
          razorpay_payment_id: paymentIdCrash,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(retryRes2.status).toBe(200);
      expect(retryRes2.data.duplicate).toBe(true);
      expect(await NoteSubscription.countDocuments({ razorpayPaymentId: paymentIdCrash })).toBe(1);
    });

    test('two concurrent first-time subscriptions with different timestamps safely stack consecutive calendar months via atomic CAS timeline', async () => {
      // User with NO active subscription receives two simultaneous first-time subscription payments
      const orderId1 = 'order_first_time_1';
      const paymentId1 = 'pay_first_time_1';
      const orderId2 = 'order_first_time_2';
      const paymentId2 = 'pay_first_time_2';

      await SubscriptionOrder.create({
        razorpayOrderId: orderId1,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderId2,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId1}|${paymentId1}`).digest('hex');
      const sig2 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId2}|${paymentId2}`).digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentId1) {
          // Worker 1 delay to simulate offset timestamps
          await new Promise((r) => setTimeout(r, 60));
          return { id: paymentId1, order_id: orderId1, status: 'captured', currency: 'INR', amount: 4900 };
        }
        if (id === paymentId2) {
          return { id: paymentId2, order_id: orderId2, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      const [res1, res2] = await Promise.all([
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderId1, razorpay_payment_id: paymentId1, razorpay_signature: sig1 },
          { headers: { Authorization: `Bearer ${tokenB}` } }
        ),
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderId2, razorpay_payment_id: paymentId2, razorpay_signature: sig2 },
          { headers: { Authorization: `Bearer ${tokenB}` } }
        )
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify that NoteSubscription records stack consecutively without overlapping
      const allUserBSubs = await NoteSubscription.find({ userId: userB._id, status: 'active' }).sort({ expiresAt: 1 });
      expect(allUserBSubs.length).toBe(2);

      const sub1Exp = new Date(allUserBSubs[0].expiresAt);
      const sub2Exp = new Date(allUserBSubs[1].expiresAt);

      // Sub 2 must expire exactly one calendar month after Sub 1
      const expectedSub2Exp = addOneCalendarMonth(sub1Exp);
      expect(sub2Exp.toISOString()).toBe(expectedSub2Exp.toISOString());

      // Sequence numbers must be 1 and 2
      expect(allUserBSubs[0].subscriptionIndex).toBe(1);
      expect(allUserBSubs[1].subscriptionIndex).toBe(2);
    });

    test('stale worker resuming after another worker acquires lease is fenced out by CAS and cleanly recovers without corrupting active window', async () => {
      // User A starts with no active subscription
      const orderIdStale = 'order_stale_fencing';
      const paymentIdStale = 'pay_stale_fencing';

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdStale,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sigStale = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderIdStale}|${paymentIdStale}`).digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === paymentIdStale) {
          // While the worker is fetching payment, another worker acquires the lock and advances the timeline
          await NoteSubscriptionLock.findOneAndUpdate(
            { _id: userA._id },
            {
              $set: {
                lockToken: 'newer_competing_token',
                lockedAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + 10000)
              }
            },
            { upsert: true }
          );

          // Competing worker commits month 1
          await NoteSubscriptionTimeline.findOneAndUpdate(
            { _id: userA._id },
            {
              $set: {
                activeExpiresAt: addOneCalendarMonth(new Date()),
                lastPaymentId: 'competing_worker_pay',
                lastAllocatedExpiresAt: addOneCalendarMonth(new Date())
              },
              $inc: { sequenceNumber: 1 }
            },
            { upsert: true }
          );

          return { id: paymentIdStale, order_id: orderIdStale, status: 'captured', currency: 'INR', amount: 4900 };
        }
        throw new Error('Unknown payment ID in mock');
      });

      const staleRes = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: orderIdStale, razorpay_payment_id: paymentIdStale, razorpay_signature: sigStale },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      // Stale worker was fenced out because lockToken was stolen
      expect(staleRes.status).toBe(409);
      expect(staleRes.data.error).toMatch(/lease expired/i);

      // Verify no dangling subscription was created with stale timestamp
      const staleSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentIdStale });
      expect(staleSub).toBeNull();

      // Clean up competing lock so subsequent retry succeeds
      await NoteSubscriptionLock.deleteOne({ _id: userA._id });

      // When the user/client retries, it successfully stacks onto the newly advanced timeline
      mockPaymentsFetch.mockResolvedValueOnce({
        id: paymentIdStale,
        order_id: orderIdStale,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      const retryRes = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: orderIdStale, razorpay_payment_id: paymentIdStale, razorpay_signature: sigStale },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(retryRes.status).toBe(200);
      expect(retryRes.data.success).toBe(true);

      const recoveredSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentIdStale });
      expect(recoveredSub).toBeTruthy();
      expect(recoveredSub.subscriptionIndex).toBe(2);
    });

    test('retry exhaustion on persistent constraint conflict returns safe 409 error without losing payment record', async () => {
      const orderIdExhaust = 'order_exhaust_test';
      const paymentIdExhaust = 'pay_exhaust_test';

      await SubscriptionOrder.create({
        razorpayOrderId: orderIdExhaust,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sigExhaust = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderIdExhaust}|${paymentIdExhaust}`).digest('hex');

      mockPaymentsFetch.mockResolvedValue({
        id: paymentIdExhaust,
        order_id: orderIdExhaust,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      // Mock NoteSubscriptionTimeline.findOneAndUpdate to persistently simulate CAS conflict (exhaustion)
      const origFindOneAndUpdate = NoteSubscriptionTimeline.findOneAndUpdate.bind(NoteSubscriptionTimeline);
      const casSpy = jest.spyOn(NoteSubscriptionTimeline, 'findOneAndUpdate').mockResolvedValue(null);

      try {
        const res = await client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: orderIdExhaust, razorpay_payment_id: paymentIdExhaust, razorpay_signature: sigExhaust },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        );

        expect(res.status).toBe(409);
        expect(res.data.error).toMatch(/Subscription timeline conflict during renewal/i);

        // Confirm order was not marked paid erroneously
        const orderDoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderIdExhaust });
        expect(orderDoc.status).toBe('created');
      } finally {
        casSpy.mockRestore();
      }

      // Next retry after transient conflict resolves succeeds cleanly
      const retryRes = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: orderIdExhaust, razorpay_payment_id: paymentIdExhaust, razorpay_signature: sigExhaust },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );

      expect(retryRes.status).toBe(200);
      expect(retryRes.data.success).toBe(true);
      const createdSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentIdExhaust });
      expect(createdSub).toBeTruthy();
    });

    test('scenario 1 & 4: Payment A crashes after reservation, Payment B commits renewal, Payment A retries and recovers its own allocation without overlap', async () => {
      // User A starts with no active subscriptions
      const orderA = 'order_interleave_A';
      const payA = 'pay_interleave_A';
      const orderB = 'order_interleave_B';
      const payB = 'pay_interleave_B';

      await SubscriptionOrder.create({
        razorpayOrderId: orderA,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await SubscriptionOrder.create({
        razorpayOrderId: orderB,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sigA = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderA}|${payA}`).digest('hex');
      const sigB = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderB}|${payB}`).digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === payA) return { id: payA, order_id: orderA, status: 'captured', currency: 'INR', amount: 4900 };
        if (id === payB) return { id: payB, order_id: orderB, status: 'captured', currency: 'INR', amount: 4900 };
        throw new Error('Unknown payment ID in mock');
      });

      // 1. Simulate Worker A allocating reservation for Payment A, but process crashes before NoteSubscription is created
      const now = new Date();
      const expA = addOneCalendarMonth(now);
      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userA._id },
        {
          $set: { activeExpiresAt: expA, sequenceNumber: 1 },
          $push: {
            reservations: {
              paymentId: payA,
              orderId: orderA,
              expiresAt: expA,
              sequenceNumber: 1,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      // Verify state: Payment A has reservation, but NO NoteSubscription document exists
      expect(await NoteSubscription.countDocuments({ razorpayPaymentId: payA })).toBe(0);

      // 2. Payment B arrives. It must use the timeline's reserved expiry (expA) as baseline and commit sequence 2
      const resB = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: orderB, razorpay_payment_id: payB, razorpay_signature: sigB },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      expect(resB.status).toBe(200);
      expect(resB.data.success).toBe(true);

      const subBDoc = await NoteSubscription.findOne({ razorpayPaymentId: payB });
      expect(subBDoc).toBeTruthy();
      expect(subBDoc.subscriptionIndex).toBe(2);
      const expectedExpB = addOneCalendarMonth(expA);
      expect(new Date(subBDoc.expiresAt).toISOString()).toBe(expectedExpB.toISOString());

      // 3. Worker A recovers and client retries Payment A
      const resA = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: sigA },
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      expect(resA.status).toBe(200);
      expect(resA.data.success).toBe(true);

      const subADoc = await NoteSubscription.findOne({ razorpayPaymentId: payA });
      expect(subADoc).toBeTruthy();
      expect(subADoc.subscriptionIndex).toBe(1);
      expect(new Date(subADoc.expiresAt).toISOString()).toBe(expA.toISOString());

      // 4. Verify orders and timeline are fully intact
      const orderADoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderA });
      const orderBDoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderB });
      expect(orderADoc.status).toBe('paid');
      expect(orderBDoc.status).toBe('paid');
      expect(orderADoc.subscriptionId.toString()).toBe(subADoc._id.toString());
      expect(orderBDoc.subscriptionId.toString()).toBe(subBDoc._id.toString());

      // Verify all subscriptions are stacked consecutively without duplicate or overlap
      const allSubs = await NoteSubscription.find({ userId: userA._id, status: 'active' }).sort({ expiresAt: 1 });
      expect(allSubs.length).toBe(2);
      expect(allSubs[0].subscriptionIndex).toBe(1);
      expect(allSubs[1].subscriptionIndex).toBe(2);
    });

    test('scenario 2: uncommitted timeline reservation is authoritatively used as renewal baseline date', async () => {
      // User B starts with an active subscription expiring at T0
      const t0 = new Date(Date.now() + 10 * 86400000);
      await NoteSubscription.create({
        userId: userB._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: t0,
        subscriptionIndex: 1,
        razorpayOrderId: 'order_base_0',
        razorpayPaymentId: 'pay_base_0',
        razorpaySignature: 'sig_base_0'
      });

      // An uncommitted reservation exists in the timeline extending access to T1 = T0 + 1 month
      const t1 = addOneCalendarMonth(t0);
      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userB._id },
        {
          $set: { activeExpiresAt: t1, sequenceNumber: 2 },
          $push: {
            reservations: {
              paymentId: 'pay_uncommitted_1',
              orderId: 'order_uncommitted_1',
              expiresAt: t1,
              sequenceNumber: 2,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      // Now a new renewal payment arrives (Payment 2)
      const order2 = 'order_renew_after_res';
      const pay2 = 'pay_renew_after_res';
      await SubscriptionOrder.create({
        razorpayOrderId: order2,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sig2 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order2}|${pay2}`).digest('hex');
      mockPaymentsFetch.mockResolvedValueOnce({
        id: pay2,
        order_id: order2,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      const res = await client.post(
        '/subscriptions/verify-order',
        { razorpay_order_id: order2, razorpay_payment_id: pay2, razorpay_signature: sig2 },
        { headers: { Authorization: `Bearer ${tokenB}` } }
      );
      expect(res.status).toBe(200);

      // Payment 2 must stack after T1 (the reserved expiry), NOT after T0 (the latest active subscription)
      const sub2 = await NoteSubscription.findOne({ razorpayPaymentId: pay2 });
      expect(sub2).toBeTruthy();
      const expectedT2 = addOneCalendarMonth(t1);
      expect(new Date(sub2.expiresAt).toISOString()).toBe(expectedT2.toISOString());
      expect(sub2.subscriptionIndex).toBe(3);
    });

    test('scenario 3: simultaneous initial upsert race is caught safely by E11000 and stacks consecutively', async () => {
      const order1 = 'order_race_up_1';
      const pay1 = 'pay_race_up_1';
      const order2 = 'order_race_up_2';
      const pay2 = 'pay_race_up_2';

      await SubscriptionOrder.create({
        razorpayOrderId: order1,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });
      await SubscriptionOrder.create({
        razorpayOrderId: order2,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order1}|${pay1}`).digest('hex');
      const sig2 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order2}|${pay2}`).digest('hex');

      mockPaymentsFetch.mockImplementation(async (id) => {
        if (id === pay1) return { id: pay1, order_id: order1, status: 'captured', currency: 'INR', amount: 4900 };
        if (id === pay2) return { id: pay2, order_id: order2, status: 'captured', currency: 'INR', amount: 4900 };
        throw new Error('Unknown payment');
      });

      const [res1, res2] = await Promise.all([
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: order1, razorpay_payment_id: pay1, razorpay_signature: sig1 },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        ),
        client.post(
          '/subscriptions/verify-order',
          { razorpay_order_id: order2, razorpay_payment_id: pay2, razorpay_signature: sig2 },
          { headers: { Authorization: `Bearer ${tokenA}` } }
        )
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const subs = await NoteSubscription.find({ userId: userA._id, status: 'active' }).sort({ expiresAt: 1 });
      expect(subs.length).toBe(2);
      expect(subs[0].subscriptionIndex).toBe(1);
      expect(subs[1].subscriptionIndex).toBe(2);
      expect(new Date(subs[1].expiresAt).toISOString()).toBe(addOneCalendarMonth(subs[0].expiresAt).toISOString());
    });

    test('scenario 5 & 6: abandoned reservation auto-reconciles on GET /api/subscriptions/my-status to restore active subscriber access', async () => {
      const orderAb = 'order_abandoned_recon';
      const payAb = 'pay_abandoned_recon';
      const expAb = new Date(Date.now() + 20 * 86400000);

      await SubscriptionOrder.create({
        razorpayOrderId: orderAb,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      // Timeline has a reserved allocation, but crash occurred before subscription creation
      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userB._id },
        {
          $set: { activeExpiresAt: expAb, sequenceNumber: 1 },
          $push: {
            reservations: {
              paymentId: payAb,
              orderId: orderAb,
              expiresAt: expAb,
              sequenceNumber: 1,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      // User has no active NoteSubscription document in DB
      expect(await NoteSubscription.countDocuments({ userId: userB._id })).toBe(0);

      // Mock live gateway confirmation
      mockPaymentsFetch.mockResolvedValueOnce({
        id: payAb,
        order_id: orderAb,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      // User calls GET /api/subscriptions/my-status
      const statusRes = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      expect(statusRes.status).toBe(200);
      expect(statusRes.data.hasActiveSubscription).toBe(true);
      expect(new Date(statusRes.data.subscription.expiresAt).toISOString()).toBe(expAb.toISOString());

      // Confirm self-healing created NoteSubscription and marked order as paid
      const autoSub = await NoteSubscription.findOne({ razorpayPaymentId: payAb });
      expect(autoSub).toBeTruthy();
      expect(autoSub.subscriptionIndex).toBe(1);

      const autoOrder = await SubscriptionOrder.findOne({ razorpayOrderId: orderAb });
      expect(autoOrder.status).toBe('paid');
      expect(autoOrder.subscriptionId.toString()).toBe(autoSub._id.toString());
    });

    test('auto-recovery in GET /api/subscriptions/my-status rejects recovery when live payment is not captured or amount mismatches', async () => {
      const orderFail = 'order_recon_gateway_fail';
      const payFail = 'pay_recon_gateway_fail';
      const expFail = new Date(Date.now() + 20 * 86400000);

      await SubscriptionOrder.create({
        razorpayOrderId: orderFail,
        userId: userB._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userB._id },
        {
          $set: { activeExpiresAt: expFail, sequenceNumber: 1 },
          $push: {
            reservations: {
              paymentId: payFail,
              orderId: orderFail,
              expiresAt: expFail,
              sequenceNumber: 1,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      // Mock gateway returning 'authorized' (not captured)
      mockPaymentsFetch.mockResolvedValueOnce({
        id: payFail,
        order_id: orderFail,
        status: 'authorized',
        currency: 'INR',
        amount: 4900
      });

      const res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      // Must NOT grant active subscription
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(false);

      // Must NOT create NoteSubscription in DB
      expect(await NoteSubscription.countDocuments({ razorpayPaymentId: payFail })).toBe(0);

      // Order must remain unfulfilled
      const orderDoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderFail });
      expect(orderDoc.status).toBe('created');
      expect(orderDoc.subscriptionId).toBeFalsy();
    });

    test('auto-recovery in GET /api/subscriptions/my-status rejects recovery when order belongs to a different user', async () => {
      const orderOwnerFail = 'order_recon_owner_fail';
      const payOwnerFail = 'pay_recon_owner_fail';
      const expOwnerFail = new Date(Date.now() + 20 * 86400000);

      // Order created by User A
      await SubscriptionOrder.create({
        razorpayOrderId: orderOwnerFail,
        userId: userA._id, // Belongs to User A!
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      // Injected/mismatched reservation on User B's timeline
      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userB._id },
        {
          $set: { activeExpiresAt: expOwnerFail, sequenceNumber: 1 },
          $push: {
            reservations: {
              paymentId: payOwnerFail,
              orderId: orderOwnerFail,
              expiresAt: expOwnerFail,
              sequenceNumber: 1,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      mockPaymentsFetch.mockResolvedValueOnce({
        id: payOwnerFail,
        order_id: orderOwnerFail,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      // User B attempts GET /api/subscriptions/my-status
      const res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      // Access denied
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(false);

      // No NoteSubscription created for either user
      expect(await NoteSubscription.countDocuments({ razorpayPaymentId: payOwnerFail })).toBe(0);

      // Order remains untouched
      const orderDoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderOwnerFail });
      expect(orderDoc.status).toBe('created');
    });

    test('duplicate concurrent recovery calls in GET /api/subscriptions/my-status cannot create a second subscription or duplicate order payment', async () => {
      const orderDup = 'order_recon_dup';
      const payDup = 'pay_recon_dup';
      const expDup = new Date(Date.now() + 25 * 86400000);

      await SubscriptionOrder.create({
        razorpayOrderId: orderDup,
        userId: userA._id,
        amountPaise: 4900,
        currency: 'INR',
        planType: 'monthly',
        status: 'created'
      });

      await NoteSubscriptionTimeline.findOneAndUpdate(
        { _id: userA._id },
        {
          $set: { activeExpiresAt: expDup, sequenceNumber: 1 },
          $push: {
            reservations: {
              paymentId: payDup,
              orderId: orderDup,
              expiresAt: expDup,
              sequenceNumber: 1,
              status: 'reserved'
            }
          }
        },
        { upsert: true }
      );

      mockPaymentsFetch.mockResolvedValue({
        id: payDup,
        order_id: orderDup,
        status: 'captured',
        currency: 'INR',
        amount: 4900
      });

      // Two concurrent GET /my-status calls racing to auto-recover
      const [res1, res2] = await Promise.all([
        client.get('/subscriptions/my-status', { headers: { Authorization: `Bearer ${tokenA}` } }),
        client.get('/subscriptions/my-status', { headers: { Authorization: `Bearer ${tokenA}` } })
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.data.hasActiveSubscription).toBe(true);
      expect(res2.data.hasActiveSubscription).toBe(true);

      // Storage engine unique constraint and atomic claim transition guarantee exactly 1 subscription
      const subs = await NoteSubscription.find({ razorpayPaymentId: payDup });
      expect(subs.length).toBe(1);

      // Exactly 1 order updated to paid
      const orderDoc = await SubscriptionOrder.findOne({ razorpayOrderId: orderDup });
      expect(orderDoc.status).toBe('paid');
      expect(orderDoc.subscriptionId.toString()).toBe(subs[0]._id.toString());
    });
  });

  // =========================================================================
  // 7. Calendar-Month Calculations & Month-End Clamp Determinism
  // =========================================================================
  describe('7. Calendar-Month Calculations & Deterministic Edge Cases', () => {
    test('January 31 to February 28 clamp in a non-leap year (2026)', () => {
      const jan31 = new Date('2026-01-31T14:25:36.789Z');
      const febResult = addOneCalendarMonth(jan31);

      expect(febResult.getUTCFullYear()).toBe(2026);
      expect(febResult.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(febResult.getUTCDate()).toBe(28); // Clamped to last day of Feb
      expect(febResult.getUTCHours()).toBe(14);
      expect(febResult.getUTCMinutes()).toBe(25);
      expect(febResult.getUTCSeconds()).toBe(36);
      expect(febResult.getUTCMilliseconds()).toBe(789);
    });

    test('January 31 to February 29 clamp in a leap year (2028)', () => {
      const jan31Leap = new Date('2028-01-31T09:12:33.456Z');
      const febLeapResult = addOneCalendarMonth(jan31Leap);

      expect(febLeapResult.getUTCFullYear()).toBe(2028);
      expect(febLeapResult.getUTCMonth()).toBe(1); // February
      expect(febLeapResult.getUTCDate()).toBe(29); // Clamped to Feb 29 in leap year
      expect(febLeapResult.getUTCHours()).toBe(9);
      expect(febLeapResult.getUTCMinutes()).toBe(12);
      expect(febLeapResult.getUTCSeconds()).toBe(33);
      expect(febLeapResult.getUTCMilliseconds()).toBe(456);
    });

    test('Normal mid-month date retains same calendar day and time', () => {
      const midMonth = new Date('2026-03-15T18:40:00.123Z');
      const nextMonth = addOneCalendarMonth(midMonth);

      expect(nextMonth.getUTCFullYear()).toBe(2026);
      expect(nextMonth.getUTCMonth()).toBe(3); // April
      expect(nextMonth.getUTCDate()).toBe(15);
      expect(nextMonth.getUTCHours()).toBe(18);
      expect(nextMonth.getUTCMinutes()).toBe(40);
      expect(nextMonth.getUTCSeconds()).toBe(0);
      expect(nextMonth.getUTCMilliseconds()).toBe(123);
    });

    test('December 31 transitions across year boundary to January 31', () => {
      const dec31 = new Date('2026-12-31T23:59:59.999Z');
      const janNext = addOneCalendarMonth(dec31);

      expect(janNext.getUTCFullYear()).toBe(2027);
      expect(janNext.getUTCMonth()).toBe(0); // January
      expect(janNext.getUTCDate()).toBe(31);
      expect(janNext.getUTCHours()).toBe(23);
      expect(janNext.getUTCMinutes()).toBe(59);
      expect(janNext.getUTCSeconds()).toBe(59);
      expect(janNext.getUTCMilliseconds()).toBe(999);
    });

    test('March 31 clamps to April 30', () => {
      const mar31 = new Date('2026-03-31T12:00:00.000Z');
      const aprResult = addOneCalendarMonth(mar31);

      expect(aprResult.toISOString()).toBe('2026-04-30T12:00:00.000Z');
    });

    test('August 31 clamps to September 30', () => {
      const aug31 = new Date('2026-08-31T05:30:15.500Z');
      const sepResult = addOneCalendarMonth(aug31);

      expect(sepResult.toISOString()).toBe('2026-09-30T05:30:15.500Z');
    });

    test('October 31 clamps to November 30', () => {
      const oct31 = new Date('2026-10-31T22:15:00.000Z');
      const novResult = addOneCalendarMonth(oct31);

      expect(novResult.toISOString()).toBe('2026-11-30T22:15:00.000Z');
    });
  });

  // =========================================================================
  // 8. Expiry Enforcement in Status and Protected Streaming
  // =========================================================================
  describe('8. Expiry Enforcement in Status and Protected Document Streaming', () => {
    test('GET /api/subscriptions/my-status reflects active vs expired states accurately', async () => {
      // 1. Unsubscribed user
      let res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(false);
      expect(res.data.subscription).toBeNull();

      // 2. Expired subscription (expiresAt < now)
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(Date.now() - 60 * 86400000),
        expiresAt: new Date(Date.now() - 1000),
        razorpayOrderId: 'order_exp_1',
        razorpayPaymentId: 'pay_exp_1',
        razorpaySignature: 'sig_exp_1'
      });

      res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(false);
      expect(res.data.subscription).toBeNull();
      expect(res.data.lastSubscription).toBeTruthy();

      // 3. Active unexpired subscription
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 15 * 86400000),
        razorpayOrderId: 'order_act_1',
        razorpayPaymentId: 'pay_act_1',
        razorpaySignature: 'sig_act_1'
      });

      res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(true);
      expect(res.data.subscription).toBeTruthy();
      expect(res.data.subscription.daysRemaining).toBeGreaterThanOrEqual(14);
    });

    test('subscription expiring exactly at current server time is considered expired (not active)', async () => {
      const now = new Date();
      await NoteSubscription.create({
        userId: userB._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(Date.now() - 30 * 86400000),
        expiresAt: now, // Exactly now
        razorpayOrderId: 'order_exact_now',
        razorpayPaymentId: 'pay_exact_now',
        razorpaySignature: 'sig_exact_now'
      });

      const res = await client.get('/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.hasActiveSubscription).toBe(false);
      expect(res.data.subscription).toBeNull();
    });

    test('GET /api/notes/:id/stream rejects expired subscriptions with 403 SUBSCRIPTION_REQUIRED', async () => {
      const note = await Note.create({
        title: 'Mathematics Study Guide',
        subject: 'Mathematics',
        classLevel: '10',
        category: 'Study Notes',
        totalPages: 24,
        fileSize: 1024000,
        pdfUrl: tempPdfKey,
        isPublished: true,
        createdBy: adminUser._id
      });

      // User B subscription expired 5 days ago
      await NoteSubscription.create({
        userId: userB._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(Date.now() - 40 * 86400000),
        expiresAt: new Date(Date.now() - 5 * 86400000),
        razorpayOrderId: 'order_exp_b_stream',
        razorpayPaymentId: 'pay_exp_b_stream',
        razorpaySignature: 'sig_exp_b'
      });

      const res = await client.get(`/notes/${note._id}/stream`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      expect(res.status).toBe(403);
      expect(res.data.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.data.error).toMatch(/subscription is required/i);
    });

    test('GET /api/notes/:id/stream allows active subscriber to stream protected document', async () => {
      const note = await Note.create({
        title: 'Science Complete Notes',
        subject: 'Science',
        classLevel: '10',
        category: 'Study Notes',
        totalPages: 10,
        fileSize: 512000,
        pdfUrl: tempPdfKey,
        isPublished: true,
        createdBy: adminUser._id
      });

      // User A has active unexpired subscription
      await NoteSubscription.create({
        userId: userA._id,
        planType: 'monthly',
        amountPaid: 49,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 20 * 86400000),
        razorpayOrderId: 'order_active_stream',
        razorpayPaymentId: 'pay_active_stream',
        razorpaySignature: 'sig_active_stream'
      });

      const res = await client.get(`/notes/${note._id}/stream`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    test('GET /api/notes/:id/stream allows admin preview without active subscription', async () => {
      const note = await Note.create({
        title: 'Draft Admin Study Notes',
        subject: 'Social Science',
        classLevel: '10',
        category: 'Study Notes',
        totalPages: 5,
        fileSize: 256000,
        pdfUrl: tempPdfKey,
        isPublished: true,
        createdBy: adminUser._id
      });

      // Admin user has NO NoteSubscription record
      const res = await client.get(`/notes/${note._id}/stream`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });
  });

});
