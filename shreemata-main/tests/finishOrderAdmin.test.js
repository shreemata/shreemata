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
const CommissionSettings = require('../models/CommissionSettings');
const { Invoice } = require('../routes/invoices');
const emailService = require('../utils/emailService');

let mongoServer;
let app;
let server;
let baseUrl;
let testAdmin;
let testBuyer;
let testReferrer;
let adminToken;
let buyerToken;

const JWT_SECRET = 'test_jwt_secret_finish_order_2026';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PORT = '0';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  app.use('/api/payments', require('../routes/payments'));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Mock emails
  jest.spyOn(emailService, 'sendOrderConfirmationEmail').mockResolvedValue({ success: true });
  jest.spyOn(emailService, 'sendAdminNotification').mockResolvedValue({ success: true });

  await CommissionSettings.create({
    directCommissionPercent: 3,
    referralCommissionPercent: 2,
    treeCommissionPoolPercent: 20,
    adminCommissionPercent: 5
  });

  testAdmin = await User.create({
    name: 'Admin User',
    email: 'admin.finish@test.com',
    password: 'password123',
    role: 'admin',
    isMember: true,
    treeLevel: 1,
    wallet: 0
  });

  testReferrer = await User.create({
    name: 'Referrer User',
    email: 'referrer.finish@test.com',
    password: 'password123',
    role: 'customer',
    referralCode: 'REF_FINISH_999',
    isMember: true,
    treeParent: testAdmin._id,
    treeLevel: 2,
    wallet: 0
  });

  testBuyer = await User.create({
    name: 'Buyer User',
    email: 'buyer.finish@test.com',
    password: 'password123',
    role: 'customer',
    referredBy: 'REF_FINISH_999',
    wallet: 0
  });

  adminToken = jwt.sign({ id: testAdmin._id.toString(), role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  buyerToken = jwt.sign({ id: testBuyer._id.toString(), role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
  if (mongoose.connection) await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
});

describe('Admin Approval Paths through finalizePaidOrder', () => {

  test('1. verify-payment calls finalizePaidOrder and sets finalizationStatus="completed"', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Science 10',
        price: 400,
        quantity: 1,
        unitProfitSnapshot: 100,
        lineProfitSnapshot: 100
      }],
      totalAmount: 400,
      orderProfitTotal: 100,
      profitAmount: 100,
      paymentType: 'online',
      status: 'pending',
      paymentStatus: 'pending'
    });

    const res = await axios.post(
      `${baseUrl}/api/orders/admin/verify-payment/${order._id}`,
      { utrNumber: 'UTR1234567890', paymentMethod: 'online', adminNotes: 'Verified via bank' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.status).toBe('completed');
    expect(updated.paymentStatus).toBe('completed');
    expect(updated.finalizationStatus).toBe('completed');
    expect(updated.finalizedAt).toBeDefined();
    expect(updated.paymentDetails.utrNumber).toBe('UTR1234567890');

    // Tax invoice should exist
    const inv = await Invoice.findOne({ orderId: order._id });
    expect(inv).not.toBeNull();
  });

  test('2. Repeated verify-payment is idempotent (no duplicate commission, invoice, or side-effects)', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Math 10',
        price: 500,
        quantity: 1,
        unitProfitSnapshot: 150,
        lineProfitSnapshot: 150
      }],
      totalAmount: 500,
      orderProfitTotal: 150,
      profitAmount: 150,
      paymentType: 'transfer',
      status: 'pending',
      paymentStatus: 'pending'
    });

    // First call
    const res1 = await axios.post(
      `${baseUrl}/api/orders/admin/verify-payment/${order._id}`,
      { utrNumber: 'UTR-FIRST-RUN' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res1.data.success).toBe(true);
    expect(res1.data.alreadyProcessed).toBe(false);

    const invCount1 = await Invoice.countDocuments({ orderId: order._id });
    const commCount1 = await CommissionTransaction.countDocuments({ orderId: order._id });

    // Second call
    const res2 = await axios.post(
      `${baseUrl}/api/orders/admin/verify-payment/${order._id}`,
      { utrNumber: 'UTR-SECOND-RUN' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res2.data.success).toBe(true);
    expect(res2.data.alreadyProcessed).toBe(true);

    const invCount2 = await Invoice.countDocuments({ orderId: order._id });
    const commCount2 = await CommissionTransaction.countDocuments({ orderId: order._id });

    expect(invCount2).toBe(invCount1);
    expect(commCount2).toBe(commCount1);
  });

  test('3. approve-cheque-payment calls finalizePaidOrder and finalizes order', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'English 10',
        price: 300,
        quantity: 1,
        unitProfitSnapshot: 80,
        lineProfitSnapshot: 80
      }],
      totalAmount: 300,
      orderProfitTotal: 80,
      profitAmount: 80,
      paymentType: 'cheque',
      paymentDetails: {
        status: 'pending_verification',
        chequeNumber: 'CHQ-778899'
      },
      status: 'pending',
      paymentStatus: 'pending'
    });

    const res = await axios.post(
      `${baseUrl}/api/payments/admin/approve-cheque-payment/${order._id}`,
      { approvalNotes: 'Cheque cleared on Nov 18' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.status).toBe('completed');
    expect(updated.paymentStatus).toBe('completed');
    expect(updated.finalizationStatus).toBe('completed');
    expect(updated.finalizedAt).toBeDefined();
    expect(updated.paymentDetails.adminNotes).toBe('Cheque cleared on Nov 18');
  });

  test('4. DRY-RUN finish-order-preview changes NOTHING in DB', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Preview Book',
        price: 600,
        quantity: 1,
        unitProfitSnapshot: 200,
        lineProfitSnapshot: 200
      }],
      totalAmount: 600,
      orderProfitTotal: 200,
      profitAmount: 200,
      paymentType: 'online',
      status: 'pending',
      paymentStatus: 'completed'
    });

    const beforeDoc = await Order.findById(order._id).lean();
    const invoicesBefore = await Invoice.countDocuments();
    const commBefore = await CommissionTransaction.countDocuments();

    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/finish-order-preview`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.orderAmount).toBe(600);
    expect(res.data.profitBase).toBe(200);
    expect(res.data.customer.name).toBe(testBuyer.name);
    expect(res.data.commissionBreakdown.total).toBeGreaterThan(0);

    const afterDoc = await Order.findById(order._id).lean();
    const invoicesAfter = await Invoice.countDocuments();
    const commAfter = await CommissionTransaction.countDocuments();

    // Exactly unchanged!
    expect(JSON.stringify(beforeDoc)).toBe(JSON.stringify(afterDoc));
    expect(invoicesAfter).toBe(invoicesBefore);
    expect(commAfter).toBe(commBefore);
  });

  test('5. finish-order server rejects request without acknowledgement for unpaid-looking order (400)', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Unpaid Physics',
        price: 500,
        quantity: 1
      }],
      totalAmount: 500,
      paymentType: 'online',
      razorpay_order_id: 'order_test_unpaid_12345',
      status: 'pending',
      paymentStatus: 'pending'
    });

    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      // should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAcknowledgement).toBe(true);
      expect(err.response.data.error).toMatch(/Acknowledgement required/i);
    }
  });

  test('6. finish-order succeeds when acknowledgedNoCapturedPayment: true is provided', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Unpaid Physics Acknowledged',
        price: 500,
        quantity: 1,
        unitProfitSnapshot: 100,
        lineProfitSnapshot: 100
      }],
      totalAmount: 500,
      orderProfitTotal: 100,
      profitAmount: 100,
      paymentType: 'online',
      razorpay_order_id: 'order_test_unpaid_ack_67890',
      status: 'pending',
      paymentStatus: 'pending'
    });

    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
      { acknowledgedNoCapturedPayment: true },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.status).toBe('completed');
    expect(updated.finalizationStatus).toBe('completed');
    expect(updated.finalizedAt).toBeDefined();
  });

  test('7. Non-admin gets 401/403 on both preview and finish endpoints', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{ id: new mongoose.Types.ObjectId(), type: 'book', title: 'Restricted', price: 200, quantity: 1 }],
      totalAmount: 200,
      status: 'pending'
    });

    // No token (401)
    await expect(axios.post(`${baseUrl}/api/orders/admin/${order._id}/finish-order-preview`))
      .rejects.toMatchObject({ response: { status: 401 } });

    await expect(axios.post(`${baseUrl}/api/orders/admin/${order._id}/finish-order`))
      .rejects.toMatchObject({ response: { status: 401 } });

    // Customer token (403)
    await expect(axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/finish-order-preview`,
      {},
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    )).rejects.toMatchObject({ response: { status: 403 } });

    await expect(axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
      {},
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    )).rejects.toMatchObject({ response: { status: 403 } });
  });

  test('8. Zero-profit order finishes without commission transaction', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Zero Profit Book',
        price: 250,
        quantity: 1,
        unitProfitSnapshot: 0,
        lineProfitSnapshot: 0
      }],
      totalAmount: 250,
      orderProfitTotal: 0,
      profitAmount: 0,
      paymentType: 'transfer',
      paymentDetails: { utrNumber: 'UTR-ZERO-PROFIT' },
      status: 'pending',
      paymentStatus: 'completed'
    });

    const res = await axios.post(
      `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const comm = await CommissionTransaction.findOne({ orderId: order._id });
    expect(comm).toBeNull(); // No commission transaction created for zero profit

    const updated = await Order.findById(order._id);
    expect(updated.finalizationStatus).toBe('completed');
  });

  test('9. Already-finalized order returns 409 Conflict', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{ id: new mongoose.Types.ObjectId(), type: 'book', title: 'Already Done', price: 100, quantity: 1 }],
      totalAmount: 100,
      status: 'completed',
      paymentStatus: 'completed',
      finalizationStatus: 'completed',
      finalizedAt: new Date()
    });

    try {
      await axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err.response.status).toBe(409);
      expect(err.response.data.error).toMatch(/already finalized/i);
    }
  });

  test('10. Concurrent finish-order calls produce ONE finalization and ONE commission record', async () => {
    const order = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: new mongoose.Types.ObjectId(),
        type: 'book',
        title: 'Concurrent Book',
        price: 800,
        quantity: 1,
        unitProfitSnapshot: 300,
        lineProfitSnapshot: 300
      }],
      totalAmount: 800,
      orderProfitTotal: 300,
      profitAmount: 300,
      paymentType: 'transfer',
      paymentDetails: { utrNumber: 'UTR-CONCURRENCY-TEST' },
      status: 'pending',
      paymentStatus: 'completed'
    });

    const [res1, res2] = await Promise.all([
      axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      ),
      axios.post(
        `${baseUrl}/api/orders/admin/${order._id}/finish-order`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      )
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const commCount = await CommissionTransaction.countDocuments({ orderId: order._id });
    expect(commCount).toBe(1);

    const invCount = await Invoice.countDocuments({ orderId: order._id });
    expect(invCount).toBe(1);
  });
});
