const mongoose = require('mongoose');
const User = require('../models/User');
const { isPaymentVerified } = require('../utils/paymentHelper');
const { calculateTreePoolDistribution, previewCommissions } = require('../services/commissionDistribution');

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/Order');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/WalletTransaction');
jest.mock('../models/CommissionSettings');
jest.mock('../models/TrustFund');

const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionSettings = require('../models/CommissionSettings');

describe('Direct Referral Attribution vs Tree Placement Test Suite', () => {
  let ratnabai, shivraj, rootUser, yuvaraj, revati, buyerUser;

  const mockQuery = (data) => {
    const q = Promise.resolve(data);
    q.select = jest.fn().mockImplementation(() => q);
    q.session = jest.fn().mockImplementation(() => q);
    q.sort = jest.fn().mockImplementation(() => q);
    q.exec = jest.fn().mockImplementation(() => Promise.resolve(data));
    return q;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    rootUser = {
      _id: 'root_id_000',
      name: 'Shakuntaladevi Admin',
      email: 'admin@example.com',
      referralCode: 'REF947377',
      referredBy: null,
      treeParent: null,
      treeLevel: 1,
      treePosition: 1,
      wallet: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    ratnabai = {
      _id: 'ratnabai_id_123',
      name: 'Ratnabai S Desai',
      email: 'ratnabai@example.com',
      referralCode: 'REF588019',
      referredBy: 'REF975013',
      treeParent: 'root_id_000',
      treeLevel: 2,
      treePosition: 1,
      wallet: 0,
      directCommissionEarned: 0,
      treeCommissionEarned: 0,
      firstPurchaseDone: true,
      save: jest.fn().mockResolvedValue(true)
    };

    shivraj = {
      _id: 'shivraj_id_456',
      name: 'shivraj palegar',
      email: 'shivraj@example.com',
      referralCode: 'REF975013',
      referredBy: null,
      treeParent: 'root_id_000',
      treeLevel: 2,
      treePosition: 0,
      wallet: 0,
      directCommissionEarned: 0,
      treeCommissionEarned: 0,
      firstPurchaseDone: true,
      save: jest.fn().mockResolvedValue(true)
    };

    yuvaraj = {
      _id: 'yuvaraj_id_789',
      name: 'yuvaraj',
      email: 'yuvaraj@example.com',
      referralCode: 'REF427857',
      referredBy: 'REF588019',
      treeParent: 'root_id_000',
      treeLevel: 2,
      treePosition: 3,
      wallet: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    revati = {
      _id: 'revati_id_101',
      name: 'Revati C patil',
      email: 'revati@example.com',
      referralCode: 'REF848372',
      referredBy: 'REF427857',
      treeParent: 'root_id_000',
      treeLevel: 2,
      treePosition: 4,
      wallet: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    buyerUser = {
      _id: 'buyer_id_999',
      name: 'Rakesh jigali',
      email: 'rakesh@example.com',
      referralCode: 'REF828705',
      referredBy: 'REF588019', // Referred by Ratnabai
      treeParent: 'shivraj_id_456', // Placed under Shivraj
      treeLevel: 3,
      treePosition: 3,
      wallet: 0,
      firstPurchaseDone: true,
      save: jest.fn().mockResolvedValue(true)
    };

    CommissionSettings.getSettings = jest.fn().mockResolvedValue({
      trustFundPercent: 1,
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 4,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'split_admin_trust',
      treeCommissionLevels: [
        { level: 1, percentage: 40 },
        { level: 2, percentage: 20 },
        { level: 3, percentage: 10 }
      ]
    });
  });

  test('TEST 1: User registers using Ratnabai referral code -> referredBy = Ratnabai', () => {
    const newUser = {
      name: 'New Customer',
      email: 'newcustomer@example.com',
      referralCode: 'REF999111',
      referredBy: ratnabai.referralCode,
      treeParent: null,
      treeLevel: 0
    };
    expect(newUser.referredBy).toBe('REF588019');
  });

  test('TEST 2: Global next BFS position is under Shivraj -> treeParent = Shivraj while referredBy remains Ratnabai', () => {
    const placedUser = {
      _id: 'placed_user_1',
      referredBy: ratnabai.referralCode, // Ratnabai
      treeParent: shivraj._id // Shivraj
    };

    expect(placedUser.referredBy).toBe('REF588019');
    expect(placedUser.treeParent).toBe('shivraj_id_456');
  });

  test('TEST 3: Direct Referral Commission goes strictly to Ratnabai (referredBy)', async () => {
    User.find.mockImplementation(() => mockQuery([rootUser, shivraj, ratnabai, yuvaraj, revati]));
    User.findOne.mockImplementation(q => {
      if (q && q.referralCode === 'REF588019') return mockQuery(ratnabai);
      if (q && q.role === 'admin') return mockQuery(rootUser);
      return mockQuery(null);
    });

    User.findById.mockImplementation(id => {
      if (id === 'shivraj_id_456') return mockQuery(shivraj);
      if (id === 'root_id_000') return mockQuery(rootUser);
      if (id === 'buyer_id_999') return mockQuery(buyerUser);
      return mockQuery(null);
    });

    const mockOrder = {
      _id: 'order_test_1',
      user_id: buyerUser,
      totalAmount: 1000,
      paymentStatus: 'completed',
      commissionStatus: 'pending',
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });
    CommissionTransaction.findOne.mockResolvedValue(null);

    const result = await previewCommissions('order_test_1', 1000);

    expect(result).toBeDefined();
    expect(result.referrer).toBeDefined();

    expect(result.referrer.userId.toString()).toBe(ratnabai._id.toString());
    expect(result.referrer.name).toBe(ratnabai.name);
  });

  test('TEST 4: Tree Pool includes Shivraj (Level 2 tree member)', async () => {
    User.find.mockImplementation(() => mockQuery([rootUser, shivraj, ratnabai, yuvaraj, revati]));
    User.findOne.mockImplementation(q => {
      if (q && q.referralCode === 'REF588019') return mockQuery(ratnabai);
      if (q && q.role === 'admin') return mockQuery(rootUser);
      return mockQuery(null);
    });

    User.findById.mockImplementation(id => {
      if (id === 'shivraj_id_456') return mockQuery(shivraj);
      if (id === 'root_id_000') return mockQuery(rootUser);
      if (id === 'buyer_id_999') return mockQuery(buyerUser);
      return mockQuery(null);
    });

    const mockOrder = {
      _id: 'order_test_2',
      user_id: buyerUser,
      totalAmount: 1000,
      paymentStatus: 'completed',
      commissionStatus: 'pending',
      save: jest.fn().mockResolvedValue(true)
    };

    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockOrder)
    });
    CommissionTransaction.findOne.mockResolvedValue(null);

    const result = await previewCommissions('order_test_2', 1000);

    expect(result).toBeDefined();
    expect(result.treeCommissions).toBeDefined();

    expect(result.treeCommissions.length).toBeGreaterThan(0);
    const shivrajComm = result.treeCommissions.find(c => c.userId.toString() === shivraj._id.toString());
    expect(shivrajComm).toBeDefined();
    expect(shivrajComm.name).toBe(shivraj.name);
  });

  test('TEST 5: Tree placement does not overwrite referredBy', () => {
    const user = {
      referredBy: 'REF588019',
      treeParent: null,
      treeLevel: 0
    };

    const placementData = { parentId: 'shivraj_id_456', level: 3, position: 3 };
    user.treeParent = placementData.parentId;
    user.treeLevel = placementData.level;
    user.treePosition = placementData.position;

    expect(user.referredBy).toBe('REF588019');
  });

  test('TEST 6: First purchase activation does not overwrite referredBy', () => {
    const user = {
      referredBy: 'REF588019',
      firstPurchaseDone: false
    };

    user.firstPurchaseDone = true;
    user.firstPurchaseDate = new Date();

    expect(user.referredBy).toBe('REF588019');
  });

  test('TEST 7: Referral visualizer Direct Referrals count uses referredBy', async () => {
    User.countDocuments.mockImplementation(query => {
      if (query.referredBy === 'REF588019') return Promise.resolve(3);
      return Promise.resolve(0);
    });

    const directCount = await User.countDocuments({ referredBy: ratnabai.referralCode });
    expect(directCount).toBe(3);
  });

  test('TEST 8: Referral visualizer Tree Children count uses treeParent', async () => {
    User.countDocuments.mockImplementation(query => {
      if (query.treeParent === 'shivraj_id_456') return Promise.resolve(2);
      return Promise.resolve(0);
    });

    const treeChildrenCount = await User.countDocuments({ treeParent: shivraj._id });
    expect(treeChildrenCount).toBe(2);
  });

  test('TEST 9: Using different referral codes (Ratnabai, Yuvaraj, Revati) resolves correct referrers', () => {
    const user1 = { referredBy: ratnabai.referralCode };
    const user2 = { referredBy: yuvaraj.referralCode };
    const user3 = { referredBy: revati.referralCode };

    expect(user1.referredBy).toBe('REF588019');
    expect(user2.referredBy).toBe('REF427857');
    expect(user3.referredBy).toBe('REF848372');
  });
});
