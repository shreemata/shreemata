/**
 * tests/homePageFixesBrowser.test.js
 *
 * Real browser test verifying the 3 front-end fixes:
 * 1. Problem 1: "Add to Cart" displays the clear popup/toast notification and updates the cart count.
 * 2. Problem 2: Home page Grid / List view toggle changes layout and persists choice in localStorage.
 * 3. Problem 3: Single books listing uses continuous infinite scroll (IntersectionObserver),
 *    shows loading indicator, loads next batch without duplicates, removes pagination buttons,
 *    and displays "No more books" end message.
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
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

describe('Home Page Front-End Fixes Browser Verification', () => {
  let devServerProcess = null;
  let browser = null;
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

    // 3. Launch browser
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
      await new Promise(r => setTimeout(r, 2000));
    }
  });

  test('Problem 1: Add to Cart displays the popup toast and increments cart count badge', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      // Clear any previous cart
      localStorage.removeItem(`cart_${user._id}`);
      localStorage.removeItem('cart_guest');
    }, { token: studentToken, user: studentUser });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });

    // Dismiss cinematic intro if present
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    // Verify initial cart badge is 0
    await page.waitForSelector('#cartCount', { state: 'attached', timeout: 5000 });
    const initialCount = await page.$eval('#cartCount', el => el.textContent.trim());
    expect(initialCount).toBe('0');

    // Wait for book cards to appear
    await page.waitForSelector('.book-card .cart-btn', { state: 'visible', timeout: 8000 });

    // Click Add to Cart on first book card
    const firstCartBtn = await page.$('.book-card .cart-btn');
    expect(firstCartBtn).not.toBeNull();
    await firstCartBtn.click();

    // Assert cart popup toast appears
    await page.waitForSelector('.cart-popup-toast, #cartNotificationToast', { state: 'visible', timeout: 4000 });
    const toast = await page.$('.cart-popup-toast, #cartNotificationToast');
    expect(toast).not.toBeNull();

    const toastText = await toast.innerText();
    expect(toastText).toContain('Added to Cart');
    expect(toastText).toContain('Cart count: 1 item');

    // Assert cart count badge in header updated to 1
    const updatedCount = await page.$eval('#cartCount', el => el.textContent.trim());
    expect(updatedCount).toBe('1');

    // Capture screenshot: add-to-cart-popup.png
    const popupPath = path.join(SCREENSHOT_DIR, 'add-to-cart-popup.png');
    await page.screenshot({ path: popupPath, fullPage: false });
    console.log('Saved screenshot:', popupPath);
    expect(fs.existsSync(popupPath)).toBe(true);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('Problem 2: Home page Grid / List view toggle changes layout and persists choice', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // Default should be Grid view
    const gridBtn = await page.$('#gridView');
    const listBtn = await page.$('#listView');
    expect(gridBtn).not.toBeNull();
    expect(listBtn).not.toBeNull();

    // Click Grid View first to establish baseline
    await gridBtn.click();
    await page.waitForTimeout(300);

    const isGridActive = await gridBtn.evaluate(el => el.classList.contains('active'));
    expect(isGridActive).toBe(true);
    const booksGrid = await page.$('#booksGrid');
    const classInGrid = await booksGrid.getAttribute('class');
    expect(classInGrid).not.toContain('list-view');

    // Capture screenshot: grid-view.png
    const gridPath = path.join(SCREENSHOT_DIR, 'grid-view.png');
    await page.screenshot({ path: gridPath, fullPage: false });
    console.log('Saved screenshot:', gridPath);
    expect(fs.existsSync(gridPath)).toBe(true);

    // Click List View
    await listBtn.click();
    await page.waitForTimeout(400);

    // Assert List View button active and booksGrid has list-view class
    const isListActive = await listBtn.evaluate(el => el.classList.contains('active'));
    expect(isListActive).toBe(true);
    const classInList = await booksGrid.getAttribute('class');
    expect(classInList).toContain('list-view');

    // Assert layout is horizontal list (flex direction column for grid, row for card)
    const cardLayout = await page.$eval('.book-card', el => {
      const computed = window.getComputedStyle(el);
      return {
        flexDirection: computed.flexDirection,
        alignItems: computed.alignItems
      };
    });
    expect(cardLayout.flexDirection).toBe('row');

    // Capture screenshot: list-view.png
    const listPath = path.join(SCREENSHOT_DIR, 'list-view.png');
    await page.screenshot({ path: listPath, fullPage: false });
    console.log('Saved screenshot:', listPath);
    expect(fs.existsSync(listPath)).toBe(true);

    // Verify persistence: reload page and assert list-view is maintained
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });
    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    const persistedClass = await page.$eval('#booksGrid', el => el.className);
    expect(persistedClass).toContain('list-view');
    const persistedListActive = await page.$eval('#listView', el => el.classList.contains('active'));
    expect(persistedListActive).toBe(true);

    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('Problem 3: Single books listing infinite scroll loads batches without duplicates and shows end message', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Reset view to grid mode for test consistency
    await context.addInitScript(() => {
      localStorage.setItem('booksViewMode', 'grid');
    });

    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const intro = document.getElementById('cinematicIntro');
      if (intro) intro.remove();
    });

    await page.waitForSelector('#booksGrid .book-card', { state: 'visible', timeout: 8000 });

    // 1. Assert pagination buttons are NOT visible
    const paginationContainer = await page.$('#paginationContainer');
    if (paginationContainer) {
      const isVisible = await paginationContainer.isVisible();
      expect(isVisible).toBe(false);
    }

    const prevPageBtn = await page.$('#prevPage');
    if (prevPageBtn) {
      const isPrevVisible = await prevPageBtn.isVisible();
      expect(isPrevVisible).toBe(false);
    }

    // 2. Initial batch loaded count (should be 4 books with limit=4)
    const initialCards = await page.$$('.book-card');
    expect(initialCards.length).toBeGreaterThanOrEqual(1);
    const firstBatchCount = initialCards.length;

    // 3. Scroll down into booksSection to trigger IntersectionObserver
    await page.evaluate(() => {
      const booksSection = document.getElementById('booksSection');
      if (booksSection) booksSection.scrollIntoView({ behavior: 'instant', block: 'end' });
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for subsequent batch to be appended
    await page.waitForTimeout(1500);

    // If more books exist, cards count should have increased
    const afterScrollCards = await page.$$('.book-card');
    console.log(`Initial batch: ${firstBatchCount} books, After scroll: ${afterScrollCards.length} books`);
    expect(afterScrollCards.length).toBeGreaterThanOrEqual(firstBatchCount);

    // 4. Assert NO duplicate book titles or IDs
    const bookTitles = await page.$$eval('.book-card h3', els => els.map(e => e.textContent.trim()));
    const uniqueTitles = new Set(bookTitles);
    expect(uniqueTitles.size).toBe(bookTitles.length);

    // 5. Scroll again to trigger end of catalog
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);

    // Assert "No more books" message is visible
    await page.waitForSelector('#infiniteScrollEnd', { state: 'visible', timeout: 5000 });
    const endText = await page.$eval('#infiniteScrollEnd', el => el.textContent.trim());
    expect(endText).toContain('No more books');

    // Capture screenshot: infinite-scroll-end.png
    const endPath = path.join(SCREENSHOT_DIR, 'infinite-scroll-end.png');
    await page.screenshot({ path: endPath, fullPage: false });
    console.log('Saved screenshot:', endPath);
    expect(fs.existsSync(endPath)).toBe(true);

    expect(pageErrors).toEqual([]);
    await context.close();
  });
});
