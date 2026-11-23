/**
 * tests/pickupSavingsConsistencyBrowser.test.js
 *
 * Verifies that the "You save ₹X" note in the Store Pickup delivery option
 * shows the exact same savings amount:
 * 1. On first load with Store Pickup preselected.
 * 2. After toggling Courier -> Store Pickup.
 * 3. After changing item quantity.
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

describe('Pickup Savings Note Consistency Browser Test', () => {
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

  test('Pickup savings note shows consistent savings on initial load, toggle, and qty change', async () => {
    const initialCart = [
      {
        id: 'seeded_book_1',
        title: 'Seeded Test Book',
        author: 'Author One',
        price: 250,
        quantity: 1,
        weight: 0.5,
        isBundle: false
      },
      {
        id: 'seeded_bundle_1',
        bundleId: 'seeded_bundle_1',
        title: 'Seeded Test Bundle',
        price: 450,
        quantity: 1,
        weight: 1.0,
        isBundle: true,
        books: []
      }
    ];

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ cart }) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('cart_guest', JSON.stringify(cart));
      // Pre-select pickup
      localStorage.setItem('selectedDeliveryMethod', 'pickup');
    }, { cart: initialCart });

    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3100/cart.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#cartLayout', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);

    // 1. Check pickup savings on initial load (with pickup selected)
    const pickupRadio = await page.waitForSelector('input[name="deliveryMethod"][value="pickup"]');
    await pickupRadio.check();
    await page.waitForTimeout(600);

    const initialSavingsText = await page.$eval('#pickupSavings', el => el.textContent.trim());
    expect(Number(initialSavingsText)).toBeGreaterThan(0);

    // 2. Switch to Courier, then back to Store Pickup
    const homeRadio = await page.waitForSelector('input[name="deliveryMethod"][value="home"]');
    await homeRadio.check();
    await page.waitForTimeout(600);

    const courierChargeText = await page.$eval('#homeDeliveryCharge', el => el.textContent.trim());
    expect(courierChargeText).toBe(initialSavingsText);

    await pickupRadio.check();
    await page.waitForTimeout(600);

    const toggledSavingsText = await page.$eval('#pickupSavings', el => el.textContent.trim());
    expect(toggledSavingsText).toBe(initialSavingsText);

    // 3. Change quantity with stepper and verify updated savings is consistent across fields
    const plusBtn = await page.waitForSelector('.qty-btn[data-action="plus"]');
    await plusBtn.click();
    await page.waitForTimeout(800);

    const updatedPickupSavings = await page.$eval('#pickupSavings', el => el.textContent.trim());
    const updatedHomeCharge = await page.$eval('#homeDeliveryCharge', el => el.textContent.trim());
    expect(updatedPickupSavings).toBe(updatedHomeCharge);

    await context.close();
  }, 60000);
});
