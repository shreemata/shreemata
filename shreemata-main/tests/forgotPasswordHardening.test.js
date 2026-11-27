/**
 * Strict unit and integration tests for Forgot Password Hardening,
 * Escalating Wait Times, Daily IP Limits, Mistyped Domains, and VIP Withdrawal Email Constants.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const OtpSendLimit = require('../models/OtpSendLimit');
const { OtpIpLimit, OtpDailyIpLimit } = require('../models/OtpSendLimit');
const authRoutes = require('../routes/auth');
const commissionRoutes = require('../routes/commissionSettings');
const emailService = require('../utils/emailService');
const sendMail = require('../utils/sendMail');

jest.setTimeout(60000);

let server;
let client;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/commission', commissionRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}`,
        validateStatus: () => true
      });
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await teardownTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  if (global.passwordResetOtpStore) {
    global.passwordResetOtpStore.clear();
  }
  if (global.emailOtpStore) {
    global.emailOtpStore.clear();
  }
  jest.restoreAllMocks();
});

describe('Forgot Password Hardening & Rate Limiting Suite', () => {

  it('1. reset sends 1-3 immediate, send 4 returns 429 with retryAfterSeconds 299 or 300', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Wait User',
      email: 'waituser@example.com',
      password: hashedPassword
    });

    const sendEmailSpy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({
      success: true,
      messageId: 'mock_pwreset_msg_1'
    });

    // Send 1 - Immediate
    const res1 = await client.post('/api/auth/forgot-password-send-email-otp', {
      email: 'waituser@example.com'
    });
    expect(res1.status).toBe(200);
    expect(res1.data.success).toBe(true);

    // Send 2 - Immediate
    const res2 = await client.post('/api/auth/forgot-password-send-email-otp', {
      email: 'waituser@example.com'
    });
    expect(res2.status).toBe(200);
    expect(res2.data.success).toBe(true);

    // Send 3 - Immediate
    const res3 = await client.post('/api/auth/forgot-password-send-email-otp', {
      email: 'waituser@example.com'
    });
    expect(res3.status).toBe(200);
    expect(res3.data.success).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalledTimes(3);

    // Send 4 - Must wait 5 minutes (300 seconds)
    const res4 = await client.post('/api/auth/forgot-password-send-email-otp', {
      email: 'waituser@example.com'
    });
    expect(res4.status).toBe(429);
    expect(res4.data.success).toBe(false);
    expect(res4.data.error).toBe('Please wait before requesting another code');
    expect(res4.data.retryAfterSeconds).toBeGreaterThanOrEqual(299);
    expect(res4.data.retryAfterSeconds).toBeLessThanOrEqual(300);
    expect(res4.headers['retry-after']).toBe(String(res4.data.retryAfterSeconds));

    // Email dispatch must NOT have occurred for blocked send 4
    expect(sendEmailSpy).toHaveBeenCalledTimes(3);
  });

  it('2. the 5/10/15/60-minute steps', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Escalate User',
      email: 'escalate@example.com',
      password: hashedPassword
    });

    jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({
      success: true,
      messageId: 'mock_msg'
    });

    // Exhaust immediate sends 1, 2, 3
    await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });

    // Step A: Send 4 waits 5 minutes. Simulate 5 minutes elapsed.
    let doc = await OtpSendLimit.findOne({ email: 'pwreset:escalate@example.com' });
    doc.lastSentAt = new Date(Date.now() - 5 * 60 * 1000 - 1000);
    await doc.save();

    const res4 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res4.status).toBe(200);

    // Immediate send 5 must wait 10 minutes (~600s)
    const res5Blocked = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res5Blocked.status).toBe(429);
    expect(res5Blocked.data.retryAfterSeconds).toBeGreaterThanOrEqual(599);
    expect(res5Blocked.data.retryAfterSeconds).toBeLessThanOrEqual(600);

    // Step B: Simulate 10 minutes elapsed. Send 5 succeeds.
    doc = await OtpSendLimit.findOne({ email: 'pwreset:escalate@example.com' });
    doc.lastSentAt = new Date(Date.now() - 10 * 60 * 1000 - 1000);
    await doc.save();

    const res5 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res5.status).toBe(200);

    // Immediate send 6 must wait 15 minutes (~900s)
    const res6Blocked = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res6Blocked.status).toBe(429);
    expect(res6Blocked.data.retryAfterSeconds).toBeGreaterThanOrEqual(899);
    expect(res6Blocked.data.retryAfterSeconds).toBeLessThanOrEqual(900);

    // Step C: Simulate 15 minutes elapsed. Send 6 succeeds.
    doc = await OtpSendLimit.findOne({ email: 'pwreset:escalate@example.com' });
    doc.lastSentAt = new Date(Date.now() - 15 * 60 * 1000 - 1000);
    await doc.save();

    const res6 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res6.status).toBe(200);

    // Immediate send 7 must wait 60 minutes (~3600s)
    const res7Blocked = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res7Blocked.status).toBe(429);
    expect(res7Blocked.data.retryAfterSeconds).toBeGreaterThanOrEqual(3599);
    expect(res7Blocked.data.retryAfterSeconds).toBeLessThanOrEqual(3600);

    // Step D: Simulate 60 minutes elapsed. Send 7 succeeds.
    doc = await OtpSendLimit.findOne({ email: 'pwreset:escalate@example.com' });
    doc.lastSentAt = new Date(Date.now() - 60 * 60 * 1000 - 1000);
    await doc.save();

    const res7 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'escalate@example.com' });
    expect(res7.status).toBe(200);
  });

  it('3. register and reset counters independent', async () => {
    jest.spyOn(emailService, 'sendEmailOTP').mockResolvedValue({ success: true, messageId: 'reg_msg' });
    jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'reset_msg' });

    // Send 3 register OTPs for an unregistered email
    await client.post('/api/auth/send-email-otp', { email: 'dual@example.com' });
    await client.post('/api/auth/send-email-otp', { email: 'dual@example.com' });
    await client.post('/api/auth/send-email-otp', { email: 'dual@example.com' });

    // 4th register OTP must be blocked with 429 (5 minute wait)
    const regRes4 = await client.post('/api/auth/send-email-otp', { email: 'dual@example.com' });
    expect(regRes4.status).toBe(429);
    expect(regRes4.data.error).toBe('Please wait before requesting another code');

    // Now register the user in User collection
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Dual User',
      email: 'dual@example.com',
      password: hashedPassword
    });

    // Reset OTP counter for the exact same email must start clean (sends 1, 2, 3 immediate)
    const resetRes1 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'dual@example.com' });
    expect(resetRes1.status).toBe(200);

    const resetRes2 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'dual@example.com' });
    expect(resetRes2.status).toBe(200);

    const resetRes3 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'dual@example.com' });
    expect(resetRes3.status).toBe(200);

    // 4th reset OTP now blocked with 429
    const resetRes4 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'dual@example.com' });
    expect(resetRes4.status).toBe(429);
    expect(resetRes4.data.error).toBe('Please wait before requesting another code');

    // Verify separate records exist in OtpSendLimit
    const regDoc = await OtpSendLimit.findOne({ email: 'dual@example.com' });
    const resetDoc = await OtpSendLimit.findOne({ email: 'pwreset:dual@example.com' });

    expect(regDoc).toBeDefined();
    expect(resetDoc).toBeDefined();
    expect(regDoc.sendCount).toBe(3);
    expect(resetDoc.sendCount).toBe(3);
  });

  it('4. case/space variants share one counter', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Case User',
      email: 'caseuser@example.com',
      password: hashedPassword
    });

    jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'case_msg' });

    // Send 1 with spaces and uppercase
    const res1 = await client.post('/api/auth/forgot-password-send-email-otp', { email: '  CaseUser@Example.COM  ' });
    expect(res1.status).toBe(200);

    // Send 2 with lowercase
    const res2 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'caseuser@example.com' });
    expect(res2.status).toBe(200);

    // Send 3 with mixed case
    const res3 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'CaseUser@example.com' });
    expect(res3.status).toBe(200);

    // Send 4 should be blocked under the same shared counter
    const res4 = await client.post('/api/auth/forgot-password-send-email-otp', { email: 'CASEUSER@EXAMPLE.COM' });
    expect(res4.status).toBe(429);
    expect(res4.data.error).toBe('Please wait before requesting another code');

    // Only one record in DB for this email
    const records = await OtpSendLimit.find({ email: /caseuser/ });
    expect(records.length).toBe(1);
    expect(records[0].email).toBe('pwreset:caseuser@example.com');
  });

  it('5. unknown email has identical status sequence and JSON body sequence to known email and sends zero emails', async () => {
    const sendSpy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'm' });

    const hashedPassword = await bcrypt.hash('KnownPass123!', 10);
    await User.create({
      name: 'Known User',
      email: 'known_sequence@example.com',
      password: hashedPassword
    });

    // 1. Send 6 consecutive requests for known email
    const knownResponses = [];
    for (let i = 0; i < 6; i++) {
      // Clear IP rate limit records between requests so IP limit never blocks before email limit
      await OtpDailyIpLimit.deleteMany({});
      await OtpIpLimit.deleteMany({});
      const res = await client.post('/api/auth/forgot-password-send-email-otp', {
        email: 'known_sequence@example.com'
      });
      knownResponses.push(res);
    }

    // 2. Send 6 consecutive requests for unknown email
    const unknownResponses = [];
    for (let i = 0; i < 6; i++) {
      // Clear IP rate limit records between requests so IP limit never blocks before email limit
      await OtpDailyIpLimit.deleteMany({});
      await OtpIpLimit.deleteMany({});
      const res = await client.post('/api/auth/forgot-password-send-email-otp', {
        email: 'ghost_sequence_999@example.com'
      });
      unknownResponses.push(res);
    }

    // Verify status sequence: [200, 200, 200, 429, 429, 429]
    expect(knownResponses.map(r => r.status)).toEqual([200, 200, 200, 429, 429, 429]);
    expect(unknownResponses.map(r => r.status)).toEqual([200, 200, 200, 429, 429, 429]);

    // Verify field-by-field JSON bodies
    for (let i = 0; i < 6; i++) {
      const kData = knownResponses[i].data;
      const uData = unknownResponses[i].data;

      expect(uData.success).toBe(kData.success);

      if (kData.success) {
        expect(uData.message).toBe(kData.message);
      } else {
        expect(uData.error).toBe(kData.error);
        expect(typeof uData.retryAfterSeconds).toBe('number');
        expect(typeof kData.retryAfterSeconds).toBe('number');
        // retryAfterSeconds allowed to differ by at most 1 second
        const diff = Math.abs(uData.retryAfterSeconds - kData.retryAfterSeconds);
        expect(diff).toBeLessThanOrEqual(1);
      }
    }

    // Assert that unknown email never causes a send call (only the 3 successful known requests sent email)
    expect(sendSpy).toHaveBeenCalledTimes(3);
    for (const call of sendSpy.mock.calls) {
      expect(call[0]).toBe('known_sequence@example.com');
      expect(call[0]).not.toContain('ghost_sequence_999');
    }

    sendSpy.mockRestore();
  });

  it('6. daily IP cap returns 429 for both paths', async () => {
    const testIp = '198.51.100.42';

    // Seed daily IP count at limit (300)
    await OtpDailyIpLimit.create({
      ip: testIp,
      count: 300,
      firstSentAt: new Date()
    });

    // Register path blocked by daily IP cap
    const regRes = await client.post(
      '/api/auth/send-email-otp',
      { email: 'newregister@example.com' },
      { headers: { 'X-Forwarded-For': testIp } }
    );
    expect(regRes.status).toBe(429);
    expect(regRes.data.error).toContain('Too many requests from this IP address');

    // Reset path blocked by daily IP cap
    const resetRes = await client.post(
      '/api/auth/forgot-password-send-email-otp',
      { email: 'known@example.com' },
      { headers: { 'X-Forwarded-For': testIp } }
    );
    expect(resetRes.status).toBe(429);
    expect(resetRes.data.error).toContain('Too many requests from this IP address');
  });

  it('7. concurrency: two simultaneous sends at the limit, exactly one email', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Race User',
      email: 'raceuser@example.com',
      password: hashedPassword
    });

    const sendSpy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockImplementation(async () => {
      // Simulate real I/O delay
      await new Promise((r) => setTimeout(r, 20));
      return { success: true, messageId: 'race_msg' };
    });

    // Set count to 2 (next send is 3rd immediate, following is 4th which must be blocked)
    await OtpSendLimit.create({
      email: 'pwreset:raceuser@example.com',
      sendCount: 2,
      lastSentAt: new Date(Date.now() - 60000)
    });

    // Launch two simultaneous requests
    const [resA, resB] = await Promise.all([
      client.post('/api/auth/forgot-password-send-email-otp', { email: 'raceuser@example.com' }),
      client.post('/api/auth/forgot-password-send-email-otp', { email: 'raceuser@example.com' })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 429]);

    // Exactly one email sent
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const doc = await OtpSendLimit.findOne({ email: 'pwreset:raceuser@example.com' });
    expect(doc.sendCount).toBe(3);
  });

  it('8. 5 wrong codes invalidate the code', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Brute User',
      email: 'brute@example.com',
      password: hashedPassword
    });

    jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'brute_msg' });

    // Request reset OTP
    await client.post('/api/auth/forgot-password-send-email-otp', { email: 'brute@example.com' });
    expect(global.passwordResetOtpStore.get('brute@example.com')).toBeDefined();

    // Wrong attempts 1 to 4
    for (let i = 1; i <= 4; i++) {
      const wrongRes = await client.post('/api/auth/forgot-password-verify-email-otp', {
        email: 'brute@example.com',
        otp: '999999'
      });
      expect(wrongRes.status).toBe(400);
      expect(wrongRes.data.error).toContain(`${5 - i} attempt`);
      expect(global.passwordResetOtpStore.get('brute@example.com')).toBeDefined();
    }

    // 5th wrong attempt - should invalidate and remove OTP from store
    const wrongRes5 = await client.post('/api/auth/forgot-password-verify-email-otp', {
      email: 'brute@example.com',
      otp: '999999'
    });
    expect(wrongRes5.status).toBe(400);
    expect(wrongRes5.data.error).toContain('Too many failed attempts');
    expect(global.passwordResetOtpStore.get('brute@example.com')).toBeUndefined();

    // Subsequent 6th attempt - code no longer exists
    const wrongRes6 = await client.post('/api/auth/forgot-password-verify-email-otp', {
      email: 'brute@example.com',
      otp: '999999'
    });
    expect(wrongRes6.status).toBe(400);
    expect(wrongRes6.data.error).toContain('expired');
  });

  it('9. code never appears in console output', async () => {
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    await User.create({
      name: 'Log User',
      email: 'loguser@example.com',
      password: hashedPassword
    });

    let generatedOtp = null;
    jest.spyOn(emailService, 'sendPasswordResetOTP').mockImplementation(async (email, otp) => {
      generatedOtp = otp;
      return { success: true, messageId: 'log_msg' };
    });

    const consoleLogs = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogs.push(args.join(' '));
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
      consoleLogs.push(args.join(' '));
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      consoleLogs.push(args.join(' '));
    });

    await client.post('/api/auth/forgot-password-send-email-otp', { email: 'loguser@example.com' });

    expect(generatedOtp).toBeDefined();
    expect(generatedOtp.length).toBe(6);

    const allOutput = consoleLogs.join('\n');
    expect(allOutput).not.toContain(generatedOtp);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('10. typo domain rejected with zero counters consumed', async () => {
    const sendSpy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true });

    const typoRes = await client.post('/api/auth/forgot-password-send-email-otp', {
      email: 'desai@gamil.com'
    });

    expect(typoRes.status).toBe(400);
    expect(typoRes.data.success).toBe(false);
    expect(typoRes.data.error).toBe('Did you mean desai@gmail.com?');
    expect(typoRes.data.suggestion).toBe('desai@gmail.com');

    // No emails sent
    expect(sendSpy).not.toHaveBeenCalled();

    // No counters in DB
    const sendLimits = await OtpSendLimit.find({});
    expect(sendLimits.length).toBe(0);

    const ipLimits = await OtpIpLimit.find({});
    expect(ipLimits.length).toBe(0);

    const dailyIpLimits = await OtpDailyIpLimit.find({});
    expect(dailyIpLimits.length).toBe(0);
  });

  it('11. VIP emails contain the constant values from the code (not "₹50")', async () => {
    // Assert exported constants
    expect(commissionRoutes.VIP_MIN_WITHDRAWAL).toBe(100);
    expect(commissionRoutes.VIP_MANDATORY_RESERVE).toBe(100);
    expect(authRoutes.VIP_MIN_WITHDRAWAL).toBe(100);
    expect(authRoutes.VIP_MANDATORY_RESERVE).toBe(100);

    // Read file contents of both routes and assert "Mandatory ₹50" is gone and replaced by the constant
    const fs = require('fs');
    const authCode = fs.readFileSync('routes/auth.js', 'utf8');
    const commCode = fs.readFileSync('routes/commissionSettings.js', 'utf8');

    expect(authCode).not.toContain('Mandatory ₹50 reserve maintained');
    expect(authCode).toContain('Mandatory ₹${VIP_MANDATORY_RESERVE} reserve maintained');

    expect(commCode).not.toContain('Mandatory ₹50 reserve maintained');
    expect(commCode).toContain('Mandatory ₹${VIP_MANDATORY_RESERVE} reserve maintained');
  });

});
