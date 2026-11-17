/**
 * capture-checkout-screenshots.js
 * Playwright script to launch local review server, navigate to cart with courier delivery,
 * trigger inline address validation errors, fill valid address, and show payment success popup.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const screenshotDir = 'C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/checkout-address';
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

    // 1. Authenticate as admin/customer to get auth token
    console.log('🔑 Authenticating user...');
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
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Failed to parse login: ' + body));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    console.log('✅ Token acquired successfully');

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 950 }
    });
    const page = await context.newPage();

    // Set auth and cart in browser localStorage
    await page.goto('http://127.0.0.1:3100/cart.html');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: loginData.token, user: loginData.user });

    // Open the cart address modal directly
    console.log('👉 Opening Cart Billing & Delivery Details modal...');
    await page.evaluate(() => {
      if (typeof showCartBillingAddressModal === 'function') {
        showCartBillingAddressModal();
      }
    });
    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // Clear all address inputs to trigger inline validation errors
    console.log('🧹 Clearing address fields to trigger validation errors...');
    await page.fill('#cartBillingName', '');
    await page.fill('#cartBillingPhone', '');
    await page.fill('#cartBillingAddress1', '');
    await page.fill('#cartBillingTaluk', '');
    await page.fill('#cartBillingState', '');
    await page.fill('#cartBillingPincode', '');

    // Submit the form with empty fields
    const submitBtn = await page.$('#cartBillingAddressForm button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }
    await page.waitForTimeout(600);

    // Screenshot 1: Courier delivery empty address inline error with focused field
    const screenshot1Path = path.join(screenshotDir, '01-courier-empty-address-inline-error.png');
    await page.screenshot({ path: screenshot1Path, fullPage: false });
    console.log(`📸 Screenshot 1 saved to ${screenshot1Path}`);

    // Fill in valid address fields
    console.log('✍️ Entering complete valid courier delivery address...');
    await page.fill('#cartBillingName', 'Suresh Kumar');
    await page.fill('#cartBillingPhone', '9876543210');
    await page.fill('#cartBillingAddress1', 'Plot 42, 2nd Cross, Vidyanagar');
    await page.fill('#cartBillingTaluk', 'Hubballi');
    await page.fill('#cartBillingDistrict', 'Dharwad');
    await page.fill('#cartBillingState', 'Karnataka');
    await page.fill('#cartBillingPincode', '580020');
    await page.waitForTimeout(500);

    // Screenshot 2: Valid address entered
    const screenshot2Path = path.join(screenshotDir, '02-courier-valid-address-entered.png');
    await page.screenshot({ path: screenshot2Path, fullPage: false });
    console.log(`📸 Screenshot 2 saved to ${screenshot2Path}`);

    // Trigger payment success popup
    console.log('🎉 Displaying payment success popup...');
    await page.evaluate(() => {
      if (typeof closeCartBillingAddressModal === 'function') {
        closeCartBillingAddressModal();
      }
      if (typeof showSuccessPopup === 'function') {
        showSuccessPopup({
          orderId: 'pay_SM_20261117_984501',
          mongoOrderId: '673891000000000000000001',
          items: 1,
          amount: 380,
          deliveryMethod: 'Courier Delivery',
          paymentMethod: 'Online Payment',
          processing: false
        });
      }
    });
    await page.waitForSelector('#successPopupModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(600);

    // Screenshot 3: Payment success popup
    const screenshot3Path = path.join(screenshotDir, '03-payment-success-popup.png');
    await page.screenshot({ path: screenshot3Path, fullPage: false });
    console.log(`📸 Screenshot 3 saved to ${screenshot3Path}`);

    console.log('✅ All 3 screenshots captured successfully!');
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
