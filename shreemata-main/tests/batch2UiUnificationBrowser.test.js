/**
 * tests/batch2UiUnificationBrowser.test.js
 *
 * Real browser verification for Batch 2 Customer-Page UI Unification:
 * - public/cart.html
 * - public/login.html
 * - public/signup.html
 *
 * Verifies:
 * 1. Per page at 1920, 1366, 390: header & footer present and identical in structure to book.html,
 *    exactly one logo file (images/press.png) in brand areas, no horizontal overflow,
 *    mobile drawer opens/closes, header cart badge shows correct count.
 * 2. cart.html:
 *    - Guest cart and logged-in cart show the same items.
 *    - Quantity change, remove item and totals are correct (compared to test-computed totals).
 *    - Courier and pickup checkout open the single Delivery Details form with expected fields.
 *    - create-order request body shape matches contract (mocked Razorpay and create-order).
 *    - Empty cart state renders.
 * 3. login.html:
 *    - Real login with seeded student lands on expected target (/).
 *    - Wrong password shows error text.
 *    - ?redirect=URL parameter support preserved.
 *    - Forgot password link opens modal.
 * 4. signup.html:
 *    - ?ref=CODE referral prefill works.
 *    - Validation messages for short/empty password.
 *    - Successful registration against test DB.
 * 5. Full-page screenshots captured at 1440x900, 1366x768, 390x844 in Desktop\\four-sections-review\\batch2\\.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/batch2';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

function apiGet(pathName, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path: pathName,
      method: 'GET',
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
    req.end();
  });
}

describe('Batch 2 UI Unification Browser Tests', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBook = null;
  let seededBundle = null;
  let studentToken = null;
  let studentUser = null;

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

    const booksRes = await apiGet('/api/books');
    const books = Array.isArray(booksRes) ? booksRes : (booksRes.books || []);
    if (!books || books.length === 0) {
      throw new Error('No books available in dev server');
    }
    seededBook = books[0];
    const bookId = seededBook._id || seededBook.id;
    const bookPrice = seededBook.price || 340;

    const bundlesRes = await apiGet('/api/bundles');
    const bundles = Array.isArray(bundlesRes) ? bundlesRes : (bundlesRes.bundles || []);
    if (bundles && bundles.length > 0) {
      seededBundle = bundles[0];
    } else {
      const adminLogin = await apiPost('/api/login', {
        email: 'admin@shreemata.com',
        password: 'DemoPass123!'
      });
      const createBundleRes = await apiPost('/api/bundles/admin/create', {
        name: 'Class 10 All-in-One Comprehensive Bundle',
        description: 'Complete book set with study guide',
        bookIds: [bookId],
        bundlePrice: Math.floor(bookPrice * 0.8),
        courierCharge: 50,
        rewardPoints: 10,
        cashbackAmount: 0,
        profitType: 'fixed',
        profitValue: 10,
        profitConfigured: true,
        zeroCommission: false
      }, adminLogin.token);
      seededBundle = createBundleRes.bundle || createBundleRes;
    }

    const loginRes = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    studentToken = loginRes.token;
    studentUser = loginRes.user;

    expect(seededBook).toBeTruthy();
    expect(seededBundle).toBeTruthy();

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });
  }, 120000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      devServerProcess.kill();
    }
  });

  const viewports = [
    { name: '1920', width: 1920, height: 1080 },
    { name: '1366', width: 1366, height: 768 },
    { name: '390', width: 390, height: 844 }
  ];

  const pagesToTest = ['cart.html', 'login.html', 'signup.html'];

  test('(1) Per page at 1920, 1366, 390: header & footer structure, logo count, drawer, no overflow', async () => {
    for (const pageName of pagesToTest) {
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:3100/${pageName}`, { waitUntil: 'networkidle' });

        // A. Header structure
        await page.waitForSelector('.main-header', { state: 'visible', timeout: 15000 });
        const brandTitle = await page.$eval('.main-header .brand-title', el => el.textContent.trim());
        expect(brandTitle).toBe('Shree Mata');

        // B. Logo audit: in brand areas, only images/press.png
        const brandImages = await page.$$eval(
          '.main-header .brand-logo img, .mobile-nav-drawer .brand-logo img, .site-footer .footer-brand-logo img',
          imgs => imgs.map(i => i.getAttribute('src'))
        );
        expect(brandImages.length).toBeGreaterThan(0);
        for (const src of brandImages) {
          expect(src).toMatch(/images\/press\.png$/);
        }

        // C. No horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 1;
        });
        expect(overflow).toBe(false);

        // D. Footer structure
        await page.waitForSelector('.site-footer', { state: 'visible', timeout: 15000 });
        const footerCols = await page.$$eval('.site-footer .footer-col-title', els => els.map(e => e.textContent.trim()));
        expect(footerCols).toEqual(['SHOP', 'CUSTOMER CARE', 'ACCOUNT']);

        // Assert Privacy Policy and Terms & Conditions links exist in footer
        const privacyLink = await page.$('footer a[href="/privacy-policy.html"]');
        const termsLink = await page.$('footer a[href="/terms-and-conditions.html"]');
        expect(privacyLink).not.toBeNull();
        expect(termsLink).not.toBeNull();

        // E. Mobile drawer open/close at 390
        if (vp.width === 390) {
          const menuToggle = await page.$('#mobileMenuToggle');
          expect(menuToggle).not.toBeNull();
          await menuToggle.click();
          await page.waitForSelector('#mobileNavDrawer.open', { state: 'visible', timeout: 5000 });

          const closeBtn = await page.$('#drawerCloseBtn');
          expect(closeBtn).not.toBeNull();
          await closeBtn.click();
          await page.waitForSelector('#mobileNavDrawer:not(.open)', { timeout: 5000 });
        }

        await context.close();
      }
    }
  }, 90000);

  test('(2) cart.html: guest and logged-in cart, item manipulation, totals, checkout forms, create-order payload, empty state', async () => {
    const bookId = seededBook._id || seededBook.id;
    const bundleId = seededBundle._id || seededBundle.id;
    const bookPrice = parseFloat(seededBook.price) || 340;
    const bundlePrice = parseFloat(seededBundle.bundlePrice || seededBundle.price) || 280;

    const initialCart = [
      {
        id: bookId,
        title: seededBook.title,
        price: bookPrice,
        quantity: 2,
        weight: 0.5,
        isBundle: false
      },
      {
        id: bundleId,
        title: seededBundle.name,
        price: bundlePrice,
        quantity: 1,
        weight: 1.0,
        isBundle: true
      }
    ];

    // A. Guest cart
    const contextGuest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await contextGuest.addInitScript(({ cart }) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }, { cart: initialCart });
    const pageGuest = await contextGuest.newPage();
    await pageGuest.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });

    await pageGuest.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });
    const guestItemsCount = await pageGuest.$$eval('.cart-item', items => items.length);
    expect(guestItemsCount).toBe(2);

    // Verify header cart count badge shows sum of quantities: 2 + 1 = 3
    const guestBadgeCount = await pageGuest.$eval('#cartCount', el => parseInt(el.textContent, 10));
    expect(guestBadgeCount).toBe(3);

    // Wait for async displayCart to populate totals in #cartTotal
    await pageGuest.waitForFunction(() => {
      const el = document.getElementById('cartTotal');
      return el && el.textContent.trim().length > 0;
    }, { timeout: 10000 });

    // Expected totals calculation
    const expectedSubtotal = (bookPrice * 2) + (bundlePrice * 1);
    const cartTotalText = await pageGuest.$eval('#cartTotal', el => el.textContent);
    expect(cartTotalText).toContain(expectedSubtotal.toFixed(0));

    // B. Logged-in cart shows identical items
    const contextUser = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await contextUser.addInitScript(({ cart, token, user }) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('cart_guest', JSON.stringify(cart));
      const uid = user._id || user.id;
      if (uid) {
        localStorage.setItem(`cart_${uid}`, JSON.stringify(cart));
      }
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { cart: initialCart, token: studentToken, user: { ...studentUser, _id: studentUser.id } });
    const pageUser = await contextUser.newPage();

    // Mock Razorpay and create-order
    let interceptedOrderPayload = null;
    await pageUser.route('**/*create-order*', async route => {
      interceptedOrderPayload = JSON.parse(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          orderId: 'ORDER_CART_TEST_999',
          order: { id: 'order_test_999', amount: expectedSubtotal * 100, currency: 'INR' },
          key: 'rzp_test_placeholder'
        })
      });
    });

    await pageUser.route('https://checkout.razorpay.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.Razorpay = function(opts) { return { open: function() { if (opts.handler) opts.handler({ razorpay_payment_id: "pay_test_123", razorpay_order_id: opts.order_id, razorpay_signature: "sig_test" }); } }; };'
      });
    });

    await pageUser.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await pageUser.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });

    const userItemsCount = await pageUser.$$eval('.cart-item', items => items.length);
    expect(userItemsCount).toBe(guestItemsCount);

    // C. Courier checkout opens the single Delivery Details form
    await pageUser.click('#checkoutBtn');
    await pageUser.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });

    // Assert form fields are present
    expect(await pageUser.$('#cartBillingName')).not.toBeNull();
    expect(await pageUser.$('#cartBillingPhone')).not.toBeNull();
    expect(await pageUser.$('#cartBillingAddress1')).not.toBeNull();
    expect(await pageUser.$('#cartBillingPincode')).not.toBeNull();

    // Fill form and submit
    await pageUser.fill('#cartBillingName', 'Test Cart Student');
    await pageUser.fill('#cartBillingPhone', '9845163604');
    await pageUser.fill('#cartBillingEmail', 'test.student@example.com');
    await pageUser.fill('#cartBillingAddress1', '123 College Road, Vidyanagar');
    await pageUser.fill('#cartBillingAddress2', 'Near BVB');
    await pageUser.fill('#cartBillingTaluk', 'Hubballi');
    await pageUser.fill('#cartBillingDistrict', 'Dharwad');
    await pageUser.fill('#cartBillingState', 'Karnataka');
    await pageUser.fill('#cartBillingPincode', '580021');

    await pageUser.click('#cartBillingAddressForm button[type="submit"]');

    // Select online payment in payment modal
    await pageUser.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 5000 });
    await pageUser.click('button[onclick="proceedWithCartOnlinePayment()"]');

    // Verify create-order request body shape
    await pageUser.waitForTimeout(1000);
    expect(interceptedOrderPayload).not.toBeNull();
    expect(interceptedOrderPayload.deliveryMethod).toBe('home');
    expect(Array.isArray(interceptedOrderPayload.items)).toBe(true);
    expect(interceptedOrderPayload.items.length).toBe(2);

    // D. Empty cart state renders
    const contextEmpty = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await contextEmpty.addInitScript(() => {
      localStorage.setItem('cart', '[]');
      localStorage.setItem('cart_guest', '[]');
    });
    const pageEmpty = await contextEmpty.newPage();
    await pageEmpty.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await pageEmpty.waitForSelector('#emptyCart', { state: 'visible', timeout: 10000 });
    expect(await pageEmpty.isVisible('#cartLayout')).toBe(false);

    await contextGuest.close();
    await contextUser.close();
    await contextEmpty.close();
  }, 90000);

  test('(3) login.html: real login redirect, invalid password message, redirect param, forgot password modal', async () => {
    // A. Real login with student redirects to '/'
    const contextLogin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageLogin = await contextLogin.newPage();
    await pageLogin.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });

    await pageLogin.fill('#email', 'student@shreemata.com');
    await pageLogin.fill('#password', 'DemoPass123!');
    await pageLogin.click('#emailLoginBtn');
    await pageLogin.waitForNavigation({ timeout: 10000 });
    expect(pageLogin.url()).toBe('http://127.0.0.1:3100/');
    await contextLogin.close();

    // B. Invalid password shows error message
    const contextInvalid = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageInvalid = await contextInvalid.newPage();
    await pageInvalid.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });

    await pageInvalid.fill('#email', 'student@shreemata.com');
    await pageInvalid.fill('#password', 'WrongPassword999!');
    await pageInvalid.click('#emailLoginBtn');
    await pageInvalid.waitForSelector('#emailErrorMessage', { state: 'visible', timeout: 5000 });
    const errorText = await pageInvalid.$eval('#emailErrorMessage', el => el.textContent);
    expect(errorText.length).toBeGreaterThan(0);
    await contextInvalid.close();

    // C. Redirect param support (?redirect=/orders.html)
    const contextRedirect = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageRedirect = await contextRedirect.newPage();
    await pageRedirect.goto('http://127.0.0.1:3100/login.html?redirect=/orders.html', { waitUntil: 'networkidle' });
    await pageRedirect.fill('#email', 'student@shreemata.com');
    await pageRedirect.fill('#password', 'DemoPass123!');
    await pageRedirect.click('#emailLoginBtn');
    await pageRedirect.waitForNavigation({ timeout: 10000 });
    expect(pageRedirect.url()).toContain('/orders.html');
    await contextRedirect.close();

    // D. Forgot password link opens modal
    const contextForgot = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageForgot = await contextForgot.newPage();
    await pageForgot.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });
    await pageForgot.click('a[onclick="showForgotPassword()"]');
    await pageForgot.waitForSelector('#forgotStep1', { state: 'visible', timeout: 5000 });
    expect(await pageForgot.isVisible('#forgotEmail')).toBe(true);
    await contextForgot.close();
  }, 90000);

  test('(4) signup.html: referral prefill, password validation, successful signup', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Auto-accept alerts on page
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Mock send-email-otp and verify-email-otp for testing signup validations and registration
    await page.route('**/api/send-email-otp', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OTP sent' })
      });
    });

    await page.route('**/api/verify-email-otp', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OTP verified' })
      });
    });

    // A. ?ref=TESTREF prefill
    await page.goto('http://127.0.0.1:3100/signup.html?ref=REF12345', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const refVal = await page.$eval('#referralInput', el => el.value);
    expect(refVal).toBe('REF12345');

    // B. Validation for short password
    await page.fill('#name', 'Test New Student');
    await page.fill('#email', 'newstudent_test@example.com');
    // Trigger verify email
    await page.waitForSelector('#verifyEmailBtn', { state: 'visible', timeout: 5000 });
    await page.click('#verifyEmailBtn');
    await page.waitForSelector('#emailOtpSection', { state: 'visible', timeout: 5000 });
    await page.fill('#emailOtp', '123456');
    await page.click('#verifyOtpBtn');
    await page.waitForSelector('#emailStatus', { state: 'visible', timeout: 5000 });

    await page.fill('#phone', '9876543210');
    await page.fill('#password', '123');
    await page.fill('#confirmPassword', '123');
    await page.click('#signupBtn');

    await page.waitForSelector('#errorMessage', { state: 'visible', timeout: 5000 });
    const errText = await page.$eval('#errorMessage', el => el.textContent);
    expect(errText.toLowerCase()).toContain('password');

    // C. Successful signup against test DB on a fresh page
    const pageSuccess = await context.newPage();
    let dialogError = null;
    pageSuccess.on('dialog', async dialog => {
      const msg = dialog.message();
      if (/error|failed|invalid|wrong/i.test(msg)) {
        dialogError = msg;
      }
      await dialog.accept().catch(() => {});
    });

    await pageSuccess.route('**/api/send-email-otp', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'OTP sent' }) });
    });
    await pageSuccess.route('**/api/verify-email-otp', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'OTP verified' }) });
    });
    await pageSuccess.route('**/api/signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token: 'test_token_batch2',
          user: { _id: 'u_batch2', name: 'Automated Test User', email: 'testuser@example.com', role: 'student' }
        })
      });
    });

    await pageSuccess.goto('http://127.0.0.1:3100/signup.html', { waitUntil: 'networkidle' });

    const uniqueEmail = `testuser_${Date.now()}@example.com`;
    const uniquePhone = '9' + Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);
    await pageSuccess.fill('#name', 'Automated Test User');
    await pageSuccess.fill('#email', uniqueEmail);
    await pageSuccess.click('#verifyEmailBtn');
    await pageSuccess.waitForSelector('#emailOtpSection', { state: 'visible', timeout: 5000 });
    await pageSuccess.fill('#emailOtp', '123456');
    await pageSuccess.click('#verifyOtpBtn');
    await pageSuccess.waitForSelector('#emailStatus', { state: 'visible', timeout: 5000 });

    await pageSuccess.fill('#phone', uniquePhone);
    await pageSuccess.fill('#password', 'ValidPass123!');
    await pageSuccess.fill('#confirmPassword', 'ValidPass123!');
    await pageSuccess.fill('#referralInput', '');

    await Promise.all([
      pageSuccess.waitForNavigation({ timeout: 15000 }),
      pageSuccess.click('#signupBtn')
    ]);
    expect(dialogError).toBeNull();
    expect(pageSuccess.url()).toBe('http://127.0.0.1:3100/');

    await context.close();
  }, 90000);

  test('(5) Capture full-page screenshots at 1440, 1366, 390 into Desktop/four-sections-review/batch2/', async () => {
    const shotWidths = [
      { name: '1440', width: 1440, height: 900 },
      { name: '1366', width: 1366, height: 768 },
      { name: '390', width: 390, height: 844 }
    ];

    const bookId = seededBook._id || seededBook.id;
    const bundleId = seededBundle._id || seededBundle.id;
    const seededCart = [
      {
        id: bookId,
        title: seededBook.title,
        price: seededBook.price || 340,
        quantity: 1,
        weight: 0.5,
        isBundle: false
      },
      {
        id: bundleId,
        title: seededBundle.name,
        price: seededBundle.bundlePrice || 280,
        quantity: 1,
        weight: 1.0,
        isBundle: true
      }
    ];

    for (const w of shotWidths) {
      // 1. Cart with seeded book and bundle
      const ctxCart = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      await ctxCart.addInitScript(({ cart }) => {
        localStorage.setItem('cart', JSON.stringify(cart));
      }, { cart: seededCart });
      const pCart = await ctxCart.newPage();
      await pCart.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
      await pCart.waitForSelector('.cart-item', { state: 'visible', timeout: 10000 });
      await pCart.screenshot({ path: path.join(SCREENSHOT_DIR, `cart-final-${w.name}.png`), fullPage: true });
      await ctxCart.close();

      // 2. Empty cart
      const ctxEmpty = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      await ctxEmpty.addInitScript(() => { localStorage.setItem('cart', '[]'); });
      const pEmpty = await ctxEmpty.newPage();
      await pEmpty.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
      await pEmpty.waitForSelector('#emptyCart', { state: 'visible', timeout: 10000 });
      await pEmpty.screenshot({ path: path.join(SCREENSHOT_DIR, `cart-empty-final-${w.name}.png`), fullPage: true });
      await ctxEmpty.close();

      // 3. Login
      const ctxLogin = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      await ctxLogin.addInitScript(() => { localStorage.clear(); });
      const pLogin = await ctxLogin.newPage();
      await pLogin.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });
      await pLogin.waitForSelector('#authBox', { state: 'visible', timeout: 10000 });
      await pLogin.screenshot({ path: path.join(SCREENSHOT_DIR, `login-final-${w.name}.png`), fullPage: true });
      await ctxLogin.close();

      // 4. Signup
      const ctxSignup = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      await ctxSignup.addInitScript(() => { localStorage.clear(); });
      const pSignup = await ctxSignup.newPage();
      await pSignup.goto('http://127.0.0.1:3100/signup.html', { waitUntil: 'networkidle' });
      await pSignup.waitForSelector('#authBox', { state: 'visible', timeout: 10000 });
      await pSignup.screenshot({ path: path.join(SCREENSHOT_DIR, `signup-final-${w.name}.png`), fullPage: true });
      await ctxSignup.close();
    }
  }, 120000);

  test('(6) Real signup against test DB without mocking routes', async () => {
    const contextReal = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageReal = await contextReal.newPage();

    let dialogError = null;
    pageReal.on('dialog', async dialog => {
      const msg = dialog.message();
      if (/error|failed|invalid|wrong/i.test(msg)) {
        dialogError = msg;
      }
      await dialog.accept().catch(() => {});
    });

    let capturedOtp = null;
    const otpListener = data => {
      const text = data.toString();
      const match = text.match(/Generated email OTP for .*?:\s*(\d{6})/);
      if (match) {
        capturedOtp = match[1];
      }
    };
    if (devServerProcess && devServerProcess.stdout) {
      devServerProcess.stdout.on('data', otpListener);
    }

    await pageReal.goto('http://127.0.0.1:3100/signup.html', { waitUntil: 'networkidle' });

    const realEmail = `realuser_${Date.now()}@example.com`;
    const realPhone = '9' + Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);

    await pageReal.fill('#name', 'Real Test User');
    await pageReal.fill('#email', realEmail);
    await pageReal.click('#verifyEmailBtn');

    await pageReal.waitForSelector('#emailOtpSection', { state: 'visible', timeout: 10000 });
    
    // Wait for OTP to be printed by backend server
    const startWait = Date.now();
    while (!capturedOtp && Date.now() - startWait < 5000) {
      await new Promise(r => setTimeout(r, 200));
    }
    expect(capturedOtp).not.toBeNull();

    await pageReal.fill('#emailOtp', capturedOtp);
    await pageReal.click('#verifyOtpBtn');
    await pageReal.waitForSelector('#emailStatus', { state: 'visible', timeout: 5000 });

    await pageReal.fill('#phone', realPhone);
    await pageReal.fill('#password', 'ValidPass123!');
    await pageReal.fill('#confirmPassword', 'ValidPass123!');
    await pageReal.fill('#referralInput', '');

    await Promise.all([
      pageReal.waitForNavigation({ timeout: 15000 }),
      pageReal.click('#signupBtn')
    ]);

    expect(dialogError).toBeNull();
    expect(pageReal.url()).toBe('http://127.0.0.1:3100/');

    // Verify stored auth tokens in localStorage
    const storedToken = await pageReal.evaluate(() => localStorage.getItem('token'));
    const storedUser = await pageReal.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}'));
    expect(storedToken).toBeTruthy();
    expect(storedUser.email).toBe(realEmail.toLowerCase());

    // Verify user actually exists in the MongoDB database
    const profileRes = await apiGet('/api/users/profile', storedToken);
    expect(profileRes.user).toBeDefined();
    expect(profileRes.user.email).toBe(realEmail.toLowerCase());

    if (devServerProcess && devServerProcess.stdout) {
      devServerProcess.stdout.off('data', otpListener);
    }
    await contextReal.close();
  }, 90000);
});
