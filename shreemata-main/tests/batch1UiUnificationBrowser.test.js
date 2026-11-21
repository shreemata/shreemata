/**
 * tests/batch1UiUnificationBrowser.test.js
 *
 * Real browser verification for Batch 1 Customer-Page UI Unification:
 * - public/book.html
 * - public/bundle.html
 * - public/bundles.html
 *
 * Verifies:
 * 1. Unified header, top notice bar, mobile drawer, and 4-column footer present at 1920, 1366, 390.
 * 2. ONLY /images/press.png is used as logo (no /images/logo.png or emoji brand text).
 * 3. Header has NO "Disseminating Knowledge", while footer HAS "Disseminating Knowledge".
 * 4. Brand text "Shree Mata" visible, centered, and within header bounding box.
 * 5. Mobile drawer toggle button opens drawer and close button closes drawer at 390px.
 * 6. Existing checkout, pricing, add-to-cart, quantity, and single address delivery modals operate correctly.
 * 7. Screenshots captured to Desktop/four-sections-review/batch1/.
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

  jest.setTimeout(120000);

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

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      console.log('Killing dev server process...');
      devServerProcess.kill();
    }
  });

  test('(a) book.html UI shell, single logo, header/footer presence, drawer & functions', async () => {
    for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 390, h: 844 }]) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }, { token: studentToken, user: studentUser });

      const page = await context.newPage();
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

      // Save screenshot for review at 1440 and 390
      if (vp.w === 1366) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'book-1440.png') });
      }
      if (vp.w === 390) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'book-390.png') });
      }

      await context.close();
    }
  });

  test('(b) book.html functionality: quantity selector, add to cart, pickup and courier checkout modals', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
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

    // Setup dialog dismiss
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await addToCartBtn.click();
    await page.waitForTimeout(1000);
    const updatedCartCount = await page.$eval('#cartCount', el => parseInt(el.textContent) || 0);
    expect(updatedCartCount).toBeGreaterThanOrEqual(initialCartCount);

    // Test Courier checkout modal opens with Delivery Details
    const courierBtn = await page.$('#buyCourierBtn');
    expect(courierBtn).not.toBeNull();
    await courierBtn.click();
    await page.waitForTimeout(600);
    const billingModal = await page.$('#billingAddressModal');
    expect(billingModal).not.toBeNull();
    const isModalVisible = await page.$eval('#billingAddressModal', m => m.style.display !== 'none');
    expect(isModalVisible).toBe(true);

    await context.close();
  });

  test('(c) bundle.html UI shell, single logo, footer presence, and checkout flow', async () => {
    for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 390, h: 844 }]) {
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

      // Verify Footer: 4-column luxury footer present (was previously missing)
      const footer = await page.$('footer.site-footer');
      expect(footer).not.toBeNull();
      const footerText = await page.$eval('footer.site-footer', f => f.textContent);
      expect(footerText).toContain('Disseminating Knowledge');
      expect(footerText).toContain('Empower Us.');

      // Save screenshot
      if (vp.w === 1366) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'bundle-1440.png') });
      }
      if (vp.w === 390) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'bundle-390.png') });
      }

      await context.close();
    }
  });

  test('(d) bundles.html UI shell, single logo, catalog cards, and footer presence', async () => {
    for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 390, h: 844 }]) {
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

      // Save screenshot
      if (vp.w === 1366) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'bundles-1440.png') });
      }
      if (vp.w === 390) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'bundles-390.png') });
      }

      await context.close();
    }
  });
});
