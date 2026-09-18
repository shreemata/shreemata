const { distributeCommissions, calculateTreePoolDistribution, resolveTreeUplines, TREE_WEIGHT_TABLE } = require('../services/commissionDistribution');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
const TrustFund = require('../models/TrustFund');
const CommissionSettings = require('../models/CommissionSettings');
const WalletTransaction = require('../models/WalletTransaction');
const Order = require('../models/Order');

// Mock all Mongoose models so live database is NEVER touched
jest.mock('../models/User');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/TrustFund');
jest.mock('../models/CommissionSettings');
jest.mock('../models/WalletTransaction');
jest.mock('../models/Order');

describe('Tree Pool Normalized Upline Distribution Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    CommissionSettings.getSettings = jest.fn().mockResolvedValue({
      trustFundPercent: 1,
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 40,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'split_admin_trust',
      treeCommissionLevels: []
    });

    // Default mock for Order.findById
    Order.findById = jest.fn().mockResolvedValue({
      _id: 'order123',
      totalAmount: 1000,
      orderProfitTotal: 100,
      items: []
    });
  });

  const mockQuery = (val) => ({
    session: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    then: jest.fn((resolve) => resolve(val)),
    catch: jest.fn()
  });

  // TEST 1: 1 actual upline -> 100% Tree Pool distributed to that upline
  it('TEST 1: 1 actual upline -> 100% Tree Pool distributed to that upline', async () => {
    const uplines = [{ _id: 'parent1', name: 'Parent 1' }];
    const calc = calculateTreePoolDistribution(uplines, 40);

    expect(calc.distribution.length).toBe(1);
    expect(calc.distribution[0].normalizedPercent).toBe(100);
    expect(calc.distribution[0].amount).toBe(40.00);
    expect(calc.totalCredited).toBe(40.00);
    expect(calc.totalCreditedPaise).toBe(4000);
  });

  // TEST 2: 2 actual uplines -> first 2 weights normalized to 100%
  it('TEST 2: 2 actual uplines -> first 2 weights normalized to 100%', async () => {
    const uplines = [
      { _id: 'parent1', name: 'Parent 1' },
      { _id: 'parent2', name: 'Parent 2' }
    ];
    const calc = calculateTreePoolDistribution(uplines, 40);

    const w1 = TREE_WEIGHT_TABLE[0];
    const w2 = TREE_WEIGHT_TABLE[1];
    const sumW = w1 + w2;

    expect(calc.distribution.length).toBe(2);
    expect(calc.distribution[0].normalizedPercent).toBeCloseTo((w1 / sumW) * 100, 4);
    expect(calc.distribution[1].normalizedPercent).toBeCloseTo((w2 / sumW) * 100, 4);
    expect(calc.totalCredited).toBe(40.00);
  });

  // TEST 3: 3 actual uplines -> expected approximately 56.16%, 29.23%, 14.61%
  it('TEST 3: 3 actual uplines -> normalized shares match expected proportions', async () => {
    const uplines = [
      { _id: 'parent1', name: 'Parent 1' },
      { _id: 'parent2', name: 'Parent 2' },
      { _id: 'parent3', name: 'Parent 3' }
    ];
    const calc = calculateTreePoolDistribution(uplines, 40);

    expect(calc.distribution.length).toBe(3);
    expect(calc.distribution[0].normalizedPercent).toBeCloseTo(56.160459, 4);
    expect(calc.distribution[1].normalizedPercent).toBeCloseTo(29.226361, 4);
    expect(calc.distribution[2].normalizedPercent).toBeCloseTo(14.613180, 4);
    expect(calc.totalCredited).toBe(40.00);
  });

  // TEST 4: 5 actual uplines -> first 5 weights normalized automatically
  it('TEST 4: 5 actual uplines -> first 5 weights normalized automatically', async () => {
    const uplines = Array.from({ length: 5 }, (_, i) => ({ _id: `parent${i+1}`, name: `Parent ${i+1}` }));
    const calc = calculateTreePoolDistribution(uplines, 40);

    expect(calc.distribution.length).toBe(5);
    expect(calc.totalCredited).toBe(40.00);
    expect(calc.totalCreditedPaise).toBe(4000);
  });

  // TEST 5: 11 actual uplines -> full original weight table used
  it('TEST 5: 11 actual uplines -> full original weight table used', async () => {
    const uplines = Array.from({ length: 11 }, (_, i) => ({ _id: `parent${i+1}`, name: `Parent ${i+1}` }));
    const calc = calculateTreePoolDistribution(uplines, 40);

    expect(calc.distribution.length).toBe(11);
    expect(calc.distribution[0].weight).toBe(TREE_WEIGHT_TABLE[0]);
    expect(calc.distribution[10].weight).toBe(TREE_WEIGHT_TABLE[10]);
    expect(calc.totalCredited).toBe(40.00);
    expect(calc.totalCreditedPaise).toBe(4000);
  });

  // TEST 6: Tree Pool monetary total exactly reconciles after paise rounding
  it('TEST 6: Tree Pool monetary total exactly reconciles after paise rounding', async () => {
    // Test with arbitrary float amounts
    const amounts = [17.83, 33.33, 100.00, 250.50, 4.37];
    amounts.forEach(amt => {
      const uplines = Array.from({ length: 7 }, (_, i) => ({ _id: `parent${i+1}` }));
      const calc = calculateTreePoolDistribution(uplines, amt);
      const expectedPaise = Math.round(amt * 100);

      expect(calc.totalCreditedPaise).toBe(expectedPaise);
      expect(calc.totalCredited).toBe(Number(amt.toFixed(2)));
    });
  });

  // TEST 7: No unused Tree Pool goes to Trust Fund
  it('TEST 7: No unused Tree Pool goes to Trust Fund', async () => {
    const purchaser = {
      _id: 'purchaser1',
      email: 'purchaser@example.com',
      treeParent: 'parent1',
      referredBy: null
    };

    const parent1 = {
      _id: 'parent1',
      email: 'parent1@example.com',
      treeParent: null
    };

    User.findById.mockImplementation((id) => {
      if (id === 'purchaser1') return mockQuery(purchaser);
      if (id === 'parent1') return mockQuery(parent1);
      return mockQuery(null);
    });

    User.findOne.mockReturnValue(mockQuery(null));
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);

    const trustFundTransactions = [];
    const mockTrustFund = {
      fundType: 'trust',
      balance: 0,
      addTransaction: jest.fn().mockImplementation((amount, type, orderId, desc) => {
        trustFundTransactions.push({ amount, type, desc });
        return Promise.resolve(true);
      })
    };
    TrustFund.findOne.mockReturnValue(mockQuery(mockTrustFund));

    User.findOneAndUpdate = jest.fn().mockResolvedValue({ wallet: 100 });
    WalletTransaction.create = jest.fn().mockResolvedValue({});

    const savedTx = {
      orderId: 'order123',
      purchaser: 'purchaser1',
      treeCommissions: [],
      trustFundAmount: 0,
      save: jest.fn().mockResolvedValue(true)
    };
    CommissionTransaction.mockImplementation(() => savedTx);

    await distributeCommissions('order123', 'purchaser1', 1000, 100);

    // Trust Fund should ONLY receive base trust fund (1% of profit = 1.00)
    // No tree remainder should be in trust fund transactions!
    const treeRemainderAllocations = trustFundTransactions.filter(t => t.desc.includes('Tree remainder'));
    expect(treeRemainderAllocations.length).toBe(0);
    expect(savedTx.remainderToDevFund).toBe(0);
  });

  // TEST 8: Base Trust Fund configured percentage still works
  it('TEST 8: Base Trust Fund configured percentage still works', async () => {
    const purchaser = {
      _id: 'purchaser1',
      email: 'purchaser@example.com',
      treeParent: 'parent1',
      referredBy: 'REF_VALID'
    };
    const parent1 = { _id: 'parent1', email: 'parent1@example.com', treeParent: null };
    const referrerValid = { _id: 'ref1', email: 'ref@example.com', referralCode: 'REF_VALID' };

    User.findById.mockImplementation((id) => {
      if (id === 'purchaser1') return mockQuery(purchaser);
      if (id === 'parent1') return mockQuery(parent1);
      if (id === 'ref1') return mockQuery(referrerValid);
      return mockQuery(null);
    });

    const adminUser = { _id: 'admin1', email: 'admin@example.com', role: 'admin' };
    User.findOne.mockImplementation((query) => {
      if (query && query.referralCode === 'REF_VALID') return mockQuery(referrerValid);
      if (query && query.role === 'admin') return mockQuery(adminUser);
      return mockQuery(null);
    });
    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);

    let trustFundAdded = 0;
    const mockTrustFund = {
      fundType: 'trust',
      balance: 0,
      addTransaction: jest.fn().mockImplementation((amount) => {
        trustFundAdded += amount;
        return Promise.resolve(true);
      })
    };
    TrustFund.findOne.mockReturnValue(mockQuery(mockTrustFund));

    User.findOneAndUpdate = jest.fn().mockResolvedValue({ wallet: 100 });
    WalletTransaction.create = jest.fn().mockResolvedValue({});

    const savedTx = {
      orderId: 'order123',
      purchaser: 'purchaser1',
      treeCommissions: [],
      trustFundAmount: 0,
      save: jest.fn().mockResolvedValue(true)
    };
    CommissionTransaction.mockImplementation(() => savedTx);

    // Order profit = ₹100, Trust Fund base % = 1% => ₹1.00
    await distributeCommissions('order123', 'purchaser1', 1000, 100);

    // Verify base trust fund 1% is allocated
    expect(savedTx.trustFundAmount).toBe(1.00);
  });

  // TEST 9: Direct Referral still follows referredBy
  it('TEST 9: Direct Referral still follows referredBy', async () => {
    const purchaser = {
      _id: 'purchaser1',
      email: 'purchaser@example.com',
      referredBy: 'REF_BOB',
      treeParent: 'parent_alice'
    };

    const referrerBob = {
      _id: 'referrer_bob',
      email: 'bob@example.com',
      referralCode: 'REF_BOB'
    };

    const parentAlice = {
      _id: 'parent_alice',
      email: 'alice@example.com'
    };

    User.findById.mockImplementation((id) => {
      if (id === 'purchaser1') return mockQuery(purchaser);
      if (id === 'parent_alice') return mockQuery(parentAlice);
      return mockQuery(null);
    });

    User.findOne.mockImplementation((query) => {
      if (query && query.referralCode === 'REF_BOB') return mockQuery(referrerBob);
      return mockQuery(null);
    });

    CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
    User.findOneAndUpdate = jest.fn().mockResolvedValue({ wallet: 100 });
    WalletTransaction.create = jest.fn().mockResolvedValue({});

    const savedTx = {
      orderId: 'order123',
      purchaser: 'purchaser1',
      treeCommissions: [],
      save: jest.fn().mockResolvedValue(true)
    };
    CommissionTransaction.mockImplementation(() => savedTx);

    await distributeCommissions('order123', 'purchaser1', 1000, 100);

    // Referral commission (2% = ₹2.00) goes to referrerBob
    expect(savedTx.referralReferrer.toString()).toBe('referrer_bob');
    expect(savedTx.referralCommissionAmount).toBe(2.00);

    // Tree commission (40% = ₹40.00) goes to parentAlice
    expect(savedTx.treeCommissions[0].recipient.toString()).toBe('parent_alice');
    expect(savedTx.treeCommissions[0].amount).toBe(40.00);
  });

  // TEST 10: Tree Pool still follows treeParent
  it('TEST 10: Tree Pool still follows treeParent', async () => {
    const purchaser = {
      _id: 'purchaser1',
      treeParent: 'tree_parent_1'
    };
    const treeParent1 = { _id: 'tree_parent_1', treeParent: null };

    const uplines = await resolveTreeUplines(purchaser, 11);
    User.findById.mockImplementation((id) => {
      if (id === 'purchaser1') return mockQuery(purchaser);
      if (id === 'tree_parent_1') return mockQuery(treeParent1);
      return mockQuery(null);
    });

    const resolved = await resolveTreeUplines(purchaser, 11);
    expect(resolved.length).toBe(1);
    expect(resolved[0]._id).toBe('tree_parent_1');
  });

  // TEST 11: Same order cannot distribute commission twice (idempotency)
  it('TEST 11: Same order cannot distribute commission twice (idempotency)', async () => {
    const existingTx = {
      _id: 'tx123',
      orderId: 'order123',
      status: 'completed'
    };

    CommissionTransaction.findOne = jest.fn().mockResolvedValue(existingTx);

    const result = await distributeCommissions('order123', 'purchaser1', 1000, 100);
    expect(result).toBe(existingTx);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  // TEST 12: Cycle safety (A -> B -> A) stops traversal without infinite loop
  it('TEST 12: Cycle safety (A -> B -> A) stops traversal without infinite loop', async () => {
    const userA = { _id: 'userA', treeParent: 'userB' };
    const userB = { _id: 'userB', treeParent: 'userA' };

    User.findById.mockImplementation((id) => {
      if (id === 'userA') return mockQuery(userA);
      if (id === 'userB') return mockQuery(userB);
      return mockQuery(null);
    });

    const buyer = { _id: 'buyer1', treeParent: 'userA' };
    const uplines = await resolveTreeUplines(buyer, 11);

    // Traversal should collect userA, userB, then detect cycle and stop (length = 2)
    expect(uplines.length).toBe(2);
    expect(uplines[0]._id).toBe('userA');
    expect(uplines[1]._id).toBe('userB');
  });

  // TEST 13: Zero uplines error behavior when no valid root recipient exists
  it('TEST 13: Zero uplines throws error if treePool > 0 and no recipient exists', async () => {
    expect(() => {
      calculateTreePoolDistribution([], 40.00);
    }).toThrow('Tree Pool calculation failed: No valid tree upline or root recipient exists');
  });

  // TEST 14: Broken/missing treeParent handles log explicitly and stops traversal
  it('TEST 14: Broken/missing treeParent logs warning explicitly and stops traversal', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const userA = { _id: 'userA', treeParent: 'nonExistentId' };
    User.findById.mockImplementation((id) => {
      if (id === 'userA') return mockQuery(userA);
      return mockQuery(null);
    });

    const buyer = { _id: 'buyer1', treeParent: 'userA' };
    const uplines = await resolveTreeUplines(buyer, 11);

    expect(uplines.length).toBe(1);
    expect(uplines[0]._id).toBe('userA');
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('not found in database'));

    consoleWarnSpy.mockRestore();
  });

});
