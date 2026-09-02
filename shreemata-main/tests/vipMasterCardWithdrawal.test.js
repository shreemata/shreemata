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

describe('VIP Master Card Commission Withdrawal System', () => {
  let user;
  let token;
  let adminUser;
  let adminToken;
  let vipCard;
  let userB;
  let vipCardB;

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
      name: 'User A (VIP)',
      email: 'userA@example.com',
      password: 'password123',
      role: 'user', // Regular user (non-admin)
      wallet: 1000, // Available balance ₹1000
      bankDetails: {
        isSetup: true,
        accountHolderName: 'User A',
        accountNumber: '987654321012',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        upiId: 'usera@okhdfcbank'
      },
      masterCard: {
        isAssigned: true,
        cardNumber: 'SMC-10001',
        status: 'active'
      }
    });

    vipCard = await VipMasterCard.create({
      userId: user._id,
      cardNumber: 'VIP 0000 0001',
      tier: 1,
      milestoneAmount: 100,
      balance: 1000,
      totalWithdrawn: 0
    });

    token = generateToken(user);

    // Create User B with a different VIP card
    userB = await User.create({
      name: 'User B (Victim)',
      email: 'userB@example.com',
      password: 'password123',
      role: 'user',
      wallet: 5000,
      bankDetails: {
        isSetup: true,
        accountHolderName: 'User B',
        accountNumber: '111122223333',
        bankName: 'SBI',
        ifscCode: 'SBIN0001234',
        upiId: 'userb@ybl'
      },
      masterCard: {
        isAssigned: true,
        cardNumber: 'SMC-20002',
        status: 'active'
      }
    });

    vipCardB = await VipMasterCard.create({
      userId: userB._id,
      cardNumber: 'VIP 0000 0002',
      tier: 2,
      milestoneAmount: 200,
      balance: 5000,
      totalWithdrawn: 0
    });
  });

  describe('Security Requirement 1: Strict Owner-Only & Card Ownership Lock Down', () => {
    it('should reject with 403 if User A attempts to withdraw passing User B\'s VIP card number', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0002' }, // User B's card
        { headers: { Authorization: `Bearer ${token}` } } // Logged in as User A
      );

      expect(res.status).toBe(403);
      expect(res.data.error).toContain('Unauthorized: You can only withdraw from a VIP Master Card assigned to your account');

      // Verify User A's wallet is completely untouched
      const refreshedUserA = await User.findById(user._id);
      expect(refreshedUserA.wallet).toBe(1000);

      // Verify User B's wallet is completely untouched
      const refreshedUserB = await User.findById(userB._id);
      expect(refreshedUserB.wallet).toBe(5000);

      // Verify no ledger transaction was created
      const txCount = await WalletTransaction.countDocuments({});
      expect(txCount).toBe(0);
    });

    it('should reject with 403 if User A attempts to withdraw passing User B\'s profile Master Card (SMC-20002)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'SMC-20002' }, // User B's profile card
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(403);
      expect(res.data.error).toContain('Unauthorized: You can only withdraw from a VIP Master Card assigned to your account');

      const refreshedUserA = await User.findById(user._id);
      expect(refreshedUserA.wallet).toBe(1000);

      const refreshedUserB = await User.findById(userB._id);
      expect(refreshedUserB.wallet).toBe(5000);
    });

    it('should reject with 403 in the alias endpoint /api/users/profile/vip-mastercards/withdraw when passing a foreign card', async () => {
      const res = await client.post(
        '/users/profile/vip-mastercards/withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0002' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(403);
      expect(res.data.error).toContain('Unauthorized: You can only withdraw from a VIP Master Card assigned to your account');
    });

    it('should safely default to authenticated user\'s own card if cardNumber is omitted in request', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500 }, // No cardNumber passed
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.cardNumber).toBe('VIP 0000 0001'); // User A's card

      const refreshedUserA = await User.findById(user._id);
      expect(refreshedUserA.wallet).toBe(500);

      const refreshedUserB = await User.findById(userB._id);
      expect(refreshedUserB.wallet).toBe(5000); // User B untouched
    });
  });

  describe('Payment Details (Bank & UPI ID) Handling & Persistence', () => {
    it('should reject with 400 if user has no saved bank details and provides neither bank nor UPI info', async () => {
      // Clear bankDetails
      user.bankDetails = { isSetup: false };
      await user.save();

      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Payment destination required');
      expect(res.data.requiresPaymentDetails).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(1000); // untouched
    });

    it('should accept fresh UPI ID during withdrawal, save to user profile, and snapshot into withdrawal record', async () => {
      user.bankDetails = { isSetup: false };
      await user.save();

      const res = await client.post(
        '/commission/vip-withdraw',
        {
          amount: 500,
          cardNumber: 'VIP 0000 0001',
          accountHolderName: 'User A',
          upiId: 'usera@paytm'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      // Verify saved to user.bankDetails
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.bankDetails.isSetup).toBe(true);
      expect(refreshedUser.bankDetails.upiId).toBe('usera@paytm');
      expect(refreshedUser.bankDetails.accountHolderName).toBe('User A');

      // Verify snapshot on withdrawal record
      expect(refreshedUser.withdrawals[0].upi).toBe('usera@paytm');
      expect(refreshedUser.withdrawals[0].status).toBe('pending');

      // Verify admin can see it in GET /api/admin/withdrawals
      const adminRes = await client.get('/admin/withdrawals', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminRes.status).toBe(200);
      const adminWithdrawItem = adminRes.data.find(w => w.userId.toString() === user._id.toString());
      expect(adminWithdrawItem).toBeDefined();
      expect(adminWithdrawItem.upi).toBe('usera@paytm');
    });

    it('should accept fresh Bank Account details, save to profile, and display in admin withdrawals', async () => {
      user.bankDetails = { isSetup: false };
      await user.save();

      const res = await client.post(
        '/commission/vip-withdraw',
        {
          amount: 500,
          cardNumber: 'VIP 0000 0001',
          accountHolderName: 'User A',
          accountNumber: '123456789012',
          bankName: 'ICICI Bank',
          ifscCode: 'ICIC0000123'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.bankDetails.isSetup).toBe(true);
      expect(refreshedUser.bankDetails.accountNumber).toBe('123456789012');
      expect(refreshedUser.bankDetails.bankName).toBe('ICICI Bank');
      expect(refreshedUser.bankDetails.ifscCode).toBe('ICIC0000123');

      expect(refreshedUser.withdrawals[0].bank).toBe('123456789012');
      expect(refreshedUser.withdrawals[0].bankName).toBe('ICICI Bank');
      expect(refreshedUser.withdrawals[0].ifsc).toBe('ICIC0000123');
    });

    it('should automatically use saved bank details when already setup', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.withdrawals[0].upi).toBe('usera@okhdfcbank');
      expect(refreshedUser.withdrawals[0].bank).toBe('987654321012');
      expect(refreshedUser.withdrawals[0].bankName).toBe('HDFC Bank');
      expect(refreshedUser.withdrawals[0].ifsc).toBe('HDFC0001234');
    });
  });

  describe('Validation Rule 1: Minimum Withdrawal Amount (₹500)', () => {
    it('should reject a withdrawal request below ₹500 (e.g. ₹499)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 499, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Minimum withdrawal amount allowed for VIP Master Card is ₹500');

      // Verify wallet was NOT deducted
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(1000);

      // Verify no ledger transaction was created
      const txCount = await WalletTransaction.countDocuments({ userId: user._id });
      expect(txCount).toBe(0);
    });

    it('should reject a withdrawal request with 0 or negative amount', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 0, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toBeDefined();
    });
  });

  describe('Validation Rule 2: Mandatory Minimum Reserve Balance (₹50)', () => {
    it('should reject when (Available Balance - Requested Amount) < 50 (e.g. Balance ₹1000, Request ₹960)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 960, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('mandatory minimum balance of ₹50 must remain');
      expect(res.data.mandatoryReserve).toBe(50);
      expect(res.data.maxWithdrawable).toBe(950);

      // Verify wallet was NOT deducted
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(1000);
    });

    it('should reject when requested amount exceeds available balance (e.g. Request ₹1200 with ₹1000 balance)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 1200, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Insufficient balance');
    });

    it('should reject when balance is ₹540 and user requests ₹500 (leaving only ₹40, less than ₹50 reserve)', async () => {
      user.wallet = 540;
      await user.save();

      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('mandatory minimum balance of ₹50 must remain');
    });
  });

  describe('Successful VIP Master Card Withdrawal for Regular Users', () => {
    it('should succeed for regular user when amount >= ₹500 and (Available Balance - Amount) >= ₹50', async () => {
      // Balance is ₹1000, requesting ₹500 -> remaining ₹500 (>= ₹50 reserve)
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.withdrawalAmount).toBe(500);
      expect(res.data.remainingBalance).toBe(500);
      expect(res.data.cardNumber).toBe('VIP 0000 0001');

      // Verify real-time balance update in User model
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(500);
      expect(refreshedUser.withdrawals).toHaveLength(1);
      expect(refreshedUser.withdrawals[0].source).toBe('vip_master_card');
      expect(refreshedUser.withdrawals[0].amount).toBe(500);
      expect(refreshedUser.withdrawals[0].balanceBefore).toBe(1000);
      expect(refreshedUser.withdrawals[0].balanceAfter).toBe(500);
      expect(refreshedUser.withdrawals[0].mandatoryReserve).toBe(50);
      expect(refreshedUser.withdrawals[0].status).toBe('pending');

      // Verify accurate ledger tracking in WalletTransaction
      const ledgerTx = await WalletTransaction.findOne({ userId: user._id });
      expect(ledgerTx).toBeDefined();
      expect(ledgerTx.type).toBe('debit');
      expect(ledgerTx.category).toBe('vip_master_card_withdrawal');
      expect(ledgerTx.amount).toBe(500);
      expect(ledgerTx.balanceAfter).toBe(500);
      expect(ledgerTx.description).toContain('VIP Master Card Withdrawal');

      // Verify VipMasterCard document stats updated
      const refreshedCard = await VipMasterCard.findById(vipCard._id);
      expect(refreshedCard.totalWithdrawn).toBe(500);
      expect(refreshedCard.lastWithdrawalDate).toBeDefined();
    });

    it('should allow exact maximum withdrawable amount (Balance ₹1000, Request ₹950, leaving exactly ₹50)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 950, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.remainingBalance).toBe(50);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(50);
    });

    it('should withdraw successfully using the Digital Profile Master Card (SMC-10001)', async () => {
      const res = await client.post(
        '/commission/vip-withdraw',
        { amount: 600, cardNumber: 'SMC-10001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.withdrawalAmount).toBe(600);
      expect(res.data.remainingBalance).toBe(400);
      expect(res.data.cardNumber).toBe('SMC-10001');

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(400);
    });

    it('should also work via alias route /api/users/profile/vip-mastercards/withdraw', async () => {
      const res = await client.post(
        '/users/profile/vip-mastercards/withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.remainingBalance).toBe(500);
    });
  });

  describe('Step 3: Approval & Rejection Refund Workflow Verification', () => {
    it('should allow admin to approve withdrawal and mark status as approved', async () => {
      // User withdraws ₹500
      const withRes = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const withdrawId = withRes.data.withdrawalId;

      // Admin approves
      const appRes = await client.post(
        '/admin/withdrawals/approve',
        { userId: user._id, withdrawId },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(appRes.status).toBe(200);

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.withdrawals[0].status).toBe('approved');
    });

    it('should refund amount to wallet on admin rejection and record refund in transactions history', async () => {
      // User withdraws ₹500 (wallet becomes 500)
      const withRes = await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const withdrawId = withRes.data.withdrawalId;

      // Admin rejects
      const rejRes = await client.post(
        '/admin/withdrawals/reject',
        { userId: user._id, withdrawId },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(rejRes.status).toBe(200);

      // Verify wallet refunded
      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.wallet).toBe(1000);
      expect(refreshedUser.withdrawals[0].status).toBe('rejected');

      // Verify refund appears in GET /api/commission/transactions
      const txRes = await client.get('/commission/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(txRes.status).toBe(200);
      const refundTx = txRes.data.transactions.find(t => t.type === 'refund');
      expect(refundTx).toBeDefined();
      expect(refundTx.amount).toBe(500);
      expect(refundTx.balanceAfter).toBe(1000);
    });
  });

  describe('Commission Transactions & Profile VIP Metadata API', () => {
    it('should include vip_master_card_withdrawal in commission transactions history', async () => {
      // First make a VIP withdrawal
      await client.post(
        '/commission/vip-withdraw',
        { amount: 500, cardNumber: 'VIP 0000 0001' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Fetch commission transactions
      const res = await client.get(
        '/commission/transactions',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.transactions).toBeDefined();
      const vipDebit = res.data.transactions.find(t => t.type === 'vip_master_card_withdrawal');
      expect(vipDebit).toBeDefined();
      expect(vipDebit.amount).toBe(500);
      expect(vipDebit.balanceAfter).toBe(500);
    });

    it('should return VIP withdrawal limits, bankDetailsSetup, and maxWithdrawable in GET /api/users/profile/vip-mastercards', async () => {
      const res = await client.get(
        '/users/profile/vip-mastercards',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.walletBalance).toBe(1000);
      expect(res.data.minWithdrawal).toBe(500);
      expect(res.data.mandatoryReserve).toBe(50);
      expect(res.data.maxWithdrawable).toBe(950);
      expect(res.data.bankDetailsSetup).toBe(true);
      expect(res.data.maskedBankDetails).toBeDefined();
      expect(res.data.cards[0].balance).toBe(1000);
      expect(res.data.cards[0].minWithdrawal).toBe(500);
      expect(res.data.cards[0].mandatoryReserve).toBe(50);
      expect(res.data.cards[0].maxWithdrawable).toBe(950);
    });

    it('should include Digital Profile Master Card in GET /api/users/profile/vip-mastercards if no milestone cards exist', async () => {
      // Remove milestone cards
      await VipMasterCard.deleteMany({});

      const res = await client.get(
        '/users/profile/vip-mastercards',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.cards).toHaveLength(1);
      expect(res.data.cards[0].cardNumber).toBe('SMC-10001');
      expect(res.data.cards[0].balance).toBe(1000);
      expect(res.data.cards[0].minWithdrawal).toBe(500);
      expect(res.data.cards[0].mandatoryReserve).toBe(50);
      expect(res.data.cards[0].maxWithdrawable).toBe(950);
    });
  });
});
