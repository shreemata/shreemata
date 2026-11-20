/**
 * tests/homePageFixesBrowser.test.js
 *
 * Real browser tests verifying all home page fixes:
 * (a) Search returns the right books and resets the list (screenshot: search-results.png)
 * (b) Class filter
 * (c) Subject filter
 * (d) Scroll to load page 2, change filter -> list resets to first batch of new filter, no leftovers, counter resets (screenshot: filter-reset-after-scroll.png)
 * (e) Failure: 500 response on /api/books -> "Failed to load more books." with Retry -> click Retry -> loads without duplicates (screenshot: infinite-scroll-retry.png)
 * (f) Add to Cart toast and cart badge on single book page (book.html)
 * (g) Add to Cart toast and cart badge on single bundle page (bundle.html)
 * (h) Stale response race from item 3 (delayed older response is ignored when filter changes)
 * (i) Exact multiple of 12 case (24 books terminate after batch 2 without a 3rd request)
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/home-fixes';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function checkPortOpen(port) {
  return new Promise((resolve) => {
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
      http.get(url, (res) => {
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
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiGet(pathName) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3100${pathName}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ raw: body }); }
      });
    }).on('error', reject);
  });
}

describe('Home Page Fixes Comprehensive Browser Verification', () => {
  let devServerProcess = null;
  let browser = null;
  let studentToken = null;
  let studentUser = null;
  let sampleBookId = null;
  let sampleBundleId = null;

  jest.setTimeout(120000);

  beforeAll(async () => {
    // 1. Ensure dev server on port 3100 is running via tests/devServerRunner.js
    const isRunning = await checkPortOpen(3100);
    if (!isRunning) {
      console.log('Starting devServerRunner.js on port 3100...');
      devServerProcess = spawn('node', ['tests/devServerRunner.js'], {
        cwd: REPO_DIR,
        stdio: 'pipe'
      });
      devServerProcess.stdout.on('data', (d) => console.log(`[server] ${d}`));
      devServerProcess.stderr.on('data', (d) => console.error(`[server err] ${d}`));
      await waitForServer('http://127.0.0.1:3100/');
      console.log('Dev server ready on http://127.0.0.1:3100');
    }

    // 2. Log in as student
    const loginRes = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    studentToken = loginRes.token;
    studentUser = loginRes.user;

    // 3. Fetch sample book and bundle IDs
    const booksRes = await apiGet('/api/books?limit=1');
    if (booksRes.books && booksRes.books.length > 0) {
      sampleBookId = booksRes.books[0]._id || booksRes.books[0].id;
    }

    const bundlesRes = await apiGet('/api/bundles');
    if (Array.isArray(bundlesRes) && bundlesRes.length > 0) {
      sampleBundleId = bundlesRes[0]._id || bundlesRes[0].id;
    } else if (bundlesRes.bundles && bundlesRes.bundles.length > 0) {
      sampleBundleId = bundlesRes.bundles[0]._id || bundlesRes.bundles[0].id;
    }

    // 4. Launch browser
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (devServerProcess) {
      devServerProcess.kill();
      await new Promise((r) => setTimeout(r, 2000));
    }
  });

  async function createCleanPage() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (studentToken && studentUser) {
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        const uid = user ? (user._id || user.id) : null;
        if (uid) localStorage.removeItem(`cart_${uid}`);
        localStorage.removeItem('cart_guest');
        localStorage.setItem('booksViewMode', 'grid');
      }, { token: studentToken, user: studentUser });
    }
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    return { context, page, pageErrors };
  }

  test('(a) Search returns the right books and resets the list (saves screenshot search-results.png)', async () => {
    const { context, page, pageErrors } = await createCleanPage();
    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // Type search term into search input
    const searchInput = await page.$('#searchInput');
    expect(searchInput).not.toBeNull();
    await searchInput.fill('Science Master');

    // Submit search via Enter or click search button
    const searchBtn = await page.$('#searchBtn, .search-btn, button[onclick*="performSearch"]');
    if (searchBtn) {
      await searchBtn.click();
    } else {
      await searchInput.press('Enter');
    }

    // Wait for search results
    await page.waitForTimeout(1000);
    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    const titles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    expect(titles.length).toBeGreaterThanOrEqual(1);
    titles.forEach((title) => {
      expect(title.toLowerCase()).toContain('science');
    });

    // Save screenshot: search-results.png
    const screenshotPath = path.join(SCREENSHOT_DIR, 'search-results.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Saved screenshot (a):', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(b) Class filter resets list and loads only selected class', async () => {
    const { context, page, pageErrors } = await createCleanPage();
    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // Filter by Class 5
    await page.selectOption('#classFilter', '5');
    await page.waitForTimeout(1000);
    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    const titles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    expect(titles.length).toBe(12);
    titles.forEach((title) => {
      expect(title).toContain('Class 5');
    });

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(c) Subject filter resets list and loads only selected subject', async () => {
    const { context, page, pageErrors } = await createCleanPage();
    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // Filter by Science
    await page.selectOption('#subjectFilter', 'Science');
    await page.waitForTimeout(1000);
    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    const titles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    expect(titles.length).toBe(12);
    titles.forEach((title) => {
      expect(title).toContain('Science');
    });

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(d) Scroll to load page 2, change filter -> resets to first batch of new filter, no leftovers, counter back to page 1 (screenshot: filter-reset-after-scroll.png)', async () => {
    const { context, page, pageErrors } = await createCleanPage();
    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // Set Class 10 (24 books total)
    await page.selectOption('#classFilter', '10');
    await page.waitForTimeout(1000);

    const initialCards = await page.$$('#booksGrid .book-card');
    expect(initialCards.length).toBe(12);

    // Scroll to sentinel to load page 2
    await page.evaluate(() => {
      const sentinel = document.getElementById('infiniteScrollSentinel');
      if (sentinel) sentinel.scrollIntoView({ behavior: 'instant', block: 'end' });
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(1500);
    const pagedCards = await page.$$('#booksGrid .book-card');
    expect(pagedCards.length).toBe(24);

    // Now change filter to Class 5 (12 books)
    await page.selectOption('#classFilter', '5');
    await page.waitForTimeout(1200);

    const newFilterCards = await page.$$('#booksGrid .book-card');
    expect(newFilterCards.length).toBe(12);

    const newFilterTitles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    newFilterTitles.forEach((title) => {
      expect(title).toContain('Class 5');
      expect(title).not.toContain('Class 10');
    });

    // Save screenshot: filter-reset-after-scroll.png
    const screenshotPath = path.join(SCREENSHOT_DIR, 'filter-reset-after-scroll.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Saved screenshot (d):', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(e) Failure: make /api/books return 500 for one request, check "Failed to load more books." with Retry, click Retry, loads without duplicates (screenshot: infinite-scroll-retry.png)', async () => {
    const { context, page, pageErrors } = await createCleanPage();

    let failPage2Once = true;
    await page.route('**/api/books?*page=2*', async (route) => {
      if (failPage2Once) {
        failPage2Once = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated 500 server error' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });
    const batch1Count = (await page.$$('#booksGrid .book-card')).length;
    expect(batch1Count).toBe(12);

    // Scroll to trigger page 2
    await page.evaluate(() => {
      const sentinel = document.getElementById('infiniteScrollSentinel');
      if (sentinel) sentinel.scrollIntoView({ behavior: 'instant', block: 'end' });
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Verify error UI is displayed with Retry button
    await page.waitForSelector('#infiniteScrollError', { state: 'visible', timeout: 5000 });
    const errText = await page.$eval('#infiniteScrollError', (el) => el.innerText);
    expect(errText).toContain('Failed to load more books.');

    const retryBtn = await page.$('#retryInfiniteScrollBtn');
    expect(retryBtn).not.toBeNull();

    // Save screenshot: infinite-scroll-retry.png
    const screenshotPath = path.join(SCREENSHOT_DIR, 'infinite-scroll-retry.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Saved screenshot (e):', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);

    // Click Retry
    await retryBtn.click();
    await page.waitForTimeout(1500);

    // Verify error UI hidden and batch 2 loaded
    const isErrVisible = await page.$eval('#infiniteScrollError', (el) => window.getComputedStyle(el).display !== 'none');
    expect(isErrVisible).toBe(false);

    const totalCards = await page.$$('#booksGrid .book-card');
    expect(totalCards.length).toBe(24);

    // Verify no duplicates
    const allTitles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    const uniqueTitles = new Set(allTitles);
    expect(uniqueTitles.size).toBe(totalCards.length);

    await context.close();
  });

  test('(f) Add to Cart toast and cart badge on single book page (book.html)', async () => {
    expect(sampleBookId).not.toBeNull();
    const { context, page, pageErrors } = await createCleanPage();

    await page.goto(`http://127.0.0.1:3100/book.html?id=${sampleBookId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bookDetails', { state: 'visible', timeout: 8000 });

    // Click Add to Cart
    await page.waitForSelector('#addToCartBtn, .cart-btn', { state: 'visible', timeout: 8000 });
    const cartBtn = await page.$('#addToCartBtn, .cart-btn');
    expect(cartBtn).not.toBeNull();
    await cartBtn.click();

    // Assert toast appears with Added to Cart & Cart count badge
    await page.waitForSelector('.cart-popup-toast, #cartNotificationToast', { state: 'visible', timeout: 5000 });
    const toast = await page.$('.cart-popup-toast, #cartNotificationToast');
    const toastText = await toast.innerText();
    expect(toastText).toMatch(/Added to Cart|Cart Updated/i);
    expect(toastText).toMatch(/Cart count:\s*1\s*item/i);

    // Verify item saved in user cart
    const cartItems = await page.evaluate(() => {
      if (typeof getCart === 'function') return getCart();
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const uid = user ? (user._id || user.id) : null;
      const key = uid ? `cart_${uid}` : 'cart_guest';
      return JSON.parse(localStorage.getItem(key) || '[]');
    });
    expect(cartItems.length).toBe(1);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(g) Add to Cart toast and cart badge on single bundle page (bundle.html)', async () => {
    expect(sampleBundleId).not.toBeNull();
    const { context, page, pageErrors } = await createCleanPage();

    await page.goto(`http://127.0.0.1:3100/bundle.html?id=${sampleBundleId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bundleContent', { state: 'visible', timeout: 8000 });

    // Click Add to Cart on bundle page
    await page.waitForSelector('button[onclick*="addToCartOnly"]', { state: 'visible', timeout: 8000 });
    const addToCartBtn = await page.$('button[onclick*="addToCartOnly"]');
    expect(addToCartBtn).not.toBeNull();
    await addToCartBtn.click();

    // Assert toast appears with Cart Updated / Added to Cart & Cart count badge
    await page.waitForSelector('.cart-popup-toast, #cartNotificationToast', { state: 'visible', timeout: 5000 });
    const toast = await page.$('.cart-popup-toast, #cartNotificationToast');
    const toastText = await toast.innerText();
    expect(toastText).toMatch(/Added to Cart|Cart Updated/i);
    expect(toastText).toMatch(/Cart count:\s*1\s*item/i);

    // Verify cart storage updated
    const cartItems = await page.evaluate(() => {
      if (typeof getCart === 'function') return getCart();
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const uid = user ? (user._id || user.id) : null;
      const key = uid ? `cart_${uid}` : 'cart_guest';
      return JSON.parse(localStorage.getItem(key) || '[]');
    });
    expect(cartItems.length).toBe(1);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('(h) Stale response race: delays first request, changes filter, releases old response -> shows only new filter books', async () => {
    const { context, page, pageErrors } = await createCleanPage();

    let resolveOldRequest = null;
    let oldRequestDelayed = false;

    await page.route('**/api/books?*class=10*', async (route) => {
      oldRequestDelayed = true;
      await new Promise((resolve) => {
        resolveOldRequest = () => {
          route.continue();
          resolve();
        };
      });
    });

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    // Trigger filter for Class 10 (will be held)
    page.selectOption('#classFilter', '10').catch(() => {});
    await page.waitForTimeout(500);
    expect(oldRequestDelayed).toBe(true);

    // Immediately switch filter to Class 5
    await page.selectOption('#classFilter', '5');
    await page.waitForTimeout(1000);

    // Verify Class 5 books are visible
    let currentTitles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    expect(currentTitles.length).toBe(12);
    currentTitles.forEach((t) => expect(t).toContain('Class 5'));

    // Now release the delayed Class 10 response
    if (resolveOldRequest) {
      resolveOldRequest();
    }
    await page.waitForTimeout(1000);

    // Assert that Class 10 books were NOT appended or accepted
    currentTitles = await page.$$eval('#booksGrid .book-card h3', (els) => els.map((e) => e.textContent.trim()));
    expect(currentTitles.length).toBe(12);
    currentTitles.forEach((t) => {
      expect(t).toContain('Class 5');
      expect(t).not.toContain('Class 10');
    });

    await context.close();
  });

  test('(i) Exact-multiple-of-12 case: 24 books show end message after batch 2 without extra request', async () => {
    const { context, page, pageErrors } = await createCleanPage();

    const interceptedRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/books')) {
        interceptedRequests.push(req.url());
      }
    });

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    // Select Class 10 (exactly 24 books)
    await page.selectOption('#classFilter', '10');
    await page.waitForTimeout(1000);

    const batch1Cards = await page.$$('#booksGrid .book-card');
    expect(batch1Cards.length).toBe(12);

    // Scroll to sentinel to load batch 2
    await page.evaluate(() => {
      const sentinel = document.getElementById('infiniteScrollSentinel');
      if (sentinel) sentinel.scrollIntoView({ behavior: 'instant', block: 'end' });
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(1500);

    const batch2Cards = await page.$$('#booksGrid .book-card');
    expect(batch2Cards.length).toBe(24);

    // Assert "No more books" end message is visible
    await page.waitForSelector('#infiniteScrollEnd', { state: 'visible', timeout: 5000 });
    const endText = await page.$eval('#infiniteScrollEnd', (el) => el.textContent.trim());
    expect(endText).toContain('No more books');

    // Scroll again to ensure no further request is triggered
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    // Verify no page=3 request was ever dispatched
    const page3Requests = interceptedRequests.filter((url) => url.includes('page=3'));
    expect(page3Requests.length).toBe(0);

    expect(pageErrors).toEqual([]);
    await context.close();
  });
});
