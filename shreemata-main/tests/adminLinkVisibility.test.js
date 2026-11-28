/**
 * tests/adminLinkVisibility.test.js
 *
 * Strict Real-Browser Playwright Test Suite for Admin Dashboard Link Visibility & Server Access Enforcement:
 * (i) Normal user with role 'user' -> Admin Dashboard link/element is NOT in the DOM at all (assert count 0 for "Admin Dashboard" and for any href to admin dashboard).
 * (ii) Role undefined / empty / 'Admin' (wrong case) / 'administrator' -> NOT in the DOM (count 0).
 * (iii) Role 'admin' -> exactly 1 link, with href="/admin.html", visible upon menu trigger click, and clickable.
 * (iv) Logged out -> none in DOM (count 0).
 * (v) A user who edits localStorage to role 'admin' in the browser sees the link (UI only),
 *      BUT every server admin call made with their real token returns 403 (testing >= 5 real admin API routes),
 *      and with no token returns 401.
 * (vi) Reproduction on real index.html: OLD global-nav.js leaks #adminLink in DOM with display:flex on mobile due to CSS !important,
 *      whereas NEW global-nav.js removes it completely (count 0).
 * (vii) Stale-data Case (i): Real UI admin logout followed by normal customer login leaves count 0 for #adminLink on index.html.
 * (viii) Stale-data Case (ii): Corrupted or missing role in localStorage user object leaves count 0 for #adminLink on index.html.
 * (ix) Stale-data Case (iii): Visiting /cart.html?demoUser=anything then navigating to index.html does not elevate role to admin; #adminLink count remains 0.
 * (x) Backdoor removal in cart.js: ?demoUser=anything, ?demoUser=admin, and ?demo=1 do NOT write to localStorage and leave existing user/token strictly unchanged.
 *
 * ZERO page errors and ZERO console errors across all test scenarios.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const adminSettingsRoute = require('../routes/adminSettings');
const adminDashboardRoute = require('../routes/adminDashboard');
const orderRoutes = require('../routes/orders');
const adminCommissionFundRoute = require('../routes/adminCommissionFund');
const adminUsersRoute = require('../routes/adminUsers');
const subscriptionsRoute = require('../routes/subscriptions');
const authRoutes = require('../routes/auth');

jest.setTimeout(60000);

describe('Admin Dashboard Link Visibility & Access Enforcement Suite', () => {
  let app;
  let server;
  let baseUrl;
  let browser;

  let normalUser, normalToken;
  let adminUser, adminToken;
  let oldGlobalNavSource;

  const auditedAdminRoutes = [
    { name: 'Admin Settings', path: '/api/admin/settings' },
    { name: 'Admin Class Prices', path: '/api/admin/settings/class-prices' },
    { name: 'Admin Operations Dashboard', path: '/api/admin/dashboard/operations' },
    { name: 'Admin All Orders', path: '/api/admin/orders/admin/all' },
    { name: 'Admin Commission Fund Summary', path: '/api/admin/commission-fund/summary' },
    { name: 'Admin User Management', path: '/api/admin/users' },
    { name: 'Admin Subscription Orders', path: '/api/subscriptions/admin/orders' }
  ];

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = 'test_jwt_secret_admin_link_audit_secure';

    oldGlobalNavSource = execSync('git show 078d67c:shreemata-main/public/js/global-nav.js', {
      cwd: REPO_DIR
    }).toString('utf8');

    // 1. Create real test users in MongoDB with hashed passwords
    const hashedPassword = await bcrypt.hash('password123', 10);

    normalUser = await User.create({
      name: 'Regular Customer',
      email: 'customer@shreemata.com',
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
      email: 'admin@shreemata.com',
      password: hashedPassword,
      role: 'admin',
      isVerified: true
    });
    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET
    );

    // 2. Set up Express application
    app = express();
    app.use(express.json());

    // Fallback for image requests to prevent console noise
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

    // Fallback for CSS requests
    app.get(/\.css$/i, (req, res, next) => {
      const realPath = path.join(REPO_DIR, 'public', req.path);
      if (fs.existsSync(realPath)) return next();
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('');
    });

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // Mount auth routes for login UI testing
    app.use('/api/auth', authRoutes);
    app.use('/api', authRoutes);

    // Mount audited admin routes
    app.use('/api/admin', adminSettingsRoute);
    app.use('/api/admin/dashboard', adminDashboardRoute);
    app.use('/api/admin/orders', authenticateToken, isAdmin, orderRoutes);
    app.use('/api/admin/commission-fund', authenticateToken, isAdmin, adminCommissionFundRoute);
    app.use('/api/admin', adminUsersRoute);
    app.use('/api/subscriptions', subscriptionsRoute);

    // Customer page API mocks
    app.get('/api/users/profile', authenticateToken, (req, res) => {
      res.json({
        user: {
          _id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role
        }
      });
    });
    app.get('/api/features', (req, res) => res.json({ success: true, features: { readNotes: true } }));
    app.get('/api/cart', (req, res) => res.json({ items: [] }));
    app.get('/api/notifications', (req, res) => res.json({ notifications: [] }));
    app.get('/api/notifications/check-offers', (req, res) => res.json({ offers: [] }));
    app.get('/api/bundles', (req, res) => res.json({ bundles: [] }));
    app.get('/api/referral/details', (req, res) => res.json({ referralCode: 'REF123', totalEarned: 0 }));
    app.get('/api/orders', (req, res) => res.json([]));
    app.get('/api/books', (req, res) => res.json({ books: [], total: 0 }));
    app.get('/api/books/search', (req, res) => res.json({ books: [], total: 0 }));
    app.get('/api/books/subjects', (req, res) => res.json({ classes: [], subjects: [] }));
    app.get('/api/admin/commission-settings', (req, res) => res.json({ settings: {} }));
    app.get('/api/home-settings', (req, res) => res.json({ heroBanners: [], sections: [] }));
    app.get('/api/store-details', (req, res) => res.json({ name: 'Shree Mata' }));
    app.get('/api/shipping-settings', (req, res) => res.json({ shippingFee: 0, freeShippingThreshold: 500 }));

    // Real menu test page rendering the exact account menu markup and global-nav.js
    app.get('/menu-test.html', (req, res) => {
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shree Mata - Menu Test</title>
  <link rel="stylesheet" href="/css/site-shell.css">
  <link rel="stylesheet" href="/css/customer-layout.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner container">
      <div class="user-nav-wrap" id="userLinks" style="display: none;">
        <button type="button" class="user-menu-trigger" id="userMenuBtn" aria-expanded="false" aria-haspopup="true">
          <span class="user-avatar-badge">👤</span>
          <span class="user-name-text" id="userName">Account</span>
          <span class="dropdown-caret">▾</span>
        </button>
        <div class="user-dropdown-menu" id="userDropdownMenu" role="menu">
          <div class="dropdown-user-header">
            <span class="dropdown-user-name" id="dropdownUserName">User</span>
            <span class="dropdown-user-email" id="dropdownUserEmail">user@example.com</span>
          </div>
          <div class="dropdown-divider"></div>
          <a href="/account.html" class="dropdown-item-link" id="dropdownAccountLink" role="menuitem">
            <span class="dropdown-item-icon">👤</span> <span>My Account</span>
          </a>
          <a href="/orders.html" class="dropdown-item-link" id="dropdownOrdersLink" role="menuitem">
            <span class="dropdown-item-icon">📦</span> <span>My Orders</span>
          </a>
          <a href="/account.html?section=wallet" class="dropdown-item-link" id="dropdownWalletLink" role="menuitem">
            <span class="dropdown-item-icon">👛</span> <span>Wallet & Cashback</span>
          </a>
          <a href="/referral.html" class="dropdown-item-link" id="referralLink" role="menuitem">
            <span class="dropdown-item-icon">💰</span> <span>Referral Network</span>
          </a>
          <a href="/account.html?section=vip" class="dropdown-item-link" id="dropdownVipLink" role="menuitem">
            <span class="dropdown-item-icon">👑</span> <span>VIP Master Card</span>
          </a>
          <a href="/admin.html" class="dropdown-item-link" id="adminLink" role="menuitem" style="display: none;">
            <span class="dropdown-item-icon">⚙️</span> <span>Admin Dashboard</span>
          </a>
          <div class="dropdown-divider"></div>
          <button type="button" id="logoutBtn" class="btn-logout-item" role="menuitem">
            <span class="dropdown-item-icon">🚪</span> <span>Logout</span>
          </button>
        </div>
      </div>
      <div id="authLinks" style="display: flex;">
        <a href="/login.html" id="loginBtn">Login</a>
      </div>
    </div>
  </header>

  <script src="/js/config.js"></script>
  <script src="/js/global-nav.js"></script>
</body>
</html>`);
    });

    // Static assets from public directory
    app.use(express.static(path.join(REPO_DIR, 'public')));

    // Start server
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Launch Chromium browser
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

  function setupPageConsoleTracking(page, allowExpected403 = false) {
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', err => {
      pageErrors.push(err.message || String(err));
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (allowExpected403 && (text.includes('403') || text.includes('401') || text.includes('Forbidden') || text.includes('Unauthorized'))) {
          // Expected 403 / 401 response from server enforcement tests
          return;
        }
        consoleErrors.push(text);
      }
    });

    return { pageErrors, consoleErrors };
  }

  test('(i) Normal user with role "user" -> Admin Dashboard link is NOT in the DOM at all', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

    // Seed localStorage with normal user credentials
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

    await page.goto(`${baseUrl}/menu-test.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    // Assert "Admin Dashboard" text does NOT exist in the DOM at all
    const textMatches = await page.locator('text="Admin Dashboard"').count();
    expect(textMatches).toBe(0);

    // Assert any href pointing to admin dashboard does NOT exist in the DOM at all
    const hrefMatches = await page.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
    expect(hrefMatches).toBe(0);

    // Assert element IDs are completely absent from DOM
    const adminLinkCount = await page.locator('#adminLink').count();
    expect(adminLinkCount).toBe(0);

    const drawerAdminLinkCount = await page.locator('#drawerAdminLink').count();
    expect(drawerAdminLinkCount).toBe(0);

    // Also verify on real protected account.html page
    await page.goto(`${baseUrl}/account.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    const accountTextMatches = await page.locator('text="Admin Dashboard"').count();
    expect(accountTextMatches).toBe(0);

    const accountHrefMatches = await page.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
    expect(accountHrefMatches).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(ii) Role undefined / empty / "Admin" (wrong case) / "administrator" -> NOT in the DOM', async () => {
    const nonAdminRoleVariants = [
      { label: 'undefined role', role: undefined },
      { label: 'empty string role', role: '' },
      { label: 'capitalized Admin', role: 'Admin' },
      { label: 'administrator string', role: 'administrator' },
      { label: 'customer string', role: 'customer' }
    ];

    for (const variant of nonAdminRoleVariants) {
      const page = await browser.newPage();
      const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

      await page.addInitScript(({ token, role }) => {
        localStorage.setItem('token', token);
        const u = { name: 'Test Variant', email: 'variant@test.com' };
        if (role !== undefined) u.role = role;
        localStorage.setItem('user', JSON.stringify(u));
      }, {
        token: normalToken,
        role: variant.role
      });

      await page.goto(`${baseUrl}/menu-test.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#userLinks', { state: 'visible' });

      const textMatches = await page.locator('text="Admin Dashboard"').count();
      expect(textMatches).toBe(0);

      const hrefMatches = await page.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
      expect(hrefMatches).toBe(0);

      const adminLinkCount = await page.locator('#adminLink').count();
      expect(adminLinkCount).toBe(0);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      await page.close();
    }
  });

  test('(iii) Role "admin" -> exactly 1 link with right href and real click works', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

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

    await page.goto(`${baseUrl}/menu-test.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    // Assert EXACTLY 1 link with href="/admin.html" in the DOM
    const adminHrefCount = await page.locator('a[href="/admin.html"]').count();
    expect(adminHrefCount).toBe(1);

    // Assert EXACTLY 1 element with text "Admin Dashboard" in the DOM
    const adminTextCount = await page.locator('text="Admin Dashboard"').count();
    expect(adminTextCount).toBe(1);

    // Open the dropdown menu with a real click
    const menuBtn = page.locator('#userMenuBtn');
    await menuBtn.click();

    // Verify #adminLink is visible and properly configured
    const adminLink = page.locator('#adminLink');
    await adminLink.waitFor({ state: 'visible', timeout: 5000 });
    expect(await adminLink.isVisible()).toBe(true);

    const hrefAttr = await adminLink.getAttribute('href');
    expect(hrefAttr).toBe('/admin.html');

    // Real click on the admin link
    await adminLink.click();
    await page.waitForURL('**/admin.html', { timeout: 10000 });
    expect(page.url()).toContain('/admin.html');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(iv) Logged out -> none in the DOM at all', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

    await page.goto(`${baseUrl}/menu-test.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#authLinks', { state: 'visible' });

    // Assert count 0 for text and href
    const textMatches = await page.locator('text="Admin Dashboard"').count();
    expect(textMatches).toBe(0);

    const hrefMatches = await page.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
    expect(hrefMatches).toBe(0);

    const adminLinkCount = await page.locator('#adminLink').count();
    expect(adminLinkCount).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(v) Client-side localStorage role manipulation: UI displays link, BUT real server admin calls return 403 with normal token and 401 with no token', async () => {
    const page = await browser.newPage();
    // Allow expected 403 / 401 from server rejection tests
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page, true);

    // 1. Initial state: normal user logged in
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

    await page.goto(`${baseUrl}/menu-test.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    // Before tampering: link is absent
    expect(await page.locator('#adminLink').count()).toBe(0);

    // 2. Malicious user tampers with localStorage in browser DevTools: sets role: 'admin'
    await page.evaluate(() => {
      const u = JSON.parse(localStorage.getItem('user'));
      u.role = 'admin';
      localStorage.setItem('user', JSON.stringify(u));
      window.updateGlobalNavbarAuth();
    });

    // Open menu dropdown to check visibility
    const menuBtn = page.locator('#userMenuBtn');
    await menuBtn.click();

    // UI updates to show the link (UI-only deception)
    const adminLink = page.locator('#adminLink');
    expect(await adminLink.count()).toBe(1);
    await adminLink.waitFor({ state: 'visible', timeout: 5000 });
    expect(await adminLink.isVisible()).toBe(true);

    // 3. Server enforcement check: call all audited admin routes with real normal user token
    for (const route of auditedAdminRoutes) {
      const responseStatus = await page.evaluate(async ({ url, token }) => {
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        return res.status;
      }, { url: route.path, token: normalToken });

      expect(responseStatus).toBe(403);
    }

    // 4. Server enforcement check: call all audited admin routes with no token
    for (const route of auditedAdminRoutes) {
      const responseStatus = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        return res.status;
      }, route.path);

      expect(responseStatus).toBe(401);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(vi) Reproduction on real index.html: OLD global-nav.js leaks #adminLink in DOM with display:flex on mobile due to CSS !important, whereas NEW global-nav.js removes it completely (count 0)', async () => {
    // Part A: Run with OLD global-nav.js intercepted on mobile viewport (375x667)
    const pageOld = await browser.newPage();
    const { pageErrors: oldPageErrors, consoleErrors: oldConsoleErrors } = setupPageConsoleTracking(pageOld);

    await pageOld.setViewportSize({ width: 375, height: 667 });
    await pageOld.route('**/js/global-nav.js', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: oldGlobalNavSource
      });
    });

    await pageOld.addInitScript(({ token, user }) => {
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

    await pageOld.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageOld.waitForSelector('#userLinks', { state: 'visible' });

    // OLD CODE FAILS: #adminLink remained in DOM (count 1)
    const oldAdminCount = await pageOld.locator('#adminLink').count();
    expect(oldAdminCount).toBe(1);

    // OLD CODE FAILS: Due to home-3d.css @media (max-width: 768px) { .dropdown-item-link { display: flex !important; } },
    // the inline style style="display: none" set by old global-nav.js was overridden by CSS !important, yielding display: flex!
    const oldComputedDisplay = await pageOld.locator('#adminLink').evaluate(el => window.getComputedStyle(el).display);
    expect(oldComputedDisplay).toBe('flex');

    expect(oldPageErrors).toEqual([]);
    expect(oldConsoleErrors).toEqual([]);
    await pageOld.close();

    // Part B: Run with NEW global-nav.js on both mobile and desktop viewports
    for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 800 }]) {
      const pageNew = await browser.newPage();
      const { pageErrors: newPageErrors, consoleErrors: newConsoleErrors } = setupPageConsoleTracking(pageNew);

      await pageNew.setViewportSize(viewport);
      await pageNew.addInitScript(({ token, user }) => {
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

      await pageNew.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      await pageNew.waitForSelector('#userLinks', { state: 'visible' });

      // NEW CODE SUCCEEDS: #adminLink and any admin dashboard references are completely removed from DOM (count 0)
      const newAdminCount = await pageNew.locator('#adminLink').count();
      expect(newAdminCount).toBe(0);

      const newDrawerAdminCount = await pageNew.locator('#drawerAdminLink').count();
      expect(newDrawerAdminCount).toBe(0);

      const newTextCount = await pageNew.locator('text="Admin Dashboard"').count();
      expect(newTextCount).toBe(0);

      const newHrefCount = await pageNew.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
      expect(newHrefCount).toBe(0);

      expect(newPageErrors).toEqual([]);
      expect(newConsoleErrors).toEqual([]);
      await pageNew.close();
    }
  });

  test('(vii) Stale-data Case (i): Real UI admin logout followed by normal customer login leaves count 0 for #adminLink on index.html', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

    // 1. Start initially on index.html and set admin session
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      window.updateGlobalNavbarAuth();
    }, {
      token: adminToken,
      user: {
        _id: adminUser._id.toString(),
        name: adminUser.name,
        email: adminUser.email,
        role: 'admin'
      }
    });

    await page.waitForSelector('#userLinks', { state: 'visible' });
    expect(await page.locator('#adminLink').count()).toBe(1);

    // 2. Perform real UI logout
    const menuBtn = page.locator('#userMenuBtn');
    await menuBtn.click();
    const logoutBtn = page.locator('#logoutBtn');
    await logoutBtn.click();

    // Verify localStorage auth items are strictly cleared
    await page.waitForTimeout(500);
    const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('token'));
    const userAfterLogout = await page.evaluate(() => localStorage.getItem('user'));
    expect(tokenAfterLogout).toBeNull();
    expect(userAfterLogout).toBeNull();

    // 3. Normal customer logs in via real UI form on login.html
    await page.goto(`${baseUrl}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#email', 'customer@shreemata.com');
    await page.fill('#password', 'password123');
    await page.click('#emailLoginBtn');

    // Wait for redirect to home
    await page.waitForURL('**/', { timeout: 10000 });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    // Assert #adminLink and any admin dashboard text are count 0
    const adminLinkCount = await page.locator('#adminLink').count();
    expect(adminLinkCount).toBe(0);

    const adminTextCount = await page.locator('text="Admin Dashboard"').count();
    expect(adminTextCount).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(viii) Stale-data Case (ii): Corrupted or missing role in localStorage user object leaves count 0 for #adminLink on index.html', async () => {
    const corruptedVariants = [
      { label: 'missing role', data: JSON.stringify({ name: 'Unknown User', email: 'unknown@example.com' }) },
      { label: 'null role', data: JSON.stringify({ name: 'Unknown User', role: null }) },
      { label: 'empty string role', data: JSON.stringify({ name: 'Unknown User', role: '' }) },
      { label: 'corrupted role string', data: JSON.stringify({ name: 'Unknown User', role: 'INVALID_ROLE_###' }) },
      { label: 'empty object', data: JSON.stringify({}) }
    ];

    for (const variant of corruptedVariants) {
      const page = await browser.newPage();
      const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

      await page.addInitScript(({ token, userData }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', userData);
      }, {
        token: normalToken,
        userData: variant.data
      });

      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });

      const adminLinkCount = await page.locator('#adminLink').count();
      expect(adminLinkCount).toBe(0);

      const adminTextCount = await page.locator('text="Admin Dashboard"').count();
      expect(adminTextCount).toBe(0);

      const hrefMatches = await page.locator('a[href*="admin.html"], a[href*="admin-dashboard"]').count();
      expect(hrefMatches).toBe(0);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      await page.close();
    }
  });

  test('(ix) Stale-data Case (iii): Visiting /cart.html?demoUser=anything then navigating to index.html does not elevate role to admin; #adminLink count remains 0', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

    await page.route('https://checkout.razorpay.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.Razorpay = function(){};'
      });
    });

    // Start with normal user logged in
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

    // Visit cart with ?demoUser parameter
    await page.goto(`${baseUrl}/cart.html?demoUser=shakuntaladevi`, { waitUntil: 'domcontentloaded' });

    // Verify localStorage was not corrupted with role: 'admin'
    const userInStorage = await page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}'));
    expect(userInStorage.role).toBe('user');
    expect(userInStorage.email).toBe('customer@shreemata.com');

    // Navigate to index.html
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#userLinks', { state: 'visible' });

    const adminLinkCount = await page.locator('#adminLink').count();
    expect(adminLinkCount).toBe(0);

    const adminTextCount = await page.locator('text="Admin Dashboard"').count();
    expect(adminTextCount).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });

  test('(x) Backdoor removal in cart.js: ?demoUser=anything, ?demoUser=admin, and ?demo=1 do NOT write to localStorage and leave existing user/token strictly unchanged', async () => {
    const page = await browser.newPage();
    const { pageErrors, consoleErrors } = setupPageConsoleTracking(page);

    await page.route('https://checkout.razorpay.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.Razorpay = function(){};'
      });
    });

    const initialToken = normalToken;
    const initialUserStr = JSON.stringify({
      _id: normalUser._id.toString(),
      name: normalUser.name,
      email: normalUser.email,
      role: 'user'
    });

    const testQueries = ['?demoUser=anything', '?demoUser=admin', '?demo=1'];

    // Part A: Logged-in normal user -> assert exact equality before and after
    for (const query of testQueries) {
      await page.addInitScript(({ token, userStr }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', userStr);
      }, { token: initialToken, userStr: initialUserStr });

      await page.goto(`${baseUrl}/cart.html${query}`, { waitUntil: 'domcontentloaded' });

      const storedToken = await page.evaluate(() => localStorage.getItem('token'));
      const storedUser = await page.evaluate(() => localStorage.getItem('user'));

      expect(storedToken).toBe(initialToken);
      expect(storedUser).toBe(initialUserStr);
    }

    // Part B: Visitor / guest not logged in -> assert token === null && user === null
    for (const query of testQueries) {
      await page.addInitScript(() => {
        localStorage.clear();
      });

      await page.goto(`${baseUrl}/cart.html${query}`, { waitUntil: 'domcontentloaded' });

      const storedToken = await page.evaluate(() => localStorage.getItem('token'));
      const storedUser = await page.evaluate(() => localStorage.getItem('user'));

      expect(storedToken).toBeNull();
      expect(storedUser).toBeNull();
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  });
});
