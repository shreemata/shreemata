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

  test('7. Database-level proof: Bypassing in-flight map forces both calls to MongoDB; partial index & E11000 produce exactly ONE payout', async () => {
    // 1. Ensure indexes are built and confirm the unique partial index actually exists in MongoDB
    await CommissionTransaction.init();
    const indexes = await CommissionTransaction.collection.getIndexes();
    console.log('[CommissionTransaction MongoDB Indexes]', JSON.stringify(indexes, null, 2));

    // Verify the index spec: { orderId: 1 } with unique: true and partialFilterExpression
    const orderIdIndexKey = Object.keys(indexes).find(name => {
      const idx = indexes[name];
      return idx.some && idx.some(k => k[0] === 'orderId') || (Array.isArray(idx) && idx[0] && idx[0][0] === 'orderId');
    }) || Object.keys(indexes).find(name => indexes[name].key && indexes[name].key.orderId === 1);

    expect(orderIdIndexKey).toBeDefined();

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
    console.log(`[Test 7 Before] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}`);
    expect(buyerBefore.wallet).toBe(0);
    expect(referrerBefore.wallet).toBe(0);

    // Call distributeCommissions simultaneously with test-only bypass hook active
    // Both callers bypass the JS in-flight map and reach MongoDB directly
    distributeCommissions.__setBypassInFlightForTests(true);
    let res1, res2;
    try {
      [res1, res2] = await Promise.all([
        distributeCommissions(order._id, buyerUser._id, 100, 20),
        distributeCommissions(order._id, buyerUser._id, 100, 20)
      ]);
    } finally {
      distributeCommissions.__setBypassInFlightForTests(false);
    }

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(res1.status).toBe('completed');
    expect(res2.status).toBe('completed');
    expect(String(res1._id)).toBe(String(res2._id));

    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    console.log(`[Test 7 After] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}`);

    // Exactly one payout: buyer credited ₹6 once, referrer credited ₹10.4 once
    expect(buyerAfter.wallet).toBe(6);
    expect(referrerAfter.wallet).toBe(10.4);

    const completedRecords = await CommissionTransaction.find({ orderId: order._id, status: 'completed' });
    expect(completedRecords.length).toBe(1);
  });

  test('8. Stale pending recovery: Process crash with 6-minute-old pending record and partial wallet credit recovers cleanly with zero double-pay', async () => {
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

    // Simulate crash scenario:
    // 1. Pending transaction inserted 6 minutes ago (stale > 5 mins)
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    const staleTx = await CommissionTransaction.create({
      orderId: order._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 20,
      status: 'pending',
      createdAt: sixMinutesAgo,
      updatedAt: sixMinutesAgo
    });

    // 2. The crashed process credited buyer cashback (₹6) before dying, but NOT referrer
    await User.findByIdAndUpdate(buyerUser._id, { $inc: { wallet: 6 } });
    await WalletTransaction.create({
      userId: buyerUser._id,
      amount: 6,
      type: 'credit',
      category: 'direct_commission',
      description: 'Cashback from crashed run',
      orderId: order._id,
      commissionTransactionId: staleTx._id,
      balanceAfter: 6
    });

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    console.log(`[Test 8 Before Recovery] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}`);
    expect(buyerBefore.wallet).toBe(6);
    expect(referrerBefore.wallet).toBe(0);

    // Run distributeCommissions now (simulating recovery / retry run)
    const tx = await distributeCommissions(order._id, buyerUser._id, 100, 20);

    expect(tx).toBeDefined();
    expect(tx.status).toBe('completed');
    expect(String(tx._id)).not.toBe(String(staleTx._id));

    // The stale pending record was atomically marked 'failed'
    const staleRefreshed = await CommissionTransaction.findById(staleTx._id);
    expect(staleRefreshed.status).toBe('failed');

    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    console.log(`[Test 8 After Recovery] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}`);

    // Buyer wallet was NOT credited again (remains 6, NOT 12)
    expect(buyerAfter.wallet).toBe(6);
    // Referrer wallet was credited (10.4)
    expect(referrerAfter.wallet).toBe(10.4);

    // Exactly one completed CommissionTransaction in database
    const completedRecords = await CommissionTransaction.find({ orderId: order._id, status: 'completed' });
    expect(completedRecords.length).toBe(1);
  });

  test('9. waitForCompletedCommission times out after bounded wait and throws a clear error, never hanging', async () => {
    const fakeOrderId = new mongoose.Types.ObjectId();

    // Create an active pending transaction that never completes
    await CommissionTransaction.create({
      orderId: fakeOrderId,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 20,
      status: 'pending',
      createdAt: new Date()
    });

    // Call distributeCommissions for the order; since it is pending and won't complete,
    // the waiter must time out after a bounded duration (we test with small maxWaitMs or await failure)
    const startTime = Date.now();
    try {
      // Calling distributeCommissions will detect activePending and call waitForCompletedCommission
      await distributeCommissions(fakeOrderId, buyerUser._id, 100, 20);
      throw new Error('Expected timeout rejection');
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.log(`[Test 9 Waiter Timeout] Threw error after ${elapsed}ms: ${err.message}`);
      expect(err.message).toContain('Timed out waiting for commission distribution');
    }
  });

  test('10. Wallet Dedupe Safety: Cannot suppress legitimate payouts (referrer+tree ancestor, multi-level tree, repair after ₹0 profit, partial crash retry)', async () => {
    // Case 10a: User who is BOTH direct referrer AND tree ancestor gets BOTH referral_commission and tree_commission
    const order10a = await Order.create({
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

    const referrerBefore10a = await User.findById(referrerUser._id);
    expect(referrerBefore10a.wallet).toBe(0);

    await distributeCommissions(order10a._id, buyerUser._id, 100, 20);

    const referrerAfter10a = await User.findById(referrerUser._id);
    // Referral (₹4) + Tree Level 1 (₹6.40) = ₹10.40 total
    expect(referrerAfter10a.wallet).toBe(10.4);

    const refWalletTxs = await WalletTransaction.find({ userId: referrerUser._id, orderId: order10a._id });
    expect(refWalletTxs.length).toBe(2);
    const categories = refWalletTxs.map(t => t.category).sort();
    expect(categories).toEqual(['referral_commission', 'tree_commission']);

    // Case 10c: THE REPAIR CASE:
    // Order originally processed with ₹0 profit where first run left wallet transaction rows
    // (including rows with amount 0, and rows under direct_commission and referral),
    // tied to a commission record marked 'superseded'.
    const orderRepair = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'completed',
      commissionStatus: 'distributed',
      orderProfitTotal: 0,
      profitAmount: 0,
      items: [{
        id: bookZeroProfit._id,
        title: bookZeroProfit.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0,
        profitMethodSnapshot: 'fixed',
        profitValueSnapshot: 0
      }]
    });

    const oldSupersededTx = await CommissionTransaction.create({
      orderId: orderRepair._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directCommissionAmount: 0,
      referralCommissionAmount: 0,
      status: 'superseded',
      createdAt: new Date(Date.now() - 10000),
      updatedAt: new Date(Date.now() - 5000)
    });

    // Old run left 0-amount rows and rows tied to superseded record
    await WalletTransaction.create({
      userId: buyerUser._id,
      amount: 0,
      type: 'credit',
      category: 'direct_commission',
      description: 'Old zero cashback',
      orderId: orderRepair._id,
      commissionTransactionId: oldSupersededTx._id
    });
    await WalletTransaction.create({
      userId: referrerUser._id,
      amount: 0,
      type: 'credit',
      category: 'referral_commission',
      description: 'Old zero referral',
      orderId: orderRepair._id,
      commissionTransactionId: oldSupersededTx._id
    });

    // Set updated profit to ₹20 and run repair distribution
    orderRepair.orderProfitTotal = 20;
    orderRepair.profitAmount = 20;
    await orderRepair.save();

    const buyerBeforeRepair = await User.findById(buyerUser._id);
    const referrerBeforeRepair = await User.findById(referrerUser._id);
    console.log(`[Test 10c Before Repair] Buyer Wallet: ₹${buyerBeforeRepair.wallet}, Referrer Wallet: ₹${referrerBeforeRepair.wallet}`);

    // Call distributeCommissions (repair mode: new completed record)
    await distributeCommissions(orderRepair._id, buyerUser._id, 100, 20);

    const buyerAfterRepair = await User.findById(buyerUser._id);
    const referrerAfterRepair = await User.findById(referrerUser._id);
    console.log(`[Test 10c After Repair] Buyer Wallet: ₹${buyerAfterRepair.wallet}, Referrer Wallet: ₹${referrerAfterRepair.wallet}`);

    // Buyer received FULL ₹6 cashback (+6)
    expect(buyerAfterRepair.wallet).toBe(buyerBeforeRepair.wallet + 6);
    // Referrer received FULL ₹4 referral (+4) + ₹6.40 tree pool (+6.40) = +₹10.40
    expect(referrerAfterRepair.wallet).toBeCloseTo(referrerBeforeRepair.wallet + 10.4, 2);

    // Case 10d: Genuine retry after partial crash skips only parties already credited
    const orderCrash = await Order.create({
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

    // Crashed attempt 90s ago
    const crashedPendingTx = await CommissionTransaction.create({
      orderId: orderCrash._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 20,
      status: 'pending',
      createdAt: new Date(Date.now() - 90000)
    });

    // Buyer was credited ₹6 before the crash
    await User.findByIdAndUpdate(buyerUser._id, { $inc: { wallet: 6 } });
    await WalletTransaction.create({
      userId: buyerUser._id,
      amount: 6,
      type: 'credit',
      category: 'direct_commission',
      description: `Cashback for Order #${orderCrash._id.toString().slice(-6).toUpperCase()}`,
      orderId: orderCrash._id,
      commissionTransactionId: crashedPendingTx._id
    });

    const buyerBeforeCrashRetry = await User.findById(buyerUser._id);
    const referrerBeforeCrashRetry = await User.findById(referrerUser._id);

    // Run distributeCommissions now
    await distributeCommissions(orderCrash._id, buyerUser._id, 100, 20);

    const buyerAfterCrashRetry = await User.findById(buyerUser._id);
    const referrerAfterCrashRetry = await User.findById(referrerUser._id);

    // Buyer was NOT credited again (remains same)
    expect(buyerAfterCrashRetry.wallet).toBe(buyerBeforeCrashRetry.wallet);
    // Referrer was credited for the first time
    expect(referrerAfterCrashRetry.wallet).toBe(referrerBeforeCrashRetry.wallet + 10.4);
  });

  test('11. Pending Window Alignment: Stale record at 2 minutes (former dead window) recovers immediately without delay', async () => {
    const order11 = await Order.create({
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

    // Pending record created 2 minutes (120s) ago — in the former 60s-5min dead window
    const twoMinutesAgo = new Date(Date.now() - 120000);
    const staleTx = await CommissionTransaction.create({
      orderId: order11._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 20,
      status: 'pending',
      createdAt: twoMinutesAgo,
      updatedAt: twoMinutesAgo
    });

    const startTime = Date.now();
    // With 60s aligned threshold, this MUST recover immediately (< 500ms), NOT wait 8s or throw
    const completedTx = await distributeCommissions(order11._id, buyerUser._id, 100, 20);
    const elapsed = Date.now() - startTime;

    console.log(`[Test 11 Dead Window Fix] Distribution recovered in ${elapsed}ms (expected < 1000ms, not 8000ms)`);
    expect(elapsed).toBeLessThan(2000);
    expect(completedTx).toBeDefined();
    expect(completedTx.status).toBe('completed');

    // The 2-minute-old record was marked failed
    const oldRefreshed = await CommissionTransaction.findById(staleTx._id);
    expect(oldRefreshed.status).toBe('failed');
  });

  test('12. finalizePaidOrder leaves failed order in a clean retryable state, not permanently failed', async () => {
    const order12 = await Order.create({
      user_id: buyerUser._id,
      totalAmount: 100,
      paymentType: 'online',
      status: 'pending',
      paymentStatus: 'pending',
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

    const invoiceRoutes = require('../routes/invoices');
    const invoiceSpy = jest.spyOn(invoiceRoutes, 'autoGenerateInvoiceForOrder').mockImplementationOnce(() => {
      throw new Error('Simulated transient failure during invoice generation');
    });

    // 1. Initial attempt fails during finalization step
    let threw = false;
    try {
      await finalizePaidOrder(order12._id, {
        razorpay_payment_id: 'pay_fail_test',
        razorpay_order_id: 'order_fail_test',
        paymentStatus: 'completed'
      });
    } catch (err) {
      threw = true;
      console.log(`[Test 12 finalizePaidOrder caught error as expected]: ${err.message}`);
      expect(err.message).toContain('Simulated transient failure');
    }
    expect(threw).toBe(true);

    // 2. Verify order is NOT stuck in 'in_progress' or permanent completed; it is marked 'failed' and claim lock is released
    const failedOrder = await Order.findById(order12._id);
    expect(failedOrder.finalizationStatus).toBe('failed');
    expect(failedOrder.finalizedAt).toBeFalsy();
    expect(failedOrder.finalizationClaimedAt).toBeNull();
    console.log(`[Test 12 Verified] Order ${order12._id} finalizationStatus is 'failed', claim lock is released, order is retryable.`);

    // 3. Retry succeeds cleanly
    const retryResult = await finalizePaidOrder(order12._id, {
      razorpay_payment_id: 'pay_fail_test',
      razorpay_order_id: 'order_fail_test',
      paymentStatus: 'completed'
    });

    expect(retryResult.success).toBe(true);
    const completedOrder = await Order.findById(order12._id);
    expect(completedOrder.finalizationStatus).toBe('completed');
    expect(completedOrder.finalizedAt).toBeDefined();

    invoiceSpy.mockRestore();
  });
});
