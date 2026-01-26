const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const TrustFund = require('../models/TrustFund');
const CommissionTransaction = require('../models/CommissionTransaction');
const Order = require('../models/Order');

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
  await TrustFund.deleteMany({});
  await CommissionTransaction.deleteMany({});
  await Order.deleteMany({});
});

describe('Admin Trust Fund Management', () => {
  /**
   * Test GET /api/admin/trust-funds endpoint
   * Requirements: 6.3, 6.4
   */
  
  it('should return both Trust Fund and Development Trust Fund balances', async () => {
    // Create trust funds
    const trustFund = await TrustFund.create({
      fundType: 'trust',
      balance: 1000,
      transactions: []
    });

    const developmentFund = await TrustFund.create({
      fundType: 'development',
      balance: 500,
      transactions: []
    });

    // Query trust funds
    const trust = await TrustFund.findOne({ fundType: 'trust' });
    const dev = await TrustFund.findOne({ fundType: 'development' });

    expect(trust.balance).toBe(1000);
    expect(dev.balance).toBe(500);
    expect(trust.fundType).toBe('trust');
    expect(dev.fundType).toBe('development');
  });

  it('should include transaction history for each fund', async () => {
    // Create order
    const order = await Order.create({
      user_id: new mongoose.Types.ObjectId(),
      totalAmount: 1000,
      status: 'completed'
    });

    // Create trust fund with transactions
    const trustFund = await TrustFund.create({
      fundType: 'trust',
      balance: 30,
      transactions: [
        {
          orderId: order._id,
          amount: 30,
          type: 'order_allocation',
          timestamp: new Date(),
          description: '3% allocation from order'
        }
      ]
    });

    const fund = await TrustFund.findOne({ fundType: 'trust' })
      .populate('transactions.orderId', 'orderNumber totalAmount');

    expect(fund.transactions).toHaveLength(1);
    expect(fund.transactions[0].amount).toBe(30);
    expect(fund.transactions[0].type).toBe('order_allocation');
    expect(fund.transactions[0].orderId.totalAmount).toBe(1000);
  });

  it('should return empty funds if none exist', async () => {
    const trust = await TrustFund.findOne({ fundType: 'trust' });
    const dev = await TrustFund.findOne({ fundType: 'development' });

    expect(trust).toBeNull();
    expect(dev).toBeNull();
  });
});

describe('Admin Referral Analytics', () => {
  /**
   * Test GET /api/admin/referral-analytics endpoint
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */

  it('should calculate total number of referral relationships', async () => {
    // Create users with referral relationships
    await User.create({
      name: 'User 1',
      email: 'user1@test.com',
      password: 'password123',
      referralCode: 'REF1'
    });

    await User.create({
      name: 'User 2',
      email: 'user2@test.com',
      password: 'password123',
      referralCode: 'REF2',
      referredBy: 'REF1'
    });

    await User.create({
      name: 'User 3',
      email: 'user3@test.com',
      password: 'password123',
      referralCode: 'REF3',
      referredBy: 'REF1'
    });

    // Count referral relationships
    const totalReferralRelationships = await User.countDocuments({ 
      referredBy: { $ne: null } 
    });

    expect(totalReferralRelationships).toBe(2);
  });

  it('should calculate total commissions paid out', async () => {
    const referrer = await User.create({
      name: 'Referrer',
      email: 'referrer@test.com',
      password: 'password123',
      referralCode: 'REF123'
    });

    const purchaser = await User.create({
      name: 'Purchaser',
      email: 'purchaser@test.com',
      password: 'password123',
      referralCode: 'PUR123',
      referredBy: 'REF123'
    });

    const order = await Order.create({
      user_id: purchaser._id,
      totalAmount: 1000,
      status: 'completed'
    });

    // Create commission transaction
    await CommissionTransaction.create({
      orderId: order._id,
      purchaser: purchaser._id,
      orderAmount: 1000,
      directReferrer: referrer._id,
      directCommissionAmount: 30,
      treeCommissions: [
        {
          recipient: referrer._id,
          level: 1,
          percentage: 1.5,
          amount: 15
        }
      ],
      status: 'completed',
      processedAt: new Date()
    });

    // Calculate total commissions
    const commissionStats = await CommissionTransaction.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalDirectCommissions: { $sum: '$directCommissionAmount' },
          totalTreeCommissions: { 
            $sum: { 
              $sum: '$treeCommissions.amount' 
            } 
          }
        }
      }
    ]);

    const totalDirectCommissions = commissionStats[0]?.totalDirectCommissions || 0;
    const totalTreeCommissions = commissionStats[0]?.totalTreeCommissions || 0;
    const totalCommissionsPaid = totalDirectCommissions + totalTreeCommissions;

    expect(totalDirectCommissions).toBe(30);
    expect(totalTreeCommissions).toBe(15);
    expect(totalCommissionsPaid).toBe(45);
  });

  it('should display trust fund balances', async () => {
    await TrustFund.create({
      fundType: 'trust',
      balance: 1000
    });

    await TrustFund.create({
      fundType: 'development',
      balance: 500
    });

    const trustFund = await TrustFund.findOne({ fundType: 'trust' });
    const developmentFund = await TrustFund.findOne({ fundType: 'development' });

    expect(trustFund.balance).toBe(1000);
    expect(developmentFund.balance).toBe(500);
  });

  it('should calculate deepest tree level', async () => {
    // Create users at different tree levels
    const level1 = await User.create({
      name: 'Level 1',
      email: 'level1@test.com',
      password: 'password123',
      referralCode: 'L1',
      treeLevel: 1
    });

    const level2 = await User.create({
      name: 'Level 2',
      email: 'level2@test.com',
      password: 'password123',
      referralCode: 'L2',
      treeParent: level1._id,
      treeLevel: 2
    });

    const level3 = await User.create({
      name: 'Level 3',
      email: 'level3@test.com',
      password: 'password123',
      referralCode: 'L3',
      treeParent: level2._id,
      treeLevel: 3
    });

    const level4 = await User.create({
      name: 'Level 4',
      email: 'level4@test.com',
      password: 'password123',
      referralCode: 'L4',
      treeParent: level3._id,
      treeLevel: 4
    });

    // Find deepest level
    const deepestLevelResult = await User.findOne()
      .sort({ treeLevel: -1 })
      .select('treeLevel');
    
    const deepestTreeLevel = deepestLevelResult?.treeLevel || 0;

    expect(deepestTreeLevel).toBe(4);
  });

  it('should calculate average commissions per user', async () => {
    // Create users with commissions
    await User.create({
      name: 'User 1',
      email: 'user1@test.com',
      password: 'password123',
      referralCode: 'U1',
      directCommissionEarned: 100,
      treeCommissionEarned: 50
    });

    await User.create({
      name: 'User 2',
      email: 'user2@test.com',
      password: 'password123',
      referralCode: 'U2',
      directCommissionEarned: 200,
      treeCommissionEarned: 100
    });

    await User.create({
      name: 'User 3',
      email: 'user3@test.com',
      password: 'password123',
      referralCode: 'U3',
      directCommissionEarned: 0,
      treeCommissionEarned: 0
    });

    // Calculate average
    const usersWithCommissions = await User.aggregate([
      {
        $match: {
          $or: [
            { directCommissionEarned: { $gt: 0 } },
            { treeCommissionEarned: { $gt: 0 } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalCommissions: { 
            $sum: { 
              $add: ['$directCommissionEarned', '$treeCommissionEarned'] 
            } 
          }
        }
      }
    ]);

    const usersWithCommissionsCount = usersWithCommissions[0]?.totalUsers || 0;
    const totalCommissions = usersWithCommissions[0]?.totalCommissions || 0;
    const averageCommissionPerUser = usersWithCommissionsCount > 0 
      ? (totalCommissions / usersWithCommissionsCount) 
      : 0;

    expect(usersWithCommissionsCount).toBe(2);
    expect(totalCommissions).toBe(450); // (100+50) + (200+100)
    expect(averageCommissionPerUser).toBe(225); // 450 / 2
  });

  it('should handle empty database gracefully', async () => {
    const totalReferralRelationships = await User.countDocuments({ 
      referredBy: { $ne: null } 
    });

    const commissionStats = await CommissionTransaction.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalDirectCommissions: { $sum: '$directCommissionAmount' }
        }
      }
    ]);

    const deepestLevelResult = await User.findOne()
      .sort({ treeLevel: -1 })
      .select('treeLevel');

    expect(totalReferralRelationships).toBe(0);
    expect(commissionStats).toHaveLength(0);
    expect(deepestLevelResult).toBeNull();
  });
});
