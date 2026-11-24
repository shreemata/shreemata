/**
 * @jest-environment node
 *
 * tests/securityHardeningRoutes.test.js
 *
 * Comprehensive tests for Security Hardening Round (Sections A, B, C, D)
 * A. Debug Oracle: /api/password-reset/test-answers is admin-only, debug object removed
 * B. Get-Questions: /api/password-reset/get-questions removes userId, returns identical shape/status for unknown emails
 * C. Cleanup-Abandoned: /api/payments/cleanup-abandoned is admin-only, never touches cheque/transfer orders
 * D. Form Webhooks: /api/payments/webhook/* secret verification, status protection, host restriction, sanitization
 */

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const REPO_DIR = path.resolve(__dirname, '..');

const Order = require(path.join(REPO_DIR, 'models/Order'));
const User = require(path.join(REPO_DIR, 'models/User'));
const paymentsRouter = require(path.join(REPO_DIR, 'routes/payments'));
const passwordResetRouter = require(path.join(REPO_DIR, 'routes/passwordReset'));

async function httpPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe('Security Hardening Routes Test Suite (A-D)', () => {
  let mongod;
  let server;
  let baseUrl;
  let adminToken;
  let customerToken;
  let testUserWithQuestions;
  let testUserWithoutQuestions;

  const JWT_SECRET = process.env.JWT_SECRET || 'security_test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      mongod = await MongoMemoryServer.create();
      await mongoose.connect(mongod.getUri());
    }

    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentsRouter);
    app.use('/api/password-reset', passwordResetRouter);

    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Admin user
    const adminUser = await User.create({
      name: 'Admin Hardening',
      email: 'admin.sec@example.com',
      password: 'hashed_admin_password_123',
      role: 'admin'
    });
    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Customer user
    const customerUser = await User.create({
      name: 'Customer Normal',
      email: 'customer.sec@example.com',
      password: 'hashed_customer_password_123',
      role: 'user'
    });
    customerToken = jwt.sign(
      { id: customerUser._id, email: customerUser.email, role: customerUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // User with security questions
    testUserWithQuestions = await User.create({
      name: 'Question User',
      email: 'questions.user@example.com',
      password: 'hashed_password_123',
      role: 'user',
      securityQuestions: {
        isSetup: true,
        question1: { question: "What is your pet's name?", answer: "hashed_ans1" },
        question2: { question: "What city were you born in?", answer: "hashed_ans2" },
        question3: { question: "What is your favorite dish?", answer: "hashed_ans3" }
      }
    });

    // User without security questions
    testUserWithoutQuestions = await User.create({
      name: 'No Question User',
      email: 'noquestions@example.com',
      password: 'hashed_password_123',
      role: 'user',
      securityQuestions: {
        isSetup: false
      }
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(() => {
    delete process.env.FORM_WEBHOOK_SECRET;
  });

  // =========================================================================
  // SECTION A: DEBUG ORACLE (/api/password-reset/test-answers)
  // =========================================================================
  describe('A. Debug Oracle Hardening (/api/password-reset/test-answers)', () => {
    test('A1: Anonymous call is rejected with 401', async () => {
      const res = await httpPost(`${baseUrl}/api/password-reset/test-answers`, {
        email: testUserWithQuestions.email,
        answer1: 'test',
        answer2: 'test',
        answer3: 'test'
      });
      expect(res.status).toBe(401);
      expect(res.data?.debug).toBeUndefined();
    });

    test('A2: Non-admin caller is rejected with 403', async () => {
      const res = await httpPost(
        `${baseUrl}/api/password-reset/test-answers`,
        { email: testUserWithQuestions.email, answer1: 'test' },
        { Authorization: `Bearer ${customerToken}` }
      );
      expect(res.status).toBe(403);
      expect(res.data?.debug).toBeUndefined();
    });

    test('A3: Admin caller receives 200 without debug or match boolean data', async () => {
      const res = await httpPost(
        `${baseUrl}/api/password-reset/test-answers`,
        {
          email: testUserWithQuestions.email,
          answer1: 'dog',
          answer2: 'city',
          answer3: 'dish'
        },
        { Authorization: `Bearer ${adminToken}` }
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.debug).toBeUndefined();
      expect(res.data.verification).toBeUndefined();
      expect(res.data.answer1Match).toBeUndefined();
      expect(res.data.answer2Match).toBeUndefined();
      expect(res.data.answer3Match).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION B: GET-QUESTIONS (/api/password-reset/get-questions)
  // =========================================================================
  describe('B. Get-Questions Hardening (/api/password-reset/get-questions)', () => {
    test('B1: Known email returns questions without userId', async () => {
      const res = await httpPost(`${baseUrl}/api/password-reset/get-questions`, {
        email: testUserWithQuestions.email
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.questions).toBeDefined();
      expect(res.data.questions.question1).toBe("What is your pet's name?");
      expect(res.data.questions.question2).toBe("What city were you born in?");
      expect(res.data.questions.question3).toBe("What is your favorite dish?");
      expect(res.data.userId).toBeUndefined();
    });

    test('B2: Unknown email returns identical HTTP 200 shape and status without userId', async () => {
      const res = await httpPost(`${baseUrl}/api/password-reset/get-questions`, {
        email: 'completely.unknown.email.never.registered@example.com'
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.questions).toBeDefined();
      expect(typeof res.data.questions.question1).toBe('string');
      expect(typeof res.data.questions.question2).toBe('string');
      expect(typeof res.data.questions.question3).toBe('string');
      expect(res.data.userId).toBeUndefined();
    });

    test('B3: Known email without questions setup returns identical HTTP 200 shape', async () => {
      const res = await httpPost(`${baseUrl}/api/password-reset/get-questions`, {
        email: testUserWithoutQuestions.email
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.questions).toBeDefined();
      expect(res.data.userId).toBeUndefined();
    });

    test('B4: Missing email returns 400', async () => {
      const res = await httpPost(`${baseUrl}/api/password-reset/get-questions`, {});
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION C: CLEANUP-ABANDONED (/api/payments/cleanup-abandoned)
  // =========================================================================
  describe('C. Cleanup Abandoned Hardening (/api/payments/cleanup-abandoned)', () => {
    let oldRazorpayOrder;
    let recentRazorpayOrder;
    let oldChequeOrder;
    let oldTransferOrder;
    let oldPendingVerificationCheque;

    beforeEach(async () => {
      await Order.deleteMany({});

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Old online Razorpay order (should be abandoned)
      oldRazorpayOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book 1', price: 100, quantity: 1 }],
        totalAmount: 100,
        status: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_test_razorpay_123',
        createdAt: twoHoursAgo
      });

      // Recent online Razorpay order (should NOT be abandoned)
      recentRazorpayOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book 2', price: 100, quantity: 1 }],
        totalAmount: 100,
        status: 'pending',
        paymentType: 'online',
        razorpay_order_id: 'order_test_razorpay_recent',
        createdAt: tenMinsAgo
      });

      // Old cheque order (should NEVER be touched)
      oldChequeOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book 3', price: 200, quantity: 1 }],
        totalAmount: 200,
        status: 'pending',
        paymentType: 'cheque',
        paymentDetails: {
          type: 'cheque',
          status: 'awaiting_upload'
        },
        createdAt: twoHoursAgo
      });

      // Old bank transfer order (should NEVER be touched)
      oldTransferOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book 4', price: 300, quantity: 1 }],
        totalAmount: 300,
        status: 'pending',
        paymentType: 'transfer',
        paymentDetails: {
          type: 'transfer',
          status: 'awaiting_utr'
        },
        createdAt: twoHoursAgo
      });

      // Old cheque order pending verification (should NEVER be touched)
      oldPendingVerificationCheque = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Book 5', price: 400, quantity: 1 }],
        totalAmount: 400,
        status: 'pending',
        paymentType: 'cheque',
        paymentDetails: {
          type: 'cheque',
          status: 'pending_verification'
        },
        createdAt: twoHoursAgo
      });
    });

    test('C1: Anonymous call is rejected with 401', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/cleanup-abandoned`, {});
      expect(res.status).toBe(401);
    });

    test('C2: Non-admin call is rejected with 403', async () => {
      const res = await httpPost(
        `${baseUrl}/api/payments/cleanup-abandoned`,
        {},
        { Authorization: `Bearer ${customerToken}` }
      );
      expect(res.status).toBe(403);
    });

    test('C3: Admin call abandons ONLY online Razorpay orders older than 1h, leaves cheque/transfer untouched', async () => {
      const res = await httpPost(
        `${baseUrl}/api/payments/cleanup-abandoned`,
        {},
        { Authorization: `Bearer ${adminToken}` }
      );
      expect(res.status).toBe(200);
      expect(res.data.cleanedCount).toBe(1);

      // Verify online old order was abandoned
      const checkOld = await Order.findById(oldRazorpayOrder._id);
      expect(checkOld.status).toBe('abandoned');

      // Verify recent online order remains pending
      const checkRecent = await Order.findById(recentRazorpayOrder._id);
      expect(checkRecent.status).toBe('pending');

      // Verify old cheque order remains untouched
      const checkCheque = await Order.findById(oldChequeOrder._id);
      expect(checkCheque.status).toBe('pending');
      expect(checkCheque.paymentDetails.status).toBe('awaiting_upload');

      // Verify old transfer order remains untouched
      const checkTransfer = await Order.findById(oldTransferOrder._id);
      expect(checkTransfer.status).toBe('pending');
      expect(checkTransfer.paymentDetails.status).toBe('awaiting_utr');

      // Verify pending_verification cheque remains untouched
      const checkPendingVerif = await Order.findById(oldPendingVerificationCheque._id);
      expect(checkPendingVerif.status).toBe('pending');
      expect(checkPendingVerif.paymentDetails.status).toBe('pending_verification');
    });
  });

  // =========================================================================
  // SECTION D: FORM WEBHOOKS (/api/payments/webhook/*)
  // =========================================================================
  describe('D. Form Webhooks Hardening (/api/payments/webhook/*)', () => {
    let freshChequeOrder;
    let freshTransferOrder;
    let verifiedOrder;

    beforeEach(async () => {
      await Order.deleteMany({});

      freshChequeOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Cheque Book', price: 500, quantity: 1 }],
        totalAmount: 500,
        status: 'pending',
        paymentType: 'cheque',
        paymentDetails: {
          type: 'cheque',
          status: 'awaiting_upload'
        }
      });

      freshTransferOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Transfer Book', price: 600, quantity: 1 }],
        totalAmount: 600,
        status: 'pending',
        paymentType: 'transfer',
        paymentDetails: {
          type: 'transfer',
          status: 'awaiting_utr'
        }
      });

      verifiedOrder = await Order.create({
        user_id: testUserWithQuestions._id,
        items: [{ id: new mongoose.Types.ObjectId().toString(), title: 'Verified Book', price: 700, quantity: 1 }],
        totalAmount: 700,
        status: 'completed',
        paymentType: 'cheque',
        paymentDetails: {
          type: 'cheque',
          status: 'verified'
        }
      });
    });

    test('D1: No secret set - valid cheque order succeeds (legacy behaviour works)', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeNumber: 'CHQ123456',
        bankName: 'State Bank of India',
        chequeImageUrl: 'https://drive.google.com/uc?id=file12345678901234567890',
        driveFileIds: ['file12345678901234567890']
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe('pending_verification');

      const updated = await Order.findById(freshChequeOrder._id);
      expect(updated.paymentDetails.status).toBe('pending_verification');
      expect(updated.paymentDetails.checkNumber).toBe('CHQ123456');
      expect(updated.paymentDetails.bankName).toBe('State Bank of India');
      expect(updated.paymentDetails.checkImageUrl).toBe('https://drive.google.com/uc?id=file12345678901234567890');
    });

    test('D2: No secret set - valid check legacy route succeeds', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/check-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        checkNumber: 'CHK987654',
        bankName: 'HDFC Bank',
        checkImageUrl: 'https://docs.google.com/file/d/abcdef1234567890/view'
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const updated = await Order.findById(freshChequeOrder._id);
      expect(updated.paymentDetails.status).toBe('pending_verification');
      expect(updated.paymentDetails.checkNumber).toBe('CHK987654');
    });

    test('D3: No secret set - valid bank transfer order succeeds', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/bank-transfer-submitted`, {
        orderId: String(freshTransferOrder._id),
        transferNumber: 'TRF555',
        bankName: 'ICICI Bank',
        utrNumber: 'UTR999999',
        transferReceiptUrl: 'https://res.cloudinary.com/shreemata/image/upload/v12345/receipt.jpg'
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const updated = await Order.findById(freshTransferOrder._id);
      expect(updated.paymentDetails.status).toBe('pending_verification');
      expect(updated.paymentDetails.transferNumber).toBe('TRF555');
      expect(updated.paymentDetails.utrNumber).toBe('UTR999999');
      expect(updated.paymentDetails.transferReceiptUrl).toBe('https://res.cloudinary.com/shreemata/image/upload/v12345/receipt.jpg');
    });

    test('D4: Secret set - rejects missing or incorrect secret with 401', async () => {
      process.env.FORM_WEBHOOK_SECRET = 'superSecretFormKey_456';

      // Missing secret
      const resMissing = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeNumber: 'CHQ111'
      });
      expect(resMissing.status).toBe(401);

      // Wrong secret in header
      const resWrongHeader = await httpPost(
        `${baseUrl}/api/payments/webhook/cheque-payment-submitted`,
        { orderId: String(freshChequeOrder._id), chequeNumber: 'CHQ111' },
        { 'x-webhook-secret': 'wrong_secret' }
      );
      expect(resWrongHeader.status).toBe(401);

      // Wrong secret in body
      const resWrongBody = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeNumber: 'CHQ111',
        secret: 'wrong_secret'
      });
      expect(resWrongBody.status).toBe(401);

      // Correct secret in header
      const resCorrectHeader = await httpPost(
        `${baseUrl}/api/payments/webhook/cheque-payment-submitted`,
        { orderId: String(freshChequeOrder._id), chequeNumber: 'CHQ111' },
        { 'x-webhook-secret': 'superSecretFormKey_456' }
      );
      expect(resCorrectHeader.status).toBe(200);

      // Reset order status for next test
      await Order.findByIdAndUpdate(freshChequeOrder._id, {
        'paymentDetails.status': 'awaiting_upload'
      });

      // Correct secret in body
      const resCorrectBody = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeNumber: 'CHQ111',
        secret: 'superSecretFormKey_456'
      });
      expect(resCorrectBody.status).toBe(200);
    });

    test('D5: Wrong payment method is rejected with 400', async () => {
      // Cheque submission for transfer order
      const res1 = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshTransferOrder._id),
        chequeNumber: 'CHQ777'
      });
      expect(res1.status).toBe(400);
      expect(res1.data.error).toContain('mismatch');

      // Bank transfer submission for cheque order
      const res2 = await httpPost(`${baseUrl}/api/payments/webhook/bank-transfer-submitted`, {
        orderId: String(freshChequeOrder._id),
        transferNumber: 'TRF777'
      });
      expect(res2.status).toBe(400);
      expect(res2.data.error).toContain('mismatch');
    });

    test('D6: Already verified or completed order is untouched (rejected with 400)', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(verifiedOrder._id),
        chequeNumber: 'CHQ_ATTACKER'
      });
      expect(res.status).toBe(400);

      const check = await Order.findById(verifiedOrder._id);
      expect(check.paymentDetails.status).toBe('verified');
      expect(check.paymentDetails.chequeNumber).not.toBe('CHQ_ATTACKER');
    });

    test('D7: Disallowed URL host or non-HTTPS protocol is rejected with 400', async () => {
      // Insecure HTTP
      const resHttp = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeImageUrl: 'http://drive.google.com/test.jpg'
      });
      expect(resHttp.status).toBe(400);
      expect(resHttp.data.error).toContain('HTTPS');

      // Disallowed attacker domain
      const resAttacker = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeImageUrl: 'https://evil-attacker.com/malicious.png'
      });
      expect(resAttacker.status).toBe(400);
      expect(resAttacker.data.error).toContain('not permitted');
    });

    test('D8: Invalid orderId format is rejected with 400', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: 'not-a-valid-24-hex-id'
      });
      expect(res.status).toBe(400);
    });

    test('D9: Injection strings and control characters are stripped and stored harmlessly', async () => {
      const res = await httpPost(`${baseUrl}/api/payments/webhook/cheque-payment-submitted`, {
        orderId: String(freshChequeOrder._id),
        chequeNumber: '<script>alert("xss")</script>CHQ123',
        bankName: 'Bank<b>Bold</b>\u0000\u0007Name',
        utrNumber: 'UTR<evil>777'
      });
      expect(res.status).toBe(200);

      const check = await Order.findById(freshChequeOrder._id);
      expect(check.paymentDetails.checkNumber).toBe('scriptalert("xss")/scriptCHQ123');
      expect(check.paymentDetails.bankName).toBe('BankbBold/bName');
      expect(check.paymentDetails.utrNumber).toBe('UTRevil777');
    });
  });
});
