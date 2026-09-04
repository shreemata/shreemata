process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');
const WalletTransaction = require('../models/WalletTransaction');
const commissionSettingsRoutes = require('../routes/commissionSettings');
const authRoutes = require('../routes/auth');
const adminWithdrawRoutes = require('../routes/adminWithdraw');

jest.setTimeout(60000);

let server;
let client;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api', commissionSettingsRoutes);
  app.use('/api', authRoutes);
  app.use('/api/admin/withdrawals', adminWithdrawRoutes);

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
});

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET
  );
}

describe('General Wallet & VIP MasterCard Unified Payment Destination System', () => {
  let user;
  let token;
  let adminUser;
  let adminToken;
  let vipCard;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
      wallet: 50000
    });
    adminToken = generateToken(adminUser);

    user = await User.create({
      name: 'Ramesh Kumar',
      email: 'ramesh@example.com',
      password: 'password123',
      role: 'user',
      wallet: 2000,
      bankDetails: {
        isSetup: false
      },
      masterCard: {
        isAssigned: true,
        cardNumber: 'SMC-8888',
        status: 'active'
      }
    });

    vipCard = await VipMasterCard.create({
      userId: user._id,
      cardNumber: 'VIP 0000 8888',
      tier: 1,
      milestoneAmount: 100,
      balance: 2000,
      totalWithdrawn: 0
    });

    token = generateToken(user);
  });

  describe('1. General Wallet Withdrawal - Payment Details Validation & Setup', () => {
    it('should reject with 400 when user has not set up bank details and submits with no payment info', async () => {
      const res = await client.post(
        '/commission/withdraw',
        { amount: 200 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Payment destination required');
      expect(res.data.requiresPaymentDetails).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(2000); // Balance untouched
    });

    it('should successfully process general withdrawal when fresh UPI ID is provided, saving to user profile', async () => {
      const res = await client.post(
        '/commission/withdraw',
        {
          amount: 300,
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@oksbi'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.remainingBalance).toBe(1700);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(1700);
      expect(refreshedUser.bankDetails.isSetup).toBe(true);
      expect(refreshedUser.bankDetails.upiId).toBe('ramesh@oksbi');
      expect(refreshedUser.bankDetails.accountHolderName).toBe('Ramesh Kumar');

      // Verify withdrawal record
      expect(refreshedUser.withdrawals).toHaveLength(1);
      expect(refreshedUser.withdrawals[0].source).toBe('wallet');
      expect(refreshedUser.withdrawals[0].amount).toBe(300);
      expect(refreshedUser.withdrawals[0].upi).toBe('ramesh@oksbi');
      expect(refreshedUser.withdrawals[0].status).toBe('pending');

      // Verify admin panel sees it
      const adminRes = await client.get('/admin/withdrawals', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminRes.status).toBe(200);
      const adminItem = adminRes.data.find(w => w.userId.toString() === user._id.toString());
      expect(adminItem).toBeDefined();
      expect(adminItem.upi).toBe('ramesh@oksbi');
      expect(adminItem.amount).toBe(300);
    });

    it('should successfully process general withdrawal with fresh Bank Account details and save to profile', async () => {
      const res = await client.post(
        '/commission/withdraw',
        {
          amount: 400,
          accountHolderName: 'Ramesh Kumar',
          accountNumber: '998877665544',
          bankName: 'Axis Bank',
          ifscCode: 'UTIB0001234'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.bankDetails.isSetup).toBe(true);
      expect(refreshedUser.bankDetails.accountNumber).toBe('998877665544');
      expect(refreshedUser.bankDetails.bankName).toBe('Axis Bank');
      expect(refreshedUser.bankDetails.ifscCode).toBe('UTIB0001234');

      expect(refreshedUser.withdrawals[0].bank).toBe('998877665544');
      expect(refreshedUser.withdrawals[0].bankName).toBe('Axis Bank');
      expect(refreshedUser.withdrawals[0].ifsc).toBe('UTIB0001234');
    });
  });

  describe('2. Unified Cross-Flow Persistence (Single Bank Setup for Both Paths)', () => {
    it('should allow VIP withdrawal to immediately reuse bank details saved during a general withdrawal', async () => {
      // Step 1: User saves bank details during general withdrawal
      const genRes = await client.post(
        '/commission/withdraw',
        {
          amount: 200,
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@paytm'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(genRes.status).toBe(200);

      // Step 2: User requests VIP withdrawal without re-entering bank details
      const vipRes = await client.post(
        '/commission/vip-withdraw',
        {
          amount: 500,
          cardNumber: 'VIP 0000 8888'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(vipRes.status).toBe(200);
      expect(vipRes.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.withdrawals).toHaveLength(2);
      
      const vipWithdrawal = refreshedUser.withdrawals.find(w => w.source === 'vip_master_card');
      expect(vipWithdrawal).toBeDefined();
      expect(vipWithdrawal.upi).toBe('ramesh@paytm');
    });

    it('should allow general withdrawal to immediately reuse bank details saved during a VIP withdrawal', async () => {
      // Step 1: User saves bank details during VIP withdrawal
      const vipRes = await client.post(
        '/commission/vip-withdraw',
        {
          amount: 600,
          cardNumber: 'VIP 0000 8888',
          accountHolderName: 'Ramesh Kumar',
          accountNumber: '123123123123',
          bankName: 'HDFC Bank',
          ifscCode: 'HDFC0004321'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(vipRes.status).toBe(200);

      // Step 2: User requests general withdrawal without re-entering bank details
      const genRes = await client.post(
        '/commission/withdraw',
        { amount: 200 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(genRes.status).toBe(200);
      expect(genRes.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      const generalWithdrawal = refreshedUser.withdrawals.find(w => w.source === 'wallet');
      expect(generalWithdrawal).toBeDefined();
      expect(generalWithdrawal.bank).toBe('123123123123');
      expect(generalWithdrawal.bankName).toBe('HDFC Bank');
      expect(generalWithdrawal.ifsc).toBe('HDFC0004321');
    });
  });

  describe('3. Admin Actions & Status Transparency for General Withdrawals', () => {
    it('should refund wallet and record transaction history on admin rejection of general withdrawal', async () => {
      // User requests general withdrawal of ₹300
      const genRes = await client.post(
        '/commission/withdraw',
        {
          amount: 300,
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@upi'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const withdrawId = genRes.data.withdrawalId;

      // Admin rejects
      const rejRes = await client.post(
        '/admin/withdrawals/reject',
        { userId: user._id, withdrawId },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(rejRes.status).toBe(200);

      // Verify wallet balance restored from 1700 back to 2000
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(2000);
      expect(refreshedUser.withdrawals[0].status).toBe('rejected');

      // Verify refund appears in transaction history API
      const txRes = await client.get('/commission/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(txRes.status).toBe(200);
      const refundTx = txRes.data.transactions.find(t => t.type === 'refund');
      expect(refundTx).toBeDefined();
      expect(refundTx.amount).toBe(300);
      expect(refundTx.balanceAfter).toBe(2000);
    });
  });

  describe('4. Optional Scanner Image URL (QR Code) in Withdrawals Flow', () => {
    it('should save scannerImageUrl on general withdrawal and return it to admin in GET /admin/withdrawals', async () => {
      const cloudinaryUrl = 'https://res.cloudinary.com/shreemata/image/upload/v1234567890/scanner_qr.jpg';
      
      const res = await client.post(
        '/commission/withdraw',
        {
          amount: 250,
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@upi',
          scannerImageUrl: cloudinaryUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      const withdrawal = refreshedUser.withdrawals[0];
      expect(withdrawal.scannerImageUrl).toBe(cloudinaryUrl);
      expect(withdrawal.paymentDetails.scannerImageUrl).toBe(cloudinaryUrl);

      // Verify admin can fetch it
      const adminRes = await client.get('/admin/withdrawals', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminRes.status).toBe(200);
      const adminWithdrawal = adminRes.data.find(w => w.userId.toString() === user._id.toString());
      expect(adminWithdrawal).toBeDefined();
      expect(adminWithdrawal.scannerImageUrl).toBe(cloudinaryUrl);
    });

    it('should save scannerImageUrl on VIP withdrawal and return it to admin in GET /admin/withdrawals', async () => {
      const cloudinaryUrl = 'https://res.cloudinary.com/shreemata/image/upload/v1234567890/vip_scanner_qr.png';
      
      const res = await client.post(
        '/commission/vip-withdraw',
        {
          amount: 500,
          cardNumber: 'VIP 0000 8888',
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@vipbank',
          scannerImageUrl: cloudinaryUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      const withdrawal = refreshedUser.withdrawals[0];
      expect(withdrawal.scannerImageUrl).toBe(cloudinaryUrl);
      expect(withdrawal.paymentDetails.scannerImageUrl).toBe(cloudinaryUrl);

      // Verify admin gets scannerImageUrl
      const adminRes = await client.get('/admin/withdrawals', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminRes.status).toBe(200);
      const adminWithdrawal = adminRes.data.find(w => w.userId.toString() === user._id.toString());
      expect(adminWithdrawal).toBeDefined();
      expect(adminWithdrawal.scannerImageUrl).toBe(cloudinaryUrl);
    });

    it('should successfully submit withdrawal WITHOUT scannerImageUrl and keep it null', async () => {
      const res = await client.post(
        '/commission/withdraw',
        {
          amount: 200,
          accountHolderName: 'Ramesh Kumar',
          upiId: 'ramesh@upi'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      const withdrawal = refreshedUser.withdrawals[0];
      expect(withdrawal.scannerImageUrl).toBeNull();

      // Admin fetch should have null scannerImageUrl
      const adminRes = await client.get('/admin/withdrawals', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const adminWithdrawal = adminRes.data.find(w => w.userId.toString() === user._id.toString());
      expect(adminWithdrawal).toBeDefined();
      expect(adminWithdrawal.scannerImageUrl).toBeNull();
    });
  });
});
