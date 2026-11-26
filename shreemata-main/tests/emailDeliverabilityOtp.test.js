/**
 * Unit tests for OTP, verification, and password-reset email deliverability:
 * - Content & headers (From display name, Reply-To, calm subject, plain text & HTML alternatives)
 * - Security (OTP code never logged in console output, no <img tracking pixels/images)
 * - Deliverability best practices (expiry stated, purpose stated, ignore instructions, calm footer)
 */

const emailService = require('../utils/emailService');

describe('Email Deliverability & Header Safety for OTP / Verification / Password Reset', () => {
  let sendSafelySpy;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let consoleInfoSpy;

  beforeEach(() => {
    // Intercept sendEmailSafely to inspect outgoing mailOptions
    sendSafelySpy = jest.spyOn(emailService, 'sendEmailSafely').mockResolvedValue({
      messageId: 'test_deliverability_msg_101',
      accepted: ['customer@example.com'],
      rejected: [],
      response: '250 OK'
    });

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function getAllLoggedOutput() {
    const logCalls = consoleLogSpy.mock.calls.map(args => args.join(' '));
    const errorCalls = consoleErrorSpy.mock.calls.map(args => args.join(' '));
    const warnCalls = consoleWarnSpy.mock.calls.map(args => args.join(' '));
    const infoCalls = consoleInfoSpy.mock.calls.map(args => args.join(' '));
    return [...logCalls, ...errorCalls, ...warnCalls, ...infoCalls].join('\n');
  }

  describe('1. Registration Email Verification OTP (sendEmailOTP)', () => {
    const testEmail = 'newcustomer@example.com';
    const testOtp = '749201';

    it('sets calm subject without emojis, exclamation marks, or spam trigger words', async () => {
      const result = await emailService.sendEmailOTP(testEmail, testOtp);
      expect(result.success).toBe(true);

      expect(sendSafelySpy).toHaveBeenCalledTimes(1);
      const [mailOptions] = sendSafelySpy.mock.calls[0];

      expect(mailOptions.subject).toBe('Your Shree Mata verification code');
      // Assert no emojis, exclamation marks, or spam trigger words
      expect(mailOptions.subject).not.toMatch(/[!🎉📚⚠️👑🔐🔥]/);
      expect(mailOptions.subject).not.toMatch(/\b(FREE|URGENT|WINNER|ACT NOW)\b/i);
    });

    it('sets From display name to "Shree Mata" and populates Reply-To header', async () => {
      await emailService.sendEmailOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.from).toMatch(/^"Shree Mata"\s*<.+@.+>$/);
      expect(mailOptions.replyTo).toBeDefined();
      expect(typeof mailOptions.replyTo).toBe('string');
      expect(mailOptions.replyTo.length).toBeGreaterThan(0);
      expect(mailOptions.replyTo).toMatch(/@/);
    });

    it('provides both text and html alternatives containing identical code and expiry', async () => {
      await emailService.sendEmailOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];

      expect(mailOptions.text).toBeDefined();
      expect(typeof mailOptions.text).toBe('string');
      expect(mailOptions.html).toBeDefined();
      expect(typeof mailOptions.html).toBe('string');

      // Both contain identical 6-digit code
      expect(mailOptions.text).toContain(testOtp);
      expect(mailOptions.html).toContain(testOtp);

      // Both contain expiry time
      expect(mailOptions.text).toMatch(/10 minutes/i);
      expect(mailOptions.html).toMatch(/10 minutes/i);

      // Both state who sent it and why
      expect(mailOptions.text).toMatch(/You asked to register at shreemata\.com/i);
      expect(mailOptions.html).toMatch(/You asked to register at shreemata\.com/i);

      // Both contain ignore instruction
      expect(mailOptions.text).toMatch(/If you did not request this, ignore this email/i);
      expect(mailOptions.html).toMatch(/If you did not request this, ignore this email/i);

      // Both contain business name and website
      expect(mailOptions.text).toContain('Shree Mata');
      expect(mailOptions.text).toContain('https://shreemata.com');
      expect(mailOptions.html).toContain('Shree Mata');
      expect(mailOptions.html).toContain('shreemata.com');
    });

    it('contains NO <img tags, no link shorteners, and at most one link in html', async () => {
      await emailService.sendEmailOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];

      // NO <img tags
      expect(mailOptions.html).not.toMatch(/<img/i);

      // At most one link, pointing to shreemata.com
      const links = mailOptions.html.match(/<a\s+[^>]*href=["']([^"']+)["']/gi) || [];
      expect(links.length).toBeLessThanOrEqual(1);
      if (links.length > 0) {
        expect(links[0]).toMatch(/shreemata\.com/);
        expect(links[0]).not.toMatch(/bit\.ly|tinyurl|t\.co|goo\.gl/i);
      }
    });

    it('NEVER prints or leaks the OTP code into console output during dispatch', async () => {
      await emailService.sendEmailOTP(testEmail, testOtp);

      const allOutput = getAllLoggedOutput();
      expect(allOutput).not.toContain(testOtp);
    });
  });

  describe('2. Password Reset OTP (sendPasswordResetOTP)', () => {
    const testEmail = 'resetuser@example.com';
    const testOtp = '924816';

    it('sets calm subject without emojis, exclamation marks, or spam trigger words', async () => {
      const result = await emailService.sendPasswordResetOTP(testEmail, testOtp);
      expect(result.success).toBe(true);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.subject).toBe('Your Shree Mata password reset code');
      expect(mailOptions.subject).not.toMatch(/[!🎉📚⚠️👑🔐🔥]/);
      expect(mailOptions.subject).not.toMatch(/\b(FREE|URGENT|WINNER|ACT NOW)\b/i);
    });

    it('sets From display name to "Shree Mata" and populates Reply-To header', async () => {
      await emailService.sendPasswordResetOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.from).toMatch(/^"Shree Mata"\s*<.+@.+>$/);
      expect(mailOptions.replyTo).toBeDefined();
      expect(mailOptions.replyTo).toMatch(/@/);
    });

    it('provides both text and html alternatives containing identical code and expiry', async () => {
      await emailService.sendPasswordResetOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];

      expect(mailOptions.text).toBeDefined();
      expect(mailOptions.html).toBeDefined();

      // Both contain identical 6-digit code
      expect(mailOptions.text).toContain(testOtp);
      expect(mailOptions.html).toContain(testOtp);

      // Both contain expiry time
      expect(mailOptions.text).toMatch(/10 minutes/i);
      expect(mailOptions.html).toMatch(/10 minutes/i);

      // Both state who sent it and why
      expect(mailOptions.text).toMatch(/You asked to reset your password at shreemata\.com/i);
      expect(mailOptions.html).toMatch(/You asked to reset your password at shreemata\.com/i);

      // Both contain ignore instruction
      expect(mailOptions.text).toMatch(/If you did not request this, ignore this email/i);
      expect(mailOptions.html).toMatch(/If you did not request this, ignore this email/i);

      // Both contain business name and website in footer
      expect(mailOptions.text).toContain('Shree Mata');
      expect(mailOptions.text).toContain('https://shreemata.com');
      expect(mailOptions.html).toContain('Shree Mata');
      expect(mailOptions.html).toContain('shreemata.com');
    });

    it('contains NO <img tags in html', async () => {
      await emailService.sendPasswordResetOTP(testEmail, testOtp);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.html).not.toMatch(/<img/i);
    });

    it('NEVER prints or leaks the OTP code into console output during dispatch', async () => {
      await emailService.sendPasswordResetOTP(testEmail, testOtp);

      const allOutput = getAllLoggedOutput();
      expect(allOutput).not.toContain(testOtp);
    });
  });

  describe('3. Salary Update OTP (sendSalaryUpdateOTP)', () => {
    const employee = { name: 'Ramesh Patil', employeeId: 'EMP-042', email: 'ramesh@example.com' };
    const testOtp = '417382';
    const salaryDetails = { totalSalary: 25000, period: '2026-11', paymentStatus: 'approved' };

    it('sets calm subject, From "Shree Mata", Reply-To set, and no <img tags', async () => {
      const result = await emailService.sendSalaryUpdateOTP(employee, testOtp, salaryDetails);
      expect(result.success).toBe(true);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.subject).toBe('Your Shree Mata salary verification code');
      expect(mailOptions.from).toMatch(/^"Shree Mata"\s*<.+@.+>$/);
      expect(mailOptions.replyTo).toBeDefined();
      expect(mailOptions.replyTo).toMatch(/@/);

      // Both text and html exist
      expect(mailOptions.text).toContain(testOtp);
      expect(mailOptions.html).toContain(testOtp);
      expect(mailOptions.text).toMatch(/10 minutes/i);
      expect(mailOptions.html).toMatch(/10 minutes/i);

      // Ignore instruction present
      expect(mailOptions.text).toMatch(/If you did not request this, ignore this email/i);
      expect(mailOptions.html).toMatch(/If you did not request this, ignore this email/i);

      // NO <img tags
      expect(mailOptions.html).not.toMatch(/<img/i);
    });

    it('NEVER prints or leaks the salary OTP code into console output', async () => {
      await emailService.sendSalaryUpdateOTP(employee, testOtp, salaryDetails);

      const allOutput = getAllLoggedOutput();
      expect(allOutput).not.toContain(testOtp);
    });
  });

  describe('4. Employee Account Verification Email (sendEmployeeVerificationEmail)', () => {
    const employee = { name: 'Suresh Kumar', employeeId: 'EMP-088', email: 'suresh@example.com' };
    const token = 'tok_verification_abc123xyz';

    it('sets calm subject, From "Shree Mata", Reply-To, both text & html, and no <img tags', async () => {
      const result = await emailService.sendEmployeeVerificationEmail(employee, token);
      expect(result.success).toBe(true);

      const [mailOptions] = sendSafelySpy.mock.calls[0];
      expect(mailOptions.subject).toBe('Verify your Shree Mata employee account');
      expect(mailOptions.subject).not.toMatch(/[!🎉📚⚠️👑🔐🔥]/);
      expect(mailOptions.from).toMatch(/^"Shree Mata"\s*<.+@.+>$/);
      expect(mailOptions.replyTo).toBeDefined();
      expect(mailOptions.replyTo).toMatch(/@/);

      expect(mailOptions.text).toContain(token);
      expect(mailOptions.html).toContain(token);
      expect(mailOptions.text).toMatch(/24 hours/i);
      expect(mailOptions.html).toMatch(/24 hours/i);

      // NO <img tags
      expect(mailOptions.html).not.toMatch(/<img/i);
    });
  });

  describe('5. Error Handling & Console Safety on Dispatch Failure', () => {
    it('handles dispatch failure gracefully without leaking code in error logs', async () => {
      sendSafelySpy.mockRejectedValueOnce(new Error('SMTP Transport Connection Timeout'));

      const testOtp = '839215';
      const result = await emailService.sendEmailOTP('failuser@example.com', testOtp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP Transport Connection Timeout');

      const allOutput = getAllLoggedOutput();
      expect(allOutput).not.toContain(testOtp);
    });
  });
});
