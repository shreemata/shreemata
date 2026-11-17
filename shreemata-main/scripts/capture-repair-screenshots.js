/**
 * capture-repair-screenshots.js
 * Playwright script to launch dev server, log in as admin, open admin-orders.html,
 * click "Repair ₹0 commission", view preview modal, confirm repair, and capture screenshots.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const screenshotDir = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/commission-repair';
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

async function run() {
  console.log('🚀 Launching dev-run-four-sections server...');
  process.env.FLAGS = 'on';

  const serverProc = spawn('node', ['scripts/dev-run-four-sections.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLAGS: 'on' },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', (d) => process.stdout.write('[DevServer] ' + d));
  serverProc.stderr.on('data', (d) => process.stderr.write('[DevServer ERR] ' + d));

  try {
    await waitForServer('http://127.0.0.1:3100');
    console.log('✅ Dev server is up at http://127.0.0.1:3100');

    console.log('🌐 Launching Chrome browser via Playwright...');
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: true
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });
    const page = await context.newPage();
    page.on('console', msg => console.log('[Page Console]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('[Page Error]', err.message));
    page.on('dialog', async (dialog) => {
      console.log(`[Browser Dialog] ${dialog.type()}: ${dialog.message()}`);
      await dialog.accept();
    });

    // 1. Authenticate as Admin via API
    console.log('🔑 Authenticating as admin via API...');
    const loginData = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ email: 'admin@shreemata.com', password: 'DemoPass123!' });
      const req = http.request('http://127.0.0.1:3100/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse login response: ' + body));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    if (!loginData.token) {
      throw new Error('Admin login failed: ' + JSON.stringify(loginData));
    }
    console.log('✅ Admin login succeeded, token acquired.');

    // Set token & user in browser localStorage
    await page.goto('http://127.0.0.1:3100/login.html');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: loginData.token, user: loginData.user });

    // 2. Open admin orders page
    console.log('📋 Navigating to admin-orders.html...');
    await page.goto('http://127.0.0.1:3100/admin-orders.html');
    await page.waitForSelector('#ordersTableBody tr', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 3. Find the repair button on the orders table
    console.log('🔍 Locating "Repair ₹0 commission" button...');
    const repairBtn = await page.waitForSelector('.btn-repair-zero-profit', { timeout: 10000 });
    expectExists(repairBtn, 'Repair button found on orders table');

    // Screenshot 1: Orders Table with Repair Button
    const shot1Path = path.join(screenshotDir, '01_orders_table_repair_button.png');
    await page.screenshot({ path: shot1Path, fullPage: false });
    console.log(`📸 Saved screenshot 1: ${shot1Path}`);

    // 4. Click the "Repair ₹0 commission" button
    console.log('🖱️ Clicking "Repair ₹0 commission" button...');
    await repairBtn.click();

    // Wait for the modal and preview content to appear
    await page.waitForSelector('#repairContentState[style*="display: block"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Screenshot 2: Preview Modal with calculated breakdown
    const shot2Path = path.join(screenshotDir, '02_repair_preview_modal.png');
    await page.screenshot({ path: shot2Path, fullPage: false });
    console.log(`📸 Saved screenshot 2: ${shot2Path}`);

    // 5. Click "Confirm Repair" button
    console.log('🖱️ Clicking "Confirm Repair" button...');
    const confirmBtn = await page.waitForSelector('#btnConfirmRepairCommission', { timeout: 5000 });
    await confirmBtn.click();

    // Wait for the result area to display success
    await page.waitForSelector('#repairResultArea[style*="display: block"]', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Screenshot 3: Result of repair completed
    const shot3Path = path.join(screenshotDir, '03_repair_completed_result.png');
    await page.screenshot({ path: shot3Path, fullPage: false });
    console.log(`📸 Saved screenshot 3: ${shot3Path}`);

    await browser.close();
    console.log('🎉 Browser automation completed successfully!');

  } finally {
    console.log('🛑 Stopping dev server...');
    serverProc.kill('SIGTERM');
  }
}

function expectExists(val, msg) {
  if (!val) throw new Error('Expected element not found: ' + msg);
  console.log('   ✓ ' + msg);
}

run().catch((err) => {
  console.error('❌ Error during browser check:', err);
  process.exit(1);
});
