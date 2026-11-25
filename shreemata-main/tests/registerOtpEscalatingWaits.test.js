process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_register_otp_waits_2026';
process.env.NODE_ENV = 'test';

const path = require('path');
const http = require('http');
const express = require('express');
const axiosRaw = require('axios');
const axios = axiosRaw.default || axiosRaw;
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const OtpSendLimit = require('../models/OtpSendLimit');
const User = require('../models/User');
const authRoutes = require('../routes/auth');
const emailService = require('../utils/emailService');

jest.setTimeout(60000);

let server;
let baseUrl;
let client;
let browser;
let emailSpy;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(REPO_DIR, 'public')));
  app.use('/api', authRoutes);
  app.use('/api/auth', authRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  client = axios.create({
    baseURL: `${baseUrl}/api`,
    validateStatus: () => true
  });

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });
});

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await teardownTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  if (global.emailOtpStore) {
    global.emailOtpStore.clear();
  }
  jest.restoreAllMocks();
  emailSpy = jest.spyOn(emailService, 'sendEmailOTP').mockResolvedValue({
    success: true,
    messageId: 'test_escalating_waits_otp_id'
  });
});

describe('Register Email Verification OTP Escalating Waits Suite', () => {

  it('a) sends 1, 2, 3 all return 200 and exactly 3 emails', async () => {
    const email = 'test_case_a@example.com';

    const r1 = await client.post('/send-email-otp', { email });
    expect(r1.status).toBe(200);
    expect(r1.data.success).toBe(true);

    const r2 = await client.post('/send-email-otp', { email });
    expect(r2.status).toBe(200);
    expect(r2.data.success).toBe(true);

    const r3 = await client.post('/send-email-otp', { email });
    expect(r3.status).toBe(200);
    expect(r3.data.success).toBe(true);

    expect(emailSpy).toHaveBeenCalledTimes(3);

    const doc = await OtpSendLimit.findOne({ email });
    expect(doc).not.toBeNull();
    expect(doc.sendCount).toBe(3);
  });

  it('b) immediate send 4 returns 429 with retryAfterSeconds between 299 and 300, still exactly 3 emails', async () => {
    const email = 'test_case_b@example.com';

    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    expect(emailSpy).toHaveBeenCalledTimes(3);

    const r4 = await client.post('/send-email-otp', { email });
    expect(r4.status).toBe(429);
    expect(r4.data.success).toBe(false);
    expect(r4.data.error).toBe('Please wait before requesting another code');
    expect(r4.data.retryAfterSeconds).toBeGreaterThanOrEqual(299);
    expect(r4.data.retryAfterSeconds).toBeLessThanOrEqual(300);
    expect(r4.headers['retry-after']).toBe(String(r4.data.retryAfterSeconds));

    expect(emailSpy).toHaveBeenCalledTimes(3);

    const doc = await OtpSendLimit.findOne({ email });
    expect(doc.sendCount).toBe(3);
  });

  it('c) after setting lastSentAt to 5 minutes + 1 second ago, send 4 succeeds (4 emails); an immediate send 5 returns 429 with retryAfterSeconds 599 or 600', async () => {
    const email = 'test_case_c@example.com';

    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    expect(emailSpy).toHaveBeenCalledTimes(3);

    // Set lastSentAt to 5 min + 1 sec ago (301 seconds ago)
    const fiveMinOneSecAgo = new Date(Date.now() - (5 * 60 + 1) * 1000);
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: fiveMinOneSecAgo } });

    // Send 4 succeeds
    const r4 = await client.post('/send-email-otp', { email });
    expect(r4.status).toBe(200);
    expect(r4.data.success).toBe(true);
    expect(emailSpy).toHaveBeenCalledTimes(4);

    // Immediate send 5 must wait 10 minutes (600s)
    const r5 = await client.post('/send-email-otp', { email });
    expect(r5.status).toBe(429);
    expect(r5.data.success).toBe(false);
    expect(r5.data.error).toBe('Please wait before requesting another code');
    expect([599, 600]).toContain(r5.data.retryAfterSeconds);
    expect(r5.headers['retry-after']).toBe(String(r5.data.retryAfterSeconds));

    expect(emailSpy).toHaveBeenCalledTimes(4);

    const doc = await OtpSendLimit.findOne({ email });
    expect(doc.sendCount).toBe(4);
  });

  it('d) the 10 min, 15 min, 60 min steps and the repeat of 60 after that', async () => {
    const email = 'test_case_d@example.com';

    // Sends 1, 2, 3
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });

    // Send 4 (5m wait)
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 301000) } });
    const r4 = await client.post('/send-email-otp', { email });
    expect(r4.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(4);

    // Send 5 (10m wait): simulate 10m + 1s passed
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 601000) } });
    const r5 = await client.post('/send-email-otp', { email });
    expect(r5.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(5);

    // Immediate send 6 -> waits 15 min (900s)
    const r6_fail = await client.post('/send-email-otp', { email });
    expect(r6_fail.status).toBe(429);
    expect([899, 900]).toContain(r6_fail.data.retryAfterSeconds);

    // Send 6 (15m wait): simulate 15m + 1s passed
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 901000) } });
    const r6 = await client.post('/send-email-otp', { email });
    expect(r6.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(6);

    // Immediate send 7 -> waits 60 min (3600s)
    const r7_fail = await client.post('/send-email-otp', { email });
    expect(r7_fail.status).toBe(429);
    expect([3599, 3600]).toContain(r7_fail.data.retryAfterSeconds);

    // Send 7 (60m wait): simulate 60m + 1s passed
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 3601000) } });
    const r7 = await client.post('/send-email-otp', { email });
    expect(r7.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(7);

    // Immediate send 8 -> waits repeating 60 min (3600s)
    const r8_fail = await client.post('/send-email-otp', { email });
    expect(r8_fail.status).toBe(429);
    expect([3599, 3600]).toContain(r8_fail.data.retryAfterSeconds);

    // Send 8 (repeat 60m wait): simulate 60m + 1s passed
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 3601000) } });
    const r8 = await client.post('/send-email-otp', { email });
    expect(r8.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(8);

    // Immediate send 9 -> waits repeating 60 min (3600s)
    const r9_fail = await client.post('/send-email-otp', { email });
    expect(r9_fail.status).toBe(429);
    expect([3599, 3600]).toContain(r9_fail.data.retryAfterSeconds);
    expect(emailSpy).toHaveBeenCalledTimes(8);
  });

  it('e) email case/whitespace variants ("A@x.com" vs "a@x.com ") share one counter', async () => {
    const r1 = await client.post('/send-email-otp', { email: 'VariantUser_E@Example.Com' });
    expect(r1.status).toBe(200);

    const r2 = await client.post('/send-email-otp', { email: '  variantuser_e@example.com  ' });
    expect(r2.status).toBe(200);

    const r3 = await client.post('/send-email-otp', { email: 'VARIANTUSER_E@EXAMPLE.COM' });
    expect(r3.status).toBe(200);

    const r4 = await client.post('/send-email-otp', { email: 'variantuser_e@example.com' });
    expect(r4.status).toBe(429);
    expect(r4.data.error).toBe('Please wait before requesting another code');
    expect(emailSpy).toHaveBeenCalledTimes(3);

    const doc = await OtpSendLimit.findOne({ email: 'variantuser_e@example.com' });
    expect(doc).not.toBeNull();
    expect(doc.sendCount).toBe(3);
  });

  it('f) different emails do not affect each other', async () => {
    const emailA = 'alice_case_f@example.com';
    const emailB = 'bob_case_f@example.com';

    // Alice exhausts immediate 3 sends
    await client.post('/send-email-otp', { email: emailA });
    await client.post('/send-email-otp', { email: emailA });
    await client.post('/send-email-otp', { email: emailA });
    const rA4 = await client.post('/send-email-otp', { email: emailA });
    expect(rA4.status).toBe(429);

    // Bob can still send immediately without being blocked
    const rB1 = await client.post('/send-email-otp', { email: emailB });
    expect(rB1.status).toBe(200);
    expect(rB1.data.success).toBe(true);

    const docA = await OtpSendLimit.findOne({ email: emailA });
    const docB = await OtpSendLimit.findOne({ email: emailB });
    expect(docA.sendCount).toBe(3);
    expect(docB.sendCount).toBe(1);
  });

  it('g) counter resets after a completed registration and after 24 hours', async () => {
    // 1. Reset after registration
    const regEmail = 'registered_case_g@example.com';
    await client.post('/send-email-otp', { email: regEmail });
    await client.post('/send-email-otp', { email: regEmail });
    await client.post('/send-email-otp', { email: regEmail });
    const limitBeforeReg = await OtpSendLimit.findOne({ email: regEmail });
    expect(limitBeforeReg.sendCount).toBe(3);

    const storedOtp = global.emailOtpStore.get(regEmail).otp;
    const verifyRes = await client.post('/verify-email-otp', { email: regEmail, otp: storedOtp });
    expect(verifyRes.status).toBe(200);

    const signupRes = await client.post('/signup', {
      name: 'Registered User G',
      email: regEmail,
      phone: '9845112233',
      password: 'StrongPassword123!'
    });
    expect([200, 201]).toContain(signupRes.status);

    const limitAfterReg = await OtpSendLimit.findOne({ email: regEmail });
    expect(limitAfterReg).toBeNull();

    // 2. Reset after 24 hours
    const staleEmail = 'stale_24h_case_g@example.com';
    await client.post('/send-email-otp', { email: staleEmail });
    await client.post('/send-email-otp', { email: staleEmail });
    await client.post('/send-email-otp', { email: staleEmail });
    const staleLimit = await OtpSendLimit.findOne({ email: staleEmail });
    expect(staleLimit.sendCount).toBe(3);

    // Move lastSentAt back by 24 hours + 1 minute
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 + 1) * 60 * 1000);
    await OtpSendLimit.updateOne({ email: staleEmail }, { $set: { lastSentAt: twentyFourHoursAgo } });

    // Next send is allowed immediately and resets count to 1
    const resetRes = await client.post('/send-email-otp', { email: staleEmail });
    expect(resetRes.status).toBe(200);
    const refreshedLimit = await OtpSendLimit.findOne({ email: staleEmail });
    expect(refreshedLimit.sendCount).toBe(1);
  });

  it('h) concurrency test: two simultaneous sends at the limit yield exactly one 200 and one 429, exactly 1 email sent', async () => {
    const email = 'concurrent_case_h@example.com';

    // Perform 3 immediate sends
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    await client.post('/send-email-otp', { email });
    expect(emailSpy).toHaveBeenCalledTimes(3);

    // Move lastSentAt back 5 min + 1 sec so exactly 1 slot opens
    await OtpSendLimit.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 301000) } });

    const emailCountBefore = emailSpy.mock.calls.length;

    // Fire 2 simultaneous requests
    const [res1, res2] = await Promise.all([
      client.post('/send-email-otp', { email }),
      client.post('/send-email-otp', { email })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 429]);

    const emailCountAfter = emailSpy.mock.calls.length;
    expect(emailCountAfter - emailCountBefore).toBe(1);
  });

  it('i) 5 wrong codes invalidate the code; the 6th attempt with the right code fails', async () => {
    const email = 'invalid_attempts_case_i@example.com';
    await client.post('/send-email-otp', { email });

    const correctOtp = global.emailOtpStore.get(email).otp;
    expect(correctOtp).toMatch(/^\d{6}$/);

    // Wrong attempts 1 to 4
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await client.post('/verify-email-otp', { email, otp: '000000' });
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain(`${5 - attempt} attempts remaining`);
    }

    // 5th wrong attempt invalidates the code
    const res5 = await client.post('/verify-email-otp', { email, otp: '000000' });
    expect(res5.status).toBe(400);
    expect(res5.data.success).toBe(false);
    expect(res5.data.error).toMatch(/Too many failed attempts|invalidated/i);

    // 6th attempt with CORRECT code must fail
    const res6 = await client.post('/verify-email-otp', { email, otp: correctOtp });
    expect(res6.status).toBe(400);
    expect(res6.data.success).toBe(false);
    expect(res6.data.error).toMatch(/not found or expired|Too many failed attempts/i);
  });

  it('j) real-browser (Playwright) test of the signup page: after the 4th click the countdown text appears and the button is disabled', async () => {
    const page = await browser.newPage();
    const testEmail = 'browser_wait_test@example.com';

    await page.goto(`${baseUrl}/signup.html`, { waitUntil: 'domcontentloaded' });

    // Enter email
    await page.fill('#email', testEmail);

    // Verify Email button becomes visible
    await page.waitForSelector('#verifyEmailBtn', { state: 'visible', timeout: 5000 });

    // Click 1: Verify Email (Send 1)
    await page.click('#verifyEmailBtn');
    await page.waitForSelector('#resendOtpBtn', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#emailStatus', { state: 'visible', timeout: 5000 });
    const emailStatus1 = await page.textContent('#emailStatus');
    expect(emailStatus1).toContain('Verification code sent');

    // Click 2: Resend (Send 2)
    await page.click('#resendOtpBtn');
    await page.waitForFunction(() => {
      const btn = document.getElementById('resendOtpBtn');
      return btn && !btn.disabled && btn.textContent.includes('Resend Code');
    }, { timeout: 10000 });

    // Click 3: Resend (Send 3)
    await page.click('#resendOtpBtn');
    await page.waitForFunction(() => {
      const btn = document.getElementById('resendOtpBtn');
      return btn && !btn.disabled && btn.textContent.includes('Resend Code');
    }, { timeout: 10000 });

    // Click 4: Resend (Send 4) -> triggers HTTP 429!
    await page.click('#resendOtpBtn');

    // Wait for button to be disabled
    await page.waitForFunction(() => {
      const btn = document.getElementById('resendOtpBtn');
      return btn && btn.disabled === true;
    }, { timeout: 10000 });

    const isBtnDisabled = await page.isDisabled('#resendOtpBtn');
    expect(isBtnDisabled).toBe(true);

    // Assert countdown text appears in #otpStatus
    const statusText = await page.textContent('#otpStatus');
    expect(statusText).toMatch(/Please wait (5 min 0 sec|4 min 59 sec|4 min 58 sec) before requesting a new code/i);

    // Wait 1.1s and verify countdown ticks down live
    await page.waitForTimeout(1100);
    const updatedStatusText = await page.textContent('#otpStatus');
    expect(updatedStatusText).toMatch(/Please wait (4 min 59 sec|4 min 58 sec|4 min 57 sec) before requesting a new code/i);

    // Resend button remains disabled during countdown
    const isStillDisabled = await page.isDisabled('#resendOtpBtn');
    expect(isStillDisabled).toBe(true);

    await page.close();
  });

});
