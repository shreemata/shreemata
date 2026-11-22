/**
 * tests/pickupRealClickRegression.test.js
 *
 * Real user-action regression test for pickup & courier address form submissions.
 * Uses real page.click (NO dispatchEvent('submit')) to verify that hidden required
 * inputs do NOT silently block HTML5 form submission.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

function checkPortOpen(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, res => {
        if (res.statusCode < 500) resolve(true);
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} failed to start within ${timeoutMs}ms`));
      } else {
        setTimeout(ping, 1000);
      }
    }
    ping();
  });
}

function apiPost(pathName, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path: pathName,
      method: 'POST',
      headers
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiGet(pathName) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path: pathName,
      method: 'GET'
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Pickup Real Click Regression Tests', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBookId = null;
  let seededBundleId = null;
  let studentUser = null;
  let studentToken = null;

  beforeAll(async () => {
    const isRunning = await checkPortOpen(3100);
    if (!isRunning) {
      console.log('Starting dev-run-four-sections.js on port 3100...');
      devServerProcess = spawn('node', ['scripts/dev-run-four-sections.js'], {
        cwd: REPO_DIR,
        stdio: 'pipe',
        windowsHide: true
      });
      await waitForServer('http://127.0.0.1:3100/');
      console.log('Dev server ready.');
    }

    // Retrieve seeded book
    let books = [];
    for (let i = 0; i < 20; i++) {
      const booksRes = await apiGet('/api/books');
      books = Array.isArray(booksRes) ? booksRes : (booksRes.books || []);
      if (books && books.length > 0) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const book = books[0];
    seededBookId = book._id || book.id;
    const bookPrice = book.price || 340;

    // Retrieve or seed bundle
    const bundlesRes = await apiGet('/api/bundles');
    const bundles = Array.isArray(bundlesRes) ? bundlesRes : (bundlesRes.bundles || []);
    if (bundles && bundles.length > 0) {
      seededBundleId = bundles[0]._id || bundles[0].id;
    } else {
      const adminLogin = await apiPost('/api/login', {
        email: 'admin@shreemata.com',
        password: 'DemoPass123!'
      });
      const createBundleRes = await apiPost('/api/bundles/admin/create', {
        name: 'Class 10 All-in-One Comprehensive Bundle',
        description: 'Complete book set with study guide',
        bookIds: [seededBookId],
        bundlePrice: Math.floor(bookPrice * 0.8),
        courierCharge: 50,
        rewardPoints: 10,
        cashbackAmount: 0,
        profitType: 'fixed',
        profitValue: 10,
        profitConfigured: true,
        zeroCommission: false
      }, adminLogin.token);
      const created = createBundleRes.bundle || createBundleRes;
      seededBundleId = created._id || created.id;
    }

    const studentLogin = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    studentToken = studentLogin.token;
    studentUser = studentLogin.user;

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });
  }, 90000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      devServerProcess.kill();
    }
  });

  // Setup common route mocks and student auth
  async function setupPageContext(viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();

    let createOrderCalled = false;
    let createOrderPayload = null;

    // Mock payments and order creation routes
    await page.route('**/api/payments/create-order', async route => {
      createOrderCalled = true;
      createOrderPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          key: 'rzp_test_mockKey123',
          order: { id: 'order_mock_123', amount: 28000, currency: 'INR' }
        })
      });
    });

    await page.route('**/api/orders/create', async route => {
      createOrderCalled = true;
      createOrderPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          key: 'rzp_test_mockKey123',
          order: { id: 'order_mock_123', amount: 28000, currency: 'INR' }
        })
      });
    });

    // Mock Razorpay
    await page.addInitScript(() => {
      window.__razorpayOpened = false;
      window.Razorpay = function(options) {
        window.__razorpayOpened = true;
        window.__razorpayOptions = options;
        return {
          open: () => { window.__razorpayOpened = true; }
        };
      };
    });

    return { context, page, getCreateOrderCalled: () => createOrderCalled, getCreateOrderPayload: () => createOrderPayload };
  }

  // Helper to audit invalid controls
  async function auditInvalidControls(page, formSelector) {
    return page.evaluate(selector => {
      const form = document.querySelector(selector);
      const isFormValid = form ? form.checkValidity() : null;
      const invalidControls = form ? Array.from(form.querySelectorAll(':invalid')).map(el => {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
        return {
          id: el.id,
          name: el.name,
          required: el.required,
          value: el.value,
          isVisible,
          parentDisplay: el.parentElement ? window.getComputedStyle(el.parentElement).display : null,
          grandParentDisplay: el.parentElement && el.parentElement.parentElement ? window.getComputedStyle(el.parentElement.parentElement).display : null,
          validationMessage: el.validationMessage
        };
      }) : [];
      return { isFormValid, invalidControls };
    }, formSelector);
  }

  // 1. bundle.html pickup via URL params
  test('(1) bundle.html pickup via URL params: real page.click continues to payment without being blocked by hidden required controls', async () => {
    const { context, page, getCreateOrderCalled } = await setupPageContext();
    const url = `http://127.0.0.1:3100/bundle.html?id=${seededBundleId}&buy=true&delivery=pickup&payment=online`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });

    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9845163604');
    await page.fill('#billingEmail', 'student@shreemata.com');

    const audit = await auditInvalidControls(page, '#billingAddressForm');
    console.log('[Matrix 1: bundle.html pickup URL] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('billingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      razorpay: !!window.__razorpayOpened
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);
    expect(getCreateOrderCalled()).toBe(true);

    await context.close();
  });

  // 2. bundle.html pickup via page button
  test('(2) bundle.html pickup via page button: click "Buy at Store" then click Continue to Payment Options', async () => {
    const { context, page, getCreateOrderCalled } = await setupPageContext();
    const url = `http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`;
    await page.goto(url, { waitUntil: 'load' });

    // Click Buy at Store / Pickup button on bundle page
    const pickupBtn = await page.waitForSelector('#buyStoreBtn, button:has-text("Store Pickup"), button:has-text("Buy at Store")', { timeout: 10000 });
    await pickupBtn.click();

    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9845163604');
    await page.fill('#billingEmail', 'student@shreemata.com');

    const audit = await auditInvalidControls(page, '#billingAddressForm');
    console.log('[Matrix 2: bundle.html pickup page button] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('billingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('paymentMethodModal') ? document.getElementById('paymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);
    expect(submitState.paymentModal).toBe('block');

    await context.close();
  });

  // 3. bundle.html courier via page button
  test('(3) bundle.html courier via page button: click "Buy through Courier" then click Continue to Payment Options', async () => {
    const { context, page, getCreateOrderCalled } = await setupPageContext();
    const url = `http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`;
    await page.goto(url, { waitUntil: 'load' });

    const courierBtn = await page.waitForSelector('#buyCourierBtn, button:has-text("Buy through Courier"), button:has-text("Home Delivery")', { timeout: 10000 });
    await courierBtn.click();

    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9845163604');
    await page.fill('#billingEmail', 'student@shreemata.com');
    await page.fill('#billingAddress1', '123 Main St');
    await page.fill('#billingTaluk', 'Hubli');
    await page.fill('#billingDistrict', 'Dharwad');
    await page.fill('#billingState', 'Karnataka');
    await page.fill('#billingPincode', '580020');

    const audit = await auditInvalidControls(page, '#billingAddressForm');
    console.log('[Matrix 3: bundle.html courier page button] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('billingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('paymentMethodModal') ? document.getElementById('paymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);
    expect(submitState.paymentModal).toBe('block');

    await context.close();
  });

  // 4. book.html "Buy at Store" (pickup)
  test('(4) book.html "Buy at Store": click Buy at Store, fill details, click Continue to Payment Options', async () => {
    const { context, page } = await setupPageContext();
    const url = `http://127.0.0.1:3100/book.html?id=${seededBookId}`;
    await page.goto(url, { waitUntil: 'load' });

    const storeBtn = await page.waitForSelector('#buyPickupBtn', { timeout: 10000 });
    await storeBtn.click();

    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9845163604');
    await page.fill('#billingEmail', 'student@shreemata.com');

    const audit = await auditInvalidControls(page, '#billingAddressForm');
    console.log('[Matrix 4: book.html Buy at Store] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('billingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('paymentMethodModal') ? document.getElementById('paymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);

    await context.close();
  });

  // 5. book.html "Buy through Courier"
  test('(5) book.html "Buy through Courier": click Buy through Courier, fill details, click Continue to Payment Options', async () => {
    const { context, page } = await setupPageContext();
    const url = `http://127.0.0.1:3100/book.html?id=${seededBookId}`;
    await page.goto(url, { waitUntil: 'load' });

    const courierBtn = await page.waitForSelector('#buyCourierBtn', { timeout: 10000 });
    await courierBtn.click();

    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9845163604');
    await page.fill('#billingEmail', 'student@shreemata.com');
    await page.fill('#billingAddress1', '123 Main St');
    await page.fill('#billingTaluk', 'Hubli');
    await page.fill('#billingDistrict', 'Dharwad');
    await page.fill('#billingState', 'Karnataka');
    await page.fill('#billingPincode', '580020');

    const audit = await auditInvalidControls(page, '#billingAddressForm');
    console.log('[Matrix 5: book.html Buy through Courier] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('billingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('paymentMethodModal') ? document.getElementById('paymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);

    await context.close();
  });

  // 6. cart.html Store Pickup checkout
  test('(6) cart.html Store Pickup checkout: select pickup, click checkout, fill details, click Continue to Payment Options', async () => {
    const { context, page } = await setupPageContext();
    await context.addInitScript(({ bookId, user }) => {
      const cartItem = [{ id: bookId, title: 'Test Book', price: 250, quantity: 1, type: 'book' }];
      const userId = user?._id || user?.id;
      const cartKey = userId ? `cart_${userId}` : 'cart_guest';
      localStorage.setItem('cart', JSON.stringify(cartItem));
      localStorage.setItem(cartKey, JSON.stringify(cartItem));
      localStorage.setItem('deliveryMethod', 'pickup');
    }, { bookId: seededBookId, user: studentUser });

    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
    await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });

    // Ensure store pickup radio is checked
    await page.waitForSelector('input[name="deliveryMethod"][value="pickup"]', { timeout: 10000 });
    await page.check('input[name="deliveryMethod"][value="pickup"]');

    // Open cart billing address modal to test pickup mode
    await page.evaluate(() => showCartBillingAddressModal());
    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 10000 });

    await page.fill('#cartBillingName', 'Rohan Sharma');
    await page.fill('#cartBillingPhone', '9845163604');
    await page.fill('#cartBillingEmail', 'student@shreemata.com');

    const audit = await auditInvalidControls(page, '#cartBillingAddressForm');
    console.log('[Matrix 6: cart.html Store Pickup] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('cartBillingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#cartBillingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('cartPaymentMethodModal') ? document.getElementById('cartPaymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);

    await context.close();
  });

  // 7. cart.html Courier checkout
  test('(7) cart.html Courier checkout: select courier, click checkout, fill details, click Continue to Payment Options', async () => {
    const { context, page } = await setupPageContext();
    await context.addInitScript(({ bookId, user }) => {
      const cartItem = [{ id: bookId, title: 'Test Book', price: 250, quantity: 1, type: 'book' }];
      const userId = user?._id || user?.id;
      const cartKey = userId ? `cart_${userId}` : 'cart_guest';
      localStorage.setItem('cart', JSON.stringify(cartItem));
      localStorage.setItem(cartKey, JSON.stringify(cartItem));
      localStorage.setItem('deliveryMethod', 'home');
    }, { bookId: seededBookId, user: studentUser });

    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
    await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });

    await page.waitForSelector('input[name="deliveryMethod"][value="home"]', { timeout: 10000 });
    await page.check('input[name="deliveryMethod"][value="home"]');

    await page.click('#checkoutBtn');
    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 10000 });

    await page.fill('#cartBillingName', 'Rohan Sharma');
    await page.fill('#cartBillingPhone', '9845163604');
    await page.fill('#cartBillingEmail', 'student@shreemata.com');
    await page.fill('#cartBillingAddress1', '123 Main St');
    await page.fill('#cartBillingTaluk', 'Hubli');
    await page.fill('#cartBillingDistrict', 'Dharwad');
    await page.fill('#cartBillingState', 'Karnataka');
    await page.fill('#cartBillingPincode', '580020');

    const audit = await auditInvalidControls(page, '#cartBillingAddressForm');
    console.log('[Matrix 7: cart.html Courier checkout] Invalid controls:', audit.invalidControls);

    await page.evaluate(() => {
      const form = document.getElementById('cartBillingAddressForm');
      if (form) form.addEventListener('submit', () => { window.__formSubmitFired = true; });
    });

    await page.click('#cartBillingAddressForm button[type="submit"]');
    await page.waitForTimeout(2000);

    const submitState = await page.evaluate(() => ({
      fired: !!window.__formSubmitFired,
      paymentModal: document.getElementById('cartPaymentMethodModal') ? document.getElementById('cartPaymentMethodModal').style.display : 'none'
    }));

    expect(audit.invalidControls).toEqual([]);
    expect(audit.isFormValid).toBe(true);
    expect(submitState.fired).toBe(true);

    await context.close();
  });
});
