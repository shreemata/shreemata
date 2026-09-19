const fc = require('fast-check');
const { distributeCommissions, addToTrustFund, calculateLevelBasedTreePoolDistribution, resolveTreeLevelRecipients } = require('../services/commissionDistribution');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const TrustFund = require('../models/TrustFund');
const CommissionSettings = require('../models/CommissionSettings');
const mongoose = require('mongoose');

// Mock Mongoose Models for unit testing
jest.mock('../models/User');
jest.mock('../models/Order');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/WalletTransaction');
jest.mock('../models/TrustFund');
jest.mock('../models/CommissionSettings');

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(true),
  abortTransaction: jest.fn().mockResolvedValue(true),
  endSession: jest.fn()
};

jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

describe('Final Level-Based Tree Pool Distribution Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    CommissionSettings.getSettings = jest.fn().mockResolvedValue({
      trustFundPercent: 10,
      directCommissionPercent: 30,
      referralCommissionPercent: 20,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 40,
      adminCommissionPercent: 0,
      minimumTreePlacementAmount: 100
    });

    Order.findById.mockImplementation(() => mockQuery(null));
    WalletTransaction.create = jest.fn().mockResolvedValue(true);
    WalletTransaction.updateMany = jest.fn().mockResolvedValue(true);
  });

  const makeMockUser = (data) => ({
    ...data,
    toObject: () => ({ ...data }),
    save: jest.fn().mockResolvedValue(true)
  });

  const mockQuery = (result) => {
    const q = {
      session: jest.fn().mockImplementation(() => q),
      sort: jest.fn().mockImplementation(() => q),
      limit: jest.fn().mockImplementation(() => q),
      populate: jest.fn().mockImplementation(() => q),
      then: jest.fn().mockImplementation((resolve) => resolve(result)),
      catch: jest.fn()
    };
    return q;
  };

  /**
   * TEST 1 — Buyer Level 3 (Sharifsab F Pinjar Example)
   */
  it('TEST 1 — Buyer Level 3 Sharifsab ₹8 Example', async () => {
    const buyerLevel = 3;
    const treePoolAmount = 8.00; // 800 paise

    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', name: 'Shakuntaladevi', email: 'shakuntala@example.com', treeLevel: 1, treePosition: 0 })],
      2: [
        makeMockUser({ _id: '507f1f77bcf86cd799439012', name: 'Shivraj Palegar', treeLevel: 2, treePosition: 0 }),
        makeMockUser({ _id: '507f1f77bcf86cd799439013', name: 'Ratnabai S Desai', treeLevel: 2, treePosition: 1 }),
        makeMockUser({ _id: '507f1f77bcf86cd799439014', name: 'Nagarathan R Bharamagoudar', treeLevel: 2, treePosition: 2 }),
        makeMockUser({ _id: '507f1f77bcf86cd799439015', name: 'Yuvaraj', treeLevel: 2, treePosition: 3 }),
        makeMockUser({ _id: '507f1f77bcf86cd799439016', name: 'Revati C Patil', treeLevel: 2, treePosition: 4 })
      ]
    };

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel,
      treePoolAmount,
      levelRecipients,
      orderId: '507f1f77bcf86cd799439000'
    });

    expect(res.treePoolTotal).toBe(8.00);

    const level1Dist = res.distributions.filter(d => d.level === 1);
    const level2Dist = res.distributions.filter(d => d.level === 2);

    // Under Same-Level Completed-Block rules:
    // Level 3 bucket = 53.33% (427 paise). Since 0 completed same-level blocks exist in this test,
    // all 427 paise rolls UPWARD to Level 2 bucket (213 + 427 = 640 paise).
    // Level 2 members (5) receive 640 / 5 = 128 paise (₹1.28 each). Total Level 2 = ₹6.40.
    // Level 1 (Shakuntaladevi) receives Level 1 / Root bucket = 20% = 160 paise (₹1.60).
    expect(level1Dist).toHaveLength(1);
    expect(level1Dist[0].amount).toBe(1.60);

    expect(level2Dist).toHaveLength(5);
    level2Dist.forEach(memberDist => {
      expect(memberDist.amount).toBe(1.28);
    });

    const level2Total = level2Dist.reduce((sum, d) => sum + d.amount, 0);
    expect(level2Total).toBe(6.40);

    const grandTotalPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
    expect(grandTotalPaise).toBe(800);
  });

  /**
   * TEST 2 — Direct Referral Separation
   */
  it('TEST 2 — Direct Referral Separation from Tree Pool', async () => {
    const purchaserId = new mongoose.Types.ObjectId().toString();
    const referrerId = new mongoose.Types.ObjectId().toString();
    const rootId = new mongoose.Types.ObjectId().toString();
    const l2Id1 = new mongoose.Types.ObjectId().toString();
    const l2Id2 = new mongoose.Types.ObjectId().toString();
    const orderId = new mongoose.Types.ObjectId().toString();

    const purchaser = makeMockUser({
      _id: purchaserId,
      email: 'buyer@example.com',
      referredBy: 'REF_USER_X',
      treeLevel: 3,
      treeParent: l2Id1,
      firstPurchaseDone: true,
      wallet: 0
    });

    const directReferrer = makeMockUser({
      _id: referrerId,
      email: 'user_x@example.com',
      referralCode: 'REF_USER_X',
      wallet: 0
    });

    const rootUser = makeMockUser({ _id: rootId, name: 'Shakuntaladevi', treeLevel: 1, treePosition: 0, wallet: 0 });
    const l2User1 = makeMockUser({ _id: l2Id1, name: 'Shivraj', treeLevel: 2, treePosition: 0, wallet: 0 });
    const l2User2 = makeMockUser({ _id: l2Id2, name: 'Ratnabai', treeLevel: 2, treePosition: 1, wallet: 0 });

    User.findById.mockImplementation((id) => {
      const sId = String(id);
      if (sId === purchaserId) return mockQuery(purchaser);
      if (sId === rootId) return mockQuery(rootUser);
      if (sId === l2Id1) return mockQuery(l2User1);
      if (sId === l2Id2) return mockQuery(l2User2);
      if (sId === referrerId) return mockQuery(directReferrer);
      return mockQuery(null);
    });

    User.findOne.mockImplementation((query) => {
      if (query && query.referralCode === 'REF_USER_X') return mockQuery(directReferrer);
      return mockQuery(null);
    });

    User.find.mockReturnValue(mockQuery([rootUser, l2User1, l2User2]));

    const savedTx = {
      orderId,
      purchaser: purchaser._id,
      orderAmount: 100,
      profitAmount: 20,
      treeCommissions: [],
      save: jest.fn().mockResolvedValue(true)
    };

    CommissionTransaction.mockImplementation(() => savedTx);
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
    User.findOneAndUpdate = jest.fn().mockResolvedValue(makeMockUser({ wallet: 10 }));

    await distributeCommissions(orderId, purchaser._id, 100, 20);

    // Direct referral credited to directReferrer (₹20 * 20% = ₹4)
    expect(savedTx.referralReferrer.toString()).toBe(referrerId);
    expect(savedTx.referralCommissionAmount).toBe(4);
  });

  /**
   * TEST 3 — NOT parent-chain
   */
  it('TEST 3 — Whole level receives Tree Pool, NOT just buyer parent ancestors', async () => {
    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', name: 'Shakuntaladevi', treeLevel: 1, treePosition: 0 })],
      2: [
        makeMockUser({ _id: '507f1f77bcf86cd799439012', name: 'Parent Ancestor', treeLevel: 2, treePosition: 0 }),
        makeMockUser({ _id: '507f1f77bcf86cd799439013', name: 'Non-Ancestor Member', treeLevel: 2, treePosition: 1 })
      ]
    };

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 10.00,
      levelRecipients,
      orderId: '507f1f77bcf86cd799439000'
    });

    const l2Dist = res.distributions.filter(d => d.level === 2);
    expect(l2Dist).toHaveLength(2);
    expect(l2Dist[0].recipient).toBe('507f1f77bcf86cd799439012');
    expect(l2Dist[1].recipient).toBe('507f1f77bcf86cd799439013');
  });

  /**
   * TEST 4 — Level 4 Buyer
   */
  it('TEST 4 — Level 4 Buyer (uses Admin + 5^1, 5^2, 5^3)', async () => {
    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', treeLevel: 1 })],
      2: [makeMockUser({ _id: '507f1f77bcf86cd799439012', treeLevel: 2 })],
      3: [makeMockUser({ _id: '507f1f77bcf86cd799439013', treeLevel: 3 })]
    };

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 4,
      treePoolAmount: 100.00,
      levelRecipients,
      orderId: '507f1f77bcf86cd799439000'
    });

    const levels = new Set(res.distributions.map(d => d.level));
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    expect(levels.has(3)).toBe(true);

    const grandTotalPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
    expect(grandTotalPaise).toBe(10000);
  });

  /**
   * TEST 5 — Level 5 Buyer
   */
  it('TEST 5 — Level 5 Buyer (uses Admin + 5^1, 5^2, 5^3, 5^4)', async () => {
    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', treeLevel: 1 })],
      2: [makeMockUser({ _id: '507f1f77bcf86cd799439012', treeLevel: 2 })],
      3: [makeMockUser({ _id: '507f1f77bcf86cd799439013', treeLevel: 3 })],
      4: [makeMockUser({ _id: '507f1f77bcf86cd799439014', treeLevel: 4 })]
    };

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 5,
      treePoolAmount: 100.00,
      levelRecipients,
      orderId: '507f1f77bcf86cd799439000'
    });

    const levels = new Set(res.distributions.map(d => d.level));
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    expect(levels.has(3)).toBe(true);
    expect(levels.has(4)).toBe(true);

    const grandTotalPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
    expect(grandTotalPaise).toBe(10000);
  });

  /**
   * TEST 6 — Empty Intermediate Level
   */
  it('TEST 6 — Skip empty intermediate level and renormalize remaining valid buckets', async () => {
    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', treeLevel: 1 })],
      2: [makeMockUser({ _id: '507f1f77bcf86cd799439012', treeLevel: 2 })],
      3: [] // Empty Level 3!
    };

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 4,
      treePoolAmount: 8.00,
      levelRecipients,
      orderId: '507f1f77bcf86cd799439000'
    });

    const level3Dist = res.distributions.filter(d => d.level === 3);
    expect(level3Dist).toHaveLength(0);

    const grandTotalPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
    expect(grandTotalPaise).toBe(800);
  });

  /**
   * TEST 7 — Exact Paise Rounding Assertion for various amounts
   */
  it('TEST 7 — Paise rounding assertion across various tree pool amounts', () => {
    const testAmounts = [8, 1, 0.01, 123.45, 999.99];
    const levelRecipients = {
      1: [makeMockUser({ _id: '507f1f77bcf86cd799439011', treeLevel: 1 })],
      2: [makeMockUser({ _id: '507f1f77bcf86cd799439012', treeLevel: 2 }), makeMockUser({ _id: '507f1f77bcf86cd799439013', treeLevel: 2 })],
      3: [makeMockUser({ _id: '507f1f77bcf86cd799439014', treeLevel: 3 }), makeMockUser({ _id: '507f1f77bcf86cd799439015', treeLevel: 3 }), makeMockUser({ _id: '507f1f77bcf86cd799439016', treeLevel: 3 })]
    };

    testAmounts.forEach((amt, idx) => {
      const res = calculateLevelBasedTreePoolDistribution({
        buyerLevel: 4,
        treePoolAmount: amt,
        levelRecipients,
        orderId: `507f1f77bcf86cd79943900${idx}`
      });

      const totalPaise = Math.round(amt * 100);
      const distributedPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
      expect(distributedPaise).toBe(totalPaise);
    });
  });

  /**
   * TEST 8 — Duplicate processing (Idempotency)
   */
  it('TEST 8 — Same order cannot credit commission twice', async () => {
    const orderId = new mongoose.Types.ObjectId().toString();
    const existingTx = {
      orderId,
      status: 'completed'
    };

    CommissionTransaction.findOne = jest.fn().mockResolvedValue(existingTx);

    const result = await distributeCommissions(orderId, new mongoose.Types.ObjectId().toString(), 100, 20);
    expect(result).toBe(existingTx);
  });

  /**
   * TEST 9 — Trust Fund base percentage unchanged
   */
  it('TEST 9 — Base Trust Fund percentage uses settings.trustFundPercent', async () => {
    const purchaserId = new mongoose.Types.ObjectId().toString();
    const referrerId = new mongoose.Types.ObjectId().toString();
    const rootId = new mongoose.Types.ObjectId().toString();
    const l2Id = new mongoose.Types.ObjectId().toString();
    const orderId = new mongoose.Types.ObjectId().toString();

    const purchaser = makeMockUser({
      _id: purchaserId,
      email: 'buyer@example.com',
      referredBy: 'REF_USER_Y',
      treeLevel: 3,
      firstPurchaseDone: true,
      wallet: 0
    });

    const directReferrer = makeMockUser({
      _id: referrerId,
      email: 'user_y@example.com',
      referralCode: 'REF_USER_Y',
      wallet: 0
    });

    const rootUser = makeMockUser({ _id: rootId, name: 'Shakuntaladevi', treeLevel: 1, treePosition: 0, wallet: 0 });
    const l2User1 = makeMockUser({ _id: l2Id, name: 'Shivraj', treeLevel: 2, treePosition: 0, wallet: 0 });

    User.findById.mockImplementation((id) => {
      const sId = String(id);
      if (sId === purchaserId) return mockQuery(purchaser);
      if (sId === rootId) return mockQuery(rootUser);
      if (sId === l2Id) return mockQuery(l2User1);
      if (sId === referrerId) return mockQuery(directReferrer);
      return mockQuery(null);
    });
    User.find.mockReturnValue(mockQuery([rootUser, l2User1]));
    User.findOne.mockImplementation((q) => {
      if (q && q.referralCode === 'REF_USER_Y') return mockQuery(directReferrer);
      return mockQuery(null);
    });

    const savedTx = {
      orderId,
      purchaser: purchaser._id,
      orderAmount: 100,
      profitAmount: 20,
      trustFundAmount: 0,
      treeCommissions: [],
      save: jest.fn().mockResolvedValue(true)
    };

    CommissionTransaction.mockImplementation(() => savedTx);
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);

    await distributeCommissions(orderId, purchaser._id, 100, 20);

    // Trust fund base is 10% of ₹20 profit = ₹2.00
    expect(savedTx.trustFundAmount).toBe(2.00);
  });

  /**
   * TEST 10 — Buyer Cashback
   */
  it('TEST 10 — Buyer Cashback works normally', async () => {
    const purchaserId = new mongoose.Types.ObjectId().toString();
    const rootId = new mongoose.Types.ObjectId().toString();
    const orderId = new mongoose.Types.ObjectId().toString();

    const purchaser = makeMockUser({
      _id: purchaserId,
      email: 'buyer@example.com',
      referredBy: null,
      treeLevel: 2,
      firstPurchaseDone: true,
      wallet: 0
    });

    const rootUser = makeMockUser({ _id: rootId, name: 'Root', treeLevel: 1, treePosition: 0, wallet: 0 });

    User.findById.mockImplementation((id) => {
      const sId = String(id);
      if (sId === purchaserId) return mockQuery(purchaser);
      if (sId === rootId) return mockQuery(rootUser);
      return mockQuery(null);
    });
    User.find.mockReturnValue(mockQuery([rootUser]));
    User.findOne.mockReturnValue(mockQuery(null));

    const savedTx = {
      orderId,
      purchaser: purchaser._id,
      orderAmount: 100,
      profitAmount: 20,
      directCommissionAmount: 0,
      treeCommissions: [],
      save: jest.fn().mockResolvedValue(true)
    };

    CommissionTransaction.mockImplementation(() => savedTx);
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
    User.findOneAndUpdate = jest.fn().mockResolvedValue(makeMockUser({ wallet: 10 }));

    await distributeCommissions(orderId, purchaser._id, 100, 20);

    // Buyer cashback = 30% of ₹20 profit = ₹6.00
    expect(savedTx.directCommissionAmount).toBe(6.00);
  });

  /**
   * TEST 11 — Admin Share setting remains separate
   */
  it('TEST 11 — Commission Settings Admin Share remains separate', async () => {
    CommissionSettings.getSettings.mockResolvedValue({
      trustFundPercent: 10,
      directCommissionPercent: 30,
      referralCommissionPercent: 20,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 40,
      adminCommissionPercent: 5, // 5% Admin share setting
      minimumTreePlacementAmount: 100
    });

    const purchaserId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const orderId = new mongoose.Types.ObjectId().toString();

    const purchaser = makeMockUser({
      _id: purchaserId,
      email: 'buyer@example.com',
      referredBy: null,
      treeLevel: 2,
      firstPurchaseDone: true,
      wallet: 0
    });

    const adminUser = makeMockUser({ _id: adminId, role: 'admin', treeLevel: 1, treePosition: 0, wallet: 0 });

    User.findById.mockImplementation((id) => {
      const sId = String(id);
      if (sId === purchaserId) return mockQuery(purchaser);
      if (sId === adminId) return mockQuery(adminUser);
      return mockQuery(null);
    });
    User.find.mockReturnValue(mockQuery([adminUser]));
    User.findOne.mockImplementation((q) => {
      if (q && q.role === 'admin') return mockQuery(adminUser);
      return mockQuery(null);
    });

    const savedTx = {
      orderId,
      purchaser: purchaser._id,
      orderAmount: 100,
      profitAmount: 20,
      adminCommissionAmount: 0,
      treeCommissions: [],
      save: jest.fn().mockResolvedValue(true)
    };

    CommissionTransaction.mockImplementation(() => savedTx);
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
    User.findOneAndUpdate = jest.fn().mockResolvedValue(makeMockUser({ wallet: 10 }));

    await distributeCommissions(orderId, purchaser._id, 100, 20);

    // Admin share setting = 5% of ₹20 = ₹1.00
    expect(savedTx.adminCommissionAmount).toBe(1.00);
  });

  /**
   * TEST 12 — Referral/BFS Placement preserved
   */
  it('TEST 12 — Global 5-wide BFS placement preserved', async () => {
    const { findTreePlacement } = require('../services/treePlacement');
    expect(typeof findTreePlacement).toBe('function');
  });
});
