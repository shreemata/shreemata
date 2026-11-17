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

let mongoServer;
let app;
let server;
let baseUrl;

let adminUser;
let referrerUser;
let buyerUser;
let nonAdminUser;
let adminToken;
let nonAdminToken;

let bookFixed20;
let bookZeroProfit;

const JWT_SECRET = 'test_secret_repair_zero_profit_789';

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

  // Settings: 30% buyer (6), 20% referrer (4), 40% tree pool (8), 10% trust fund (2)
  await CommissionSettings.create({
    settingsId: 'default',
    trustFundPercent: 10,
    directCommissionPercent: 30,
    referralCommissionPercent: 20,
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
    referralCode: 'ADMINREF',
    treeLevel: 1,
    wallet: 0
  });
  adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET);

  // Referrer User
  referrerUser = await User.create({
    name: 'Referrer Demo',
    email: 'referrer@shreemata.com',
    password: 'Password123!',
    role: 'customer',
    referralCode: 'REF1234',
    treeLevel: 2,
    treeParent: adminUser._id,
    wallet: 0
  });

  // Buyer User (referred by referrerUser)
  buyerUser = await User.create({
    name: 'Customer Demo',
    email: 'buyer@shreemata.com',
    password: 'Password123!',
    role: 'customer',
    referredBy: 'REF1234',
    treeLevel: 3,
    treeParent: referrerUser._id,
    wallet: 0
  });

  // Regular Non-Admin User
  nonAdminUser = await User.create({
    name: 'Non Admin',
    email: 'nonadmin@shreemata.com',
    password: 'Password123!',
    role: 'customer',
    wallet: 0
  });
  nonAdminToken = jwt.sign({ id: nonAdminUser._id, role: 'customer' }, JWT_SECRET);

  // Book with CURRENT profit fixed ₹20 (selling price ₹100)
  bookFixed20 = await Book.create({
    title: '10TH PASSING PAKAGE ENGLISH MEDIUM',
    author: 'Shree Mata Expert Editorial Board',
    price: 100,
    sellingPrice: 100,
    profitType: 'fixed',
    profitValue: 20,
    profitConfigured: true,
    cashbackAmount: 0,
    cashbackPercentage: 0
  });

  // Book with CURRENT profit ₹0
  bookZeroProfit = await Book.create({
    title: 'Zero Profit Subject Book',
    author: 'Shree Mata Academic Team',
    price: 100,
    sellingPrice: 100,
    profitType: 'fixed',
    profitValue: 0,
    profitConfigured: false,
    cashbackAmount: 0,
    cashbackPercentage: 0
  });
});

describe('Safe Zero-Profit Commission Admin Repair', () => {

  // Helper to create an exact reproduction of order b4d8
  async function createOrderB4D8Fixture() {
    const order = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: bookFixed20._id.toString(),
        title: bookFixed20.title,
        price: 100,
        quantity: 1,
        profitTypeSnapshot: 'fixed',
        profitValueSnapshot: 0,
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0,
        cashbackAmount: 0,
        cashbackPercentage: 0
      }],
      totalAmount: 100,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'completed',
      paymentStatus: 'completed',
      paymentType: 'online',
      razorpay_payment_id: 'pay_b4d8_test',
      razorpay_order_id: 'order_b4d8_test',
      paymentDetails: {
        status: 'verified',
        razorpay_payment_id: 'pay_b4d8_test',
        razorpay_order_id: 'order_b4d8_test',
        verifiedAt: new Date('2026-11-14T10:00:00Z')
      },
      commissionStatus: 'distributed',
      rewardApplied: true
    });

    const zeroCommission = await CommissionTransaction.create({
      orderId: order._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directReferrer: buyerUser._id,
      directCommissionAmount: 0,
      referralReferrer: referrerUser._id,
      referralCommissionAmount: 0,
      adminRecipient: adminUser._id,
      adminCommissionAmount: 0,
      treePoolTotal: 0,
      treeCommissions: [],
      trustFundAmount: 0,
      devTrustFundAmount: 0,
      remainderToDevFund: 0,
      status: 'completed',
      processedAt: new Date('2026-11-14T10:05:00Z')
    });

    return { order, zeroCommission };
  }

  test('Security & Auth: 401 without token and 403 for non-admins', async () => {
    const { order } = await createOrderB4D8Fixture();

    // 1. Without token -> 401
    try {
      await axios.post(`${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`, { mode: 'preview' });
      throw new Error('Should have failed with 401');
    } catch (err) {
      expect(err.response.status).toBe(401);
    }

    // 2. Non-admin token -> 403
    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
        { mode: 'preview' },
        { headers: { Authorization: `Bearer ${nonAdminToken}` } }
      );
      throw new Error('Should have failed with 403');
    } catch (err) {
      expect(err.response.status).toBe(403);
    }
  });

  test('Guards: Refuses non-completed orders, non-zero commissions, zero current profit', async () => {
    // A. Non-completed order
    const pendingOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{ id: bookFixed20._id.toString(), title: bookFixed20.title, price: 100, quantity: 1 }],
      totalAmount: 100,
      status: 'pending',
      paymentStatus: 'pending'
    });

    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${pendingOrder._id}/repair-zero-profit-commission`,
        { mode: 'preview' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      throw new Error('Should have failed for pending order');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/status 'completed' and verified payment/i);
    }

    // B. Order that already paid a NON-ZERO commission (must be strictly refused)
    const paidOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{ id: bookFixed20._id.toString(), title: bookFixed20.title, price: 100, quantity: 1, unitProfitSnapshot: 20, lineProfitSnapshot: 20 }],
      totalAmount: 100,
      orderProfitTotal: 20,
      status: 'completed',
      paymentStatus: 'completed',
      paymentDetails: { status: 'verified', razorpay_payment_id: 'pay_nonzero' },
      commissionStatus: 'distributed'
    });
    await CommissionTransaction.create({
      orderId: paidOrder._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 20,
      directCommissionAmount: 6,
      referralCommissionAmount: 4,
      status: 'completed'
    });

    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${paidOrder._id}/repair-zero-profit-commission`,
        { mode: 'preview' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      throw new Error('Should have failed for non-zero commission order');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/already has non-zero commission/i);
    }

    // C. Order where current book profit is still ₹0
    const zeroProfitOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{ id: bookZeroProfit._id.toString(), title: bookZeroProfit.title, price: 100, quantity: 1, unitProfitSnapshot: 0, lineProfitSnapshot: 0 }],
      totalAmount: 100,
      status: 'completed',
      paymentStatus: 'completed',
      paymentDetails: { status: 'verified', razorpay_payment_id: 'pay_zeroprofit' },
      commissionStatus: 'distributed'
    });
    await CommissionTransaction.create({
      orderId: zeroProfitOrder._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directCommissionAmount: 0,
      referralCommissionAmount: 0,
      status: 'completed'
    });

    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${zeroProfitOrder._id}/repair-zero-profit-commission`,
        { mode: 'preview' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      throw new Error('Should have failed when book profit is still zero');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/Recomputed order profit is ₹0/i);
    }
  });

  test('Preview Mode: Dry run changes NOTHING (wallets, records unchanged, customer email hidden)', async () => {
    const { order, zeroCommission } = await createOrderB4D8Fixture();

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    const adminBefore = await User.findById(adminUser._id);
    const walletTxBefore = await WalletTransaction.countDocuments();

    // Call Preview
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
      { mode: 'preview' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.mode).toBe('preview');
    expect(res.data.customerName).toBe('Customer Demo');
    expect(res.data.orderTotal).toBe(100);
    expect(res.data.profitBase).toBe(20);

    // Exact expected amounts for ₹20 profit: Buyer ₹6 (30%), Referrer ₹4 (20%), Tree ₹8 (40%), Trust ₹2 (10%)
    expect(res.data.amounts.buyerCashback).toBe(6);
    expect(res.data.amounts.referrerCommission).toBe(4);
    expect(res.data.amounts.treePool).toBe(8);
    expect(res.data.amounts.trustFund).toBe(2);
    expect(res.data.amounts.adminShare).toBe(0);
    expect(res.data.amounts.totalCommission).toBe(20);

    // VERIFY STRICT PRIVACY: customer email MUST NOT be exposed in preview response
    const jsonStr = JSON.stringify(res.data);
    expect(jsonStr).not.toContain('buyer@shreemata.com');

    // VERIFY DRY RUN INTEGRITY: Changes NOTHING
    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    const adminAfter = await User.findById(adminUser._id);
    const walletTxAfter = await WalletTransaction.countDocuments();
    const orderAfter = await Order.findById(order._id);
    const commissionAfter = await CommissionTransaction.findById(zeroCommission._id);

    expect(buyerAfter.wallet).toBe(buyerBefore.wallet);
    expect(referrerAfter.wallet).toBe(referrerBefore.wallet);
    expect(adminAfter.wallet).toBe(adminBefore.wallet);
    expect(walletTxAfter).toBe(walletTxBefore);
    expect(orderAfter.isRepaired).toBeFalsy();
    expect(orderAfter.repairedAt).toBeUndefined();
    expect(commissionAfter.status).toBe('completed'); // Not superseded during preview
  });

  test('Confirm Mode: Exactly pays previewed amounts, updates wallets, supersedes old record, audits order', async () => {
    const { order, zeroCommission } = await createOrderB4D8Fixture();

    const buyerBefore = await User.findById(buyerUser._id);
    const referrerBefore = await User.findById(referrerUser._id);
    const trustFundBefore = await TrustFund.findOne({ fundType: 'trust' });
    const initialTrustBalance = trustFundBefore ? trustFundBefore.balance : 0;

    console.log(`[Before Confirm] Buyer Wallet: ₹${buyerBefore.wallet}, Referrer Wallet: ₹${referrerBefore.wallet}, Trust Fund: ₹${initialTrustBalance}`);

    // Call Confirm
    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
      { mode: 'confirm', reason: 'Repair order b4d8 post book-profit update' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.mode).toBe('confirm');

    // Wallet balances after
    const buyerAfter = await User.findById(buyerUser._id);
    const referrerAfter = await User.findById(referrerUser._id);
    const trustFundAfter = await TrustFund.findOne({ fundType: 'trust' });
    const finalTrustBalance = trustFundAfter ? trustFundAfter.balance : 0;

    console.log(`[After Confirm] Buyer Wallet: ₹${buyerAfter.wallet}, Referrer Wallet: ₹${referrerAfter.wallet}, Trust Fund: ₹${finalTrustBalance}`);

    // Exact expected payouts:
    // Buyer cashback: +₹6
    expect(buyerAfter.wallet).toBe(buyerBefore.wallet + 6);
    // Referrer wallet received referral commission (+₹4) + tree pool allocation (+₹6.40) = +₹10.40
    expect(referrerAfter.wallet).toBeCloseTo(referrerBefore.wallet + 10.4, 2);

    // Ledger entries verified
    const buyerLedger = await WalletTransaction.findOne({ userId: buyerUser._id, orderId: order._id, category: 'direct_commission' });
    expect(buyerLedger).toBeDefined();
    expect(buyerLedger.amount).toBe(6);

    const referrerLedger = await WalletTransaction.findOne({ userId: referrerUser._id, orderId: order._id, category: 'referral_commission' });
    expect(referrerLedger).toBeDefined();
    expect(referrerLedger.amount).toBe(4);

    const treeLedger = await WalletTransaction.findOne({ userId: referrerUser._id, orderId: order._id, category: 'tree_commission' });
    expect(treeLedger).toBeDefined();
    expect(treeLedger.amount).toBe(6.4);

    // Old zero commission record MUST be kept as superseded
    const oldRecord = await CommissionTransaction.findById(zeroCommission._id);
    expect(oldRecord).toBeDefined();
    expect(oldRecord.status).toBe('superseded');
    expect(oldRecord.profitAmount).toBe(0);

    // New commission record created by engine
    const newRecord = await CommissionTransaction.findOne({ orderId: order._id, status: 'completed' });
    expect(newRecord).toBeDefined();
    expect(newRecord._id.toString()).not.toBe(zeroCommission._id.toString());
    expect(newRecord.profitAmount).toBe(20);
    expect(newRecord.directCommissionAmount).toBe(6);
    expect(newRecord.referralCommissionAmount).toBe(4);

    // Order document audit trail
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.isRepaired).toBe(true);
    expect(updatedOrder.repairedAt).toBeDefined();
    expect(updatedOrder.repairedBy.toString()).toBe(adminUser._id.toString());
    expect(updatedOrder.repairReason).toBe('Repair order b4d8 post book-profit update');
    expect(updatedOrder.repairProfitBase).toBe(20);
    expect(updatedOrder.repairAmounts.buyerCashback).toBe(6);
    expect(updatedOrder.repairAmounts.referralCommission).toBe(4);
    expect(updatedOrder.repairStatus).toBe('completed');
    expect(updatedOrder.commissionStatus).toBe('distributed');
    expect(updatedOrder.rewardApplied).toBe(true);
  });

  test('Idempotency & Race Protection: Second confirm and double-click are strictly refused', async () => {
    const { order } = await createOrderB4D8Fixture();

    // First confirm succeeds
    const firstRes = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
      { mode: 'confirm', reason: 'First run' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(firstRes.status).toBe(200);

    const buyerWalletAfterFirst = (await User.findById(buyerUser._id)).wallet;
    expect(buyerWalletAfterFirst).toBe(6);

    // Second confirm call MUST be refused with clear message
    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/repair-zero-profit-commission`,
        { mode: 'confirm', reason: 'Second run' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      throw new Error('Second confirm should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/already been repaired/i);
    }

    // Buyer wallet must not have received any additional money
    const buyerWalletAfterSecond = (await User.findById(buyerUser._id)).wallet;
    expect(buyerWalletAfterSecond).toBe(6);

    // Concurrent double-click simulation on fresh fixture
    const fixture2 = await createOrderB4D8Fixture();
    const results = await Promise.allSettled([
      axios.post(
        `${baseUrl}/api/orders/admin/${fixture2.order._id}/repair-zero-profit-commission`,
        { mode: 'confirm', reason: 'Click 1' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      ),
      axios.post(
        `${baseUrl}/api/orders/admin/${fixture2.order._id}/repair-zero-profit-commission`,
        { mode: 'confirm', reason: 'Click 2' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      )
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.response.status).toBe(400);
  });

  test('Order b4d8 live facts reproduction: ₹100 book, fixed ₹20 profit, full preview-to-confirm lifecycle', async () => {
    // 1. Create order matching live facts of order b4d8:
    // "order b4d8 (a real customer, ₹100 book '10TH PASSING PAKAGE ENGLISH MEDIUM', paid Nov 14)
    // was finalized when the book's profit was ₹0, so a commission record exists with every amount 0
    // and the order has commissionStatus 'distributed'. The book now has a fixed profit of ₹20."
    const b4d8Order = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: bookFixed20._id.toString(),
        title: '10TH PASSING PAKAGE ENGLISH MEDIUM',
        author: 'Shree Mata Expert Editorial Board',
        price: 100,
        quantity: 1,
        profitTypeSnapshot: 'fixed',
        profitValueSnapshot: 0,
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0,
        cashbackAmount: 0,
        cashbackPercentage: 0
      }],
      totalAmount: 100,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'completed',
      paymentStatus: 'completed',
      paymentType: 'online',
      razorpay_payment_id: 'pay_b4d8_live_mock',
      paymentDetails: {
        status: 'verified',
        razorpay_payment_id: 'pay_b4d8_live_mock',
        verifiedAt: new Date('2026-11-14T09:30:00Z')
      },
      commissionStatus: 'distributed',
      rewardApplied: true
    });

    const oldZeroRecord = await CommissionTransaction.create({
      orderId: b4d8Order._id,
      purchaser: buyerUser._id,
      orderAmount: 100,
      profitAmount: 0,
      directReferrer: buyerUser._id,
      directCommissionAmount: 0,
      referralReferrer: referrerUser._id,
      referralCommissionAmount: 0,
      adminRecipient: adminUser._id,
      adminCommissionAmount: 0,
      treePoolTotal: 0,
      treeCommissions: [],
      trustFundAmount: 0,
      devTrustFundAmount: 0,
      remainderToDevFund: 0,
      status: 'completed',
      processedAt: new Date('2026-11-14T09:35:00Z')
    });

    // 2. Preview
    const previewRes = await axios.post(
      `${baseUrl}/api/orders/admin/${b4d8Order._id}/repair-zero-profit-commission`,
      { mode: 'preview' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(previewRes.status).toBe(200);
    expect(previewRes.data.success).toBe(true);
    expect(previewRes.data.customerName).toBe('Customer Demo');
    expect(previewRes.data.orderTotal).toBe(100);
    expect(previewRes.data.profitBase).toBe(20);
    expect(previewRes.data.amounts.buyerCashback).toBe(6);
    expect(previewRes.data.amounts.referrerCommission).toBe(4);
    expect(previewRes.data.amounts.treePool).toBe(8);
    expect(previewRes.data.amounts.trustFund).toBe(2);
    expect(previewRes.data.amounts.totalCommission).toBe(20);

    // 3. Confirm
    const confirmRes = await axios.post(
      `${baseUrl}/api/orders/admin/${b4d8Order._id}/repair-zero-profit-commission`,
      { mode: 'confirm', reason: 'Repair order b4d8: book profit updated to ₹20' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.data.success).toBe(true);
    expect(confirmRes.data.order.isRepaired).toBe(true);
    expect(confirmRes.data.order.repairProfitBase).toBe(20);
    expect(confirmRes.data.order.repairAmounts.buyerCashback).toBe(6);
    expect(confirmRes.data.order.repairAmounts.referralCommission).toBe(4);

    // 4. Verify old record is superseded, NOT deleted
    const oldAfter = await CommissionTransaction.findById(oldZeroRecord._id);
    expect(oldAfter).toBeDefined();
    expect(oldAfter.status).toBe('superseded');
    expect(oldAfter.profitAmount).toBe(0);

    // 5. Verify new record exists and has ₹20 profit
    const newAfter = await CommissionTransaction.findOne({ orderId: b4d8Order._id, status: 'completed' });
    expect(newAfter).toBeDefined();
    expect(newAfter.profitAmount).toBe(20);
    expect(newAfter.directCommissionAmount).toBe(6);
    expect(newAfter.referralCommissionAmount).toBe(4);
  });

});
