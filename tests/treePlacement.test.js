const fc = require('fast-check');
const { findTreePlacement } = require('../services/treePlacement');
const User = require('../models/User');

// Mock the User model
jest.mock('../models/User');

describe('Tree Placement Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Feature: multi-level-referral-system, Property 3: Initial placement correctness
   * Validates: Requirements 2.1, 2.2
   * 
   * For any user with fewer than 5 direct tree children, when a new referral is added,
   * the referee should be placed directly under the referrer at level (referrer.level + 1).
   */
  it('Property 3: Initial placement correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // Number of existing children (0-4)
        fc.integer({ min: 0, max: 10 }), // Tree level of referrer
        async (numExistingChildren, referrerLevel) => {
          const referrerId = 'referrer123';
          const childrenIds = Array.from({ length: numExistingChildren }, (_, i) => `child${i}`);

          // Mock the referrer
          User.findById.mockResolvedValue({
            _id: referrerId,
            treeLevel: referrerLevel,
            treeChildren: childrenIds
          });

          // Find placement for new user
          const placement = await findTreePlacement(referrerId);

          // Verify placement is directly under referrer
          expect(placement.parentId).toBe(referrerId);
          expect(placement.level).toBe(referrerLevel + 1);
          expect(placement.position).toBe(numExistingChildren);
          
          // Reset for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 4: Serial spillover placement
   * Validates: Requirements 2.4
   * 
   * For any user with 5 or more direct tree children, when a new referral is added,
   * the referee should be placed under the first available tree child (in chronological order)
   * that has fewer than 5 children.
   */
  it('Property 4: Serial spillover placement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }), // Tree level of referrer
        fc.integer({ min: 0, max: 4 }), // Which child has space (0-4)
        fc.integer({ min: 0, max: 4 }), // Number of children that child has
        async (referrerLevel, childWithSpaceIndex, numChildrenOfChild) => {
          const referrerId = 'referrer123';
          const childrenIds = Array.from({ length: 5 }, (_, i) => `child${i}`);

          // Create children data
          const childrenWithTimestamps = childrenIds.map((id, index) => ({
            _id: id,
            treeChildren: index === childWithSpaceIndex 
              ? Array(numChildrenOfChild).fill('dummy') 
              : Array(5).fill('dummy'),
            treeLevel: referrerLevel + 1,
            createdAt: new Date(Date.now() + index * 1000)
          }));

          // Setup mock implementation
          let findByIdCallCount = 0;
          User.findById.mockImplementation((id) => {
            if (findByIdCallCount === 0) {
              findByIdCallCount++;
              // First call - return referrer
              return Promise.resolve({
                _id: referrerId,
                treeLevel: referrerLevel,
                treeChildren: childrenIds
              });
            } else {
              // Subsequent calls - return child with select method
              const childIndex = findByIdCallCount - 1;
              findByIdCallCount++;
              return {
                select: jest.fn().mockResolvedValue(childrenWithTimestamps[childIndex])
              };
            }
          });

          // Mock User.find
          User.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
              sort: jest.fn().mockResolvedValue(childrenWithTimestamps)
            })
          });

          // Find placement for new user
          const placement = await findTreePlacement(referrerId);

          // Verify placement is under the first child with space
          expect(placement.parentId).toBe(childrenIds[childWithSpaceIndex]);
          expect(placement.level).toBe(referrerLevel + 2);
          expect(placement.position).toBe(numChildrenOfChild);
          
          // Reset for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 16: Timestamp-based ordering
   * Validates: Requirements 10.2
   * 
   * For any set of referrals under the same parent, their tree positions should correspond
   * to their chronological order of creation based on timestamps.
   */
  it('Property 16: Timestamp-based ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // Number of children (2-5)
        fc.integer({ min: 0, max: 10 }), // Tree level of referrer
        async (numChildren, referrerLevel) => {
          const referrerId = 'referrer123';
          const childrenIds = Array.from({ length: 5 }, (_, i) => `child${i}`);

          // Create children with specific timestamps (not in order)
          const timestamps = Array.from({ length: numChildren }, (_, i) => Date.now() + i * 1000);
          const shuffledTimestamps = [...timestamps].sort(() => Math.random() - 0.5);
          
          const childrenWithTimestamps = childrenIds.slice(0, numChildren).map((id, index) => ({
            _id: id,
            treeChildren: Array(5).fill('dummy'), // All full
            treeLevel: referrerLevel + 1,
            createdAt: new Date(shuffledTimestamps[index])
          }));

          // Sort by timestamp to get expected order
          const sortedChildren = [...childrenWithTimestamps].sort((a, b) => 
            a.createdAt.getTime() - b.createdAt.getTime()
          );

          // Setup mock implementation
          let findByIdCallCount = 0;
          const findByIdCalls = [];
          User.findById.mockImplementation((id) => {
            findByIdCalls.push(id);
            if (findByIdCallCount === 0) {
              findByIdCallCount++;
              // First call - return referrer
              return Promise.resolve({
                _id: referrerId,
                treeLevel: referrerLevel,
                treeChildren: childrenIds
              });
            } else {
              // Subsequent calls - return child with select method
              const childIndex = findByIdCallCount - 1;
              findByIdCallCount++;
              return {
                select: jest.fn().mockResolvedValue(sortedChildren[childIndex])
              };
            }
          });

          // Mock User.find - return sorted children
          User.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
              sort: jest.fn().mockResolvedValue(sortedChildren)
            })
          });

          // Since all children are full, this will throw an error
          try {
            await findTreePlacement(referrerId);
          } catch (error) {
            // Expected to fail since all children are full
          }

          // Verify that User.findById was called in chronological order
          expect(findByIdCalls.length).toBeGreaterThan(1);
          // The second findById call should be for the earliest child
          expect(findByIdCalls[1]).toBe(sortedChildren[0]._id);
          
          // Reset for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 12: No-referrer tree placement
   * Validates: Requirements 10.1, 10.2
   * 
   * For any user who signs up without a referral code, they should still be placed
   * in the referral tree using the same serial placement algorithm.
   */
  it('Property 12: No-referrer tree placement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // Number of children root has (0-4)
        async (numRootChildren) => {
          const referenceUserId = 'reference123';
          const rootUserId = 'root123';
          
          // Create children IDs
          const childrenIds = Array.from({ length: numRootChildren }, (_, i) => `child${i}`);
          
          // Setup simple mock - reference user is always root for simplicity
          User.findById.mockResolvedValue({
            _id: rootUserId,
            treeLevel: 1,
            treeParent: null,
            treeChildren: childrenIds
          });

          // Find placement for user without referrer
          const placement = await findTreePlacement(referenceUserId);

          // Verify placement follows same algorithm as referred users
          expect(placement).toHaveProperty('parentId');
          expect(placement).toHaveProperty('level');
          expect(placement).toHaveProperty('position');
          
          // Since root has < 5 children, should be placed directly under root
          expect(placement.parentId).toBe(rootUserId);
          expect(placement.level).toBe(2); // Root level + 1
          expect(placement.position).toBe(numRootChildren); // Next available position
          
          // Reset for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });
});
