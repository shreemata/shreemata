/**
 * @jest-environment node
 *
 * tests/orderTrackingPublic.test.js
 *
 * Comprehensive tests for GET /api/orders/track/:orderId
 * - Verifies unauthenticated and authenticated callers get the same safe shape
 * - Verifies absence of all sensitive fields (PII, addresses, payment IDs, internal profit/commissions)
 * - Verifies strict identifier validation and NoSQL injection resistance
 * - Includes a real-browser test driving public/track-order.html via Playwright (real clicks)
 */

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const Order = require(path.join(REPO_DIR, 'models/Order'));
const User = require(path.join(REPO_DIR, 'models/User'));
const ordersRouter = require(path.join(REPO_DIR, 'routes/orders'));

// Helper for native fetch
async function httpGet(url, headers = {}) {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe('Public Order Tracking API & Browser Tests', () => {
  let mongod;
  let server;
  let baseUrl;
  let browser;
  let seededUser;
  let ownerToken;
  let dispatchedOrder;
  let pendingOrder;

  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_tracking_suite_123';
  process.env.JWT_SECRET = JWT_SECRET;

  jest.setTimeout(60000);

  beforeAll(async () => {
    // 1. In-memory Mongo setup adhering to local safety guard
    if (mongoose.connection.readyState === 0) {
      mongod = await MongoMemoryServer.create();
      await mongoose.connect(mongod.getUri());
    }

    // 2. Setup Express app hosting public assets and real orders router
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(REPO_DIR, 'public')));
    app.use('/api/orders', ordersRouter);

    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // 3. Seed User with sensitive PII
    seededUser = await User.create({
      name: 'Krishna Kumar Tambur',
      email: 'supersecret_customer_123@private-domain.test',
      phone: '9988776655',
      password: 'HashedPassword123!',
      role: 'customer'
    });

    ownerToken = jwt.sign({ id: seededUser._id, role: 'customer' }, JWT_SECRET);

    // 4. Seed Dispatched Order with full sensitive details
    dispatchedOrder = await Order.create({
      user_id: seededUser._id,
      deliveryAddress: {
        name: 'Krishna Kumar Tambur',
        street: '42 Private Lane',
        homeAddress1: 'Villa 9',
        homeAddress2: 'Floor 3',
        city: 'Bangalore',
        district: 'Bangalore Urban',
        state: 'Karnataka',
        pincode: '560001',
        phone: '9988776655'
      },
      items: [{
        id: 'book-1',
        title: 'Shree Mata Spiritual Guide',
        author: 'Shree Mata',
        price: 500,
        quantity: 2,
        profitTypeSnapshot: 'fixed',
        profitValueSnapshot: 50,
        unitProfitSnapshot: 50,
        lineProfitSnapshot: 100,
        cashbackAmount: 25,
        cashbackPercentage: 5
      }],
      totalAmount: 1000,
      orderProfitTotal: 100,
      profitAmount: 100,
      courierCharge: 50,
      totalWeight: 1.5,
      deliveryMethod: 'courier',
      razorpay_order_id: 'order_Krk1234567890',
      razorpay_payment_id: 'pay_SecretPayId999',
      paymentType: 'check',
      paymentDetails: {
        checkNumber: 'CHK-998811',
        bankName: 'Secret Swiss Bank',
        accountNumber: '9988776655443322',
        ifscCode: 'SWIS0001234',
        checkImageUrl: 'https://drive.google.com/secret-check.jpg',
        transferReceiptUrl: 'https://drive.google.com/secret-receipt.pdf',
        adminNotes: 'Confidential order notes for admin only'
      },
      commissionStatus: 'pending',
      status: 'completed',
      deliveryStatus: 'shipped',
      courierNumber: 'TPC-998877',
      trackingInfo: {
        trackingId: 'TPC-998877',
        trackingUrl: 'https://www.tpcindia.com/track?id=TPC-998877',
        trackingWebsite: 'https://www.tpcindia.com'
      }
    });

    // 5. Seed Pending Order
    pendingOrder = await Order.create({
      user_id: seededUser._id,
      deliveryAddress: {
        name: 'Priya Sharma',
        city: 'Hubli',
        phone: '9112233445'
      },
      items: [{
        id: 'book-2',
        title: 'Kannada Literature Vol 1',
        price: 350,
        quantity: 1
      }],
      totalAmount: 350,
      status: 'pending',
      deliveryStatus: 'pending',
      deliveryMethod: 'pickup'
    });

    // 6. Launch browser for Playwright test
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) server.close();
    if (dispatchedOrder) await Order.deleteOne({ _id: dispatchedOrder._id });
    if (pendingOrder) await Order.deleteOne({ _id: pendingOrder._id });
    if (seededUser) await User.deleteOne({ _id: seededUser._id });
    if (mongod) {
      await mongoose.disconnect();
      await mongod.stop();
    }
  });

  test('1. Valid 24-hex ObjectId returns 200 with strictly allowed fields and zero forbidden fields', async () => {
    const res = await httpGet(`${baseUrl}/api/orders/track/${dispatchedOrder._id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const order = res.data.order;
    expect(order).toBeDefined();

    // Allowed top-level keys
    const allowedKeys = new Set([
      '_id',
      'orderNumber',
      'status',
      'deliveryStatus',
      'deliveryMethod',
      'createdAt',
      'updatedAt',
      'items',
      'customerName',
      'courierNumber',
      'trackingInfo'
    ]);

    Object.keys(order).forEach(key => {
      expect(allowedKeys.has(key)).toBe(true);
    });

    // Verify items array shape
    expect(order.items.length).toBe(1);
    expect(Object.keys(order.items[0]).sort()).toEqual(['quantity', 'title']);
    expect(order.items[0].title).toBe('Shree Mata Spiritual Guide');
    expect(order.items[0].quantity).toBe(2);

    // Verify trackingInfo shape
    expect(order.trackingInfo).toEqual({
      trackingId: 'TPC-998877',
      trackingUrl: 'https://www.tpcindia.com/track?id=TPC-998877',
      trackingWebsite: 'https://www.tpcindia.com',
      updatedAt: null
    });

    // Verify masked customer name
    expect(order.customerName).toBe('Krishna T.');

    // String-search absence of seeded sensitive information in the entire serialized JSON
    const rawJson = JSON.stringify(res.data);
    const forbiddenSubstrings = [
      'supersecret_customer_123@private-domain.test',
      '9988776655',
      '42 Private Lane',
      'Villa 9',
      'Floor 3',
      'Bangalore',
      '560001',
      'pay_SecretPayId999',
      'CHK-998811',
      'Secret Swiss Bank',
      '9988776655443322',
      'SWIS0001234',
      'secret-check.jpg',
      'secret-receipt.pdf',
      'Confidential order notes',
      'orderProfitTotal',
      'profitAmount',
      'unitProfitSnapshot',
      'lineProfitSnapshot',
      'cashbackAmount',
      'totalAmount'
    ];

    forbiddenSubstrings.forEach(forbidden => {
      expect(rawJson).not.toContain(forbidden);
    });
  });

  test('2. Valid Razorpay order_ id returns 200 with the exact same safe structure', async () => {
    const res = await httpGet(`${baseUrl}/api/orders/track/order_Krk1234567890`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.order._id).toBe(dispatchedOrder._id.toString());
    expect(res.data.order.orderNumber).toBe(dispatchedOrder._id.toString().slice(-8).toUpperCase());
    expect(res.data.order.status).toBe('completed');
    expect(res.data.order.courierNumber).toBe('TPC-998877');

    const rawJson = JSON.stringify(res.data);
    expect(rawJson).not.toContain('supersecret_customer_123@private-domain.test');
    expect(rawJson).not.toContain('9988776655');
  });

  test('3. Unknown valid 24-hex ObjectId returns 404', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await httpGet(`${baseUrl}/api/orders/track/${fakeId}`);
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Order not found' });
  });

  test('4. Unknown valid Razorpay order_ ID returns 404', async () => {
    const res = await httpGet(`${baseUrl}/api/orders/track/order_nonexistent999`);
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Order not found' });
  });

  test('5. Malformed identifiers are strictly rejected with 400', async () => {
    const malformed = [
      '123',
      'short',
      '../../etc/passwd',
      '<script>alert(1)</script>',
      'not-a-valid-hex-or-order',
      'order_!@#$invalid'
    ];

    for (const id of malformed) {
      const res = await httpGet(`${baseUrl}/api/orders/track/${encodeURIComponent(id)}`);
      expect(res.status).toBe(400);
      expect(res.data).toEqual({ error: 'Invalid order identifier format' });
    }
  });

  test('6. NoSQL-operator payloads do not widen the lookup', async () => {
    // Query string parameter with NoSQL operator is ignored; matches only the path orderId
    const resParam = await httpGet(`${baseUrl}/api/orders/track/${dispatchedOrder._id}?x[$ne]=1`);
    expect(resParam.status).toBe(200);
    expect(resParam.data.order._id).toBe(dispatchedOrder._id.toString());

    // Path containing encoded operator is rejected as malformed
    const resPath = await httpGet(`${baseUrl}/api/orders/track/${encodeURIComponent('{"$ne":1}')}`);
    expect(resPath.status).toBe(400);
    expect(resPath.data).toEqual({ error: 'Invalid order identifier format' });
  });

  test('7. Logged-in owner and anonymous caller get the exact same safe shape', async () => {
    const resAnon = await httpGet(`${baseUrl}/api/orders/track/${dispatchedOrder._id}`);
    const resOwner = await httpGet(`${baseUrl}/api/orders/track/${dispatchedOrder._id}`, {
      'Authorization': `Bearer ${ownerToken}`
    });

    expect(resAnon.status).toBe(200);
    expect(resOwner.status).toBe(200);
    expect(resOwner.data).toEqual(resAnon.data);
  });

  test('8. Real-browser test: public/track-order.html displays order status without dispatchEvent shortcuts', async () => {
    const page = await browser.newPage();

    // Part A: Direct URL with ?order=<id> query parameter
    const directUrl = `${baseUrl}/track-order.html?order=${dispatchedOrder._id}`;
    await page.goto(directUrl, { waitUntil: 'networkidle' });

    // Assert Dispatched state is rendered
    await page.waitForSelector('#resultArea .card-dispatched', { timeout: 10000 });
    const dispatchedTitle = await page.textContent('.status-title-dispatched');
    expect(dispatchedTitle.trim()).toBe('Dispatched');

    const expectedDocNum = dispatchedOrder._id.toString().slice(-8).toUpperCase();
    const infoValues = await page.$$eval('.result-info-val', els => els.map(e => e.textContent.trim()));
    expect(infoValues).toContain(expectedDocNum);
    expect(infoValues).toContain('TPC-998877');

    const courierLink = await page.$eval('.btn-courier-link', el => el.getAttribute('href'));
    expect(courierLink).toContain('https://www.tpcindia.com');

    // Part B: Real user action form submit with real click (NO dispatchEvent)
    await page.goto(`${baseUrl}/track-order.html`, { waitUntil: 'networkidle' });
    await page.fill('#trackInput', pendingOrder._id.toString());
    await page.click('#checkStatusBtn');

    // Assert Pending state is rendered
    await page.waitForSelector('#resultArea .card-pending', { timeout: 10000 });
    const pendingTitle = await page.textContent('.status-title-pending');
    expect(pendingTitle.trim()).toBe('Pending');

    const pendingDocNum = pendingOrder._id.toString().slice(-8).toUpperCase();
    const pendingInfoValues = await page.$$eval('.result-info-val', els => els.map(e => e.textContent.trim()));
    expect(pendingInfoValues).toContain(pendingDocNum);

    await page.close();
  });
});
