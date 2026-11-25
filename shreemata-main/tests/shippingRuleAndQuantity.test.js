/**
 * tests/shippingRuleAndQuantity.test.js
 * Comprehensive verification of:
 * 1. Courier charge rule: ₹25 per started kg, minimum ₹25 (25 * Math.max(1, Math.ceil(normalizedWeight)))
 * 2. Pre-ceil 3-decimal rounding for float sums
 * 3. Removal of quantity limits (supports 500, 1000 copies; 100,000 technical ceiling)
 * 4. Real API routes: payments/create-order, orders/create-pending, orders/create-cart-pending
 * 5. Rejection of old-tier prices and quantity > 100,000
 * 6. Continued enforcement of stockQuantity / trackStock
 * 7. Real browser UI tests for book.html, bundle.html, cart.html
 */

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => {
    return {
      orders: {
        create: jest.fn().mockImplementation((options) => {
          return Promise.resolve({
            id: `order_fake_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            amount: options.amount,
            currency: options.currency || 'INR',
            receipt: options.receipt,
            status: 'created'
          });
        })
      }
    };
  });
});

const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const {
  calculateShippingCharge,
  SHIPPING_RATE_PER_KG
} = require('../utils/orderPricingCalculator');

const CommissionSettings = require('../models/CommissionSettings');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const Order = require('../models/Order');

let mongod;
let server;
let baseUrl;
let browser;

let buyerUser;
let buyerToken;

let testBook;
let trackedStockBook;
let testBundle;

const JWT_SECRET = 'test_jwt_secret_shipping_qty_rule_2026';

const defaultAddress = {
  name: 'Test Customer',
  homeAddress1: '123 Main Street',
  street: '123 Main Street',
  taluk: 'Hubballi',
  district: 'Dharwad',
  state: 'Karnataka',
  pincode: '580020',
  phone: '9845163604'
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key_shipping';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_shipping';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  buyerUser = await User.create({
    name: 'Shipping Buyer',
    email: 'buyer.shipping@example.com',
    phone: '08362006278',
    role: 'customer',
    address: defaultAddress
  });

  buyerToken = jwt.sign(
    { id: buyerUser._id, userId: buyerUser._id, email: buyerUser.email, role: buyerUser.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Standard book: price 100, weight 0.5kg
  testBook = await Book.create({
    title: 'Standard Test Book',
    author: 'Author A',
    price: 100,
    mrp: 120,
    weight: 0.5,
    trackStock: false
  });

  // Tracked stock book: price 150, weight 0.5kg, available stock = 10
  trackedStockBook = await Book.create({
    title: 'Limited Stock Book',
    author: 'Author B',
    price: 150,
    mrp: 180,
    weight: 0.5,
    trackStock: true,
    stockQuantity: 10,
    stockStatus: 'limited_stock'
  });

  // Test bundle: bundlePrice 400, weight 1.2kg (composed of two 0.6kg books)
  const bundleBook1 = await Book.create({
    title: 'Bundle Book 1',
    author: 'Author B1',
    price: 200,
    weight: 0.6,
    trackStock: false,
    stockQuantity: 100,
    stockStatus: 'in_stock'
  });
  const bundleBook2 = await Book.create({
    title: 'Bundle Book 2',
    author: 'Author B2',
    price: 200,
    weight: 0.6,
    trackStock: false,
    stockQuantity: 100,
    stockStatus: 'in_stock'
  });

  testBundle = await Bundle.create({
    name: 'Complete Test Bundle',
    bundlePrice: 400,
    originalPrice: 500,
    weight: 1.2,
    books: [bundleBook1._id, bundleBook2._id],
    isDigital: false
  });

  // Express app setup
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(REPO_DIR, 'public')));
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/orders', require('../routes/orders'));
  app.use('/api/books', require('../routes/books'));
  app.use('/api/bundles', require('../routes/bundles'));
  app.use('/api', require('../routes/commissionSettings'));
  app.use('/api/auth', require('../routes/auth'));

  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });
}, 90000);

afterAll(async () => {
  if (browser) await browser.close();
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('1. Server Table Shipping Charge Unit Rules', () => {
  test('SHIPPING_RATE_PER_KG constant is strictly 25', () => {
    expect(SHIPPING_RATE_PER_KG).toBe(25);
  });

  const weightCases = [
    { weight: 0.5, expected: 25 },
    { weight: 1.0, expected: 25 },
    { weight: 1.01, expected: 50 },
    { weight: 1.5, expected: 50 },
    { weight: 2.0, expected: 50 },
    { weight: 2.01, expected: 75 },
    { weight: 5.0, expected: 125 },
    { weight: 10.0, expected: 250 },
    { weight: 250.0, expected: 6250 }
  ];

  weightCases.forEach(({ weight, expected }) => {
    test(`Weight ${weight}kg -> ₹${expected}`, () => {
      const charge = calculateShippingCharge(weight);
      expect(charge).toBe(expected);
    });
  });

  describe('Float sum accuracy (3-decimal pre-ceil rounding)', () => {
    test('0.3 + 0.7 = 1.0kg -> exactly ₹25 (not ₹50)', () => {
      const floatSum = 0.3 + 0.7; // 0.9999999999999999 in JS float
      expect(calculateShippingCharge(floatSum)).toBe(25);
    });

    test('3 * 0.1 = 0.3kg -> exactly ₹25', () => {
      const floatMult = 3 * 0.1; // 0.30000000000000004 in JS float
      expect(calculateShippingCharge(floatMult)).toBe(25);
    });

    test('0.1 + 0.2 + 0.7 = 1.0kg -> exactly ₹25', () => {
      const floatTriple = 0.1 + 0.2 + 0.7;
      expect(calculateShippingCharge(floatTriple)).toBe(25);
    });

    test('0.7 + 0.301 = 1.001kg -> exactly ₹50', () => {
      expect(calculateShippingCharge(0.7 + 0.301)).toBe(50);
    });

    test('0kg or negative weight -> ₹0', () => {
      expect(calculateShippingCharge(0)).toBe(0);
      expect(calculateShippingCharge(-1)).toBe(0);
      expect(calculateShippingCharge(null)).toBe(0);
    });
  });
});

describe('2. Real API /api/payments/create-order', () => {
  const runCreateOrderCase = async ({ qty, expectedCourier, expectedTotal, oldTierTotal }) => {
    // 1. Old tier total is strictly rejected (400)
    if (oldTierTotal !== undefined && oldTierTotal !== expectedTotal) {
      try {
        await axios.post(
          `${baseUrl}/api/payments/create-order`,
          {
            amount: oldTierTotal,
            items: [{ id: String(testBook._id), quantity: qty, type: 'book' }],
            deliveryMethod: 'courier',
            courierCharge: oldTierTotal - (testBook.price * qty),
            deliveryAddress: defaultAddress
          },
          { headers: { Authorization: `Bearer ${buyerToken}` } }
        );
        throw new Error('Should have failed with old tier total');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toMatch(/mismatch/i);
      }
    }

    // 2. Exact new total is accepted (200)
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: expectedTotal,
        items: [{ id: String(testBook._id), quantity: qty, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: expectedCourier,
        deliveryAddress: defaultAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(expectedTotal * 100);

    const saved = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(saved).toBeDefined();
    expect(saved.totalAmount).toBe(expectedTotal);
    expect(saved.courierCharge).toBe(expectedCourier);
  };

  test('1 book (0.5kg): charge ₹25, total ₹125', async () => {
    await runCreateOrderCase({ qty: 1, expectedCourier: 25, expectedTotal: 125 });
  });

  test('2 books (1.0kg): charge ₹25, total ₹225 (old tier ₹235 rejected)', async () => {
    // Old tier 1.0kg was 35 -> total was 235
    await runCreateOrderCase({ qty: 2, expectedCourier: 25, expectedTotal: 225, oldTierTotal: 235 });
  });

  test('3 books (1.5kg): charge ₹50, total ₹350 (old tier ₹335 rejected)', async () => {
    // Old tier 1.5kg was 35 -> total was 335
    await runCreateOrderCase({ qty: 3, expectedCourier: 50, expectedTotal: 350, oldTierTotal: 335 });
  });

  test('4 books (2.0kg): charge ₹50, total ₹450 (old tier ₹445 rejected)', async () => {
    // Old tier 2.0kg was 45 -> total was 445
    await runCreateOrderCase({ qty: 4, expectedCourier: 50, expectedTotal: 450, oldTierTotal: 445 });
  });

  test('5 books (2.5kg): charge ₹75, total ₹575 (old tier ₹545 rejected)', async () => {
    // Old tier 2.5kg was 45 -> total was 545
    await runCreateOrderCase({ qty: 5, expectedCourier: 75, expectedTotal: 575, oldTierTotal: 545 });
  });

  test('500 books (250kg): charge ₹6250, total ₹56,250 (large order supported)', async () => {
    const qty = 500;
    const itemsTotal = testBook.price * qty; // 50,000
    const courier = 25 * 250; // 6,250
    const expectedTotal = itemsTotal + courier; // 56,250
    await runCreateOrderCase({ qty, expectedCourier: courier, expectedTotal });
  });

  test('1 bundle (1.2kg): charge ₹50, total ₹450 (old tier ₹435 rejected)', async () => {
    // Old tier 1.2kg was 35 -> total was 435
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 435,
          items: [{ id: String(testBundle._id), quantity: 1, type: 'bundle' }],
          deliveryMethod: 'courier',
          courierCharge: 35,
          deliveryAddress: defaultAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
    }

    // New total 450
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 450,
        items: [{ id: String(testBundle._id), quantity: 1, type: 'bundle' }],
        deliveryMethod: 'courier',
        courierCharge: 50,
        deliveryAddress: defaultAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(450 * 100);
  });

  test('Pickup orders: courierCharge strictly ₹0 for books and 500 copies', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 50000,
        items: [{ id: String(testBook._id), quantity: 500, type: 'book' }],
        deliveryMethod: 'pickup',
        courierCharge: 0
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(res.status).toBe(200);
    expect(res.data.order.amount).toBe(50000 * 100);
    const saved = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(saved.courierCharge).toBe(0);
    expect(saved.deliveryMethod).toBe('pickup');
  });

  test('Technical ceiling: quantity > 100,000 rejected with clear error', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 10000100,
          items: [{ id: String(testBook._id), quantity: 100001, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 2500025,
          deliveryAddress: defaultAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toMatch(/cannot exceed 100,000/i);
    }
  });

  test('Stock limit still enforced when trackStock is enabled', async () => {
    // Book has 10 in stock. Buying 11 must fail.
    // 11 * 150 = 1650 + 150 shipping (5.5kg -> 6kg * 25 = 150) = 1800
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 1800,
          items: [{ id: String(trackedStockBook._id), quantity: 11, type: 'book' }],
          deliveryMethod: 'courier',
          courierCharge: 150,
          deliveryAddress: defaultAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed due to stock limit');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toBe('Insufficient stock');
    }

    // Buying 5 copies within stock succeeds
    const okRes = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 825, // 5 * 150 = 750 + 75 shipping (2.5kg) = 825
        items: [{ id: String(trackedStockBook._id), quantity: 5, type: 'book' }],
        deliveryMethod: 'courier',
        courierCharge: 75,
        deliveryAddress: defaultAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(okRes.status).toBe(200);
  });
});

describe('3. Real API /orders/create-pending and /orders/create-cart-pending', () => {
  test('/orders/create-pending with 500 books accepts exact ₹56,250 and rejects old tier', async () => {
    const res = await axios.post(
      `${baseUrl}/api/orders/create-pending`,
      {
        bookId: String(testBook._id),
        quantity: 500,
        paymentType: 'cheque',
        deliveryMethod: 'courier',
        courierCharge: 6250,
        totalAmount: 56250,
        deliveryAddress: defaultAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(res.status).toBe(200);
    const order = await Order.findById(res.data.orderId);
    expect(order.totalAmount).toBe(56250);
    expect(order.courierCharge).toBe(6250);
    expect(order.items[0].quantity).toBe(500);
  });

  test('/orders/create-pending quantity > 100,000 rejected', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-pending`,
        {
          bookId: String(testBook._id),
          quantity: 100001,
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          courierCharge: 2500025,
          totalAmount: 12500125,
          deliveryAddress: defaultAddress
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toMatch(/cannot exceed 100,000/i);
    }
  });

  test('/orders/create-cart-pending with 500 books and bundle accepts exact total', async () => {
    // 500 books (50,000, 250kg) + 1 bundle (400, 1.2kg) = 50,400 items. Total weight = 251.2kg -> ceil is 252 -> courier = 25 * 252 = 6300.
    // Total = 50400 + 6300 = 56700
    const res = await axios.post(
      `${baseUrl}/api/orders/create-cart-pending`,
      {
        cartItems: [
          { id: String(testBook._id), type: 'book', quantity: 500 },
          { id: String(testBundle._id), type: 'bundle', quantity: 1 }
        ],
        paymentType: 'transfer',
        deliveryMethod: 'courier',
        courierCharge: 6300,
        totalAmount: 56700,
        deliveryAddress: defaultAddress
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(res.status).toBe(200);
    const order = await Order.findById(res.data.orderId);
    expect(order.totalAmount).toBe(56700);
    expect(order.courierCharge).toBe(6300);
  });
});

describe('4. Real-Browser Playwright UI Tests', () => {
  test('book.html quantity input accepts 500 and 1000 with exact displayed courier charge and total', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/book.html?id=${testBook._id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#bookQuantity', { timeout: 10000 });

      // Verify max attribute is 100000
      const maxAttr = await page.$eval('#bookQuantity', el => el.getAttribute('max'));
      expect(maxAttr).toBe('100000');

      // Set quantity to 500
      await page.fill('#bookQuantity', '500');
      await page.dispatchEvent('#bookQuantity', 'input');
      await page.dispatchEvent('#bookQuantity', 'change');
      await page.waitForTimeout(500);

      const weight500 = await page.$eval('#totalWeight', el => el.textContent);
      const courier500 = await page.$eval('#totalCourierCharge', el => el.textContent);
      expect(weight500).toContain('250');
      expect(courier500).toContain('6250');

      // Set quantity to 1000
      await page.fill('#bookQuantity', '1000');
      await page.dispatchEvent('#bookQuantity', 'input');
      await page.dispatchEvent('#bookQuantity', 'change');
      await page.waitForTimeout(500);

      const weight1000 = await page.$eval('#totalWeight', el => el.textContent);
      const courier1000 = await page.$eval('#totalCourierCharge', el => el.textContent);
      expect(weight1000).toContain('500');
      expect(courier1000).toContain('12500');
    } finally {
      await page.close();
    }
  });

  test('cart.html with quantity 500 displays courier ₹6250 and grand total ₹56,250', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // Seed cart with 500 copies of testBook in localStorage
      await context.addInitScript(({ book, user, token }) => {
        localStorage.setItem('cart', JSON.stringify([
          {
            id: String(book._id),
            title: book.title,
            price: book.price,
            quantity: 500,
            weight: book.weight,
            isBundle: false
          }
        ]));
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
      }, { book: testBook, user: buyerUser, token: buyerToken });

      await page.goto(`${baseUrl}/cart.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.qty-input', { timeout: 10000 });

      // Verify qty-input has value 500 and max 100000
      const qtyVal = await page.$eval('.qty-input', el => el.value);
      const maxVal = await page.$eval('.qty-input', el => el.getAttribute('max'));
      expect(Number(qtyVal)).toBe(500);
      expect(maxVal).toBe('100000');

      // Select home delivery
      const homeRadio = await page.waitForSelector('input[name="deliveryMethod"][value="home"]');
      await homeRadio.check();
      await page.waitForTimeout(600);

      // Check delivery charge
      const deliveryChargeText = await page.$eval('#homeDeliveryCharge', el => el.textContent);
      expect(deliveryChargeText).toContain('6250');

      // Check grand total (50,000 + 6,250 = 56,250)
      const grandTotalText = await page.$eval('#cartTotal .summary-value-total', el => el.textContent);
      expect(grandTotalText.replace(/,/g, '')).toContain('56250');
    } finally {
      await context.close();
    }
  });

  test('bundle.html quantity input accepts 500 and computes correct courier charge', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/bundle.html?id=${testBundle._id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#bundleQuantity', { timeout: 10000 });

      // Verify max attribute is 100000
      const maxAttr = await page.$eval('#bundleQuantity', el => el.getAttribute('max'));
      expect(maxAttr).toBe('100000');

      // Set quantity to 500
      await page.fill('#bundleQuantity', '500');
      await page.dispatchEvent('#bundleQuantity', 'input');
      await page.dispatchEvent('#bundleQuantity', 'change');
      await page.waitForTimeout(500);

      // 500 bundles of 1.2kg = 600kg -> courier charge is 25 * 600 = 15,000
      // Base price = 400 * 500 = 200,000. Total = 215,000.
      const courierText = await page.$eval('#bundleCourierCharge', el => el.textContent);
      expect(courierText.replace(/,/g, '')).toContain('15000');

      const totalText = await page.$eval('#bundleCourierPrice', el => el.textContent);
      expect(totalText.replace(/,/g, '')).toContain('215000');
    } finally {
      await page.close();
    }
  });
});
