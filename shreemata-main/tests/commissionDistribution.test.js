const fc = require('fast-check');
const { distributeCommissions, addToTrustFund } = require('../services/commissionDistribution');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
const TrustFund = require('../models/TrustFund');
const CommissionSettings = require('../models/CommissionSettings');
const mongoose = require('mongoose');

// Mock the models
jest.mock('../models/User');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/TrustFund');
jest.mock('../models/CommissionSettings');

// Mock mongoose session for transaction support
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(true),
  abortTransaction: jest.fn().mockResolvedValue(true),
  endSession: jest.fn()
};

jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

describe('Commission Distribution Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockClear();
    mockSession.abortTransaction.mockClear();
    mockSession.endSession.mockClear();
    
    // Mock CommissionSettings.getSettings()
    CommissionSettings.getSettings = jest.fn().mockResolvedValue({
      trustFundPercent: 1,
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 4,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'split_admin_trust',
      treeCommissionLevels: [
        { level: 1, percentage: 2 },
        { level: 2, percentage: 1 },
        { level: 3, percentage: 0.5 },
        { level: 4, percentage: 0.25 },
        { level: 5, percentage: 0.125 }
      ]
    });
  });

  // Helper to create mock query with session support and thenable behavior
  const mockQueryWithSession = (returnValue) => {
    const query = {
      session: jest.fn().mockImplementation(() => query),
      sort: jest.fn().mockImplementation(() => query),
      limit: jest.fn().mockImplementation(() => query),
      populate: jest.fn().mockImplementation(() => query),
      then: jest.fn().mockImplementation((resolve) => resolve(returnValue)),
      catch: jest.fn()
    };
    return query;
  };

  /**
   * Feature: multi-level-referral-system, Property 6: Direct commission calculation
   * Validates: Requirements 4.2
   * 
   * For any order where the purchaser has a direct referrer:
   * - The purchaser receives the Direct Commission (3% of order amount) in their own wallet.
   * - The referrer receives the Referral Commission (2% of order amount).
   */
  it('Property 6: Direct commission calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: 100, max: 100000, noNaN: true }), // Order amount
        async (orderAmount) => {
          const orderId = 'order123';
          const purchaserId = 'purchaser123';
          
          // Mock purchaser with direct referrer
          const purchaser = {
            _id: purchaserId,
            email: 'purchaser@example.com',
            referredBy: 'REF123',
            treeParent: null,
            firstPurchaseDone: true,
            wallet: 0,
            directCommissionEarned: 0,
            save: jest.fn().mockResolvedValue(true)
          };
          
          // Mock direct referrer
          const directReferrer = {
            _id: 'referrer123',
            email: 'referrer@example.com',
            referralCode: 'REF123',
            wallet: 0,
            directCommissionEarned: 0,
            referralCommissionEarned: 0,
            save: jest.fn().mockResolvedValue(true)
          };
          
          // Setup User.findById mock with session support
          User.findById.mockReturnValue(mockQueryWithSession(purchaser));
          
          // Setup User.findOne mock for direct referrer with session support
          User.findOne.mockReturnValue(mockQueryWithSession(directReferrer));
          
          // Mock TrustFund with session support
          const mockTrustFund = {
            fundType: 'trust',
            balance: 0,
            transactions: [],
            addTransaction: jest.fn().mockResolvedValue(true)
          };
          
          const mockDevTrustFund = {
            fundType: 'development',
            balance: 0,
            transactions: [],
            addTransaction: jest.fn().mockResolvedValue(true)
          };
          
          TrustFund.findOne.mockImplementation(({ fundType }) => {
            const fund = fundType === 'trust' ? mockTrustFund : (fundType === 'development' ? mockDevTrustFund : null);
            return mockQueryWithSession(fund);
          });
          
          // Mock CommissionTransaction
          const savedTransaction = {
            orderId,
            purchaser: purchaserId,
            orderAmount,
            trustFundAmount: 0,
            directCommissionAmount: 0,
            referralCommissionAmount: 0,
            devTrustFundAmount: 0,
            treeCommissions: [],
            remainderToDevFund: 0,
            status: 'pending',
            save: jest.fn().mockResolvedValue(true)
          };
          
          CommissionTransaction.mockImplementation(() => savedTransaction);
          CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
          
          // Execute commission distribution
          await distributeCommissions(orderId, purchaserId, orderAmount);
          
          const expectedPurchaserCommission = orderAmount * 0.03;
          const expectedReferrerCommission = orderAmount * 0.02;
          const tolerance = 0.01; // 1 cent tolerance

          // Purchaser gets Direct Commission
          expect(Math.abs(purchaser.wallet - expectedPurchaserCommission)).toBeLessThan(tolerance);
          // Referrer gets Referral Commission
          expect(Math.abs(directReferrer.wallet - expectedReferrerCommission)).toBeLessThan(tolerance);
          
          // Reset for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 8: No-referrer commission allocation
   * Validates: Requirements 4.4, 10.3
   * 
   * For any order where the purchaser has no direct referrer:
   * - Direct Commission (3%) still goes to purchaser.
   * - Referral Commission (2%) split: 1% to Admin and 1% to Trust Fund.
   */
  it('Property 8: No-referrer commission allocation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: 100, max: 100000, noNaN: true }), // Order amount
        async (orderAmount) => {
          const orderId = 'order456';
          const purchaserId = 'purchaser456';
          
          // Mock purchaser with no referrer (referredBy = null)
          const purchaser = {
            _id: purchaserId,
            email: 'purchaser@example.com',
            referredBy: null, // No referrer
            treeParent: 'treeParent123', // Still has tree parent for tree commissions
            firstPurchaseDone: true,
            wallet: 0,
            directCommissionEarned: 0,
            save: jest.fn().mockResolvedValue(true)
          };
          
          // Mock tree parent for tree commissions (receives level 1: 2%)
          const treeParent = {
            _id: 'treeParent123',
            email: 'parent@example.com',
            wallet: 0,
            treeCommissionEarned: 0,
            treeParent: null,
            save: jest.fn().mockResolvedValue(true)
          };

          // Mock admin user for referral split (receives 1%)
          const adminUser = {
            _id: 'admin123',
            email: 'admin@example.com',
            wallet: 0,
            referralCommissionEarned: 0,
            isModified: jest.fn().mockReturnValue(true),
            save: jest.fn().mockResolvedValue(true)
          };
          
          // Setup User.findById mock with session support
          User.findById.mockImplementation((id) => {
            if (id === purchaserId) {
              return mockQueryWithSession(purchaser);
            } else if (id === 'treeParent123') {
              return mockQueryWithSession(treeParent);
            }
            return mockQueryWithSession(null);
          });
          
          // Setup User.findOne mock for Admin or DirectReferrer
          User.findOne.mockImplementation((query) => {
            if (query && query.role === 'admin') {
              return mockQueryWithSession(adminUser);
            }
            return mockQueryWithSession(null);
          });
          
          // Mock TrustFund with session support
          let trustFundAddedAmount = 0;
          const mockTrustFund = {
            fundType: 'trust',
            balance: 0,
            transactions: [],
            addTransaction: jest.fn().mockImplementation((amount) => {
              trustFundAddedAmount += amount;
              return Promise.resolve(true);
            })
          };
          
          const mockDevTrustFund = {
            fundType: 'development',
            balance: 0,
            transactions: [],
            addTransaction: jest.fn().mockResolvedValue(true)
          };
          
          TrustFund.findOne.mockImplementation(({ fundType }) => {
            const fund = fundType === 'trust' ? mockTrustFund : (fundType === 'development' ? mockDevTrustFund : null);
            return mockQueryWithSession(fund);
          });
          
          // Mock CommissionTransaction
          const savedTransaction = {
            orderId,
            purchaser: purchaserId,
            orderAmount,
            trustFundAmount: 0,
            directReferrer: null,
            directCommissionAmount: 0,
            referralReferrer: null,
            referralCommissionAmount: 0,
            devTrustFundAmount: 0,
            treeCommissions: [],
            remainderToDevFund: 0,
            status: 'pending',
            save: jest.fn().mockImplementation(() => {
              // Update transaction amounts based on what was actually allocated
              savedTransaction.trustFundAmount = trustFundAddedAmount;
              return Promise.resolve(true);
            })
          };
          
          CommissionTransaction.mockImplementation(() => savedTransaction);
          CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
          
          // Execute commission distribution
          await distributeCommissions(orderId, purchaserId, orderAmount);
          
          // The Trust Fund should receive:
          // - Base trust fund (1%)
          // - Half of referral commission (1%)
          // - Tree commission remainder (2% because treeParent received level 1 = 2% out of 4% tree commission pool)
          // Total trust = 1% + 1% + 2% = 4% of order amount
          const expectedTotalTrustFund = orderAmount * 0.04;
          const expectedAdminAmount = orderAmount * 0.01;
          const expectedPurchaserAmount = orderAmount * 0.03;
          const tolerance = 0.01; // 1 cent tolerance
          
          expect(Math.abs(trustFundAddedAmount - expectedTotalTrustFund)).toBeLessThan(tolerance);
          expect(Math.abs(adminUser.wallet - expectedAdminAmount)).toBeLessThan(tolerance);
          expect(Math.abs(purchaser.wallet - expectedPurchaserAmount)).toBeLessThan(tolerance);
          
          // Verify that directReferrer is linked to purchaser in transaction record
          expect(savedTransaction.directReferrer.toString()).toBe(purchaserId);
          
          // Verify that directCommissionAmount is recorded for tracking
          expect(Math.abs(savedTransaction.directCommissionAmount - expectedPurchaserAmount)).toBeLessThan(tolerance);
          
          // Reset for next iteration
          jest.clearAllMocks();
          trustFundAddedAmount = 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 9: Dynamic fallback commission routing
   * Validates: Dynamic fallback routing options
   */
  it('Property 9: Dynamic fallback commission routing', async () => {
    // Override settings to route 100% of fallback to Admin
    CommissionSettings.getSettings.mockResolvedValue({
      trustFundPercent: 1,
      directCommissionPercent: 3,
      referralCommissionPercent: 2,
      developmentFundPercent: 0,
      treeCommissionPoolPercent: 4,
      directFallbackRecipient: 'admin',
      referralFallbackRecipient: 'admin',
      treeCommissionLevels: [
        { level: 1, percentage: 2 }
      ]
    });

    const orderAmount = 1000;
    const orderId = 'order789';
    const purchaserId = 'purchaser789';

    const purchaser = {
      _id: purchaserId,
      email: 'purchaser@example.com',
      referredBy: null,
      treeParent: 'treeParent123',
      firstPurchaseDone: true,
      wallet: 0,
      directCommissionEarned: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const treeParent = {
      _id: 'treeParent123',
      email: 'parent@example.com',
      wallet: 0,
      treeCommissionEarned: 0,
      treeParent: null,
      save: jest.fn().mockResolvedValue(true)
    };

    const adminUser = {
      _id: 'admin123',
      email: 'admin@example.com',
      wallet: 0,
      directCommissionEarned: 0,
      referralCommissionEarned: 0,
      isModified: jest.fn().mockReturnValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById.mockImplementation((id) => {
      if (id === purchaserId) return mockQueryWithSession(purchaser);
      if (id === 'treeParent123') return mockQueryWithSession(treeParent);
      return mockQueryWithSession(null);
    });

    User.findOne.mockImplementation((query) => {
      if (query && query.role === 'admin') return mockQueryWithSession(adminUser);
      return mockQueryWithSession(null);
    });

    let trustFundAddedAmount = 0;
    const mockTrustFund = {
      fundType: 'trust',
      balance: 0,
      transactions: [],
      addTransaction: jest.fn().mockImplementation((amount) => {
        trustFundAddedAmount += amount;
        return Promise.resolve(true);
      })
    };

    TrustFund.findOne.mockImplementation(({ fundType }) => {
      if (fundType === 'trust') return mockQueryWithSession(mockTrustFund);
      return mockQueryWithSession(null);
    });

    const savedTransaction = {
      orderId,
      purchaser: purchaserId,
      orderAmount,
      trustFundAmount: 0,
      directReferrer: null,
      directCommissionAmount: 0,
      referralReferrer: null,
      referralCommissionAmount: 0,
      devTrustFundAmount: 0,
      treeCommissions: [],
      remainderToDevFund: 0,
      status: 'pending',
      save: jest.fn().mockImplementation(() => {
        savedTransaction.trustFundAmount = trustFundAddedAmount;
        return Promise.resolve(true);
      })
    };

    CommissionTransaction.mockImplementation(() => savedTransaction);

    await distributeCommissions(orderId, purchaserId, orderAmount);

    // Verify Purchaser receives Direct Commission (3% = 30)
    expect(purchaser.wallet).toBe(30);

    // Verify Admin wallet receives:
    // - Referral fallback (2% = 20)
    // Total Admin = 20
    expect(adminUser.wallet).toBe(20);
    expect(adminUser.referralCommissionEarned).toBe(20);

    // Verify Trust Fund receives:
    // - Base trust (1% = 10)
    // - Tree remainder (2% = 20)
    // Total Trust = 30
    expect(trustFundAddedAmount).toBe(30);
  });
});
