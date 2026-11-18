/**
 * capture-profit-screenshots.js
 * Playwright script to launch local review server, navigate to admin and admin-bundles pages,
 * and capture high-resolution screenshots for review:
 * 1. Book form profit section
 * 2. Set form profit section next to it
 * 3. Preview with ₹20
 * 4. Blocked Save
 * 5. 'Sell without commission' checkbox
 * 6. Red badge
 * 7. Quick 'Set profit' action
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const screenshotDir = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/profit-required';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

function waitForServer(url, timeoutMs = 45000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server did not respond at ${url} within ${timeoutMs}ms`));
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

function postJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const parsed = new URL(url);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('🚀 Launching dev-run-four-sections server...');
  const serverProc = spawn('node', ['scripts/dev-run-four-sections.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLAGS: 'on' },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', (d) => process.stdout.write('[DevServer] ' + d));
  serverProc.stderr.on('data', (d) => process.stderr.write('[DevServer ERR] ' + d));

  let browser;
  try {
    await waitForServer('http://127.0.0.1:3100');
    console.log('✅ Dev server is up at http://127.0.0.1:3100');

    // 1. Authenticate as admin
    console.log('🔑 Authenticating admin...');
    const loginRes = await postJson('http://127.0.0.1:3100/api/login', {
      email: 'admin@shreemata.com',
      password: 'DemoPass123!'
    });

    const token = loginRes.data.token;
    const user = loginRes.data.user;
    console.log('✅ Admin token acquired');

    // Seed demo books and bundle with profit values to demonstrate badge and table states
    console.log('🌱 Seeding demo items for review...');
    // Book with zero profit (legacy)
    const zeroBookRes = await postJson('http://127.0.0.1:3100/api/books', {
      title: 'Class 9 Kannada Bhasha Deepa (Profit Not Set)',
      author: 'Shree Mata Editorial Board',
      price: 180,
      physicalPrice: 180,
      sellingPrice: 180,
      zeroCommission: true,
      cover_image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400'
    }, token);

    // Book with fixed profit 20
    const fixedBookRes = await postJson('http://127.0.0.1:3100/api/books', {
      title: 'Class 10 Mathematics Standard Edition (₹20 Profit)',
      author: 'Dr. S. K. Narayan',
      price: 240,
      physicalPrice: 240,
      sellingPrice: 240,
      profitType: 'fixed',
      profitValue: 20,
      cover_image: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777f?w=400'
    }, token);

    // Create a Bundle for sets page
    const bookIds = [
      zeroBookRes.data?.book?._id,
      fixedBookRes.data?.book?._id
    ].filter(Boolean);

    let createdBundle = null;
    if (bookIds.length > 0) {
      const bundleRes = await postJson('http://127.0.0.1:3100/api/bundles/admin/create', {
        name: 'Complete High School Practice Set (Class 9 & 10)',
        description: 'Comprehensive 2-book subject set for secondary students.',
        bookIds,
        bundlePrice: 380,
        zeroCommission: true
      }, token);
      createdBundle = bundleRes.data?.bundle;
      console.log('✅ Bundle created:', createdBundle?.name);
    }

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }
    });
    const page = await context.newPage();

    // Set localStorage auth
    await page.goto('http://127.0.0.1:3100/admin.html');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token, user });

    // Reload admin.html to initialize as admin
    await page.goto('http://127.0.0.1:3100/admin.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Open add book form if collapsed
    await page.evaluate(() => {
      const form = document.getElementById('addBookForm');
      if (form) form.style.display = 'block';
      if (typeof resetForm === 'function') resetForm();
    });
    await page.waitForTimeout(500);

    // 1. Screenshot 1: Book form profit section
    console.log('📸 Capturing Screenshot 1: Book Form Profit Section...');
    const bookSectionEl = await page.$('#bookProfitSectionContainer');
    if (bookSectionEl) {
      await bookSectionEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await bookSectionEl.screenshot({
        path: path.join(screenshotDir, '01-book-form-profit-section.png')
      });
      console.log('✅ Screenshot 1 saved');
    }

    // 2. Screenshot 4: Blocked Save on new item when profit is 0 and checkbox unchecked
    console.log('📸 Capturing Screenshot 4: Blocked Save on new item...');
    await page.fill('#price', '200');
    await page.fill('#adminProfitValue', '0');
    await page.evaluate(() => {
      const chk = document.getElementById('adminZeroCommission');
      if (chk) chk.checked = false;
      if (window.bookProfitController) window.bookProfitController.updateUI();
    });
    await page.waitForTimeout(400);

    const formActionsEl = await page.$('.form-actions');
    const saveNoticeEl = await page.$('#adminSaveBlockNotice');
    if (saveNoticeEl) await saveNoticeEl.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDir, '04-blocked-save.png'),
      fullPage: false
    });
    console.log('✅ Screenshot 4 saved');

    // 3. Screenshot 3: Live preview with ₹20 profit
    console.log('📸 Capturing Screenshot 3: Preview with ₹20 profit...');
    await page.fill('#adminProfitValue', '20');
    await page.evaluate(() => {
      if (window.bookProfitController) window.bookProfitController.updateUI();
    });
    await page.waitForTimeout(500);

    const previewBoxEl = await page.$('#adminProfitPreviewBox');
    if (previewBoxEl) {
      await previewBoxEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await previewBoxEl.screenshot({
        path: path.join(screenshotDir, '03-preview-with-20.png')
      });
      console.log('✅ Screenshot 3 saved');
    }

    // 4. Screenshot 5: 'Sell without commission' checkbox checked
    console.log('📸 Capturing Screenshot 5: Sell without commission checkbox...');
    await page.fill('#adminProfitValue', '0');
    await page.check('#adminZeroCommission');
    await page.evaluate(() => {
      if (window.bookProfitController) window.bookProfitController.updateUI();
    });
    await page.waitForTimeout(400);

    if (bookSectionEl) {
      await bookSectionEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await bookSectionEl.screenshot({
        path: path.join(screenshotDir, '05-sell-without-commission-checkbox.png')
      });
      console.log('✅ Screenshot 5 saved');
    }

    // 5. Screenshot 6: Red badge on book with profit 0 in table
    console.log('📸 Capturing Screenshot 6: Red warning badge in admin table...');
    const tableEl = await page.$('#booksTable');
    if (tableEl) {
      await tableEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await tableEl.screenshot({
        path: path.join(screenshotDir, '06-red-badge.png')
      });
      console.log('✅ Screenshot 6 saved');
    }

    // 6. Screenshot 7: Quick 'Set profit' action modal
    console.log('📸 Capturing Screenshot 7: Quick Set profit action modal...');
    const setProfitBtn = await page.$('.set-profit-btn');
    if (setProfitBtn) {
      await setProfitBtn.click();
      await page.waitForSelector('#quickProfitModal', { state: 'visible', timeout: 5000 });
      await page.fill('#quickProfitValue', '25');
      await page.waitForTimeout(600);

      const modalContent = await page.$('#quickProfitModal .modal-content');
      if (modalContent) {
        await modalContent.screenshot({
          path: path.join(screenshotDir, '07-quick-set-profit-action.png')
        });
        console.log('✅ Screenshot 7 saved');
      }

      // Close modal
      await page.evaluate(() => {
        const btn = document.getElementById('closeQuickProfitBtn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(300);
    }

    // 7. Screenshot 2: Set form profit section in admin-bundles.html
    console.log('📸 Capturing Screenshot 2: Set Form Profit Section...');
    await page.goto('http://127.0.0.1:3100/admin-bundles.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Click Create Bundle to open modal
    const createBundleBtn = await page.$('#createBundleBtn');
    if (createBundleBtn) {
      await createBundleBtn.click();
      await page.waitForSelector('#bundleModal', { state: 'visible', timeout: 5000 });
      await page.fill('#bundlePrice', '350');
      await page.fill('#bundleProfitValue', '20');
      await page.evaluate(() => {
        if (window.bundleProfitController) window.bundleProfitController.updateUI();
      });
      await page.waitForTimeout(600);

      const bundleProfitSectionEl = await page.$('#bundleProfitSectionContainer');
      if (bundleProfitSectionEl) {
        await bundleProfitSectionEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await bundleProfitSectionEl.screenshot({
          path: path.join(screenshotDir, '02-set-form-profit-section.png')
        });
        console.log('✅ Screenshot 2 saved');
      }
    }

    console.log('🎉 ALL 7 SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (browser) await browser.close();
    serverProc.kill('SIGINT');
    setTimeout(() => serverProc.kill('SIGKILL'), 3000);
  }
}

run().catch((err) => {
  console.error('Fatal error during screenshot capture:', err);
  process.exit(1);
});
