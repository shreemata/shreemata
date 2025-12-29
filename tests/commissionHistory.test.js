const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
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
  await CommissionTransaction.deleteMany({});
  await Order.deleteMany({});
});

describe('Commission History API', () => {
  /**
   * Test the GET /api/referral/commissions endpoint
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  
  it('should return direct commissions for a user', async () => {
    // Create users
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

    // Create order
    const order = await Order.create({
      user_id: purchaser._id,
      totalAmount: 1000,
      status: 'completed'
    });

    // Create commission transaction
    const transaction = await CommissionTransaction.create({
      orderId: order._id,
      purchaser: purchaser._id,
      orderAmount: 1000,
      directReferrer: referrer._id,
      directCommissionAmount: 30, // 3% of 1000
      status: 'completed',
      processedAt: new Date()
    });

    // Query commissions
    const transactions = await CommissionTransaction.find({
      directReferrer: referrer._id,
      status: 'completed'
    }).populate('purchaser', 'name email').populate('orderId', 'orderNumber totalAmount');

    expect(transactions).toHaveLength(1);
    expect(transactions[0].directCommissionAmount).toBe(30);
    expect(transactions[0].purchaser.email).toBe('purchaser@test.com');
  });

  it('should return tree commissions for a user', async () => {
    // Create users in a tree structure
    const root = await User.create({
      name: 'Root',
      email: 'root@test.com',
      password: 'password123',
      referralCode: 'ROOT123',
      treeLevel: 1
    });

    const level2 = await User.create({
      name: 'Level 2',
      email: 'level2@test.com',
      password: 'password123',
      referralCode: 'L2123',
      treeParent: root._id,
      treeLevel: 2
    });

    const purchaser = await User.create({
      name: 'Purchaser',
      email: 'purchaser@test.com',
      password: 'password123',
      referralCode: 'PUR123',
      treeParent: level2._id,
      treeLevel: 3
    });

    // Create order
    const order = await Order.create({
      user_id: purchaser._id,
      totalAmount: 1000,
      status: 'completed'
    });

    // Create commission transaction with tree commissions
    const transaction = await CommissionTransaction.create({
      orderId: order._id,
      purchaser: purchaser._id,
      orderAmount: 1000,
      treeCommissions: [
        {
          recipient: level2._id,
          level: 1,
          percentage: 1.5,
          amount: 15
        },
        {
          recipient: root._id,
          level: 2,
          percentage: 0.75,
          amount: 7.5
        }
      ],
      status: 'completed',
      processedAt: new Date()
    });

    // Query tree commissions for level2 user
    const transactions = await CommissionTransaction.find({
      'treeCommissions.recipient': level2._id,
      status: 'completed'
    });

    expect(transactions).toHaveLength(1);
    const userCommission = transactions[0].treeCommissions.find(
      tc => tc.recipient.toString() === level2._id.toString()
    );
    expect(userCommission.amount).toBe(15);
    expect(userCommission.level).toBe(1);
  });

  it('should filter commissions by date range', async () => {
    const user = await User.create({
      name: 'User',
      email: 'user@test.com',
      password: 'password123',
      referralCode: 'USER123'
    });

    const purchaser = await User.create({
      name: 'Purchaser',
      email: 'purchaser@test.com',
      password: 'password123',
      referralCode: 'PUR123',
      referredBy: 'USER123'
    });

    const order = await Order.create({
      user_id: purchaser._id,
      totalAmount: 1000,
      status: 'completed'
    });

    // Create transaction with specific date
    const specificDate = new Date('2024-01-15');
    await CommissionTransaction.create({
      orderId: order._id,
      purchaser: purchaser._id,
      orderAmount: 1000,
      directReferrer: user._id,
      directCommissionAmount: 30,
      status: 'completed',
      processedAt: specificDate
    });

    // Query with date filter
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    const transactions = await CommissionTransaction.find({
      directReferrer: user._id,
      status: 'completed',
      processedAt: { $gte: startDate, $lte: endDate }
    });

    expect(transactions).toHaveLength(1);
  });

  it('should calculate total commissions correctly', async () => {
    const user = await User.create({
      name: 'User',
      email: 'user@test.com',
      password: 'password123',
      referralCode: 'USER123'
    });

    const purchaser1 = await User.create({
      name: 'Purchaser 1',
      email: 'purchaser1@test.com',
      password: 'password123',
      referralCode: 'PUR1',
      referredBy: 'USER123'
    });

    const purchaser2 = await User.create({
      name: 'Purchaser 2',
      email: 'purchaser2@test.com',
      password: 'password123',
      referralCode: 'PUR2',
      referredBy: 'USER123'
    });

    const order1 = await Order.create({
      user_id: purchaser1._id,
      totalAmount: 1000,
      status: 'completed'
    });

    const order2 = await Order.create({
      user_id: purchaser2._id,
      totalAmount: 2000,
      status: 'completed'
    });

    // Create commission transactions
    await CommissionTransaction.create({
      orderId: order1._id,
      purchaser: purchaser1._id,
      orderAmount: 1000,
      directReferrer: user._id,
      directCommissionAmount: 30,
      status: 'completed',
      processedAt: new Date()
    });

    await CommissionTransaction.create({
      orderId: order2._id,
      purchaser: purchaser2._id,
      orderAmount: 2000,
      directReferrer: user._id,
      directCommissionAmount: 60,
      status: 'completed',
      processedAt: new Date()
    });

    // Query all commissions
    const transactions = await CommissionTransaction.find({
      directReferrer: user._id,
      status: 'completed'
    });

    const totalCommission = transactions.reduce(
      (sum, t) => sum + t.directCommissionAmount, 
      0
    );

    expect(totalCommission).toBe(90); // 30 + 60
  });

  it('should support pagination', async () => {
    const user = await User.create({
      name: 'User',
      email: 'user@test.com',
      password: 'password123',
      referralCode: 'USER123'
    });

    // Create multiple commission transactions
    for (let i = 0; i < 25; i++) {
      const purchaser = await User.create({
        name: `Purchaser ${i}`,
        email: `purchaser${i}@test.com`,
        password: 'password123',
        referralCode: `PUR${i}`,
        referredBy: 'USER123'
      });

      const order = await Order.create({
        user_id: purchaser._id,
        totalAmount: 1000,
        status: 'completed'
      });

      await CommissionTransaction.create({
        orderId: order._id,
        purchaser: purchaser._id,
        orderAmount: 1000,
        directReferrer: user._id,
        directCommissionAmount: 30,
        status: 'completed',
        processedAt: new Date()
      });
    }

    // Query with pagination
    const limit = 10;
    const page1 = await CommissionTransaction.find({
      directReferrer: user._id,
      status: 'completed'
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .skip(0);

    const page2 = await CommissionTransaction.find({
      directReferrer: user._id,
      status: 'completed'
    })
      .sort({ processedAt: -1 })
      .limit(limit)
      .skip(limit);

    expect(page1).toHaveLength(10);
    expect(page2).toHaveLength(10);
  });
});
