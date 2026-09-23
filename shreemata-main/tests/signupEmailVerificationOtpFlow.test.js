process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const authRoutes = require('../routes/auth');
const emailService = require('../utils/emailService');

jest.setTimeout(60000);

let server;
let client;
let sendEmailOTPSpy;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', authRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api`,
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
  if (global.emailOtpStore) {
    global.emailOtpStore.clear();
  }
  jest.restoreAllMocks();
  sendEmailOTPSpy = jest.spyOn(emailService, 'sendEmailOTP').mockResolvedValue({
    success: true,
    messageId: 'test_signup_otp_msg_id'
  });
});

describe('Signup Email Verification OTP Flow Suite', () => {

  it('1. rejects missing or invalid email format', async () => {
    const res1 = await client.post('/send-email-otp', {});
    expect(res1.status).toBe(400);
    expect(res1.data.error).toMatch(/Email is required/i);

    const res2 = await client.post('/send-email-otp', { email: 'not-an-email' });
    expect(res2.status).toBe(400);
    expect(res2.data.error).toMatch(/Invalid email format/i);
  });

  it('2. rejects email if already registered', async () => {
    const hashedPassword = await bcrypt.hash('Secret123!', 10);
    await User.create({
      name: 'Existing User',
      email: 'existing@example.com',
      phone: '9876543210',
      password: hashedPassword
    });

    const res = await client.post('/send-email-otp', { email: 'EXISTING@example.com' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/Email is already registered/i);
  });

  it('3. generates 6-digit OTP, stores expiry, and invokes emailService.sendEmailOTP', async () => {
    const testEmail = 'newuser@example.com';
    const res = await client.post('/send-email-otp', { email: testEmail });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.message).toMatch(/Verification code sent to your email/i);

    // Verify spy called
    expect(sendEmailOTPSpy).toHaveBeenCalledTimes(1);
    const [calledEmail, calledOtp] = sendEmailOTPSpy.mock.calls[0];
    expect(calledEmail).toBe(testEmail);
    expect(calledOtp).toMatch(/^\d{6}$/);

    // Verify stored in emailOtpStore
    const stored = global.emailOtpStore.get(testEmail);
    expect(stored).toBeDefined();
    expect(stored.otp).toBe(calledOtp);
    expect(stored.isEmailVerification).toBe(true);
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it('4. safely handles SMTP failure, invalidates OTP, returns 500 without leaking secrets', async () => {
    sendEmailOTPSpy.mockResolvedValueOnce({
      success: false,
      error: 'Invalid login: 535-5.7.8 Username and Password not accepted'
    });

    const testEmail = 'smtp_fail@example.com';
    const res = await client.post('/send-email-otp', { email: testEmail });

    expect(res.status).toBe(500);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toMatch(/Failed to send verification email\. Please try again\./i);

    // Ensure OTP was cleaned up so it cannot be guessed
    expect(global.emailOtpStore.get(testEmail)).toBeUndefined();
  });

  it('5. successfully verifies valid OTP and flags email as verified', async () => {
    const testEmail = 'verify_success@example.com';
    await client.post('/send-email-otp', { email: testEmail });

    const storedOtp = global.emailOtpStore.get(testEmail).otp;

    const res = await client.post('/verify-email-otp', {
      email: testEmail,
      otp: storedOtp
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.message).toMatch(/Email verified successfully/i);

    const stored = global.emailOtpStore.get(testEmail);
    expect(stored.verified).toBe(true);
  });

  it('6. rejects invalid OTP and decrements remaining attempts', async () => {
    const testEmail = 'verify_wrong@example.com';
    await client.post('/send-email-otp', { email: testEmail });

    const res = await client.post('/verify-email-otp', {
      email: testEmail,
      otp: '000000'
    });

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toMatch(/2 attempts remaining/i);
  });

  it('7. rate limits consecutive OTP requests within cooldown window', async () => {
    const testEmail = 'cooldown@example.com';
    const firstRes = await client.post('/send-email-otp', { email: testEmail });
    expect(firstRes.status).toBe(200);

    const secondRes = await client.post('/send-email-otp', { email: testEmail });
    expect(secondRes.status).toBe(429);
    expect(secondRes.data.error).toMatch(/Please wait \d+ seconds/i);
  });

  it('8. blocks signup when email is unverified and allows signup when verified', async () => {
    const testEmail = 'signup_flow@example.com';
    
    // Attempt signup without verification
    const unverifiedSignupRes = await client.post('/signup', {
      name: 'Test Candidate',
      email: testEmail,
      phone: '9812345678',
      password: 'SecurePassword123!'
    });
    expect(unverifiedSignupRes.status).toBe(400);
    expect(unverifiedSignupRes.data.error).toMatch(/Please verify your email address/i);

    // Now request OTP and verify it
    await client.post('/send-email-otp', { email: testEmail });
    const otp = global.emailOtpStore.get(testEmail).otp;
    const verifyRes = await client.post('/verify-email-otp', {
      email: testEmail,
      otp: otp
    });
    expect(verifyRes.status).toBe(200);

    // Now signup succeeds
    const verifiedSignupRes = await client.post('/signup', {
      name: 'Test Candidate',
      email: testEmail,
      phone: '9812345678',
      password: 'SecurePassword123!'
    });
    expect([200, 201]).toContain(verifiedSignupRes.status);
    expect(verifiedSignupRes.data.token).toBeDefined();
    expect(verifiedSignupRes.data.user).toBeDefined();
    expect(verifiedSignupRes.data.user.email).toBe(testEmail);
  });

});
