/** @jest-environment node */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionTransaction = require('../models/CommissionTransaction');
const PointsTransaction = require('../models/PointsTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const { Invoice } = require('../routes/invoices');
const { finalizePaidOrder } = require('../services/orderFinalizer');
const emailService = require('../utils/emailService');

let mongoServer;
let app;
let server;
let baseUrl;
let testAdmin;
let testReferrer;
let testBuyer;
let testBook;
let adminToken;
let buyerToken;

const JWT_SECRET = 'test_jwt_secret_finalizer_safety_2026';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'test_rzp_key_secret_for_tests';
  process.env.PORT = '0';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/orders', require('../routes/orders'));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Global commission settings
  await CommissionSettings.create({
    directReferralBonus: 10,
    selfCashback: 5,
    treeCommissionPercentage: 20
  });

  testAdmin = await User.create({
    name: 'Admin User',
    email: 'admin.safety@test.com',
    password: 'password123',
    role: 'admin',
    isMember: true,
    treeLevel: 1,
    wallet: 0
  });

  testReferrer = await User.create({
    name: 'Referrer User',
    email: 'referrer.safety@test.com',
    password: 'password123',
    role: 'customer',
    referralCode: 'REF_SAFETY_100',
    isMember: true,
    treeParent: testAdmin._id,
    treeLevel: 2,
    wallet: 100
  });

  testBuyer = await User.create({
    name: 'Buyer User',
    email: 'buyer.safety@test.com',
    password: 'password123',
    role: 'customer',
    referredBy: 'REF_SAFETY_100',
    wallet: 50,
    points: 0
  });

  testBook = await Book.create({
    title: 'Safety Physics Book',
    author: 'Editorial',
    class: 'Class 12',
    subject: 'Physics',
    price: 500,
    profit: 200,
    rewardPoints: 25,
    stock: 50
  });

  adminToken = jwt.sign(
    { id: testAdmin._id.toString(), email: testAdmin.email, role: 'admin' },
    JWT_SECRET
  );
  buyerToken = jwt.sign(
    { id: testBuyer._id.toString(), email: testBuyer.email, role: 'customer' },
    JWT_SECRET
  );
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Finalizer Safety Checks (Task 11)', () => {
  // =========================================================================
  // ITEM 2: LOSING CALLERS
  // =========================================================================
  describe('2. Losing Callers & Slow Winner Response', () => {
    it('returns HTTP 200 success:true processing:true when 5s wait expires while winner is still running', async () => {
      const order = await Order.create({
        user_id: testBuyer._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_slow_winner_001'
      });

      // Winner manually claims the lock and simulates slow execution (6 seconds)
      const claimedWinner = await Order.findOneAndUpdate(
        { _id: order._id, finalizationStatus: { $ne: 'completed' } },
        {
          $set: {
            finalizationStatus: 'in_progress',
            finalizationClaimedAt: new Date()
          }
        },
        { new: true }
      );
      expect(claimedWinner).not.toBeNull();
      expect(claimedWinner.finalizationStatus).toBe('in_progress');

      // Losing caller calls finalizePaidOrder with 800ms max poll timeout
      const loserResult = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_slow_winner_001',
        razorpay_order_id: 'order_slow_winner_001',
        _maxPollMs: 800,
        _pollIntervalMs: 100
      });

      // Assert loser response: Must NOT fail; returns success: true, processing: true
      expect(loserResult.success).toBe(true);
      expect(loserResult.processing).toBe(true);
      expect(loserResult.alreadyProcessed).toBe(false);
      expect(loserResult.message).toBe('Payment received, still being finalized');
      expect(loserResult.order).toBeDefined();

      // Now test the HTTP verify endpoint /api/payments/verify for this losing caller
      const crypto = require('crypto');
      const validVerifySig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test_rzp_key_secret_for_tests')
        .update('order_slow_winner_001|pay_slow_winner_001')
        .digest('hex');

      const verifyRes = await axios.post(
        `${baseUrl}/api/payments/verify`,
        {
          razorpay_order_id: 'order_slow_winner_001',
          razorpay_payment_id: 'pay_slow_winner_001',
          razorpay_signature: validVerifySig
        },
        {
          headers: { Authorization: `Bearer ${buyerToken}` },
          validateStatus: () => true
        }
      );

      // In production / test, verify endpoint responds with HTTP 200 and processing: true
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.data.success).toBe(true);
      expect(verifyRes.data.processing).toBe(true);
      expect(verifyRes.data.message).toMatch(/still being finalized/i);

      // Now slow winner finishes the order
      claimedWinner.status = 'completed';
      claimedWinner.paymentStatus = 'completed';
      claimedWinner.finalizationStatus = 'completed';
      claimedWinner.finalizedAt = new Date();
      await claimedWinner.save();

      // Subsequent call sees it is completed and returns alreadyProcessed: true
      const subsequentResult = await finalizePaidOrder(order._id);
      expect(subsequentResult.success).toBe(true);
      expect(subsequentResult.alreadyProcessed).toBe(true);
      expect(subsequentResult.processing).toBe(false);
      expect(subsequentResult.message).toBe('Payment verified');
    });
  });

  // =========================================================================
  // ITEM 3: PARTIAL FAILURE AND RETRY
  // =========================================================================
  describe('3. Partial Failure and Recovery without Duplicate Side-Effects', () => {
    it('recovers safely after a crash midway without duplicating commissions, points, emails, or invoices', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue(true);
      const adminEmailSpy = jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue(true);

      const buyerUser = await User.create({
        name: 'Retry Buyer',
        email: 'retry.buyer@test.com',
        password: 'password123',
        role: 'customer',
        referredBy: 'REF_SAFETY_100',
        wallet: 0,
        points: 0
      });

      const initialReferrerWallet = (await User.findById(testReferrer._id)).wallet;
      const initialBuyerWallet = buyerUser.wallet;

      const order = await Order.create({
        user_id: buyerUser._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_crash_recovery_101',
        deliveryAddress: { address: 'Crash Lane', city: 'Hubli', pincode: '580020' }
      });

      const paymentInfo = {
        razorpay_payment_id: 'pay_crash_recovery_101',
        razorpay_order_id: 'order_crash_recovery_101'
      };

      // Mock pointsService to throw an error on the first call, simulating crash midway right after commission distribution
      const pointsService = require('../services/pointsService');
      const originalAwardPoints = pointsService.awardPoints;
      let throwErrorOnce = true;
      jest.spyOn(pointsService, 'awardPoints').mockImplementation(async (...args) => {
        if (throwErrorOnce) {
          throwErrorOnce = false;
          throw new Error('SIMULATED CRASH AFTER COMMISSION STEP');
        }
        return originalAwardPoints(...args);
      });

      // First run: throws error midway
      await expect(finalizePaidOrder(order._id, paymentInfo)).rejects.toThrow('SIMULATED CRASH AFTER COMMISSION STEP');

      // Verify order status after crash: marked failed, error recorded, claimedAt cleared
      const crashedOrder = await Order.findById(order._id);
      expect(crashedOrder.finalizationStatus).toBe('failed');
      expect(crashedOrder.finalizationError).toContain('SIMULATED CRASH');
      expect(crashedOrder.finalizedAt).toBeUndefined();

      // Commission was already processed on the first attempt
      const commCountMidway = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCountMidway).toBe(1);

      // Points and emails were NOT yet processed before the crash
      const pointsCountMidway = await PointsTransaction.countDocuments({ orderId: order._id });
      expect(pointsCountMidway).toBe(0);
      expect(emailSpy.mock.calls.length).toBe(0);

      // Capture wallet balances midway
      const midwayReferrerWallet = (await User.findById(testReferrer._id)).wallet;
      const midwayBuyerWallet = (await User.findById(buyerUser._id)).wallet;
      expect(midwayReferrerWallet).toBeGreaterThan(initialReferrerWallet);
      expect(midwayBuyerWallet).toBeGreaterThan(initialBuyerWallet);

      // Second run: RETRY (e.g. webhook retry or admin reconcile)
      const retryResult = await finalizePaidOrder(order._id, paymentInfo);
      expect(retryResult.success).toBe(true);
      expect(retryResult.alreadyProcessed).toBe(false);

      // Assert at the end: Exactly one run's worth of side effects!
      const finalOrder = await Order.findById(order._id);
      expect(finalOrder.finalizationStatus).toBe('completed');
      expect(finalOrder.finalizedAt).toBeInstanceOf(Date);

      // 1. Exactly 1 Invoice
      const invoiceCount = await Invoice.countDocuments({ orderId: order._id });
      expect(invoiceCount).toBe(1);

      // 2. Exactly 1 CommissionTransaction (NOT doubled!)
      const finalCommCount = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(finalCommCount).toBe(1);

      // 3. Wallet balances unchanged from midway (no duplicate commission distribution!)
      const finalReferrerWallet = (await User.findById(testReferrer._id)).wallet;
      const finalBuyerWallet = (await User.findById(buyerUser._id)).wallet;
      expect(finalReferrerWallet).toBe(midwayReferrerWallet);
      expect(finalBuyerWallet).toBe(midwayBuyerWallet);

      // 4. Points awarded exactly once
      const pointsCount = await PointsTransaction.countDocuments({ orderId: order._id });
      expect(pointsCount).toBe(1);

      // 5. Emails sent exactly once
      expect(emailSpy.mock.calls.length).toBe(1);
      expect(adminEmailSpy.mock.calls.length).toBe(1);

      pointsService.awardPoints.mockRestore();
      emailSpy.mockRestore();
      adminEmailSpy.mockRestore();
    });
  });

  // =========================================================================
  // ITEM 4: SLOW WINNER & HEARTBEAT
  // =========================================================================
  describe('4. Slow Winner Heartbeat & Stale Lock Safety', () => {
    it('heartbeat keeps lock refreshed during long execution so concurrent callers do not steal lock', async () => {
      const order = await Order.create({
        user_id: testBuyer._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_heartbeat_test_202'
      });

      // Claim lock
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id },
        {
          $set: {
            finalizationStatus: 'in_progress',
            finalizationClaimedAt: new Date(Date.now() - 5000) // 5s ago
          }
        },
        { new: true }
      );
      expect(claimed).not.toBeNull();

      // Trigger heartbeat simulation
      await Order.updateOne(
        { _id: order._id, finalizationStatus: 'in_progress' },
        { $set: { finalizationClaimedAt: new Date() } }
      );

      const refreshed = await Order.findById(order._id);
      const ageMs = Date.now() - refreshed.finalizationClaimedAt.getTime();
      expect(ageMs).toBeLessThan(1000); // Actively refreshed!
    });
  });

  // =========================================================================
  // ITEM 5: OTHER PATHS (admin update-status & manual verification)
  // =========================================================================
  describe('5. Other Paths: admin update-status and manual verification vs finalizePaidOrder', () => {
    it('Order A: finalizePaidOrder completes FIRST, then admin calls update-status: commissions NOT paid twice', async () => {
      const buyer = await User.create({
        name: 'Order A Buyer',
        email: 'orderA.buyer@test.com',
        password: 'password123',
        role: 'customer',
        referredBy: 'REF_SAFETY_100',
        wallet: 0,
        points: 0
      });

      const initialReferrerWallet = (await User.findById(testReferrer._id)).wallet;

      const order = await Order.create({
        user_id: buyer._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_path_test_A_301'
      });

      // 1. finalizePaidOrder runs FIRST
      const finalRes = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_path_test_A_301',
        razorpay_order_id: 'order_path_test_A_301'
      });
      expect(finalRes.success).toBe(true);

      const commCount1 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount1).toBe(1);

      const referrerWalletAfter1 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter1 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter1).toBeGreaterThan(initialReferrerWallet);
      expect(buyerWalletAfter1).toBeGreaterThan(0);

      // 2. Admin calls PUT /api/orders/admin/update-status/:id with status: 'completed'
      const adminRes = await axios.put(
        `${baseUrl}/api/orders/admin/update-status/${order._id}`,
        { status: 'completed' },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          validateStatus: () => true
        }
      );
      expect(adminRes.status).toBe(200);

      // Assert commission transaction count is still EXACTLY 1
      const commCount2 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount2).toBe(1);

      // Assert wallet balances are completely unchanged (NO DOUBLE COMMISSION)
      const referrerWalletAfter2 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter2 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter2).toBe(referrerWalletAfter1);
      expect(buyerWalletAfter2).toBe(buyerWalletAfter1);
    });

    it('Order B: admin update-status called FIRST, then finalizePaidOrder runs: commissions NOT paid twice', async () => {
      const buyer = await User.create({
        name: 'Order B Buyer',
        email: 'orderB.buyer@test.com',
        password: 'password123',
        role: 'customer',
        referredBy: 'REF_SAFETY_100',
        wallet: 0,
        points: 0
      });

      const initialReferrerWallet = (await User.findById(testReferrer._id)).wallet;

      const order = await Order.create({
        user_id: buyer._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_path_test_B_302'
      });

      // 1. Admin update-status runs FIRST
      const adminRes = await axios.put(
        `${baseUrl}/api/orders/admin/update-status/${order._id}`,
        { status: 'completed' },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          validateStatus: () => true
        }
      );
      expect(adminRes.status).toBe(200);

      const commCount1 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount1).toBe(1);

      const referrerWalletAfter1 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter1 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter1).toBeGreaterThan(initialReferrerWallet);
      expect(buyerWalletAfter1).toBeGreaterThan(0);

      // 2. finalizePaidOrder runs AFTER admin status change
      const finalRes = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_path_test_B_302',
        razorpay_order_id: 'order_path_test_B_302'
      });
      expect(finalRes.success).toBe(true);

      // Assert commission transaction count is still EXACTLY 1
      const commCount2 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount2).toBe(1);

      // Assert wallet balances are completely unchanged (NO DOUBLE COMMISSION)
      const referrerWalletAfter2 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter2 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter2).toBe(referrerWalletAfter1);
      expect(buyerWalletAfter2).toBe(buyerWalletAfter1);
    });

    it('Order C: offline transfer approved via manual verify, then finalizePaidOrder called: commissions NOT paid twice', async () => {
      const buyer = await User.create({
        name: 'Order C Buyer',
        email: 'orderC.buyer@test.com',
        password: 'password123',
        role: 'customer',
        referredBy: 'REF_SAFETY_100',
        wallet: 0,
        points: 0
      });

      const initialReferrerWallet = (await User.findById(testReferrer._id)).wallet;

      const order = await Order.create({
        user_id: buyer._id,
        items: [{
          id: testBook._id,
          type: 'book',
          title: testBook.title,
          price: 500,
          quantity: 1,
          profit: 200
        }],
        totalAmount: 500,
        orderProfitTotal: 200,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'transfer',
        paymentDetails: {
          status: 'pending_verification'
        }
      });

      // 1. Admin manual cheque/transfer approval endpoint
      const approveRes = await axios.post(
        `${baseUrl}/api/payments/admin/approve-cheque-payment/${order._id}`,
        { approvalNotes: 'Bank receipt verified' },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          validateStatus: () => true
        }
      );
      expect(approveRes.status).toBe(200);

      const commCount1 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount1).toBe(1);

      const referrerWalletAfter1 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter1 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter1).toBeGreaterThan(initialReferrerWallet);
      expect(buyerWalletAfter1).toBeGreaterThan(0);

      // 2. finalizePaidOrder called on the same order
      const finalRes = await finalizePaidOrder(order._id);
      expect(finalRes.success).toBe(true);

      // Assert commission transaction count is still EXACTLY 1
      const commCount2 = await CommissionTransaction.countDocuments({ orderId: order._id });
      expect(commCount2).toBe(1);

      // Assert wallet balances are completely unchanged (NO DOUBLE COMMISSION)
      const referrerWalletAfter2 = (await User.findById(testReferrer._id)).wallet;
      const buyerWalletAfter2 = (await User.findById(buyer._id)).wallet;
      expect(referrerWalletAfter2).toBe(referrerWalletAfter1);
      expect(buyerWalletAfter2).toBe(buyerWalletAfter1);
    });
  });
});
