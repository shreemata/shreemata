const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { setupTestDB, teardownTestDB } = require('./setup');
const Order = require('../models/Order');
const User = require('../models/User');
const { Invoice } = require('../routes/invoices');

describe('Production Invoice PDF Flow Tests', () => {
  let server;
  let client;
  let ownerUser;
  let ownerToken;
  let otherUser;
  let otherToken;
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = 'test_jwt_secret_flow_12345';

    ownerUser = await User.create({
      name: 'Owner Customer',
      email: 'owner-flow@shreemata.com',
      phone: '9888811111',
      password: 'password123',
      role: 'customer'
    });
    ownerToken = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    otherUser = await User.create({
      name: 'Other Customer',
      email: 'other-flow@shreemata.com',
      phone: '9888822222',
      password: 'password123',
      role: 'customer'
    });
    otherToken = jwt.sign({ id: otherUser._id, role: otherUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin-flow@shreemata.com',
      phone: '9888833333',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const app = express();
    app.use(express.json());
    app.use('/api/invoices', require('../routes/invoices'));

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        client = axios.create({
          baseURL: `http://127.0.0.1:${port}`,
          validateStatus: () => true,
          responseType: 'arraybuffer'
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

  // (a) completed/online/paymentStatus empty/root razorpay_payment_id + Invoice -> owner 200 %PDF-, other customer 403, admin 200;
  // Also assert existing JSON routes return 400 as before
  describe('(a) completed/online/paymentStatus empty/root razorpay_payment_id + Invoice', () => {
    let orderA;
    let invoiceA;

    beforeAll(async () => {
      orderA = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book A', price: 500, quantity: 1, type: 'book' }],
        totalAmount: 500,
        status: 'completed',
        paymentType: 'online',
        razorpay_payment_id: 'pay_PROD_ROOT_A123',
        deliveryAddress: { street: 'Street A', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });
      // Ensure paymentStatus is empty in MongoDB (unset)
      await Order.updateOne({ _id: orderA._id }, { $unset: { paymentStatus: 1 } });

      invoiceA = await Invoice.create({
        orderId: orderA._id,
        invoiceNumber: 'SM-HBL-PROD-A',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-A' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book A', unitPrice: 500, bundles: 1, total: 500 }],
        grandTotal: 500
      });
    });

    it('allows owner to download 200 %PDF-', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderA._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      const buf = Buffer.from(res.data);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('denies other customer with 403', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderA._id}/pdf`, {
        headers: { Authorization: `Bearer ${otherToken}` }
      });
      expect(res.status).toBe(403);
      const json = parseJson(res);
      expect(json.message).toBe("You don't have access to this invoice.");
    });

    it('allows admin to download 200 %PDF-', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderA._id}/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      const buf = Buffer.from(res.data);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('confirms existing JSON by-order route still returns 400 byte-for-byte as at c0258db', async () => {
      const jsonClient = axios.create({ baseURL: client.defaults.baseURL, validateStatus: () => true });
      const res = await jsonClient.get(`/api/invoices/by-order/${orderA._id}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(400);
      expect(res.data.message).toBe('Payment must be verified before generating a final tax invoice.');
    });

    it('supports /:id/pdf by invoice number with same owner-or-admin check', async () => {
      const resOwner = await client.get(`/api/invoices/${invoiceA.invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(resOwner.status).toBe(200);

      const resOther = await client.get(`/api/invoices/${invoiceA.invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${otherToken}` }
      });
      expect(resOther.status).toBe(403);
    });
  });

  // (b) completed/online/paymentStatus completed + Invoice -> 200
  describe('(b) completed/online/paymentStatus completed + Invoice', () => {
    let orderB;

    beforeAll(async () => {
      orderB = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book B', price: 400, quantity: 1, type: 'book' }],
        totalAmount: 400,
        status: 'completed',
        paymentType: 'online',
        paymentStatus: 'completed',
        razorpay_payment_id: 'pay_PROD_B456',
        deliveryAddress: { street: 'Street B', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });

      await Invoice.create({
        orderId: orderB._id,
        invoiceNumber: 'SM-HBL-PROD-B',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-B' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book B', unitPrice: 400, bundles: 1, total: 400 }],
        grandTotal: 400
      });
    });

    it('returns 200 %PDF- for owner', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderB._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(200);
      const buf = Buffer.from(res.data);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // (c) pending/online/paymentStatus pending, no Invoice -> 404 and NO invoice created
  describe('(c) pending/online/paymentStatus pending, no Invoice', () => {
    let orderC;

    beforeAll(async () => {
      orderC = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book C', price: 300, quantity: 1, type: 'book' }],
        totalAmount: 300,
        status: 'pending',
        paymentType: 'online',
        paymentStatus: 'pending',
        deliveryAddress: { street: 'Street C', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });
    });

    it('returns 404 and does NOT create any invoice in DB', async () => {
      const countBefore = await Invoice.countDocuments({ orderId: orderC._id });
      expect(countBefore).toBe(0);

      const res = await client.get(`/api/invoices/by-order/${orderC._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(404);
      const json = parseJson(res);
      expect(json.message).toBe('Invoice is being generated - please check back shortly');

      const countAfter = await Invoice.countDocuments({ orderId: orderC._id });
      expect(countAfter).toBe(0);
    });
  });

  // (d) pending status with paymentStatus completed + Invoice -> 200
  describe('(d) pending status with paymentStatus completed + Invoice', () => {
    let orderD;

    beforeAll(async () => {
      orderD = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book D', price: 250, quantity: 1, type: 'book' }],
        totalAmount: 250,
        status: 'pending',
        paymentType: 'online',
        paymentStatus: 'completed',
        razorpay_payment_id: 'pay_PROD_D789',
        deliveryAddress: { street: 'Street D', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });

      await Invoice.create({
        orderId: orderD._id,
        invoiceNumber: 'SM-HBL-PROD-D',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-D' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book D', unitPrice: 250, bundles: 1, total: 250 }],
        grandTotal: 250
      });
    });

    it('returns 200 %PDF- for owner', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderD._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(200);
      const buf = Buffer.from(res.data);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // (e) completed/online with NO payment id anywhere + Invoice -> report exact status code returned and say why
  describe('(e) completed/online with NO payment id anywhere + Invoice', () => {
    let orderE;

    beforeAll(async () => {
      orderE = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book E', price: 150, quantity: 1, type: 'book' }],
        totalAmount: 150,
        status: 'completed',
        paymentType: 'online',
        // NO razorpay_payment_id, NO paymentDetails
        deliveryAddress: { street: 'Street E', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });
      // Unset paymentStatus to represent empty paymentStatus from production
      await Order.updateOne({ _id: orderE._id }, { $unset: { paymentStatus: 1 } });

      await Invoice.create({
        orderId: orderE._id,
        invoiceNumber: 'SM-HBL-PROD-E',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-E' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book E', unitPrice: 150, bundles: 1, total: 150 }],
        grandTotal: 150
      });
    });

    it('returns 400 because unverified paymentStatus and no online payment ID fails existing invoice payment gate', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderE._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      // Exact status code returned: 400
      expect(res.status).toBe(400);
      const json = parseJson(res);
      expect(json.message).toBe('Payment must be verified before generating a final tax invoice.');
    });
  });

  // (f) manual UPI/cheque approved order with Invoice -> 200
  describe('(f) manual UPI/cheque approved order with Invoice', () => {
    let orderF;

    beforeAll(async () => {
      orderF = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book F', price: 700, quantity: 1, type: 'book' }],
        totalAmount: 700,
        status: 'completed',
        paymentType: 'cheque',
        paymentDetails: {
          type: 'cheque',
          status: 'verified',
          utrNumber: 'CHEQUE_888999'
        },
        deliveryAddress: { street: 'Street F', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });

      await Invoice.create({
        orderId: orderF._id,
        invoiceNumber: 'SM-HBL-PROD-F',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-F' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book F', unitPrice: 700, bundles: 1, total: 700 }],
        grandTotal: 700
      });
    });

    it('returns 200 %PDF- for approved manual payment', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderF._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(200);
      const buf = Buffer.from(res.data);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // (g) cancelled order -> 400
  describe('(g) cancelled order', () => {
    let orderG;

    beforeAll(async () => {
      orderG = await Order.create({
        user_id: ownerUser._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book G', price: 100, quantity: 1, type: 'book' }],
        totalAmount: 100,
        status: 'cancelled',
        paymentType: 'online',
        paymentStatus: 'completed',
        razorpay_payment_id: 'pay_PROD_CANCELLED',
        deliveryAddress: { street: 'Street G', district: 'Dharwad', state: 'Karnataka', pincode: '580031', phone: '9888811111' }
      });

      await Invoice.create({
        orderId: orderG._id,
        invoiceNumber: 'SM-HBL-PROD-G',
        documentType: 'tax_invoice',
        documentNumbers: { tax_invoice: 'SM-HBL-PROD-G' },
        invoiceDate: '2026-10-24',
        customerName: 'Owner Customer',
        phoneNumber: '9888811111',
        products: [{ productName: 'Book G', unitPrice: 100, bundles: 1, total: 100 }],
        grandTotal: 100
      });
    });

    it('returns 400 for cancelled order', async () => {
      const res = await client.get(`/api/invoices/by-order/${orderG._id}/pdf`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      expect(res.status).toBe(400);
      const json = parseJson(res);
      expect(json.message).toBe('Cannot generate invoice for a cancelled or failed order.');
    });
  });
});
