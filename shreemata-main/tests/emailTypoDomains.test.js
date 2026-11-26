/**
 * tests/emailTypoDomains.test.js
 *
 * Strict tests verifying mistyped email domain detection before sending OTP:
 * 1. Shared typo domain list equality between server module and client signup script.
 * 2. Every typo domain returns HTTP 400 with exact suggestion and error message.
 * 3. Zero emails dispatched and zero OtpSendLimit/OtpIpLimit records reserved.
 * 4. Case and whitespace variants of typo domains are cleanly caught.
 * 5. Valid email (e.g. gmail.com) returns HTTP 200 and sends code.
 * 6. Real-browser (Playwright) test verifying suggestion display on blur and button click,
 *    and verifying the "Use <suggestion>" button fills the input field.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const { EMAIL_TYPO_DOMAINS, getEmailTypoSuggestion } = require('../utils/emailTypoDomains');
const emailService = require('../utils/emailService');
const OtpSendLimit = require('../models/OtpSendLimit');
const { OtpIpLimit } = require('../models/OtpSendLimit');

const REQUIRED_TYPOS = [
  'gamil.com', 'gmial.com', 'gmai.com', 'gmaill.com', 'gnail.com',
  'gmail.con', 'gmail.co', 'gmail.cm', 'gmail.om', 'gmail.comm',
  'gmil.com', 'gmal.com', 'yahooo.com', 'yaho.com', 'yahoo.con',
  'hotmial.com', 'hotmal.com', 'hotmail.con', 'outlok.com', 'outlook.con'
];

describe('Email Typo Domains - Shared List and Server Hardening', () => {
  let mongod;
  let app;
  let server;
  let baseUrl;
  let browser;
  let sendEmailSpy;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(REPO_DIR, 'public')));
    app.use('/api', require('../routes/auth'));

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_PATH
    });

    sendEmailSpy = jest.spyOn(emailService, 'sendEmailSafely').mockResolvedValue({
      messageId: 'mocked_email_msg_id',
      accepted: ['test@example.com'],
      rejected: [],
      response: '250 OK'
    });
  }, 60000);

  async function apiPost(pathName, data) {
    const res = await fetch(`${baseUrl}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  afterAll(async () => {
    if (sendEmailSpy) sendEmailSpy.mockRestore();
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    sendEmailSpy.mockClear();
    await OtpSendLimit.deleteMany({});
    await OtpIpLimit.deleteMany({});
    if (global.emailOtpStore && typeof global.emailOtpStore.clear === 'function') {
      global.emailOtpStore.clear();
    }
  });

  describe('1. Shared List Parity and Definition', () => {
    test('contains all 20 required typo domains with valid corrections', () => {
      REQUIRED_TYPOS.forEach(typo => {
        expect(EMAIL_TYPO_DOMAINS[typo]).toBeDefined();
        const corrected = EMAIL_TYPO_DOMAINS[typo];
        expect(typeof corrected).toBe('string');
        expect(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']).toContain(corrected);
      });
    });

    test('client signup.js has an identical typo domains list', () => {
      const signupJsCode = fs.readFileSync(path.join(REPO_DIR, 'public/js/signup.js'), 'utf8');
      const match = signupJsCode.match(/const\s+EMAIL_TYPO_DOMAINS\s*=\s*(\{[\s\S]*?\n\};)/);
      expect(match).not.toBeNull();
      const extractedClientList = new Function(`return ${match[1]}`)();
      expect(extractedClientList).toEqual(EMAIL_TYPO_DOMAINS);
    });

    test('getEmailTypoSuggestion helper detects typos and ignores valid domains', () => {
      expect(getEmailTypoSuggestion('desaikarthik324@gamil.com')).toEqual({
        original: 'desaikarthik324@gamil.com',
        local: 'desaikarthik324',
        typoDomain: 'gamil.com',
        correctedDomain: 'gmail.com',
        suggestion: 'desaikarthik324@gmail.com',
        error: 'Did you mean desaikarthik324@gmail.com?'
      });

      expect(getEmailTypoSuggestion('user@gmail.com')).toBeNull();
      expect(getEmailTypoSuggestion('user@yahoo.com')).toBeNull();
      expect(getEmailTypoSuggestion('user@hotmail.com')).toBeNull();
      expect(getEmailTypoSuggestion('user@outlook.com')).toBeNull();
      expect(getEmailTypoSuggestion('user@customdomain.org')).toBeNull();
      expect(getEmailTypoSuggestion('')).toBeNull();
      expect(getEmailTypoSuggestion(null)).toBeNull();
    });
  });

  describe('2. Server Rejection of Typo Domains (POST /api/send-email-otp)', () => {
    REQUIRED_TYPOS.forEach(typo => {
      test(`rejects ${typo} with 400, exact suggestion, and zero limits/emails`, async () => {
        const local = 'customer_test';
        const testEmail = `${local}@${typo}`;
        const correctedDomain = EMAIL_TYPO_DOMAINS[typo];
        const expectedSuggestion = `${local}@${correctedDomain}`;

        const res = await apiPost('/api/send-email-otp', { email: testEmail });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          success: false,
          error: `Did you mean ${expectedSuggestion}?`,
          suggestion: expectedSuggestion
        });

        // Zero emails sent
        expect(sendEmailSpy).not.toHaveBeenCalled();

        // Zero OtpSendLimit records created
        const sendLimitCount = await OtpSendLimit.countDocuments();
        expect(sendLimitCount).toBe(0);

        // Zero OtpIpLimit records created
        const ipLimitCount = await OtpIpLimit.countDocuments();
        expect(ipLimitCount).toBe(0);
      });
    });
  });

  describe('3. Case and Space Variations', () => {
    test('catches upper-case and mixed-case typo domains', async () => {
      const res = await apiPost('/api/send-email-otp', { email: 'DesaiKarthik324@GAMIL.COM' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Did you mean desaikarthik324@gmail.com?',
        suggestion: 'desaikarthik324@gmail.com'
      });
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(await OtpSendLimit.countDocuments()).toBe(0);
      expect(await OtpIpLimit.countDocuments()).toBe(0);
    });

    test('catches leading and trailing whitespace variants', async () => {
      const res = await apiPost('/api/send-email-otp', { email: '   user_space@HotMial.Com   ' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Did you mean user_space@hotmail.com?',
        suggestion: 'user_space@hotmail.com'
      });
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(await OtpSendLimit.countDocuments()).toBe(0);
      expect(await OtpIpLimit.countDocuments()).toBe(0);
    });
  });

  describe('4. Valid Email Success Path', () => {
    test('allows legitimate gmail.com address to receive code with 200', async () => {
      const validEmail = 'legitimate.customer@gmail.com';
      const res = await apiPost('/api/send-email-otp', { email: validEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Verification code sent to your email');

      // Email was dispatched
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      // OtpSendLimit record was incremented
      const sendRecord = await OtpSendLimit.findOne({ email: validEmail });
      expect(sendRecord).not.toBeNull();
      expect(sendRecord.sendCount).toBe(1);
    });
  });

  describe('5. Real Browser (Playwright) UI Verification', () => {
    test('shows suggestion on blur and "Use <suggestion>" button fills the input', async () => {
      const page = await browser.newPage();
      try {
        await page.goto(`${baseUrl}/signup.html`, { waitUntil: 'domcontentloaded' });

        const emailInput = page.locator('#email');
        const emailStatus = page.locator('#emailStatus');
        const verifyEmailBtn = page.locator('#verifyEmailBtn');

        // Type typo email
        await emailInput.fill('desaikarthik324@gamil.com');

        // Trigger blur by clicking outside (e.g. on full name field)
        await page.locator('#name').click();

        // Check suggestion text and button
        expect(await emailStatus.isVisible()).toBe(true);
        const statusText = await emailStatus.innerText();
        expect(statusText).toContain('Did you mean desaikarthik324@gmail.com?');

        const useBtn = emailStatus.locator('#useEmailSuggestionBtn');
        expect(await useBtn.isVisible()).toBe(true);
        expect(await useBtn.innerText()).toBe('Use desaikarthik324@gmail.com');

        // Click "Use <suggestion>" button
        await useBtn.click();

        // Email field is filled with corrected email
        expect(await emailInput.inputValue()).toBe('desaikarthik324@gmail.com');

        // Status is cleared
        expect(await emailStatus.innerText()).toBe('');

        // Verify button is visible
        expect(await verifyEmailBtn.isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('shows suggestion when verify button is tapped with typo email', async () => {
      const page = await browser.newPage();
      try {
        await page.goto(`${baseUrl}/signup.html`, { waitUntil: 'domcontentloaded' });

        const emailInput = page.locator('#email');
        const emailStatus = page.locator('#emailStatus');
        const verifyEmailBtn = page.locator('#verifyEmailBtn');

        // Type typo email
        await emailInput.fill('newuser@hotmal.com');

        // Verify button is displayed after valid regex email pattern
        expect(await verifyEmailBtn.isVisible()).toBe(true);

        // Click verify email button directly
        await verifyEmailBtn.click();

        // Suggestion appears
        expect(await emailStatus.isVisible()).toBe(true);
        const statusText = await emailStatus.innerText();
        expect(statusText).toContain('Did you mean newuser@hotmail.com?');

        const useBtn = emailStatus.locator('#useEmailSuggestionBtn');
        expect(await useBtn.isVisible()).toBe(true);
        expect(await useBtn.innerText()).toBe('Use newuser@hotmail.com');

        // Tap the button to use suggestion
        await useBtn.click();

        // Email field is filled
        expect(await emailInput.inputValue()).toBe('newuser@hotmail.com');
        expect(await emailStatus.innerText()).toBe('');
        expect(await verifyEmailBtn.isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });
  });
});
