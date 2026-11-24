/**
 * @jest-environment node
 *
 * tests/cartServerParityBrowser.test.js
 *
 * End-to-end real-browser verification proving Cart-to-Server Parity:
 * Drives actual cart.html page (no mocked amounts), sends the exact payload
 * produced by the page to real POST /api/payments/create-order, and expects
 * HTTP 200 with the server order amount strictly equal to the total shown on screen,
 * for BOTH courier and store pickup across all scenarios (a) through (e).
 */

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
          amount: 22500,
          currency: 'INR',
          status: 'captured'
        }))
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
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

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

// Seeded Catalog Items
let bookStd;        // weight 0.50kg, price 200
let bookUnder2;     // weight 0.50kg, price 180
let bookOver2;      // weight 0.55kg, price 180
let bookBaseA;      // weight 0.48kg, price 120
let bookCustom;     // weight 0.75kg, price 250 (custom weight)
let bundleStd;      // weight 1.20kg, price 450
let bundleBoundary; // weight 1.00kg, price 400
let bundleNoWeight; // weight undefined, price 499, books: [bookStd, bookUnder2]

const JWT_SECRET = 'test_jwt_secret_cart_server_parity_2026';

const parityResultsTable = [];

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_parity_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_parity_secret';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Configure dynamic shipping rates in DB
  await CommissionSettings.create({
    shippingRates: [
      { minWeight: 0, maxWeight: 0.99, rate: 25 },
      { minWeight: 1, maxWeight: 1.99, rate: 35 },
      { minWeight: 2, maxWeight: 2.99, rate: 45 },
      { minWeight: 3, maxWeight: 4.99, rate: 55 },
      { minWeight: 5, maxWeight: 9.99, rate: 75 }
    ]
  });

  buyerUser = await User.create({
    name: 'Parity Customer',
    email: 'parity.buyer@example.com',
    phone: '9845163604',
    role: 'customer',
    address: {
      addressLine: 'Door 100, Parity Avenue',
      homeAddress1: 'Door 100, Parity Avenue',
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
    { expiresIn: '2h' }
  );

  // Seed Books
  bookStd = await Book.create({
    title: 'Standard Physics Volume 1',
    author: 'Author P',
    price: 200,
    physicalPrice: 250,
    sellingPrice: 200,
    weight: 0.50,
    stockQuantity: 100,
    stockStatus: 'in_stock',
    isDigital: false
  });

  bookBaseA = await Book.create({
    title: 'Base Math Book A',
    author: 'Author A',
    price: 120,
    physicalPrice: 150,
    sellingPrice: 120,
    weight: 0.48,
    stockQuantity: 100,
    stockStatus: 'in_stock',
    isDigital: false
  });

  bookUnder2 = await Book.create({
    title: 'Chemistry Book Under 2kg Boundary',
    author: 'Author B',
    price: 180,
    physicalPrice: 220,
    sellingPrice: 180,
    weight: 0.50,
    stockQuantity: 100,
    stockStatus: 'in_stock',
    isDigital: false
  });

  bookOver2 = await Book.create({
    title: 'Chemistry Book Over 2kg Boundary',
    author: 'Author B',
    price: 180,
    physicalPrice: 220,
    sellingPrice: 180,
    weight: 0.55,
    stockQuantity: 100,
    stockStatus: 'in_stock',
    isDigital: false
  });

  bookCustom = await Book.create({
    title: 'Advanced Custom Weight Biology',
    author: 'Author Bio',
    price: 250,
    physicalPrice: 300,
    sellingPrice: 250,
    weight: 0.75,
    stockQuantity: 100,
    stockStatus: 'in_stock',
    isDigital: false
  });

  // Seed Bundles
  bundleStd = await Bundle.create({
    name: 'Standard Duo Combo',
    bundlePrice: 450,
    originalPrice: 550,
    weight: 1.20,
    books: [bookStd._id, bookBaseA._id],
    isDigital: false
  });

  bundleBoundary = await Bundle.create({
    name: 'Boundary Science Master Bundle',
    bundlePrice: 400,
    originalPrice: 500,
    weight: 1.00,
    books: [bookBaseA._id, bookUnder2._id],
    isDigital: false
  });

  bundleNoWeight = await Bundle.create({
    name: 'No Stored Weight Classic Bundle',
    bundlePrice: 499,
    originalPrice: 600,
    books: [bookStd._id, bookUnder2._id],
    isDigital: false
  });

  // Express App
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(REPO_DIR, 'public')));
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/orders', require('../routes/orders'));
  app.use('/api/books', require('../routes/books'));
  app.use('/api/bundles', require('../routes/bundles'));
  app.use('/api/notifications', require('../routes/notifications'));
  app.use('/api', require('../routes/commissionSettings'));
  app.use('/api/admin', require('../routes/commissionSettings'));
  app.use('/api', require('../routes/auth'));
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

  console.log('\n========================================================================================================');
  console.log('CART-TO-SERVER PARITY VERIFICATION TABLE');
  console.log('========================================================================================================');
  console.table(parityResultsTable);
  console.log('========================================================================================================\n');
});

/**
 * Helper to drive cart.html with real Playwright browser and test create-order payload vs displayed total
 */
async function testCartScenario({ scenarioName, cartItems, deliveryMethod }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(({ cart, token, user }) => {
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.setItem('cart_guest', JSON.stringify(cart));
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, {
    cart: cartItems,
    token: buyerToken,
    user: { _id: String(buyerUser._id), name: buyerUser.name, email: buyerUser.email }
  });

  const page = await context.newPage();

  let capturedPayload = null;
  let capturedResponse = null;

  page.on('request', req => {
    if (req.url().includes('/api/payments/create-order')) {
      try {
        capturedPayload = JSON.parse(req.postData());
      } catch (e) {
        capturedPayload = null;
      }
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/payments/create-order')) {
      try {
        capturedResponse = {
          status: res.status(),
          body: await res.json()
        };
      } catch (e) {
        capturedResponse = {
          status: res.status(),
          body: null
        };
      }
    }
  });

  await page.goto(`${baseUrl}/cart.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);

  // Select delivery method radio
  const methodValue = deliveryMethod === 'courier' ? 'home' : 'pickup';
  const radio = await page.waitForSelector(`input[name="deliveryMethod"][value="${methodValue}"]`);
  await radio.check();
  await page.waitForTimeout(600);

  // Read grand total directly from the page DOM
  const displayedTotalText = await page.$eval(
    '.summary-row.total-row .cart-line-total-amount, .summary-row.total-row span:last-child',
    el => el.textContent.trim()
  );
  const match = displayedTotalText.match(/[0-9]+(\.[0-9]+)?/);
  expect(match).not.toBeNull();
  const displayedTotal = parseFloat(match[0]);

  // Proceed with checkout
  if (deliveryMethod === 'courier') {
    await page.click('#checkoutBtn');
    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 8000 });
    await page.fill('#cartBillingName', 'Parity Customer');
    await page.fill('#cartBillingPhone', '9845163604');
    await page.fill('#cartBillingEmail', 'parity.buyer@example.com');
    await page.fill('#cartBillingAddress1', 'Door 100, Parity Avenue');
    await page.fill('#cartBillingAddress2', 'Vidyanagar');
    await page.fill('#cartBillingTaluk', 'Hubballi');
    await page.fill('#cartBillingDistrict', 'Dharwad');
    await page.fill('#cartBillingState', 'Karnataka');
    await page.fill('#cartBillingPincode', '580020');
    await page.click('#cartBillingAddressForm button[type="submit"]');

    await page.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 8000 });
    await page.click('button[onclick="proceedWithCartOnlinePayment()"]');
  } else {
    // Pickup mode
    await page.evaluate(() => {
      window.cartBillingAddress = {
        name: 'Parity Customer',
        phone: '9845163604',
        email: 'parity.buyer@example.com'
      };
    });
    await page.click('#checkoutBtn');
    await page.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 8000 });
    await page.click('button[onclick="proceedWithCartOnlinePayment()"]');
  }

  // Wait for network response
  await page.waitForTimeout(1500);

  const payloadAmount = capturedPayload?.amount;
  const serverStatus = capturedResponse?.status;
  const serverOrderAmount = capturedResponse?.body?.order?.amount
    ? capturedResponse.body.order.amount / 100
    : null;
  const serverDbAmount = capturedResponse?.body?.dbOrder?.totalAmount;

  const passed = (
    serverStatus === 200 &&
    payloadAmount === displayedTotal &&
    serverOrderAmount === displayedTotal &&
    serverDbAmount === displayedTotal
  );

  const tableRow = {
    Scenario: scenarioName,
    Delivery: deliveryMethod,
    'Displayed Total': `₹${displayedTotal}`,
    'Payload Amount': payloadAmount !== undefined ? `₹${payloadAmount}` : 'N/A',
    'Server Order Amount': serverOrderAmount !== null ? `₹${serverOrderAmount}` : 'N/A',
    'Server Status': serverStatus || 'N/A',
    Result: passed ? 'PASS (200)' : `FAIL (${serverStatus})`
  };
  parityResultsTable.push(tableRow);

  if (serverStatus !== 200) {
    console.error(`❌ FAILED SCENARIO [${scenarioName} - ${deliveryMethod}]:`, JSON.stringify(capturedResponse, null, 2));
  }

  // Strict assertions
  expect(serverStatus).toBe(200);
  expect(payloadAmount).toBe(displayedTotal);
  expect(serverOrderAmount).toBe(displayedTotal);
  expect(serverDbAmount).toBe(displayedTotal);

  await context.close();
}

describe('Cart-to-Server Parity Browser Verification Suite', () => {
  // =========================================================================
  // a) 1 book, quantity 1
  // =========================================================================
  describe('a) 1 book, quantity 1', () => {
    test('Courier: displays ₹225, payload ₹225, server creates order for ₹225 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bookStd._id),
          title: bookStd.title,
          author: bookStd.author,
          price: bookStd.price,
          quantity: 1,
          weight: bookStd.weight,
          isBundle: false
        }
      ];
      await testCartScenario({
        scenarioName: 'a) 1 book, qty 1',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Pickup: displays ₹200, payload ₹200, server creates order for ₹200 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bookStd._id),
          title: bookStd.title,
          author: bookStd.author,
          price: bookStd.price,
          quantity: 1,
          weight: bookStd.weight,
          isBundle: false
        }
      ];
      await testCartScenario({
        scenarioName: 'a) 1 book, qty 1',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);
  });

  // =========================================================================
  // b) 1 book, quantity 3
  // =========================================================================
  describe('b) 1 book, quantity 3', () => {
    test('Courier: displays ₹635 (weight 1.5kg -> ₹35 shipping), payload ₹635, server order ₹635 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bookStd._id),
          title: bookStd.title,
          author: bookStd.author,
          price: bookStd.price,
          quantity: 3,
          weight: bookStd.weight,
          isBundle: false
        }
      ];
      await testCartScenario({
        scenarioName: 'b) 1 book, qty 3',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Pickup: displays ₹600 (no shipping), payload ₹600, server order ₹600 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bookStd._id),
          title: bookStd.title,
          author: bookStd.author,
          price: bookStd.price,
          quantity: 3,
          weight: bookStd.weight,
          isBundle: false
        }
      ];
      await testCartScenario({
        scenarioName: 'b) 1 book, qty 3',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);
  });

  // =========================================================================
  // c) 1 bundle
  // =========================================================================
  describe('c) 1 bundle', () => {
    test('Courier: displays ₹485 (weight 1.2kg -> ₹35 shipping), payload ₹485, server order ₹485 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bundleStd._id),
          bundleId: String(bundleStd._id),
          title: bundleStd.name,
          price: bundleStd.bundlePrice,
          quantity: 1,
          weight: bundleStd.weight,
          isBundle: true,
          books: bundleStd.books
        }
      ];
      await testCartScenario({
        scenarioName: 'c) 1 bundle',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Pickup: displays ₹450 (no shipping), payload ₹450, server order ₹450 (HTTP 200)', async () => {
      const cart = [
        {
          id: String(bundleStd._id),
          bundleId: String(bundleStd._id),
          title: bundleStd.name,
          price: bundleStd.bundlePrice,
          quantity: 1,
          weight: bundleStd.weight,
          isBundle: true,
          books: bundleStd.books
        }
      ];
      await testCartScenario({
        scenarioName: 'c) 1 bundle',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);
  });

  // =========================================================================
  // d) 2 books + 1 bundle across three tier boundaries (2kg, 3kg, 5kg)
  // =========================================================================
  describe('d) 2 books + 1 bundle across three tier boundaries', () => {
    // Boundary 2.0 kg - Just Under: 0.48kg + 0.50kg + 1.00kg = 1.98kg -> rate ₹35
    test('Boundary 2kg - Just Under (1.98kg) Courier: total ₹735 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 1, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 1, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd1) 2kg boundary (1.98kg under)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 2kg - Just Under (1.98kg) Pickup: total ₹700 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 1, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 1, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd1) 2kg boundary (1.98kg under)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);

    // Boundary 2.0 kg - Just Over: 0.48kg + 0.55kg + 1.00kg = 2.03kg -> rate ₹45
    test('Boundary 2kg - Just Over (2.03kg) Courier: total ₹745 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 1, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 1, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd2) 2kg boundary (2.03kg over)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 2kg - Just Over (2.03kg) Pickup: total ₹700 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 1, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 1, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd2) 2kg boundary (2.03kg over)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);

    // Boundary 3.0 kg - Just Under: 2*0.48kg (0.96) + 2*0.50kg (1.00) + 1.00kg = 2.96kg -> rate ₹45
    test('Boundary 3kg - Just Under (2.96kg) Courier: total ₹1045 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 2, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 2, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd3) 3kg boundary (2.96kg under)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 3kg - Just Under (2.96kg) Pickup: total ₹1000 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 2, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 2, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd3) 3kg boundary (2.96kg under)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);

    // Boundary 3.0 kg - Just Over: 2*0.48kg (0.96) + 2*0.55kg (1.10) + 1.00kg = 3.06kg -> rate ₹55
    test('Boundary 3kg - Just Over (3.06kg) Courier: total ₹1055 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 2, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 2, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd4) 3kg boundary (3.06kg over)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 3kg - Just Over (3.06kg) Pickup: total ₹1000 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 2, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 2, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd4) 3kg boundary (3.06kg over)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);

    // Boundary 5.0 kg - Just Under: 4*0.48kg (1.92) + 4*0.50kg (2.00) + 1.00kg = 4.92kg -> rate ₹55
    test('Boundary 5kg - Just Under (4.92kg) Courier: total ₹1655 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 4, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 4, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd5) 5kg boundary (4.92kg under)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 5kg - Just Under (4.92kg) Pickup: total ₹1600 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 4, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookUnder2._id), title: bookUnder2.title, price: bookUnder2.price, quantity: 4, weight: bookUnder2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd5) 5kg boundary (4.92kg under)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);

    // Boundary 5.0 kg - Just Over: 4*0.48kg (1.92) + 4*0.55kg (2.20) + 1.00kg = 5.12kg -> rate ₹75
    test('Boundary 5kg - Just Over (5.12kg) Courier: total ₹1675 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 4, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 4, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd6) 5kg boundary (5.12kg over)',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Boundary 5kg - Just Over (5.12kg) Pickup: total ₹1600 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookBaseA._id), title: bookBaseA.title, price: bookBaseA.price, quantity: 4, weight: bookBaseA.weight, isBundle: false },
        { id: String(bookOver2._id), title: bookOver2.title, price: bookOver2.price, quantity: 4, weight: bookOver2.weight, isBundle: false },
        { id: String(bundleBoundary._id), bundleId: String(bundleBoundary._id), title: bundleBoundary.name, price: bundleBoundary.bundlePrice, quantity: 1, weight: bundleBoundary.weight, isBundle: true, books: bundleBoundary.books }
      ];
      await testCartScenario({
        scenarioName: 'd6) 5kg boundary (5.12kg over)',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);
  });

  // =========================================================================
  // e) Book with custom weight saved in DB, and bundle with no weight saved
  // =========================================================================
  describe('e) Book with custom weight + bundle with no weight saved', () => {
    test('Courier: displays ₹784 (weight 0.75 + 1.00 = 1.75kg -> ₹35 shipping), payload ₹784, server order ₹784 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookCustom._id), title: bookCustom.title, price: bookCustom.price, quantity: 1, weight: bookCustom.weight, isBundle: false },
        { id: String(bundleNoWeight._id), bundleId: String(bundleNoWeight._id), title: bundleNoWeight.name, price: bundleNoWeight.bundlePrice, quantity: 1, isBundle: true, books: bundleNoWeight.books }
      ];
      await testCartScenario({
        scenarioName: 'e) Custom book + bundle with no weight',
        cartItems: cart,
        deliveryMethod: 'courier'
      });
    }, 60000);

    test('Pickup: displays ₹749 (no shipping), payload ₹749, server order ₹749 (HTTP 200)', async () => {
      const cart = [
        { id: String(bookCustom._id), title: bookCustom.title, price: bookCustom.price, quantity: 1, weight: bookCustom.weight, isBundle: false },
        { id: String(bundleNoWeight._id), bundleId: String(bundleNoWeight._id), title: bundleNoWeight.name, price: bundleNoWeight.bundlePrice, quantity: 1, isBundle: true, books: bundleNoWeight.books }
      ];
      await testCartScenario({
        scenarioName: 'e) Custom book + bundle with no weight',
        cartItems: cart,
        deliveryMethod: 'pickup'
      });
    }, 60000);
  });
});
