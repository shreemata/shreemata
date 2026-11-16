/** @jest-environment node */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const TrustFund = require('../models/TrustFund');
const { finalizePaidOrder } = require('../services/orderFinalizer');
const paymentsRouter = require('../routes/payments');
const ordersRouter = require('../routes/orders');

let mongoServer;
let app;
let server;
let baseUrl;

let adminUser;
let referrerUser;
let buyerUser;
let adminToken;
let buyerToken;

let bookFixed20;
let bookPercent10;
let bookZeroProfit;
let bookPreOrder;

const JWT_SECRET = 'test_secret_key_12345';
const RAZORPAY_KEY_SECRET = 'rzp_test_secret_12345';

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key_12345';
  process.env.RAZORPAY_KEY_SECRET = RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = RAZORPAY_KEY_SECRET;

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());

  // Mount routes
  app.use('/api/payments', paymentsRouter);
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

  // Setup CommissionSettings: 30% buyer (6), 20% direct referrer (4), 40% tree pool (8), 10% trust fund (2)
  await CommissionSettings.create({
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

  // Admin user at tree root
  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'Password123!',
    role: 'admin',
    referralCode: 'ADMINREF',
    treeLevel: 0,
    wallet: 0
  });

  // Referrer user at tree level 1
  referrerUser = await User.create({
    name: 'Referrer User',
    email: 'referrer@example.com',
    password: 'Password123!',
    role: 'customer',
    referralCode: 'REF123',
    treeLevel: 1,
    treeParent: adminUser._id,
    treePosition: 0,
    isMember: true,
    wallet: 0
  });

  // Buyer user at tree level 2 (referred by REF123)
  buyerUser = await User.create({
    name: 'Buyer User',
    email: 'buyer@example.com',
    password: 'Password123!',
    role: 'customer',
    referredBy: 'REF123',
    referralCode: 'BUYER456',
    treeLevel: 2,
    treeParent: referrerUser._id,
    treePosition: 0,
    isMember: true,
    wallet: 0
  });

  adminToken = jwt.sign({ id: adminUser._id, role: 'admin', email: adminUser.email }, JWT_SECRET);
  buyerToken = jwt.sign({ id: buyerUser._id, role: 'customer', email: buyerUser.email }, JWT_SECRET);

  // Book A: Fixed Amount profit 20, price 100
  bookFixed20 = await Book.create({
    title: 'Fixed Profit Book',
    author: 'Author A',
    price: 100,
    profitType: 'fixed',
    profitValue: 20,
    profitConfigured: true
  });

  // Book B: Percentage profit 10%, price 200 (profit = 20)
  bookPercent10 = await Book.create({
    title: 'Percentage Profit Book',
    author: 'Author B',
    price: 200,
    profitType: 'percentage',
    profitValue: 10,
    profitConfigured: true
  });

  // Book C: Zero profit book, price 100
  bookZeroProfit = await Book.create({
    title: 'Zero Profit Book',
    author: 'Author C',
    price: 100,
    profitType: 'fixed',
    profitValue: 0,
    profitConfigured: false
  });

  // Book D: Book for post-order edit test
  bookPreOrder = await Book.create({
    title: 'Pre-Order Edit Book',
    author: 'Author D',
    price: 100,
    profitType: 'fixed',
    profitValue: 20,
    profitConfigured: true
  });
});

function signRazorpay(orderId, paymentId) {
  return crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

describe('Commission Profit Determination & Restoration Test Suite', () => {

  test('1. VERIFY: Book with Fixed Amount profit 20 whose order snapshots are 0 (reproduce production) distributes correct commissions and is idempotent', async () => {
    // Reproduce production: Order exists with orderProfitTotal = 0, items snapshots = 0
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
        lineProfitSnapshot: 0
      }],
      totalAmount: 160,
      courierCharge: 60,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'pending',
      razorpay_order_id: 'order_rzp_verify_1',
      rewardApplied: false
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;
    expect(buyerBefore).toBe(0);
    expect(referrerBefore).toBe(0);

    const paymentId = 'pay_verify_1';
    const signature = signRazorpay(order.razorpay_order_id, paymentId);

    // Call /api/payments/verify with raw items (as sent from frontend cart)
    const res1 = await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        items: [{
          id: bookFixed20._id.toString(),
          title: bookFixed20.title,
          price: 100,
          quantity: 1
        }],
        totalAmount: 160
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res1.status).toBe(200);
    expect(res1.data.success).toBe(true);

    // Verify wallet balances after first call:
    // Profit = ₹20
    // Buyer cashback: 30% of ₹20 = ₹6.00
    // Direct Referrer: 20% of ₹20 = ₹4.00 (+ level 1 tree pool ₹8.00 = ₹12.00)
    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Verify] Buyer wallet: ${buyerBefore} -> ${buyerAfter} (+₹${buyerAfter - buyerBefore})`);
    console.log(`[Verify] Referrer wallet: ${referrerBefore} -> ${referrerAfter} (+₹${referrerAfter - referrerBefore})`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    // Verify CommissionTransaction
    const txCount = await CommissionTransaction.countDocuments({ orderId: order._id });
    expect(txCount).toBe(1);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
    expect(tx.status).toBe('completed');

    // Refreshed order fields
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.orderProfitTotal).toBe(20);
    expect(updatedOrder.profitAmount).toBe(20);
    expect(updatedOrder.items[0].unitProfitSnapshot).toBe(20);
    expect(updatedOrder.items[0].lineProfitSnapshot).toBe(20);
    expect(updatedOrder.commissionStatus).toBe('distributed');

    // Second call changes nothing (Idempotency)
    const res2 = await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        items: [{
          id: bookFixed20._id.toString(),
          title: bookFixed20.title,
          price: 100,
          quantity: 1
        }],
        totalAmount: 160
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res2.status).toBe(200);
    expect(res2.data.alreadyProcessed).toBe(true);

    const buyerAfterSecond = (await User.findById(buyerUser._id)).wallet;
    const referrerAfterSecond = (await User.findById(referrerUser._id)).wallet;
    expect(buyerAfterSecond).toBe(6);
    expect(referrerAfterSecond).toBe(12);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(1);
  });

  test('2. WEBHOOK: Book with Fixed Amount profit 20 with zero order snapshots is finalized via payment.captured webhook with exact commissions', async () => {
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
        lineProfitSnapshot: 0
      }],
      totalAmount: 160,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'pending',
      razorpay_order_id: 'order_rzp_webhook_1',
      rewardApplied: false
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    const webhookBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_1',
            order_id: order.razorpay_order_id,
            amount: 16000,
            status: 'captured'
          }
        }
      }
    };
    const bodyStr = JSON.stringify(webhookBody);
    const whSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(bodyStr).digest('hex');

    const res1 = await axios.post(`${baseUrl}/api/payments/webhook`, webhookBody, {
      headers: { 'x-razorpay-signature': whSignature }
    });
    expect(res1.status).toBe(200);

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Webhook] Buyer wallet: ${buyerBefore} -> ${buyerAfter} (+₹${buyerAfter - buyerBefore})`);
    console.log(`[Webhook] Referrer wallet: ${referrerBefore} -> ${referrerAfter} (+₹${referrerAfter - referrerBefore})`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(1);

    // Duplicate webhook changes nothing
    await axios.post(`${baseUrl}/api/payments/webhook`, webhookBody, {
      headers: { 'x-razorpay-signature': whSignature }
    });
    expect((await User.findById(buyerUser._id)).wallet).toBe(6);
    expect((await User.findById(referrerUser._id)).wallet).toBe(12);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(1);
  });

  test('3. RECONCILE: Admin reconcile-razorpay finalizes order with zero snapshots, determines profit 20 and distributes commissions', async () => {
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
        lineProfitSnapshot: 0
      }],
      totalAmount: 160,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'pending',
      razorpay_order_id: 'order_rzp_reconcile_1',
      rewardApplied: false
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    // Direct invocation of finalizePaidOrder (as done by handleReconcileRazorpay upon captured payment)
    const result1 = await finalizePaidOrder(order, {
      razorpay_payment_id: 'pay_reconcile_captured_1',
      razorpay_order_id: order.razorpay_order_id
    });

    expect(result1.success).toBe(true);
    expect(result1.alreadyProcessed).toBe(false);

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Reconcile] Buyer wallet: ${buyerBefore} -> ${buyerAfter} (+₹${buyerAfter - buyerBefore})`);
    console.log(`[Reconcile] Referrer wallet: ${referrerBefore} -> ${referrerAfter} (+₹${referrerAfter - referrerBefore})`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(1);

    // Second call changes nothing
    const result2 = await finalizePaidOrder(order, {
      razorpay_payment_id: 'pay_reconcile_captured_1',
      razorpay_order_id: order.razorpay_order_id
    });
    expect(result2.alreadyProcessed).toBe(true);
    expect((await User.findById(buyerUser._id)).wallet).toBe(6);
    expect((await User.findById(referrerUser._id)).wallet).toBe(12);
  });

  test('4. ADMIN APPROVAL: Cheque/Transfer order with zero snapshots has profit determined and commissions distributed upon admin approval', async () => {
    // Cheque orders created via create-pending have status 'pending_payment_verification' and no snapshots
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
        lineProfitSnapshot: 0
      }],
      totalAmount: 160,
      paymentType: 'cheque',
      status: 'pending_payment_verification',
      paymentDetails: {
        type: 'cheque',
        status: 'awaiting_upload'
      },
      orderProfitTotal: 0,
      profitAmount: 0,
      rewardApplied: false
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    // Admin verifies and approves cheque payment
    const result1 = await finalizePaidOrder(order, {
      paymentType: 'cheque',
      paymentDetails: { status: 'verified', verifiedAt: new Date() }
    });

    expect(result1.success).toBe(true);

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Admin Cheque Approval] Buyer wallet: ${buyerBefore} -> ${buyerAfter} (+₹${buyerAfter - buyerBefore})`);
    console.log(`[Admin Cheque Approval] Referrer wallet: ${referrerBefore} -> ${referrerAfter} (+₹${referrerAfter - referrerBefore})`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(1);

    // Second call changes nothing
    const result2 = await finalizePaidOrder(order, { paymentType: 'cheque' });
    expect(result2.alreadyProcessed).toBe(true);
    expect((await User.findById(buyerUser._id)).wallet).toBe(6);
    expect((await User.findById(referrerUser._id)).wallet).toBe(12);
  });

  test('5. PERCENTAGE-PROFIT BOOK: Correctly computes percentage profit and distributes commission', async () => {
    // Book B: price 200, profitValue: 10 (percentage) => unitProfit = 20
    const order = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: bookPercent10._id.toString(),
        title: bookPercent10.title,
        price: 200,
        quantity: 1,
        profitTypeSnapshot: 'fixed',
        profitValueSnapshot: 0,
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0
      }],
      totalAmount: 200,
      orderProfitTotal: 0,
      profitAmount: 0,
      status: 'pending',
      razorpay_order_id: 'order_rzp_percent_1'
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    await finalizePaidOrder(order, {
      razorpay_payment_id: 'pay_percent_1',
      razorpay_order_id: order.razorpay_order_id
    });

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Percentage Book] Profit: ₹20. Buyer: ${buyerBefore} -> ${buyerAfter} (+₹${buyerAfter - buyerBefore})`);
    console.log(`[Percentage Book] Referrer: ${referrerBefore} -> ${referrerAfter} (+₹${referrerAfter - referrerBefore})`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
  });

  test('6. ZERO-PROFIT BOOK: No commission is distributed for book with ₹0 profit', async () => {
    // Book C: profitValue 0
    const order = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: bookZeroProfit._id.toString(),
        title: bookZeroProfit.title,
        price: 100,
        quantity: 1
      }],
      totalAmount: 100,
      status: 'pending',
      razorpay_order_id: 'order_rzp_zero_1'
    });

    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    const res = await finalizePaidOrder(order, {
      razorpay_payment_id: 'pay_zero_1',
      razorpay_order_id: order.razorpay_order_id
    });

    expect(res.success).toBe(true);

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    console.log(`[Zero Profit Book] Buyer wallet unchanged: ${buyerBefore} == ${buyerAfter}`);
    console.log(`[Zero Profit Book] Referrer wallet unchanged: ${referrerBefore} == ${referrerAfter}`);

    expect(buyerAfter).toBe(0);
    expect(referrerAfter).toBe(0);
    expect(await CommissionTransaction.countDocuments({ orderId: order._id })).toBe(0);

    const refreshedOrder = await Order.findById(order._id);
    expect(refreshedOrder.orderProfitTotal).toBe(0);
  });

  test('7. PROFIT EDITED AFTER ORDER PLACED: Order retains original snapshot profit and does not use edited book profit', async () => {
    // 1) Order placed when book had profit ₹20. Authoritative snapshots established at placement:
    const order = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: bookPreOrder._id.toString(),
        title: bookPreOrder.title,
        price: 100,
        quantity: 1,
        profitTypeSnapshot: 'fixed',
        profitValueSnapshot: 20,
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20
      }],
      totalAmount: 160,
      orderProfitTotal: 20,
      profitAmount: 20,
      status: 'pending',
      razorpay_order_id: 'order_rzp_pre_edit_1'
    });

    // 2) Admin edits book profit to ₹50 in Manage Books AFTER the order was placed
    await Book.findByIdAndUpdate(bookPreOrder._id, {
      profitValue: 50
    });
    const editedBook = await Book.findById(bookPreOrder._id);
    expect(editedBook.profitValue).toBe(50);

    // 3) Payment is verified now
    const buyerBefore = (await User.findById(buyerUser._id)).wallet;
    const referrerBefore = (await User.findById(referrerUser._id)).wallet;

    await finalizePaidOrder(order, {
      razorpay_payment_id: 'pay_pre_edit_1',
      razorpay_order_id: order.razorpay_order_id
    });

    const buyerAfter = (await User.findById(buyerUser._id)).wallet;
    const referrerAfter = (await User.findById(referrerUser._id)).wallet;

    // Must distribute based on original ₹20 profit (buyer ₹6, referrer ₹4 direct + ₹8 tree = ₹12), NOT based on ₹50!
    console.log(`[Edited Profit Test] Profit base used: ₹20 (original snapshot, not edited ₹50)`);
    console.log(`[Edited Profit Test] Buyer wallet: ${buyerBefore} -> ${buyerAfter} (+₹6)`);
    console.log(`[Edited Profit Test] Referrer wallet: ${referrerBefore} -> ${referrerAfter} (+₹12)`);

    expect(buyerAfter).toBe(6);
    expect(referrerAfter).toBe(12);

    const tx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6);
    expect(tx.referralCommissionAmount).toBe(4);
    expect(tx.treePoolTotal).toBe(8);
    expect(tx.trustFundAmount).toBe(2);
  });
});
