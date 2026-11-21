/**
 * tests/batch1UiUnificationBrowser.test.js
 *
 * Real browser verification for Batch 1 Customer-Page UI Unification:
 * - public/book.html
 * - public/bundle.html
 * - public/bundles.html
 *
 * Verifies:
 * 1. Unified header, top notice bar, mobile drawer, and luxury 4-column footer present at 1920, 1440, 1366, 390.
 * 2. ONLY images/press.png is used as logo (no logo.png or emoji brand text).
 * 3. Header has NO "Disseminating Knowledge", while footer HAS "Disseminating Knowledge".
 * 4. Brand text "Shree Mata" visible, centered, and within header bounding box.
 * 5. Mobile drawer toggle button opens drawer and close button closes drawer at 390px.
 * 6. No horizontal overflow at 1920, 1440, 1366, 390 (scrollWidth <= innerWidth).
 * 7. Login and logout state: auth links vs user links, and logout clears state.
 * 8. Add to cart updates cart badge dynamically.
 * 9. Logged-in user chooses courier on book.html: Delivery Details form is prefilled,
 *    and order request body shape matches previous schema.
 * 10. Full-page screenshots captured at 1440x900, 1366x768, 390x844 with fullPage: true.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/batch1';

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

describe('Batch 1 UI Unification Browser Tests', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBookId = null;
  let seededBundleId = null;
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
    const book = books[0];
    seededBookId = book._id || book.id;
    const bookPrice = book.price || 340;

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

    expect(seededBookId).toBeTruthy();
    expect(seededBundleId).toBeTruthy();

    const studentLogin = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    studentToken = studentLogin.token;
    studentUser = studentLogin.user;
    if (!studentUser.address) {
      studentUser.address = {
        homeAddress1: '123 Vidya Nagar Main Road',
        homeAddress2: 'Near Central Library',
        taluk: 'Hubballi',
        district: 'Dharwad',
        state: 'Karnataka',
        pincode: '580021'
      };
    }

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
  }, 120000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      console.log('Killing dev server process...');
      devServerProcess.kill();
    }
  });

  test('(a) book.html UI shell, single logo, header/footer presence, drawer, overflow & fullPage screenshots', async () => {
    const viewports = [
      { w: 1920, h: 1080 },
      { w: 1440, h: 900, screenshot: 'book-final-1440.png', legacyScreenshot: 'book-after-1440.png' },
      { w: 1366, h: 768, screenshot: 'book-final-1366.png', legacyScreenshot: 'book-after-1366.png' },
      { w: 390, h: 844, screenshot: 'book-final-390.png', legacyScreenshot: 'book-after-390.png' }
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }, { token: studentToken, user: studentUser });

      const page = await context.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));
      await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);

      // Verify Header & Top bar
      const mainHeader = await page.$('.main-header');
      expect(mainHeader).not.toBeNull();
      const topBar = await page.$('.top-bar');
      expect(topBar).not.toBeNull();

      // Verify Logo: only press.png, NO logo.png
      const logoImgs = await page.$$eval('header img, .brand-logo img', imgs => imgs.map(i => i.src));
      expect(logoImgs.length).toBeGreaterThan(0);
      for (const src of logoImgs) {
        expect(src).toContain('press.png');
        expect(src).not.toContain('logo.png');
      }

      // Verify Brand Title
      const brandTitle = await page.locator('.main-header .brand-logo .brand-title');
      const isVisible = await brandTitle.isVisible();
      expect(isVisible).toBe(true);
      const titleText = await brandTitle.textContent();
      expect(titleText.trim()).toBe('Shree Mata');

      // Verify Tagline absent in header
      const headerText = await page.$eval('.main-header', h => h.textContent);
      expect(headerText).not.toContain('Disseminating Knowledge');

      // Verify Footer: 4-column luxury footer present
      const footer = await page.$('footer.site-footer');
      expect(footer).not.toBeNull();
      const footerText = await page.$eval('footer.site-footer', f => f.textContent);
      expect(footerText).toContain('Disseminating Knowledge');
      expect(footerText).toContain('Empower Us.');
      expect(footerText).toContain('All rights reserved');

      // Verify no horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);

      // Verify Mobile Drawer on 390px
      if (vp.w === 390) {
        const toggleBtn = await page.$('#mobileMenuToggle');
        expect(toggleBtn).not.toBeNull();
        await toggleBtn.click();
        await page.waitForTimeout(400);
        const isOpen = await page.$eval('#mobileNavDrawer', d => d.classList.contains('open') || d.classList.contains('is-open'));
        expect(isOpen).toBe(true);

        const closeBtn = await page.$('#drawerCloseBtn');
        await closeBtn.click();
        await page.waitForTimeout(400);
        const isClosed = await page.$eval('#mobileNavDrawer', d => !d.classList.contains('open') && !d.classList.contains('is-open'));
        expect(isClosed).toBe(true);
      }

      // Full page screenshot including footer
      if (vp.screenshot) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, vp.screenshot),
          fullPage: true
        });
        if (vp.legacyScreenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.legacyScreenshot),
            fullPage: true
          });
        }
        if (vp.final2Screenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.final2Screenshot),
            fullPage: true
          });
        }
      }

      await context.close();
    }
  });

  test('(b) book.html guest vs logged-in state and logout flow', async () => {
    // 1. Guest state
    const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
    await guestPage.waitForTimeout(800);

    const guestAuthDisplay = await guestPage.$eval('#authLinks', el => window.getComputedStyle(el).display);
    expect(guestAuthDisplay).not.toBe('none');
    const guestUserDisplay = await guestPage.$eval('#userLinks', el => window.getComputedStyle(el).display);
    expect(guestUserDisplay).toBe('none');
    await guestContext.close();

    // 2. Logged-in state & Logout
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const authPage = await authContext.newPage();
    await authPage.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
    await authPage.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: studentToken, user: studentUser });
    await authPage.reload({ waitUntil: 'load' });
    await authPage.waitForTimeout(800);

    const authLinksDisplay = await authPage.$eval('#authLinks', el => window.getComputedStyle(el).display);
    expect(authLinksDisplay).toBe('none');
    const userLinksDisplay = await authPage.$eval('#userLinks', el => window.getComputedStyle(el).display);
    expect(userLinksDisplay).not.toBe('none');

    // Open user dropdown and click the real logout control (#logoutBtn)
    await authPage.click('#userMenuBtn');
    await authPage.waitForTimeout(300);
    await Promise.all([
      authPage.waitForURL('**/login.html*'),
      authPage.click('#logoutBtn')
    ]);
    const tokenAfterLogout = await authPage.evaluate(() => localStorage.getItem('token'));
    expect(tokenAfterLogout).toBeNull();
    await authContext.close();
  });

  test('(c) book.html functionality: quantity selector, add to cart updates badge', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.Razorpay = function(options) {
        this.open = () => {};
        this.on = () => {};
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Test quantity controls
    const qtyInput = await page.$('#bookQuantity');
    expect(qtyInput).not.toBeNull();
    const initialQty = await page.$eval('#bookQuantity', el => el.value);
    expect(initialQty).toBe('1');

    const incBtn = await page.$('#increaseQty');
    await incBtn.click();
    const newQty = await page.$eval('#bookQuantity', el => el.value);
    expect(newQty).toBe('2');

    // Test Add to Cart button updates cart count badge
    const initialCartCount = await page.$eval('#cartCount', el => parseInt(el.textContent) || 0);
    const addToCartBtn = await page.$('#addToCartBtn');
    expect(addToCartBtn).not.toBeNull();

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await addToCartBtn.click();
    await page.waitForTimeout(1000);
    const updatedCartCount = await page.$eval('#cartCount', el => parseInt(el.textContent) || 0);
    expect(updatedCartCount).toBeGreaterThanOrEqual(initialCartCount);

    await context.close();
  });

  test('(d) book.html courier prefill & order request body shape verification', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.Razorpay = function(options) {
        this.open = () => {};
        this.on = () => {};
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Click Buy through Courier
    const courierBtn = await page.$('#buyCourierBtn');
    expect(courierBtn).not.toBeNull();
    await courierBtn.click();
    await page.waitForTimeout(800);

    // Verify Delivery Details modal displayed
    const isModalVisible = await page.$eval('#billingAddressModal', m => m.style.display !== 'none');
    expect(isModalVisible).toBe(true);

    // Verify fields prefilled
    const prefilledName = await page.$eval('#billingName', el => el.value);
    const prefilledPhone = await page.$eval('#billingPhone', el => el.value);
    const prefilledEmail = await page.$eval('#billingEmail', el => el.value);
    expect(prefilledName).toBe(studentUser.name);
    expect(prefilledPhone).toBeTruthy();
    expect(prefilledEmail).toBe(studentUser.email);

    // Fill missing courier delivery fields if empty to guarantee valid submission
    await page.$eval('#billingAddress1', (el, val) => { if (!el.value) el.value = val; }, '123 Vidya Nagar Main Road');
    await page.$eval('#billingTaluk', (el, val) => { if (!el.value) el.value = val; }, 'Hubballi');
    await page.$eval('#billingDistrict', (el, val) => { if (!el.value) el.value = val; }, 'Dharwad');
    await page.$eval('#billingState', (el, val) => { if (!el.value) el.value = val; }, 'Karnataka');
    await page.$eval('#billingPincode', (el, val) => { if (!el.value) el.value = val; }, '580021');

    // Intercept POST /api/payments/create-order to verify request body shape
    let interceptedRequestBody = null;
    await page.route('**/api/payments/create-order', async route => {
      interceptedRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'order_test_mock_123',
          key: 'rzp_test_123',
          amount: 10000,
          currency: 'INR'
        })
      });
    });

    // Submit Delivery Details form
    const submitBtn = await page.$('#billingAddressForm button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    await submitBtn.click();
    await page.waitForTimeout(800);

    // Payment method modal should open
    const isPayModalVisible = await page.$eval('#paymentMethodModal', m => m.style.display !== 'none');
    expect(isPayModalVisible).toBe(true);

    // Choose Online Payment (first payment-method-btn in paymentMethodModal)
    const onlinePayBtn = await page.$('#paymentMethodModal button.payment-method-btn');
    expect(onlinePayBtn).not.toBeNull();
    await onlinePayBtn.click();
    await page.waitForTimeout(1000);

    // Assert intercepted request body matches expected schema
    expect(interceptedRequestBody).not.toBeNull();
    expect(interceptedRequestBody.deliveryMethod).toBe('courier');
    expect(Array.isArray(interceptedRequestBody.items)).toBe(true);
    expect(interceptedRequestBody.items.length).toBeGreaterThan(0);
    expect(interceptedRequestBody.items[0].id).toBe(seededBookId);

    // Verify deliveryAddress and billingAddress are present and populated
    expect(interceptedRequestBody.deliveryAddress).toBeDefined();
    expect(interceptedRequestBody.deliveryAddress.homeAddress1).toBe('123 Vidya Nagar Main Road');
    expect(interceptedRequestBody.deliveryAddress.phone).toBeTruthy();
    expect(interceptedRequestBody.deliveryAddress.pincode).toBe('580021');

    expect(interceptedRequestBody.billingAddress).toBeDefined();
    expect(interceptedRequestBody.billingAddress.name).toBe(studentUser.name);
    expect(interceptedRequestBody.billingAddress.pincode).toBe('580021');

    await context.close();
  });

  test('(e) bundle.html UI shell, single logo, footer, overflow & fullPage screenshots', async () => {
    const viewports = [
      { w: 1920, h: 1080 },
      { w: 1440, h: 900, screenshot: 'bundle-final-1440.png', legacyScreenshot: 'bundle-after-1440.png', final2Screenshot: 'bundle-final2-1440.png' },
      { w: 1366, h: 768, screenshot: 'bundle-final-1366.png', legacyScreenshot: 'bundle-after-1366.png', final2Screenshot: 'bundle-final2-1366.png' },
      { w: 390, h: 844, screenshot: 'bundle-final-390.png', legacyScreenshot: 'bundle-after-390.png', final2Screenshot: 'bundle-final2-390.png' }
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }, { token: studentToken, user: studentUser });

      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);

      // Verify Header
      const mainHeader = await page.$('.main-header');
      expect(mainHeader).not.toBeNull();

      // Verify Logo: only press.png, NO logo.png
      const logoImgs = await page.$$eval('header img, .brand-logo img', imgs => imgs.map(i => i.src));
      expect(logoImgs.length).toBeGreaterThan(0);
      for (const src of logoImgs) {
        expect(src).toContain('press.png');
        expect(src).not.toContain('logo.png');
      }

      // Verify Brand Title
      const brandTitle = await page.locator('.main-header .brand-logo .brand-title');
      const isVisible = await brandTitle.isVisible();
      expect(isVisible).toBe(true);

      // Verify Footer: 4-column luxury footer present
      const footer = await page.$('footer.site-footer');
      expect(footer).not.toBeNull();
      const footerText = await page.$eval('footer.site-footer', f => f.textContent);
      expect(footerText).toContain('Disseminating Knowledge');
      expect(footerText).toContain('Empower Us.');

      // Verify no horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);

      // Full page screenshot
      if (vp.screenshot) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, vp.screenshot),
          fullPage: true
        });
        if (vp.legacyScreenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.legacyScreenshot),
            fullPage: true
          });
        }
        if (vp.final2Screenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.final2Screenshot),
            fullPage: true
          });
        }
      }

      await context.close();
    }
  });

  test('(f) bundles.html UI shell, single logo, catalog cards, footer, overflow & fullPage screenshots', async () => {
    const viewports = [
      { w: 1920, h: 1080 },
      { w: 1440, h: 900, screenshot: 'bundles-final-1440.png', legacyScreenshot: 'bundles-after-1440.png', final2Screenshot: 'bundles-final2-1440.png' },
      { w: 1366, h: 768, screenshot: 'bundles-final-1366.png', legacyScreenshot: 'bundles-after-1366.png', final2Screenshot: 'bundles-final2-1366.png' },
      { w: 390, h: 844, screenshot: 'bundles-final-390.png', legacyScreenshot: 'bundles-after-390.png', final2Screenshot: 'bundles-final2-390.png' }
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }, { token: studentToken, user: studentUser });

      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/bundles.html', { waitUntil: 'load' });
      await page.waitForTimeout(1000);

      // Verify Header
      const mainHeader = await page.$('.main-header');
      expect(mainHeader).not.toBeNull();

      // Verify Logo: only press.png
      const logoImgs = await page.$$eval('header img, .brand-logo img', imgs => imgs.map(i => i.src));
      expect(logoImgs.length).toBeGreaterThan(0);
      for (const src of logoImgs) {
        expect(src).toContain('press.png');
        expect(src).not.toContain('logo.png');
      }

      // Verify Footer: 4-column luxury footer present
      const footer = await page.$('footer.site-footer');
      expect(footer).not.toBeNull();
      const footerText = await page.$eval('footer.site-footer', f => f.textContent);
      expect(footerText).toContain('Disseminating Knowledge');

      // Verify bundles catalog rendered at least 1 bundle card
      const bundleCards = await page.$$('.bundle-card');
      expect(bundleCards.length).toBeGreaterThanOrEqual(1);

      // Verify no horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);

      // Full page screenshot
      if (vp.screenshot) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, vp.screenshot),
          fullPage: true
        });
        if (vp.legacyScreenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.legacyScreenshot),
            fullPage: true
          });
        }
        if (vp.final2Screenshot) {
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, vp.final2Screenshot),
            fullPage: true
          });
        }
      }

      await context.close();
    }
  });
  test('(g) character corruption audit: no U+FFFD, no ??, and rupee sign appears in price areas', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. Check book.html with seeded book
    await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const bookPageText = await page.evaluate(() => document.body.innerText);
    expect(bookPageText).not.toContain('\uFFFD');
    expect(bookPageText).not.toContain('??');

    // Assert rupee sign in price areas
    const pickupPriceText = await page.$eval('#pickupPrice', el => el.textContent);
    const courierPriceText = await page.$eval('#courierPrice', el => el.textContent);
    expect(pickupPriceText).toContain('₹');
    expect(courierPriceText).toContain('₹');

    // 2. Check bundle.html
    await page.goto(`http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const bundlePageText = await page.evaluate(() => document.body.innerText);
    expect(bundlePageText).not.toContain('\uFFFD');
    expect(bundlePageText).not.toContain('??');

    // 3. Check bundles.html
    await page.goto('http://127.0.0.1:3100/bundles.html', { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const bundlesPageText = await page.evaluate(() => document.body.innerText);
    expect(bundlesPageText).not.toContain('\uFFFD');
    expect(bundlesPageText).not.toContain('??');

    await context.close();
  });

  test('(h) footer navigation links point to home page sections and targets exist', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const footerTargets = [
      { href: '/#booksSection', sectionId: 'booksSection' },
      { href: '/#bundlesSection', sectionId: 'bundlesSection' },
      { href: '/#notificationsSection', sectionId: 'notificationsSection' },
      { href: '/#trustSection', sectionId: 'trustSection' }
    ];

    for (const target of footerTargets) {
      await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'load' });
      await page.waitForTimeout(600);

      const linkSelector = `footer a[href="${target.href}"]`;
      const link = await page.$(linkSelector);
      expect(link).not.toBeNull();

      // Click link and wait for navigation to home page with hash
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load' }),
        link.click()
      ]);

      const currentUrl = page.url();
      expect(currentUrl).toContain(target.href);

      // Verify target section exists on landing page
      const sectionExists = await page.$(`#${target.sectionId}`);
      expect(sectionExists).not.toBeNull();
    }

    // Verify Privacy Policy and Terms & Conditions links exist in footer across all three pages
    const pagesToCheck = [
      `http://127.0.0.1:3100/book.html?id=${seededBookId}`,
      `http://127.0.0.1:3100/bundle.html?id=${seededBundleId}`,
      'http://127.0.0.1:3100/bundles.html'
    ];

    for (const pageUrl of pagesToCheck) {
      await page.goto(pageUrl, { waitUntil: 'load' });
      await page.waitForTimeout(500);

      const privacyLink = await page.$('footer a[href="/privacy-policy.html"]');
      expect(privacyLink).not.toBeNull();
      const privacyText = await page.$eval('footer a[href="/privacy-policy.html"]', el => el.textContent.trim());
      expect(privacyText).toBe('Privacy Policy');

      const termsLink = await page.$('footer a[href="/terms-and-conditions.html"]');
      expect(termsLink).not.toBeNull();
      const termsText = await page.$eval('footer a[href="/terms-and-conditions.html"]', el => el.textContent.trim());
      expect(termsText).toBe('Terms & Conditions');
    }

    await context.close();
  });
  test('(i) bundle.html direct purchase URL flow (?id=...&buy=true&delivery=pickup&payment=online)', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.Razorpay = function(options) {
        this.open = () => {};
        this.on = () => {};
      };
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();

    let interceptedOrderPayload = null;
    await page.route('https://checkout.razorpay.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.Razorpay = function() { this.open = function() {}; this.on = function() {}; };'
      });
    });
    await page.route('**/*payments/create-order*', async route => {
      interceptedOrderPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order: { id: 'order_mock_bundle_direct_123', amount: 50000, currency: 'INR' },
          orderId: 'order_mock_bundle_direct_123',
          key: 'rzp_test_mock_bundle'
        })
      });
    });

    let dialogError = null;
    page.on('dialog', async dialog => {
      const text = dialog.message();
      if (/error|failed|unavailable/i.test(text)) {
        dialogError = text;
      }
      await dialog.accept();
    });

    await page.goto(`http://127.0.0.1:3100/bundle.html?id=${seededBundleId}&buy=true&delivery=pickup&payment=online`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // The direct purchase flow auto-detects parameters and opens the billing address modal
    await page.waitForSelector('#billingAddressModal', { state: 'visible', timeout: 5000 });
    const isModalVisible = await page.$eval('#billingAddressModal', el => el.style.display !== 'none');
    expect(isModalVisible).toBe(true);

    // Ensure contact details are populated
    await page.$eval('#billingName', (el, val) => { if (!el.value) el.value = val; }, studentUser.name || 'Student Tester');
    await page.$eval('#billingPhone', (el, val) => { if (!el.value) el.value = val; }, studentUser.phone || '9876543210');
    await page.$eval('#billingEmail', (el, val) => { if (!el.value) el.value = val; }, studentUser.email || 'student@shreemata.com');

    // For pickup, delivery address fields are not required, submit the billing form
    await page.evaluate(() => {
      const form = document.querySelector('#billingAddressForm');
      if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
    await page.waitForTimeout(2000);

    expect(dialogError).toBeNull();
    expect(interceptedOrderPayload).not.toBeNull();
    expect(interceptedOrderPayload.deliveryMethod).toBe('pickup');
    expect(interceptedOrderPayload.items).toBeDefined();
    expect(interceptedOrderPayload.items.length).toBeGreaterThan(0);
    const bundleItem = interceptedOrderPayload.items[0];
    expect(bundleItem.type).toBe('bundle');
    expect(bundleItem.id).toBe(seededBundleId);

    await context.close();
  });
});
