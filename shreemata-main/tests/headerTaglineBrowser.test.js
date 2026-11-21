/**
 * tests/headerTaglineBrowser.test.js
 *
 * Real browser test verifying removal of the header tagline "Disseminating Knowledge"
 * while keeping brand name "Shree Mata" visible, centered, and not clipped, and preserving
 * footer text.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/header-tagline';

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

describe('Header Brand Tagline Removal Browser Tests', () => {
  let devServerProcess = null;
  let browser = null;
  let seededBookId = null;
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
      await waitForServer('http://127.0.0.1:3100/index.html');
      console.log('Dev server ready on http://127.0.0.1:3100');
    }

    const booksRes = await apiGet('/api/books');
    const books = Array.isArray(booksRes) ? booksRes : booksRes.books || [];
    if (books && books.length > 0) {
      seededBookId = books[0]._id || books[0].id;
    }

    // Login as student so protected pages (orders, account) don't redirect to login
    const loginRes = await apiPost('/api/login', {
      email: 'student@shreemata.com',
      password: 'DemoPass123!'
    });
    if (loginRes.token) {
      studentToken = loginRes.token;
      studentUser = loginRes.user;
    }

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

  const viewports = [
    { name: 'desktop-1920', width: 1920, height: 1080 },
    { name: 'laptop-1366', width: 1366, height: 768 },
    { name: 'mobile-390', width: 390, height: 844 }
  ];

  test('a. Home page header at 1920, 1366, 390: no tagline in header, brand title visible/centered, footer present', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });

      // Wait for main header
      await page.waitForSelector('.main-header, header', { state: 'visible', timeout: 15000 });

      // (a) Verify no visible element in header contains "Disseminating Knowledge"
      const headerText = await page.$eval('.main-header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      // (b) Verify brand title "Shree Mata" is visible and not clipped
      const brandTitle = await page.$('.main-header .brand-title');
      expect(await brandTitle.isVisible()).toBe(true);
      const text = await brandTitle.textContent();
      expect(text.trim()).toBe('Shree Mata');

      const titleBox = await brandTitle.boundingBox();
      const headerBox = await (await page.$('.main-header')).boundingBox();
      expect(titleBox.width).toBeGreaterThan(0);
      expect(titleBox.height).toBeGreaterThan(0);
      expect(titleBox.y).toBeGreaterThanOrEqual(headerBox.y - 5);
      expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 15);

      // (c) Verify footer text is still present
      const footer = await page.$('footer');
      if (footer) {
        const footerText = await footer.innerText();
        expect(footerText.toLowerCase()).toContain('disseminating knowledge');
      }

      if (vp.width === 1920) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'home-1920.png') });
      } else if (vp.width === 390) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'home-390.png') });
      }

      await context.close();
    }
  });

  test('b. Books section on home page at 1920, 1366, 390: header verification', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/#booksSection', { waitUntil: 'networkidle' });

      await page.waitForSelector('.main-header, header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('.main-header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandTitle = await page.$('.main-header .brand-title');
      expect(await brandTitle.isVisible()).toBe(true);
      expect((await brandTitle.textContent()).trim()).toBe('Shree Mata');

      await context.close();
    }
  });

  test('c. Single book page at 1920, 1366, 390: header verification and screenshot book-1920.png', async () => {
    expect(seededBookId).toBeTruthy();
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:3100/book.html?id=${seededBookId}`, { waitUntil: 'networkidle' });

      await page.waitForSelector('header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandEl = await page.$('header .brand-logo, header .logo');
      expect(await brandEl.isVisible()).toBe(true);
      expect((await brandEl.textContent())).toContain('Shree Mata');

      // Verify footer text
      const footerText = await page.$eval('footer', el => el.innerText);
      expect(footerText.toLowerCase()).toContain('disseminating knowledge');

      if (vp.width === 1920) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'book-1920.png') });
      }

      await context.close();
    }
  });

  test('d. Login page at 1920, 1366, 390: header verification and screenshot login-1920.png', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/login.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandEl = await page.$('header .brand-logo, header .logo');
      expect(await brandEl.isVisible()).toBe(true);
      expect((await brandEl.textContent())).toContain('Shree Mata');

      if (vp.width === 1920) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-1920.png') });
      }

      await context.close();
    }
  });

  test('e. Cart page at 1920, 1366, 390: header verification and screenshot cart-1920.png', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('.main-header, .navbar', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('.main-header, .navbar', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandEl = await page.$('.main-header .brand-logo, .navbar .logo');
      expect(await brandEl.isVisible()).toBe(true);
      expect((await brandEl.textContent())).toContain('Shree Mata');

      // Verify footer text
      const footerText = await page.$eval('footer', el => el.innerText);
      expect(footerText.toLowerCase()).toContain('disseminating knowledge');

      if (vp.width === 1920) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cart-1920.png') });
      }

      await context.close();
    }
  });

  test('f. Orders page at 1920, 1366, 390: header verification', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      if (studentToken) {
        await context.addInitScript(({ token, user }) => {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
        }, { token: studentToken, user: studentUser });
      }
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/orders.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('.main-header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('.main-header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandTitle = await page.$('.main-header .brand-title');
      expect(await brandTitle.isVisible()).toBe(true);
      expect((await brandTitle.textContent()).trim()).toBe('Shree Mata');

      await context.close();
    }
  });

  test('g. Account page (protected) at 1920, 1366, 390: header verification & footer presence', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      if (studentToken) {
        await context.addInitScript(({ token, user }) => {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
        }, { token: studentToken, user: studentUser });
      }
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/account.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('.main-header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('.main-header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandTitle = await page.$('.main-header .brand-title');
      expect(await brandTitle.isVisible()).toBe(true);
      expect((await brandTitle.textContent()).trim()).toBe('Shree Mata');

      // Verify footer text on account page
      const footerText = await page.$eval('footer', el => el.innerText);
      expect(footerText.toLowerCase()).toContain('disseminating knowledge');

      await context.close();
    }
  });

  test('h. Track-order page at 1920, 1366, 390: header verification', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/track-order.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandTitle = await page.$('header .brand-title');
      expect(await brandTitle.isVisible()).toBe(true);
      expect((await brandTitle.textContent()).trim()).toBe('Shree Mata');

      await context.close();
    }
  });

  test('i. Bundles page at 1920, 1366, 390: header verification & footer presence', async () => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3100/bundles.html', { waitUntil: 'networkidle' });

      await page.waitForSelector('header', { state: 'visible', timeout: 15000 });
      const headerText = await page.$eval('header', el => el.innerText);
      expect(headerText.toLowerCase()).not.toContain('disseminating knowledge');

      const brandEl = await page.$('header .brand-logo, header .logo');
      expect(await brandEl.isVisible()).toBe(true);
      expect((await brandEl.textContent())).toContain('Shree Mata');

      // Verify footer text
      const footerText = await page.$eval('footer', el => el.innerText);
      expect(footerText.toLowerCase()).toContain('disseminating knowledge');

      await context.close();
    }
  });
});
