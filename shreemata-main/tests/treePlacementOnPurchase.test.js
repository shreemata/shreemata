const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const { checkAndActivateMembership } = require('../services/membershipService');
const { createTreePlacementOnFirstPurchase, findAvailableSpotInTree } = require('../services/treePlacement');
const auditUnqualifiedTreePositions = require('../scripts/auditUnqualifiedTreePositions');

describe('Tree Placement On Qualification By Purchase (New Business Rule)', () => {
  let adminUser;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shreemata_test_qualification';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Order.deleteMany({});

    // Create Root Admin User
    adminUser = await User.create({
      name: 'Root Admin',
      email: 'admin_test@shreemata.com',
      password: 'password123',
      role: 'admin',
      referralCode: 'ADMIN001',
      wallet: 0,
      firstPurchaseDone: true,
      isMember: true,
      treeParent: null,
      treeLevel: 1,
      treePosition: 0,
      treeChildren: []
    });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Order.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('1 & 2: Registration alone preserves referredBy but does NOT place user in physical tree', async () => {
    const userA = await User.create({
      name: 'User A',
      email: 'usera@example.com',
      password: 'password123',
      referralCode: 'USERA01',
      referredBy: 'ADMIN001',
      wallet: 0,
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null,
      treeChildren: []
    });

    expect(userA.referredBy).toBe('ADMIN001');
    expect(userA.isMember).toBe(false);
    expect(userA.firstPurchaseDone).toBe(false);
    expect(userA.treeParent).toBeNull();
    expect(userA.treeLevel).toBe(0);
    expect(userA.treePosition).toBeNull();
  });

  test('3 & 4: User B registers after User A, but B qualifies first -> B placed before A', async () => {
    // A registers at 10:00 AM
    const userA = await User.create({
      name: 'User A',
      email: 'usera_seq@example.com',
      password: 'password123',
      referralCode: 'USERA_SEQ',
      referredBy: 'ADMIN001',
      wallet: 0,
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null,
      createdAt: new Date(Date.now() - 10000)
    });

    // B registers at 11:00 AM
    const userB = await User.create({
      name: 'User B',
      email: 'userb_seq@example.com',
      password: 'password123',
      referralCode: 'USERB_SEQ',
      referredBy: 'ADMIN001',
      wallet: 0,
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null,
      createdAt: new Date(Date.now() - 5000)
    });

    // B buys a qualifying item (subtotal >= 100) first
    const orderB = await Order.create({
      user_id: userB._id,
      items: [{ id: 'b1', title: 'Book B', price: 150, quantity: 1 }],
      totalAmount: 150,
      status: 'completed',
      paymentStatus: 'completed'
    });

    const resB = await checkAndActivateMembership(orderB);
    expect(resB.activated).toBe(true);

    const updatedB = await User.findById(userB._id);
    expect(updatedB.isMember).toBe(true);
    expect(updatedB.treeLevel).toBe(2);
    expect(updatedB.treeParent.toString()).toBe(adminUser._id.toString());
    expect(updatedB.treePosition).toBe(0); // B gets position 0 under Root

    // A buys a qualifying item (subtotal >= 100) LATER
    const orderA = await Order.create({
      user_id: userA._id,
      items: [{ id: 'b2', title: 'Book A', price: 120, quantity: 1 }],
      totalAmount: 120,
      status: 'completed',
      paymentStatus: 'completed'
    });

    const resA = await checkAndActivateMembership(orderA);
    expect(resA.activated).toBe(true);

    const updatedA = await User.findById(userA._id);
    expect(updatedA.isMember).toBe(true);
    expect(updatedA.treeLevel).toBe(2);
    expect(updatedA.treeParent.toString()).toBe(adminUser._id.toString());
    expect(updatedA.treePosition).toBe(1); // A gets position 1 under Root
  });

  test('5: Order with product subtotal < ₹100 does NOT activate membership or place user in tree', async () => {
    const userLow = await User.create({
      name: 'User Low',
      email: 'userlow@example.com',
      password: 'password123',
      referralCode: 'USERLOW',
      referredBy: 'ADMIN001',
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null
    });

    const lowOrder = await Order.create({
      user_id: userLow._id,
      items: [{ id: 'b50', title: 'Small Book', price: 50, quantity: 1 }],
      totalAmount: 50,
      status: 'completed',
      paymentStatus: 'completed'
    });

    const res = await checkAndActivateMembership(lowOrder);
    expect(res.activated).toBe(false);
    expect(res.isMember).toBe(false);

    const checkUser = await User.findById(userLow._id);
    expect(checkUser.isMember).toBe(false);
    expect(checkUser.treeParent).toBeNull();
    expect(checkUser.treeLevel).toBe(0);
  });

  test('6: Pending/unpaid order with subtotal >= ₹100 does NOT place user in tree until payment is verified', async () => {
    const userPending = await User.create({
      name: 'User Pending',
      email: 'userpending@example.com',
      password: 'password123',
      referralCode: 'USERPEND',
      referredBy: 'ADMIN001',
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null
    });

    const pendingOrder = await Order.create({
      user_id: userPending._id,
      items: [{ id: 'b100', title: 'Book 100', price: 100, quantity: 1 }],
      totalAmount: 100,
      status: 'pending',
      paymentStatus: 'pending'
    });

    const resPending = await checkAndActivateMembership(pendingOrder);
    expect(resPending.activated).toBe(false);

    let checkUser = await User.findById(userPending._id);
    expect(checkUser.isMember).toBe(false);
    expect(checkUser.treeParent).toBeNull();

    // Now payment succeeds
    pendingOrder.status = 'completed';
    pendingOrder.paymentStatus = 'completed';
    await pendingOrder.save();

    const resVerified = await checkAndActivateMembership(pendingOrder);
    expect(resVerified.activated).toBe(true);

    checkUser = await User.findById(userPending._id);
    expect(checkUser.isMember).toBe(true);
    expect(checkUser.treeLevel).toBe(2);
  });

  test('8: Direct referral attribution remains independent from physical treeParent', async () => {
    // Referrer A qualifies first
    const refA = await User.create({
      name: 'Referrer A',
      email: 'refA@example.com',
      password: 'password123',
      referralCode: 'REFA01',
      firstPurchaseDone: true,
      isMember: true,
      treeParent: adminUser._id,
      treeLevel: 2,
      treePosition: 0
    });

    // Referee B registers with referredBy = REFA01
    const refB = await User.create({
      name: 'Referee B',
      email: 'refB@example.com',
      password: 'password123',
      referralCode: 'REFB01',
      referredBy: 'REFA01',
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null
    });

    // B qualifies
    const orderB = await Order.create({
      user_id: refB._id,
      items: [{ id: 'item1', title: 'Item 1', price: 200, quantity: 1 }],
      totalAmount: 200,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await checkAndActivateMembership(orderB);

    const updatedB = await User.findById(refB._id);
    expect(updatedB.referredBy).toBe('REFA01'); // Direct referral attribution preserved
    expect(updatedB.treeParent.toString()).toBe(adminUser._id.toString()); // Physical BFS tree slot under adminUser
    expect(updatedB.treePosition).toBe(1); // Position 1 under adminUser (since refA is at position 0)
  });

  test('9: Multi-user purchase order determines exact 5-wide BFS tree placement sequence', async () => {
    // Users 1 to 4 register
    const users = [];
    for (let i = 1; i <= 4; i++) {
      const u = await User.create({
        name: `User ${i}`,
        email: `u${i}@example.com`,
        password: 'password123',
        referralCode: `UCODE_${i}`,
        referredBy: 'ADMIN001',
        firstPurchaseDone: false,
        isMember: false,
        treeParent: null,
        treeLevel: 0,
        treePosition: null
      });
      users.push(u);
    }

    // Purchase sequence: User 3, User 1, User 4, User 2
    const purchaseSequence = [2, 0, 3, 1]; // 0-indexed into users array

    for (let pos = 0; pos < purchaseSequence.length; pos++) {
      const targetUser = users[purchaseSequence[pos]];
      const order = await Order.create({
        user_id: targetUser._id,
        items: [{ id: `item_${targetUser.name}`, title: `Title ${targetUser.name}`, price: 150, quantity: 1 }],
        totalAmount: 150,
        status: 'completed',
        paymentStatus: 'completed'
      });
      await checkAndActivateMembership(order);
    }

    // Verify placement positions under adminUser:
    // Position 0 -> User 3 (first to qualify)
    // Position 1 -> User 1 (second to qualify)
    // Position 2 -> User 4 (third to qualify)
    // Position 3 -> User 2 (fourth to qualify)
    const user3 = await User.findById(users[2]._id);
    const user1 = await User.findById(users[0]._id);
    const user4 = await User.findById(users[3]._id);
    const user2 = await User.findById(users[1]._id);

    expect(user3.treePosition).toBe(0);
    expect(user1.treePosition).toBe(1);
    expect(user4.treePosition).toBe(2);
    expect(user2.treePosition).toBe(3);
  });

  test('Repeat orders place user ONCE only and CANNOT reposition user', async () => {
    const userRepeat = await User.create({
      name: 'User Repeat',
      email: 'repeat@example.com',
      password: 'password123',
      referralCode: 'REPEAT01',
      referredBy: 'ADMIN001',
      firstPurchaseDone: false,
      isMember: false,
      treeParent: null,
      treeLevel: 0,
      treePosition: null
    });

    // Order 1 (First qualifying order)
    const order1 = await Order.create({
      user_id: userRepeat._id,
      items: [{ id: 'item1', title: 'First Purchase', price: 200, quantity: 1 }],
      totalAmount: 200,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await checkAndActivateMembership(order1);

    const placedUser = await User.findById(userRepeat._id);
    const initialParent = placedUser.treeParent.toString();
    const initialLevel = placedUser.treeLevel;
    const initialPosition = placedUser.treePosition;

    expect(placedUser.isMember).toBe(true);
    expect(initialLevel).toBeGreaterThan(0);
    expect(initialPosition).not.toBeNull();

    // Order 2 (Second purchase by same user)
    const order2 = await Order.create({
      user_id: userRepeat._id,
      items: [{ id: 'item2', title: 'Second Purchase', price: 500, quantity: 1 }],
      totalAmount: 500,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await checkAndActivateMembership(order2);

    const recheckedUser = await User.findById(userRepeat._id);
    expect(recheckedUser.treeParent.toString()).toBe(initialParent);
    expect(recheckedUser.treeLevel).toBe(initialLevel);
    expect(recheckedUser.treePosition).toBe(initialPosition);
  });

  test('13: Audit script runs without mutating records', async () => {
    // Create an unqualified user who mistakenly has treeParent set (legacy mock)
    await User.create({
      name: 'Legacy Unqualified User',
      email: 'legacy@example.com',
      password: 'password123',
      referralCode: 'LEGACY1',
      firstPurchaseDone: false,
      isMember: false,
      treeParent: adminUser._id,
      treeLevel: 2,
      treePosition: 4
    });

    const report = await auditUnqualifiedTreePositions();

    expect(report.count).toBe(1);
    expect(report.users[0].email).toBe('legacy@example.com');

    // Confirm non-mutation: document in DB was NOT changed by audit script
    const checkDbUser = await User.findOne({ email: 'legacy@example.com' });
    expect(checkDbUser.treePosition).toBe(4);
    expect(checkDbUser.isMember).toBe(false);
  });
});
