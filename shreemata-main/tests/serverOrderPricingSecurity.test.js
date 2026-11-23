/** @jest-environment node */
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => {
    return {
      orders: {
        create: jest.fn().mockImplementation(async (opts) => ({
          id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          amount: opts.amount,
          currency: opts.currency || 'INR'
        }))
      },
      payments: {
        fetch: jest.fn().mockImplementation(async (payId) => ({
          id: payId,
          amount: 22500, // 225 INR in paise
          currency: 'INR',
          status: 'captured'
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
const crypto = require('crypto');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const Notification = require('../models/Notification');
const CommissionSettings = require('../models/CommissionSettings');

let mongoServer;
let app;
let server;
let baseUrl;

let buyerUser;
let buyerToken;

let bookA;
let bookB;
let digitalBook;
let bundleA;

let validOffer;
let expiredOffer;
let inactiveOffer;

const JWT_SECRET = 'test_jwt_secret_pricing_security_2026';
const RZP_SECRET = 'test_rzp_secret_for_security_suite';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_SECRET = RZP_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_security_2026';
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

  // Configure CommissionSettings with explicit dynamic shipping rates
  await CommissionSettings.create({
    directReferralBonus: 10,
    selfCashback: 5,
    treeCommissionPercentage: 20,
    shippingRates: [
      { minWeight: 0, maxWeight: 0.99, rate: 25 },
      { minWeight: 1, maxWeight: 1.99, rate: 35 },
      { minWeight: 2, maxWeight: 2.99, rate: 45 },
      { minWeight: 3, maxWeight: 4.99, rate: 55 },
      { minWeight: 5, maxWeight: 9.99, rate: 75 }
    ]
  });

  buyerUser = await User.create({
    name: 'Security Test Customer',
    email: 'security.buyer@example.com',
    phone: '9876543210',
    role: 'customer',
    address: {
      addressLine: 'Door 100, Security Lane',
      homeAddress1: 'Door 100, Security Lane',
      city: 'Hubballi',
      taluk: 'Hubballi',
      district: 'Dharwad',
      state: 'Karnataka',
      pincode: '580020'
    }
  });

  buyerToken = jwt.sign(
    { id: buyerUser._id, userId: buyerUser._id, email: buyerUser.email, role: buyerUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Seed Books
  bookA = await Book.create({
    title: 'Security Physics Primer',
    author: 'Author Alpha',
    price: 200,
    physicalPrice: 250,
    weight: 0.5,
    stockQuantity: 100,
    isDigital: false
  });

  bookB = await Book.create({
    title: 'Security Chemistry Advanced',
    author: 'Author Beta',
    price: 300,
    discountEnabled: true,
    discountType: 'flat',
    discountValue: 20,
    sellingPrice: 280,
    physicalPrice: 350,
    weight: 0.8,
    stockQuantity: 100,
    isDigital: false
  });

  digitalBook = await Book.create({
    title: 'Security Digital Handbook',
    author: 'Digital Author',
    price: 99,
    originalPrice: 150,
    weight: 0,
    stockQuantity: 999,
    isDigital: true
  });

  // Seed Bundle
  bundleA = await Bundle.create({
    name: 'Security Science Duo Bundle',
    bundlePrice: 450,
    originalPrice: 550,
    weight: 1.3,
    books: [bookA._id, bookB._id],
    isDigital: false
  });

  // Seed Notifications (Offers)
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  validOffer = await Notification.create({
    title: '₹50 Flat Discount on Orders above ₹400',
    message: 'Apply this offer for orders above 400',
    type: 'offer',
    isActive: true,
    validUntil: futureDate,
    offerDetails: {
      minAmount: 400,
      discountType: 'fixed',
      discountValue: 50
    }
  });

  expiredOffer = await Notification.create({
    title: 'Expired ₹100 Flat Discount',
    message: 'This offer is expired',
    type: 'offer',
    isActive: true,
    validUntil: pastDate,
    offerDetails: {
      minAmount: 100,
      discountType: 'fixed',
      discountValue: 100
    }
  });

  inactiveOffer = await Notification.create({
    title: 'Inactive ₹50 Discount',
    message: 'This offer is disabled',
    type: 'discount',
    isActive: false,
    offerDetails: {
      minAmount: 100,
      discountType: 'fixed',
      discountValue: 50
    }
  });
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

const defaultDeliveryAddress = {
  name: 'Security Customer',
  phone: '9876543210',
  addressLine: 'Door 100, Security Lane',
  city: 'Hubballi',
  state: 'Karnataka',
  pincode: '580020'
};

describe('STEP 3: Honest Checkouts with Server-Authoritative Totals', () => {
  test('1. Honest checkout: one book (courier delivery)', async () => {
    // bookA: DB price 200, weight 0.5kg -> shipping 25 -> total 225
    const bookPrice = bookA.price; // 200
    const shipping = 25; // 0.5kg
    const expectedTotal = bookPrice + shipping; // 225

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: shipping,
        deliveryAddress: defaultDeliveryAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.courierCharge).toBe(shipping);
    expect(savedOrder.items[0].price).toBe(bookPrice);
  });

  test('2. Honest checkout: several quantities of a single book (courier delivery)', async () => {
    // bookA: DB price 200, qty 3 -> 600, weight 1.5kg -> shipping 35 -> total 635
    const qty = 3;
    const itemsTotal = bookA.price * qty; // 600
    const shipping = 35; // 1.5kg (1 to 1.99kg)
    const expectedTotal = itemsTotal + shipping; // 635

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(bookA._id), quantity: qty, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: shipping,
        deliveryAddress: defaultDeliveryAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.courierCharge).toBe(shipping);
    expect(savedOrder.items[0].quantity).toBe(qty);
  });

  test('3. Honest checkout: a bundle (courier delivery)', async () => {
    // bundleA: bundlePrice 450, weight 1.3kg -> shipping 35 -> total 485
    const bundlePrice = bundleA.bundlePrice; // 450
    const shipping = 35; // 1.3kg
    const expectedTotal = bundlePrice + shipping; // 485

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(bundleA._id), quantity: 1, type: 'bundle' }],
        deliveryMethod: 'courier',
        courierCharge: shipping,
        deliveryAddress: defaultDeliveryAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.items[0].price).toBe(bundlePrice);
    expect(savedOrder.items[0].type).toBe('bundle');
  });

  test('4. Honest checkout: book plus bundle (courier delivery)', async () => {
    // bookB: sellingPrice 280, wt 0.8kg; bundleA: 450, wt 1.3kg -> itemsTotal 730, weight 2.1kg -> shipping 45 -> total 775
    const bookPrice = bookB.sellingPrice; // 280
    const bundlePrice = bundleA.bundlePrice; // 450
    const itemsTotal = bookPrice + bundlePrice; // 730
    const shipping = 45; // 2.1kg (2 to 2.99kg)
    const expectedTotal = itemsTotal + shipping; // 775

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [
          { id: String(bookB._id), quantity: 1, type: 'book' },
          { id: String(bundleA._id), quantity: 1, type: 'bundle' }
        ],
        deliveryMethod: 'courier',
        courierCharge: shipping,
        deliveryAddress: defaultDeliveryAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.items.length).toBe(2);
  });

  test('5. Honest checkout: store pickup (courierCharge strictly ₹0)', async () => {
    // bookA: DB price 200, deliveryMethod: 'pickup' -> shipping 0 -> total 200
    const expectedTotal = bookA.price; // 200

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
        deliveryMethod: 'pickup',
        courierCharge: 0,
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.courierCharge).toBe(0);
    expect(savedOrder.deliveryMethod).toBe('pickup');
  });

  test('6. Honest checkout: digital only (courierCharge strictly ₹0, no address)', async () => {
    // digitalBook: price 99 -> shipping 0 -> total 99
    const expectedTotal = digitalBook.price; // 99

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(digitalBook._id), quantity: 1, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: 0,
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.courierCharge).toBe(0);
    expect(savedOrder.deliveryMethod).toBe('digital');
  });

  test('7. Honest checkout: valid offer applied', async () => {
    // bookB: sellingPrice 280, qty 2 = 560; validOffer: min 400, flat 50 off -> 510; wt 1.6kg -> shipping 35 -> total 545
    const qty = 2;
    const itemsTotal = bookB.sellingPrice * qty; // 560
    const discount = 50;
    const shipping = 35; // 1.6kg
    const expectedTotal = itemsTotal - discount + shipping; // 545

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(bookB._id), quantity: qty, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: shipping,
        appliedOffer: {
          offerId: String(validOffer._id)
        },
        deliveryAddress: defaultDeliveryAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.totalAmount).toBe(expectedTotal);
    expect(savedOrder.appliedOffer).toBeDefined();
    expect(savedOrder.appliedOffer.savings).toBe(discount);
    expect(savedOrder.appliedOffer.offerTitle).toBe(validOffer.title);
  });
});

describe('STEP 3: Tampered Requests are Strictly Rejected (HTTP 400)', () => {
  test('1. Tampered payload: amount ₹1 for ₹500 cart is rejected (400)', async () => {
    // bookA (200) + bookB (280) = 480 + shipping 35 = 515. Attacker sends amount: 1
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 1, // Tampered amount
          items: [
            { id: String(bookA._id), quantity: 1, type: 'book' },
            { id: String(bookB._id), quantity: 1, type: 'book' }
          ],
          deliveryMethod: 'courier',
          courierCharge: 35,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/mismatch/i);
      expect(err.response.data.expectedTotal).toBe(515);
    }
  });

  test('2. Tampered payload: lower amount with higher price items is rejected (400)', async () => {
    // bookA (200) + shipping (25) = 225. Attacker sends amount: 125
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 125, // Lower amount
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/mismatch/i);
    }
  });

  test('3. Tampered payload: price field edited inside items is ignored and rejected (400)', async () => {
    // Attacker modifies price to ₹10 inside items array, computes amount: 35 (10 + 25)
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 35,
          items: [{
            id: String(bookA._id),
            title: bookA.title,
            price: 10, // Tampered client price (DB price is 200)
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/mismatch/i);
      expect(err.response.data.expectedTotal).toBe(225); // Server recomputed using DB price 200 + 25
    }
  });

  test('4. Tampered payload: negative or zero amount is rejected (400)', async () => {
    // 4a. Zero amount
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 0,
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
    }

    // 4b. Negative amount
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: -100,
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
    }
  });

  test('5. Tampered payload: courierCharge of 0 for a courier order is rejected (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 200,
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 0, // Attacker attempts to bypass courier charge
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/courier charge/i);
    }
  });

  test('6. Tampered payload: invalid or expired offer is rejected (400)', async () => {
    // 6a. Expired offer
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 125, // 200 - 100 + 25
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          appliedOffer: { offerId: String(expiredOffer._id) },
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toMatch(/expired/i);
    }

    // 6b. Inactive offer
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 175,
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          appliedOffer: { offerId: String(inactiveOffer._id) },
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toMatch(/not active/i);
    }

    // 6c. Offer minimum threshold not met
    // validOffer requires minAmount 400. bookA is only 200.
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 175, // 200 - 50 + 25
          items: [{ id: String(bookA._id), quantity: 1, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          appliedOffer: { offerId: String(validOffer._id) },
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toMatch(/threshold|minimum/i);
    }
  });

  test('7. Tampered payload: quantity 0 or negative is rejected (400)', async () => {
    // 7a. Quantity 0
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 25,
          items: [{ id: String(bookA._id), quantity: 0, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/quantity/i);
    }

    // 7b. Negative quantity
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 25,
          items: [{ id: String(bookA._id), quantity: -5, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 25,
          deliveryAddress: defaultDeliveryAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/quantity/i);
    }
  });

  test('8. Tampered payload: deleted or unknown book id is rejected (400)', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 100,
          items: [{ id: String(fakeId), quantity: 1, type: 'book' }],
          deliveryMethod: 'pickup',
          courierCharge: 0,
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/item not found/i);
    }
  });
});

describe('STEP 3: Post-Payment Verification & Webhook Amount Enforcement', () => {
  test('A verify call with a different paid amount does NOT finalize the order (400)', async () => {
    // 1. Create honest order in pending state with server total = 225
    const honestTotal = 225;
    const rzpOrderId = `order_tamper_verify_${Date.now()}`;
    const testOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: String(bookA._id),
        title: bookA.title,
        price: 200,
        quantity: 1,
        type: 'book',
        isDigital: false
      }],
      totalAmount: honestTotal, // 225
      courierCharge: 25,
      deliveryMethod: 'courier',
      status: 'pending',
      razorpay_order_id: rzpOrderId,
      rewardApplied: false
    });

    const paymentId = `pay_tamper_${Date.now()}`;
    const validSig = crypto
      .createHmac('sha256', RZP_SECRET)
      .update(rzpOrderId + '|' + paymentId)
      .digest('hex');

    // 2. Call /api/payments/verify with tampered totalAmount = 1
    try {
      await axios.post(
        `${baseUrl}/api/payments/verify`,
        {
          razorpay_order_id: rzpOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSig,
          totalAmount: 1 // Attacker claims paid amount was only 1
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/paid amount mismatch/i);
    }

    // 3. Confirm order in DB remains 'pending' and was NOT finalized
    const unfinalizedOrder = await Order.findById(testOrder._id);
    expect(unfinalizedOrder.status).toBe('pending');
    expect(unfinalizedOrder.totalAmount).toBe(honestTotal);
    expect(unfinalizedOrder.rewardApplied).toBe(false);
  });

  test('A webhook event with different payment amount does NOT finalize the order (400)', async () => {
    const honestTotal = 225;
    const rzpOrderId = `order_tamper_wh_${Date.now()}`;
    const testOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: String(bookA._id),
        title: bookA.title,
        price: 200,
        quantity: 1,
        type: 'book',
        isDigital: false
      }],
      totalAmount: honestTotal,
      courierCharge: 25,
      deliveryMethod: 'courier',
      status: 'pending',
      razorpay_order_id: rzpOrderId,
      rewardApplied: false
    });

    const paymentId = `pay_wh_${Date.now()}`;
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: rzpOrderId,
            amount: 100 // 100 paise = ₹1 (attacker paid only ₹1 instead of ₹225 = 22500 paise)
          }
        }
      }
    };

    const webhookBodyStr = JSON.stringify(webhookPayload);
    const whSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(webhookBodyStr, 'utf8'))
      .digest('hex');

    try {
      await axios.post(
        `${baseUrl}/api/payments/webhook`,
        webhookPayload,
        { headers: { 'x-razorpay-signature': whSignature } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data).toMatch(/mismatch/i);
    }

    // Confirm order in DB is untouched
    const unfinalizedOrder = await Order.findById(testOrder._id);
    expect(unfinalizedOrder.status).toBe('pending');
    expect(unfinalizedOrder.rewardApplied).toBe(false);
  });

  test('Honest payment verification succeeds and finalizes the order', async () => {
    const honestTotal = 225;
    const rzpOrderId = `order_honest_verify_${Date.now()}`;
    const testOrder = await Order.create({
      user_id: buyerUser._id,
      items: [{
        id: String(bookA._id),
        title: bookA.title,
        price: 200,
        quantity: 1,
        type: 'book',
        isDigital: false
      }],
      totalAmount: honestTotal,
      courierCharge: 25,
      deliveryMethod: 'courier',
      deliveryAddress: defaultDeliveryAddress,
      status: 'pending',
      razorpay_order_id: rzpOrderId,
      rewardApplied: false
    });

    const paymentId = `pay_honest_${Date.now()}`;
    const validSig = crypto
      .createHmac('sha256', RZP_SECRET)
      .update(rzpOrderId + '|' + paymentId)
      .digest('hex');

    const res = await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig,
        totalAmount: honestTotal
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const completedOrder = await Order.findById(testOrder._id);
    expect(completedOrder.status).toBe('completed');
    expect(completedOrder.totalAmount).toBe(honestTotal);
  });
});
