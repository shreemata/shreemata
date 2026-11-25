/**
 * Test fixture for browser tests:
 * Preloaded into the test dev-server child process via node's --require flag.
 * Intercepts emailService.sendEmailOTP so that verification codes can be
 * captured by integration test runners without leaking codes into production server logs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const emailService = require('../../utils/emailService');

const originalSendEmailOTP = emailService.sendEmailOTP;

emailService.sendEmailOTP = async function (email, otp, ...args) {
  // 1. Emit explicit test capture line to stdout
  try {
    process.stdout.write(`TEST_OTP_CAPTURE:${email}:${otp}\n`);
  } catch (err) {}

  // 2. Also write to OS temp directory for atomic file capture
  try {
    const captureDir = path.join(os.tmpdir(), 'shreemata-test-otp');
    if (!fs.existsSync(captureDir)) {
      fs.mkdirSync(captureDir, { recursive: true });
    }
    const safeEmail = String(email).replace(/[^a-zA-Z0-9_.-]/g, '_');
    fs.writeFileSync(path.join(captureDir, `${safeEmail}.otp`), String(otp), 'utf-8');
  } catch (err) {}

  // 3. Delegate to original emailService implementation
  if (typeof originalSendEmailOTP === 'function') {
    return originalSendEmailOTP.call(this, email, otp, ...args);
  }
  return { success: true, messageId: 'test_captured_otp' };
};
