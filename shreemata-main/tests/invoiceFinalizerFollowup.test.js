const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const axios = require('axios');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionTransaction = require('../models/CommissionTransaction');
const PointsTransaction = require('../models/PointsTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const { finalizePaidOrder } = require('../services/orderFinalizer');
const { 
  Invoice, 
  generateInvoiceNumber, 
  autoGenerateInvoiceForOrder, 
  autoGenerateProformaInvoiceForOrder 
} = require('../routes/invoices');
const emailService = require('../utils/emailService');
const { getSafeRedirectUrl } = require('../public/js/login');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;
let server;
let baseUrl;
let testUser;
let testAdmin;
let testBook;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_12345';
  process.env.PORT = '0';
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Setup Express App with routes for Webhook and Reconcile tests
  app = express();

  // Register raw body parser before express.json for webhook testing (mirrors server.js lines 40-50)
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    (req, res, next) => {
      req.isWebhook = true;
      next();
    }
  );
  app.use(express.json());

  // Mount payment and orders routes
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/orders', require('../routes/orders'));

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Seed baseline commission settings
  await CommissionSettings.create({
    directReferralBonus: 10,
    selfCashback: 5,
    treeCommissionPercentage: 20
  });

  // Seed sample users & book
  testAdmin = await User.create({
    name: 'Admin User',
    email: 'admin@test.com',
    password: 'password123',
    role: 'admin',
    isMember: true,
    treeLevel: 1
  });

  testUser = await User.create({
    name: 'Student Customer',
    email: 'student@test.com',
    password: 'password123',
    role: 'customer',
    wallet: 0,
    points: 0
  });

  testBook = await Book.create({
    title: 'Science Class 10',
    author: 'Shree Mata Editorial Team',
    class: 'Class 10',
    subject: 'Science',
    price: 350,
    basePrice: 200,
    profit: 150,
    rewardPoints: 20,
    stock: 50
  });
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('1. Idempotency & Commission Safety (Part A Item 3)', () => {
  test('calling finalizePaidOrder twice for the same order creates exactly ONE set of commissions, invoices, points, and emails', async () => {
    // Spy on emailService
    const emailSpy = jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue(true);
    const adminEmailSpy = jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue(true);

    const order = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'pending',
      paymentStatus: 'pending',
      paymentType: 'online',
      razorpay_order_id: 'order_test_idem_123',
      deliveryAddress: { address: '123 Main St', city: 'Hubli', pincode: '580020' }
    });

    const paymentInfo = {
      razorpay_payment_id: 'pay_test_idem_456',
      razorpay_order_id: 'order_test_idem_123'
    };

    // First call
    const result1 = await finalizePaidOrder(order._id, paymentInfo);
    expect(result1.success).toBe(true);
    expect(result1.alreadyProcessed).toBe(false);

    // Snapshot counts after call 1
    const invoiceCount1 = await Invoice.countDocuments({ orderId: order._id });
    const commTxCount1 = await CommissionTransaction.countDocuments({ orderId: order._id });
    const pointsCount1 = await PointsTransaction.countDocuments({ orderId: order._id });
    const emailCalls1 = emailSpy.mock.calls.length;

    expect(invoiceCount1).toBe(1);
    expect(pointsCount1).toBe(1);
    expect(emailCalls1).toBe(1);

    // Second call (repeated invocation / webhook retry)
    const result2 = await finalizePaidOrder(order._id, paymentInfo);
    expect(result2.success).toBe(true);
    expect(result2.alreadyProcessed).toBe(true);

    // Snapshot counts after call 2
    const invoiceCount2 = await Invoice.countDocuments({ orderId: order._id });
    const commTxCount2 = await CommissionTransaction.countDocuments({ orderId: order._id });
    const pointsCount2 = await PointsTransaction.countDocuments({ orderId: order._id });
    const emailCalls2 = emailSpy.mock.calls.length;

    // Numbers must remain byte-for-byte identical (no duplicates created)
    expect(invoiceCount2).toBe(invoiceCount1);
    expect(commTxCount2).toBe(commTxCount1);
    expect(pointsCount2).toBe(pointsCount1);
    expect(emailCalls2).toBe(emailCalls1);

    emailSpy.mockRestore();
    adminEmailSpy.mockRestore();
  });

  test('5 parallel calls to finalizePaidOrder on a 3-level referral chain produce exactly 1 run of wallet/points/email/invoice entries', async () => {
    const emailSpy = jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue(true);
    const adminEmailSpy = jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue(true);

    // Create 3-level referral hierarchy
    // Level 1: Root Referrer / Member
    const level1 = await User.create({
      name: 'Level 1 Root',
      email: 'level1_root@test.com',
      password: 'password123',
      role: 'customer',
      referralCode: 'REF_LVL1_123',
      wallet: 100,
      points: 0,
      isMember: true,
      treeLevel: 1
    });

    // Level 2: Direct Referrer of Buyer
    const level2 = await User.create({
      name: 'Level 2 Parent',
      email: 'level2_parent@test.com',
      password: 'password123',
      role: 'customer',
      referralCode: 'REF_LVL2_456',
      referredBy: 'REF_LVL1_123',
      wallet: 50,
      points: 0,
      isMember: true,
      treeParent: level1._id,
      treeLevel: 2
    });

    // Level 3: Buyer
    const level3Buyer = await User.create({
      name: 'Level 3 Buyer',
      email: 'level3_buyer@test.com',
      password: 'password123',
      role: 'customer',
      referredBy: 'REF_LVL2_456',
      wallet: 0,
      points: 0,
      isMember: false
    });

    const initialL1Wallet = level1.wallet;
    const initialL2Wallet = level2.wallet;
    const initialL3Wallet = level3Buyer.wallet;

    const order = await Order.create({
      user_id: level3Buyer._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'pending',
      paymentStatus: 'pending',
      paymentType: 'online',
      razorpay_order_id: 'order_parallel_5x_123',
      deliveryAddress: { address: '321 Pine St', city: 'Hubli', pincode: '580020' }
    });

    const paymentInfo = {
      razorpay_payment_id: 'pay_parallel_5x_999',
      razorpay_order_id: 'order_parallel_5x_123'
    };

    // Execute 5 simultaneous parallel calls to finalizePaidOrder
    const results = await Promise.all([
      finalizePaidOrder(order._id, paymentInfo),
      finalizePaidOrder(order._id, paymentInfo),
      finalizePaidOrder(order._id, paymentInfo),
      finalizePaidOrder(order._id, paymentInfo),
      finalizePaidOrder(order._id, paymentInfo)
    ]);

    // All 5 calls must report success: true
    expect(results).toHaveLength(5);
    results.forEach(res => {
      expect(res.success).toBe(true);
    });

    // Exactly 1 winner executed the side effects; the other 4 safely polled/acknowledged alreadyProcessed
    const winners = results.filter(r => r.alreadyProcessed === false);
    const alreadyProcessedResults = results.filter(r => r.alreadyProcessed === true);
    expect(winners).toHaveLength(1);
    expect(alreadyProcessedResults).toHaveLength(4);

    // Exactly 1 invoice, 1 commission tx, 1 points tx, 1 confirmation email
    const invoiceCount = await Invoice.countDocuments({ orderId: order._id });
    const commTxCount = await CommissionTransaction.countDocuments({ orderId: order._id });
    const pointsTxCount = await PointsTransaction.countDocuments({ orderId: order._id });
    const emailCalls = emailSpy.mock.calls.length;

    expect(invoiceCount).toBe(1);
    expect(commTxCount).toBe(1);
    expect(pointsTxCount).toBe(1);
    expect(emailCalls).toBe(1);

    // Wallets: assert exact single-run credits (no 5x commission duplication)
    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx).not.toBeNull();

    const freshL1 = await User.findById(level1._id);
    const freshL2 = await User.findById(level2._id);
    const freshL3 = await User.findById(level3Buyer._id);

    // Level 3 Buyer: only single cashback credited
    expect(freshL3.wallet).toBe(initialL3Wallet + commTx.directCommissionAmount);

    // Level 2 Referrer: only single referral bonus credited
    expect(freshL2.wallet).toBe(initialL2Wallet + commTx.referralCommissionAmount);

    emailSpy.mockRestore();
    adminEmailSpy.mockRestore();
  });

  test('simultaneous webhook and verify callbacks execute atomically without duplicate finalization', async () => {
    const emailSpy = jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue(true);
    const adminEmailSpy = jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue(true);

    const order = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'pending',
      paymentStatus: 'pending',
      paymentType: 'online',
      razorpay_order_id: 'order_race_webhook_verify_123',
      deliveryAddress: { address: '555 Race Ave', city: 'Hubli', pincode: '580020' }
    });

    const paymentInfo = {
      razorpay_payment_id: 'pay_race_wh_ver_789',
      razorpay_order_id: 'order_race_webhook_verify_123'
    };

    // Simulate webhook and verify arriving simultaneously
    const [resWebhook, resVerify] = await Promise.all([
      finalizePaidOrder(order._id, paymentInfo),
      finalizePaidOrder(order._id, paymentInfo)
    ]);

    expect(resWebhook.success).toBe(true);
    expect(resVerify.success).toBe(true);

    // Exactly one Tax Invoice created
    const invoiceCount = await Invoice.countDocuments({ orderId: order._id });
    expect(invoiceCount).toBe(1);

    // Exactly one Commission Transaction created
    const commTxCount = await CommissionTransaction.countDocuments({ orderId: order._id });
    expect(commTxCount).toBe(1);

    emailSpy.mockRestore();
    adminEmailSpy.mockRestore();
  });
});

describe('2. Legacy Orders (Part B Item 4)', () => {
  test('legacy completed order without confirmationEmailSent does not re-send emails or duplicate records', async () => {
    const emailSpy = jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue(true);
    const adminEmailSpy = jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue(true);

    // Legacy order created before this change: already completed and verified, confirmationEmailSent is missing/false
    const legacyOrder = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'completed',
      paymentStatus: 'completed',
      paymentDetails: {
        status: 'verified',
        razorpay_payment_id: 'pay_legacy_old_789'
      },
      commissionStatus: 'distributed',
      rewardApplied: false,
      confirmationEmailSent: false // Legacy order missing confirmationEmailSent
    });

    // Existing invoice already generated historically
    const legacyInvoice = await autoGenerateInvoiceForOrder(legacyOrder);
    expect(legacyInvoice).not.toBeNull();
    const invoiceCountBefore = await Invoice.countDocuments({ orderId: legacyOrder._id });
    expect(invoiceCountBefore).toBe(1);

    // Finalize legacy order
    const result = await finalizePaidOrder(legacyOrder._id);
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(true);

    // Email count must be 0 (no emails retroactively sent to customer or admin)
    expect(emailSpy.mock.calls.length).toBe(0);
    expect(adminEmailSpy.mock.calls.length).toBe(0);

    // Invoice count must remain exactly 1
    const invoiceCountAfter = await Invoice.countDocuments({ orderId: legacyOrder._id });
    expect(invoiceCountAfter).toBe(1);

    emailSpy.mockRestore();
    adminEmailSpy.mockRestore();
  });

  test('unpaid pending order with razorpay_order_id and rewardApplied: true is not treated as already processed and can be finalized by reconcile', async () => {
    // Simulate an order where rewardApplied was set during a pending manual flow or repair
    const pendingOrder = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'pending',
      paymentStatus: 'pending',
      paymentType: 'online',
      razorpay_order_id: 'order_unpaid_reward_set_456',
      rewardApplied: true // Erroneous flag on unfinalized order
    });

    const paymentInfo = {
      razorpay_payment_id: 'pay_reconcile_unpaid_reward_789',
      razorpay_order_id: 'order_unpaid_reward_set_456'
    };

    // Because finalizedAt is absent and no invoice exists, rewardApplied does NOT block finalization
    const result = await finalizePaidOrder(pendingOrder._id, paymentInfo);
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(false);

    const updated = await Order.findById(pendingOrder._id);
    expect(updated.status).toBe('completed');
    expect(updated.paymentStatus).toBe('completed');
    expect(updated.finalizedAt).toBeInstanceOf(Date);
    expect(updated.finalizationStatus).toBe('completed');

    const invoice = await Invoice.findOne({ orderId: pendingOrder._id });
    expect(invoice).not.toBeNull();
    expect(invoice.documentType).toBe('tax_invoice');
    expect(invoice.invoiceNumber).toMatch(/^SM-HBL-\d{10}$/);
  });
});

describe('3. login.js ?redirect= Sanitization (Part B Item 5)', () => {
  test('allows only same-site relative paths starting with a single "/"', () => {
    // Valid relative paths
    expect(getSafeRedirectUrl('/customer-invoice.html?id=123')).toBe('/customer-invoice.html?id=123');
    expect(getSafeRedirectUrl('/notes.html')).toBe('/notes.html');
    expect(getSafeRedirectUrl('/account.html?tab=orders')).toBe('/account.html?tab=orders');
    expect(getSafeRedirectUrl('/cart.html')).toBe('/cart.html');

    // Rejection of protocol-relative or external schemes
    expect(getSafeRedirectUrl('//evil.com')).toBeNull();
    expect(getSafeRedirectUrl('///evil.com')).toBeNull();
    expect(getSafeRedirectUrl('http://evil.com')).toBeNull();
    expect(getSafeRedirectUrl('https://evil.com')).toBeNull();
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeRedirectUrl('data:text/html,evil')).toBeNull();

    // Rejection of backslashes and evasion techniques
    expect(getSafeRedirectUrl('\\evil.com')).toBeNull();
    expect(getSafeRedirectUrl('/\\evil.com')).toBeNull();
    expect(getSafeRedirectUrl('/evil.com\\test')).toBeNull();

    // Rejection of encoded double-slashes or schemes
    expect(getSafeRedirectUrl('%2F%2Fevil.com')).toBeNull();
    expect(getSafeRedirectUrl('http:%2F%2Fevil.com')).toBeNull();
    expect(getSafeRedirectUrl('/%5cevil.com')).toBeNull();
    expect(getSafeRedirectUrl('%2f%2fevil.com')).toBeNull();

    // Empty / null inputs
    expect(getSafeRedirectUrl('')).toBeNull();
    expect(getSafeRedirectUrl(null)).toBeNull();
    expect(getSafeRedirectUrl(undefined)).toBeNull();
  });
});

describe('4. Invoice Sequence & Proforma Promotion (Part B Item 6)', () => {
  test('proforma numbers (SM-PRI-) do not increment tax invoice sequence (SM-HBL-)', async () => {
    const InvoiceSequence = mongoose.models.InvoiceSequence;

    // Generate Proforma number
    const proformaNum1 = await generateInvoiceNumber('proforma_invoice');
    expect(proformaNum1).toMatch(/^SM-PRI-\d{10}$/);

    // Tax sequence should not be initialized or affected
    const taxSeqDocBefore = await InvoiceSequence.findOne({ key: 'SM_HBL_GLOBAL' });
    const taxSeqBefore = taxSeqDocBefore ? taxSeqDocBefore.seq : 0;

    // Generate Tax Invoice number
    const taxNum1 = await generateInvoiceNumber('tax_invoice');
    expect(taxNum1).toMatch(/^SM-HBL-\d{10}$/);

    const taxSeqDocAfter = await InvoiceSequence.findOne({ key: 'SM_HBL_GLOBAL' });
    expect(taxSeqDocAfter.seq).toBe(taxSeqBefore + 1);

    // Second proforma does not affect tax sequence
    const proformaNum2 = await generateInvoiceNumber('proforma_invoice');
    expect(proformaNum2).toMatch(/^SM-PRI-\d{10}$/);

    const taxSeqDocFinal = await InvoiceSequence.findOne({ key: 'SM_HBL_GLOBAL' });
    expect(taxSeqDocFinal.seq).toBe(taxSeqDocAfter.seq); // Unchanged!
  });

  test('proforma promotion allocates tax number once; repeated call does not allocate another', async () => {
    const order = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      status: 'pending',
      paymentStatus: 'pending'
    });

    // 1. Generate proforma invoice for pending order
    const proformaInv = await autoGenerateProformaInvoiceForOrder(order);
    expect(proformaInv).not.toBeNull();
    expect(proformaInv.invoiceNumber).toMatch(/^SM-PRI-\d{10}$/);
    expect(proformaInv.documentType).toBe('proforma_invoice');

    // 2. Mark order verified and promote to Tax Invoice
    order.status = 'completed';
    order.paymentStatus = 'completed';
    order.paymentDetails = { status: 'verified', razorpay_payment_id: 'pay_promo_test_1' };
    await order.save();

    const promotedInv1 = await autoGenerateInvoiceForOrder(order);
    expect(promotedInv1).not.toBeNull();
    expect(promotedInv1.documentType).toBe('tax_invoice');
    expect(promotedInv1.invoiceNumber).toMatch(/^SM-HBL-\d{10}$/);
    const allocatedTaxNum = promotedInv1.invoiceNumber;

    // 3. Second call for the same order: returns identical invoice, no new number allocated
    const promotedInv2 = await autoGenerateInvoiceForOrder(order);
    expect(promotedInv2.invoiceNumber).toBe(allocatedTaxNum);
    expect(promotedInv2._id.toString()).toBe(promotedInv1._id.toString());
  });

  test('tax invoice sequence continues from existing counter (seeded at 500 -> next is 501, never 1)', async () => {
    const InvoiceSequence = mongoose.models.InvoiceSequence;

    // Seed sequence explicitly at 500
    await InvoiceSequence.findOneAndUpdate(
      { key: 'SM_HBL_GLOBAL' },
      { $set: { seq: 500 } },
      { upsert: true, new: true }
    );

    // Generating next invoice number MUST increment from 500 to 501, never resetting to 1
    const nextNumber1 = await generateInvoiceNumber('tax_invoice');
    expect(nextNumber1).toBe('SM-HBL-0000000501');

    // Generating another number increments to 502
    const nextNumber2 = await generateInvoiceNumber('tax_invoice');
    expect(nextNumber2).toBe('SM-HBL-0000000502');

    // Verify counter document in database
    const counterDoc = await InvoiceSequence.findOne({ key: 'SM_HBL_GLOBAL' });
    expect(counterDoc.seq).toBe(502);
  });
});

describe('5. Webhook Security & Raw Body (Part B Item 7)', () => {
  test('returns 500 when RAZORPAY_WEBHOOK_SECRET is unset and finalizes nothing', async () => {
    const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_unset_1', order_id: 'order_unset_1' } }
      }
    });

    const res = await axios.post(`${baseUrl}/api/payments/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'somesignature'
      },
      validateStatus: () => true
    });

    expect(res.status).toBe(500);
    expect(String(res.data)).toContain('Webhook secret not configured');

    if (originalSecret) process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  });

  test('returns 400 when signature is invalid and finalizes nothing', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'correct_test_secret_abc';

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_invalid_1', order_id: 'order_invalid_1' } }
      }
    });

    const res = await axios.post(`${baseUrl}/api/payments/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'completely_wrong_signature_hex'
      },
      validateStatus: () => true
    });

    expect(res.status).toBe(400);
    expect(String(res.data)).toContain('Invalid signature');
  });

  test('validates correct signature and processes order successfully', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'valid_test_secret_xyz';

    const order = await Order.create({
      user_id: testUser._id,
      items: [{
        id: testBook._id,
        type: 'book',
        title: testBook.title,
        price: 350,
        quantity: 1,
        profit: 150
      }],
      totalAmount: 350,
      orderProfitTotal: 150,
      status: 'pending',
      paymentStatus: 'pending',
      razorpay_order_id: 'order_wh_valid_999'
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_wh_valid_888', order_id: 'order_wh_valid_999' } }
      }
    });

    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(payload, 'utf8'))
      .digest('hex');

    const res = await axios.post(`${baseUrl}/api/payments/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      validateStatus: () => true
    });

    expect(res.status).toBe(200);

    // Verify order was finalized
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.status).toBe('completed');
    expect(updatedOrder.paymentStatus).toBe('completed');
  });
});

describe('6. Reconcile Endpoint Access Control (Part B Item 8)', () => {
  let customerToken;
  let adminToken;

  beforeAll(() => {
    customerToken = jwt.sign(
      { id: testUser._id.toString(), email: testUser.email, role: 'customer' },
      process.env.JWT_SECRET
    );
    adminToken = jwt.sign(
      { id: testAdmin._id.toString(), email: testAdmin.email, role: 'admin' },
      process.env.JWT_SECRET
    );
  });

  test('returns 401 when no token is provided', async () => {
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/reconcile-razorpay/${testUser._id}`,
      {},
      { validateStatus: () => true }
    );
    expect(res.status).toBe(401);
  });

  test('returns 403 when customer token is provided', async () => {
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/reconcile-razorpay/${testUser._id}`,
      {},
      {
        headers: { Authorization: `Bearer ${customerToken}` },
        validateStatus: () => true
      }
    );
    expect(res.status).toBe(403);
  });

  test('admin token passes authentication & authorization middleware', async () => {
    // Calling for non-existent order returns 404 from route handler (proving middleware passed!)
    const fakeId = new mongoose.Types.ObjectId();
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/reconcile-razorpay/${fakeId}`,
      {},
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        validateStatus: () => true
      }
    );
    expect(res.status).toBe(404);
  });
});
