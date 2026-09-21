process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');
const referralRoutes = require('../routes/referral');

jest.setTimeout(60000);

let server;
let client;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/referral', referralRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api/referral`,
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

describe('Virtual Tree Income in Commission History Suite', () => {

  it('1. returns Virtual Tree Income in commission history and excludes claim_to_vip_master_card', async () => {
    const owner = await User.create({
      name: 'Shivraj Palegar',
      email: 'shivraj@example.com',
      password: 'password123',
      wallet: 50.00
    });

    const virtualNode = await User.create({
      name: 'Shivraj Palegar-Virtual-1',
      email: 'virtual-shivraj-1@system.local',
      isVirtual: true,
      originalUser: owner._id,
      treeLevel: 2,
      treePosition: 0,
      virtualEarningsBalancePaise: 90,
      virtualLifetimeEarningsPaise: 90
    });

    // 1. Direct referral earnings in WalletTransaction (₹10)
    await WalletTransaction.create({
      userId: owner._id,
      amount: 10.00,
      type: 'credit',
      category: 'referral_commission',
      description: 'Direct Referral Commission from User B'
    });

    // 2. Buyer cashback earnings in WalletTransaction (₹5)
    await WalletTransaction.create({
      userId: owner._id,
      amount: 5.00,
      type: 'credit',
      category: 'buyer_cashback',
      description: 'Buyer Cashback from Order #101'
    });

    // 3. Tree commission for real node in WalletTransaction (₹15)
    await WalletTransaction.create({
      userId: owner._id,
      amount: 15.00,
      type: 'credit',
      category: 'tree_commission',
      description: 'Tree Commission from Level 1'
    });

    // 4. Virtual Tree Pool Commission in VirtualReferralTransaction (90 paise = ₹0.90)
    const virtualTx1 = await VirtualReferralTransaction.create({
      virtualReferralId: virtualNode._id,
      ownerUserId: owner._id,
      type: 'tree_commission',
      amountPaise: 90,
      balanceAfterPaise: 90,
      sourceTreeLevel: 2
    });

    // 5. Internal Transfer claim_to_vip_master_card (MUST BE EXCLUDED)
    await VirtualReferralTransaction.create({
      virtualReferralId: virtualNode._id,
      ownerUserId: owner._id,
      type: 'claim_to_vip_master_card',
      amountPaise: 90,
      balanceAfterPaise: 0
    });

    const token = jwt.sign({ id: owner._id.toString(), role: 'user' }, process.env.JWT_SECRET);

    // Call Commission History API (All)
    const res = await client.get('/commissions', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.summary).toBeDefined();
    expect(res.data.counts).toBeDefined();

    // Summary Checks
    // Total Earnings = Direct (10) + Tree (15) + Cashback (5) + Virtual (0.90) = 30.90
    expect(res.data.summary.totalCommission).toBe(30.90);
    expect(res.data.summary.totalEarnings).toBe(30.90);
    expect(res.data.summary.totalDirectCommission).toBe(10);
    expect(res.data.summary.totalTreeCommission).toBe(15);
    expect(res.data.summary.totalCashbackCommission).toBe(5);
    expect(res.data.summary.totalVirtualTreeIncome).toBe(0.90);
    expect(res.data.summary.virtualTreeIncome).toBe(0.90);
    expect(res.data.summary.availableWallet).toBe(50.00); // Wallet is independent

    // Counts Checks
    expect(res.data.counts.all).toBe(4);
    expect(res.data.counts.directReferral).toBe(1);
    expect(res.data.counts.buyerCashback).toBe(1);
    expect(res.data.counts.treeCommission).toBe(1);
    expect(res.data.counts.virtualTreeIncome).toBe(1);

    // Check Virtual Tree Income Row
    const virtualRow = res.data.commissions.find(c => c.commissionType === 'virtual_tree_income');
    expect(virtualRow).toBeDefined();
    expect(virtualRow.id).toBe(virtualTx1._id.toString());
    expect(virtualRow.amount).toBe(0.90);
    expect(virtualRow.displayCategory).toBe('Virtual Tree Income');
    expect(virtualRow.status).toBe('held');
    expect(virtualRow.virtualReferralNumber).toBe('VR-0001');
    expect(virtualRow.sourceTreeLevel).toBe(2);
  });

  it('2. filters by virtual_tree_income correctly and excludes other types', async () => {
    const owner = await User.create({
      name: 'Owner User',
      email: 'owner@example.com',
      password: 'password123',
      wallet: 0
    });

    const virtualNode = await User.create({
      name: 'Owner User-Virtual-1',
      email: 'v1@system.local',
      isVirtual: true,
      originalUser: owner._id,
      treeLevel: 3,
      treePosition: 1
    });

    await WalletTransaction.create({
      userId: owner._id,
      amount: 20.00,
      type: 'credit',
      category: 'referral_commission',
      description: 'Direct Referral Commission from User B'
    });

    await VirtualReferralTransaction.create({
      virtualReferralId: virtualNode._id,
      ownerUserId: owner._id,
      type: 'tree_commission',
      amountPaise: 250, // ₹2.50
      balanceAfterPaise: 250,
      sourceTreeLevel: 3
    });

    const token = jwt.sign({ id: owner._id.toString(), role: 'user' }, process.env.JWT_SECRET);

    // Filter by virtual_tree_income
    const res = await client.get('/commissions?type=virtual_tree_income', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.commissions.length).toBe(1);
    expect(res.data.commissions[0].commissionType).toBe('virtual_tree_income');
    expect(res.data.commissions[0].amount).toBe(2.50);

    // Filter by referral
    const referralRes = await client.get('/commissions?type=referral', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(referralRes.data.commissions.length).toBe(1);
    expect(referralRes.data.commissions[0].commissionType).toBe('referral');
  });

  it('3. ensures no double counting after Take Money claim transfer', async () => {
    const owner = await User.create({
      name: 'Owner User 2',
      email: 'owner2@example.com',
      password: 'password123',
      wallet: 100.00
    });

    const virtualNode = await User.create({
      name: 'Owner User 2-Virtual-1',
      email: 'v2@system.local',
      isVirtual: true,
      originalUser: owner._id
    });

    // 1. Virtual node earns ₹5.00
    await VirtualReferralTransaction.create({
      virtualReferralId: virtualNode._id,
      ownerUserId: owner._id,
      type: 'tree_commission',
      amountPaise: 500,
      balanceAfterPaise: 500,
      sourceTreeLevel: 2
    });

    // 2. Owner claims ₹5.00 to VIP Master Card (claim_to_vip_master_card transaction)
    await VirtualReferralTransaction.create({
      virtualReferralId: virtualNode._id,
      ownerUserId: owner._id,
      type: 'claim_to_vip_master_card',
      amountPaise: 500,
      balanceAfterPaise: 0
    });

    const token = jwt.sign({ id: owner._id.toString(), role: 'user' }, process.env.JWT_SECRET);

    const res = await client.get('/commissions', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Total earnings must be 5.00 (NOT 10.00), claims are ignored
    expect(res.data.summary.totalCommission).toBe(5.00);
    expect(res.data.summary.totalVirtualTreeIncome).toBe(5.00);
    expect(res.data.counts.all).toBe(1);
    expect(res.data.counts.virtualTreeIncome).toBe(1);
  });

});
