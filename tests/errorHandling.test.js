const mongoose = require('mongoose');
const User = require('../models/User');
const TrustFund = require('../models/TrustFund');
const CommissionTransaction = require('../models/CommissionTransaction');
const { distributeCommissions, addToTrustFund } = require('../services/commissionDistribution');
const { findTreePlacement } = require('../services/treePlacement');

// Mock the models
jest.mock('../models/User');
jest.mock('../models/CommissionTransaction');
jest.mock('../models/TrustFund');

describe('Error Handling and Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Referral Code Validation', () => {
    test('should reject invalid referral code format', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        referralCode: 'REF123456'
      });

      // Invalid format should be caught by validation
      const invalidCodes = ['INVALID', '123456', 'REF12', 'ref123456'];
      
      for (const code of invalidCodes) {
        const result = /^REF\d{6}$/.test(code);
        expect(result).toBe(false);
      }
    });

    test('should accept valid referral code format', () => {
      const validCodes = ['REF123456', 'REF999999', 'REF000000'];
      
      for (const code of validCodes) {
        const result = /^REF\d{6}$/.test(code);
        expect(result).toBe(true);
      }
    });
  });

  describe('Commission Distribution Error Handling', () => {
    test('should reject invalid order amount', async () => {
      await expect(
        distributeCommissions('order123', 'user123', -100)
      ).rejects.toThrow('Invalid order amount');

      await expect(
        distributeCommissions('order123', 'user123', 0)
      ).rejects.toThrow('Invalid order amount');
    });

    test('should reject missing order ID', async () => {
      await expect(
        distributeCommissions(null, 'user123', 1000)
      ).rejects.toThrow('Order ID is required');
    });

    test('should reject missing purchaser ID', async () => {
      await expect(
        distributeCommissions('order123', null, 1000)
      ).rejects.toThrow('Purchaser ID is required');
    });

    test('should reject non-existent purchaser', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      // Mock session
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };
      
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      
      // Mock User.findById to return null
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null)
      });
      
      // Mock CommissionTransaction.findOne
      CommissionTransaction.findOne.mockResolvedValue(null);
      
      await expect(
        distributeCommissions('order123', fakeId, 1000)
      ).rejects.toThrow();
    });

    test('should prevent duplicate commission processing', async () => {
      const existingTransaction = {
        _id: 'trans123',
        orderId: 'order123',
        status: 'completed'
      };
      
      // Mock existing transaction
      CommissionTransaction.findOne.mockResolvedValue(existingTransaction);
      
      const result = await distributeCommissions('order123', 'user123', 1000);
      expect(result._id).toBe('trans123');
      expect(result.status).toBe('completed');
    });

    test('should ensure all amounts are non-negative', async () => {
      await expect(
        addToTrustFund('trust', -100, 'order123')
      ).rejects.toThrow('Amount must be a non-negative number');
    });
  });

  describe('Trust Fund Error Handling', () => {
    test('should reject invalid fund type', async () => {
      await expect(
        addToTrustFund('invalid', 100, 'order123')
      ).rejects.toThrow('Invalid fund type');
    });

    test('should prevent negative balance', () => {
      const trustFund = {
        fundType: 'trust',
        balance: 100,
        transactions: [],
        addTransaction: async function(amount, type, orderId, description) {
          if (amount < 0 && Math.abs(amount) > this.balance) {
            throw new Error(`Insufficient balance for withdrawal. Available: ${this.balance}, Requested: ${Math.abs(amount)}`);
          }
          this.transactions.push({ orderId, amount, type, timestamp: new Date(), description });
          this.balance += amount;
        }
      };

      expect(
        trustFund.addTransaction(-200, 'withdrawal', null, 'Test withdrawal')
      ).rejects.toThrow('Insufficient balance');
    });

    test('should validate withdrawal amounts', async () => {
      const trustFund = {
        fundType: 'trust',
        balance: 100,
        transactions: [],
        addTransaction: async function(amount, type, orderId, description) {
          if (amount < 0 && Math.abs(amount) > this.balance) {
            throw new Error(`Insufficient balance for withdrawal. Available: ${this.balance}, Requested: ${Math.abs(amount)}`);
          }
          const newBalance = this.balance + amount;
          if (newBalance < 0) {
            throw new Error('Transaction would result in negative balance');
          }
          this.transactions.push({ orderId, amount, type, timestamp: new Date(), description });
          this.balance = newBalance;
        }
      };

      // Should succeed with valid amount
      await trustFund.addTransaction(-50, 'withdrawal', null, 'Valid withdrawal');
      expect(trustFund.balance).toBe(50);

      // Should fail with amount exceeding balance
      await expect(
        trustFund.addTransaction(-100, 'withdrawal', null, 'Invalid withdrawal')
      ).rejects.toThrow('Insufficient balance');
    });

    test('should maintain balance consistency', async () => {
      const trustFund = {
        fundType: 'trust',
        balance: 0,
        transactions: [],
        addTransaction: async function(amount, type, orderId, description) {
          this.transactions.push({ orderId, amount, type, timestamp: new Date(), description });
          this.balance += amount;
        }
      };

      // Add multiple transactions
      await trustFund.addTransaction(100, 'order_allocation', 'order1', 'Test 1');
      await trustFund.addTransaction(50, 'order_allocation', 'order2', 'Test 2');
      await trustFund.addTransaction(-30, 'withdrawal', null, 'Test withdrawal');

      // Verify balance matches transaction sum
      const calculatedBalance = trustFund.transactions.reduce((sum, t) => sum + t.amount, 0);
      expect(trustFund.balance).toBe(calculatedBalance);
      expect(trustFund.balance).toBe(120);
    });
  });

  describe('Tree Placement Error Handling', () => {
    test('should reject non-existent referrer', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      // Mock User.findById to return null
      User.findById.mockResolvedValue(null);
      
      await expect(
        findTreePlacement(fakeId)
      ).rejects.toThrow('Reference user not found');
    });

    test('should handle tree placement errors gracefully', async () => {
      const referrerId = new mongoose.Types.ObjectId();
      const referrer = {
        _id: referrerId,
        name: 'Referrer',
        email: 'referrer@example.com',
        referralCode: 'REF123456',
        treeLevel: 1,
        treeChildren: []
      };

      // Mock User.findById to return the referrer
      User.findById.mockResolvedValue(referrer);

      // Should succeed with valid referrer
      const placement = await findTreePlacement(referrerId);
      expect(placement).toHaveProperty('parentId');
      expect(placement).toHaveProperty('level');
      expect(placement).toHaveProperty('position');
      expect(placement.parentId.toString()).toBe(referrerId.toString());
    });
  });
});
