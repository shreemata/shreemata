process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');
const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');
const pointsRoutes = require('../routes/points');
const referralRoutes = require('../routes/referral');
const { distributeCommissions } = require('../services/commissionDistribution');

jest.setTimeout(60000);

let server;
let client;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/points', pointsRoutes);
  app.use('/api/referral', referralRoutes);

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

describe('Virtual Referral Holding Balance & VIP Master Card Transfer System', () => {
  let rootUser;
  let ownerUser;
  let ownerToken;
  let virtualNode1;
  let virtualNode2;
  let otherUser;
  let otherToken;
  let vipCard;

  beforeEach(async () => {
    // Root level user
    rootUser = await User.create({
      name: 'Root Admin',
      email: 'root@example.com',
      role: 'admin',
      isMember: true,
      treeLevel: 1,
      treePosition: 0
    });

    // Owner of virtual nodes
    ownerUser = await User.create({
      name: 'Real Owner',
      email: 'owner@example.com',
      role: 'user',
      isMember: true,
      wallet: 500, // Normal cash wallet
      treeLevel: 2,
      treePosition: 0,
      treeParent: rootUser._id
    });
    ownerToken = generateToken(ownerUser);

    // Other user (attacker)
    otherUser = await User.create({
      name: 'Attacker User',
      email: 'attacker@example.com',
      role: 'user',
      isMember: true,
      wallet: 100,
      treeLevel: 2,
      treePosition: 1,
      treeParent: rootUser._id
    });
    otherToken = generateToken(otherUser);

    // Virtual Referral 1 owned by ownerUser
    virtualNode1 = await User.create({
      name: 'Virtual Node 1',
      email: 'vr1@virtual.local',
      role: 'user',
      isVirtual: true,
      originalUser: ownerUser._id,
      treeLevel: 3,
      treePosition: 0,
      treeParent: ownerUser._id,
      virtualEarningsBalancePaise: 1840, // ₹18.40 available
      virtualLifetimeEarningsPaise: 3050, // ₹30.50 lifetime
      virtualClaimedEarningsPaise: 1210   // ₹12.10 claimed
    });

    // Virtual Referral 2 owned by ownerUser
    virtualNode2 = await User.create({
      name: 'Virtual Node 2',
      email: 'vr2@virtual.local',
      role: 'user',
      isVirtual: true,
      originalUser: ownerUser._id,
      treeLevel: 3,
      treePosition: 1,
      treeParent: ownerUser._id,
      virtualEarningsBalancePaise: 725,  // ₹7.25 available
      virtualLifetimeEarningsPaise: 725,  // ₹7.25 lifetime
      virtualClaimedEarningsPaise: 0
    });

    // VIP Master Card for ownerUser
    vipCard = await VipMasterCard.create({
      userId: ownerUser._id,
      cardNumber: 'VIP 0000 0001',
      tier: 1,
      milestoneAmount: 100,
      balance: 150 // Existing VIP Card balance ₹150
    });
  });

  test('1. Virtual Tree Pool earning increases virtual balance and lifetime earnings in paise', async () => {
    const Order = require('../models/Order');
    const buyer = await User.create({
      name: 'Buyer Under Virtual',
      email: 'buyer@example.com',
      role: 'user',
      isMember: true,
      treeLevel: 4,
      treePosition: 0,
      treeParent: virtualNode1._id,
      referredBy: 'ROOT'
    });

    const mockOrder = await Order.create({
      orderNumber: 'ORD-VT-100',
      orderProfitTotal: 1000,
      totalAmount: 1000,
      user_id: buyer._id,
      paymentStatus: 'completed',
      status: 'completed'
    });

    await distributeCommissions(mockOrder._id, buyer._id, 1000, 1000);

    const updatedVirtual = await User.findById(virtualNode1._id);
    expect(updatedVirtual.virtualEarningsBalancePaise).toBeGreaterThan(1840);
    expect(updatedVirtual.virtualLifetimeEarningsPaise).toBeGreaterThan(3050);
  });

  test('2 & 3. Virtual Tree Pool earning does NOT credit owner normal wallet or VIP card initially', async () => {
    const Order = require('../models/Order');
    await User.findByIdAndUpdate(otherUser._id, { referralCode: 'OTHER_REF' });
    const buyer = await User.create({
      name: 'Buyer 2',
      email: 'buyer2@example.com',
      role: 'user',
      isMember: true,
      treeLevel: 4,
      treePosition: 0,
      treeParent: virtualNode1._id,
      referredBy: 'OTHER_REF'
    });

    const mockOrder = await Order.create({
      orderNumber: 'ORD-VT-101',
      orderProfitTotal: 1000,
      totalAmount: 1000,
      user_id: buyer._id,
      paymentStatus: 'completed',
      status: 'completed'
    });

    const initialVipBalance = vipCard.balance;

    await distributeCommissions(mockOrder._id, buyer._id, 1000, 1000);

    const freshVirtual = await User.findById(virtualNode1._id);
    const freshVipCard = await VipMasterCard.findById(vipCard._id);

    // Virtual node accumulated its tree pool earning
    expect(freshVirtual.virtualEarningsBalancePaise).toBeGreaterThan(1840);

    // VIP Master Card balance is untouched before manual claim
    expect(freshVipCard.balance).toBe(initialVipBalance);
  });

  test('4, 5, 6, 7, 8 & 9. Claim transfers full available balance to VIP Master Card and resets virtual balance', async () => {
    const res = await client.post(
      `/points/virtual-referrals/${virtualNode1._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.transferredAmount).toBe(18.40);

    // Check virtual node balance reset
    const freshVirtual1 = await User.findById(virtualNode1._id);
    expect(freshVirtual1.virtualEarningsBalancePaise).toBe(0);
    expect(freshVirtual1.virtualClaimedEarningsPaise).toBe(1210 + 1840);

    // Check VIP card balance updated (150 + 18.40 = 168.40)
    const freshVipCard = await VipMasterCard.findById(vipCard._id);
    expect(freshVipCard.balance).toBeCloseTo(168.40);

    // Check normal cash wallet untouched (₹500)
    const freshOwner = await User.findById(ownerUser._id);
    expect(freshOwner.wallet).toBe(500);

    // Check VirtualReferralTransaction ledger entry created
    const ledgerTx = await VirtualReferralTransaction.findOne({
      virtualReferralId: virtualNode1._id,
      type: 'claim_to_vip_master_card'
    });
    expect(ledgerTx).not.toBeNull();
    expect(ledgerTx.amountPaise).toBe(-1840);
  });

  test('10 & 11. Owner without VIP Master Card is rejected with required error message and balance preserved', async () => {
    // Delete VIP card
    await VipMasterCard.deleteMany({ userId: ownerUser._id });

    const res = await client.post(
      `/points/virtual-referrals/${virtualNode1._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toBe('VIP Master Card required to claim Virtual Referral earnings.');

    // Check virtual balance untouched
    const freshVirtual1 = await User.findById(virtualNode1._id);
    expect(freshVirtual1.virtualEarningsBalancePaise).toBe(1840);
  });

  test('12. User cannot claim someone else\'s virtual referral', async () => {
    const res = await client.post(
      `/points/virtual-referrals/${virtualNode1._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${otherToken}` } }
    );

    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);

    // Balance preserved
    const freshVirtual1 = await User.findById(virtualNode1._id);
    expect(freshVirtual1.virtualEarningsBalancePaise).toBe(1840);
  });

  test('13. Zero balance cannot be claimed', async () => {
    // Set balance to 0
    await User.findByIdAndUpdate(virtualNode1._id, { virtualEarningsBalancePaise: 0 });

    const res = await client.post(
      `/points/virtual-referrals/${virtualNode1._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );

    expect(res.status).toBe(400);
    expect(res.data.message).toBe('No available virtual earnings to claim');
  });

  test('14. Concurrent claim requests cannot double-credit VIP Master Card', async () => {
    const results = await Promise.all([
      client.post(`/points/virtual-referrals/${virtualNode1._id}/claim`, {}, { headers: { Authorization: `Bearer ${ownerToken}` } }),
      client.post(`/points/virtual-referrals/${virtualNode1._id}/claim`, {}, { headers: { Authorization: `Bearer ${ownerToken}` } })
    ]);

    const successCount = results.filter(r => r.status === 200 && r.data.success === true).length;
    const failureCount = results.filter(r => r.status >= 400).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    // Verify VIP card credited exactly once
    const freshVipCard = await VipMasterCard.findById(vipCard._id);
    expect(freshVipCard.balance).toBeCloseTo(168.40);
  });

  test('17 & 18. Claiming VR1 balance does not affect VR2 balance', async () => {
    await client.post(
      `/points/virtual-referrals/${virtualNode1._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );

    const freshVR2 = await User.findById(virtualNode2._id);
    expect(freshVR2.virtualEarningsBalancePaise).toBe(725);
  });

  test('GET /api/points/virtual-referrals returns structured summary and virtual card list', async () => {
    const res = await client.get('/points/virtual-referrals', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.summary.totalVirtualReferrals).toBe(2);
    expect(res.data.summary.totalAvailableEarnings).toBeCloseTo(25.65);
    expect(res.data.summary.hasVipMasterCard).toBe(true);
    expect(res.data.virtualReferrals.length).toBe(2);
  });

  test('GET /api/points/virtual-referrals includes zero balance virtual referrals', async () => {
    // Zero out balances for virtualNode1 and delete virtualNode2
    await User.findByIdAndUpdate(virtualNode1._id, {
      virtualEarningsBalancePaise: 0,
      virtualLifetimeEarningsPaise: 0,
      virtualClaimedEarningsPaise: 0
    });
    await User.findByIdAndDelete(virtualNode2._id);

    const res = await client.get('/points/virtual-referrals', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.summary.totalVirtualReferrals).toBe(1);
    expect(res.data.summary.totalAvailableEarnings).toBe(0);
    expect(res.data.virtualReferrals.length).toBe(1);
    expect(res.data.virtualReferrals[0].availableEarnings).toBe(0);
    expect(res.data.virtualReferrals[0].treeLevel).toBe(3);
  });

  test('GET /api/points/virtual-referrals returns empty array when user has no virtual referrals', async () => {
    const res = await client.get('/points/virtual-referrals', {
      headers: { Authorization: `Bearer ${otherToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.summary.totalVirtualReferrals).toBe(0);
    expect(res.data.virtualReferrals).toEqual([]);
  });
});
