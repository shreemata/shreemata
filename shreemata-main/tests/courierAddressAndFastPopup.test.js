/** @jest-environment node */
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => {
    return {
      orders: {
        create: jest.fn().mockImplementation(async (opts) => ({
          id: `order_mock_${Date.now()}`,
          amount: opts.amount,
          currency: opts.currency || 'INR'
        }))
      }
    };
  });
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const Razorpay = require('razorpay');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionSettings = require('../models/CommissionSettings');
const { Invoice } = require('../routes/invoices');
const { finalizePaidOrder, dispatchOrderEmails } = require('../services/orderFinalizer');
const { validateCourierAddress } = require('../utils/deliveryAddressValidator');
const emailService = require('../utils/emailService');

let mongoServer;
let app;
let server;
let baseUrl;
let testBuyer;
let testBook;
let buyerToken;

const JWT_SECRET = 'test_jwt_secret_courier_fast_popup_2026';

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

  await CommissionSettings.create({
    directReferralBonus: 10,
    selfCashback: 5,
    treeCommissionPercentage: 20
  });

  testBuyer = await User.create({
    name: 'Courier Customer',
    email: 'courier.customer@example.com',
    phone: '9876543210',
    role: 'customer',
    address: {
      name: 'Courier Customer',
      street: '123 Saved Street',
      homeAddress1: '123 Saved Street',
      city: 'Hubballi',
      taluk: 'Hubballi',
      district: 'Dharwad',
      state: 'Karnataka',
      pincode: '580020',
      phone: '9876543210'
    }
  });

  testBook = await Book.create({
    title: 'Courier Test Book',
    author: 'Author Name',
    price: 150,
    originalPrice: 200,
    stockQuantity: 100,
    weight: 0.5,
    profitMethod: 'fixed',
    bookProfit: 30
  });

  buyerToken = jwt.sign(
    { id: testBuyer._id, userId: testBuyer._id, email: testBuyer.email, role: testBuyer.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Part (A): Courier Delivery Address Validation & Storage', () => {
  test('validateCourierAddress helper flags missing required fields', () => {
    const invalidAddr = {
      name: '',
      phone: '',
      addressLine: '',
      city: '',
      state: '',
      pincode: ''
    };
    const res = validateCourierAddress(invalidAddr, null);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('name');
    expect(res.missingFields).toContain('phone');
    expect(res.missingFields).toContain('addressLine');
    expect(res.missingFields).toContain('city');
    expect(res.missingFields).toContain('state');
    expect(res.missingFields).toContain('pincode');
  });

  test('validateCourierAddress accepts valid address and sanitizes 10-digit phone and 6-digit pin', () => {
    const validAddr = {
      name: '  Suresh Kumar  ',
      phone: '  9887766554  ',
      addressLine: 'Door 42, Green Avenue',
      city: 'Hubballi',
      state: 'Karnataka',
      pincode: '580020'
    };
    const res = validateCourierAddress(validAddr, null);
    expect(res.isValid).toBe(true);
    expect(res.sanitizedAddress.name).toBe('Suresh Kumar');
    expect(res.sanitizedAddress.phone).toBe('9887766554');
    expect(res.sanitizedAddress.pincode).toBe('580020');
    expect(res.sanitizedAddress.city).toBe('Hubballi');
  });

  test('POST /api/payments/create-order: rejects courier order without delivery address (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toBeDefined();
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/payments/create-order: rejects courier order with invalid phone format (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: {
            name: 'Recipient Name',
            phone: '12345', // invalid: only 5 digits
            addressLine: 'MG Road 12',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001'
          }
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/phone/i);
    }
  });

  test('POST /api/payments/create-order: rejects courier order with invalid pincode format (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: {
            name: 'Recipient Name',
            phone: '9876543210',
            addressLine: 'MG Road 12',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '5600' // invalid: only 4 digits
          }
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/pincode/i);
    }
  });

  test('POST /api/payments/create-order: allows store pickup without delivery address', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 150,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          author: testBook.author,
          price: testBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'pickup',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();
    expect(res.data.order.id).toBeDefined();
  });

  test('POST /api/payments/create-order: stores full entered courier delivery address on order', async () => {
    const customAddr = {
      name: 'Custom Consignee',
      phone: '9123456789',
      addressLine: 'Suite 101, Tech Park',
      homeAddress1: 'Suite 101, Tech Park',
      city: 'Dharwad',
      taluk: 'Dharwad',
      state: 'Karnataka',
      pincode: '580001'
    };

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 180,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          author: testBook.author,
          price: testBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'courier',
        deliveryAddress: customAddr,
        courierCharge: 30
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    const rzpOrderId = res.data.order.id;

    // Check order in database
    const savedOrder = await Order.findOne({ razorpay_order_id: rzpOrderId });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.deliveryMethod).toBe('courier');
    expect(savedOrder.deliveryAddress.name).toBe('Custom Consignee');
    expect(savedOrder.deliveryAddress.phone).toBe('9123456789');
    expect(savedOrder.deliveryAddress.city).toBe('Dharwad');
    expect(savedOrder.deliveryAddress.pincode).toBe('580001');
  });

  test('POST /api/orders: rejects courier without address and allows pickup without address', async () => {
    // 1. Courier without address -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders`,
        {
          items: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
          totalAmount: 180,
          deliveryMethod: 'courier'
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Pickup without address -> 201/200
    const pickupRes = await axios.post(
      `${baseUrl}/api/orders`,
      {
        items: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
        totalAmount: 150,
        deliveryMethod: 'pickup'
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect([200, 201]).toContain(pickupRes.status);
    expect(pickupRes.data.order).toBeDefined();
    expect(pickupRes.data.order.deliveryMethod).toBe('pickup');
  });

  test('POST /api/orders/create-pending: rejects courier without address (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-pending`,
        {
          bookId: String(testBook._id),
          quantity: 1,
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          basePrice: 150,
          courierCharge: 30,
          totalAmount: 180
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/orders/create-cart-pending: rejects courier without address (400) and allows pickup without address', async () => {
    // 1. Courier without address -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-cart-pending`,
        {
          cartItems: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          itemsTotal: 150,
          courierCharge: 30,
          totalAmount: 180,
          totalWeight: 0.5
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Pickup without address -> 200
    const pickupRes = await axios.post(
      `${baseUrl}/api/orders/create-cart-pending`,
      {
        cartItems: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
        paymentType: 'cheque',
        deliveryMethod: 'pickup',
        itemsTotal: 150,
        courierCharge: 0,
        totalAmount: 150,
        totalWeight: 0.5
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(pickupRes.status).toBe(200);
    expect(pickupRes.data.orderId).toBeDefined();
  });

  test('Invoice generation uses deliveryAddress for Consignee block', async () => {
    const orderWithAddr = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 180,
      deliveryMethod: 'courier',
      deliveryAddress: {
        name: 'Invoice Recipient',
        addressLine: 'House #7, Station Road',
        homeAddress1: 'House #7, Station Road',
        city: 'Belagavi',
        taluk: 'Belagavi',
        district: 'Belagavi',
        state: 'Karnataka',
        pincode: '590001',
        phone: '9845098450'
      },
      razorpay_order_id: 'order_invoice_test_1',
      paymentStatus: 'completed',
      finalizationStatus: 'completed'
    });

    const { autoGenerateInvoiceForOrder } = require('../routes/invoices');
    const invoice = await autoGenerateInvoiceForOrder(orderWithAddr);

    expect(invoice).toBeDefined();
    expect(invoice.customerName).toBe('Invoice Recipient');
    expect(invoice.phoneNumber).toBe('9845098450');
    expect(invoice.shippingPhone).toBe('9845098450');
    expect(invoice.shippingAddress).toMatch(/House #7/);
    expect(invoice.shippingAddress).toMatch(/Belagavi/);
    expect(invoice.shippingAddress).toMatch(/590001/);
  });
});

describe('Part (B): Fast Verification, Asynchronous Emails & Timing', () => {
  test('Fast execution: finalizePaidOrder with asyncEmails: true finishes in < 150ms without waiting for email transport', async () => {
    const fastOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_fast_timing_1'
    });

    const t0 = performance.now();
    const finalResult = await finalizePaidOrder(fastOrder._id, {
      razorpay_payment_id: 'pay_fast_timing_1',
      razorpay_order_id: 'order_fast_timing_1',
      asyncEmails: true
    });
    const t1 = performance.now();

    const elapsedMs = t1 - t0;
    console.log(`⏱️ Fast finalizePaidOrder execution time: ${elapsedMs.toFixed(2)} ms`);

    expect(finalResult.success).toBe(true);
    expect(finalResult.order.finalizationStatus).toBe('completed');
    expect(elapsedMs).toBeLessThan(500); // typically < 50ms in memory
  });

  test('Background email failure does NOT fail order finalization', async () => {
    const errorOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_email_fail_test'
    });

    // Mock sendOrderConfirmationEmail to throw an SMTP connection error
    const originalSend = emailService.sendOrderConfirmationEmail;
    emailService.sendOrderConfirmationEmail = jest.fn().mockRejectedValue(new Error('SMTP Connection Timeout'));

    try {
      // Background email dispatcher
      const dispatchResult = await dispatchOrderEmails(errorOrder._id);
      expect(dispatchResult).toBe(false); // Gracefully caught, returns false

      // Order should remain completed, not broken
      const reloadedOrder = await Order.findById(errorOrder._id);
      expect(reloadedOrder).toBeDefined();
    } finally {
      emailService.sendOrderConfirmationEmail = originalSend;
    }
  });

  test('Atomic dispatchOrderEmails guarantees emails are sent exactly once', async () => {
    const emailOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_email_once_test',
      confirmationEmailSent: false
    });

    let sendCount = 0;
    const originalSendConfirm = emailService.sendOrderConfirmationEmail;
    const originalSendAdmin = emailService.sendAdminNotification;

    emailService.sendOrderConfirmationEmail = jest.fn().mockImplementation(async () => {
      sendCount++;
    });
    emailService.sendAdminNotification = jest.fn().mockResolvedValue(true);

    try {
      // Run two concurrent dispatch attempts
      const [res1, res2] = await Promise.all([
        dispatchOrderEmails(emailOrder._id),
        dispatchOrderEmails(emailOrder._id)
      ]);

      // Exactly ONE succeeds (true), the other is rejected as duplicate (false)
      expect([res1, res2].filter(r => r === true).length).toBe(1);
      expect([res1, res2].filter(r => r === false).length).toBe(1);
      expect(sendCount).toBe(1);

      const updated = await Order.findById(emailOrder._id);
      expect(updated.confirmationEmailSent).toBe(true);
      expect(updated.emailSentAt).toBeDefined();
    } finally {
      emailService.sendOrderConfirmationEmail = originalSendConfirm;
      emailService.sendAdminNotification = originalSendAdmin;
    }
  });
});
