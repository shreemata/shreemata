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
      trustFundPercent: 3,
      directCommissionPercent: 3,
      developmentFundPercent: 1,
      treeCommissionPoolPercent: 3,
      treeCommissionLevels: [
        { level: 1, percentage: 1.5 },
        { level: 2, percentage: 0.75 },
        { level: 3, percentage: 0.375 },
        { level: 4, percentage: 0.1875 }
      ]
    });
  });

  // Helper to create mock query with session support
  const mockQueryWithSession = (returnValue) => ({
    session: jest.fn().mockResolvedValue(returnValue)
  });

  /**
   * Feature: multi-level-referral-system, Property 6: Direct commission calculation
   * Validates: Requirements 4.2
   * 
   * For any order where the purchaser has a direct referrer, the direct commission 
   * should equal exactly 3% of the order amount.
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
            referredBy: 'REF123',
            treeParent: null
          };
          
          // Mock direct referrer
          const directReferrer = {
            _id: 'referrer123',
            referralCode: 'REF123',
            wallet: 0,
            directCommissionEarned: 0,
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
          
          // Verify direct commission is exactly 3% of order amount
          const expectedDirectCommission = orderAmount * 0.03;
          const tolerance = 0.01; // 1 cent tolerance
          expect(Math.abs(directReferrer.wallet - expectedDirectCommission)).toBeLessThan(tolerance);
          
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
   * For any order where the purchaser has no direct referrer, the 3% direct commission 
   * should be allocated to the Trust Fund.
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
            referredBy: null, // No referrer
            treeParent: 'treeParent123' // Still has tree parent for tree commissions
          };
          
          // Mock tree parent for tree commissions
          const treeParent = {
            _id: 'treeParent123',
            wallet: 0,
            treeCommissionEarned: 0,
            treeParent: null,
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
          
          // Setup User.findOne mock - should not be called for direct referrer
          User.findOne.mockReturnValue(mockQueryWithSession(null));
          
          // Mock TrustFund with session support
          let trustFundAddedAmount = 0;
          let devTrustFundAddedAmount = 0;
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
            addTransaction: jest.fn().mockImplementation((amount) => {
              devTrustFundAddedAmount += amount;
              return Promise.resolve(true);
            })
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
            devTrustFundAmount: 0,
            treeCommissions: [],
            remainderToDevFund: 0,
            status: 'pending',
            save: jest.fn().mockImplementation(() => {
              // Update transaction amounts based on what was actually allocated
              savedTransaction.trustFundAmount = trustFundAddedAmount;
              savedTransaction.devTrustFundAmount = devTrustFundAddedAmount;
              return Promise.resolve(true);
            })
          };
          
          CommissionTransaction.mockImplementation(() => savedTransaction);
          CommissionTransaction.findOne = jest.fn().mockResolvedValue(null);
          
          // Execute commission distribution
          await distributeCommissions(orderId, purchaserId, orderAmount);
          
          // Verify that the 3% direct commission was allocated to Trust Fund
          const expectedDirectCommission = orderAmount * 0.03;
          const expectedBaseTrustFund = orderAmount * 0.03; // Base 3% allocation
          const tolerance = 0.01; // 1 cent tolerance
          
          // The Trust Fund should receive both base allocation (3%) + direct commission (3%)
          const expectedTotalTrustFund = expectedBaseTrustFund + expectedDirectCommission;
          expect(Math.abs(trustFundAddedAmount - expectedTotalTrustFund)).toBeLessThan(tolerance);
          
          // Verify that directReferrer is null in the transaction
          expect(savedTransaction.directReferrer).toBeNull();
          
          // Verify that directCommissionAmount is still recorded for tracking
          expect(Math.abs(savedTransaction.directCommissionAmount - expectedDirectCommission)).toBeLessThan(tolerance);
          
          // Reset for next iteration
          jest.clearAllMocks();
          trustFundAddedAmount = 0;
          devTrustFundAddedAmount = 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});
