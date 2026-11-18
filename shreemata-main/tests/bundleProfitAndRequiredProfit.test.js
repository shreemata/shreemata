/** @jest-environment node */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const ProfitAuditLog = require('../models/ProfitAuditLog');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const TrustFund = require('../models/TrustFund');

const booksRouter = require('../routes/books');
const bundlesRouter = require('../routes/bundles');
const { finalizePaidOrder } = require('../services/orderFinalizer');
const { buildOrderProfitSnapshot, calculateProductUnitProfit } = require('../services/orderProfit');
const { isOrderEligibleForCommission } = require('../services/commissionDistribution');

let mongoServer;
let app;
let server;
let baseUrl;

let adminUser;
let nonAdminUser;
let referrerUser;
let rootUser;
let buyerUser;

let adminToken;
let nonAdminToken;
let buyerToken;

const JWT_SECRET = 'test_secret_profit_required_xyz_123';

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/books', booksRouter);
  app.use('/api/bundles', bundlesRouter);

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Create Users
  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@shreemata.com',
    password: 'password123',
    role: 'admin',
    phone: '9999999990'
  });
  adminToken = jwt.sign({ id: adminUser._id, role: 'admin', email: adminUser.email }, JWT_SECRET);

  nonAdminUser = await User.create({
    name: 'Normal User',
    email: 'normal@shreemata.com',
    password: 'password123',
    role: 'user',
    phone: '9999999991'
  });
  nonAdminToken = jwt.sign({ id: nonAdminUser._id, role: 'user', email: nonAdminUser.email }, JWT_SECRET);

  rootUser = await User.create({
    name: 'Root Member',
    email: 'root@shreemata.com',
    password: 'password123',
    role: 'user',
    phone: '9999999992',
    referralCode: 'ROOT_CODE_1',
    isMember: true,
    treeLevel: 1,
    treePlacement: { level: 1, position: 'root' }
  });

  referrerUser = await User.create({
    name: 'Referrer Member',
    email: 'referrer@shreemata.com',
    password: 'password123',
    role: 'user',
    phone: '9999999993',
    referralCode: 'REF_CODE_2',
    referredBy: 'ROOT_CODE_1',
    treeParent: rootUser._id,
    treeLevel: 2,
    treePlacement: { parentId: rootUser._id, level: 2 }
  });

  buyerUser = await User.create({
    name: 'Buyer Member',
    email: 'buyer@shreemata.com',
    password: 'password123',
    role: 'user',
    phone: '9999999994',
    referralCode: 'BUYER_CODE_3',
    referredBy: 'REF_CODE_2',
    treeParent: referrerUser._id,
    treeLevel: 3,
    treePlacement: { parentId: referrerUser._id, level: 3 }
  });
  buyerToken = jwt.sign({ id: buyerUser._id, role: 'user', email: buyerUser.email }, JWT_SECRET);

  // Initialize CommissionSettings
  await CommissionSettings.deleteMany({});
  await CommissionSettings.create({
    directCommissionPercent: 30,
    referralCommissionPercent: 20,
    treeCommissionPoolPercent: 40,
    trustFundPercent: 10,
    adminCommissionPercent: 0,
    payoutHoldingPeriodDays: 0,
    isActive: true
  });
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Profit Requirement on Books and Bundles (Sets)', () => {
  test('POST /api/books rejects new book without profit and without zeroCommission checkbox', async () => {
    try {
      await axios.post(`${baseUrl}/api/books`, {
        title: 'Profitless Book',
        author: 'Author A',
        price: 250,
        cover_image: 'http://example.com/cover.jpg'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected request to fail with 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('Profit is required for new books');
    }
  });

  test('POST /api/books rejects negative profit or profit exceeding selling price', async () => {
    // Negative profit
    try {
      await axios.post(`${baseUrl}/api/books`, {
        title: 'Negative Profit Book',
        author: 'Author A',
        price: 200,
        profitType: 'fixed',
        profitValue: -10,
        cover_image: 'http://example.com/cover.jpg'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected request to fail with 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('non-negative number');
    }

    // Profit > Price
    try {
      await axios.post(`${baseUrl}/api/books`, {
        title: 'Exorbitant Profit Book',
        author: 'Author A',
        price: 150,
        profitType: 'fixed',
        profitValue: 200,
        cover_image: 'http://example.com/cover.jpg'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected request to fail with 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('cannot exceed the eligible selling price');
    }
  });

  test('POST /api/books allows new book with zeroCommission: true', async () => {
    const res = await axios.post(`${baseUrl}/api/books`, {
      title: 'Zero Commission Book',
      author: 'Author A',
      price: 150,
      zeroCommission: true,
      cover_image: 'http://example.com/cover.jpg'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(201);
    expect(res.data.book.profitValue).toBe(0);
    expect(res.data.book.profitConfigured).toBe(true);
  });

  test('POST /api/bundles/admin/create rejects new bundle without profit and without zeroCommission checkbox', async () => {
    const book1 = await Book.create({
      title: 'Book 1',
      author: 'Author 1',
      price: 100,
      profitType: 'fixed',
      profitValue: 10,
      profitConfigured: true,
      cover_image: 'http://example.com/1.jpg'
    });

    try {
      await axios.post(`${baseUrl}/api/bundles/admin/create`, {
        name: 'No Profit Bundle',
        description: 'Test bundle',
        bookIds: [book1._id],
        bundlePrice: 90
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected request to fail with 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('Profit is required for new sets');
    }
  });

  test('POST /api/bundles/admin/create rejects negative profit, fixed > bundlePrice, percentage > 100', async () => {
    const book1 = await Book.create({
      title: 'Book 1b',
      author: 'Author 1',
      price: 100,
      profitType: 'fixed',
      profitValue: 10,
      profitConfigured: true,
      cover_image: 'http://example.com/1.jpg'
    });

    // Negative
    try {
      await axios.post(`${baseUrl}/api/bundles/admin/create`, {
        name: 'Negative Profit Bundle',
        bookIds: [book1._id],
        bundlePrice: 100,
        profitValue: -5
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('non-negative number');
    }

    // Fixed > Price
    try {
      await axios.post(`${baseUrl}/api/bundles/admin/create`, {
        name: 'Over Profit Bundle',
        bookIds: [book1._id],
        bundlePrice: 100,
        profitType: 'fixed',
        profitValue: 150
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('cannot exceed the eligible selling price');
    }

    // Percentage > 100
    try {
      await axios.post(`${baseUrl}/api/bundles/admin/create`, {
        name: 'Over 100 Percent Bundle',
        bookIds: [book1._id],
        bundlePrice: 100,
        profitType: 'percentage',
        profitValue: 120
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('between 0 and 100');
    }
  });

  test('POST /api/bundles/admin/create allows bundle with zeroCommission: true', async () => {
    const book1 = await Book.create({
      title: 'Book 1c',
      author: 'Author 1',
      price: 100,
      profitType: 'fixed',
      profitValue: 10,
      profitConfigured: true,
      cover_image: 'http://example.com/1.jpg'
    });

    const res = await axios.post(`${baseUrl}/api/bundles/admin/create`, {
      name: 'Zero Commission Bundle',
      bookIds: [book1._id],
      bundlePrice: 90,
      zeroCommission: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.bundle.profitValue).toBe(0);
    expect(res.data.bundle.profitConfigured).toBe(true);
  });
});

describe('Quick Set Profit Endpoints & ProfitAuditLog', () => {
  let testBook;
  let testBundle;

  beforeAll(async () => {
    testBook = await Book.create({
      title: 'Quick Set Book',
      author: 'Author QS',
      price: 300,
      profitType: 'fixed',
      profitValue: 20,
      profitConfigured: true,
      cover_image: 'http://example.com/qs.jpg'
    });

    testBundle = await Bundle.create({
      name: 'Quick Set Bundle',
      originalPrice: 450,
      bundlePrice: 400,
      books: [testBook._id],
      profitType: 'fixed',
      profitValue: 30,
      profitConfigured: true
    });
  });

  test('PATCH /api/books/admin/:id/profit security checks (401 without auth, 403 for user)', async () => {
    // 401
    try {
      await axios.patch(`${baseUrl}/api/books/admin/${testBook._id}/profit`, { profitValue: 25 });
      throw new Error('Expected 401');
    } catch (err) {
      expect(err.response.status).toBe(401);
    }

    // 403
    try {
      await axios.patch(`${baseUrl}/api/books/admin/${testBook._id}/profit`, { profitValue: 25 }, {
        headers: { Authorization: `Bearer ${nonAdminToken}` }
      });
      throw new Error('Expected 403');
    } catch (err) {
      expect(err.response.status).toBe(403);
    }
  });

  test('PATCH /api/books/admin/:id/profit updates profit and creates ProfitAuditLog', async () => {
    const res = await axios.patch(`${baseUrl}/api/books/admin/${testBook._id}/profit`, {
      profitType: 'fixed',
      profitValue: 45,
      changeReason: 'Admin quick update test'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.book.profitValue).toBe(45);
    expect(res.data.auditLog).toBeDefined();
    expect(res.data.auditLog.oldProfitValue).toBe(20);
    expect(res.data.auditLog.newProfitValue).toBe(45);
    expect(res.data.auditLog.itemType).toBe('book');

    // Verify in DB
    const updated = await Book.findById(testBook._id);
    expect(updated.profitValue).toBe(45);

    // Verify audit log history endpoint
    const historyRes = await axios.get(`${baseUrl}/api/books/admin/${testBook._id}/profit-history`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(historyRes.status).toBe(200);
    expect(historyRes.data.history.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.data.history[0].newProfitValue).toBe(45);
    expect(historyRes.data.history[0].adminEmail).toBe(adminUser.email);
  });

  test('PATCH /api/bundles/admin/:id/profit updates profit and creates ProfitAuditLog', async () => {
    const res = await axios.patch(`${baseUrl}/api/bundles/admin/${testBundle._id}/profit`, {
      profitType: 'percentage',
      profitValue: 15,
      changeReason: 'Switch bundle to percentage'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.bundle.profitType).toBe('percentage');
    expect(res.data.bundle.profitValue).toBe(15);
    expect(res.data.auditLog).toBeDefined();
    expect(res.data.auditLog.oldProfitValue).toBe(30);
    expect(res.data.auditLog.newProfitValue).toBe(15);
    expect(res.data.auditLog.itemType).toBe('bundle');

    // Verify history endpoint
    const historyRes = await axios.get(`${baseUrl}/api/bundles/admin/${testBundle._id}/profit-history`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(historyRes.status).toBe(200);
    expect(historyRes.data.history.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.data.history[0].newProfitType).toBe('percentage');
    expect(historyRes.data.history[0].newProfitValue).toBe(15);
  });
});

describe('End-to-End Bundle Orders, Profit Snapshots & Commission Splits', () => {
  let bookA;
  let bookB;
  let bundleFixed20;
  let bundlePercent10;
  let bundleZero;

  beforeAll(async () => {
    bookA = await Book.create({
      title: 'Set Book Alpha',
      author: 'Author Alpha',
      price: 120,
      profitType: 'fixed',
      profitValue: 10,
      profitConfigured: true,
      cover_image: 'http://example.com/alpha.jpg'
    });

    bookB = await Book.create({
      title: 'Set Book Beta',
      author: 'Author Beta',
      price: 100,
      profitType: 'fixed',
      profitValue: 10,
      profitConfigured: true,
      cover_image: 'http://example.com/beta.jpg'
    });

    // Bundle Price = 200 (original = 220)
    bundleFixed20 = await Bundle.create({
      name: 'Fixed 20 Profit Bundle',
      description: 'Bundle with fixed profit 20',
      books: [bookA._id, bookB._id],
      bundlePrice: 200,
      originalPrice: 220,
      profitType: 'fixed',
      profitValue: 20,
      profitConfigured: true
    });

    bundlePercent10 = await Bundle.create({
      name: 'Percent 10 Profit Bundle',
      description: 'Bundle with percentage profit 10%',
      books: [bookA._id, bookB._id],
      bundlePrice: 200,
      originalPrice: 220,
      profitType: 'percentage',
      profitValue: 10, // 10% of 200 = 20
      profitConfigured: true
    });

    bundleZero = await Bundle.create({
      name: 'Zero Profit Bundle',
      description: 'Bundle sold without commission',
      books: [bookA._id, bookB._id],
      bundlePrice: 180,
      originalPrice: 220,
      profitType: 'fixed',
      profitValue: 0,
      profitConfigured: true
    });
  });

  test('Case 1: Bundle order with Fixed Profit ₹20, Quantity 1', async () => {
    // 1. Create Order
    const rawItems = [
      {
        id: bundleFixed20._id,
        title: bundleFixed20.name,
        price: 200,
        quantity: 1,
        type: 'bundle'
      }
    ];

    const snapshotItems = await buildOrderProfitSnapshot(rawItems);
    expect(snapshotItems[0].unitProfitSnapshot).toBe(20);
    expect(snapshotItems[0].lineProfitSnapshot).toBe(20);

    const orderProfitTotal = snapshotItems.reduce((sum, it) => sum + (it.lineProfitSnapshot || 0), 0);
    expect(orderProfitTotal).toBe(20);

    const order = await Order.create({
      user_id: buyerUser._id,
      items: snapshotItems,
      total_amount: 200,
      orderProfitTotal,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      deliveryAddress: {
        fullName: 'Buyer User',
        phone: '9999999994',
        addressLine: '123 Test Street',
        city: 'Hubballi',
        postalCode: '580020',
        state: 'Karnataka'
      }
    });

    // 2. Finalize Order
    const result = await finalizePaidOrder(order._id, {
      paymentId: 'pay_test_bundle_fixed20_1',
      status: 'verified'
    });

    expect(result.success).toBe(true);

    // 3. Verify CommissionTransaction
    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx).toBeDefined();
    expect(commTx.status).toBe('completed');
    expect(commTx.profitAmount).toBe(20);

    // Split rules on profit 20:
    // Buyer cashback: 30% of 20 = 6
    // Direct referral: 20% of 20 = 4
    // Tree pool: 40% of 20 = 8
    // Trust fund: 10% of 20 = 2
    expect(commTx.directCommissionAmount).toBe(6);
    expect(commTx.referralCommissionAmount).toBe(4);
    expect(commTx.treePoolTotal).toBe(8);
    expect(commTx.trustFundAmount).toBe(2);

    // 4. Verify WalletTransaction records
    const walletTxs = await WalletTransaction.find({ orderId: order._id });
    const buyerWalletTx = walletTxs.find(tx => tx.userId?.toString() === buyerUser._id.toString() && tx.category === 'direct_commission');
    const referrerWalletTx = walletTxs.find(tx => tx.userId?.toString() === referrerUser._id.toString() && tx.category === 'referral_commission');

    expect(buyerWalletTx).toBeDefined();
    expect(buyerWalletTx.amount).toBe(6);

    expect(referrerWalletTx).toBeDefined();
    expect(referrerWalletTx.amount).toBe(4);

    const treeWalletTxs = walletTxs.filter(tx => tx.category === 'tree_commission');
    const treeTotal = treeWalletTxs.reduce((sum, tx) => sum + tx.amount, 0);
    expect(treeTotal).toBe(8);
  });

  test('Case 2: Bundle order with Fixed Profit ₹20, Quantity 2 (orderProfitTotal = 40)', async () => {
    const rawItems = [
      {
        id: bundleFixed20._id,
        title: bundleFixed20.name,
        price: 200,
        quantity: 2,
        type: 'bundle'
      }
    ];

    const snapshotItems = await buildOrderProfitSnapshot(rawItems);
    expect(snapshotItems[0].unitProfitSnapshot).toBe(20);
    expect(snapshotItems[0].lineProfitSnapshot).toBe(40);

    const orderProfitTotal = snapshotItems.reduce((sum, it) => sum + (it.lineProfitSnapshot || 0), 0);
    expect(orderProfitTotal).toBe(40);

    const order = await Order.create({
      user_id: buyerUser._id,
      items: snapshotItems,
      total_amount: 400,
      orderProfitTotal,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      deliveryAddress: {
        fullName: 'Buyer User',
        phone: '9999999994',
        addressLine: '123 Test Street',
        city: 'Hubballi',
        postalCode: '580020',
        state: 'Karnataka'
      }
    });

    const result = await finalizePaidOrder(order._id, {
      paymentId: 'pay_test_bundle_fixed20_qty2',
      status: 'verified'
    });

    expect(result.success).toBe(true);

    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx).toBeDefined();
    expect(commTx.profitAmount).toBe(40);

    // Profit 40:
    // Buyer cashback: 30% of 40 = 12
    // Direct referral: 20% of 40 = 8
    // Tree pool: 40% of 40 = 16
    // Trust fund: 10% of 40 = 4
    expect(commTx.directCommissionAmount).toBe(12);
    expect(commTx.referralCommissionAmount).toBe(8);
    expect(commTx.treePoolTotal).toBe(16);
    expect(commTx.trustFundAmount).toBe(4);

    const walletTxs = await WalletTransaction.find({ orderId: order._id });
    const buyerWalletTx = walletTxs.find(tx => tx.userId?.toString() === buyerUser._id.toString() && tx.category === 'direct_commission');
    const referrerWalletTx = walletTxs.find(tx => tx.userId?.toString() === referrerUser._id.toString() && tx.category === 'referral_commission');

    expect(buyerWalletTx.amount).toBe(12);
    expect(referrerWalletTx.amount).toBe(8);
  });

  test('Case 3: Bundle order with Percentage Profit (10% of ₹200 = ₹20 per unit)', async () => {
    const rawItems = [
      {
        id: bundlePercent10._id,
        title: bundlePercent10.name,
        price: 200,
        quantity: 1,
        type: 'bundle'
      }
    ];

    const snapshotItems = await buildOrderProfitSnapshot(rawItems);
    expect(snapshotItems[0].profitTypeSnapshot).toBe('percentage');
    expect(snapshotItems[0].profitValueSnapshot).toBe(10);
    expect(snapshotItems[0].unitProfitSnapshot).toBe(20);
    expect(snapshotItems[0].lineProfitSnapshot).toBe(20);

    const orderProfitTotal = snapshotItems.reduce((sum, it) => sum + (it.lineProfitSnapshot || 0), 0);
    expect(orderProfitTotal).toBe(20);

    const order = await Order.create({
      user_id: buyerUser._id,
      items: snapshotItems,
      total_amount: 200,
      orderProfitTotal,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      deliveryAddress: {
        fullName: 'Buyer User',
        phone: '9999999994',
        addressLine: '123 Test Street',
        city: 'Hubballi',
        postalCode: '580020',
        state: 'Karnataka'
      }
    });

    const result = await finalizePaidOrder(order._id, {
      paymentId: 'pay_test_bundle_pct10',
      status: 'verified'
    });

    expect(result.success).toBe(true);

    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx.directCommissionAmount).toBe(6);
    expect(commTx.referralCommissionAmount).toBe(4);
    expect(commTx.treePoolTotal).toBe(8);
    expect(commTx.trustFundAmount).toBe(2);
  });

  test('Case 4: Bundle order with Profit ₹0 (Sell without commission)', async () => {
    const rawItems = [
      {
        id: bundleZero._id,
        title: bundleZero.name,
        price: 180,
        quantity: 1,
        type: 'bundle'
      }
    ];

    const snapshotItems = await buildOrderProfitSnapshot(rawItems);
    expect(snapshotItems[0].unitProfitSnapshot).toBe(0);
    expect(snapshotItems[0].lineProfitSnapshot).toBe(0);

    const orderProfitTotal = snapshotItems.reduce((sum, it) => sum + (it.lineProfitSnapshot || 0), 0);
    expect(orderProfitTotal).toBe(0);

    const order = await Order.create({
      user_id: buyerUser._id,
      items: snapshotItems,
      total_amount: 180,
      orderProfitTotal: 0,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      deliveryAddress: {
        fullName: 'Buyer User',
        phone: '9999999994',
        addressLine: '123 Test Street',
        city: 'Hubballi',
        postalCode: '580020',
        state: 'Karnataka'
      }
    });

    const result = await finalizePaidOrder(order._id, {
      paymentId: 'pay_test_bundle_zero_profit',
      status: 'verified'
    });

    expect(result.success).toBe(true);

    // Verify NO commission transactions were generated
    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx).toBeNull();

    const walletTxs = await WalletTransaction.find({ orderId: order._id });
    expect(walletTxs.length).toBe(0);

    // Direct check of isOrderEligibleForCommission
    const completedOrder = await Order.findById(order._id);
    const eligibility = await isOrderEligibleForCommission(completedOrder);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('Order profit is ₹0');
  });

  test('Case 5: Profit changed after order placement does not alter existing order snapshots or commissions', async () => {
    // 1. Place Order with fixed profit ₹20
    const rawItems = [
      {
        id: bundleFixed20._id,
        title: bundleFixed20.name,
        price: 200,
        quantity: 1,
        type: 'bundle'
      }
    ];

    const snapshotItems = await buildOrderProfitSnapshot(rawItems);
    const order = await Order.create({
      user_id: buyerUser._id,
      items: snapshotItems,
      total_amount: 200,
      orderProfitTotal: 20,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'online',
      deliveryAddress: {
        fullName: 'Buyer User',
        phone: '9999999994',
        addressLine: '123 Test Street',
        city: 'Hubballi',
        postalCode: '580020',
        state: 'Karnataka'
      }
    });

    await finalizePaidOrder(order._id, {
      paymentId: 'pay_immutable_snapshot_test',
      status: 'verified'
    });

    // 2. Admin modifies bundle profit to ₹50
    const patchRes = await axios.patch(`${baseUrl}/api/bundles/admin/${bundleFixed20._id}/profit`, {
      profitType: 'fixed',
      profitValue: 50,
      changeReason: 'Increase profit for future orders'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(patchRes.status).toBe(200);

    // 3. Verify existing order retains original snapshots
    const existingOrder = await Order.findById(order._id);
    expect(existingOrder.orderProfitTotal).toBe(20);
    expect(existingOrder.items[0].unitProfitSnapshot).toBe(20);
    expect(existingOrder.items[0].lineProfitSnapshot).toBe(20);

    // 4. Verify existing commission transactions remain ₹6, ₹4, ₹8, ₹2
    const commTx = await CommissionTransaction.findOne({ orderId: order._id });
    expect(commTx.directCommissionAmount).toBe(6);
    expect(commTx.referralCommissionAmount).toBe(4);
    expect(commTx.treePoolTotal).toBe(8);
    expect(commTx.trustFundAmount).toBe(2);

    // 5. Verify a NEW order places with the new profit ₹50
    const newRawItems = [
      {
        id: bundleFixed20._id,
        title: bundleFixed20.name,
        price: 200,
        quantity: 1,
        type: 'bundle'
      }
    ];
    const newSnapshot = await buildOrderProfitSnapshot(newRawItems);
    expect(newSnapshot[0].unitProfitSnapshot).toBe(50);
    expect(newSnapshot[0].lineProfitSnapshot).toBe(50);
  });

  describe('Edit Payload Data Integrity & Profit Validation on Edit', () => {
    let editTestBook;
    let editTestBundle;

    beforeAll(async () => {
      editTestBook = await Book.create({
        title: 'Original Edit Book',
        author: 'Author Edit',
        price: 200,
        physicalPrice: 200,
        sellingPrice: 200,
        discountEnabled: false,
        discountType: 'flat',
        discountValue: 0,
        rewardPoints: 10,
        cashbackAmount: 5,
        cashbackPercentage: 2,
        profitType: 'fixed',
        profitValue: 30,
        profitConfigured: true
      });

      const subBook = await Book.create({
        title: 'Sub Book for Bundle Edit',
        author: 'Author Sub',
        price: 150,
        physicalPrice: 150,
        sellingPrice: 150,
        profitType: 'fixed',
        profitValue: 20,
        profitConfigured: true
      });

      editTestBundle = await Bundle.create({
        name: 'Original Edit Bundle',
        description: 'Original description',
        books: [subBook._id],
        originalPrice: 150,
        bundlePrice: 120,
        rewardPoints: 10,
        cashbackAmount: 5,
        cashbackPercentage: 2,
        profitType: 'fixed',
        profitValue: 25,
        profitConfigured: true,
        isActive: true
      });
    });

    test('Bundle Edit: saving bundle edit form payload preserves rewardPoints 10, cashbackAmount 5, cashbackPercentage 2', async () => {
      const payload = {
        name: 'Updated Edit Bundle',
        description: 'Updated bundle description',
        bundlePrice: 120,
        rewardPoints: 10,
        cashbackAmount: 5,
        cashbackPercentage: 2,
        profitType: 'fixed',
        profitValue: 35,
        profitConfigured: true
      };

      const res = await axios.put(`${baseUrl}/api/bundles/admin/update/${editTestBundle._id}`, payload, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);

      const updated = await Bundle.findById(editTestBundle._id);
      expect(updated.rewardPoints).toBe(10);
      expect(updated.cashbackAmount).toBe(5);
      expect(updated.cashbackPercentage).toBe(2);
      expect(updated.profitValue).toBe(35);
      expect(typeof updated.profitValue).toBe('number');
    });

    test('Book Edit: saving book edit form payload preserves rewardPoints, cashback, and discount fields', async () => {
      const payload = {
        title: 'Updated Edit Book',
        author: 'Author Edit',
        physicalPrice: 200,
        discountEnabled: true,
        discountType: 'percentage',
        discountValue: 15,
        rewardPoints: 10,
        cashbackAmount: 5,
        cashbackPercentage: 0,
        profitType: 'fixed',
        profitValue: 40,
        profitConfigured: true
      };

      const res = await axios.put(`${baseUrl}/api/books/${editTestBook._id}`, payload, {
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
      });
      expect(res.status).toBe(200);

      const updated = await Book.findById(editTestBook._id);
      expect(updated.rewardPoints).toBe(10);
      expect(updated.cashbackAmount).toBe(5);
      expect(updated.discountEnabled).toBe(true);
      expect(updated.discountType).toBe('percentage');
      expect(updated.discountValue).toBe(15);
      expect(updated.sellingPrice).toBe(170);
      expect(updated.profitValue).toBe(40);
      expect(typeof updated.profitValue).toBe('number');
    });

    test('Book Edit: saving book with cashbackPercentage preserves rewardPoints and cashbackPercentage', async () => {
      const payload = {
        title: 'Updated Edit Book CB Pct',
        physicalPrice: 200,
        discountEnabled: false,
        discountValue: 0,
        rewardPoints: 15,
        cashbackAmount: 0,
        cashbackPercentage: 2,
        profitType: 'percentage',
        profitValue: 20,
        profitConfigured: true
      };

      const res = await axios.put(`${baseUrl}/api/books/${editTestBook._id}`, payload, {
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
      });
      expect(res.status).toBe(200);

      const updated = await Book.findById(editTestBook._id);
      expect(updated.rewardPoints).toBe(15);
      expect(updated.cashbackAmount).toBe(0);
      expect(updated.cashbackPercentage).toBe(2);
      expect(updated.profitType).toBe('percentage');
      expect(updated.profitValue).toBe(20);
      expect(typeof updated.profitValue).toBe('number');
    });

    test('Bundle Edit Validation: rejects invalid profit edit (negative, fixed > price, percentage > 100) with 400 and preserves old value', async () => {
      const currentBundle = await Bundle.findById(editTestBundle._id);
      const originalProfitValue = currentBundle.profitValue;

      // 1. Negative profit
      try {
        await axios.put(`${baseUrl}/api/bundles/admin/update/${editTestBundle._id}`, {
          profitType: 'fixed',
          profitValue: -15
        }, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        throw new Error('Expected negative profit to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('non-negative number');
      }

      // 2. Fixed profit > bundlePrice (bundlePrice is 120)
      try {
        await axios.put(`${baseUrl}/api/bundles/admin/update/${editTestBundle._id}`, {
          profitType: 'fixed',
          profitValue: 150
        }, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        throw new Error('Expected fixed profit > bundlePrice to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('cannot exceed');
      }

      // 3. Percentage profit > 100
      try {
        await axios.put(`${baseUrl}/api/bundles/admin/update/${editTestBundle._id}`, {
          profitType: 'percentage',
          profitValue: 125
        }, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        throw new Error('Expected percentage profit > 100 to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('between 0 and 100');
      }

      // Verify DB value was untouched
      const afterFailedAttempts = await Bundle.findById(editTestBundle._id);
      expect(afterFailedAttempts.profitValue).toBe(originalProfitValue);
    });

    test('Book Edit Validation: rejects invalid profit edit (negative, fixed > price, percentage > 100) with 400 and preserves old value', async () => {
      const currentBook = await Book.findById(editTestBook._id);
      const originalProfitValue = currentBook.profitValue;

      // 1. Negative profit
      try {
        await axios.put(`${baseUrl}/api/books/${editTestBook._id}`, {
          profitType: 'fixed',
          profitValue: -25
        }, {
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
        });
        throw new Error('Expected negative profit to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('non-negative number');
      }

      // 2. Fixed profit > sellingPrice (sellingPrice is 200)
      try {
        await axios.put(`${baseUrl}/api/books/${editTestBook._id}`, {
          profitType: 'fixed',
          profitValue: 300
        }, {
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
        });
        throw new Error('Expected fixed profit > price to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('cannot exceed');
      }

      // 3. Percentage profit > 100
      try {
        await axios.put(`${baseUrl}/api/books/${editTestBook._id}`, {
          profitType: 'percentage',
          profitValue: 105
        }, {
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
        });
        throw new Error('Expected percentage profit > 100 to fail');
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.error).toContain('between 0 and 100');
      }

      // Verify DB value was untouched
      const afterFailedAttempts = await Book.findById(editTestBook._id);
      expect(afterFailedAttempts.profitValue).toBe(originalProfitValue);
    });
  });
});
