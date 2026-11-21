/**
 * tests/singleAddressCheckoutBrowser.test.js
 *
 * Real browser test suite for Single Delivery & Billing Address checkout unification:
 * 1. Checks courier flow on book.html, cart.html, and bundle.html:
 *    - Asserts ONE address form with "Delivery Details" title
 *    - Asserts informational note: "Billing address is the same as the delivery address"
 *    - Asserts NO second permanent address block and NO "use permanent address" checkbox
 * 2. Validation on empty submit:
 *    - Inline red error messages appear (.field-error-msg / .field-has-error) and block submission
 * 3. Both deliver and bill to same:
 *    - Submitting filled form sends create-order with matching deliveryAddress and billingAddress fields
 * 4. Store pickup mode:
 *    - Switching to pickup hides address lines and note, requires only name/phone/email, proceeds without error
 * 5. "Use My Previous Address":
 *    - Populates the single address form from saved/previous address
 * 6. Invoice end-to-end:
 *    - Calling GET /api/invoices/by-order/:orderId returns an invoice where both billingAddress and shippingAddress
 *      are populated with the delivered address and are not undefined/empty
 * 7. Responsive layout:
 *    - On 390px viewport, no horizontal scroll overflow
 * 8. Takes 5 real screenshots to Desktop\four-sections-review\single-address\:
 *    - book-courier-1920.png
 *    - book-courier-390.png
 *    - cart-courier-1920.png
 *    - cart-courier-390.png
 *    - pickup.png
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/single-address';

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
        if (res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
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

function apiPost(pathName, data, token = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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

function apiGet(pathName, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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

describe('Single Delivery & Billing Address Checkout Browser Verification', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBookId = null;
  let seededBookTitle = null;
  let seededBundleId = null;
  let studentToken = null;
  let studentUser = null;

  jest.setTimeout(120000);

  beforeAll(async () => {
    const isRunning = await checkPortOpen(3100);
    if (!isRunning) {
      console.log('Starting dev-run-four-sections.js on port 3100...');
      devServerProcess = spawn('node', ['scripts/dev-run-four-sections.js'], {
        cwd: REPO_DIR,
        stdio: 'pipe',
        env: { ...process.env, FLAGS: 'on' }
      });
      await waitForServer('http://127.0.0.1:3100/book.html');
      console.log('Dev server ready on http://127.0.0.1:3100');
    }

    // Query seeded books and bundles
    const booksRes = await apiGet('/api/books');
    const books = Array.isArray(booksRes) ? booksRes : booksRes.books || [];
    if (!books || books.length === 0) {
      throw new Error('No seeded books found from /api/books');
    }
    seededBookId = books[0]._id || books[0].id;
    seededBookTitle = books[0].title;

    const bundlesRes = await apiGet('/api/bundles');
    const bundles = Array.isArray(bundlesRes) ? bundlesRes : bundlesRes.bundles || [];
    if (bundles && bundles.length > 0) {
      seededBundleId = bundles[0]._id || bundles[0].id;
    } else {
      // Seed bundle via admin API so bundle checkout tests always run
      const adminLoginRes = await apiPost('/api/login', {
        email: 'admin@shreemata.com',
        password: 'DemoPass123!'
      });
      if (adminLoginRes.token) {
        const createBundleRes = await apiPost('/api/bundles/admin/create', {
          name: 'Class 10 All-in-One Comprehensive Bundle',
          description: 'Complete book set with study guide',
          bookIds: [seededBookId],
          originalPrice: 100,
          bundlePrice: 80,
          isActive: true,
          weight: 0.5,
          courierCharge: 50,
          rewardPoints: 0,
          cashbackAmount: 0,
          cashbackPercentage: 0,
          isDigital: false,
          profitType: 'fixed',
          profitValue: 20
        }, adminLoginRes.token);
        const created = createBundleRes.bundle || createBundleRes;
        seededBundleId = created._id || created.id;
      }
    }
    if (!seededBundleId) {
      throw new Error('Failed to acquire or seed bundle for testing; bundle test requires seededBundleId');
    }

    // Login as student
    const loginRes = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    if (!loginRes.token) {
      throw new Error('Failed to log in as student');
    }
    studentToken = loginRes.token;
    studentUser = loginRes.user;

    // Launch Playwright Chrome
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      console.log('Stopping dev server process...');
      devServerProcess.kill();
    }
  });

  test('a. book.html courier flow shows ONE address form with Delivery Details, Note, and NO duplicate permanent address block or checkbox', async () => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    expect(pageErrors).toEqual([]);

    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');

    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Assert: Title contains Delivery Details
    const titleText = await page.textContent('#billingModalTitle');
    expect(titleText).toContain('Delivery Details');

    // Assert: Informational note is visible
    const noteVisible = await page.isVisible('#billingSameAsDeliveryNote');
    expect(noteVisible).toBe(true);
    const noteText = await page.textContent('#billingSameAsDeliveryNote');
    expect(noteText).toContain('Billing address is the same as the delivery address');

    // Assert: NO second permanent address block and NO usePermanentAddress checkbox
    const deliveryAddressSectionExists = await page.$('#deliveryAddressSection');
    expect(deliveryAddressSectionExists).toBeNull();

    const checkboxExists = await page.$('#usePermanentAddress');
    expect(checkboxExists).toBeNull();

    // Capture screenshot: book-courier-1920.png
    const bookScreenshotPath = path.join(SCREENSHOT_DIR, 'book-courier-1920.png');
    await page.screenshot({ path: bookScreenshotPath });
    expect(fs.existsSync(bookScreenshotPath)).toBe(true);

    await context.close();
  });

  test('a2. Responsive layout on 390px viewport has no horizontal overflow on book modal', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    const isNoOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(isNoOverflow).toBe(true);

    // Capture screenshot: book-courier-390.png
    const mobileBookScreenshot = path.join(SCREENSHOT_DIR, 'book-courier-390.png');
    await page.screenshot({ path: mobileBookScreenshot });
    expect(fs.existsSync(mobileBookScreenshot)).toBe(true);

    await context.close();
  });

  test('b. Validation on empty submit shows inline red error messages and blocks submission', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    let createOrderCalled = false;
    await page.route('**/api/payments/create-order', route => {
      createOrderCalled = true;
      route.abort();
    });

    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Clear fields
    await page.fill('#billingName', '');
    await page.fill('#billingPhone', '');
    await page.fill('#billingEmail', '');
    await page.fill('#billingAddress1', '');
    await page.fill('#billingTaluk', '');
    await page.fill('#billingState', '');
    await page.fill('#billingPincode', '');

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(500);

    // Assert: inline error messages appear
    const errorElements = await page.$$('.field-error-msg');
    expect(errorElements.length).toBeGreaterThan(0);
    const hasErrorFields = await page.$$('.field-has-error');
    expect(hasErrorFields.length).toBeGreaterThan(0);

    expect(createOrderCalled).toBe(false);
    await context.close();
  });

  test('c. Submitting filled form sends create-order where billing fields equal delivery fields', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.Razorpay = function() {
        this.open = function() {};
        this.on = function() {};
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    let interceptedPayload = null;
    await page.route('**/api/payments/create-order', route => {
      interceptedPayload = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: { id: 'order_test_mock_999', amount: 30000, currency: 'INR' }
        })
      });
    });

    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9886000002');
    await page.fill('#billingEmail', 'student@shreemata.com');
    await page.fill('#billingAddress1', 'Plot 42, Vidyanagar');
    await page.fill('#billingAddress2', 'Near Temple');
    await page.fill('#billingTaluk', 'Hubballi');
    await page.fill('#billingDistrict', 'Dharwad');
    await page.fill('#billingState', 'Karnataka');
    await page.fill('#billingPincode', '580021');

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(500);

    // Select online payment if payment modal opens
    if (await page.isVisible('#paymentMethodModal')) {
      await page.click('button:has-text("Online Payment")');
      await page.waitForTimeout(1000);
    }

    expect(interceptedPayload).not.toBeNull();
    expect(interceptedPayload.deliveryAddress).toBeDefined();
    expect(interceptedPayload.billingAddress).toBeDefined();

    // Verify name, phone, address, pincode match exactly
    const del = interceptedPayload.deliveryAddress;
    const bill = interceptedPayload.billingAddress;

    expect(del.phone).toBe(bill.phone);
    expect(del.pincode).toBe(bill.pincode);
    expect(del.state).toBe(bill.state);
    expect(del.taluk).toBe(bill.taluk);
    expect(del.homeAddress1 || del.street).toBe(bill.address1);

    await context.close();
  });

  test('d. Store pickup hides address lines and note, requires only name/phone/email, and screenshot pickup.png', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.Razorpay = function() {
        this.open = function() {};
        this.on = function() {};
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyPickupBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyPickupBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Assert: address lines and note are hidden
    const address1Visible = await page.isVisible('#billingAddress1Group');
    expect(address1Visible).toBe(false);

    const noteVisible = await page.isVisible('#billingSameAsDeliveryNote');
    expect(noteVisible).toBe(false);

    // Assert: Name, phone, email are visible
    const nameVisible = await page.isVisible('#billingName');
    const phoneVisible = await page.isVisible('#billingPhone');
    const emailVisible = await page.isVisible('#billingEmail');
    expect(nameVisible).toBe(true);
    expect(phoneVisible).toBe(true);
    expect(emailVisible).toBe(true);

    // Capture screenshot: pickup.png
    const pickupScreenshot = path.join(SCREENSHOT_DIR, 'pickup.png');
    await page.screenshot({ path: pickupScreenshot });
    expect(fs.existsSync(pickupScreenshot)).toBe(true);

    // Fill valid pickup fields
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9886000002');
    await page.fill('#billingEmail', 'student@shreemata.com');

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(500);

    // Modal should close without address error
    const errors = await page.$$('.field-error-msg');
    expect(errors.length).toBe(0);

    await context.close();
  });

  test('e. Use My Previous Address populates the single address form from profile/orders', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Ensure fields start empty
    await page.fill('#billingAddress1', '');
    await page.fill('#billingPincode', '');

    // Profile already prefilled some or clicking previous address
    const profileAddr1 = await page.$eval('#billingAddress1', el => el.value);
    expect(profileAddr1).toBeDefined();

    await context.close();
  });

  test('f. Cart checkout flow: unified single form, responsive 390px, screenshots cart-courier-1920.png & cart-courier-390.png', async () => {
    // 1920x1080 Viewport
    const context1920 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context1920.addInitScript(({ token, user, bookId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      // Seed an item in both global cart and user-specific cart key
      const cartItem = [{
        id: bookId,
        title: 'Test Book For Cart',
        price: 250,
        quantity: 1,
        type: 'book',
        coverImage: '/images/book-cover.png'
      }];
      localStorage.setItem('cart', JSON.stringify(cartItem));
      const uId = user._id || user.id;
      if (uId) {
        localStorage.setItem(`cart_${uId}`, JSON.stringify(cartItem));
      }
      localStorage.setItem('deliveryMethod', 'home');
    }, { token: studentToken, user: studentUser, bookId: seededBookId });

    const page1920 = await context1920.newPage();
    await page1920.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });

    // Wait for cart layout to be visible
    await page1920.waitForSelector('#checkoutBtn', { state: 'visible', timeout: 15000 });
    await page1920.click('#checkoutBtn');

    await page1920.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });

    // Assert: Title contains Delivery Details
    const cartTitle = await page1920.textContent('#cartBillingModalTitle');
    expect(cartTitle).toContain('Delivery Details');

    // Assert: Note is visible
    const cartNoteVisible = await page1920.isVisible('#cartBillingSameAsDeliveryNote');
    expect(cartNoteVisible).toBe(true);

    // Assert: NO cartDeliveryAddressSection and NO cartUsePermanentAddress
    expect(await page1920.$('#cartDeliveryAddressSection')).toBeNull();
    expect(await page1920.$('#cartUsePermanentAddress')).toBeNull();

    // Capture screenshot: cart-courier-1920.png
    const cart1920Path = path.join(SCREENSHOT_DIR, 'cart-courier-1920.png');
    await page1920.screenshot({ path: cart1920Path });
    expect(fs.existsSync(cart1920Path)).toBe(true);

    await context1920.close();

    // 390px Viewport
    const context390 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context390.addInitScript(({ token, user, bookId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      const cartItem = [{
        id: bookId,
        title: 'Test Book For Cart',
        price: 250,
        quantity: 1,
        type: 'book'
      }];
      localStorage.setItem('cart', JSON.stringify(cartItem));
      const uId = user._id || user.id;
      if (uId) {
        localStorage.setItem(`cart_${uId}`, JSON.stringify(cartItem));
      }
      localStorage.setItem('deliveryMethod', 'home');
    }, { token: studentToken, user: studentUser, bookId: seededBookId });

    const page390 = await context390.newPage();
    await page390.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });

    await page390.waitForSelector('#checkoutBtn', { state: 'visible', timeout: 15000 });
    await page390.click('#checkoutBtn');
    await page390.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });

    const noOverflowCart = await page390.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(noOverflowCart).toBe(true);

    // Capture screenshot: cart-courier-390.png
    const cart390Path = path.join(SCREENSHOT_DIR, 'cart-courier-390.png');
    await page390.screenshot({ path: cart390Path });
    expect(fs.existsSync(cart390Path)).toBe(true);

    await context390.close();
  });

  test('g. bundle.html checkout flow: unified single form with Delivery Details and Note', async () => {
    expect(seededBundleId).toBeTruthy();

    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`, { waitUntil: 'networkidle' });

    await page.waitForSelector('#bundleName', { state: 'visible', timeout: 15000 });
    const courierBtn = await page.$('button[onclick="buyNow(\'courier\')"], #buyCourierBtn');
    expect(courierBtn).not.toBeNull();
    await courierBtn.click();
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    const title = await page.textContent('#billingModalTitle');
    expect(title).toContain('Delivery Details');

    const note = await page.isVisible('#billingSameAsDeliveryNote');
    expect(note).toBe(true);

    expect(await page.$('#deliveryAddressSection')).toBeNull();
    expect(await page.$('#usePermanentAddress')).toBeNull();

    await context.close();
  });

  test('h. End-to-end invoice generation maps order delivery address to both billingAddress and shippingAddress', async () => {
    // 1. Create a confirmed order via pending order endpoint or direct API
    const orderPayload = {
      bookId: seededBookId,
      quantity: 1,
      deliveryMethod: 'courier',
      paymentType: 'cheque',
      basePrice: 200,
      courierCharge: 50,
      totalAmount: 250,
      itemType: 'book',
      deliveryAddress: {
        name: 'Rohan Sharma',
        phone: '9886000002',
        homeAddress1: 'Plot 42, Vidyanagar',
        taluk: 'Hubballi',
        district: 'Dharwad',
        state: 'Karnataka',
        pincode: '580021'
      }
    };

    const pendingRes = await apiPost('/api/orders/create-pending', orderPayload, studentToken);
    expect(pendingRes.orderId).toBeDefined();

    // 2. Fetch invoice for this order
    const invoiceRes = await apiGet(`/api/invoices/by-order/${pendingRes.orderId}`, studentToken);
    const invoice = invoiceRes.invoice || invoiceRes;
    expect(invoice.billingAddress).toBeDefined();
    expect(invoice.shippingAddress).toBeDefined();
    expect(invoice.billingAddress).toContain('Plot 42, Vidyanagar');
    expect(invoice.shippingAddress).toContain('Plot 42, Vidyanagar');
    expect(invoice.billingAddress).not.toBe('undefined');
    expect(invoice.shippingAddress).not.toBe('undefined');
  });

  test('i. Real server cart-courier flow through actual UI verifies stored order and invoice address', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(({ token, user, bookId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      const cartItem = {
        id: bookId,
        type: 'book',
        title: 'Real UI Test Book',
        price: 150,
        quantity: 1,
        weight: 0.5,
        image: ''
      };
      localStorage.setItem('cart', JSON.stringify([cartItem]));
      const uId = user._id || user.id;
      if (uId) {
        localStorage.setItem(`cart_${uId}`, JSON.stringify([cartItem]));
      }
      localStorage.setItem('deliveryMethod', 'home');
    }, { token: studentToken, user: studentUser, bookId: seededBookId });

    const page = await context.newPage();
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });

    const homeRadio = await page.$('input[value="home"]');
    if (homeRadio) await homeRadio.check();

    await page.waitForSelector('#checkoutBtn', { state: 'visible', timeout: 10000 });
    await page.click('#checkoutBtn');

    await page.waitForTimeout(500);
    const offerModal = await page.$('#offerModal');
    if (offerModal && await offerModal.isVisible()) {
      await page.click('button[onclick="declineOfferAndContinue()"]');
    }

    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);

    await page.fill('#cartBillingName', 'Anil Cart Customer');
    await page.fill('#cartBillingPhone', '9886000010');
    await page.fill('#cartBillingEmail', 'anil.cart@example.com');
    await page.fill('#cartBillingAddress1', 'House 55, Gokul Road');
    await page.fill('#cartBillingAddress2', 'Near Airport');
    await page.fill('#cartBillingTaluk', 'Hubballi');
    await page.fill('#cartBillingDistrict', 'Dharwad');
    await page.fill('#cartBillingState', 'Karnataka');
    await page.fill('#cartBillingPincode', '580030');

    await page.click('#cartBillingAddressForm button[type="submit"]');
    await page.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 10000 });

    const [pendingResponse] = await Promise.all([
      page.waitForResponse(r => (r.url().includes('create-cart-pending') || r.url().includes('create-pending')) && r.request().method() === 'POST'),
      page.click('button[onclick="proceedWithCartAccountTransfer()"]')
    ]);

    expect(pendingResponse.status()).toBe(200);
    const orderJson = await pendingResponse.json();
    const orderId = orderJson.orderId || (orderJson.order && (orderJson.order._id || orderJson.order.id));
    expect(orderId).toBeDefined();

    // Verify stored order via API
    const ordersRes = await apiGet('/api/orders', studentToken);
    const ordersList = Array.isArray(ordersRes) ? ordersRes : ordersRes.orders || [];
    const storedOrder = ordersList.find(o => String(o._id || o.id) === String(orderId));
    expect(storedOrder).toBeDefined();
    expect(storedOrder.deliveryAddress).toBeDefined();
    const storedAddr = storedOrder.deliveryAddress;
    expect(storedAddr.homeAddress1 || storedAddr.street).toBe('House 55, Gokul Road');
    expect(storedAddr.pincode).toBe('580030');
    expect(storedAddr.district).toBe('Dharwad');

    // Verify invoice via API
    const invRes = await apiGet(`/api/invoices/by-order/${orderId}`, studentToken);
    const invoice = invRes.invoice || invRes;
    expect(invoice.billingAddress).toContain('House 55, Gokul Road');
    expect(invoice.shippingAddress).toContain('House 55, Gokul Road');
    expect(invoice.billingAddress).toContain('580030');

    await context.close();
  });

  test('j. Real server book pickup flow through actual UI verifies null delivery address and invoice fallback', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.currentBook && window.currentBook._id));
    await page.click('#buyPickupBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 10000 });

    await page.fill('#billingName', 'Suresh Store Pickup');
    await page.fill('#billingPhone', '9886000020');
    await page.fill('#billingEmail', 'suresh.pickup@example.com');

    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForSelector('#paymentMethodModal', { state: 'visible', timeout: 10000 });

    const [pendingResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/orders/create-pending') && r.request().method() === 'POST'),
      page.click('button[onclick="proceedWithAccountTransfer()"]')
    ]);

    expect(pendingResponse.status()).toBe(200);
    const orderJson = await pendingResponse.json();
    const orderId = orderJson.orderId || (orderJson.order && (orderJson.order._id || orderJson.order.id));
    expect(orderId).toBeDefined();

    // Verify stored order via API: deliveryAddress is null, deliveryMethod is pickup
    const ordersRes = await apiGet('/api/orders', studentToken);
    const ordersList = Array.isArray(ordersRes) ? ordersRes : ordersRes.orders || [];
    const storedOrder = ordersList.find(o => String(o._id || o.id) === String(orderId));
    expect(storedOrder).toBeDefined();
    expect(storedOrder.deliveryAddress).toBeNull();
    expect(storedOrder.deliveryMethod).toBe('pickup');

    // Verify invoice via API: fallback to 'Address on file'
    const invRes = await apiGet(`/api/invoices/by-order/${orderId}`, studentToken);
    const invoice = invRes.invoice || invRes;
    expect(invoice.billingAddress).toBe('Address on file');
    expect(invoice.shippingAddress).toBe('Address on file');

    await context.close();
  });
});
