/** @jest-environment node */
// tests/subscriptionPaymentRecovery.test.js
// Verification of subscription payment payload fix, Razorpay webhook, and admin reconcile

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

// Mock Razorpay SDK before loading routes
const mockRazorpayOrdersCreate = jest.fn();
const mockRazorpayOrdersFetchPayments = jest.fn();
const mockRazorpayPaymentsFetch = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: mockRazorpayOrdersCreate,
      fetchPayments: mockRazorpayOrdersFetchPayments
    },
    payments: {
      fetch: mockRazorpayPaymentsFetch
    }
  }));
});

let mongoServer;
let server;
let client;
let User;
let NoteSubscription;
let SubscriptionOrder;
let NoteSubscriptionTimeline;
let subscriptionsRouter;
let testAdminUser;
let testStudentUser;
let adminToken;
let studentToken;

const JWT_SECRET = 'test_jwt_secret_payment_recovery_2026';
const RAZORPAY_KEY_ID = 'rzp_test_payment_recovery_key';
const RAZORPAY_KEY_SECRET = 'rzp_test_payment_recovery_secret';
const RAZORPAY_WEBHOOK_SECRET = 'whsec_payment_recovery_secret_12345';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_ID = RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = RAZORPAY_WEBHOOK_SECRET;
  process.env.ENABLE_READ_NOTES = 'true';
  process.env.ENABLE_QUESTION_PAPERS = 'true';
  process.env.ENABLE_VIDEOS = 'true';
  process.env.ENABLE_OTHERS = 'true';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);

  User = require('../models/User');
  NoteSubscription = require('../models/NoteSubscription');
  SubscriptionOrder = require('../models/SubscriptionOrder');
  subscriptionsRouter = require('../routes/subscriptions');
  NoteSubscriptionTimeline = subscriptionsRouter._testHelpers.NoteSubscriptionTimeline;

  // Build Express app matching server.js webhook raw parsing + normal json parsing
  const app = express();

  // Raw body for subscriptions webhook before json parser
  app.post(
    "/api/subscriptions/webhook/razorpay",
    express.raw({ type: "application/json" }),
    (req, res, next) => {
      req.isSubscriptionWebhook = true;
      next();
    }
  );

  app.use(express.json());
  app.use('/api/subscriptions', subscriptionsRouter);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}`,
        validateStatus: () => true
      });
      resolve();
    });
  });

  // Seed test users
  testAdminUser = await User.create({
    name: 'Admin Tester',
    email: 'admin.recovery@test.com',
    password: 'Password123!',
    role: 'admin',
    isEmailVerified: true
  });

  testStudentUser = await User.create({
    name: 'Student Tester',
    email: 'student.recovery@test.com',
    password: 'Password123!',
    role: 'user',
    isEmailVerified: true
  });

  adminToken = jwt.sign(
    { id: testAdminUser._id.toString(), email: testAdminUser.email, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  studentToken = jwt.sign(
    { id: testStudentUser._id.toString(), email: testStudentUser.email, role: 'user' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  await NoteSubscription.deleteMany({});
  await SubscriptionOrder.deleteMany({});
  if (NoteSubscriptionTimeline) {
    await NoteSubscriptionTimeline.deleteMany({});
  }
});

// Helper for generating valid Razorpay checkout signature
function generateCheckoutSignature(orderId, paymentId, secret = RAZORPAY_KEY_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

// Helper for generating valid Razorpay webhook signature
function generateWebhookSignature(rawBody, secret = RAZORPAY_WEBHOOK_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}

describe('1. Static Analysis: notes.html subscription flow', () => {
  const notesHtmlPath = path.resolve(__dirname, '../public/notes.html');
  const content = fs.readFileSync(notesHtmlPath, 'utf8');

  it('notes.html sends required verification fields in fetch payload', () => {
    // Must send both snake_case and camelCase
    expect(content).toContain('razorpay_order_id: response.razorpay_order_id');
    expect(content).toContain('razorpay_payment_id: response.razorpay_payment_id');
    expect(content).toContain('razorpay_signature: response.razorpay_signature');
    expect(content).toContain('razorpayOrderId: response.razorpay_order_id');
    expect(content).toContain('razorpayPaymentId: response.razorpay_payment_id');
    expect(content).toContain('razorpaySignature: response.razorpay_signature');
  });

  it('notes.html contains no raw alert() calls', () => {
    const alertMatches = content.match(/alert\s*\(/g);
    expect(alertMatches).toBeNull();
  });

  it('notes.html implements 5-state paymentResultModal', () => {
    expect(content).toContain('id="paymentResultModal"');
    expect(content).toContain('showPaymentModal');
    expect(content).toContain('verifying');
    expect(content).toContain('success');
    expect(content).toContain('failed');
    expect(content).toContain('cancelled');
    expect(content).toContain('pending');
  });
});

describe('2. POST /api/subscriptions/verify-order verification & aliases', () => {
  it('accepts snake_case fields with valid HMAC signature and activates subscription', async () => {
    const orderId = 'order_snake_case_test_01';
    const paymentId = 'pay_snake_case_test_01';
    const signature = generateCheckoutSignature(orderId, paymentId);

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes 30-Day Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      currency: 'INR',
      amount: 9900,
      method: 'upi'
    });

    const res = await client.post(
      '/api/subscriptions/verify-order',
      {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        section: 'notes'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.subscription).toBeDefined();

    // Verify DB
    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeTruthy();
    expect(sub.userId.toString()).toBe(testStudentUser._id.toString());
    expect(sub.section).toBe('notes');
    expect(sub.status).toBe('active');

    const updatedOrder = await SubscriptionOrder.findOne({ razorpayOrderId: orderId });
    expect(updatedOrder.status).toBe('paid');
    expect(updatedOrder.razorpayPaymentId).toBe(paymentId);
  });

  it('accepts camelCase fields (razorpayOrderId, etc.) with valid HMAC signature and activates', async () => {
    const orderId = 'order_camel_case_test_02';
    const paymentId = 'pay_camel_case_test_02';
    const signature = generateCheckoutSignature(orderId, paymentId);

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'question_papers',
      planName: 'QP 30-Day Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      currency: 'INR',
      amount: 9900,
      method: 'card'
    });

    const res = await client.post(
      '/api/subscriptions/verify-order',
      {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        section: 'question_papers'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeTruthy();
    expect(sub.section).toBe('question_papers');
  });

  it('rejects verification with invalid HMAC signature with 400', async () => {
    const orderId = 'order_bad_sig_test_03';
    const paymentId = 'pay_bad_sig_test_03';
    const invalidSignature = 'invalid_tampered_signature_hex';

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    const res = await client.post(
      '/api/subscriptions/verify-order',
      {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: invalidSignature,
        section: 'notes'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/signature/i);

    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeNull();
  });

  it('is idempotent on verify-order replay (returns 200 duplicate: true)', async () => {
    const orderId = 'order_replay_test_04';
    const paymentId = 'pay_replay_test_04';
    const signature = generateCheckoutSignature(orderId, paymentId);

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'videos',
      planName: 'Videos Pass',
      amountPaise: 19900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      currency: 'INR',
      amount: 19900,
      method: 'netbanking'
    });

    const res1 = await client.post(
      '/api/subscriptions/verify-order',
      {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        section: 'videos'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(res1.status).toBe(200);

    // Replay
    const res2 = await client.post(
      '/api/subscriptions/verify-order',
      {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        section: 'videos'
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(res2.status).toBe(200);
    expect(res2.data.duplicate).toBe(true);

    const count = await NoteSubscription.countDocuments({ razorpayPaymentId: paymentId });
    expect(count).toBe(1);
  });
});

describe('3. POST /api/subscriptions/webhook/razorpay webhook processing', () => {
  it('activates subscription on payment.captured webhook event with raw HMAC validation', async () => {
    const orderId = 'order_webhook_captured_05';
    const paymentId = 'pay_webhook_captured_05';

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'others',
      planName: 'Others Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 9900,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            created_at: Math.floor(Date.now() / 1000)
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody);

    const res = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json'
        }
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.received).toBe(true);
    expect(res.data.activated).toBe(true);

    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeTruthy();
    expect(sub.section).toBe('others');
    expect(sub.status).toBe('active');
  });

  it('activates subscription on order.paid webhook event', async () => {
    const orderId = 'order_webhook_orderpaid_06';
    const paymentId = 'pay_webhook_orderpaid_06';

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    const payload = {
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: orderId,
            amount: 9900,
            currency: 'INR',
            status: 'paid'
          }
        },
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 9900,
            currency: 'INR',
            status: 'captured',
            method: 'card'
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody);

    const res = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json'
        }
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.activated).toBe(true);

    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeTruthy();
  });

  it('rejects webhook with missing or invalid signature with 400', async () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });

    // Missing signature
    const resNoSig = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      { headers: { 'content-type': 'application/json' } }
    );
    expect(resNoSig.status).toBe(400);

    // Invalid signature
    const resBadSig = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': 'bad_signature_hex',
          'content-type': 'application/json'
        }
      }
    );
    expect(resBadSig.status).toBe(400);
  });

  it('rejects webhook with amount mismatch without activating subscription', async () => {
    const orderId = 'order_amount_mismatch_07';
    const paymentId = 'pay_amount_mismatch_07';

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    // Webhook reports ₹50 (5000 paise) instead of ₹99 (9900 paise)
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 5000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody);

    const res = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json'
        }
      }
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/mismatch/i);

    const sub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(sub).toBeNull();
  });

  it('is idempotent on duplicate webhook events', async () => {
    const orderId = 'order_dup_webhook_08';
    const paymentId = 'pay_dup_webhook_08';

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'videos',
      planName: 'Videos Pass',
      amountPaise: 19900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 19900,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody);

    const res1 = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json'
        }
      }
    );
    expect(res1.status).toBe(200);

    const res2 = await client.post(
      '/api/subscriptions/webhook/razorpay',
      rawBody,
      {
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json'
        }
      }
    );
    expect(res2.status).toBe(200);
    expect(res2.data.duplicate).toBe(true);

    const count = await NoteSubscription.countDocuments({ razorpayPaymentId: paymentId });
    expect(count).toBe(1);
  });
});

describe('4. Admin orders list & reconcile endpoint', () => {
  it('GET /api/subscriptions/admin/orders returns paginated list for admin, 403 for user, 401 unauth', async () => {
    // Unauthenticated -> 401
    const resUnauth = await client.get('/api/subscriptions/admin/orders');
    expect(resUnauth.status).toBe(401);

    // Regular user -> 403
    const resForbidden = await client.get(
      '/api/subscriptions/admin/orders',
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(resForbidden.status).toBe(403);

    // Create 2 test orders
    await SubscriptionOrder.create([
      {
        userId: testStudentUser._id,
        section: 'notes',
        planName: 'Notes Pass',
        amountPaise: 9900,
        currency: 'INR',
        durationDays: 30,
        razorpayOrderId: 'order_admin_list_1',
        status: 'created'
      },
      {
        userId: testStudentUser._id,
        section: 'videos',
        planName: 'Videos Pass',
        amountPaise: 19900,
        currency: 'INR',
        durationDays: 30,
        razorpayOrderId: 'order_admin_list_2',
        status: 'paid'
      }
    ]);

    const resAdmin = await client.get(
      '/api/subscriptions/admin/orders',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.data.success).toBe(true);
    expect(resAdmin.data.orders.length).toBe(2);
    expect(resAdmin.data.pagination).toBeDefined();
    expect(resAdmin.data.pagination.totalOrders).toBe(2);
  });

  it('POST /api/subscriptions/admin/orders/:id/reconcile handles authentication, already-paid check, and live activation', async () => {
    // Create order that is already paid
    const paidSub = await NoteSubscription.create({
      userId: testStudentUser._id,
      section: 'notes',
      planType: 'standard',
      planName: 'Notes Pass',
      amountPaid: 99,
      amountPaise: 9900,
      currency: 'INR',
      razorpayOrderId: 'order_already_paid_10',
      razorpayPaymentId: 'pay_already_paid_10',
      razorpaySignature: 'sig_already_paid_10',
      status: 'active',
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000)
    });

    const alreadyPaidOrder = await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: 'order_already_paid_10',
      status: 'paid',
      subscriptionId: paidSub._id
    });

    // Non-admin -> 403
    const resForbidden = await client.post(
      `/api/subscriptions/admin/orders/${alreadyPaidOrder._id}/reconcile`,
      {},
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(resForbidden.status).toBe(403);

    // Admin reconcile on already-paid order -> 200 idempotent
    const resReconcile = await client.post(
      `/api/subscriptions/admin/orders/${alreadyPaidOrder._id}/reconcile`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(resReconcile.status).toBe(200);
    expect(resReconcile.data.reconciled).toBe(true);
    expect(resReconcile.data.message).toMatch(/already paid/i);

    // Test live activation via reconcile endpoint with mock Razorpay order payments
    const unpaidOrder = await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'videos',
      planName: 'Videos Pass',
      amountPaise: 19900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: 'order_unpaid_11',
      status: 'created'
    });

    mockRazorpayOrdersFetchPayments.mockResolvedValueOnce({
      items: [
        {
          id: 'pay_reconcile_captured_11',
          order_id: 'order_unpaid_11',
          status: 'captured',
          amount: 19900,
          currency: 'INR',
          method: 'upi',
          created_at: Math.floor(Date.now() / 1000)
        }
      ]
    });

    const reconcileLiveRes = await client.post(
      `/api/subscriptions/admin/orders/${unpaidOrder._id}/reconcile`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(reconcileLiveRes.status).toBe(200);
    expect(reconcileLiveRes.data.reconciled).toBe(true);
    expect(reconcileLiveRes.data.subscription).toBeDefined();

    const checkSub = await NoteSubscription.findOne({ razorpayPaymentId: 'pay_reconcile_captured_11' });
    expect(checkSub).toBeTruthy();
    expect(checkSub.section).toBe('videos');
    expect(checkSub.status).toBe('active');
  });
});

describe('5. Concurrency: verify-order and webhook racing', () => {
  it('concurrent verify-order and webhook result in exactly 1 subscription', async () => {
    const orderId = 'order_concurrent_race_12';
    const paymentId = 'pay_concurrent_race_12';
    const checkoutSig = generateCheckoutSignature(orderId, paymentId);

    await SubscriptionOrder.create({
      userId: testStudentUser._id,
      section: 'notes',
      planName: 'Notes 30-Day Pass',
      amountPaise: 9900,
      currency: 'INR',
      durationDays: 30,
      razorpayOrderId: orderId,
      status: 'created'
    });

    mockRazorpayPaymentsFetch.mockResolvedValue({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      currency: 'INR',
      amount: 9900,
      method: 'upi'
    });

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 9900,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };
    const rawWebhookBody = JSON.stringify(webhookPayload);
    const webhookSig = generateWebhookSignature(rawWebhookBody);

    // Fire both requests concurrently
    const [resCheckout, resWebhook] = await Promise.all([
      client.post(
        '/api/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: checkoutSig,
          section: 'notes'
        },
        { headers: { Authorization: `Bearer ${studentToken}` } }
      ),
      client.post(
        '/api/subscriptions/webhook/razorpay',
        rawWebhookBody,
        {
          headers: {
            'x-razorpay-signature': webhookSig,
            'content-type': 'application/json'
          }
        }
      )
    ]);

    expect(resCheckout.status).toBe(200);
    expect(resWebhook.status).toBe(200);

    // Exactly one active subscription must exist for this payment
    const subs = await NoteSubscription.find({ razorpayPaymentId: paymentId });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe('active');
  });
});
