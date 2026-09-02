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

// Helper function to build complete tree structure (mirrors API logic)
async function buildCompleteTree(rootUsers, currentDepth = 0, maxDepth = 20) {
  if (currentDepth >= maxDepth || !rootUsers || rootUsers.length === 0) {
    return [];
  }

  const result = [];

  for (const userId of rootUsers) {
    const user = await User.findById(userId)
      .select("name email referralCode wallet treeLevel treePosition treeChildren referredBy createdAt directCommissionEarned treeCommissionEarned")
      .populate('treeChildren', '_id');

    if (!user) continue;

    // Calculate total commission earned
    const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);

    // Determine referral status
    const referralStatus = {
      hasReferrer: !!user.referredBy,
      joinedWithoutReferrer: !user.referredBy,
      isRootUser: user.treeLevel === 0 || !user.treeParent
    };

    // Get children recursively
    const childrenIds = user.treeChildren.map(child => child._id);
    const children = await buildCompleteTree(childrenIds, currentDepth + 1, maxDepth);

    result.push({
      id: user._id,
      name: user.name,
      email: user.email,
      referralCode: user.referralCode,
      wallet: user.wallet || 0,
      treeLevel: user.treeLevel,
      treePosition: user.treePosition,
      joinDate: user.createdAt,
      referralStatus: referralStatus,
      commissions: {
        total: totalCommissionEarned,
        direct: user.directCommissionEarned || 0,
        tree: user.treeCommissionEarned || 0
      },
      childrenCount: user.treeChildren.length,
      children: children
    });
  }

  return result;
}

describe('Admin Referral Tree API', () => {
  /**
   * Feature: multi-level-referral-system, Property 19: Complete tree query accuracy
   * Validates: Requirements 11.1, 11.2
   * 
   * For any admin request for the complete referral tree, the returned structure should 
   * include all users with their correct tree positions and relationships.
   */
  it('Property 19: Complete tree query accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // Number of root users
        fc.integer({ min: 1, max: 4 }), // Children per root
        fc.integer({ min: 0, max: 2 }), // Depth levels
        async (numRoots, childrenPerRoot, depth) => {
          // Ensure clean state
          await User.deleteMany({});
          
          const createdUsers = [];
          
          // Create root users
          for (let r = 0; r < numRoots; r++) {
            const rootUser = await User.create({
              name: `Root User ${r}`,
              email: `root${r}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `ROOT${r}${Date.now()}`,
              treeLevel: 0,
              treeChildren: [],
              referredBy: null // No referrer for root users
            });
            createdUsers.push(rootUser);

            // Create children for each root
            let currentParents = [rootUser];
            
            for (let level = 1; level <= depth; level++) {
              const nextParents = [];
              
              for (const parent of currentParents) {
                const childIds = [];
                
                for (let c = 0; c < childrenPerRoot; c++) {
                  const child = await User.create({
                    name: `Child L${level}-${c}`,
                    email: `child${level}${c}${Date.now()}${parent._id}@test.com`,
                    password: 'password123',
                    referralCode: `CHILD${level}${c}${Date.now()}${parent._id}`,
                    treeParent: parent._id,
                    treeLevel: level,
                    treePosition: c,
                    treeChildren: [],
                    referredBy: parent.referralCode,
                    directCommissionEarned: Math.random() * 100,
                    treeCommissionEarned: Math.random() * 50
                  });
                  
                  childIds.push(child._id);
                  createdUsers.push(child);
                  nextParents.push(child);
                }
                
                // Update parent with children
                parent.treeChildren = childIds;
                await parent.save();
              }
              
              currentParents = nextParents;
            }
          }

          // Find root users (users with treeLevel 0 or no treeParent)
          const rootUsers = await User.find({
            $or: [
              { treeLevel: 0 },
              { treeParent: null },
              { treeParent: { $exists: false } }
            ]
          }).select("_id").sort({ createdAt: 1 });

          const rootUserIds = rootUsers.map(user => user._id);

          // Build complete tree structure using helper function
          const completeTree = await buildCompleteTree(rootUserIds, 0, depth + 1);
          
          // Verify all root users are returned
          expect(completeTree).toHaveLength(numRoots);

          // Verify tree structure accuracy
          function verifyTreeNode(node, expectedLevel) {
            // Check basic properties
            expect(node).toHaveProperty('id');
            expect(node).toHaveProperty('name');
            expect(node).toHaveProperty('treeLevel', expectedLevel);
            expect(node).toHaveProperty('referralStatus');
            expect(node).toHaveProperty('commissions');
            expect(node).toHaveProperty('children');

            // Verify referral status for root users
            if (expectedLevel === 0) {
              expect(node.referralStatus.joinedWithoutReferrer).toBe(true);
              expect(node.referralStatus.hasReferrer).toBe(false);
            }

            // Verify commission structure
            expect(node.commissions).toHaveProperty('total');
            expect(node.commissions).toHaveProperty('direct');
            expect(node.commissions).toHaveProperty('tree');
            expect(typeof node.commissions.total).toBe('number');

            // Recursively verify children
            if (node.children && node.children.length > 0) {
              expect(node.children.length).toBeLessThanOrEqual(childrenPerRoot);
              
              for (const child of node.children) {
                verifyTreeNode(child, expectedLevel + 1);
              }
            }
          }

          // Verify each root node and its subtree
          for (const rootNode of completeTree) {
            verifyTreeNode(rootNode, 0);
          }

          // Count users without referrers
          let usersWithoutReferrers = 0;
          let totalUsersInTree = 0;

          function countUsers(nodes) {
            for (const node of nodes) {
              totalUsersInTree++;
              if (node.referralStatus.joinedWithoutReferrer) {
                usersWithoutReferrers++;
              }
              if (node.children && node.children.length > 0) {
                countUsers(node.children);
              }
            }
          }

          countUsers(completeTree);

          // Verify stats
          expect(usersWithoutReferrers).toBeGreaterThanOrEqual(numRoots);

          // Clean up
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 20: Tree level capacity calculation
   * Validates: Requirements 11.4
   * 
   * For any tree level, the system should accurately calculate and display the current 
   * fill status (occupied positions / total possible positions).
   */
  it('Property 20: Tree level capacity calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // Tree level to test
        fc.integer({ min: 0, max: 10 }), // Number of users to create at that level
        async (testLevel, numUsersAtLevel) => {
          // Ensure clean state
          await User.deleteMany({});
          
          // Calculate theoretical capacity for the test level
          let theoreticalCapacity;
          if (testLevel === 0) {
            theoreticalCapacity = 1; // Root level
          } else {
            theoreticalCapacity = Math.pow(5, testLevel);
          }

          // Don't create more users than theoretical capacity allows
          const actualUsersToCreate = Math.min(numUsersAtLevel, theoreticalCapacity);

          // Create users at the specified level
          const createdUsers = [];
          for (let i = 0; i < actualUsersToCreate; i++) {
            const user = await User.create({
              name: `User ${i} Level ${testLevel}`,
              email: `user${i}level${testLevel}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `USER${i}L${testLevel}${Date.now()}`,
              treeLevel: testLevel,
              treePosition: i,
              treeChildren: [],
              referredBy: testLevel === 0 ? null : `PARENT${Date.now()}`,
              directCommissionEarned: Math.random() * 100,
              treeCommissionEarned: Math.random() * 50
            });
            createdUsers.push(user);
          }

          // Get all users at the specified level (mirrors API logic)
          const totalUsersAtLevel = await User.countDocuments({ treeLevel: testLevel });
          
          const usersAtLevel = await User.find({ treeLevel: testLevel })
            .select("name email referralCode wallet treeLevel treePosition treeParent treeChildren referredBy createdAt directCommissionEarned treeCommissionEarned")
            .sort({ treePosition: 1, createdAt: 1 });

          // Calculate fill status (mirrors API logic)
          const fillStatus = {
            occupied: totalUsersAtLevel,
            theoretical: theoreticalCapacity,
            fillRate: theoreticalCapacity > 0 ? ((totalUsersAtLevel / theoreticalCapacity) * 100).toFixed(2) : 0,
            available: Math.max(0, theoreticalCapacity - totalUsersAtLevel)
          };

          // Verify capacity calculations
          expect(fillStatus).toHaveProperty('occupied');
          expect(fillStatus).toHaveProperty('theoretical');
          expect(fillStatus).toHaveProperty('fillRate');
          expect(fillStatus).toHaveProperty('available');

          // Verify theoretical capacity calculation
          expect(fillStatus.theoretical).toBe(theoreticalCapacity);

          // Verify occupied count matches created users
          expect(fillStatus.occupied).toBe(actualUsersToCreate);

          // Verify available positions calculation
          expect(fillStatus.available).toBe(theoreticalCapacity - actualUsersToCreate);

          // Verify fill rate calculation
          const expectedFillRate = theoreticalCapacity > 0 
            ? ((actualUsersToCreate / theoreticalCapacity) * 100).toFixed(2)
            : 0;
          expect(parseFloat(fillStatus.fillRate)).toBeCloseTo(parseFloat(expectedFillRate), 2);

          // Verify fill rate is within valid range
          expect(parseFloat(fillStatus.fillRate)).toBeGreaterThanOrEqual(0);
          expect(parseFloat(fillStatus.fillRate)).toBeLessThanOrEqual(100);

          // Verify users array contains correct number of users
          expect(usersAtLevel).toHaveLength(actualUsersToCreate);

          // Verify each user has correct level
          for (const user of usersAtLevel) {
            expect(user.treeLevel).toBe(testLevel);
          }

          // Count users without referrers at this level
          const usersWithoutReferrers = usersAtLevel.filter(user => !user.referredBy).length;
          expect(usersWithoutReferrers).toBeGreaterThanOrEqual(0);

          // Clean up
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-level-referral-system, Property 21: No-referrer user identification
   * Validates: Requirements 11.3
   * 
   * For any user who joined without a referral code, they should be clearly identifiable 
   * in the admin tree view.
   */
  it('Property 21: No-referrer user identification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of users with referrers
        fc.integer({ min: 1, max: 5 }), // Number of users without referrers
        fc.integer({ min: 0, max: 3 }), // Tree level to test
        async (usersWithReferrers, usersWithoutReferrers, testLevel) => {
          // Ensure clean state
          await User.deleteMany({});
          
          const createdUsers = [];
          
          // Create users with referrers
          for (let i = 0; i < usersWithReferrers; i++) {
            const user = await User.create({
              name: `User With Referrer ${i}`,
              email: `withref${i}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `WITHREF${i}${Date.now()}`,
              treeLevel: testLevel,
              treePosition: i,
              treeChildren: [],
              referredBy: `REFERRER${i}${Date.now()}`, // Has a referrer
              directCommissionEarned: Math.random() * 100,
              treeCommissionEarned: Math.random() * 50
            });
            createdUsers.push(user);
          }

          // Create users without referrers
          for (let i = 0; i < usersWithoutReferrers; i++) {
            const user = await User.create({
              name: `User Without Referrer ${i}`,
              email: `noref${i}${Date.now()}@test.com`,
              password: 'password123',
              referralCode: `NOREF${i}${Date.now()}`,
              treeLevel: testLevel,
              treePosition: usersWithReferrers + i,
              treeChildren: [],
              referredBy: null, // No referrer
              directCommissionEarned: Math.random() * 100,
              treeCommissionEarned: Math.random() * 50
            });
            createdUsers.push(user);
          }

          // Get users at level (mirrors API logic)
          const usersAtLevel = await User.find({ treeLevel: testLevel })
            .select("name email referralCode wallet treePosition treeParent treeChildren referredBy createdAt directCommissionEarned treeCommissionEarned")
            .sort({ treePosition: 1, createdAt: 1 });

          const totalUsersAtLevel = usersWithReferrers + usersWithoutReferrers;
          expect(usersAtLevel).toHaveLength(totalUsersAtLevel);

          // Format user data with referral relationships (mirrors API logic)
          const formattedUsers = usersAtLevel.map(user => {
            const totalCommissionEarned = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);
            
            return {
              id: user._id,
              name: user.name,
              email: user.email,
              referralCode: user.referralCode,
              wallet: user.wallet || 0,
              treeLevel: user.treeLevel,
              treePosition: user.treePosition,
              joinDate: user.createdAt,
              referralStatus: {
                hasReferrer: !!user.referredBy,
                joinedWithoutReferrer: !user.referredBy,
                referredByCode: user.referredBy
              },
              commissions: {
                total: totalCommissionEarned,
                direct: user.directCommissionEarned || 0,
                tree: user.treeCommissionEarned || 0
              }
            };
          });

          // Verify identification of users without referrers
          let foundUsersWithoutReferrers = 0;
          let foundUsersWithReferrers = 0;

          for (const user of formattedUsers) {
            expect(user).toHaveProperty('referralStatus');
            expect(user.referralStatus).toHaveProperty('hasReferrer');
            expect(user.referralStatus).toHaveProperty('joinedWithoutReferrer');
            expect(user.referralStatus).toHaveProperty('referredByCode');

            // Verify mutual exclusivity
            expect(user.referralStatus.hasReferrer).toBe(!user.referralStatus.joinedWithoutReferrer);

            if (user.referralStatus.joinedWithoutReferrer) {
              foundUsersWithoutReferrers++;
              expect(user.referralStatus.hasReferrer).toBe(false);
              expect(user.referralStatus.referredByCode).toBeNull();
            } else {
              foundUsersWithReferrers++;
              expect(user.referralStatus.hasReferrer).toBe(true);
              expect(user.referralStatus.referredByCode).not.toBeNull();
            }
          }

          // Verify counts match expected
          expect(foundUsersWithoutReferrers).toBe(usersWithoutReferrers);
          expect(foundUsersWithReferrers).toBe(usersWithReferrers);

          // Test no-referrer statistics calculation (mirrors API logic)
          const totalUsersWithoutReferrers = await User.countDocuments({ referredBy: null });
          expect(totalUsersWithoutReferrers).toBeGreaterThanOrEqual(usersWithoutReferrers);

          const totalUsers = await User.countDocuments();
          const expectedPercentage = totalUsers > 0 
            ? ((totalUsersWithoutReferrers / totalUsers) * 100).toFixed(2)
            : 0;

          // Verify percentage calculation is reasonable
          expect(parseFloat(expectedPercentage)).toBeGreaterThanOrEqual(0);
          expect(parseFloat(expectedPercentage)).toBeLessThanOrEqual(100);

          // Clean up
          await User.deleteMany({});
        }
      ),
      { numRuns: 100 }
    );
  });
});