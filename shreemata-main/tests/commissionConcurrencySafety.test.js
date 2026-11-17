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
const WalletTransaction = require('../models/WalletTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const TrustFund = require('../models/TrustFund');
const ordersRouter = require('../routes/orders');
const { distributeCommissions, processAutomaticCommissionForOrder } = require('../services/commissionDistribution');
const { finalizePaidOrder } = require('../services/orderFinalizer');

let mongoServer;
let app;
let server;
let baseUrl;

let adminUser;
let referrerUser;
let buyerUser;
let adminToken;
let bookFixed20;
let bookZeroProfit;

const JWT_SECRET = 'test_secret_concurrency_safety_999';

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRouter);

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();

  await CommissionSettings.deleteMany({});
  await CommissionSettings.create({
    settingsId: 'default',
    trustFundPercent: 10,
    directCommissionPercent: 30, // 30% of profit = ₹6 on ₹20 profit
    referralCommissionPercent: 20, // 20% of profit = ₹4 on ₹20 profit
    adminCommissionPercent: 0,
    treeCommissionPoolPercent: 40,
    developmentFundPercent: 0,
    totalAllocationPercent: 100,
    directFallbackRecipient: 'trust_fund',
    referralFallbackRecipient: 'admin',
    treeCommissionLevels: [
      { level: 1, percentage: 40 }
    ]
  });

  // Admin User (tree root)
  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@shreemata.com',
    password: 'Password123!',
    role: 'admin',
    referralCode: 'ADMIN123',
    treeLevel: 1,
    wallet: 0
  });

  // Referrer User (level 2)
  referrerUser = await User.create({
    name: 'Referrer User',
    email: 'referrer@shreemata.com',
    password: 'Password123!',
    role: 'customer',
    referralCode: 'REF123',
    treeLevel: 2,
    treeParent: adminUser._id,
    wallet: 0
  });

  // Buyer User (level 3, referred by referrerUser)
  buyerUser = await User.create({
    name: 'Buyer User',
    email: 'buyer@shreemata.com',
    password: 'Password123!',
    role: 'customer',
    referralCode: 'BUYER123',
    referredBy: 'REF123',
    treeLevel: 3,
    treeParent: referrerUser._id,
    firstPurchaseDone: true,
    isMember: true,
    wallet: 0
  });

  adminToken = jwt.sign(
    { id: adminUser._id, email: adminUser.email, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  bookFixed20 = await Book.create({
    title: '10TH PASSING PACKAGE ENGLISH MEDIUM',
    author: 'Author Name',
    price: 100,
    finalPrice: 100,
    profitMethod: 'fixed',
    profitValue: 20,
    cashbackPercentage: 0,
    cashbackAmount: 0,
    rewardPoints: 0
  });

  bookZeroProfit = await Book.create({
    title: 'Zero Profit Book',
    author: 'Author Name',
    price: 100,
    finalPrice: 100,
    profitMethod: 'fixed',
    profitValue: 0,
    cashbackPercentage: 0,
    cashbackAmount: 0,
    rewardPoints: 0
  });
});

describe('Commission Concurrency & Safety Verification', () => {

  test('1. Two simultaneous calls to distributeCommissions (Promise.all) produce exactly ONE payout and one completed record', async () => {
    const order = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'pending',
      orderProfitTotal: 20,
      profitAmount: 20,
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 20
      }]
    });

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    console.log(`[Test 1 Before] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}`);
    expect(buyerBefore.wallet).toBe(0);
    expect(referrerBefore.wallet).toBe(0);

    // Call distributeCommissions simultaneously via Promise.all
    const [res1, res2] = await Promise.all([
      distributeCommissions(order._id, buyerUser._id, 100, 20),
      distributeCommissions(order._id, buyerUser._id, 100, 20)
    ]);

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(res1.status).toBe('completed');
    expect(res2.status).toBe('completed');
    expect(String(res1._id)).toBe(String(res2._id));

    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    console.log(`[Test 1 After] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}`);

    // Exactly one payout: Buyer cashback = ₹6 (30% of ₹20), Referrer = ₹10.4 (₹4 referral + ₹6.4 tree pool)
    expect(buyerAfter.wallet).toBe(6);
    expect(referrerAfter.wallet).toBe(10.4);

    // Exactly one completed CommissionTransaction in database
    const completedRecords = await CommissionTransaction.find({ orderId: order._id, status: 'completed' });
    expect(completedRecords.length).toBe(1);
    expect(completedRecords[0].directCommissionAmount).toBe(6);
    expect(completedRecords[0].referralCommissionAmount).toBe(4);

    // Exactly one set of wallet transactions (1 buyer cashback, 1 referrer direct referral, 1 referrer tree commission, 1 admin tree pool)
    const walletTxs = await WalletTransaction.find({ orderId: order._id });
    const buyerWalletTxs = walletTxs.filter(tx => String(tx.userId) === String(buyerUser._id));
    const referrerWalletTxs = walletTxs.filter(tx => String(tx.userId) === String(referrerUser._id));
    expect(buyerWalletTxs.length).toBe(1);
    expect(buyerWalletTxs[0].amount).toBe(6);
    expect(referrerWalletTxs.length).toBe(2); // referral (4) + tree (6.4)
  });

  test('2. processAutomaticCommissionForOrder running at the same time as finalizePaidOrder produces exactly ONE payout', async () => {
    const order = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'pending',
      paymentStatus: 'pending',
      commissionStatus: 'pending',
      orderProfitTotal: 20,
      profitAmount: 20,
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 20
      }]
    });

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    console.log(`[Test 2 Before] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}`);
    expect(buyerBefore.wallet).toBe(0);
    expect(referrerBefore.wallet).toBe(0);

    // Simultaneously run processAutomaticCommissionForOrder and finalizePaidOrder
    const [finalizerRes, autoCommRes] = await Promise.all([
      finalizePaidOrder(order, {
        razorpay_payment_id: 'pay_test_race_1',
        razorpay_order_id: 'order_test_race_1'
      }),
      (async () => {
        // Also simulate an active caller triggering processAutomaticCommissionForOrder
        const refreshed = await Order.findById(order._id);
        refreshed.status = 'completed';
        return await processAutomaticCommissionForOrder(refreshed);
      })()
    ]);

    expect(finalizerRes.success).toBe(true);

    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    console.log(`[Test 2 After] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}`);

    // Buyer received ₹6 once, Referrer received ₹10.4 once (₹4 referral + ₹6.4 tree pool)
    expect(buyerAfter.wallet).toBe(6);
    expect(referrerAfter.wallet).toBe(10.4);

    const completedRecords = await CommissionTransaction.find({ orderId: order._id, status: 'completed' });
    expect(completedRecords.length).toBe(1);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.commissionStatus).toBe('distributed');
    expect(updatedOrder.status).toBe('completed');
  });

  test('3. Admin update-status route at the same time as finalizePaidOrder produces exactly ONE payout', async () => {
    const order = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'pending',
      paymentStatus: 'pending',
      commissionStatus: 'pending',
      orderProfitTotal: 20,
      profitAmount: 20,
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 20
      }]
    });

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    console.log(`[Test 3 Before] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}`);
    expect(buyerBefore.wallet).toBe(0);
    expect(referrerBefore.wallet).toBe(0);

    // Simultaneously run admin update-status and finalizePaidOrder
    const [updateStatusRes, finalizerRes] = await Promise.all([
      axios.put(
        `${baseUrl}/api/orders/admin/update-status/${order._id}`,
        { status: 'completed' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      ),
      finalizePaidOrder(order, {
        razorpay_payment_id: 'pay_test_race_2',
        razorpay_order_id: 'order_test_race_2'
      })
    ]);

    expect(updateStatusRes.status).toBe(200);
    expect(finalizerRes.success).toBe(true);

    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    console.log(`[Test 3 After] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}`);

    // Buyer received ₹6 once, Referrer received ₹10.4 once (₹4 referral + ₹6.4 tree pool)
    expect(buyerAfter.wallet).toBe(6);
    expect(referrerAfter.wallet).toBe(10.4);

    const completedRecords = await CommissionTransaction.find({ orderId: order._id, status: 'completed' });
    expect(completedRecords.length).toBe(1);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.commissionStatus).toBe('distributed');
  });

  test('4. Confirm the repair button does NOT appear for an order whose commission was paid with a non-zero amount', async () => {
    // Create an order finalized with non-zero commission
    const orderNonZero = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'distributed',
      orderProfitTotal: 20,
      profitAmount: 20,
      razorpay_payment_id: 'pay_non_zero_123',
      paymentStatus: 'completed',
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 20
      }]
    });

    // Run commission distribution to create non-zero CommissionTransaction and WalletTransaction
    await distributeCommissions(orderNonZero._id, buyerUser._id, 100, 20);

    // 1) Verify frontend button rendering logic from admin-orders.html
    const isRepaired = Boolean(orderNonZero.isRepaired || orderNonZero.repairedAt);
    const isVerified = Boolean(orderNonZero.razorpay_payment_id || orderNonZero.paymentStatus === 'completed');
    const isZeroProfitEligible = orderNonZero.status === 'completed' && isVerified && !isRepaired &&
      (Number(orderNonZero.profitAmount || 0) === 0 || Number(orderNonZero.orderProfitTotal || 0) === 0) &&
      orderNonZero.commissionStatus === 'distributed';

    // Must NOT be zero-profit eligible
    expect(isZeroProfitEligible).toBe(false);

    // 2) Verify backend repair route strictly rejects with 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${orderNonZero._id}/repair-zero-profit-commission`,
        { mode: 'preview' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      throw new Error('Expected 400 rejection');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('Order already has non-zero commission amounts recorded');
    }
  });

  test('5. Confirm that repairing one order NEVER touches another order', async () => {
    // Order A: zero profit order eligible for repair
    const orderA = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'distributed',
      orderProfitTotal: 0,
      profitAmount: 0,
      razorpay_payment_id: 'pay_order_a',
      paymentStatus: 'completed',
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 0
      }]
    });

    // Create a zero-amount CommissionTransaction for Order A
    await CommissionTransaction.create({
      orderId: orderA._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directCommissionAmount: 0,
      referralCommissionAmount: 0,
      status: 'completed'
    });

    // Order B: completely separate order with non-zero commission already distributed
    const separateBuyer = await User.create({
      name: 'Separate Buyer',
      email: 'sepbuyer@shreemata.com',
      password: 'Password123!',
      role: 'customer',
      wallet: 50,
      referralCode: 'SEP123'
    });

    const orderB = await Order.create({
      user_id: separateBuyer._id,
      totalAmount: 200,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'distributed',
      orderProfitTotal: 40,
      profitAmount: 40,
      razorpay_payment_id: 'pay_order_b',
      paymentStatus: 'completed',
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 2,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 40,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 20
      }]
    });

    const commTxB = await CommissionTransaction.create({
      orderId: orderB._id,
      purchaser: separateBuyer._id,
      orderAmount: 200,
      profitAmount: 40,
      directCommissionAmount: 12,
      referralCommissionAmount: 8,
      status: 'completed'
    });

    // Snapshot Order B before repair
    const orderBBefore = (await Order.findById(orderB._id)).toObject();
    const commTxBBefore = (await CommissionTransaction.findById(commTxB._id)).toObject();
    const sepBuyerBefore = (await User.findById(separateBuyer._id)).toObject();

    // Now execute repair on Order A ONLY
    const repairRes = await axios.post(
      `${baseUrl}/api/orders/admin/${orderA._id}/repair-zero-profit-commission`,
      { mode: 'confirm' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(repairRes.status).toBe(200);
    expect(repairRes.data.success).toBe(true);
    expect(repairRes.data.order.isRepaired).toBe(true);

    // Verify Order B is 100% UNTOUCHED
    const orderBAfter = (await Order.findById(orderB._id)).toObject();
    const commTxBAfter = (await CommissionTransaction.findById(commTxB._id)).toObject();
    const sepBuyerAfter = (await User.findById(separateBuyer._id)).toObject();

    expect(orderBAfter.isRepaired).toBe(false);
    expect(orderBAfter.repairedAt).toBeUndefined();
    expect(orderBAfter.profitAmount).toBe(orderBBefore.profitAmount);
    expect(orderBAfter.orderProfitTotal).toBe(orderBBefore.orderProfitTotal);
    expect(orderBAfter.updatedAt.getTime()).toBe(orderBBefore.updatedAt.getTime());

    expect(commTxBAfter.status).toBe('completed');
    expect(commTxBAfter.directCommissionAmount).toBe(commTxBBefore.directCommissionAmount);
    expect(commTxBAfter.referralCommissionAmount).toBe(commTxBBefore.referralCommissionAmount);

    expect(sepBuyerAfter.wallet).toBe(sepBuyerBefore.wallet); // unchanged at 50
  });

  test('6. Verify repair route superseded handling still works seamlessly with concurrency guard', async () => {
    // Create zero profit order
    const order = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'distributed',
      orderProfitTotal: 0,
      profitAmount: 0,
      razorpay_payment_id: 'pay_repair_superseded_test',
      paymentStatus: 'completed',
      items: [{
        id: bookFixed20._id,
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 0
      }]
    });

    const oldZeroTx = await CommissionTransaction.create({
      orderId: order._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directCommissionAmount: 0,
      referralCommissionAmount: 0,
      status: 'completed'
    });

    // Execute confirm repair
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
      { mode: 'confirm' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Old transaction marked 'superseded'
    const oldRefreshed = await CommissionTransaction.findById(oldZeroTx._id);
    expect(oldRefreshed.status).toBe('superseded');

    // New transaction created with 'completed'
    const newTx = await CommissionTransaction.findOne({ orderId: order._id, status: 'completed' });
    expect(newTx).toBeDefined();
    expect(String(newTx._id)).not.toBe(String(oldZeroTx._id));
    expect(newTx.directCommissionAmount).toBe(6);
    expect(newTx.referralCommissionAmount).toBe(4);

    // Wallets credited once
    const buyer = await User.findById(buyerUser._id);
    const referrer = await User.findById(referrerUser._id);
    expect(buyer.wallet).toBe(6);
    expect(referrer.wallet).toBe(10.4);
  });
});
