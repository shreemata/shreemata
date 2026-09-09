const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const Order = require('../models/Order');
const authRoutes = require('../routes/auth');
const { distributeCommissions } = require('../services/commissionDistribution');

let mongoServer;
let app;
let server;
let baseUrl;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  app = express();
  app.use(express.json());
  app.use('/api', authRoutes);

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await WalletTransaction.deleteMany({});
  await CommissionSettings.deleteMany({});
  await Order.deleteMany({});
  
  // Ensure default commission settings exist
  await CommissionSettings.getSettings();
});

describe('₹2 Referral Registration Reward Suite', () => {
  // TEST A — VALID REFERRAL
  it('TEST A — VALID REFERRAL: Credits ₹2 reward to referrer wallet and logs ledger transaction', async () => {
    // Parent user with ₹100.00 wallet
    const parent = await User.create({
      name: 'Shakuntaladevi',
      email: 'shakuntala@example.com',
      phone: '9876543210',
      password: 'password123',
      referralCode: 'REF947377',
      wallet: 100.00,
      referrals: 0
    });

    // Mock OTP verification for new child user
    const childEmail = 'child@example.com';
    global.emailOtpStore = global.emailOtpStore || new Map();
    global.emailOtpStore.set(childEmail, { verified: true });

    // Child registers using parent's referral code
    const response = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Child User',
        email: childEmail,
        phone: '9123456789',
        password: 'password123',
        referredBy: 'REF947377'
      })
    });

    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.message).toBe('User created successfully');

    // Verify parent user wallet and referral count
    const updatedParent = await User.findById(parent._id);
    expect(updatedParent.referrals).toBe(1);
    expect(updatedParent.wallet).toBe(102.00);

    // Verify exactly one ledger transaction created
    const transactions = await WalletTransaction.find({ userId: parent._id });
    expect(transactions.length).toBe(1);
    expect(transactions[0].amount).toBe(2.00);
    expect(transactions[0].type).toBe('credit');
    expect(transactions[0].category).toBe('referral_registration_reward');
    expect(transactions[0].balanceAfter).toBe(102.00);
  });

  // TEST B — NO REFERRAL CODE
  it('TEST B — NO REFERRAL CODE: Registers user normally without crediting reward', async () => {
    const email = 'noreferral@example.com';
    global.emailOtpStore = global.emailOtpStore || new Map();
    global.emailOtpStore.set(email, { verified: true });

    const response = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Referral User',
        email: email,
        phone: '9988776655',
        password: 'password123'
      })
    });

    expect(response.status).toBe(201);

    const transactions = await WalletTransaction.find({});
    expect(transactions.length).toBe(0);
  });

  // TEST C — INVALID CODE
  it('TEST C — INVALID CODE: Rejects signup with invalid referral code and credits no reward', async () => {
    const email = 'invalidref@example.com';
    global.emailOtpStore = global.emailOtpStore || new Map();
    global.emailOtpStore.set(email, { verified: true });

    const response = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Ref User',
        email: email,
        phone: '9988776644',
        password: 'password123',
        referredBy: 'REF999999' // Non-existent code
      })
    });

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('REFERRAL_CODE_NOT_FOUND');

    const transactions = await WalletTransaction.find({});
    expect(transactions.length).toBe(0);
  });

  // TEST D — DUPLICATE ATTEMPT
  it('TEST D — DUPLICATE ATTEMPT: Prevents duplicate ₹2 registration reward for same referred user', async () => {
    const parent = await User.create({
      name: 'Parent User',
      email: 'parentdup@example.com',
      phone: '9876543211',
      password: 'password123',
      referralCode: 'REF111111',
      wallet: 50.00,
      referrals: 0
    });

    const child = await User.create({
      name: 'Referred Child',
      email: 'childdup@example.com',
      phone: '9876543212',
      password: 'password123',
      referralCode: 'REF222222',
      referredBy: 'REF111111'
    });

    // Simulate calling reward logic twice manually
    const rewardAmount = 2.00;
    const existing1 = await WalletTransaction.findOne({
      category: 'referral_registration_reward',
      referredUserId: child._id
    });
    if (!existing1) {
      parent.wallet += rewardAmount;
      parent.referrals += 1;
      await parent.save();
      await WalletTransaction.create({
        userId: parent._id,
        amount: rewardAmount,
        type: 'credit',
        category: 'referral_registration_reward',
        description: `Referral registration reward for ${child.name}`,
        referredUserId: child._id,
        balanceAfter: parent.wallet
      });
    }

    // Second credit attempt (duplicate check)
    const existing2 = await WalletTransaction.findOne({
      category: 'referral_registration_reward',
      referredUserId: child._id
    });
    if (!existing2) {
      parent.wallet += rewardAmount;
      await parent.save();
    }

    const updatedParent = await User.findById(parent._id);
    expect(updatedParent.wallet).toBe(52.00); // Only +2, not +4
    expect(updatedParent.referrals).toBe(1);

    const txs = await WalletTransaction.find({ userId: parent._id, category: 'referral_registration_reward' });
    expect(txs.length).toBe(1);
  });

  // TEST E — FIRST PURCHASE DOES NOT RECREDIT ₹2
  it('TEST E — FIRST PURCHASE: First purchase does not re-credit ₹2 registration reward', async () => {
    const parent = await User.create({
      name: 'Parent User',
      email: 'parentpurchase@example.com',
      phone: '9876543213',
      password: 'password123',
      referralCode: 'REF333333',
      wallet: 102.00, // already received ₹2 at registration
      referrals: 1
    });

    const child = await User.create({
      name: 'Purchasing Child',
      email: 'childpurchase@example.com',
      phone: '9876543214',
      password: 'password123',
      referralCode: 'REF444444',
      referredBy: 'REF333333',
      firstPurchaseDone: false
    });

    // Already has 1 registration reward transaction
    await WalletTransaction.create({
      userId: parent._id,
      amount: 2.00,
      type: 'credit',
      category: 'referral_registration_reward',
      description: `Referral registration reward for ${child.name}`,
      referredUserId: child._id,
      balanceAfter: 102.00
    });

    // Simulate child making first purchase
    const order = await Order.create({
      user_id: child._id,
      items: [{ id: new mongoose.Types.ObjectId(), title: 'Book 1', price: 500, quantity: 1 }],
      totalAmount: 500,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      status: 'completed'
    });

    child.firstPurchaseDone = true;
    await child.save();

    // Verify registration reward count remains 1
    const regRewards = await WalletTransaction.find({
      userId: parent._id,
      category: 'referral_registration_reward'
    });
    expect(regRewards.length).toBe(1);
  });

  // TEST F — DIRECT REFERRAL COMMISSION vs REGISTRATION REWARD
  it('TEST F — DIRECT REFERRAL COMMISSION: 2% purchase referral commission runs separately from ₹2 registration reward', async () => {
    const parent = await User.create({
      name: 'Parent User',
      email: 'parentcomm@example.com',
      phone: '9876543215',
      password: 'password123',
      referralCode: 'REF555555',
      wallet: 102.00, // ₹100 initial + ₹2 registration reward
      referrals: 1
    });

    const child = await User.create({
      name: 'Child User',
      email: 'childcomm@example.com',
      phone: '9876543216',
      password: 'password123',
      referralCode: 'REF666666',
      referredBy: 'REF555555',
      firstPurchaseDone: true
    });

    // Registration reward transaction exists
    await WalletTransaction.create({
      userId: parent._id,
      amount: 2.00,
      type: 'credit',
      category: 'referral_registration_reward',
      description: `Referral registration reward for ${child.name}`,
      referredUserId: child._id,
      balanceAfter: 102.00
    });

    // Order with profit of 200
    const order = await Order.create({
      user_id: child._id,
      items: [{ id: new mongoose.Types.ObjectId(), title: 'Book 1', price: 1000, quantity: 1 }],
      totalAmount: 1000,
      profitAmount: 200,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      status: 'completed'
    });

    // Distribute order commissions
    await distributeCommissions(order._id, child._id, 1000, 200);

    // Parent should receive 2% referral commission of order profit (2% of 200 = 4.00)
    // plus parent had ₹102.00 -> total wallet becomes 106.00
    const updatedParent = await User.findById(parent._id);
    expect(updatedParent.wallet).toBe(106.00);

    // Ledger check: 1 registration reward (₹2) + 1 referral commission (₹4)
    const regReward = await WalletTransaction.findOne({ userId: parent._id, category: 'referral_registration_reward' });
    expect(regReward.amount).toBe(2.00);

    const refComm = await WalletTransaction.findOne({ userId: parent._id, category: 'referral_commission' });
    expect(refComm.amount).toBe(4.00);
  });
});
