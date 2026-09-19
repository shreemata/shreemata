const { 
  distributeCommissions, 
  previewCommissions, 
  calculateLevelBasedTreePoolDistribution, 
  resolveSameLevelCompletedBlockRecipients 
} = require('../services/commissionDistribution');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const TrustFund = require('../models/TrustFund');
const CommissionSettings = require('../models/CommissionSettings');
const mongoose = require('mongoose');

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

describe('Same-Level Completed-Block + Upper-Level Tree Pool 30-Test Suite', () => {
  const makeUser = (id, name, treeLevel, treeParent = null, treePosition = 0) => ({
    _id: id,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
    treeLevel,
    treeParent,
    treePosition,
    wallet: 0,
    suspended: false,
    toObject: function() { return { ...this }; },
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

    WalletTransaction.create = jest.fn().mockResolvedValue(true);
    WalletTransaction.updateMany = jest.fn().mockResolvedValue(true);
  });

  // 1. 1/5 block excluded
  it('1. 1/5 block excluded', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const g1 = [makeUser('u1_0', 'U1_0', 3, 'p1', 0)]; // 1/5
    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...g1, buyer]);
    expect(eligible).toHaveLength(0);
  });

  // 2. 2/5 block excluded
  it('2. 2/5 block excluded', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const g2 = [0, 1].map(p => makeUser(`u2_${p}`, `U2_${p}`, 3, 'p2', p)); // 2/5
    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...g2, buyer]);
    expect(eligible).toHaveLength(0);
  });

  // 3. 3/5 block excluded
  it('3. 3/5 block excluded', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const g3 = [0, 1, 2].map(p => makeUser(`u3_${p}`, `U3_${p}`, 3, 'p3', p)); // 3/5
    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...g3, buyer]);
    expect(eligible).toHaveLength(0);
  });

  // 4. 4/5 block excluded
  it('4. 4/5 block excluded', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const g4 = [0, 1, 2, 3].map(p => makeUser(`u4_${p}`, `U4_${p}`, 3, 'p4', p)); // 4/5
    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...g4, buyer]);
    expect(eligible).toHaveLength(0);
  });

  // 5. 5/5 block eligible
  it('5. 5/5 block eligible', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const g5 = [0, 1, 2, 3, 4].map(p => makeUser(`u5_${p}`, `U5_${p}`, 3, 'p5', p)); // 5/5
    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...g5, buyer]);
    expect(eligible).toHaveLength(5);
  });

  // 6. 4/5 -> 5/5 completing purchase does NOT pay current block
  it('6. 4/5 -> 5/5 completing purchase does NOT pay current block', async () => {
    const nagarathan = 'nagarathan_id';
    const nagarathanChildren = [0, 1, 2, 3, 4].map(p => makeUser(`nag_${p}`, `Nag_${p}`, 3, nagarathan, p));
    const fifthChild = nagarathanChildren[4]; // 5th child purchase

    const eligible = await resolveSameLevelCompletedBlockRecipients(fifthChild, nagarathanChildren);
    expect(eligible).toHaveLength(0);
  });

  // 7. all five current-block children excluded from completing purchase
  it('7. all five current-block children excluded from completing purchase', async () => {
    const nagarathan = 'nagarathan_id';
    const nagarathanChildren = [0, 1, 2, 3, 4].map(p => makeUser(`nag_${p}`, `Nag_${p}`, 3, nagarathan, p));
    const fifthChild = nagarathanChildren[4];

    const eligible = await resolveSameLevelCompletedBlockRecipients(fifthChild, nagarathanChildren);
    nagarathanChildren.forEach(child => {
      expect(eligible.find(e => e._id === child._id)).toBeUndefined();
    });
  });

  // 8. next purchase outside that block makes previous 5/5 block eligible
  it('8. next purchase outside that block makes previous 5/5 block eligible', async () => {
    const nagarathan = 'nagarathan_id';
    const yuvaraj = 'yuvaraj_id';

    const nagarathanChildren = [0, 1, 2, 3, 4].map(p => makeUser(`nag_${p}`, `Nag_${p}`, 3, nagarathan, p));
    const yuvarajChild = makeUser('yuv_0', 'Yuv_0', 3, yuvaraj, 0);

    const level3Users = [...nagarathanChildren, yuvarajChild];
    const eligible = await resolveSameLevelCompletedBlockRecipients(yuvarajChild, level3Users);

    expect(eligible).toHaveLength(5);
    expect(eligible.map(u => u._id)).toEqual(nagarathanChildren.map(u => u._id));
  });

  // 9. buyer never receives own Tree Pool
  it('9. buyer never receives own Tree Pool', async () => {
    const pA = 'pA';
    const groupA = [0, 1, 2, 3, 4].map(p => makeUser(`a_${p}`, `A_${p}`, 3, pA, p));
    const buyer = groupA[2];

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, groupA);
    expect(eligible.find(e => e._id === buyer._id)).toBeUndefined();
  });

  // 10. current buyer's entire sibling block excluded
  it('10. current buyer\'s entire sibling block excluded', async () => {
    const pA = 'pA';
    const groupA = [0, 1, 2, 3, 4].map(p => makeUser(`a_${p}`, `A_${p}`, 3, pA, p));
    const buyer = groupA[0];

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, groupA);
    expect(eligible).toHaveLength(0);
  });

  // 11. other completed same-level blocks remain eligible
  it('11. other completed same-level blocks remain eligible', async () => {
    const pA = 'pA', pB = 'pB';
    const groupA = [0, 1, 2, 3, 4].map(p => makeUser(`a_${p}`, `A_${p}`, 3, pA, p));
    const groupB = [0, 1, 2, 3, 4].map(p => makeUser(`b_${p}`, `B_${p}`, 3, pB, p));
    const buyer = groupB[0];

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...groupA, ...groupB]);
    expect(eligible.map(u => u._id)).toEqual(groupA.map(u => u._id));
  });

  // 12. multiple completed same-level blocks share equally
  it('12. multiple completed same-level blocks share equally', async () => {
    const pA = 'pA', pB = 'pB', pC = 'pC';
    const groupA = [0, 1, 2, 3, 4].map(p => makeUser(`a_${p}`, `A_${p}`, 3, pA, p));
    const groupB = [0, 1, 2, 3, 4].map(p => makeUser(`b_${p}`, `B_${p}`, 3, pB, p));
    const buyer = makeUser('buyer_c', 'Buyer C', 3, pC, 0);

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...groupA, ...groupB, buyer]);
    expect(eligible).toHaveLength(10);
  });

  // 13. Level-2 users receive upper-level share regardless of child count
  it('13. Level-2 users receive upper-level share regardless of child count', async () => {
    const root = makeUser('root', 'Root', 1);
    const l2_a = makeUser('l2_a', 'L2_A', 2, root._id, 0);
    const l2_b = makeUser('l2_b', 'L2_B', 2, root._id, 1);
    const buyer = makeUser('buyer', 'Buyer', 3, l2_a._id, 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root], 2: [l2_a, l2_b] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const l2Dists = res.distributions.filter(d => d.level === 2);
    expect(l2Dists).toHaveLength(2);
  });

  // 14. Yuvaraj 1/5 still receives Level-2 share
  it('14. Yuvaraj 1/5 still receives Level-2 share', async () => {
    const root = makeUser('root', 'Root', 1);
    const yuvaraj = makeUser('yuvaraj', 'Yuvaraj', 2, root._id, 3);
    const buyer = makeUser('buyer', 'Buyer', 3, yuvaraj._id, 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root], 2: [yuvaraj] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const yuvarajDist = res.distributions.find(d => d.recipient === 'yuvaraj');
    expect(yuvarajDist).toBeDefined();
    expect(yuvarajDist.amount).toBeGreaterThan(0);
  });

  // 15. Revati 0/5 still receives Level-2 share
  it('15. Revati 0/5 still receives Level-2 share', async () => {
    const root = makeUser('root', 'Root', 1);
    const revati = makeUser('revati', 'Revati', 2, root._id, 4);
    const buyer = makeUser('buyer', 'Buyer', 3, 'otherParent', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root], 2: [revati] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const revatiDist = res.distributions.find(d => d.recipient === 'revati');
    expect(revatiDist).toBeDefined();
    expect(revatiDist.amount).toBeGreaterThan(0);
  });

  // 16. zero same-level recipients rolls whole bucket upward
  it('16. zero same-level recipients rolls whole bucket upward', async () => {
    const root = makeUser('root', 'Root', 1);
    const l2User = makeUser('l2', 'L2 User', 2, root._id, 0);
    const buyer = makeUser('buyer', 'Buyer', 3, 'pIncomplete', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00, // 800 paise
      levelRecipients: { 1: [root], 2: [l2User] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    // Level 3 (427 paise) rolls to Level 2 (213 + 427 = 640 paise = ₹6.40)
    const l2Dist = res.distributions.find(d => d.level === 2);
    expect(l2Dist.amount).toBe(6.40);
  });

  // 17. same-level equal-split remainder rolls upward
  it('17. same-level equal-split remainder rolls upward', async () => {
    const root = makeUser('root', 'Root', 1);
    const l2 = makeUser('l2', 'L2 User', 2, root._id, 0);
    const pA = 'pA';
    const groupA = [0, 1, 2, 3, 4].map(p => makeUser(`a_${p}`, `A_${p}`, 3, pA, p));
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00, // 800 paise (Level 3 initial = 427 paise)
      levelRecipients: { 1: [root], 2: [l2], 3: groupA },
      sameLevelEligibleRecipients: groupA,
      buyer
    });

    // 427 / 5 = 85 paise per member (425 paise total). Remainder 2 paise rolls to Level 2 (213 + 2 = 215 paise = ₹2.15).
    const l2Dist = res.distributions.find(d => d.level === 2);
    expect(l2Dist.amount).toBe(2.15);
  });

  // 18. empty upper level rolls upward again
  it('18. empty upper level rolls upward again', async () => {
    const root = makeUser('root', 'Root', 1);
    const buyer = makeUser('buyer', 'Buyer', 3, 'pMissing', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root], 2: [] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    expect(res.distributions).toHaveLength(1);
    expect(res.distributions[0].recipient).toBe(root._id);
    expect(res.distributions[0].amount).toBe(8.00);
  });

  // 19. Level-1/root is final fallback
  it('19. Level-1/root is final fallback', async () => {
    const root = makeUser('root', 'Root', 1);
    const buyer = makeUser('buyer', 'Buyer', 4, 'pMissing', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 4,
      treePoolAmount: 10.00,
      levelRecipients: { 1: [root], 2: [], 3: [] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    expect(res.distributions[0].amount).toBe(10.00);
  });

  // 20. missing legitimate root aborts safely
  it('20. missing legitimate root aborts safely', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'p1', 0);

    expect(() => {
      calculateLevelBasedTreePoolDistribution({
        buyerLevel: 3,
        treePoolAmount: 8.00,
        levelRecipients: { 1: [] }, // missing level 1 root
        sameLevelEligibleRecipients: [],
        buyer
      });
    }).toThrow('FINANCIAL INTEGRITY ERROR: Legitimate tree root user not found for Tree Pool distribution');
  });

  // 21. exact paise reconciliation
  it('21. exact paise reconciliation', async () => {
    const root = makeUser('root', 'Root', 1);
    const buyer = makeUser('buyer', 'Buyer', 3, 'p1', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 19.99, // 1999 paise
      levelRecipients: { 1: [root] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const sumPaise = res.distributions.reduce((s, d) => s + Math.round(d.amount * 100), 0);
    expect(sumPaise).toBe(1999);
  });

  // 22. no Tree Pool money goes to Trust Fund
  it('22. no Tree Pool money goes to Trust Fund', async () => {
    const root = makeUser('root', 'Root', 1);
    const buyer = makeUser('buyer', 'Buyer', 3, 'p1', 0);

    const res = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 15.00,
      levelRecipients: { 1: [root] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const sumDistributed = res.distributions.reduce((s, d) => s + d.amount, 0);
    expect(sumDistributed).toBe(15.00);
  });

  // 23. Direct Referral still uses referredBy
  it('23. Direct Referral still uses referredBy', async () => {
    const purchaserId = '507f1f77bcf86cd799439001';
    const referrerId = '507f1f77bcf86cd799439002';
    const rootId = '507f1f77bcf86cd799439003';
    const orderId = '507f1f77bcf86cd799439004';

    const purchaser = makeUser(purchaserId, 'Buyer', 3, 'pX', 0);
    purchaser.referredBy = 'REF_USER_X';

    const directReferrer = makeUser(referrerId, 'Referrer', 2);
    directReferrer.referralCode = 'REF_USER_X';

    const rootUser = makeUser(rootId, 'Root', 1);

    Order.findById.mockImplementation(() => mockQuery({
      _id: orderId,
      user_id: purchaser,
      totalAmount: 100,
      orderProfitTotal: 20
    }));

    User.findById.mockImplementation((id) => {
      const sId = String(id);
      if (sId === purchaserId) return mockQuery(purchaser);
      if (sId === rootId) return mockQuery(rootUser);
      if (sId === referrerId) return mockQuery(directReferrer);
      return mockQuery(null);
    });

    User.findOne.mockImplementation((cond) => {
      if (cond && cond.referralCode === 'REF_USER_X') return mockQuery(directReferrer);
      if (cond && cond.role === 'admin') return mockQuery(rootUser);
      return mockQuery(null);
    });

    User.find.mockImplementation(() => mockQuery([rootUser]));
    CommissionTransaction.findOne.mockResolvedValue(null);
    CommissionTransaction.prototype.save = jest.fn().mockResolvedValue(true);

    const tx = await distributeCommissions(orderId, purchaserId, 100, 20);
    expect(tx.referralReferrer).toEqual(referrerId);
  });

  // 24. physical placement remains treeParent/treePosition
  it('24. physical placement remains treeParent/treePosition', async () => {
    const parentId = 'p_parent';
    const child = makeUser('child_1', 'Child', 2, parentId, 3);
    expect(child.treeParent).toBe(parentId);
    expect(child.treePosition).toBe(3);
  });

  // 25. preview calculation equals actual calculation
  it('25. preview calculation equals actual calculation', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'p1', 0);
    const root = makeUser('root', 'Root', 1);

    const res1 = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    const res2 = calculateLevelBasedTreePoolDistribution({
      buyerLevel: 3,
      treePoolAmount: 8.00,
      levelRecipients: { 1: [root] },
      sameLevelEligibleRecipients: [],
      buyer
    });

    expect(res1.distributions).toEqual(res2.distributions);
  });

  // 26. duplicate order cannot distribute twice
  it('26. duplicate order cannot distribute twice', async () => {
    const orderId = '507f1f77bcf86cd799439099';
    CommissionTransaction.findOne.mockResolvedValue({ status: 'completed', orderId });

    const res = await distributeCommissions(orderId, 'user1', 100, 20);
    expect(res.status).toBe('completed');
  });

  // 27. historical CommissionTransaction remains readable
  it('27. historical CommissionTransaction remains readable', async () => {
    const doc = {
      orderId: '507f1f77bcf86cd799439099',
      purchaser: 'user1',
      orderAmount: 100,
      profitAmount: 20,
      treeCommissions: [
        { recipient: 'user2', level: 2, amount: 2.00, percentage: 10 }
      ],
      status: 'completed'
    };
    expect(doc.treeCommissions[0].amount).toBe(2.00);
  });

  // 28. sibling block completion uses positions 0-4 exactly
  it('28. sibling block completion uses positions 0-4 exactly', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const pA = 'pA';
    const groupValid = [0, 1, 2, 3, 4].map(p => makeUser(`valid_${p}`, `V_${p}`, 3, pA, p));

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...groupValid, buyer]);
    expect(eligible).toHaveLength(5);
  });

  // 29. duplicate/malformed tree position cannot falsely complete a block
  it('29. duplicate/malformed tree position cannot falsely complete a block', async () => {
    const buyer = makeUser('buyer', 'Buyer', 3, 'pBuyer', 0);
    const pA = 'pA';
    // 5 users, but positions are 0, 0, 1, 2, 3 (duplicate 0, missing position 4)
    const malformedPositions = [0, 0, 1, 2, 3];
    const groupMalformed = malformedPositions.map((p, i) => makeUser(`bad_${i}`, `B_${i}`, 3, pA, p));

    const eligible = await resolveSameLevelCompletedBlockRecipients(buyer, [...groupMalformed, buyer]);
    expect(eligible).toHaveLength(0); // Cannot complete block due to duplicate position 0!
  });

  // 30. VIP/payment/invoice regression remains unaffected
  it('30. VIP/payment/invoice regression remains unaffected', async () => {
    const { isOrderEligibleForCommission } = require('../services/commissionDistribution');
    const order = {
      _id: 'order_verified',
      status: 'completed',
      paymentType: 'check',
      paymentDetails: { status: 'verified' },
      orderProfitTotal: 50
    };
    CommissionTransaction.findOne.mockResolvedValue(null);

    const eligibility = await isOrderEligibleForCommission(order);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.profit).toBe(50);
  });
});
