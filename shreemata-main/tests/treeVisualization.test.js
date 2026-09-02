const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

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

describe('Tree Visualization API', () => {
  /**
   * Feature: multi-level-referral-system, Property 13: Tree query completeness
   * Validates: Requirements 7.1
   * 
   * For any user, querying their referral tree should return all users where that user
   * is recorded as the tree parent.
   */
  it('Property 13: Tree query completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of direct children
        fc.integer({ min: 0, max: 3 }), // Tree level of parent
        async (numChildren, parentLevel) => {
          // Create parent user
          const parent = await User.create({
            name: 'Parent User',
            email: `parent${Date.now()}@test.com`,
            password: 'password123',
            referralCode: `PARENT${Date.now()}`,
            treeLevel: parentLevel,
            treeChildren: []
          });

          // Create children and add them to parent's treeChildren
          const childIds = [];
          for (let i = 0; i < numChildren; i++) {
            const child = await User.create({
              name: `Child ${i}`,
              email: `child${i}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `CHILD${i}${Date.now()}`,
              treeParent: parent._id,
              treeLevel: parentLevel + 1,
              referredBy: parent.referralCode
            });
            childIds.push(child._id);
          }

          // Update parent with children
          parent.treeChildren = childIds;
          await parent.save();

          // Query the parent and populate treeChildren
          const queriedParent = await User.findById(parent._id)
            .populate('treeChildren');

          // Verify all children are returned
          expect(queriedParent.treeChildren).toHaveLength(numChildren);
          
          // Verify each child is in the result
          const queriedChildIds = queriedParent.treeChildren.map(c => c._id.toString());
          const expectedChildIds = childIds.map(id => id.toString());
          
          expectedChildIds.forEach(expectedId => {
            expect(queriedChildIds).toContain(expectedId);
          });

          // Verify each child has the parent as their treeParent
          for (const child of queriedParent.treeChildren) {
            expect(child.treeParent.toString()).toBe(parent._id.toString());
          }

          // Clean up
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 14: Tree level accuracy
   * Validates: Requirements 7.3
   * 
   * For any user in the tree, their tree level should equal their tree parent's level plus one.
   */
  it('Property 14: Tree level accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }), // Starting level for root
        fc.integer({ min: 1, max: 4 }), // Number of levels to create
        async (rootLevel, numLevels) => {
          // Create root user
          let currentParent = await User.create({
            name: 'Root User',
            email: `root${Date.now()}@test.com`,
            password: 'password123',
            referralCode: `ROOT${Date.now()}`,
            treeLevel: rootLevel,
            treeChildren: []
          });

          // Create a chain of users, each one level deeper
          for (let level = 1; level <= numLevels; level++) {
            const child = await User.create({
              name: `User Level ${level}`,
              email: `user${level}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `USER${level}${Date.now()}`,
              treeParent: currentParent._id,
              treeLevel: currentParent.treeLevel + 1,
              referredBy: currentParent.referralCode,
              treeChildren: []
            });

            // Update parent's treeChildren
            currentParent.treeChildren.push(child._id);
            await currentParent.save();

            // Verify the child's level is parent's level + 1
            expect(child.treeLevel).toBe(currentParent.treeLevel + 1);

            // Query from database to verify persistence
            const queriedChild = await User.findById(child._id).populate('treeParent');
            expect(queriedChild.treeLevel).toBe(queriedChild.treeParent.treeLevel + 1);

            // Move to next level
            currentParent = child;
          }

          // Clean up
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });
});
