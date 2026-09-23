process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');
const VipMasterCard = require('../models/VipMasterCard');
const TrustFund = require('../models/TrustFund');
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
    role: 'admin',
    wallet: 0
  });
  adminToken = jwt.sign(
    { id: adminUser._id.toString(), email: adminUser.email, role: 'admin' },
    process.env.JWT_SECRET
  );

  // Create Regular User
  regularUser = await User.create({
    name: 'Customer One',
    email: 'customer1@example.com',
    role: 'user',
    wallet: 150.00
  });
  userToken = jwt.sign(
    { id: regularUser._id.toString(), email: regularUser.email, role: 'user' },
    process.env.JWT_SECRET
  );
});

describe('Admin Commission Fund & Liability Suite', () => {

  it('1. blocks non-admin and unauthenticated requests (RBAC)', async () => {
    // No token
    const resNoToken = await client.get('/summary');
    expect([401, 403]).toContain(resNoToken.status);

    // Regular user token
    const resUserToken = await client.get('/summary', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(resUserToken.status).toBe(403);
  });

  it('2. returns correct structure and Funding Status: Not Tracked when empty', async () => {
    const res = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(['Not Tracked', 'Not Established']).toContain(res.data.summary.reserveFundingStatus);
    expect(res.data.summary.availableCommissionReserve).toBeNull();
    expect(res.data.summary.totalCommissionGenerated).toBe(0);
    expect(res.data.summary.needToPay).toBe(150); // regularUser has ₹150 in wallet
  });

  it('3. isolates Virtual Tree Income as a subset of Tree Pool without double counting', async () => {
    // Create Verified Order
    const order = await Order.create({
      user_id: regularUser._id,
      totalAmount: 1000,
      paymentStatus: 'verified',
      status: 'completed'
    });

    // Create Virtual User
    const virtualUser = await User.create({
      name: 'Virtual Child 1',
      email: 'virt1@example.com',
      isVirtual: true,
      originalUser: regularUser._id,
      virtualEarningsBalancePaise: 2500 // ₹25.00
    });

    // Create Commission Transaction
    // Total Tree Pool: ₹60.00 (Normal: ₹35.00, Virtual: ₹25.00)
    await CommissionTransaction.create({
      orderId: order._id,
      purchaser: regularUser._id,
      orderAmount: 1000,
      profitAmount: 200,
      directCommissionAmount: 10.00, // ₹10 Cashback
      referralCommissionAmount: 8.00, // ₹8 Direct Referral
      adminCommissionAmount: 5.00,   // ₹5 Admin Share
      trustFundAmount: 2.00,        // ₹2 Trust Fund
      devTrustFundAmount: 1.00,     // ₹1 Dev Fund
      treePoolTotal: 60.00,
      treeCommissions: [
        {
          recipient: regularUser._id,
          level: 1,
          percentage: 17.5,
          amount: 35.00,
          creditedDestination: 'wallet'
        },
        {
          recipient: virtualUser._id,
          level: 2,
          percentage: 12.5,
          amount: 25.00,
          creditedDestination: 'virtual_referral_balance'
        }
      ],
      status: 'completed'
    });

    const res = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const summary = res.data.summary;
    const treeBreakdown = res.data.treePoolBreakdown;

    // Normal + Virtual = Tree Pool Total
    // 35.00 + 25.00 = 60.00
    expect(treeBreakdown.normalMemberShare).toBe(35);
    expect(treeBreakdown.virtualTreeIncomeShare).toBe(25);
    expect(treeBreakdown.totalTreePool).toBe(60);

    // Total Generated User Commissions:
    // Cashback (10) + Referral (8) + Admin (5) + TreePoolTotal (60) = 83.00
    // Virtual Tree Income (25) is NOT added an extra time!
    expect(summary.totalCommissionGenerated).toBe(83);
  });

  it('4. ignores unverified/failed orders in authoritative commission calculations', async () => {
    // Unverified Order (e.g. pending check payment)
    const unverifiedOrder = await Order.create({
      user_id: regularUser._id,
      totalAmount: 500,
      paymentStatus: 'pending',
      status: 'pending_payment_verification'
    });

    await CommissionTransaction.create({
      orderId: unverifiedOrder._id,
      purchaser: regularUser._id,
      orderAmount: 500,
      profitAmount: 100,
      directCommissionAmount: 50.00,
      status: 'pending'
    });

    const res = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    // Unverified order commission is NOT included in authoritative totals
    expect(res.data.summary.totalCommissionGenerated).toBe(0);
  });

  it('5. Virtual-to-VIP Master Card transfer preserves Total Need to Pay invariance', async () => {
    // Virtual user with ₹50 in holding (5000 paise)
    const virtualUser = await User.create({
      name: 'Virtual Node 2',
      email: 'virt2@example.com',
      isVirtual: true,
      originalUser: regularUser._id,
      virtualEarningsBalancePaise: 5000 // ₹50.00
    });

    // VIP Master Card for regularUser with initial balance ₹0
    const vipCard = await VipMasterCard.create({
      userId: regularUser._id,
      cardNumber: 'VIP-9999-0001',
      tier: 1,
      milestoneAmount: 50,
      balance: 0,
      totalWithdrawn: 0
    });

    // Initial state check
    const resBefore = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const needToPayBefore = resBefore.data.summary.needToPay;
    const paidBefore = resBefore.data.summary.paidAmount;

    // Simulate "Take Money" transfer:
    // Virtual balance decreases to 0, VIP card balance increases by ₹50
    virtualUser.virtualEarningsBalancePaise = 0;
    await virtualUser.save();

    vipCard.balance = 50.00;
    await vipCard.save();

    await VirtualReferralTransaction.create({
      virtualReferralId: virtualUser._id,
      ownerUserId: regularUser._id,
      type: 'claim_to_vip_master_card',
      amountPaise: -5000,
      balanceAfterPaise: 0
    });

    // Re-check after internal transfer
    const resAfter = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const needToPayAfter = resAfter.data.summary.needToPay;
    const paidAfter = resAfter.data.summary.paidAmount;

    // INVARIANCE VALIDATION:
    // 1. Total Need to Pay is identical!
    expect(needToPayAfter).toBe(needToPayBefore);
    // 2. Paid Amount did NOT increase!
    expect(paidAfter).toBe(paidBefore);

    // Channel shift validation:
    expect(resAfter.data.liabilitiesBreakdown.heldInVirtualReferrals).toBe(0);
    expect(resAfter.data.liabilitiesBreakdown.heldInVipMasterCards).toBe(50);
  });

  it('6. validates complete withdrawal lifecycle: Wallet -> Pending -> Approved Unverified -> Confirmed Paid with Need to Pay invariance', async () => {
    // 1. Initial State: Wallet = 150
    const resInitial = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resInitial.data.summary.needToPay).toBe(150);
    expect(resInitial.data.summary.activeCustomerBalances).toBe(150);
    expect(resInitial.data.summary.unresolvedSettlementExposure).toBe(0);
    expect(resInitial.data.summary.paidAmount).toBe(0);

    // 2. Wallet -> Pending: User requests withdrawal of ₹100
    // ₹100 deducted from wallet immediately (wallet: 150 -> 50)
    regularUser.wallet = 50.00;
    regularUser.withdrawals = [{
      amount: 100.00,
      source: 'wallet',
      status: 'pending',
      requestedAt: new Date()
    }];
    await regularUser.save();

    const resPending = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Invariance: 50 (wallet) + 100 (pending) = 150
    expect(resPending.data.summary.needToPay).toBe(150);
    expect(resPending.data.summary.activeCustomerBalances).toBe(50);
    expect(resPending.data.liabilitiesBreakdown.pendingWithdrawals).toBe(100);
    expect(resPending.data.summary.unresolvedSettlementExposure).toBe(0);
    expect(resPending.data.summary.paidAmount).toBe(0);

    // 3. Pending -> Approved but Unverified (Manual Approval without Bank UTR)
    regularUser.withdrawals[0].status = 'approved';
    regularUser.withdrawals[0].transferId = 'manual_1789651179931';
    regularUser.withdrawals[0].transferMethod = 'Manual Transfer';
    regularUser.withdrawals[0].transferDate = new Date();
    await regularUser.save();

    const resUnverified = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Invariance: 50 (wallet) + 0 (pending) + 100 (unresolved exposure) = 150
    // PREVENTS UNDERSTATED LIABILITIES!
    expect(resUnverified.data.summary.needToPay).toBe(150);
    expect(resUnverified.data.summary.activeCustomerBalances).toBe(50);
    expect(resUnverified.data.summary.unresolvedSettlementExposure).toBe(100);
    expect(resUnverified.data.liabilitiesBreakdown.unresolvedSettlementExposure).toBe(100);
    expect(resUnverified.data.summary.paidAmount).toBe(0); // NOT marked paid without bank proof!

    // Verify settlements endpoint classifies as 'Settlement unverified'
    const resSetlUnverified = await client.get('/settlements?status=unverified', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resSetlUnverified.data.settlements.length).toBe(1);
    expect(resSetlUnverified.data.settlements[0].adminPaymentStatus).toBe('settlement_unverified');
    expect(resSetlUnverified.data.settlements[0].adminPaymentStatusLabel).toBe('Settlement unverified');

    // 4. Approved Unverified -> Confirmed Paid (Authoritative Gateway UTR proof provided)
    regularUser.withdrawals[0].transferId = 'payout_rzp_live_test_123';
    regularUser.withdrawals[0].transferMethod = 'UPI';
    await regularUser.save();

    const resConfirmed = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Now settled externally: Need to Pay reduced to 50, Paid Amount increased to 100
    expect(resConfirmed.data.summary.needToPay).toBe(50);
    expect(resConfirmed.data.summary.unresolvedSettlementExposure).toBe(0);
    expect(resConfirmed.data.summary.paidAmount).toBe(100);
    expect(resConfirmed.data.settlementsBreakdown.totalSettledExternally).toBe(100);

    // Verify settlements endpoint classifies as 'Confirmed externally paid'
    const resSetlConfirmed = await client.get('/settlements?status=confirmed', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resSetlConfirmed.data.settlements.length).toBe(1);
    expect(resSetlConfirmed.data.settlements[0].adminPaymentStatus).toBe('confirmed_paid');
    expect(resSetlConfirmed.data.settlements[0].adminPaymentStatusLabel).toBe('Confirmed externally paid');
  });

  it('7. rejected and refunded withdrawals restore wallet balance without double-counting liabilities', async () => {
    // If a withdrawal of ₹100 is rejected, ₹100 is restored to customer wallet (50 -> 150)
    regularUser.wallet = 150.00;
    regularUser.withdrawals = [{
      amount: 100.00,
      source: 'wallet',
      status: 'rejected',
      requestedAt: new Date()
    }];
    await regularUser.save();

    const res = await client.get('/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Need to Pay reflects the ₹150 wallet balance, NOT ₹150 + ₹100
    expect(res.data.summary.needToPay).toBe(150);
    expect(res.data.summary.activeCustomerBalances).toBe(150);
    expect(res.data.summary.unresolvedSettlementExposure).toBe(0);
    expect(res.data.summary.paidAmount).toBe(0);

    // Verify settlements endpoint classifies as 'Failed or refunded'
    const resSetl = await client.get('/settlements?status=rejected', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resSetl.data.settlements.length).toBe(1);
    expect(resSetl.data.settlements[0].adminPaymentStatus).toBe('failed_refunded');
    expect(resSetl.data.settlements[0].adminPaymentStatusLabel).toBe('Failed or refunded');
  });

  it('8. provides granular obligations ledger table with search and filtering', async () => {
    const order = await Order.create({
      user_id: regularUser._id,
      totalAmount: 1200,
      paymentStatus: 'completed',
      status: 'completed'
    });

    await CommissionTransaction.create({
      orderId: order._id,
      purchaser: regularUser._id,
      orderAmount: 1200,
      profitAmount: 240,
      directCommissionAmount: 36.00,
      referralCommissionAmount: 24.00,
      status: 'completed'
    });

    const resAll = await client.get('/table', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resAll.status).toBe(200);
    expect(resAll.data.items.length).toBeGreaterThanOrEqual(1);

    // Category filter: buyer_cashback
    const resCashback = await client.get('/table?category=buyer_cashback', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resCashback.data.items.every(i => i.commissionCategory === 'buyer_cashback')).toBe(true);

    // Search filter
    const resSearch = await client.get(`/table?search=${regularUser.name}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resSearch.data.items.length).toBeGreaterThan(0);
  });

  it('9. streams CSV and PDF exports with valid HTTP headers', async () => {
    // CSV Summary
    const resCsv = await client.get('/export/csv?type=summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(resCsv.status).toBe(200);
    expect(resCsv.headers['content-type']).toMatch(/text\/csv/);
    expect(resCsv.data).toContain('Total Commission Generated');
    expect(resCsv.data).toContain('Need to Pay');

    // PDF Summary
    const resPdf = await client.get('/export/pdf', {
      headers: { Authorization: `Bearer ${adminToken}` },
      responseType: 'arraybuffer'
    });
    expect(resPdf.status).toBe(200);
    expect(resPdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(resPdf.data.length).toBeGreaterThan(500); // Valid PDF binary bytes
  });

});
