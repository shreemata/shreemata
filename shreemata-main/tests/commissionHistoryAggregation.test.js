const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.user && req.headers['x-user-id']) {
      req.user = { id: req.headers['x-user-id'] };
    }
    next();
  }
}));

const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const Order = require('../models/Order');

// Router under test
const referralRouter = require('../routes/referral');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await WalletTransaction.deleteMany({});
  await Order.deleteMany({});
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  // bypass auth middleware by setting user on req
  if (req.headers['x-user-id']) {
    req.user = { id: req.headers['x-user-id'] };
  }
  next();
});
app.use('/api/referral', referralRouter);

function callGetCommissions(userId, query = {}) {
  return new Promise((resolve) => {
    const queryString = new URLSearchParams(query).toString();
    const url = '/api/referral/commissions' + (queryString ? '?' + queryString : '');
    
    const req = {
      method: 'GET',
      url: url,
      headers: { 'x-user-id': userId.toString() },
      query
    };

    const res = {
      _statusCode: 200,
      setHeader: function () {},
      status: function (code) {
        this._statusCode = code;
        return this;
      },
      json: function (data) {
        resolve({ status: this._statusCode, body: data });
      }
    };

    app.handle(req, res);
  });
}

describe('Commission History & Tree Earnings Aggregation Unit Tests', () => {
  let user, order;

  beforeEach(async () => {
    user = await User.create({
      name: 'Shakuntaladevi',
      email: 'shakuntala@example.com',
      password: 'password123',
      wallet: 150.00
    });

    order = await Order.create({
      user_id: user._id,
      orderNumber: 'SM-1001',
      totalAmount: 1000,
      status: 'completed'
    });
  });

  it('1. normal Tree Pool credit appears in Tree Earnings', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 10.50,
      type: 'credit',
      category: 'tree_commission',
      description: 'Tree Commission (Level 1) for Order #SM-1001',
      orderId: order._id
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(10.50);
    expect(res.body.summary.treeCommissionCount).toBe(1);
    expect(res.body.commissions[0].commissionType).toBe('tree');
  });

  it('2. multiple Tree Pool credits are summed', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 10.50,
      type: 'credit',
      category: 'tree_commission',
      description: 'Tree Commission 1',
      orderId: order._id
    });
    await WalletTransaction.create({
      userId: user._id,
      amount: 25.25,
      type: 'credit',
      category: 'tree_commission',
      description: 'Tree Commission 2',
      orderId: order._id
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(35.75);
    expect(res.body.summary.treeCommissionCount).toBe(2);
  });

  it("3. virtual referral Tree Pool credit counts toward owner's Tree Earnings", async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 15.00,
      type: 'credit',
      category: 'tree_commission',
      description: 'Tree Commission (L2, via virtual) for Order #SM-1001',
      orderId: order._id
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(15.00);
    expect(res.body.commissions[0].isVirtual).toBe(true);
    expect(res.body.commissions[0].commissionType).toBe('tree');
  });

  it('4. Direct Referral excluded from Tree Earnings', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 20.00,
      type: 'credit',
      category: 'referral_commission',
      description: 'Referral Commission',
      orderId: order._id
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(0);
    expect(res.body.summary.totalDirectCommission).toBe(20.00);
    expect(res.body.summary.treeCommissionCount).toBe(0);
  });

  it('5. Buyer Cashback excluded from Tree Earnings', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 30.00,
      type: 'credit',
      category: 'direct_commission',
      description: 'Cashback for Order',
      orderId: order._id
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(0);
    expect(res.body.summary.totalCashbackCommission).toBe(30.00);
  });

  it('6. failed/pending Tree Pool entries excluded', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 50.00,
      type: 'debit',
      category: 'withdrawal',
      description: 'Withdrawal'
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(0);
    expect(res.body.summary.treeCommissionCount).toBe(0);
  });

  it('7. Tree Commission filter count correct', async () => {
    await WalletTransaction.create({ userId: user._id, amount: 10.00, type: 'credit', category: 'tree_commission', description: 'Tree 1' });
    await WalletTransaction.create({ userId: user._id, amount: 20.00, type: 'credit', category: 'referral_commission', description: 'Ref 1' });
    await WalletTransaction.create({ userId: user._id, amount: 30.00, type: 'credit', category: 'direct_commission', description: 'CB 1' });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.treeCommissionCount).toBe(1);
    expect(res.body.summary.directCommissionCount).toBe(1);
    expect(res.body.summary.cashbackCommissionCount).toBe(1);
  });

  it('8. Tree Commission filter rows correct', async () => {
    const t1 = await WalletTransaction.create({ userId: user._id, amount: 10.00, type: 'credit', category: 'tree_commission', description: 'Tree 1' });
    await WalletTransaction.create({ userId: user._id, amount: 20.00, type: 'credit', category: 'referral_commission', description: 'Ref 1' });

    const res = await callGetCommissions(user._id, { type: 'tree' });

    expect(res.status).toBe(200);
    expect(res.body.commissions).toHaveLength(1);
    expect(res.body.commissions[0]._id.toString()).toBe(t1._id.toString());
    expect(res.body.commissions[0].commissionType).toBe('tree');
  });

  it('9. historical Tree Pool transaction type recognized', async () => {
    await WalletTransaction.create({
      userId: user._id,
      amount: 12.50,
      type: 'credit',
      category: 'tree_pool',
      description: 'Historical Tree Pool payout'
    });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(12.50);
    expect(res.body.commissions[0].commissionType).toBe('tree');
  });

  it('10. Total Earnings reconciliation correct', async () => {
    await WalletTransaction.create({ userId: user._id, amount: 50.00, type: 'credit', category: 'tree_commission', description: 'Tree' });
    await WalletTransaction.create({ userId: user._id, amount: 20.00, type: 'credit', category: 'referral_commission', description: 'Ref' });
    await WalletTransaction.create({ userId: user._id, amount: 30.00, type: 'credit', category: 'direct_commission', description: 'CB' });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    const { totalCommission, totalTreeCommission, totalDirectCommission, totalCashbackCommission } = res.body.summary;
    expect(totalCommission).toBe(totalTreeCommission + totalDirectCommission + totalCashbackCommission);
    expect(totalCommission).toBe(100.00);
  });

  it('11. Available Wallet remains independent', async () => {
    await User.findByIdAndUpdate(user._id, { wallet: 999.99 });
    await WalletTransaction.create({ userId: user._id, amount: 50.00, type: 'credit', category: 'tree_commission', description: 'Tree' });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalCommission).toBe(50.00);
    expect(res.body.summary.walletBalance).toBe(999.99);
  });

  it('12. user with zero real Tree Pool credits correctly shows ₹0.00', async () => {
    await WalletTransaction.create({ userId: user._id, amount: 40.00, type: 'credit', category: 'direct_commission', description: 'CB' });

    const res = await callGetCommissions(user._id);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTreeCommission).toBe(0.00);
    expect(res.body.summary.totalCommission).toBe(40.00);
    expect(res.body.summary.treeCommissionCount).toBe(0);
  });
});
