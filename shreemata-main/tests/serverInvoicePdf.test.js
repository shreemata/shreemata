const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { setupTestDB, teardownTestDB } = require('./setup');
const Order = require('../models/Order');
const User = require('../models/User');
const { generateInvoicePdf, calculateInvoiceTotals } = require('../utils/invoicePdf');

describe('Server Invoice PDF Endpoint Tests', () => {
  let server;
  let client;
  let ownerUser;
  let ownerToken;
  let otherUser;
  let otherToken;
  let adminUser;
  let adminToken;
  let verifiedOrder;
  let unverifiedOrder;
  let storedInvoice;

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = 'test_jwt_secret_12345';

    // 1. Create order owner customer
    ownerUser = await User.create({
      name: 'Owner Customer',
      email: 'owner@shreemata.com',
      phone: '9888811111',
      password: 'password123',
      role: 'customer'
    });
    ownerToken = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 2. Create other customer (unauthorized customer)
    otherUser = await User.create({
      name: 'Other Customer',
      email: 'other@shreemata.com',
      phone: '9888822222',
      password: 'password123',
      role: 'customer'
    });
    otherToken = jwt.sign({ id: otherUser._id, role: otherUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 3. Create admin user
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@shreemata.com',
      phone: '9888833333',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 4. Create verified order (completed + paymentStatus verified)
    verifiedOrder = await Order.create({
      user_id: ownerUser._id,
      items: [
        {
          id: new mongoose.Types.ObjectId(),
          title: 'Shree Siddharoodha Mahatme',
          price: 300,
          quantity: 2,
          type: 'book'
        }
      ],
      totalAmount: 600,
      courierCharge: 50,
      status: 'completed',
      paymentStatus: 'completed',
      paymentType: 'online',
      razorpay_payment_id: 'pay_VERIFIED_123',
      razorpay_order_id: 'order_VERIFIED_123',
      deliveryAddress: {
        street: '42 Main Road',
        district: 'Dharwad',
        state: 'Karnataka',
        pincode: '580031',
        phone: '9888811111'
      }
    });

    // 5. Create unverified order (pending offline transfer without verified payment)
    unverifiedOrder = await Order.create({
      user_id: ownerUser._id,
      items: [
        {
          id: new mongoose.Types.ObjectId(),
          title: 'Unverified Order Book',
          price: 200,
          quantity: 1,
          type: 'book'
        }
      ],
      totalAmount: 200,
      status: 'pending',
      paymentStatus: 'pending',
      paymentType: 'transfer',
      paymentDetails: {
        type: 'transfer',
        status: 'pending_verification'
      },
      deliveryAddress: {
        street: '42 Main Road',
        district: 'Dharwad',
        state: 'Karnataka',
        pincode: '580031',
        phone: '9888811111'
      }
    });

    const { Invoice } = require('../routes/invoices');
    await Invoice.create({
      orderId: unverifiedOrder._id,
      invoiceNumber: 'SM-HBL-UNVERIFIED',
      documentType: 'tax_invoice',
      documentNumbers: { tax_invoice: 'SM-HBL-UNVERIFIED' },
      invoiceDate: new Date().toISOString().split('T')[0],
      customerName: 'Owner Customer',
      phoneNumber: '9888811111',
      products: [{ productName: 'Unverified Order Book', unitPrice: 200, bundles: 1, total: 200 }],
      grandTotal: 200
    });

    // Setup express app with invoices router
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', require('../routes/invoices'));

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        client = axios.create({
          baseURL: `http://127.0.0.1:${port}`,
          validateStatus: () => true,
          responseType: 'arraybuffer' // Handle both binary PDF and JSON errors
        });
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise((res) => server.close(res));
    await teardownTestDB();
  });

  function parseJson(res) {
    try {
      return JSON.parse(res.data.toString('utf8'));
    } catch (e) {
      return {};
    }
  }

  describe('GET /api/invoices/by-order/:orderId/pdf', () => {
    it('allows invoice owner to download valid %PDF- with correct headers', async () => {
      const res = await client.get(`/api/invoices/by-order/${verifiedOrder._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-disposition']).toMatch(/attachment;\s*filename="SM-HBL-[^"]+\.pdf"/);

      // Verify binary PDF signature (%PDF-)
      const buffer = Buffer.from(res.data);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('denies access (403) to other customer', async () => {
      const res = await client.get(`/api/invoices/by-order/${verifiedOrder._id}/pdf`, {
        headers: { Authorization: `Bearer ${otherToken}` }
      });

      expect(res.status).toBe(403);
      const json = parseJson(res);
      expect(json.message).toBe("You don't have access to this invoice.");
    });

    it('allows admin to download invoice PDF for any order', async () => {
      const res = await client.get(`/api/invoices/by-order/${verifiedOrder._id}/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      const buffer = Buffer.from(res.data);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('rejects unverified payment (400)', async () => {
      const res = await client.get(`/api/invoices/by-order/${unverifiedOrder._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(400);
      const json = parseJson(res);
      expect(json.message).toBe('Payment must be verified before generating a final tax invoice.');
    });

    it('returns 404 for unknown order ID', async () => {
      const fakeOrderId = new mongoose.Types.ObjectId();
      const res = await client.get(`/api/invoices/by-order/${fakeOrderId}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(404);
      const json = parseJson(res);
      expect(json.message).toBe('Order not found');
    });
  });

  describe('GET /api/invoices/:invoiceId/pdf', () => {
    let invoiceNumber;

    beforeAll(async () => {
      // Fetch invoice JSON first to ensure invoice is created and obtain invoiceNumber
      const jsonClient = axios.create({
        baseURL: client.defaults.baseURL,
        validateStatus: () => true
      });
      const res = await jsonClient.get(`/api/invoices/by-order/${verifiedOrder._id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      storedInvoice = res.data;
      invoiceNumber = storedInvoice.invoiceNumber;
    });

    it('allows invoice owner to download PDF by invoiceNumber or _id', async () => {
      const res = await client.get(`/api/invoices/${invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-disposition']).toBe(`attachment; filename="${invoiceNumber}.pdf"`);

      const buffer = Buffer.from(res.data);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('denies access (403) to other customer for specific invoiceId', async () => {
      const res = await client.get(`/api/invoices/${invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${otherToken}` }
      });

      expect(res.status).toBe(403);
      const json = parseJson(res);
      expect(json.message).toBe("You don't have access to this invoice.");
    });

    it('allows admin to download invoice PDF by invoiceId', async () => {
      const res = await client.get(`/api/invoices/${invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const buffer = Buffer.from(res.data);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('returns 404 for unknown invoiceId', async () => {
      const res = await client.get('/api/invoices/SM-HBL-9999999999/pdf', {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });

      expect(res.status).toBe(404);
      const json = parseJson(res);
      expect(json.message).toBe('Invoice not found');
    });
  });

  describe('Validation of Legally Required Fields (422 responses, no silent fallbacks)', () => {
    it('throws 422 with field: invoiceNumber if invoiceNumber is missing', async () => {
      const invalidInvoice = {
        invoiceDate: '2026-10-24',
        customerName: 'Test Buyer',
        products: [{ productName: 'Book', unitPrice: 100, qty: 1 }]
      };
      await expect(generateInvoicePdf(invalidInvoice)).rejects.toMatchObject({
        statusCode: 422,
        field: 'invoiceNumber'
      });
    });

    it('throws 422 with field: invoiceDate if invoiceDate is missing or invalid', async () => {
      const invalidInvoice = {
        invoiceNumber: 'SM-HBL-001',
        customerName: 'Test Buyer',
        products: [{ productName: 'Book', unitPrice: 100, qty: 1 }]
      };
      await expect(generateInvoicePdf(invalidInvoice)).rejects.toMatchObject({
        statusCode: 422,
        field: 'invoiceDate'
      });
    });

    it('throws 422 with field: customerName if customerName is missing or empty', async () => {
      const invalidInvoice = {
        invoiceNumber: 'SM-HBL-001',
        invoiceDate: '2026-10-24',
        customerName: '   ',
        products: [{ productName: 'Book', unitPrice: 100, qty: 1 }]
      };
      await expect(generateInvoicePdf(invalidInvoice)).rejects.toMatchObject({
        statusCode: 422,
        field: 'customerName'
      });
    });

    it('throws 422 with field: products if products list is missing or empty', async () => {
      const invalidInvoice = {
        invoiceNumber: 'SM-HBL-001',
        invoiceDate: '2026-10-24',
        customerName: 'Test Buyer',
        products: []
      };
      await expect(generateInvoicePdf(invalidInvoice)).rejects.toMatchObject({
        statusCode: 422,
        field: 'products'
      });
    });

    it('throws 422 with field: totals if totals produce NaN or negative values', async () => {
      const invalidInvoice = {
        invoiceNumber: 'SM-HBL-001',
        invoiceDate: '2026-10-24',
        customerName: 'Test Buyer',
        products: [{ productName: 'Book', unitPrice: NaN, qty: 1 }]
      };
      await expect(generateInvoicePdf(invalidInvoice)).rejects.toMatchObject({
        statusCode: 422,
        field: 'totals'
      });
    });
  });
});
