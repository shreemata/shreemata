/**
 * tests/cartTotalOrderPayloadParity.test.js
 *
 * Real-click test proving that for seeded book + bundle, the cart total shown
 * on screen strictly equals the amount sent to create-order / create-pending
 * for both Courier and Store Pickup.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

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

function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, res => {
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() - start > timeoutMs) reject(new Error(`Server at ${url} did not start within ${timeoutMs}ms`));
      else setTimeout(ping, 500);
    }
    ping();
  });
}

describe('Cart Displayed Total vs Order Creation Payload Parity', () => {
  let devServerProcess = null;
  let browser = null;

  beforeAll(async () => {
    const isUp = await checkPortOpen(3100);
    if (!isUp) {
      console.log('Starting dev server on port 3100...');
      devServerProcess = spawn('node', ['scripts/dev-run-four-sections.js'], {
        cwd: REPO_DIR,
        stdio: 'pipe',
        windowsHide: true
      });
      await waitForServer('http://127.0.0.1:3100/');
    }

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true
    });
  }, 90000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (devServerProcess) {
      devServerProcess.kill();
    }
  });

  test('1. Courier mode: Cart displayed grand total strictly equals amount sent to payments/create-order', async () => {
    const bookPrice = 250;
    const bundlePrice = 450;
    const initialCart = [
      { id: 'b_test_1', title: 'Test Book', author: 'Author A', price: bookPrice, quantity: 1, weight: 0.5, isBundle: false },
      { id: 'bd_test_1', bundleId: 'bd_test_1', title: 'Test Bundle', price: bundlePrice, quantity: 1, weight: 1.0, isBundle: true, books: [] }
    ];

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ cart }) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('cart_guest', JSON.stringify(cart));
      localStorage.setItem('token', 'fake_test_token_123');
      localStorage.setItem('user', JSON.stringify({ _id: 'u_123', name: 'Tester', email: 'test@example.com' }));
    }, { cart: initialCart });

    const page = await context.newPage();

    let interceptedPayload = null;
    await page.route('**/payments/create-order*', async route => {
      interceptedPayload = JSON.parse(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: { id: 'order_123', amount: (interceptedPayload.amount || 0) * 100 },
          key: 'rzp_test_mock'
        })
      });
    });

    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);

    const courierRadio = await page.waitForSelector('input[name="deliveryMethod"][value="home"]');
    await courierRadio.check();
    await page.waitForTimeout(600);

    const displayedCourierTotalText = await page.$eval('.summary-row.total-row .cart-line-total-amount, .summary-row.total-row span:last-child', el => el.textContent.trim());
    const matchCourier = displayedCourierTotalText.match(/[0-9]+(\.[0-9]+)?/);
    const displayedCourierTotal = parseFloat(matchCourier[0]);

    await page.click('#checkoutBtn');
    await page.waitForSelector('#cartBillingAddressModal', { state: 'visible', timeout: 5000 });
    await page.fill('#cartBillingName', 'Student Tester');
    await page.fill('#cartBillingPhone', '9845163604');
    await page.fill('#cartBillingEmail', 'test@example.com');
    await page.fill('#cartBillingAddress1', 'Vidyanagar');
    await page.fill('#cartBillingAddress2', 'Near BVB');
    await page.fill('#cartBillingTaluk', 'Hubballi');
    await page.fill('#cartBillingDistrict', 'Dharwad');
    await page.fill('#cartBillingState', 'Karnataka');
    await page.fill('#cartBillingPincode', '580021');
    await page.click('#cartBillingAddressForm button[type="submit"]');

    await page.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 5000 });
    await page.click('button[onclick="proceedWithCartOnlinePayment()"]');
    await page.waitForTimeout(1000);

    expect(interceptedPayload).not.toBeNull();
    expect(interceptedPayload.deliveryMethod).toBe('home');
    expect(interceptedPayload.amount).toBe(displayedCourierTotal);
    await context.close();
  }, 60000);

  test('2. Pickup mode: Cart displayed grand total strictly equals amount sent to payments/create-order', async () => {
    const bookPrice = 250;
    const bundlePrice = 450;
    const initialCart = [
      { id: 'b_test_1', title: 'Test Book', author: 'Author A', price: bookPrice, quantity: 1, weight: 0.5, isBundle: false },
      { id: 'bd_test_1', bundleId: 'bd_test_1', title: 'Test Bundle', price: bundlePrice, quantity: 1, weight: 1.0, isBundle: true, books: [] }
    ];

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ cart }) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('cart_guest', JSON.stringify(cart));
      localStorage.setItem('token', 'fake_test_token_123');
      localStorage.setItem('user', JSON.stringify({ _id: 'u_123', name: 'Tester', email: 'test@example.com' }));
    }, { cart: initialCart });

    const page = await context.newPage();

    let interceptedPayload = null;
    await page.route('**/payments/create-order*', async route => {
      interceptedPayload = JSON.parse(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: { id: 'order_123', amount: (interceptedPayload.amount || 0) * 100 },
          key: 'rzp_test_mock'
        })
      });
    });

    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });
    const pickupRadio = await page.waitForSelector('input[name="deliveryMethod"][value="pickup"]');
    await pickupRadio.check();
    await page.waitForTimeout(600);

    const displayedPickupTotalText = await page.$eval('.summary-row.total-row .cart-line-total-amount, .summary-row.total-row span:last-child', el => el.textContent.trim());
    const matchPickup = displayedPickupTotalText.match(/[0-9]+(\.[0-9]+)?/);
    const displayedPickupTotal = parseFloat(matchPickup[0]);
    expect(displayedPickupTotal).toBe(bookPrice + bundlePrice);

    await page.evaluate(() => {
      window.cartBillingAddress = {
        name: 'Student Tester',
        phone: '9845163604',
        email: 'test@example.com'
      };
    });
    await page.click('#checkoutBtn');
    await page.waitForSelector('#cartPaymentMethodModal', { state: 'visible', timeout: 8000 });
    await page.click('button[onclick="proceedWithCartOnlinePayment()"]');
    await page.waitForTimeout(1000);

    expect(interceptedPayload).not.toBeNull();
    expect(interceptedPayload.deliveryMethod).toBe('pickup');
    expect(interceptedPayload.amount).toBe(displayedPickupTotal);
    await context.close();
  }, 60000);
});
