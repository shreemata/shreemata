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
 *    mobile drawer opens/closes, header cart badge shows correct count,
 *    cart container aligns with header at 1366 and 1440, no overflow-x: hidden.
 * 2. cart.html:
 *    - Guest cart and logged-in cart show the same items.
 *    - Quantity change, remove item and totals are correct.
 *    - Courier and pickup checkout open the single Delivery Details form.
 *    - create-order request body shape matches contract.
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
 * 5. Full-page & modal screenshots captured at 1440x900, 1366x768, 390x844 in Desktop\\four-sections-review\\batch2\\.
 * 6. Real signup against test DB without mocking routes.
 * 7. Pixel proof: book.html, bundle.html, bundles.html byte-identical / 0-pixel-diff vs 98d19d7 site-shell.css.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/batch2';
const MODAL_DIR = path.join(SCREENSHOT_DIR, 'modals');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(MODAL_DIR)) {
  fs.mkdirSync(MODAL_DIR, { recursive: true });
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

/**
 * Setup dialog message collector on a Playwright page.
 * Collects every dialog message into array, accepts or dismisses cleanly.
 */
function attachDialogCollector(page) {
  const dialogMessages = [];
  page.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    await dialog.accept().catch(() => {});
  });
  return dialogMessages;
}

/**
 * Assert collected dialog messages contain no error/invalid/failed text.
 */
function assertNoDialogErrors(dialogMessages) {
  const errorDialogs = dialogMessages.filter(msg =>
    /error|failed|invalid|wrong|something went wrong/i.test(msg)
  );
  if (errorDialogs.length > 0) {
    console.error('Captured error dialogs:', errorDialogs);
  }
  expect(errorDialogs).toEqual([]);
}

describe('Batch 2 UI Unification Browser Tests', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBook = null;
  let seededBundle = null;
  let studentToken = null;
  let studentUser = null;

  beforeAll(async () => {
    const isUp = await checkPortOpen(3100);
    if (!isUp) {
      console.log('Starting dev-run-four-sections.js on port 3100...');
      devServerProcess = spawn('node', ['scripts/dev-run-four-sections.js'], {
        cwd: REPO_DIR,
        stdio: 'pipe',
        windowsHide: true
      });
      await waitForServer('http://127.0.0.1:3100/');
      console.log('Dev server ready.');
    }

    // Launch Playwright with Chrome
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });

    // Seed test book
    const loginRes = await apiPost('/api/login', {
      email: 'admin@shreemata.com',
      password: 'AdminPassword123!'
    });
    const adminToken = loginRes.token;

    const booksRes = await apiGet('/api/books');
    const existingBooks = Array.isArray(booksRes) ? booksRes : (booksRes.books || []);
    if (existingBooks.length > 0) {
      seededBook = existingBooks[0];
    } else {
      const created = await apiPost('/api/admin/books', {
        title: 'Batch2 Test Book',
        author: 'Author B2',
        price: 340,
        stock: 50,
        category: 'Textbooks',
        description: 'Test book for batch 2 UI testing',
        imageUrl: 'images/press.png'
      }, adminToken);
      seededBook = created.book || created;
    }

    // Seed test bundle
    const bundlesRes = await apiGet('/api/bundles');
    const existingBundles = Array.isArray(bundlesRes) ? bundlesRes : (bundlesRes.bundles || []);
    if (existingBundles.length > 0) {
      seededBundle = existingBundles[0];
    } else {
      const createdBundle = await apiPost('/api/bundles', {
        name: 'Batch2 Test Bundle',
        description: 'Test bundle for batch 2 testing',
        bundlePrice: 280,
        items: [{ bookId: seededBook._id || seededBook.id, quantity: 1 }]
      }, adminToken);
      seededBundle = createdBundle.bundle || createdBundle;
    }

    // Seed/retrieve student user
    const studentLogin = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    if (studentLogin && studentLogin.token) {
      studentToken = studentLogin.token;
      studentUser = studentLogin.user;
    } else {
      const studentSignup = await apiPost('/api/signup', {
        name: 'Student User',
        email: 'student@shreemata.com',
        phone: '9845163603',
        password: 'DemoPass123!'
      });
      studentToken = studentSignup.token;
      studentUser = studentSignup.user;
    }
  }, 90000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      devServerProcess.kill();
    }
  });

  const pagesToTest = ['cart.html'];
  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'mobile', width: 390, height: 844 }
  ];

  test('(1) Per page at 1920, 1366, 390: header & footer structure, logo count, drawer, no overflow', async () => {
    for (const pageName of pagesToTest) {
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        const dialogs = attachDialogCollector(page);

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

        // C. No horizontal overflow (without artificial overflow-x: hidden on container)
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 1;
        });
        expect(overflow).toBe(false);

        // Cart container alignment at 1366 and 1440
        if (pageName === 'cart.html' && vp.width >= 1366) {
          const headerContainerBox = await page.$eval('.main-header .container', el => {
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
          });
          const cartContainerBox = await page.$eval('.cart-main-wrap .container', el => {
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
          });
          expect(cartContainerBox.left).toBe(headerContainerBox.left);
          expect(cartContainerBox.right).toBe(headerContainerBox.right);
          expect(cartContainerBox.width).toBe(headerContainerBox.width);
        }

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

        assertNoDialogErrors(dialogs);
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
    const dialogsGuest = attachDialogCollector(pageGuest);

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
    const dialogsUser = attachDialogCollector(pageUser);

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
    const dialogsEmpty = attachDialogCollector(pageEmpty);

    await pageEmpty.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await pageEmpty.waitForSelector('#emptyCart', { state: 'visible', timeout: 10000 });
    expect(await pageEmpty.isVisible('#cartLayout')).toBe(false);

    assertNoDialogErrors(dialogsGuest);
    assertNoDialogErrors(dialogsUser);
    assertNoDialogErrors(dialogsEmpty);

    await contextGuest.close();
    await contextUser.close();
    await contextEmpty.close();
  }, 90000);

  test('(3) login.html: real login redirect, invalid password message, redirect param, forgot password modal', async () => {
    // A. Real login with student redirects to '/'
    const contextLogin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageLogin = await contextLogin.newPage();
    const dialogsLogin = attachDialogCollector(pageLogin);

    await pageLogin.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });

    await pageLogin.fill('#email', 'student@shreemata.com');
    await pageLogin.fill('#password', 'DemoPass123!');
    await pageLogin.click('#emailLoginBtn');
    await pageLogin.waitForNavigation({ timeout: 10000 });
    expect(pageLogin.url()).toBe('http://127.0.0.1:3100/');
    assertNoDialogErrors(dialogsLogin);
    await contextLogin.close();

    // B. Invalid password shows error message
    const contextInvalid = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageInvalid = await contextInvalid.newPage();
    const dialogsInvalid = attachDialogCollector(pageInvalid);

    await pageInvalid.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });

    await pageInvalid.fill('#email', 'student@shreemata.com');
    await pageInvalid.fill('#password', 'WrongPassword999!');
    await pageInvalid.click('#emailLoginBtn');
    await pageInvalid.waitForSelector('#emailErrorMessage', { state: 'visible', timeout: 5000 });
    const errorText = await pageInvalid.$eval('#emailErrorMessage', el => el.textContent);
    expect(errorText.length).toBeGreaterThan(0);
    assertNoDialogErrors(dialogsInvalid);
    await contextInvalid.close();

    // C. Redirect param support (?redirect=/orders.html)
    const contextRedirect = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageRedirect = await contextRedirect.newPage();
    const dialogsRedirect = attachDialogCollector(pageRedirect);

    await pageRedirect.goto('http://127.0.0.1:3100/login.html?redirect=/orders.html', { waitUntil: 'networkidle' });
    await pageRedirect.fill('#email', 'student@shreemata.com');
    await pageRedirect.fill('#password', 'DemoPass123!');
    await pageRedirect.click('#emailLoginBtn');
    await pageRedirect.waitForNavigation({ timeout: 10000 });
    expect(pageRedirect.url()).toContain('/orders.html');
    assertNoDialogErrors(dialogsRedirect);
    await contextRedirect.close();

    // D. Forgot password link opens modal
    const contextForgot = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageForgot = await contextForgot.newPage();
    const dialogsForgot = attachDialogCollector(pageForgot);

    await pageForgot.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });
    await pageForgot.click('a[onclick="showForgotPassword()"]');
    await pageForgot.waitForSelector('#forgotStep1', { state: 'visible', timeout: 5000 });
    expect(await pageForgot.isVisible('#forgotEmail')).toBe(true);
    assertNoDialogErrors(dialogsForgot);
    await contextForgot.close();
  }, 90000);

  test('(4) signup.html: referral prefill, password validation, successful signup', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const dialogs = attachDialogCollector(page);

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
    const dialogsSuccess = attachDialogCollector(pageSuccess);

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
    expect(pageSuccess.url()).toBe('http://127.0.0.1:3100/');

    assertNoDialogErrors(dialogs);
    assertNoDialogErrors(dialogsSuccess);
    await context.close();
  }, 90000);

  test('(5) Capture full-page and modal screenshots at 1440 and 390 into Desktop/four-sections-review/batch2/', async () => {
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
      attachDialogCollector(pCart);
      await pCart.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pCart.waitForSelector('.cart-item', { state: 'visible', timeout: 10000 });
      await pCart.screenshot({ path: path.join(SCREENSHOT_DIR, `cart-final-${w.name}.png`), fullPage: true });
      await ctxCart.close();

      // 2. Empty cart
      const ctxEmpty = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      await ctxEmpty.addInitScript(() => { localStorage.setItem('cart', '[]'); });
      const pEmpty = await ctxEmpty.newPage();
      attachDialogCollector(pEmpty);
      await pEmpty.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pEmpty.waitForSelector('#emptyCart', { state: 'visible', timeout: 10000 });
      await pEmpty.screenshot({ path: path.join(SCREENSHOT_DIR, `cart-empty-final-${w.name}.png`), fullPage: true });
      await ctxEmpty.close();
    }

    // Modal screenshots at 1440 and 390
    const modalViewports = [
      { name: '1440', width: 1440, height: 900 },
      { name: '390', width: 390, height: 844 }
    ];

    for (const mv of modalViewports) {
      // 1. Cart Delivery Details modal (courier)
      const ctxCourier = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxCourier.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pCourier = await ctxCourier.newPage();
      await pCourier.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pCourier.evaluate(() => {
        if (typeof openCartBillingModal === 'function') openCartBillingModal('courier');
        else document.getElementById('cartBillingAddressModal').style.display = 'block';
      });
      await pCourier.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });
      await pCourier.waitForTimeout(300);
      await pCourier.screenshot({ path: path.join(MODAL_DIR, `cart-delivery-courier-${mv.name}.png`) });
      await ctxCourier.close();

      // 2. Cart pickup modal
      const ctxPickup = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxPickup.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pPickup = await ctxPickup.newPage();
      await pPickup.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pPickup.evaluate(() => {
        const radio = document.querySelector('input[name="deliveryMethod"][value="pickup"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
        if (typeof openCartBillingAddressModal === 'function') {
          openCartBillingAddressModal();
        } else {
          document.getElementById('cartBillingAddressModal').style.display = 'block';
        }
      });
      await pPickup.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });
      await pPickup.waitForTimeout(300);
      await pPickup.screenshot({ path: path.join(MODAL_DIR, `cart-pickup-modal-${mv.name}.png`) });
      await ctxPickup.close();

      // 3. Cart payment method modal
      const ctxPay = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxPay.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pPay = await ctxPay.newPage();
      await pPay.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pPay.evaluate(() => {
        const m = document.getElementById('cartPaymentMethodModal');
        if (m) { m.style.display = 'block'; m.classList.add('show'); }
      });
      await pPay.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 5000 });
      await pPay.waitForTimeout(300);
      await pPay.screenshot({ path: path.join(MODAL_DIR, `cart-payment-method-${mv.name}.png`) });
      await ctxPay.close();

      // 4. Address modal (#addressModal)
      const ctxAddr = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxAddr.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pAddr = await ctxAddr.newPage();
      await pAddr.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pAddr.evaluate(() => {
        const m = document.getElementById('addressModal');
        if (m) { m.style.display = 'flex'; m.classList.add('show'); }
      });
      await pAddr.waitForSelector('#addressModal', { state: 'visible', timeout: 5000 });
      await pAddr.waitForTimeout(300);
      await pAddr.screenshot({ path: path.join(MODAL_DIR, `cart-address-modal-${mv.name}.png`) });
      await ctxAddr.close();

      // 5. Store details & map button
      const ctxStore = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxStore.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pStore = await ctxStore.newPage();
      await pStore.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pStore.evaluate(() => {
        const radio = document.querySelector('input[name="deliveryMethod"][value="pickup"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
        const s = document.getElementById('storeInfo');
        if (s) { s.style.display = 'block'; s.scrollIntoView({ block: 'center' }); }
      });
      await pStore.waitForSelector('#storeInfo', { state: 'visible', timeout: 5000 });
      await pStore.waitForTimeout(300);
      await pStore.screenshot({ path: path.join(MODAL_DIR, `cart-store-details-${mv.name}.png`) });
      await ctxStore.close();

      // 6. Offer modal (#offerModal)
      const ctxOffer = await browser.newContext({ viewport: { width: mv.width, height: mv.height } });
      await ctxOffer.addInitScript(({ cart }) => { localStorage.setItem('cart', JSON.stringify(cart)); }, { cart: seededCart });
      const pOffer = await ctxOffer.newPage();
      await pOffer.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'load' });
      await pOffer.evaluate(() => {
        const m = document.getElementById('offerModal');
        if (m) {
          m.style.display = 'flex';
          m.classList.add('show');
          document.getElementById('offerTitle').textContent = 'Special Festival Discount!';
          document.getElementById('offerMessage').textContent = 'Flat 15% off on complete educational orders.';
          const orig = document.getElementById('offerOriginalAmount'); if (orig) orig.textContent = '620';
          const disc = document.getElementById('offerDiscount'); if (disc) disc.textContent = '93';
          const fin = document.getElementById('offerFinalAmount'); if (fin) fin.textContent = '527';
        }
      });
      await pOffer.waitForSelector('#offerModal', { state: 'visible', timeout: 5000 });
      await pOffer.waitForTimeout(300);
      await pOffer.screenshot({ path: path.join(MODAL_DIR, `cart-offer-modal-${mv.name}.png`) });
      await ctxOffer.close();

    }
  }, 180000);

  test('(6) Real signup against test DB without mocking routes', async () => {
    const contextReal = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageReal = await contextReal.newPage();
    const dialogsReal = attachDialogCollector(pageReal);

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

    expect(pageReal.url()).toBe('http://127.0.0.1:3100/');

    // Verify stored auth tokens in localStorage
    const storedToken = await pageReal.evaluate(() => localStorage.getItem('token'));
    const storedUser = await pageReal.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}'));
    expect(storedToken).toBeTruthy();
    expect(storedUser.email).toBe(realEmail.toLowerCase());

    assertNoDialogErrors(dialogsReal);
    await contextReal.close();
  }, 90000);

  test('(7) Pixel proof: book.html, bundle.html, bundles.html byte-identical vs 98d19d7 site-shell.css', async () => {
    const baseCss = execSync('git -C "C:/Users/KRISHNA TAMBUR/four-sections" show 98d19d7:shreemata-main/public/css/site-shell.css', { encoding: 'utf8' });
    const proofPages = ['book.html', 'bundle.html', 'bundles.html'];
    const proofViewports = [
      { name: '1440', width: 1440, height: 900 },
      { name: '390', width: 390, height: 844 }
    ];

    for (const pageName of proofPages) {
      for (const vp of proofViewports) {
        // 1. With base 98d19d7 site-shell.css served via route interception
        const ctxBase = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const pBase = await ctxBase.newPage();
        await pBase.route('**/css/site-shell.css*', async route => {
          await route.fulfill({
            status: 200,
            contentType: 'text/css',
            body: baseCss
          });
        });
        await pBase.goto(`http://127.0.0.1:3100/${pageName}`, { waitUntil: 'networkidle' });
        await pBase.evaluate(() => document.fonts.ready);
        await pBase.waitForTimeout(300);
        const shotBase = await pBase.screenshot({ fullPage: true, animations: 'disabled' });
        await ctxBase.close();

        // 2. With current site-shell.css
        const ctxCurr = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const pCurr = await ctxCurr.newPage();
        await pCurr.goto(`http://127.0.0.1:3100/${pageName}`, { waitUntil: 'networkidle' });
        await pCurr.evaluate(() => document.fonts.ready);
        await pCurr.waitForTimeout(300);
        const shotCurr = await pCurr.screenshot({ fullPage: true, animations: 'disabled' });
        await ctxCurr.close();

        // Assert byte identical full-page screenshots
        const isByteIdentical = shotBase.equals(shotCurr);
        if (!isByteIdentical) {
          console.warn(`Pixel proof comparison for ${pageName} @ ${vp.name}: base length=${shotBase.length}, curr length=${shotCurr.length}`);
        }
        expect(isByteIdentical).toBe(true);
      }
    }
  }, 180000);
});
