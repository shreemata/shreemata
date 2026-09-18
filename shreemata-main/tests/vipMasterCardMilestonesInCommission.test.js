const { distributeCommissions } = require('../services/commissionDistribution');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const VipMasterCard = require('../models/VipMasterCard');
const VipMasterCardSequence = require('../models/VipMasterCardSequence');
const WalletTransaction = require('../models/WalletTransaction');
const TrustFund = require('../models/TrustFund');
const mongoose = require('mongoose');

jest.mock('../models/User');
jest.mock('../models/Order');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/CommissionSettings');
jest.mock('../models/VipMasterCard');
jest.mock('../models/VipMasterCardSequence');
jest.mock('../models/WalletTransaction');
jest.mock('../models/TrustFund');

describe('VIP Master Card Milestones in Commission Distribution', () => {
  let mockPurchaser, mockAdmin, mockTrustFund;

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
    WalletTransaction.create = jest.fn().mockResolvedValue({});
    WalletTransaction.updateMany = jest.fn().mockResolvedValue({});
    CommissionTransaction.findOneAndUpdate = jest.fn().mockResolvedValue({});
    
    mockTrustFund = {
      balance: 0,
      addTransaction: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    TrustFund.getFund = jest.fn().mockResolvedValue(mockTrustFund);
    TrustFund.findOne = jest.fn().mockImplementation(() => mockQuery(mockTrustFund));
    TrustFund.create = jest.fn().mockResolvedValue(mockTrustFund);

    mockPurchaser = {
      _id: 'purchaser_vip_123',
      name: 'VIP Purchaser',
      email: 'vip@example.com',
      treeLevel: 2,
      wallet: 0,
      toObject: () => ({ _id: 'purchaser_vip_123', name: 'VIP Purchaser' }),
      save: jest.fn().mockResolvedValue(true)
    };

    mockAdmin = {
      _id: 'admin_vip_000',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      treeLevel: 1,
      wallet: 0,
      toObject: () => ({ _id: 'admin_vip_000', name: 'Admin User' }),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById.mockImplementation(id => {
      if (id === 'purchaser_vip_123') return mockQuery(mockPurchaser);
      if (id === 'admin_vip_000') return mockQuery(mockAdmin);
      return mockQuery(null);
    });

    User.find.mockImplementation(() => mockQuery([mockAdmin, mockPurchaser]));
    User.findOne.mockImplementation(q => {
      if (q && q.role === 'admin') return mockQuery(mockAdmin);
      return mockQuery(null);
    });

    CommissionSettings.getSettings = jest.fn().mockResolvedValue({
      trustFundPercent: 1,
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 4,
      adminCommissionPercent: 1
    });

    CommissionTransaction.findOne.mockImplementation(() => mockQuery(null));
    CommissionTransaction.prototype.save = jest.fn().mockImplementation(function() {
      this.status = 'completed';
      return Promise.resolve(this);
    });
  });

  test('1. VIP milestones present: issues new card when cumulative total crosses threshold', async () => {
    Order.find.mockImplementation(() => mockQuery([
      { _id: 'order_1', totalAmount: 150, status: 'completed' }
    ]));
    VipMasterCard.find.mockImplementation(() => mockQuery([]));
    VipMasterCardSequence.findOneAndUpdate.mockResolvedValue({ seq: 1 });
    VipMasterCard.prototype.save = jest.fn().mockResolvedValue(true);

    const tx = await distributeCommissions('order_1', 'purchaser_vip_123', 150, 30);
    expect(tx).toBeDefined();
    expect(VipMasterCard.prototype.save).toHaveBeenCalled();
  });

  test('2. VIP milestones missing/undefined: handles null Order.find gracefully without throwing .forEach error', async () => {
    Order.find.mockImplementation(() => mockQuery(null));
    VipMasterCard.find.mockImplementation(() => mockQuery(null));

    const tx = await distributeCommissions('order_2', 'purchaser_vip_123', 100, 20);
    expect(tx).toBeDefined();
    expect(tx.status).toBe('completed');
  });

  test('3. VIP milestones empty array: handles empty Order.find array gracefully', async () => {
    Order.find.mockImplementation(() => mockQuery([]));
    VipMasterCard.find.mockImplementation(() => mockQuery([]));

    const tx = await distributeCommissions('order_3', 'purchaser_vip_123', 100, 20);
    expect(tx).toBeDefined();
    expect(tx.status).toBe('completed');
  });

  test('4. Commission distribution completes successfully without throwing TypeError', async () => {
    Order.find.mockImplementation(() => mockQuery(undefined));
    VipMasterCard.find.mockImplementation(() => mockQuery(undefined));

    const spyConsoleError = jest.spyOn(console, 'error');
    const tx = await distributeCommissions('order_4', 'purchaser_vip_123', 100, 20);
    expect(tx).toBeDefined();

    const hasForEachError = spyConsoleError.mock.calls.some(call => 
      call.some(arg => String(arg).includes("reading 'forEach'"))
    );
    expect(hasForEachError).toBe(false);
  });

  test('5. Duplicate commission is not created for same order', async () => {
    CommissionTransaction.findOne.mockImplementation(() => mockQuery({ _id: 'existing_tx', status: 'completed' }));
    const tx = await distributeCommissions('order_existing', 'purchaser_vip_123', 100, 20);
    expect(tx).toBeDefined();
    expect(tx._id).toBe('existing_tx');
  });
});
