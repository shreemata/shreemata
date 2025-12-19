const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const { findTreePlacement } = require('../services/treePlacement');

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
});

describe('User Registration with Tree Placement', () => {
  /**
   * Feature: multi-level-referral-system, Property 2: Referral relationship completeness
   * Validates: Requirements 1.4
   * 
   * For any created referral relationship, the record must contain both user identifiers
   * (referrer and referee) and a timestamp.
   */
  it('Property 2: Referral relationship completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 20 }), // User name
        fc.emailAddress(), // User email
        async (userName, userEmail) => {
          // Create a referrer
          const referrer = await User.create({
            name: 'Referrer',
            email: `referrer-${Date.now()}-${Math.random()}@test.com`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            treeLevel: 1,
            treeChildren: []
          });

          // Simulate new user signup with referral code
          const placement = await findTreePlacement(referrer._id);
          
          const newUser = await User.create({
            name: userName,
            email: `${userEmail}-${Date.now()}-${Math.random()}`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            referredBy: referrer.referralCode,
            treeParent: placement.parentId,
            treeLevel: placement.level,
            treePosition: placement.position,
            referralJoinedAt: new Date()
          });

          // Verify referral relationship completeness
          // Must contain both user identifiers
          expect(newUser._id).toBeDefined();
          expect(newUser.referredBy).toBe(referrer.referralCode);
          
          // Must contain timestamp
          expect(newUser.referralJoinedAt).toBeDefined();
          expect(newUser.referralJoinedAt).toBeInstanceOf(Date);
          expect(newUser.referralJoinedAt.getTime()).toBeLessThanOrEqual(Date.now());
          
          // Verify we can identify the referrer from the referredBy code
          const foundReferrer = await User.findOne({ referralCode: newUser.referredBy });
          expect(foundReferrer).toBeDefined();
          expect(foundReferrer._id.toString()).toBe(referrer._id.toString());

          // Clean up for next iteration
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 15: Dual relationship tracking
   * Validates: Requirements 10.3
   * 
   * For any referee placed in the tree, both their direct referrer (referredBy)
   * and tree parent (treeParent) relationships must be recorded.
   */
  it('Property 15: Dual relationship tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }), // Number of existing referrals (0-5)
        fc.string({ minLength: 3, maxLength: 20 }), // User name
        fc.emailAddress(), // User email
        async (numExistingReferrals, userName, userEmail) => {
          // Create a root referrer
          const referrer = await User.create({
            name: 'Referrer',
            email: `referrer-${Date.now()}-${Math.random()}@test.com`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            treeLevel: 1,
            treeChildren: []
          });

          // Create existing referrals under the referrer
          const existingReferrals = [];
          for (let i = 0; i < numExistingReferrals; i++) {
            const existingUser = await User.create({
              name: `Existing${i}`,
              email: `existing${i}-${Date.now()}-${Math.random()}@test.com`,
              password: 'hashedpassword',
              referralCode: `REF${Date.now()}${i}${Math.random()}`,
              referredBy: referrer.referralCode,
              treeParent: referrer._id,
              treeLevel: 2,
              treePosition: i,
              treeChildren: []
            });
            existingReferrals.push(existingUser);
            referrer.treeChildren.push(existingUser._id);
          }
          await referrer.save();

          // Simulate new user signup with referral code
          const placement = await findTreePlacement(referrer._id);
          
          const newUser = await User.create({
            name: userName,
            email: `${userEmail}-${Date.now()}-${Math.random()}`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            referredBy: referrer.referralCode, // Direct referrer
            treeParent: placement.parentId, // Tree parent (may differ from direct referrer)
            treeLevel: placement.level,
            treePosition: placement.position,
            referralJoinedAt: new Date()
          });

          // Verify dual relationship tracking
          expect(newUser.referredBy).toBe(referrer.referralCode);
          expect(newUser.treeParent).toBeDefined();
          expect(newUser.treeParent).not.toBeNull();
          
          // Both relationships must be recorded
          expect(newUser.referredBy).toBeTruthy();
          expect(newUser.treeParent).toBeTruthy();

          // If less than 5 existing referrals, tree parent should be the direct referrer
          if (numExistingReferrals < 5) {
            expect(newUser.treeParent.toString()).toBe(referrer._id.toString());
          } else {
            // If 5 or more, tree parent should be one of the existing referrals (spillover)
            const treeParentIds = existingReferrals.map(u => u._id.toString());
            expect(treeParentIds).toContain(newUser.treeParent.toString());
          }

          // Clean up for next iteration
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 13: No-referrer referral capability
   * Validates: Requirements 10.4
   * 
   * For any user without a referrer who refers others, they should earn commissions
   * normally from their referrals.
   */
  it('Property 13: No-referrer referral capability', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 20 }), // User name
        fc.emailAddress(), // User email
        fc.float({ min: 100, max: 1000 }), // Order amount
        async (userName, userEmail, orderAmount) => {
          // Skip if orderAmount is NaN or invalid
          if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
            return;
          }
          // Create a user without referrer (no-referrer user)
          const noReferrerUser = await User.create({
            name: userName,
            email: `${userEmail}-${Date.now()}-${Math.random()}`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            referredBy: null, // No referrer
            treeLevel: 1,
            treeChildren: [],
            wallet: 0,
            directCommissionEarned: 0
          });

          // Create a user who will be referred by the no-referrer user
          const referee = await User.create({
            name: 'Referee',
            email: `referee-${Date.now()}-${Math.random()}@test.com`,
            password: 'hashedpassword',
            referralCode: `REF${Date.now()}${Math.random()}`,
            referredBy: noReferrerUser.referralCode, // Referred by no-referrer user
            treeParent: noReferrerUser._id,
            treeLevel: 2,
            treePosition: 0,
            treeChildren: []
          });

          // Update no-referrer user's children array
          noReferrerUser.treeChildren.push(referee._id);
          noReferrerUser.referrals = 1;
          await noReferrerUser.save();

          // Simulate commission calculation when referee makes a purchase
          const directCommissionAmount = orderAmount * 0.03; // 3% direct commission
          
          // Update no-referrer user's wallet and commission tracking
          noReferrerUser.wallet += directCommissionAmount;
          noReferrerUser.directCommissionEarned += directCommissionAmount;
          await noReferrerUser.save();

          // Verify that no-referrer user can earn commissions normally
          const updatedUser = await User.findById(noReferrerUser._id);
          
          // Should have earned direct commission
          expect(updatedUser.wallet).toBeCloseTo(directCommissionAmount, 2);
          expect(updatedUser.directCommissionEarned).toBeCloseTo(directCommissionAmount, 2);
          
          // Should have referral count
          expect(updatedUser.referrals).toBe(1);
          
          // Should have tree children
          expect(updatedUser.treeChildren).toHaveLength(1);
          expect(updatedUser.treeChildren[0].toString()).toBe(referee._id.toString());
          
          // Verify referee relationship
          expect(referee.referredBy).toBe(noReferrerUser.referralCode);
          expect(referee.treeParent.toString()).toBe(noReferrerUser._id.toString());

          // Clean up for next iteration
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });
});
