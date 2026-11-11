const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { setupTestDB, teardownTestDB } = require('./setup');
const Order = require('../models/Order');
const User = require('../models/User');

const mockFetchPayments = jest.fn();
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      fetchPayments: (...args) => mockFetchPayments(...args)
    }
  }));
});

const { Invoice, autoGenerateProformaInvoiceForOrder, autoGenerateInvoiceForOrder } = require('../routes/invoices');
const { finalizePaidOrder } = require('../services/orderFinalizer');

describe('Invoice & Idempotent Order Finalizer Test Suite', () => {
  let server;
  let client;
  let ownerUser;
  let ownerToken;
  let adminUser;
  let adminToken;
  let otherUser;
  let otherToken;

  const TEST_JWT_SECRET = 'test_jwt_secret_finalizer_98765';
  const TEST_WEBHOOK_SECRET = 'test_webhook_secret_razorpay_123';

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key_123';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_123';
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    // Create users
    ownerUser = await User.create({
      name: 'Finalizer Owner',
      email: 'owner_fin@example.com',
      phone: '9888800001',
      password: 'password123',
      role: 'customer'
    });
    ownerToken = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, TEST_JWT_SECRET, { expiresIn: '1d' });

    adminUser = await User.create({
      name: 'Finalizer Admin',
      email: 'admin_fin@example.com',
      phone: '9888800002',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, TEST_JWT_SECRET, { expiresIn: '1d' });

    otherUser = await User.create({
      name: 'Other Customer',
      email: 'other_fin@example.com',
      phone: '9888800003',
      password: 'password123',
      role: 'customer'
    });
    otherToken = jwt.sign({ id: otherUser._id, role: otherUser.role }, TEST_JWT_SECRET, { expiresIn: '1d' });

    // Build Express app matching server.js webhook registration
    const app = express();
    // Register raw buffer on webhook route
    app.post('/api/payments/webhook', express.raw({ type: 'application/json' }));
    app.use(express.json());

    app.use('/api/invoices', require('../routes/invoices'));
    app.use('/api/payments', require('../routes/payments'));
    app.use('/api/orders', require('../routes/orders'));

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
  });

  afterAll(async () => {
    if (server) await new Promise((res) => server.close(res));
    await teardownTestDB();
  });

  beforeEach(async () => {
    await Order.deleteMany({});
    await Invoice.deleteMany({});
    mockFetchPayments.mockReset();
  });

  describe('1. finalizePaidOrder Idempotency & Promotion', () => {
    it('finalizes a pending order and creates a Tax Invoice', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Book 1', price: 250, quantity: 2, type: 'book' }],
        totalAmount: 500,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_rzp_111'
      });

      const res1 = await finalizePaidOrder(order, {
        razorpay_payment_id: 'pay_rzp_111',
        razorpay_order_id: 'order_rzp_111'
      });

      expect(res1.success).toBe(true);
      expect(res1.alreadyProcessed).toBeFalsy();
      expect(res1.order.status).toBe('completed');
      expect(res1.order.paymentStatus).toBe('completed');
      expect(res1.order.paymentDetails.status).toBe('verified');
      expect(res1.order.confirmationEmailSent).toBe(true);

      // Verify Tax Invoice was generated
      const taxInvoice = await Invoice.findOne({ orderId: order._id });
      expect(taxInvoice).toBeDefined();
      expect(taxInvoice.documentType).toBe('tax_invoice');
      expect(taxInvoice.invoiceNumber).toMatch(/^SM-HBL-/);
    });

    it('is strictly idempotent when called multiple times on the same order', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Book 2', price: 300, quantity: 1, type: 'book' }],
        totalAmount: 300,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_rzp_222'
      });

      const firstCall = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_rzp_222',
        razorpay_order_id: 'order_rzp_222'
      });
      expect(firstCall.success).toBe(true);

      const invoiceCountAfterFirst = await Invoice.countDocuments({ orderId: order._id });
      expect(invoiceCountAfterFirst).toBe(1);

      // Second call (simulating retry / duplicate webhook)
      const secondCall = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_rzp_222',
        razorpay_order_id: 'order_rzp_222'
      });

      expect(secondCall.success).toBe(true);
      expect(secondCall.alreadyProcessed).toBe(true);

      const invoiceCountAfterSecond = await Invoice.countDocuments({ orderId: order._id });
      expect(invoiceCountAfterSecond).toBe(1); // No duplicate invoice

      const refreshed = await Order.findById(order._id);
      expect(refreshed.status).toBe('completed');
      expect(refreshed.paymentStatus).toBe('completed');
      expect(refreshed.confirmationEmailSent).toBe(true);
    });

    it('promotes an existing Proforma Invoice into a Tax Invoice upon finalization', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Proforma Book', price: 400, quantity: 1, type: 'book' }],
        totalAmount: 400,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_rzp_proforma'
      });

      // 1. Unverified order creates Proforma
      const proforma = await autoGenerateProformaInvoiceForOrder(order);
      expect(proforma).not.toBeNull();
      expect(proforma.documentType).toBe('proforma_invoice');
      expect(proforma.invoiceNumber).toMatch(/^SM-PRI-/);
      const originalInvoiceId = proforma._id.toString();

      // 2. Finalize order
      const finalResult = await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_rzp_proforma_captured',
        razorpay_order_id: 'order_rzp_proforma'
      });

      expect(finalResult.success).toBe(true);

      // Verify the SAME invoice document was promoted
      const invoices = await Invoice.find({ orderId: order._id });
      expect(invoices.length).toBe(1);
      expect(invoices[0]._id.toString()).toBe(originalInvoiceId);
      expect(invoices[0].documentType).toBe('tax_invoice');
      expect(invoices[0].invoiceNumber).toMatch(/^SM-HBL-/);
      expect(invoices[0].documentNumbers?.tax_invoice).toMatch(/^SM-HBL-/);
    });
  });

  describe('2. Razorpay Webhook', () => {
    function computeWebhookSignature(payloadBuffer, secret) {
      return crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex');
    }

    it('rejects webhooks with missing signature (400)', async () => {
      const res = await client.post('/api/payments/webhook', { event: 'payment.captured' });
      expect(res.status).toBe(400);
      expect(res.data.toString()).toMatch(/Missing signature/);
    });

    it('rejects webhooks with invalid signature (400)', async () => {
      const rawPayload = JSON.stringify({ event: 'payment.captured' });
      const res = await client.post('/api/payments/webhook', rawPayload, {
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'invalid_signature_hex'
        }
      });
      expect(res.status).toBe(400);
      expect(res.data.toString()).toMatch(/Invalid signature/);
    });

    it('processes payment.captured event and finalizes order (200 OK)', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Webhook Book', price: 150, quantity: 1, type: 'book' }],
        totalAmount: 150,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_webhook_cap_1'
      });

      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_cap_1',
              order_id: 'order_webhook_cap_1',
              status: 'captured'
            }
          }
        }
      });

      const signature = computeWebhookSignature(Buffer.from(webhookPayload, 'utf8'), TEST_WEBHOOK_SECRET);

      const res = await client.post('/api/payments/webhook', webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature
        }
      });

      expect(res.status).toBe(200);
      expect(res.data.toString()).toBe('OK');

      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('completed');
      expect(updated.paymentStatus).toBe('completed');
      expect(updated.razorpay_payment_id).toBe('pay_webhook_cap_1');

      const invoice = await Invoice.findOne({ orderId: order._id });
      expect(invoice).not.toBeNull();
      expect(invoice.documentType).toBe('tax_invoice');
    });

    it('processes order.paid event and finalizes order (200 OK)', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Order Paid Book', price: 199, quantity: 1, type: 'book' }],
        totalAmount: 199,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_webhook_paid_2'
      });

      const webhookPayload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: {
            entity: {
              id: 'order_webhook_paid_2',
              status: 'paid'
            }
          },
          payment: {
            entity: {
              id: 'pay_webhook_paid_2',
              order_id: 'order_webhook_paid_2'
            }
          }
        }
      });

      const signature = computeWebhookSignature(Buffer.from(webhookPayload, 'utf8'), TEST_WEBHOOK_SECRET);

      const res = await client.post('/api/payments/webhook', webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature
        }
      });

      expect(res.status).toBe(200);
      expect(res.data.toString()).toBe('OK');

      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('completed');
      expect(updated.paymentStatus).toBe('completed');
    });

    it('handles duplicate webhook delivery safely without failing or duplicating invoice', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Dup Book', price: 299, quantity: 1, type: 'book' }],
        totalAmount: 299,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_webhook_dup_3'
      });

      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_dup_3',
              order_id: 'order_webhook_dup_3',
              status: 'captured'
            }
          }
        }
      });

      const signature = computeWebhookSignature(Buffer.from(webhookPayload, 'utf8'), TEST_WEBHOOK_SECRET);

      // Delivery 1
      const res1 = await client.post('/api/payments/webhook', webhookPayload, {
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }
      });
      expect(res1.status).toBe(200);

      // Delivery 2
      const res2 = await client.post('/api/payments/webhook', webhookPayload, {
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }
      });
      expect(res2.status).toBe(200);

      const invoices = await Invoice.find({ orderId: order._id });
      expect(invoices.length).toBe(1);
    });
  });

  describe('3. Admin Check With Razorpay & Finish Button', () => {
    it('denies access to non-admin customers (403)', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [],
        totalAmount: 100,
        status: 'pending',
        razorpay_order_id: 'order_reconcile_test'
      });

      const res = await client.post(`/api/orders/admin/reconcile-razorpay/${order._id}`, {}, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('finalizes order when Razorpay reports captured payment', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Reconcile Book', price: 100, quantity: 1, type: 'book' }],
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_rzp_rec_captured'
      });

      mockFetchPayments.mockResolvedValueOnce({
        items: [
          { id: 'pay_captured_999', status: 'captured', amount: 10000 }
        ]
      });

      const res = await client.post(`/api/orders/admin/reconcile-razorpay/${order._id}`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.captured).toBe(true);
      expect(res.data.paymentId).toBe('pay_captured_999');
      expect(res.data.orderStatus).toBe('completed');
      expect(res.data.paymentStatus).toBe('completed');

      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('completed');
      expect(updated.paymentStatus).toBe('completed');
    });

    it('reports captured: false without completing order when payment failed or pending', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Failed Book', price: 100, quantity: 1, type: 'book' }],
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_rzp_rec_failed'
      });

      mockFetchPayments.mockResolvedValueOnce({
        items: [
          { id: 'pay_failed_888', status: 'failed' }
        ]
      });

      const res = await client.post(`/api/orders/admin/reconcile-razorpay/${order._id}`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.captured).toBe(false);
      expect(res.data.message).toMatch(/No captured payment found/);

      const unchanged = await Order.findById(order._id);
      expect(unchanged.status).toBe('pending');
      expect(unchanged.paymentStatus).toBe('pending');
    });
  });

  describe('4. Invoices API Endpoints & Access Control', () => {
    it('returns Proforma Invoice for unverified order (SM-PRI-)', async () => {
      const unverified = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Pending Book', price: 200, quantity: 1, type: 'book' }],
        totalAmount: 200,
        status: 'pending',
        paymentStatus: 'pending'
      });

      const res = await client.get(`/api/invoices/by-order/${unverified._id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.isProforma).toBe(true);
      expect(res.data.documentType).toBe('proforma_invoice');
      expect(res.data.invoiceNumber).toMatch(/^SM-PRI-/);

      // Verify that viewing repeatedly persists and does not disappear
      const repeatRes = await client.get(`/api/invoices/by-order/${unverified._id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(repeatRes.status).toBe(200);
      expect(repeatRes.data.invoiceNumber).toBe(res.data.invoiceNumber);
    });

    it('returns Tax Invoice for verified order (SM-HBL-)', async () => {
      const verified = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Verified Book', price: 200, quantity: 1, type: 'book' }],
        totalAmount: 200,
        status: 'completed',
        paymentStatus: 'completed',
        paymentType: 'online',
        razorpay_payment_id: 'pay_test_verif_1'
      });

      await autoGenerateInvoiceForOrder(verified);

      const res = await client.get(`/api/invoices/by-order/${verified._id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.isProforma).toBe(false);
      expect(res.data.documentType).toBe('tax_invoice');
      expect(res.data.invoiceNumber).toMatch(/^SM-HBL-/);
    });

    it('denies access (403) to other unauthorized customers', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Secret Book', price: 50, quantity: 1, type: 'book' }],
        totalAmount: 50,
        status: 'pending',
        paymentStatus: 'pending'
      });

      const res = await client.get(`/api/invoices/by-order/${order._id}`, {
        headers: { Authorization: `Bearer ${otherToken}` }
      });

      expect(res.status).toBe(403);
    });

    it('allows admin to view invoice for any order', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'Admin View Book', price: 50, quantity: 1, type: 'book' }],
        totalAmount: 50,
        status: 'pending',
        paymentStatus: 'pending'
      });

      const res = await client.get(`/api/invoices/by-order/${order._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.invoiceNumber).toBeDefined();
    });

    it('downloads Proforma and Tax invoice PDFs repeatedly without error', async () => {
      const order = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId(), title: 'PDF Book', price: 100, quantity: 1, type: 'book' }],
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'pending'
      });

      // Proforma download
      const pdfRes1 = await client.get(`/api/invoices/by-order/${order._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
        responseType: 'arraybuffer'
      });

      expect(pdfRes1.status).toBe(200);
      expect(pdfRes1.headers['content-type']).toBe('application/pdf');
      const headerStr1 = Buffer.from(pdfRes1.data).slice(0, 5).toString('utf8');
      expect(headerStr1).toBe('%PDF-');

      // Finalize order
      await finalizePaidOrder(order._id, {
        razorpay_payment_id: 'pay_pdf_test',
        razorpay_order_id: 'order_pdf_test'
      });

      // Tax invoice download
      const pdfRes2 = await client.get(`/api/invoices/by-order/${order._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
        responseType: 'arraybuffer'
      });

      expect(pdfRes2.status).toBe(200);
      expect(pdfRes2.headers['content-type']).toBe('application/pdf');
      const headerStr2 = Buffer.from(pdfRes2.data).slice(0, 5).toString('utf8');
      expect(headerStr2).toBe('%PDF-');
    });
  });
});
