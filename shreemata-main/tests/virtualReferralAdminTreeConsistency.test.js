process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const pointsRoutes = require('../routes/points');
const adminReferralTreeRoutes = require('../routes/adminReferralTree');

jest.setTimeout(60000);

let server;
let client;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use('/api/points', pointsRoutes);
  app.use('/api/admin/referral-tree', adminReferralTreeRoutes);

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

describe('Virtual Referral Balance API Consistency (Owner Points API vs Admin Referral Tree API)', () => {
  it('returns identical virtual holding balances (90 paise) in owner API and admin tree API', async () => {
    // 1. Create owner user
    const owner = await User.create({
      name: 'Shivraj Palegar',
      email: 'shivraj@example.com',
      password: 'password123',
      role: 'user',
      referralCode: 'REFSHIVRAJ',
      treeLevel: 1,
      treePosition: 0,
      firstPurchaseDone: true
    });

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
      referralCode: 'REFADMIN',
      treeLevel: 1,
      treePosition: 1,
      firstPurchaseDone: true
    });

    // 2. Create virtual node for owner with 90 paise balance
    const virtualNode = await User.create({
      name: 'Shivraj Palegar-Virtual-1',
      email: 'virtual-shivraj-1@system.local',
      role: 'virtual',
      isVirtual: true,
      originalUser: owner._id,
      treeParent: owner._id,
      treeLevel: 2,
      treePosition: 0,
      firstPurchaseDone: true,
      virtualEarningsBalancePaise: 90,
      virtualLifetimeEarningsPaise: 90,
      virtualClaimedEarningsPaise: 0
    });

    // 3. Generate Auth Tokens
    const ownerToken = jwt.sign({ id: owner._id.toString(), role: 'user' }, process.env.JWT_SECRET);
    const adminToken = jwt.sign({ id: admin._id.toString(), role: 'admin' }, process.env.JWT_SECRET);

    // 4. Call Owner Virtual Referrals API
    const ownerRes = await client.get('/points/virtual-referrals', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });

    expect(ownerRes.status).toBe(200);
    expect(ownerRes.data.success).toBe(true);
    expect(ownerRes.data.virtualReferrals.length).toBe(1);

    const ownerVrData = ownerRes.data.virtualReferrals[0];
    expect(ownerVrData._id.toString()).toBe(virtualNode._id.toString());
    expect(ownerVrData.virtualEarningsBalancePaise).toBe(90);
    expect(ownerVrData.virtualLifetimeEarningsPaise).toBe(90);
    expect(ownerVrData.virtualClaimedEarningsPaise).toBe(0);

    // 5. Call Admin Referral Tree API
    const adminRes = await client.get('/admin/referral-tree/complete', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(adminRes.status).toBe(200);
    expect(adminRes.data.allUsers).toBeDefined();

    const adminVrData = adminRes.data.allUsers.find((u) => u.id.toString() === virtualNode._id.toString());
    expect(adminVrData).toBeDefined();
    expect(adminVrData.isVirtual).toBe(true);
    expect(adminVrData.ownerName).toBe('Shivraj Palegar');
    expect(adminVrData.virtualReferralNumber).toBe(1);

    // CRITICAL CONSISTENCY VERIFICATION
    expect(adminVrData.virtualEarningsBalancePaise).toBe(ownerVrData.virtualEarningsBalancePaise);
    expect(adminVrData.virtualLifetimeEarningsPaise).toBe(ownerVrData.virtualLifetimeEarningsPaise);
    expect(adminVrData.virtualClaimedEarningsPaise).toBe(ownerVrData.virtualClaimedEarningsPaise);

    expect(adminVrData.virtualEarningsBalancePaise).toBe(90);
    expect(adminVrData.virtualLifetimeEarningsPaise).toBe(90);
    expect(adminVrData.virtualClaimedEarningsPaise).toBe(0);
  });
});
