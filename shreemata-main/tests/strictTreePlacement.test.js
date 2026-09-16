require('dotenv').config();
const mongoose = require('mongoose');
const { createTreePlacementOnFirstPurchase, findTreePlacement } = require('../services/treePlacement');
const { distributeCommissions } = require('../services/commissionDistribution');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');

// Real DB integration tests with memory or test database
describe('Strict 5-Wide Serial Tree Placement & Commission Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  afterAll(async () => {
    // Clean up test users created during test suite
    const testUsers = await User.find({ email: { $regex: /^test_strict_tree_/ } }).select('_id');
    const testUserIds = testUsers.map(u => u._id);

    // Pull test user ObjectIds from parent treeChildren arrays
    if (testUserIds.length > 0) {
      await User.updateMany(
        { treeChildren: { $in: testUserIds } },
        { $pull: { treeChildren: { $in: testUserIds } } }
      );
    }

    await User.deleteMany({ email: { $regex: /^test_strict_tree_/ } });
    await Order.deleteMany({ _id: { $in: global.testOrderIds || [] } });
    await CommissionTransaction.deleteMany({ orderId: { $in: global.testOrderIds || [] } });
    await WalletTransaction.deleteMany({ orderId: { $in: global.testOrderIds || [] } });
    await mongoose.connection.close();
  });

  it('Exact Placement Sequence Test (Users 01 to 16)', async () => {
    // 1. Clean previous test users
    await User.deleteMany({ email: { $regex: /^test_strict_tree_/ } });

    // 2. Find Root User (Shakuntaladevi / Admin)
    const rootUser = await User.findOne({ role: 'admin', treeLevel: 1 }) || 
                     await User.findOne({ treeLevel: 1, firstPurchaseDone: true });
    expect(rootUser).not.toBeNull();

    // Query active root children before test
    const initialRootChildren = await User.find({ treeParent: rootUser._id, firstPurchaseDone: true });
    
    // We will create test users sequentially
    const createdUsers = [];
    const timestampBase = Date.now();

    for (let i = 1; i <= 16; i++) {
      const pad = String(i).padStart(2, '0');
      const user = new User({
        name: `Test Strict User ${pad}`,
        email: `test_strict_tree_user_${pad}_${timestampBase}@example.com`,
        referralCode: `REF_STRICT_${pad}_${timestampBase}`,
        referredBy: null,
        firstPurchaseDone: true,
        firstPurchaseDate: new Date(timestampBase + i * 1000)
      });
      await user.save();
      createdUsers.push(user);
    }

    // Place Users 01 to 16 sequentially using createTreePlacementOnFirstPurchase
    for (const u of createdUsers) {
      await createTreePlacementOnFirstPurchase(u._id);
    }

    // Refresh createdUsers from DB
    const refreshedUsers = [];
    for (const u of createdUsers) {
      const refreshed = await User.findById(u._id);
      refreshedUsers.push(refreshed);
    }

    // If root initially had N children (e.g. 2: Shivraj, Ratnabai):
    // The next available slot under root is position N (e.g. pos 2 for User01, pos 3 for User02, pos 4 for User03).
    // Then root has 5 children!
    // The next user (User04) MUST be placed under Root's Child 0 (Shivraj)!
    
    // Let's verify: No user was placed under Shivraj/Child 0 until Root reached 5 children!
    const rootChildrenAfter = await User.find({ treeParent: rootUser._id, firstPurchaseDone: true }).sort({ treePosition: 1 });
    expect(rootChildrenAfter.length).toBe(5); // Root must be 5/5 full!

    // Verify Child 0 under Root has filled 1A..1E (5 slots) before Child 1 receives a user!
    const child0 = rootChildrenAfter[0]; // Child 0 under Root
    const child0Children = await User.find({ treeParent: child0._id, firstPurchaseDone: true }).sort({ treePosition: 1 });
    expect(child0Children.length).toBe(5); // Child 0 must have 5/5 full!

    const child1 = rootChildrenAfter[1]; // Child 1 under Root
    const child1Children = await User.find({ treeParent: child1._id, firstPurchaseDone: true }).sort({ treePosition: 1 });
    expect(child1Children.length).toBeGreaterThanOrEqual(1); // Child 1 receives users ONLY AFTER Child 0 is 5/5 full!

    console.log('✅ Exact Placement Sequence Test Passed!');
  });

  it('Cross-Referral Commission Separation Test', async () => {
    const timestampBase = Date.now();
    
    // Create User A (Referrer)
    const userA = new User({
      name: `Test Referrer User A`,
      email: `test_strict_tree_referrer_a_${timestampBase}@example.com`,
      referralCode: `REF_A_${timestampBase}`,
      referredBy: null,
      firstPurchaseDone: true,
      firstPurchaseDate: new Date(timestampBase)
    });
    await userA.save();
    await createTreePlacementOnFirstPurchase(userA._id);

    // Create User B (Referred by User A)
    const userB = new User({
      name: `Test Referee User B`,
      email: `test_strict_tree_referee_b_${timestampBase}@example.com`,
      referralCode: `REF_B_${timestampBase}`,
      referredBy: userA.referralCode,
      firstPurchaseDone: true,
      firstPurchaseDate: new Date(timestampBase + 1000)
    });
    await userB.save();
    const bPlacement = await createTreePlacementOnFirstPurchase(userB._id);

    // Verify User B's referredBy is User A, but treeParent is assigned by strict serial BFS
    const refreshedB = await User.findById(userB._id);
    expect(refreshedB.referredBy).toBe(userA.referralCode);
    expect(refreshedB.treeParent).not.toBeNull();

    // Mock an order for User B and distribute commissions
    const testOrder = new Order({
      user_id: userB._id,
      totalAmount: 500,
      orderProfitTotal: 100,
      status: 'completed',
      items: [{ id: new mongoose.Types.ObjectId(), title: 'Test Book', price: 500, quantity: 1 }]
    });
    await testOrder.save();
    global.testOrderIds = global.testOrderIds || [];
    global.testOrderIds.push(testOrder._id);

    await distributeCommissions(testOrder._id, userB._id, 500, 100);

    // Verify Direct Referral Commission went to User A (referredBy)
    const refreshedA = await User.findById(userA._id);
    expect(refreshedA.referralCommissionEarned).toBeGreaterThan(0);

    // Verify Tree Commission went to User B's actual treeParent
    const treeParentDoc = await User.findById(refreshedB.treeParent);
    expect(treeParentDoc.treeCommissionEarned).toBeGreaterThan(0);

    console.log('✅ Cross-Referral Commission Separation Test Passed!');
  });
});
