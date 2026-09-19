process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const authRoutes = require('../routes/auth');
const emailService = require('../utils/emailService');

jest.setTimeout(60000);

let server;
let client;
let sendPasswordResetOTPSpy;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api/auth`,
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
  jest.restoreAllMocks();
  sendPasswordResetOTPSpy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'test_msg_id' });
});

describe('Forgot Password Verification Code / OTP Email End-to-End Suite', () => {

  it('1. registered email triggers reset OTP generation & stores expiry', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User',
      email: 'testuser@example.com',
      password: hashedPassword
    });

    const res = await client.post('/forgot-password-send-email-otp', { email: 'TESTUSER@EXAMPLE.COM' });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify OTP store state
    const stored = global.passwordResetOtpStore.get('testuser@example.com');
    expect(stored).toBeDefined();
    expect(stored.otp).toBeDefined();
    expect(stored.otp.length).toBe(6);
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it('2. calls sendPasswordResetOTP with normalized email and 6-digit OTP', async () => {
    const spy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: true, messageId: 'test_msg_id' });
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 2',
      email: 'user2@example.com',
      password: hashedPassword
    });

    await client.post('/forgot-password-send-email-otp', { email: ' USER2@EXAMPLE.COM ' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('user2@example.com', expect.any(String));
  });

  it('3. handles SMTP failure safely without crashing', async () => {
    const spy = jest.spyOn(emailService, 'sendPasswordResetOTP').mockResolvedValue({ success: false, error: 'SMTP Connection Refused' });

    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 3',
      email: 'user3@example.com',
      password: hashedPassword
    });

    const res = await client.post('/forgot-password-send-email-otp', { email: 'user3@example.com' });

    expect(res.status).toBe(500);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toContain('Failed to send password reset email');
  });

  it('4. verifies correct OTP and returns reset token', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 4',
      email: 'user4@example.com',
      password: hashedPassword
    });

    await client.post('/forgot-password-send-email-otp', { email: 'user4@example.com' });
    const stored = global.passwordResetOtpStore.get('user4@example.com');
    const otp = stored.otp;

    const verifyRes = await client.post('/forgot-password-verify-email-otp', {
      email: 'user4@example.com',
      otp: otp
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.success).toBe(true);
    expect(verifyRes.data.resetToken).toBeDefined();
  });

  it('5. rejects wrong OTP with remaining attempts message', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 5',
      email: 'user5@example.com',
      password: hashedPassword
    });

    await client.post('/forgot-password-send-email-otp', { email: 'user5@example.com' });

    const verifyRes = await client.post('/forgot-password-verify-email-otp', {
      email: 'user5@example.com',
      otp: '000000'
    });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.data.success).toBe(false);
    expect(verifyRes.data.error).toContain('Invalid verification code');
  });

  it('6. rejects expired OTP', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 6',
      email: 'user6@example.com',
      password: hashedPassword
    });

    await client.post('/forgot-password-send-email-otp', { email: 'user6@example.com' });
    const stored = global.passwordResetOtpStore.get('user6@example.com');
    stored.expiresAt = Date.now() - 1000; // Force expired

    const verifyRes = await client.post('/forgot-password-verify-email-otp', {
      email: 'user6@example.com',
      otp: stored.otp
    });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.data.error).toContain('expired');
  });

  it('7. prevents reuse of already verified OTP', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 7',
      email: 'user7@example.com',
      password: hashedPassword
    });

    await client.post('/forgot-password-send-email-otp', { email: 'user7@example.com' });
    const stored = global.passwordResetOtpStore.get('user7@example.com');
    const otp = stored.otp;

    // First verification (success)
    await client.post('/forgot-password-verify-email-otp', { email: 'user7@example.com', otp });

    // Second verification attempt with same OTP (should fail)
    const secondRes = await client.post('/forgot-password-verify-email-otp', { email: 'user7@example.com', otp });
    expect(secondRes.status).toBe(400);
    expect(secondRes.data.success).toBe(false);
  });

  it('8. resets password successfully and verifies old password is now invalid', async () => {
    const initialHashedPassword = await bcrypt.hash('OldPassword123!', 10);
    const user = await User.create({
      name: 'Test User 8',
      email: 'user8@example.com',
      password: initialHashedPassword
    });

    // Send & Verify OTP
    await client.post('/forgot-password-send-email-otp', { email: 'user8@example.com' });
    const stored = global.passwordResetOtpStore.get('user8@example.com');
    const verifyRes = await client.post('/forgot-password-verify-email-otp', { email: 'user8@example.com', otp: stored.otp });
    const resetToken = verifyRes.data.resetToken;

    // Execute password reset
    const resetRes = await client.post('/reset-password', {
      resetToken: resetToken,
      newPassword: 'NewSecretPassword456!'
    });

    expect(resetRes.status).toBe(200);
    expect(resetRes.data.success).toBe(true);

    // Verify DB user record
    const updatedUser = await User.findById(user._id);
    const oldPasswordValid = await bcrypt.compare('OldPassword123!', updatedUser.password);
    const newPasswordValid = await bcrypt.compare('NewSecretPassword456!', updatedUser.password);

    expect(oldPasswordValid).toBe(false);
    expect(newPasswordValid).toBe(true);
  });

  it('9. rate limiting cooldown blocks rapid resends', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Test User 9',
      email: 'user9@example.com',
      password: hashedPassword
    });

    // First request
    const firstRes = await client.post('/forgot-password-send-email-otp', { email: 'user9@example.com' });
    expect(firstRes.status).toBe(200);

    // Immediate second request (should trigger cooldown 429)
    const secondRes = await client.post('/forgot-password-send-email-otp', { email: 'user9@example.com' });
    expect(secondRes.status).toBe(429);
    expect(secondRes.data.error).toContain('Please wait');
  });

  it('10. unknown email response does not leak account existence', async () => {
    const res = await client.post('/forgot-password-send-email-otp', { email: 'nonexistent999@example.com' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.message).toContain('If an account exists');
  });

  it('11. alias routes (/forgot-password and /verify-reset-otp) work identically', async () => {
    const hashedPassword = await bcrypt.hash('OldPass123!', 10);
    await User.create({
      name: 'Alias Test User',
      email: 'aliasuser@example.com',
      password: hashedPassword
    });

    const sendRes = await client.post('/forgot-password', { email: 'aliasuser@example.com' });
    expect(sendRes.status).toBe(200);

    const stored = global.passwordResetOtpStore.get('aliasuser@example.com');
    const verifyRes = await client.post('/verify-reset-otp', { email: 'aliasuser@example.com', otp: stored.otp });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.resetToken).toBeDefined();
  });

});
