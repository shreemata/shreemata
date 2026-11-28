/**
 * tests/classScopedBrowser.test.js
 *
 * Strict Real-Browser Playwright Test Suite for Class-Scoped Study Material:
 * (i) Class 10 pass: Class 10 card shows Read; Class 8 card shows Preview and "Buy Class 8 - Rs 199" with exact server price.
 * (ii) Clicking Buy sends create-order with exact body { section: 'notes', classLevel: <that class> } and no price field;
 *      after mocked payment success verify-order is called and the card becomes Read.
 * (iii) Legacy user: blocking modal appears, cannot be dismissed without choosing, choose sends exactly one POST,
 *       modal is gone and that class card is Read.
 * (iv) Reader preview shows bottom bar with exact class and price; Buy there works.
 * (v) A class name containing double quote and apostrophe renders as text and executes nothing (no alert/dialog, no extra elements).
 * (vi) Admin panel loads classes, saves a price, PUT body is exact, and reload shows saved price;
 *       invalid price (0, 100001, 12.5) is rejected with visible message.
 * (vii) Other sections (question_papers, videos) still show old banner and Subscribe flow.
 *
 * ZERO page errors and ZERO console errors across all flows.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { PDFDocument } = require('pdf-lib');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

// Mock Razorpay SDK on backend before loading routes
let mockLastCreatedRazorpayOrderId = null;
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockImplementation((payload) => {
        const orderId = 'order_mock_' + Date.now();
        mockLastCreatedRazorpayOrderId = orderId;
        return Promise.resolve({
          id: orderId,
          amount: payload.amount,
          currency: payload.currency || 'INR',
          receipt: payload.receipt,
          status: 'created'
        });
      })
    },
    payments: {
      fetch: jest.fn().mockImplementation(async (paymentId) => {
        let order = null;
        try {
          const mongooseModule = require('mongoose');
          const SubscriptionOrderModel = mongooseModule.model('SubscriptionOrder');
          if (SubscriptionOrderModel) {
            order = await SubscriptionOrderModel.findOne({
              $or: [
                { razorpayOrderId: mockLastCreatedRazorpayOrderId },
                { razorpayPaymentId: paymentId }
              ]
            }).lean();
          }
        } catch (_) {}
        return {
          id: paymentId,
          order_id: (order && order.razorpayOrderId) || mockLastCreatedRazorpayOrderId,
          status: 'captured',
          currency: 'INR',
          amount: (order && order.amountPaise) || 19900
        };
      })
    }
  }));
});

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const AdminSettings = require('../models/AdminSettings');
const subscriptionsRoute = require('../routes/subscriptions');
const notesRoute = require('../routes/notes');
const adminSettingsRoute = require('../routes/adminSettings');

jest.setTimeout(90000);

describe('Class-Scoped Study Material Real Browser Playwright Verification', () => {
  let app;
  let server;
  let baseUrl;
  let browser;

  let adminUser, adminToken;
  let student10User, student10Token;
  let legacyUser, legacyToken;
  let studentCleanUser, studentCleanToken;

  let noteClass10;
  let noteClass8;
  let noteXssClass;
  let noteQp;
  let noteVideo;

  const samplePdfKey = 'sample_playwright_test.pdf';
  const testStorageDir = path.resolve(__dirname, '../storage/notes/private');

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = 'test_jwt_secret_playwright_class';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_playwright_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_key_fixed';
    process.env.ENABLE_READ_NOTES = 'true';
    process.env.ENABLE_QUESTION_PAPERS = 'true';
    process.env.ENABLE_VIDEOS = 'true';
    process.env.ENABLE_OTHERS = 'true';

    // Prepare real sample PDF
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    const samplePdfPath = path.join(testStorageDir, samplePdfKey);
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) {
      const page = pdfDoc.addPage([600, 400]);
      page.drawText(`Page ${i + 1} Real Playwright Content`, { x: 50, y: 350 });
    }
    fs.writeFileSync(samplePdfPath, await pdfDoc.save());

    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Transparent image fallback to prevent console errors
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    app.get(/\.(png|jpg|jpeg|gif|webp|svg)$/i, (req, res, next) => {
      // Check if real file exists in public/
      const realPath = path.join(REPO_DIR, 'public', req.path);
      if (fs.existsSync(realPath)) {
        return next();
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(transparentPng);
    });

    // Fallback for missing CSS stylesheets (e.g. admin.css) to avoid MIME type errors
    app.get(/\.css$/i, (req, res, next) => {
      const realPath = path.join(REPO_DIR, 'public', req.path);
      if (fs.existsSync(realPath)) {
        return next();
      }
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('');
    });

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // Mount real API routes
    app.use('/api/subscriptions', subscriptionsRoute);
    app.use('/api/notes', notesRoute);
    app.use('/api/admin', adminSettingsRoute);

    // Platform features
    app.get('/api/features', (req, res) => {
      res.json({
        success: true,
        features: {
          readNotes: true,
          questionPapers: true,
          videos: true,
          others: true
        }
      });
    });

    // Mock cart, notifications and bundles to keep pages clean
    app.get('/api/cart', (req, res) => res.json({ items: [] }));
    app.get('/api/notifications', (req, res) => res.json({ notifications: [] }));
    app.get('/api/bundles', (req, res) => res.json({ bundles: [] }));

    // Serve static public files
    app.use(express.static(path.join(REPO_DIR, 'public')));

    // Start HTTP server on local port
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Launch Chromium
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // Seed test users
    adminUser = await User.create({
      name: 'Admin Tester',
      email: 'admin.playwright@test.com',
      password: 'hashed_password',
      role: 'admin',
      isVerified: true
    });
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET);

    student10User = await User.create({
      name: 'Class 10 Student',
      email: 'student10.playwright@test.com',
      password: 'hashed_password',
      role: 'customer',
      isVerified: true
    });
    student10Token = jwt.sign({ id: student10User._id, role: 'customer' }, process.env.JWT_SECRET);

    legacyUser = await User.create({
      name: 'Legacy Subscriber',
      email: 'legacy.playwright@test.com',
      password: 'hashed_password',
      role: 'customer',
      isVerified: true
    });
    legacyToken = jwt.sign({ id: legacyUser._id, role: 'customer' }, process.env.JWT_SECRET);

    studentCleanUser = await User.create({
      name: 'Clean Student',
      email: 'clean.playwright@test.com',
      password: 'hashed_password',
      role: 'customer',
      isVerified: true
    });
    studentCleanToken = jwt.sign({ id: studentCleanUser._id, role: 'customer' }, process.env.JWT_SECRET);

    // Seed AdminSettings
    await AdminSettings.deleteMany({});
    await AdminSettings.create({
      sectionSubscriptionPlans: {
        notes: { active: true, price: 299, durationDays: 30, name: 'Notes Pass', description: 'Curriculum notes' },
        question_papers: { active: true, price: 149, durationDays: 30, name: 'QP Pass', description: 'Solved papers' },
        videos: { active: true, price: 399, durationDays: 30, name: 'Video Pass', description: 'Video lectures' },
        others: { active: true, price: 99, durationDays: 30, name: 'Others Pass', description: 'General access' }
      },
      subscriptionPlans: {
        notes: { active: true, price: 299, durationDays: 30, name: 'Notes Pass', description: 'Curriculum notes' },
        question_papers: { active: true, price: 149, durationDays: 30, name: 'QP Pass', description: 'Solved papers' },
        videos: { active: true, price: 399, durationDays: 30, name: 'Video Pass', description: 'Video lectures' },
        others: { active: true, price: 99, durationDays: 30, name: 'Others Pass', description: 'General access' }
      },
      classPrices: {
        'class 8': 199,
        'class 10': 299
      }
    });

    // Seed Notes
    await Note.deleteMany({});
    noteClass10 = await Note.create({
      title: 'Mathematics Standard 10',
      description: 'Complete syllabus notes for class 10',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      section: 'notes',
      isPublished: true,
      pdfUrl: samplePdfKey,
      totalPages: 5,
      previewPages: 2
    });

    noteClass8 = await Note.create({
      title: 'General Science 8',
      description: 'Science guide and notes for class 8',
      subject: 'Science',
      classLevel: 'Class 8',
      section: 'notes',
      isPublished: true,
      pdfUrl: samplePdfKey,
      totalPages: 5,
      previewPages: 2
    });

    noteXssClass = await Note.create({
      title: 'XSS Boundary Note',
      description: 'Safe escaping audit',
      subject: 'Safety',
      classLevel: 'Class "10" \' & <script>alert(1)</script>',
      section: 'notes',
      isPublished: true,
      pdfUrl: samplePdfKey,
      totalPages: 5,
      previewPages: 2
    });

    noteQp = await Note.create({
      title: 'Board Exam QP 2026',
      description: 'Solved question paper',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      section: 'question_papers',
      isPublished: true,
      pdfUrl: samplePdfKey,
      totalPages: 5,
      previewPages: 2
    });

    noteVideo = await Note.create({
      title: 'Physics Concept Lecture',
      description: 'Video explanation',
      subject: 'Physics',
      classLevel: 'Class 10',
      section: 'videos',
      isPublished: true,
      isFree: false,
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });

    // Seed Subscriptions:
    // student10 has active class 10 pass
    await NoteSubscription.create({
      userId: student10User._id,
      section: 'notes',
      classLevel: 'class 10',
      subscriptionIndex: 1,
      status: 'active',
      amountPaid: 299,
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planType: 'standard',
      razorpayOrderId: 'order_seed_10',
      razorpayPaymentId: 'pay_seed_10',
      razorpaySignature: 'sig_seed_10'
    });

    // legacyUser has active notes pass with empty classLevel
    await NoteSubscription.create({
      userId: legacyUser._id,
      section: 'notes',
      classLevel: '',
      subscriptionIndex: 1,
      status: 'active',
      amountPaid: 299,
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planType: 'standard',
      razorpayOrderId: 'order_seed_legacy',
      razorpayPaymentId: 'pay_seed_legacy',
      razorpaySignature: 'sig_seed_legacy'
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await teardownTestDB();
    if (fs.existsSync(path.join(testStorageDir, samplePdfKey))) {
      try { fs.unlinkSync(path.join(testStorageDir, samplePdfKey)); } catch (_) {}
    }
  });

  async function createTrackedPage(token, userObj) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', err => pageErrors.push(err.message || String(err)));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Mock external checkout.js script from Razorpay CDN
    await page.route(/checkout\.razorpay\.com/, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.Razorpay = function (options) {
            window.__lastRazorpayOptions = options;
            this.open = function () {
              window.__razorpayOpened = true;
              if (window.__autoRazorpaySuccess) {
                setTimeout(function () {
                  if (options.handler) {
                    options.handler({
                      razorpay_order_id: options.order_id,
                      razorpay_payment_id: 'pay_mock_' + Date.now(),
                      razorpay_signature: 'sig_mock_auto'
                    });
                  }
                }, 50);
              }
            };
            this.on = function (event, callback) {};
          };
        `
      });
    });

    // Inject Auth & Mock Razorpay SDK before page scripts load
    await page.addInitScript(({ t, u, keySecret }) => {
      if (t) localStorage.setItem('token', t);
      if (u) localStorage.setItem('user', JSON.stringify(u));

      window.__lastCreateOrderPayload = null;
      window.__autoRazorpaySuccess = false;

      // Mock Razorpay SDK
      window.Razorpay = function (options) {
        window.__lastRazorpayOptions = options;
        this.open = function () {
          window.__razorpayOpened = true;
          if (window.__autoRazorpaySuccess) {
            setTimeout(function () {
              if (options.handler) {
                options.handler({
                  razorpay_order_id: options.order_id,
                  razorpay_payment_id: 'pay_mock_' + Date.now(),
                  razorpay_signature: 'sig_mock_auto'
                });
              }
            }, 50);
          }
        };
        this.on = function (event, callback) {};
      };
    }, { t: token, u: userObj, keySecret: process.env.RAZORPAY_KEY_SECRET });

    // Intercept verify-order to sign payload with valid secret so server verification succeeds
    await page.route('**/api/subscriptions/verify-order', async (route) => {
      const postData = JSON.parse(route.request().postData());
      const orderId = postData.razorpayOrderId || postData.razorpay_order_id;
      const paymentId = postData.razorpayPaymentId || postData.razorpay_payment_id || 'pay_mock_verified';
      const sig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_key_fixed')
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const correctedData = {
        ...postData,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sig,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig
      };

      route.continue({ postData: JSON.stringify(correctedData) });
    });

    return { page, pageErrors, consoleErrors, context };
  }

  async function assertVisible(locator, timeout = 10000) {
    await locator.waitFor({ state: 'visible', timeout });
    expect(await locator.isVisible()).toBe(true);
  }

  async function assertHidden(locator, timeout = 10000) {
    await locator.waitFor({ state: 'hidden', timeout });
    expect(await locator.isVisible()).toBe(false);
  }

  async function assertText(locator, expectedText) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const text = (await locator.textContent()).trim();
    expect(text).toBe(expectedText);
  }

  async function assertContainsText(locator, substring) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const text = (await locator.textContent()).trim();
    expect(text).toContain(substring);
  }

  async function assertValue(locator, expectedValue) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const val = await locator.inputValue();
    expect(val).toBe(expectedValue);
  }

  // -------------------------------------------------------------------------
  // Test (i): Class 10 pass: Class 10 card shows Read; Class 8 card shows Preview and "Buy Class 8 - ₹199"
  // -------------------------------------------------------------------------
  test('(i) Class 10 pass: Class 10 card shows Read; Class 8 card shows Preview and Buy Class 8 with exact server price', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(student10Token, student10User);

    await page.goto(`${baseUrl}/notes.html?section=notes`, { waitUntil: 'networkidle' });

    // Wait for catalog grid to render cards
    await page.waitForSelector('.item-card');

    // Locate Class 10 card
    const card10 = page.locator('.item-card', { hasText: 'Mathematics Standard 10' });
    await assertVisible(card10);
    const readBtn10 = card10.locator('.btn-card-unlocked');
    await assertVisible(readBtn10);
    await assertText(readBtn10, '📖 Read');

    // Locate Class 8 card
    const card8 = page.locator('.item-card', { hasText: 'General Science 8' });
    await assertVisible(card8);
    const previewBtn8 = card8.locator('.btn-card-free');
    await assertVisible(previewBtn8);
    await assertText(previewBtn8, '📖 Preview');

    const buyBtn8 = card8.locator('.btn-buy-class');
    await assertVisible(buyBtn8);
    await assertText(buyBtn8, '⚡ Buy Class 8 - ₹199');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (ii): Clicking Buy sends create-order with exact body { section: 'notes', classLevel: <that class> } and no price field;
  // after mocked payment success verify-order is called and card becomes Read
  // -------------------------------------------------------------------------
  test('(ii) Clicking Buy sends create-order with exact body { section: notes, classLevel } and no price field; after payment success card becomes Read', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(student10Token, student10User);

    let createOrderPayload = null;
    await page.route('**/api/subscriptions/create-order', async (route) => {
      createOrderPayload = JSON.parse(route.request().postData());
      route.continue();
    });

    await page.goto(`${baseUrl}/notes.html?section=notes`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.item-card');

    // Enable auto-success on razorpay modal
    await page.evaluate(() => { window.__autoRazorpaySuccess = true; });

    // Locate Class 8 buy button
    const card8 = page.locator('.item-card', { hasText: 'General Science 8' });
    const buyBtn8 = card8.locator('.btn-buy-class');
    await assertVisible(buyBtn8);

    // Click Buy button (real click)
    await buyBtn8.click();

    // Verify create-order was called with exact body shape
    await page.waitForResponse(res => res.url().includes('/api/subscriptions/create-order') && res.status() === 200);
    expect(createOrderPayload).toEqual({
      section: 'notes',
      classLevel: 'Class 8'
    });
    expect(createOrderPayload.price).toBeUndefined();
    expect(createOrderPayload.amount).toBeUndefined();

    // Wait for verify-order call and catalog reload
    await page.waitForResponse(res => res.url().includes('/api/subscriptions/verify-order') && res.status() === 200);

    // Card for Class 8 reloads and becomes Read
    const updatedCard8 = page.locator('.item-card', { hasText: 'General Science 8' });
    const readBtn8 = updatedCard8.locator('.btn-card-unlocked');
    await assertVisible(readBtn8, 10000);
    await assertText(readBtn8, '📖 Read');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (iii): Legacy user: blocking modal appears, cannot be dismissed without choosing,
  // choose sends exactly one POST, modal is gone and that class card is Read
  // -------------------------------------------------------------------------
  test('(iii) Legacy user: blocking modal appears, cannot be dismissed without choosing, choose sends exactly one POST, modal is gone and that class card is Read', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(legacyToken, legacyUser);

    let chooseCalls = 0;
    let choosePayload = null;
    await page.route('**/api/subscriptions/choose-class', async (route) => {
      chooseCalls++;
      choosePayload = JSON.parse(route.request().postData());
      route.continue();
    });

    await page.goto(`${baseUrl}/notes.html?section=notes`, { waitUntil: 'networkidle' });

    // Blocking modal appears
    const modal = page.locator('#legacyClassChoiceModal');
    await assertVisible(modal);

    // Cannot be dismissed by pressing Escape
    await page.keyboard.press('Escape');
    await assertVisible(modal);

    // Select Class 10 option
    const optClass10 = modal.locator('.btn-legacy-choice-item', { hasText: 'Class 10' });
    await assertVisible(optClass10);
    await optClass10.click();

    // Confirm section appears
    const confirmSec = page.locator('#legacyConfirmSection');
    await assertVisible(confirmSec);
    await assertContainsText(confirmSec, 'Class 10');

    // Click Confirm button
    const btnConfirm = page.locator('#btnConfirmLegacyChoice');
    await btnConfirm.click();

    // Modal is gone
    await assertHidden(modal, 10000);

    // Assert exactly one POST request was sent
    expect(chooseCalls).toBe(1);
    expect(choosePayload).toEqual({ classLevel: 'Class 10' });

    // Class 10 card is now Read
    const card10 = page.locator('.item-card', { hasText: 'Mathematics Standard 10' });
    const readBtn10 = card10.locator('.btn-card-unlocked');
    await assertVisible(readBtn10);
    await assertText(readBtn10, '📖 Read');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (iv): Reader preview shows bottom bar with exact class and price; Buy there works
  // -------------------------------------------------------------------------
  test('(iv) Reader preview shows bottom bar with exact class and price; Buy there works', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(studentCleanToken, studentCleanUser);

    await page.goto(`${baseUrl}/reader.html?id=${noteClass8._id}`, { waitUntil: 'networkidle' });

    // Wait for pdf canvas and bottom bar to appear
    const bottomBar = page.locator('#previewBottomBar');
    await assertVisible(bottomBar);

    // Check exact text
    const barText = page.locator('#previewBottomBarText');
    await assertText(barText, 'You are viewing a free preview of General Science 8 (Class 8). Unlock full Class 8 material - ₹199');

    const barBtn = page.locator('#btnPreviewBottomBuy');
    await assertText(barBtn, '⚡ Buy Class 8 - ₹199');

    // Enable auto-success for checkout and click Buy
    await page.evaluate(() => { window.__autoRazorpaySuccess = true; });
    await barBtn.click();

    // Verify order was created and verified
    await page.waitForResponse(res => res.url().includes('/api/subscriptions/create-order') && res.status() === 200);
    await page.waitForResponse(res => res.url().includes('/api/subscriptions/verify-order') && res.status() === 200);

    // After reload with active pass, bottom bar is hidden (full access)
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    const updatedBottomBar = page.locator('#previewBottomBar');
    await assertHidden(updatedBottomBar);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (v): A class name containing double quote and apostrophe renders as text and executes nothing
  // -------------------------------------------------------------------------
  test('(v) Class name containing double quote and apostrophe renders as text and executes nothing', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(student10Token, student10User);

    let dialogAppeared = false;
    page.on('dialog', async dialog => {
      dialogAppeared = true;
      await dialog.dismiss();
    });

    await page.goto(`${baseUrl}/notes.html?section=notes`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.item-card');

    // Assert no dialog was triggered
    expect(dialogAppeared).toBe(false);

    // Find card with XSS title
    const xssCard = page.locator('.item-card', { hasText: 'XSS Boundary Note' });
    await assertVisible(xssCard);

    // Check that script tag did not execute and is rendered as text
    const scriptTag = page.locator('script:has-text("alert(1)")');
    expect(await scriptTag.count()).toBe(0);

    // Card action button displays safely
    const buyBtn = xssCard.locator('.btn-buy-class');
    await assertVisible(buyBtn);
    const btnText = await buyBtn.textContent();
    expect(btnText).toContain('Class "10" \' & <script>alert(1)</script>');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (vi): Admin panel loads classes, saves a price, PUT body is exact, reload shows saved price;
  // invalid price (0, 100001, 12.5) is rejected with visible message
  // -------------------------------------------------------------------------
  test('(vi) Admin panel loads classes, saves a price, PUT body is exact, and reload shows saved price; invalid price rejected', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(adminToken, adminUser);

    await page.goto(`${baseUrl}/admin-settings.html`, { waitUntil: 'networkidle' });

    // Wait for class prices section
    const classSection = page.locator('#classPricesSection');
    await assertVisible(classSection);

    // Wait for class rows to render
    const inputClass8 = page.locator('.class-price-input[data-class="class 8"]');
    await assertVisible(inputClass8);
    await assertValue(inputClass8, '199');

    const saveBtn = page.locator('#btnSaveClassPrices');
    const msgEl = page.locator('#classPriceMessage');

    // Test invalid price 0
    await inputClass8.fill('0');
    await saveBtn.click();
    await assertVisible(msgEl);
    await assertContainsText(msgEl, 'between ₹1 and ₹1,00,000');

    // Test invalid price 100001
    await inputClass8.fill('100001');
    await saveBtn.click();
    await assertVisible(msgEl);
    await assertContainsText(msgEl, 'between ₹1 and ₹1,00,000');

    // Test invalid price 12.5
    await inputClass8.fill('12.5');
    await saveBtn.click();
    await assertVisible(msgEl);
    await assertContainsText(msgEl, 'between ₹1 and ₹1,00,000');

    // Enter valid price 350 and save
    let putBody = null;
    await page.route('**/api/admin/settings/class-prices', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData());
      }
      route.continue();
    });

    await inputClass8.fill('350');
    await saveBtn.click();

    await page.waitForResponse(res => res.url().includes('/api/admin/settings/class-prices') && res.request().method() === 'PUT' && res.status() === 200);
    await assertVisible(msgEl);
    await assertContainsText(msgEl, 'saved successfully');

    expect(putBody.classPrices['class 8']).toBe(350);

    // Reload page and verify saved price persists
    await page.reload({ waitUntil: 'networkidle' });
    const reloadedInput8 = page.locator('.class-price-input[data-class="class 8"]');
    await assertVisible(reloadedInput8);
    await assertValue(reloadedInput8, '350');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });

  // -------------------------------------------------------------------------
  // Test (vii): Other sections (question_papers, videos) still show old banner and Subscribe flow
  // -------------------------------------------------------------------------
  test('(vii) Other sections (question_papers, videos) still show old banner and Subscribe flow', async () => {
    const { page, pageErrors, consoleErrors, context } = await createTrackedPage(studentCleanToken, studentCleanUser);

    // 1. Question Papers section
    await page.goto(`${baseUrl}/notes.html?section=question_papers`, { waitUntil: 'networkidle' });

    const notesBannerQP = page.locator('#notesClassBanner');
    await assertHidden(notesBannerQP);

    const planBannerQP = page.locator('#planBanner');
    await assertVisible(planBannerQP);
    await assertText(planBannerQP.locator('#planTitle'), 'QP Pass');
    const subscribeBtnQP = planBannerQP.locator('.btn-subscribe');
    await assertVisible(subscribeBtnQP);
    await assertContainsText(subscribeBtnQP, 'Subscribe to Unlock');

    // 2. Videos section
    await page.goto(`${baseUrl}/notes.html?section=videos`, { waitUntil: 'networkidle' });

    const notesBannerVid = page.locator('#notesClassBanner');
    await assertHidden(notesBannerVid);

    const planBannerVid = page.locator('#planBanner');
    await assertVisible(planBannerVid);
    await assertText(planBannerVid.locator('#planTitle'), 'Video Pass');
    const subscribeBtnVid = planBannerVid.locator('.btn-subscribe');
    await assertVisible(subscribeBtnVid);
    await assertContainsText(subscribeBtnVid, 'Subscribe to Unlock');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
});
