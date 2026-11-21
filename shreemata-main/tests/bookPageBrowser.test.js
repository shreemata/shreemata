/**
 * tests/bookPageBrowser.test.js
 *
 * Real browser test of the single-book page (book.html):
 * 1. Loads book.html?id=<bookId> and asserts:
 *    - No `pageerror` events occur
 *    - The book title is visible
 *    - "Loading book details..." spinner is gone
 * 2. Clicks Buy through Courier with an empty address while logged in:
 *    - Asserts inline red address errors appear (.field-error-msg / .field-has-error)
 *    - Asserts no payment starts
 * 3. Fills a valid delivery address and chooses Online Payment:
 *    - Asserts POST /api/payments/create-order is dispatched with deliveryMethod="courier" and address
 * 4. Saves screenshots to Desktop\four-sections-review\book-page-fix\
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/book-page-fix';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function checkPortOpen(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/`, res => {
      resolve(true);
    });
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

function apiPost(pathName, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body });
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
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Single Book Page (book.html) Browser Verification', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBookId = null;
  let seededBookTitle = null;
  let studentToken = null;
  let studentUser = null;

  jest.setTimeout(90000);

  beforeAll(async () => {
    // 1. Ensure dev server on port 3100 is running
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

    // 2. Query seeded books to pick a valid book ID
    const booksRes = await apiGet('/api/books');
    const books = Array.isArray(booksRes) ? booksRes : booksRes.books || [];
    if (!books || books.length === 0) {
      throw new Error('No seeded books found from /api/books');
    }
    const book = books[0];
    seededBookId = book._id || book.id;
    seededBookTitle = book.title;
    console.log(`Using seeded book: "${seededBookTitle}" (${seededBookId})`);

    // 3. Log in as student to get a valid user token
    const loginRes = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    if (!loginRes.token) {
      throw new Error('Failed to log in as student: ' + JSON.stringify(loginRes));
    }
    studentToken = loginRes.token;
    studentUser = loginRes.user;

    // 4. Launch browser
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

  test('Page loads without syntax errors, title is visible, loading spinner disappears', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });

    // Set student login state in localStorage
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => {
      console.error('Browser Page Error:', err.message);
      pageErrors.push(err.message);
    });

    const targetUrl = `http://127.0.0.1:3100/book.html?id=${seededBookId}`;
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    // Assert: No pageerror events occurred
    expect(pageErrors).toEqual([]);

    // Assert: Book title is visible and matches seeded book
    await page.waitForSelector('#bookTitle', { state: 'visible', timeout: 10000 });
    const displayedTitle = await page.textContent('#bookTitle');
    expect(displayedTitle.trim()).toBe(seededBookTitle.trim());

    // Assert: "Loading book details..." spinner is gone/hidden
    const spinnerVisible = await page.isVisible('#loadingSpinner');
    expect(spinnerVisible).toBe(false);

    // Capture screenshot: loaded-page.png
    const loadedPath = path.join(SCREENSHOT_DIR, 'loaded-page.png');
    await page.screenshot({ path: loadedPath, fullPage: false });
    console.log('Saved screenshot:', loadedPath);
    expect(fs.existsSync(loadedPath)).toBe(true);

    await context.close();
  });

  test('Courier Buy Now with empty address triggers red inline errors and blocks payment', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });

    // Set student login state in localStorage (address is empty)
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Track create-order requests to ensure none are sent with empty address
    let createOrderCalled = false;
    await page.route('**/api/payments/create-order', route => {
      createOrderCalled = true;
      route.abort();
    });

    const targetUrl = `http://127.0.0.1:3100/book.html?id=${seededBookId}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(pageErrors).toEqual([]);

    // Click Buy through Courier button
    await page.waitForSelector('#buyCourierBtn', { state: 'visible', timeout: 10000 });
    await page.click('#buyCourierBtn');

    // Wait for billing & delivery address modal
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Ensure usePermanentAddress is UNCHECKED so separate delivery fields are required and tested
    const usePermanentCheckbox = await page.$('#usePermanentAddress');
    if (usePermanentCheckbox) {
      const isChecked = await usePermanentCheckbox.isChecked();
      if (isChecked) {
        await usePermanentCheckbox.uncheck();
      }
    }

    // Clear address fields to ensure they are empty
    if (await page.$('#deliveryName')) {
      await page.fill('#deliveryName', '');
      await page.fill('#deliveryPhone', '');
      await page.fill('#deliveryAddress1', '');
      await page.fill('#deliveryTaluk', '');
      await page.fill('#deliveryState', '');
      await page.fill('#deliveryPincode', '');
    } else {
      await page.fill('#billingName', '');
      await page.fill('#billingPhone', '');
      await page.fill('#billingAddress1', '');
      await page.fill('#billingTaluk', '');
      await page.fill('#billingDistrict', '');
      await page.fill('#billingState', '');
      await page.fill('#billingPincode', '');
    }

    // Submit the address form
    await page.click('#billingAddressForm button[type="submit"]');
    await page.waitForTimeout(500);

    // Assert: Inline error messages appear (.field-error-msg)
    const errorElements = await page.$$('.field-error-msg');
    expect(errorElements.length).toBeGreaterThan(0);

    // Assert: Input elements have .field-has-error class with red border
    const hasErrorFields = await page.$$('.field-has-error');
    expect(hasErrorFields.length).toBeGreaterThan(0);

    // Assert: No create-order request was dispatched
    expect(createOrderCalled).toBe(false);

    // Assert: Payment method modal is NOT visible
    const paymentModalVisible = await page.isVisible('#paymentMethodModal');
    expect(paymentModalVisible).toBe(false);

    // Capture screenshot: address-error.png
    const errorPath = path.join(SCREENSHOT_DIR, 'address-error.png');
    await page.screenshot({ path: errorPath, fullPage: false });
    console.log('Saved screenshot:', errorPath);
    expect(fs.existsSync(errorPath)).toBe(true);

    await context.close();
  });

  test('Filling valid delivery address allows proceeding to payment and creates order', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });

    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      // Mock Razorpay constructor to prevent live script popup during test
      window.Razorpay = function (options) {
        window.__lastRazorpayOptions = options;
        this.open = function () {
          window.__razorpayOpened = true;
        };
        this.on = function () { };
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    let interceptedOrderPayload = null;
    await page.route('**/api/payments/create-order', route => {
      interceptedOrderPayload = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'order_mock_test_123',
            amount: 34000,
            currency: 'INR'
          }
        })
      });
    });

    const targetUrl = `http://127.0.0.1:3100/book.html?id=${seededBookId}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(pageErrors).toEqual([]);

    // Click Buy through Courier
    await page.click('#buyCourierBtn');
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });

    // Check "Use permanent address for delivery" or fill in delivery fields
    await page.fill('#billingName', 'Rohan Sharma');
    await page.fill('#billingPhone', '9886000002');
    await page.fill('#billingAddress1', 'Plot 42, Vidyanagar');
    await page.fill('#billingTaluk', 'Hubballi');
    await page.fill('#billingDistrict', 'Dharwad');
    await page.fill('#billingState', 'Karnataka');
    await page.fill('#billingPincode', '580021');

    const usePermanent = await page.$('#usePermanentAddress');
    if (usePermanent) {
      await usePermanent.check();
    }

    // Submit address form
    await page.click('#billingAddressForm button[type="submit"]');

    // Payment method modal should now appear
    await page.waitForSelector('#paymentMethodModal', { state: 'visible', timeout: 5000 });

    // Click "Online Payment"
    await page.click('.payment-method-btn');

    // Wait for create-order to be called
    await page.waitForTimeout(1000);

    // Assert create-order was called with courier delivery and user address
    expect(interceptedOrderPayload).not.toBeNull();
    expect(interceptedOrderPayload.deliveryMethod).toBe('courier');
    expect(interceptedOrderPayload.deliveryAddress).toBeDefined();
    expect(interceptedOrderPayload.deliveryAddress.pincode).toBe('580021');
    expect(interceptedOrderPayload.deliveryAddress.phone).toBe('9886000002');

    await context.close();
  });
});
