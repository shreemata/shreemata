process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionReserveTransaction = require('../models/CommissionReserveTransaction');
const adminCommissionFundRoutes = require('../routes/adminCommissionFund');
const { authenticateToken, isAdmin } = require('../middleware/auth');

jest.setTimeout(60000);

let server;
let client;
let adminToken;
let userToken;
let adminUser;
let regularUser;

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
    name: 'Admin Boss',
    email: 'admin@shreemata.com',
    password: 'Password123!',
    role: 'admin',
    isEmailVerified: true
  });

  // Create Normal Customer with ₹10,000 wallet liability
  regularUser = await User.create({
    name: 'Customer One',
    email: 'customer1@example.com',
    password: 'Password123!',
    role: 'user',
    wallet: 10000,
    isEmailVerified: true
  });

  adminToken = jwt.sign(
    { _id: adminUser._id, id: adminUser._id, email: adminUser.email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  userToken = jwt.sign(
    { _id: regularUser._id, id: regularUser._id, email: regularUser.email, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

describe('Admin Commission Reserve Funding Suite', () => {

  it('1. blocks non-admin and unauthenticated requests (RBAC)', async () => {
    const resUnauth = await client.get('/reserve/summary');
    expect(resUnauth.status).toBe(401);

    const resNonAdmin = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(resNonAdmin.status).toBe(403);
  });

  it('2. reports Not Established and Unknown funding required when no opening balance exists', async () => {
    const res = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.isReserveEstablished).toBe(false);
    expect(res.data.availableReserve).toBeNull();
    expect(res.data.reserveFundingStatus).toBe('Not Established');
    expect(res.data.additionalFundingRequired).toBe('Unknown');
    expect(res.data.reserveSurplus).toBe(0);
    expect(res.data.needToPay).toBe(10000);
  });

  it('3. establishes initial reserve via opening balance (pending -> verified) and blocks duplicate opening balance', async () => {
    // 3A. Create pending opening balance
    const postPending = await client.post('/reserve/opening-balance', {
      amount: 50000,
      referenceNumber: 'BANK-INIT-001',
      purpose: 'Initial seed capital for commission reserve',
      fundingSource: 'bank_transfer',
      autoVerify: false
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(postPending.status).toBe(201);
    expect(postPending.data.success).toBe(true);
    expect(postPending.data.transaction.status).toBe('pending_verification');
    expect(postPending.data.transaction.amountPaise).toBe(5000000);
    expect(postPending.data.transaction.amountRupees).toBe(50000);

    // Reserve is still Not Established because opening balance is pending
    const summaryWhilePending = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summaryWhilePending.data.isReserveEstablished).toBe(false);
    expect(summaryWhilePending.data.pendingDeposits).toBe(50000);

    // 3B. Attempt duplicate opening balance while one is pending -> rejected
    const dupPending = await client.post('/reserve/opening-balance', {
      amount: 60000,
      referenceNumber: 'BANK-INIT-002',
      autoVerify: false
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(dupPending.status).toBe(400);
    expect(dupPending.data.error).toMatch(/already pending verification/i);

    // 3C. Verify the opening balance
    const txId = postPending.data.transaction._id;
    const verifyRes = await client.post(`/reserve/verify/${txId}`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.transaction.status).toBe('verified');

    // 3D. Check reserve summary after verification
    // Need to pay = ₹10,000, Reserve = ₹50,000 => Surplus = ₹40,000, Additional Required = ₹0
    const summaryAfter = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summaryAfter.data.isReserveEstablished).toBe(true);
    expect(summaryAfter.data.availableReserve).toBe(50000);
    expect(summaryAfter.data.reserveFundingStatus).toBe('Reserve Surplus');
    expect(summaryAfter.data.additionalFundingRequired).toBe(0);
    expect(summaryAfter.data.reserveSurplus).toBe(40000);

    // 3E. Attempt second opening balance once verified -> rejected
    const dupVerified = await client.post('/reserve/opening-balance', {
      amount: 25000,
      referenceNumber: 'BANK-INIT-003',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(dupVerified.status).toBe(400);
    expect(dupVerified.data.error).toMatch(/already established/i);
  });

  it('4. tracks deposits and prevents duplicate reference numbers', async () => {
    // Establish initial opening balance of ₹10,000
    await client.post('/reserve/opening-balance', {
      amount: 10000,
      referenceNumber: 'INIT-REF-99',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Add Deposit of ₹15,000
    const depRes = await client.post('/reserve/deposit', {
      amount: 15000,
      referenceNumber: 'UTR-HDFC-998877',
      purpose: 'Monthly reserve replenishment',
      fundingSource: 'operating_account',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(depRes.status).toBe(201);
    expect(depRes.data.transaction.status).toBe('verified');
    expect(depRes.data.transaction.amountRupees).toBe(15000);

    // Summary should show ₹25,000 reserve
    const summary = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summary.data.availableReserve).toBe(25000);
    expect(summary.data.verifiedDeposits).toBe(25000);

    // Duplicate reference number should fail
    const dupRefRes = await client.post('/reserve/deposit', {
      amount: 5000,
      referenceNumber: 'UTR-HDFC-998877',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(dupRefRes.status).toBe(400);
    expect(dupRefRes.data.error).toMatch(/already recorded/i);
  });

  it('5. records reserve usage and calculates funding shortfall correctly', async () => {
    // Establish reserve of ₹5,000 (Need to Pay is ₹10,000)
    await client.post('/reserve/opening-balance', {
      amount: 5000,
      referenceNumber: 'INIT-SHORTFALL',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Need to pay = ₹10,000, Reserve = ₹5,000 => Shortfall = ₹5,000
    let summary = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summary.data.availableReserve).toBe(5000);
    expect(summary.data.additionalFundingRequired).toBe(5000);
    expect(summary.data.reserveSurplus).toBe(0);
    expect(summary.data.reserveFundingStatus).toBe('Funding Shortfall');

    // Record reserve usage of ₹2,000
    const usageRes = await client.post('/reserve/usage', {
      amount: 2000,
      referenceNumber: 'DISB-001',
      purpose: 'Batch bank payout disbursement',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(usageRes.status).toBe(201);
    expect(usageRes.data.transaction.transactionType).toBe('withdrawal');
    expect(usageRes.data.transaction.status).toBe('verified');

    // Reserve = ₹3,000, Need to Pay = ₹10,000 => Shortfall = ₹7,000
    summary = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summary.data.availableReserve).toBe(3000);
    expect(summary.data.additionalFundingRequired).toBe(7000);
    expect(summary.data.verifiedWithdrawals).toBe(2000);
  });

  it('6. prevents double-reserve usage on linked customer payouts', async () => {
    // Add customer withdrawal
    const payoutId = new mongoose.Types.ObjectId();
    regularUser.withdrawals.push({
      _id: payoutId,
      amount: 1500,
      status: 'approved',
      transferId: 'pout_test_1234567890'
    });
    await regularUser.save();

    // Check unlinked payouts API returns this payout
    const unlinkedRes = await client.get('/reserve/unlinked-payouts', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(unlinkedRes.status).toBe(200);
    expect(unlinkedRes.data.unlinkedPayouts.length).toBe(1);
    expect(unlinkedRes.data.unlinkedPayouts[0].payoutId).toBe(payoutId.toString());

    // Link reserve usage to this payout
    const usageRes1 = await client.post('/reserve/usage', {
      amount: 1500,
      linkedPayoutId: payoutId.toString(),
      referenceNumber: 'USE-PAYOUT-1',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(usageRes1.status).toBe(201);
    expect(usageRes1.data.transaction.linkedPayoutId).toBe(payoutId.toString());

    // Unlinked payouts API should no longer return this payout
    const unlinkedRes2 = await client.get('/reserve/unlinked-payouts', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(unlinkedRes2.data.unlinkedPayouts.length).toBe(0);

    // Attempting to link the same payout again MUST fail
    const usageRes2 = await client.post('/reserve/usage', {
      amount: 1500,
      linkedPayoutId: payoutId.toString(),
      referenceNumber: 'USE-PAYOUT-2',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(usageRes2.status).toBe(400);
    expect(usageRes2.data.error).toMatch(/already linked/i);
  });

  it('7. enforces immutable ledger with reversing transactions (reversalOf)', async () => {
    // 1. Setup opening balance
    const obRes = await client.post('/reserve/opening-balance', {
      amount: 10000,
      referenceNumber: 'OB-REV-TEST',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 2. Add deposit of ₹5,000
    const depRes = await client.post('/reserve/deposit', {
      amount: 5000,
      referenceNumber: 'DEP-REV-TEST',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const depTxId = depRes.data.transaction._id;

    let summary = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summary.data.availableReserve).toBe(15000);

    // 3. Reverse the deposit with reason
    const revRes = await client.post(`/reserve/reverse/${depTxId}`, {
      reason: 'Incorrect bank statement credit entry'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(revRes.status).toBe(200);
    expect(revRes.data.success).toBe(true);
    expect(revRes.data.original.status).toBe('reversed');
    expect(revRes.data.reversal.transactionType).toBe('correction_debit');
    expect(revRes.data.reversal.status).toBe('verified');
    expect(revRes.data.reversal.amountRupees).toBe(5000);

    // 4. Reserve should be back to ₹10,000
    summary = await client.get('/reserve/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(summary.data.availableReserve).toBe(10000);

    // 5. Attempting to reverse an already reversed transaction should fail
    const dupRev = await client.post(`/reserve/reverse/${depTxId}`, {
      reason: 'Second reversal attempt'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(dupRev.status).toBe(400);
  });

  it('8. supports transaction filtering, search, pagination, and CSV export', async () => {
    // Setup opening balance
    await client.post('/reserve/opening-balance', {
      amount: 10000,
      referenceNumber: 'SEARCH-OB-1',
      purpose: 'Primary capital',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Add deposit
    await client.post('/reserve/deposit', {
      amount: 2000,
      referenceNumber: 'SEARCH-DEP-2',
      purpose: 'Secondary deposit',
      autoVerify: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Query list
    const listRes = await client.get('/reserve/transactions?search=Secondary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(listRes.status).toBe(200);
    expect(listRes.data.transactions.length).toBe(1);
    expect(listRes.data.transactions[0].referenceNumber).toBe('SEARCH-DEP-2');

    // Export CSV
    const csvRes = await client.get('/reserve/export/csv', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toMatch(/text\/csv/);
    expect(csvRes.data).toContain('Transaction ID');
    expect(csvRes.data).toContain('SEARCH-OB-1');
    expect(csvRes.data).toContain('SEARCH-DEP-2');
  });

});
