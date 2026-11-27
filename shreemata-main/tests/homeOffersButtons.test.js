/**
 * tests/homeOffersButtons.test.js
 *
 * Real browser tests using Playwright verifying:
 * (i) With NO active notification:
 *     - Header "Offers" link scrolls to fallback section (#booksSection) and is in viewport
 *     - Footer "Offers" link scrolls to fallback section and is in viewport
 *     - Mobile-menu "Offers" link closes drawer, scrolls to fallback section and is in viewport
 * (ii) With active notification:
 *     - Header "Offers" link scrolls to #notificationsSection and is in viewport
 * (iii) Popup offer:
 *     - "×" close button hides drop-up notification
 *     - With 2 offers, previous / next / dots change title, message, counter ("1 of 2" <-> "2 of 2")
 * (iv) Zero page errors (page.on('pageerror')) and zero console errors (console.error) across all flows
 */

const http = require('http');
const path = require('path');
const express = require('express');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

jest.setTimeout(60000);

describe('Home Page Offers Navigation and Controls', () => {
  let app;
  let server;
  let baseUrl;
  let browser;

  // Mutable mock state for tests
  let mockNotifications = [];
  let mockBundles = [];
  let mockHomeSettings = { showBundles: false };
  const mockBooks = [
    { _id: 'b1', title: 'Mathematics Book 1', class: 'Class 10', subject: 'Mathematics', price: 250, originalPrice: 300, stock: 50, rewardPoints: 20 },
    { _id: 'b2', title: 'Science Book 1', class: 'Class 10', subject: 'Science', price: 280, originalPrice: 350, stock: 30, rewardPoints: 25 },
    { _id: 'b3', title: 'English Literature', class: 'Class 10', subject: 'English', price: 200, originalPrice: 220, stock: 40, rewardPoints: 15 },
    { _id: 'b4', title: 'Social Studies', class: 'Class 10', subject: 'Social Science', price: 220, originalPrice: 250, stock: 25, rewardPoints: 10 },
    { _id: 'b5', title: 'Kannada Sahitya', class: 'Class 10', subject: 'Kannada', price: 180, originalPrice: 200, stock: 35, rewardPoints: 10 },
    { _id: 'b6', title: 'Hindi Vyakaran', class: 'Class 10', subject: 'Hindi', price: 190, originalPrice: 210, stock: 20, rewardPoints: 10 }
  ];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Favicon handler
    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // API endpoints
    app.get('/api/home-settings', (req, res) => res.json(mockHomeSettings));
    app.get('/api/notifications', (req, res) => res.json({ notifications: mockNotifications }));
    app.get('/api/bundles', (req, res) => res.json({ bundles: mockBundles }));
    app.get('/api/books', (req, res) => res.json({ books: mockBooks, total: mockBooks.length, page: 1, totalPages: 1 }));
    app.get('/api/categories', (req, res) => res.json({ categories: [] }));
    app.get('/api/features', (req, res) => res.json({}));
    app.get('/api/cart', (req, res) => res.json({ items: [] }));
    app.use('/api', (req, res) => res.json({}));

    // Static assets
    app.use(express.static(path.join(REPO_DIR, 'public')));

    // Fallback for missing images to avoid 404 network errors in console
    const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    app.get(/\.(png|jpg|jpeg|gif|webp|svg)$/i, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(transparentPng);
    });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  async function createTrackedPage(viewport = { width: 1280, height: 800 }) {
    const page = await browser.newPage();
    await page.setViewportSize(viewport);

    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', err => {
      pageErrors.push(err.message || String(err));
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Mock external CDN images (cloudinary, etc.) with transparent 1x1 image
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('cloudinary.com') || url.includes('placeholder.com')) {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
        });
      }
      route.continue();
    });

    return { page, pageErrors, consoleErrors };
  }

  test('(i) With NO active notification: Header, Footer, and Mobile-menu Offers links smooth-scroll to fallback section in viewport', async () => {
    mockNotifications = [];
    mockBundles = [];
    mockHomeSettings = { showBundles: false };

    const { page, pageErrors, consoleErrors } = await createTrackedPage();

    try {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#booksGrid .book-card', { timeout: 10000 });

      // Ensure notification section is hidden
      const notifDisplay = await page.evaluate(() => {
        const el = document.getElementById('notificationsSection');
        return el ? window.getComputedStyle(el).display : 'missing';
      });
      expect(notifDisplay).toBe('none');

      // 1. Header Offers Link
      const initialScroll = await page.evaluate(() => window.scrollY);
      expect(initialScroll).toBe(0);

      // Real click on desktop header Offers link
      await page.click('.header-nav-links a[href$="#notificationsSection"]');
      await page.waitForFunction(() => window.scrollY > 0, { timeout: 5000 });
      await page.waitForTimeout(600); // Allow smooth scroll animation to settle

      const headerScrollY = await page.evaluate(() => window.scrollY);
      expect(headerScrollY).toBeGreaterThan(0);

      const headerTargetInViewport = await page.evaluate(() => {
        const el = document.getElementById('booksSection');
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });
      expect(headerTargetInViewport).toBe(true);

      // 2. Footer Offers Link
      // Scroll to bottom near footer first
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);

      const scrollAtFooter = await page.evaluate(() => window.scrollY);
      expect(scrollAtFooter).toBeGreaterThan(headerScrollY);

      // Real click on footer Offers link
      await page.click('footer a[href$="#notificationsSection"]');
      await page.waitForFunction((prev) => window.scrollY < prev - 100, scrollAtFooter, { timeout: 5000 });
      await page.waitForTimeout(600); // Allow smooth scroll animation to settle

      const footerScrollY = await page.evaluate(() => window.scrollY);
      expect(footerScrollY).not.toBe(scrollAtFooter);

      const footerTargetInViewport = await page.evaluate(() => {
        const el = document.getElementById('booksSection');
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });
      expect(footerTargetInViewport).toBe(true);

      // 3. Mobile-menu Offers Link
      await page.setViewportSize({ width: 375, height: 667 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);

      const mobileStartScroll = await page.evaluate(() => window.scrollY);
      expect(mobileStartScroll).toBe(0);

      // Open mobile drawer
      await page.click('#mobileMenuToggle');
      await page.waitForSelector('#mobileNavDrawer.is-open, #mobileNavDrawer.open', { timeout: 5000 });

      // Click mobile drawer Offers link
      await page.click('#mobileNavDrawer a[href$="#notificationsSection"]');

      // Drawer must close
      await page.waitForFunction(() => {
        const drawer = document.getElementById('mobileNavDrawer');
        return !drawer.classList.contains('is-open') && !drawer.classList.contains('open');
      }, { timeout: 5000 });

      // Page must scroll to booksSection
      await page.waitForFunction(() => window.scrollY > 0, { timeout: 5000 });
      await page.waitForTimeout(600);

      const mobileScrollY = await page.evaluate(() => window.scrollY);
      expect(mobileScrollY).toBeGreaterThan(0);

      const mobileTargetInViewport = await page.evaluate(() => {
        const el = document.getElementById('booksSection');
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });
      expect(mobileTargetInViewport).toBe(true);

      // Verify zero errors
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  test('(ii) With active notification: Offers link scrolls to #notificationsSection and is within viewport', async () => {
    mockNotifications = [
      {
        _id: 'n1',
        type: 'offer',
        title: 'Diwali Special Offer',
        message: 'Get 20% off on all school curriculum books!',
        offerDetails: { minAmount: 500, discountValue: 20, discountType: 'percentage' }
      }
    ];
    mockBundles = [];
    mockHomeSettings = { showBundles: false };

    const { page, pageErrors, consoleErrors } = await createTrackedPage({ width: 1280, height: 800 });

    try {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#notificationsSection .editorial-offer-banner', { timeout: 10000 });

      // Check notification section is visible
      const notifDisplay = await page.evaluate(() => {
        const el = document.getElementById('notificationsSection');
        return el ? window.getComputedStyle(el).display : 'none';
      });
      expect(notifDisplay).toBe('block');

      const initialScroll = await page.evaluate(() => window.scrollY);
      expect(initialScroll).toBe(0);

      // Click header Offers link
      await page.click('.header-nav-links a[href$="#notificationsSection"]');
      await page.waitForFunction(() => window.scrollY > 0, { timeout: 5000 });
      await page.waitForTimeout(600);

      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);

      // #notificationsSection must be within viewport
      const notifInViewport = await page.evaluate(() => {
        const el = document.getElementById('notificationsSection');
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });
      expect(notifInViewport).toBe(true);

      // Verify zero errors
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  test('(iii) Popup offer: next/previous/dots cycle 2 offers with exact titles, messages, and counter ("1 of 2" <-> "2 of 2"), and "×" close button hides popup', async () => {
    mockNotifications = [
      {
        _id: 'offer1',
        type: 'offer',
        title: 'Summer Book Fest',
        message: 'Special summer discount on all book packages',
        offerDetails: { minAmount: 400, discountValue: 15, discountType: 'percentage' }
      },
      {
        _id: 'offer2',
        type: 'discount',
        title: 'Combo Mega Savings',
        message: 'Fixed discount on bulk orders',
        offerDetails: { minAmount: 1000, discountValue: 150, discountType: 'fixed' }
      }
    ];
    mockBundles = [];
    mockHomeSettings = { showBundles: false };

    const { page, pageErrors, consoleErrors } = await createTrackedPage({ width: 1280, height: 800 });

    try {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });

      // Wait for dropup notification to show and dots to be visible
      await page.waitForSelector('#dropupNotification.show', { timeout: 10000 });
      await page.waitForSelector('#dropupDots .dropup-dot', { timeout: 10000 });

      // Verify initial Offer 1 state
      const title1 = await page.textContent('#dropupOfferTitle');
      const counter1 = await page.textContent('#dropupOfferCounter');
      const msg1 = await page.textContent('#dropupOfferMessage');
      expect(title1).toBe('Summer Book Fest');
      expect(counter1).toBe('1 of 2');
      expect(msg1).toBe('Buy above ₹400 and get 15% off!');

      const dot0Active = await page.evaluate(() => {
        const dots = document.querySelectorAll('#dropupDots .dropup-dot');
        return dots[0] && dots[0].classList.contains('active') && !dots[1].classList.contains('active');
      });
      expect(dot0Active).toBe(true);

      // Click "Next" offer button
      await page.click('#dropupNavigation button[onclick="nextOffer()"]');

      // Verify Offer 2 state
      const title2 = await page.textContent('#dropupOfferTitle');
      const counter2 = await page.textContent('#dropupOfferCounter');
      const msg2 = await page.textContent('#dropupOfferMessage');
      expect(title2).toBe('Combo Mega Savings');
      expect(counter2).toBe('2 of 2');
      expect(msg2).toBe('Buy above ₹1000 and get ₹150 off!');

      const dot1Active = await page.evaluate(() => {
        const dots = document.querySelectorAll('#dropupDots .dropup-dot');
        return dots[1] && dots[1].classList.contains('active') && !dots[0].classList.contains('active');
      });
      expect(dot1Active).toBe(true);

      // Click "Previous" offer button
      await page.click('#dropupNavigation button[onclick="previousOffer()"]');

      // Verify returned to Offer 1
      const titleBack = await page.textContent('#dropupOfferTitle');
      const counterBack = await page.textContent('#dropupOfferCounter');
      expect(titleBack).toBe('Summer Book Fest');
      expect(counterBack).toBe('1 of 2');

      // Click Dot 2 directly
      await page.click('#dropupDots .dropup-dot:nth-child(2)');

      // Verify Offer 2 again via dot click
      const titleDot = await page.textContent('#dropupOfferTitle');
      const counterDot = await page.textContent('#dropupOfferCounter');
      expect(titleDot).toBe('Combo Mega Savings');
      expect(counterDot).toBe('2 of 2');

      // Click "×" close button
      await page.click('#dropupNotification button.dropup-close');

      // Verify dropup is hidden (.show removed)
      const hasShowClass = await page.evaluate(() => {
        const el = document.getElementById('dropupNotification');
        return el ? el.classList.contains('show') : true;
      });
      expect(hasShowClass).toBe(false);

      // Verify zero errors
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  test('(iv) Zero page errors and zero console errors occur during initial page load', async () => {
    mockNotifications = [];
    mockBundles = [];
    mockHomeSettings = { showBundles: false };

    const { page, pageErrors, consoleErrors } = await createTrackedPage({ width: 1280, height: 800 });

    try {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
