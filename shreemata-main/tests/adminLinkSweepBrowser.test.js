/**
 * tests/adminLinkSweepBrowser.test.js
 *
 * Comprehensive Real-Browser Sweep Suite verifying Admin Dashboard link isolation
 * across ALL customer pages on mobile phone (375x667) and desktop (1280x800) viewports:
 *
 * 1. Logged-in customer (role: "user"): Admin Dashboard text and href are count 0 in the DOM and 0 visible.
 * 2. Role missing / undefined: count 0 in the DOM and 0 visible.
 * 3. Logged out / guest: count 0 in the DOM and 0 visible.
 * 4. Admin role (role: "admin"): exactly 1 visible link pointing to "/admin.html" where the user menu is rendered.
 * 5. CSS preservation: on mobile viewport, visible menu items (My Account, My Orders, Wallet & Cashback,
 *    Referral Network, VIP Master Card, Logout) are displayed with display: flex.
 *
 * Zero page errors across all scenarios.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');

const customerPages = [
  { file: 'index.html', path: '/index.html', hasUserMenu: true },
  { file: 'account.html', path: '/account.html', hasUserMenu: true },
  { file: 'book.html', path: '/book.html?id=book_sweep_test', hasUserMenu: true },
  { file: 'bundle.html', path: '/bundle.html?id=bundle_sweep_test', hasUserMenu: true },
  { file: 'bundles.html', path: '/bundles.html', hasUserMenu: true },
  { file: 'cart.html', path: '/cart.html', hasUserMenu: true },
  { file: 'commission-history.html', path: '/commission-history.html', hasUserMenu: true },
  { file: 'notes.html', path: '/notes.html', hasUserMenu: true },
  { file: 'orders.html', path: '/orders.html', hasUserMenu: true },
  { file: 'reader.html', path: '/reader.html?id=note_sweep_test', hasUserMenu: true },
  { file: 'referral.html', path: '/referral.html', hasUserMenu: true },
  { file: 'video-player.html', path: '/video-player.html?id=video_sweep_test', hasUserMenu: true },
  { file: 'track-order.html', path: '/track-order.html', hasUserMenu: false }
];

jest.setTimeout(120000);

describe('Admin Link Sweep: All Customer Pages on Phone & Desktop', () => {
  let app;
  let server;
  let baseUrl;
  let browser;

  let normalUser, normalToken;
  let adminUser, adminToken;

  beforeAll(async () => {
    await setupTestDB();
    process.env.JWT_SECRET = 'test_jwt_secret_sweep_secure';

    const hashedPassword = await bcrypt.hash('password123', 10);

    normalUser = await User.create({
      name: 'Regular Customer',
      email: 'customer.sweep@shreemata.com',
      password: hashedPassword,
      role: 'user',
      isVerified: true
    });
    normalToken = jwt.sign(
      { id: normalUser._id, email: normalUser.email, role: normalUser.role },
      process.env.JWT_SECRET
    );

    adminUser = await User.create({
      name: 'Platform Administrator',
      email: 'admin.sweep@shreemata.com',
      password: hashedPassword,
      role: 'admin',
      isVerified: true
    });
    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET
    );

    app = express();
    app.use(express.json());

    // Fallback for static images
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    app.get(/\.(png|jpg|jpeg|gif|webp|svg)$/i, (req, res, next) => {
      const realPath = path.join(REPO_DIR, 'public', req.path);
      if (fs.existsSync(realPath)) return next();
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(transparentPng);
    });

    // Fallback for missing CSS
    app.get(/\.css$/i, (req, res, next) => {
      const realPath = path.join(REPO_DIR, 'public', req.path);
      if (fs.existsSync(realPath)) return next();
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('');
    });

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // API endpoints seeded to allow pages to render cleanly
    app.get('/api/users/profile', (req, res) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.includes(adminToken)) {
        return res.json({ user: { _id: adminUser._id.toString(), name: adminUser.name, email: adminUser.email, role: 'admin' } });
      }
      res.json({ user: { _id: normalUser._id.toString(), name: normalUser.name, email: normalUser.email, role: 'user' } });
    });

    app.get('/api/features', (req, res) => res.json({ success: true, features: { readNotes: true } }));
    app.get('/api/cart', (req, res) => res.json({ items: [] }));
    app.get('/api/notifications', (req, res) => res.json({ notifications: [] }));
    app.get('/api/notifications/check-offers', (req, res) => res.json({ offers: [] }));
    app.get('/api/store-details', (req, res) => res.json({ name: 'Shree Mata' }));
    app.get('/api/home-settings', (req, res) => res.json({ heroBanners: [], sections: [] }));
    app.get('/api/shipping-settings', (req, res) => res.json({ shippingFee: 0, freeShippingThreshold: 500 }));
    app.get('/api/admin/commission-settings', (req, res) => res.json({ settings: {} }));

    // Book & Bundle endpoints
    app.get('/api/books', (req, res) => res.json({ books: [], total: 0 }));
    app.get('/api/books/subjects', (req, res) => res.json({ classes: [], subjects: [] }));
    app.get('/api/books/search', (req, res) => res.json({ books: [], total: 0 }));
    app.get('/api/books/:id', (req, res) => res.json({
      book: {
        _id: req.params.id,
        title: 'Sample Curriculum Book',
        author: 'Publisher Author',
        price: 299,
        discountPrice: 249,
        stock: 50,
        images: ['/images/placeholder.png'],
        description: 'Complete syllabus and study material.'
      }
    }));
    app.get('/api/bundles', (req, res) => res.json({ bundles: [] }));
    app.get('/api/bundles/:id', (req, res) => res.json({
      bundle: {
        _id: req.params.id,
        title: 'Complete Standard Bundle',
        price: 999,
        books: []
      }
    }));

    // Notes, Reader & Video endpoints
    app.get('/api/notes', (req, res) => res.json({ notes: [], total: 0, page: 1, totalPages: 1 }));
    app.get('/api/notes/:id', (req, res) => res.json({
      note: {
        _id: req.params.id,
        title: 'Advanced Mathematics Lecture Note',
        subject: 'Mathematics',
        classLevel: 'Class 10',
        section: 'notes',
        previewPages: 3,
        totalPages: 25,
        isFree: false
      },
      access: { hasFullAccess: false, previewOnly: true }
    }));
    app.get('/api/notes/:id/stream', (req, res) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(Buffer.from('%PDF-1.4 sample pdf content'));
    });
    app.get('/api/notes/:id/media-url', (req, res) => res.json({ url: 'https://example.com/video.mp4' }));
    app.get('/api/subscriptions/pricing', (req, res) => res.json({ plans: [] }));

    // Orders & Commissions
    app.get('/api/orders', (req, res) => res.json([]));
    app.get('/api/referral/details', (req, res) => res.json({ referralCode: 'REF123', totalEarned: 0 }));
    app.get('/api/referral/commissions', (req, res) => res.json({ commissions: [], totalEarned: 0, pagination: { total: 0 } }));

    // Serve static public assets
    app.use(express.static(path.join(REPO_DIR, 'public')));

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await teardownTestDB();
  });

  function setupConsoleTracking(page) {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message || String(err)));
    return { pageErrors };
  }

  async function mockExternalCDNs(page) {
    await page.route('https://checkout.razorpay.com/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Razorpay = function(){};' });
    });
    await page.route('https://cdnjs.cloudflare.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.pdfjsLib = {
            GlobalWorkerOptions: {},
            getDocument: () => ({
              promise: Promise.resolve({
                numPages: 5,
                getPage: () => Promise.resolve({
                  getViewport: () => ({ width: 600, height: 800 }),
                  render: () => ({ promise: Promise.resolve() })
                })
              })
            })
          };
        `
      });
    });
  }

  test('1. Role "user": Admin link is completely absent from DOM (count 0) and not visible on phone (375x667) & desktop (1280x800) across all pages', async () => {
    for (const pageConfig of customerPages) {
      for (const viewport of [{ name: 'phone', width: 375, height: 667 }, { name: 'desktop', width: 1280, height: 800 }]) {
        const page = await browser.newPage();
        const { pageErrors } = setupConsoleTracking(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockExternalCDNs(page);

        await page.addInitScript(({ token, user }) => {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
        }, {
          token: normalToken,
          user: {
            _id: normalUser._id.toString(),
            name: normalUser.name,
            email: normalUser.email,
            role: 'user'
          }
        });

        await page.goto(`${baseUrl}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);

        // Dismiss transient full-screen loading modals (e.g. stateModal in reader)
        await page.evaluate(() => {
          const sm = document.getElementById('stateModal');
          if (sm) sm.style.display = 'none';
        });

        // Open user menu if present
        const menuBtn = page.locator('#userMenuBtn, .user-name-badge, .user-menu-trigger');
        if (await menuBtn.count() > 0 && await menuBtn.first().isVisible()) {
          await menuBtn.first().click();
          await page.waitForTimeout(100);
        }

        // Open mobile drawer if present
        const mobileToggle = page.locator('#mobileMenuToggle');
        if (await mobileToggle.count() > 0 && await mobileToggle.first().isVisible()) {
          await mobileToggle.first().click();
          await page.waitForTimeout(100);
        }

        // Assert strictly zero Admin Dashboard references in DOM
        const textCount = await page.locator('text="Admin Dashboard"').count();
        expect(textCount).toBe(0);

        const hrefCount = await page.locator('a[href="/admin.html"], a[href="admin.html"], a[href*="admin-dashboard"]').count();
        expect(hrefCount).toBe(0);

        const idCount = await page.locator('#adminLink, #drawerAdminLink').count();
        expect(idCount).toBe(0);

        expect(pageErrors).toEqual([]);
        await page.close();
      }
    }
  });

  test('2. Role missing / undefined: Admin link is completely absent from DOM (count 0) on phone & desktop across all pages', async () => {
    for (const pageConfig of customerPages) {
      for (const viewport of [{ name: 'phone', width: 375, height: 667 }, { name: 'desktop', width: 1280, height: 800 }]) {
        const page = await browser.newPage();
        const { pageErrors } = setupConsoleTracking(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockExternalCDNs(page);

        await page.addInitScript(({ token }) => {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify({ name: 'Role Missing User', email: 'norole@test.com' }));
        }, { token: normalToken });

        await page.goto(`${baseUrl}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
          const sm = document.getElementById('stateModal');
          if (sm) sm.style.display = 'none';
        });

        const menuBtn = page.locator('#userMenuBtn, .user-name-badge, .user-menu-trigger');
        if (await menuBtn.count() > 0 && await menuBtn.first().isVisible()) {
          await menuBtn.first().click();
          await page.waitForTimeout(100);
        }

        const textCount = await page.locator('text="Admin Dashboard"').count();
        expect(textCount).toBe(0);

        const hrefCount = await page.locator('a[href="/admin.html"], a[href="admin.html"], a[href*="admin-dashboard"]').count();
        expect(hrefCount).toBe(0);

        const idCount = await page.locator('#adminLink, #drawerAdminLink').count();
        expect(idCount).toBe(0);

        expect(pageErrors).toEqual([]);
        await page.close();
      }
    }
  });

  test('3. Logged out / guest: Admin link is completely absent from DOM (count 0) on phone & desktop across all pages', async () => {
    for (const pageConfig of customerPages) {
      for (const viewport of [{ name: 'phone', width: 375, height: 667 }, { name: 'desktop', width: 1280, height: 800 }]) {
        const page = await browser.newPage();
        const { pageErrors } = setupConsoleTracking(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockExternalCDNs(page);

        await page.addInitScript(() => {
          localStorage.clear();
        });

        await page.goto(`${baseUrl}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
          const sm = document.getElementById('stateModal');
          if (sm) sm.style.display = 'none';
        });

        const mobileToggle = page.locator('#mobileMenuToggle');
        if (await mobileToggle.count() > 0 && await mobileToggle.first().isVisible()) {
          await mobileToggle.first().click();
          await page.waitForTimeout(100);
        }

        const textCount = await page.locator('text="Admin Dashboard"').count();
        expect(textCount).toBe(0);

        const hrefCount = await page.locator('a[href="/admin.html"], a[href="admin.html"], a[href*="admin-dashboard"]').count();
        expect(hrefCount).toBe(0);

        const idCount = await page.locator('#adminLink, #drawerAdminLink').count();
        expect(idCount).toBe(0);

        expect(pageErrors).toEqual([]);
        await page.close();
      }
    }
  });

  test('4. Role "admin": exactly 1 visible Admin link on pages where the user menu is rendered', async () => {
    for (const pageConfig of customerPages.filter(p => p.hasUserMenu)) {
      for (const viewport of [{ name: 'phone', width: 375, height: 667 }, { name: 'desktop', width: 1280, height: 800 }]) {
        const page = await browser.newPage();
        const { pageErrors } = setupConsoleTracking(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockExternalCDNs(page);

        await page.addInitScript(({ token, user }) => {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
        }, {
          token: adminToken,
          user: {
            _id: adminUser._id.toString(),
            name: adminUser.name,
            email: adminUser.email,
            role: 'admin'
          }
        });

        await page.goto(`${baseUrl}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
          const sm = document.getElementById('stateModal');
          if (sm) sm.style.display = 'none';
        });

        // Open user menu
        const menuBtn = page.locator('#userMenuBtn, .user-name-badge, .user-menu-trigger');
        await page.waitForSelector('#userLinks', { state: 'visible', timeout: 5000 });
        await menuBtn.first().click();

        // Exactly 1 visible admin link
        const adminLink = page.locator('#adminLink, a[href="/admin.html"]');
        await adminLink.waitFor({ state: 'visible', timeout: 5000 });
        expect(await adminLink.count()).toBe(1);
        expect(await adminLink.isVisible()).toBe(true);

        const href = await adminLink.getAttribute('href');
        expect(href).toBe('/admin.html');

        expect(pageErrors).toEqual([]);
        await page.close();
      }
    }
  });

  test('5. Mobile CSS Verification (375x667): visible customer menu items are displayed on phone', async () => {
    const page = await browser.newPage();
    const { pageErrors } = setupConsoleTracking(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await mockExternalCDNs(page);

    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, {
      token: normalToken,
      user: {
        _id: normalUser._id.toString(),
        name: normalUser.name,
        email: normalUser.email,
        role: 'user'
      }
    });

    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    // Open dropdown
    const menuBtn = page.locator('#userMenuBtn');
    await menuBtn.click();

    // Verify all 6 standard customer menu items are visible and displayed with display: flex
    const customerMenuItems = [
      { id: '#accountLink', label: 'My Account' },
      { id: '#ordersLink', label: 'My Orders' },
      { id: '#dropdownWalletLink', label: 'Wallet & Cashback' },
      { id: '#referralLink', label: 'Referral Network' },
      { id: '#dropdownVipLink', label: 'VIP Master Card' },
      { id: '#logoutBtn', label: 'Logout' }
    ];

    for (const item of customerMenuItems) {
      const el = page.locator(item.id);
      expect(await el.count()).toBe(1);
      await el.waitFor({ state: 'visible', timeout: 5000 });
      expect(await el.isVisible()).toBe(true);

      const computedDisplay = await el.evaluate(node => window.getComputedStyle(node).display);
      expect(computedDisplay).toBe('flex');
    }

    // And verify adminLink is NOT in DOM and NOT visible
    expect(await page.locator('#adminLink').count()).toBe(0);

    expect(pageErrors).toEqual([]);
    await page.close();
  });
});
