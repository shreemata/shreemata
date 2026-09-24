process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');
const adminCommissionFundRoutes = require('../routes/adminCommissionFund');
const { authenticateToken, isAdmin } = require('../middleware/auth');

jest.setTimeout(60000);

let server;
let client;
let adminToken;
let adminUser;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/admin/commission-fund', authenticateToken, isAdmin, adminCommissionFundRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api/admin/commission-fund`,
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

  // Create Admin
  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@shreemata.com',
    role: 'admin',
    wallet: 0
  });
  adminToken = jwt.sign(
    { id: adminUser._id.toString(), email: adminUser.email, role: 'admin' },
    process.env.JWT_SECRET
  );
});

describe('Commission Fund Accounting Suite — Approved Equals Paid Rule', () => {

  it('1. pending withdrawal increases outstanding payout liability & Need to Pay', async () => {
    await User.create({
      name: 'User Pending',
      email: 'userpending@example.com',
      wallet: 300.00,
      withdrawals: [
        {
          amount: 100.00,
          status: 'pending',
          requestedAt: new Date()
        }
      ]
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    expect(res.data.data.summary.activeCustomerBalances).toBe(300.00);
    expect(res.data.data.summary.pendingWithdrawals).toBe(100.00);
    expect(res.data.data.summary.needToPay).toBe(400.00); // 300 wallet + 100 pending
    expect(res.data.data.summary.paidAmount).toBe(0.00);
  });

  it('2. approved withdrawal is removed from Need to Pay', async () => {
    const user = await User.create({
      name: 'User Approved',
      email: 'userapproved@example.com',
      wallet: 300.00,
      withdrawals: [
        {
          amount: 100.00,
          status: 'approved',
          requestedAt: new Date(),
          approvedAt: new Date()
        }
      ]
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    expect(res.data.data.summary.pendingWithdrawals).toBe(0.00);
    expect(res.data.data.summary.needToPay).toBe(300.00); // 300 wallet only
  });

  it('3. approved withdrawal increases Paid Amount', async () => {
    await User.create({
      name: 'User Paid',
      email: 'userpaid@example.com',
      wallet: 200.00,
      withdrawals: [
        {
          amount: 150.00,
          status: 'approved',
          requestedAt: new Date(),
          approvedAt: new Date()
        }
      ]
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    expect(res.data.data.summary.paidAmount).toBe(150.00);
  });

  it('4. rejected withdrawal returns amount to wallet and is excluded from Paid Amount', async () => {
    await User.create({
      name: 'User Rejected',
      email: 'userrejected@example.com',
      wallet: 500.00, // Amount returned back to wallet
      withdrawals: [
        {
          amount: 100.00,
          status: 'rejected',
          requestedAt: new Date()
        }
      ]
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    expect(res.data.data.summary.needToPay).toBe(500.00);
    expect(res.data.data.summary.paidAmount).toBe(0.00);
    expect(res.data.data.summary.pendingWithdrawals).toBe(0.00);
  });

  it('5. approved withdrawal cannot be counted twice', async () => {
    const user = await User.create({
      name: 'User Single Count',
      email: 'singlecount@example.com',
      wallet: 100.00,
      withdrawals: [
        {
          amount: 50.00,
          status: 'approved',
          transferId: 'manual_1001',
          externalSettlementVerified: true
        }
      ]
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.data.data.summary.paidAmount).toBe(50.00);
    expect(res.data.data.summary.needToPay).toBe(100.00);
  });

  it('6. repeated approval is idempotent', async () => {
    const user = await User.create({
      name: 'User Idempotent',
      email: 'idempotent@example.com',
      wallet: 100.00,
      withdrawals: [
        {
          amount: 50.00,
          status: 'approved',
          transferId: 'manual_1002'
        }
      ]
    });

    // First API call
    const res1 = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res1.data.data.summary.paidAmount).toBe(50.00);

    // Save user document again (simulating repeated approval trigger)
    user.withdrawals[0].status = 'approved';
    await user.save();

    // Second API call
    const res2 = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res2.data.data.summary.paidAmount).toBe(50.00); // Unchanged
  });

  it('7. ₹100 existing approved withdrawal for Shakuntaladevi appears in Paid Amount', async () => {
    const shakuntala = await User.create({
      name: 'Shakuntaladevi',
      email: 'shree.mata.hbl@gmail.com',
      wallet: 964.24,
      withdrawals: [
        {
          amount: 100.00,
          status: 'approved',
          transferId: 'manual_1789651179931',
          externalSettlementVerified: true,
          adminPaymentStatus: 'confirmed_paid'
        }
      ]
    });

    await User.create({
      name: 'Virtual Position',
      email: 'virt@shreemata.internal',
      isVirtual: true,
      virtualEarningsBalancePaise: 206 // ₹2.06
    });

    await VipMasterCard.create({
      userId: shakuntala._id,
      cardNumber: 'VIP-1001',
      tier: 1,
      milestoneAmount: 500,
      balance: 1.52
    });

    const res = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    expect(res.data.data.summary.paidAmount).toBe(100.00);
    expect(res.data.data.summary.needToPay).toBe(967.82); // 964.24 + 2.06 + 1.52
  });

  it('8. dashboard auto-refresh endpoint returns fresh backend values', async () => {
    const user = await User.create({ name: 'Refresh Test', email: 'refresh@example.com', wallet: 100.00 });

    const res1 = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res1.data.data.summary.needToPay).toBe(100.00);

    // Credit additional earnings
    user.wallet += 250.00;
    await user.save();

    const res2 = await client.get('/summary', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res2.data.data.summary.needToPay).toBe(350.00);
  });

});
