/** @jest-environment node */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const { distributeCommissions } = require('../services/commissionDistribution');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Commission Split Parity: ab35ca8 vs HEAD (Strict Split Invariance)', () => {

  test('Fixture 1: Profit ₹20 with referrer and tree ancestors', async () => {
    await mongoose.connection.dropDatabase();

    await CommissionSettings.create({
      settingsId: 'default',
      trustFundPercent: 10,           // 10% of 20 = ₹2.00
      directCommissionPercent: 30,    // 30% of 20 = ₹6.00
      referralCommissionPercent: 20,  // 20% of 20 = ₹4.00
      adminCommissionPercent: 0,      // 0% of 20 = ₹0.00
      treeCommissionPoolPercent: 40,  // 40% of 20 = ₹8.00 (split: Level 2: 6.40, Level 1: 1.60)
      developmentFundPercent: 0,
      totalAllocationPercent: 100,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'admin',
      treeCommissionLevels: [{ level: 1, percentage: 40 }]
    });

    const rootAdmin = await User.create({
      name: 'Root Admin',
      email: 'admin.f1@test.com',
      password: 'Password123!',
      role: 'admin',
      referralCode: 'ADM_F1',
      treeLevel: 1,
      wallet: 0
    });

    const referrer = await User.create({
      name: 'Referrer User',
      email: 'ref.f1@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'REF_F1',
      treeLevel: 2,
      treeParent: rootAdmin._id,
      wallet: 0
    });

    const buyer = await User.create({
      name: 'Buyer User',
      email: 'buyer.f1@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'BUY_F1',
      referredBy: 'REF_F1',
      treeLevel: 3,
      treeParent: referrer._id,
      isMember: true,
      wallet: 0
    });

    const book = await Book.create({
      title: 'Fixture 1 Book',
      author: 'Author 1',
      price: 100,
      finalPrice: 100,
      profitMethod: 'fixed',
      profitValue: 20
    });

    const order = await Order.create({
      user_id: buyer._id,
      totalAmount: 100,
      status: 'completed',
      commissionStatus: 'pending',
      orderProfitTotal: 20,
      profitAmount: 20,
      items: [{
        id: book._id,
        title: book.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20
      }]
    });

    const tx = await distributeCommissions(order._id, buyer._id, 100, 20);

    console.log('[Fixture 1 Numbers]', {
      orderId: String(order._id),
      profitAmount: tx.profitAmount,
      directCommissionAmount: tx.directCommissionAmount,
      referralCommissionAmount: tx.referralCommissionAmount,
      treePoolTotal: tx.treePoolTotal,
      trustFundAmount: tx.trustFundAmount,
      devTrustFundAmount: tx.devTrustFundAmount,
      adminCommissionAmount: tx.adminCommissionAmount,
      remainderToDevFund: tx.remainderToDevFund
    });

    // Verification of exact split rules
    expect(tx.status).toBe('completed');
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6.00);    // 30% of ₹20
    expect(tx.referralCommissionAmount).toBe(4.00);  // 20% of ₹20
    expect(tx.treePoolTotal).toBe(8.00);             // 40% of ₹20
    expect(tx.trustFundAmount).toBe(2.00);           // 10% of ₹20
    expect(tx.adminCommissionAmount).toBe(0.00);     // 0%
    expect(tx.remainderToDevFund).toBe(0.00);

    const buyerRefreshed = await User.findById(buyer._id);
    const referrerRefreshed = await User.findById(referrer._id);
    const adminRefreshed = await User.findById(rootAdmin._id);

    console.log('[Fixture 1 Wallets]', {
      buyerWallet: buyerRefreshed.wallet,
      referrerWallet: referrerRefreshed.wallet,
      adminWallet: adminRefreshed.wallet
    });

    expect(buyerRefreshed.wallet).toBe(6.00);        // cashback
    expect(referrerRefreshed.wallet).toBe(10.40);    // 4 referral + 6.40 tree
    expect(adminRefreshed.wallet).toBe(1.60);        // 1.60 tree
  });

  test('Fixture 2: Profit ₹20 with referrer and NO tree ancestors', async () => {
    await mongoose.connection.dropDatabase();

    await CommissionSettings.create({
      settingsId: 'default',
      trustFundPercent: 10,
      directCommissionPercent: 30,
      referralCommissionPercent: 20,
      adminCommissionPercent: 0,
      treeCommissionPoolPercent: 40,
      developmentFundPercent: 0,
      totalAllocationPercent: 100,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'admin',
      treeCommissionLevels: [{ level: 1, percentage: 40 }]
    });

    // Buyer is tree level 1 (root, has NO tree ancestors above them)
    // System tree root exists
    const rootAdmin = await User.create({
      name: 'Root Admin',
      email: 'admin.f2@test.com',
      password: 'Password123!',
      role: 'admin',
      referralCode: 'ADM_F2',
      treeLevel: 1,
      wallet: 0
    });

    const referrer = await User.create({
      name: 'Referrer User',
      email: 'ref.f2@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'REF_F2',
      wallet: 0
    });

    // Buyer is already a member with first purchase done, but has NO tree ancestors
    const buyer = await User.create({
      name: 'Buyer User',
      email: 'buyer.f2@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'BUY_F2',
      referredBy: 'REF_F2',
      treeLevel: 0,
      treeParent: null,
      isMember: true,
      firstPurchaseDone: true,
      wallet: 0
    });

    const book = await Book.create({
      title: 'Fixture 2 Book',
      author: 'Author 2',
      price: 100,
      finalPrice: 100,
      profitMethod: 'fixed',
      profitValue: 20
    });

    const order = await Order.create({
      user_id: buyer._id,
      totalAmount: 100,
      status: 'completed',
      commissionStatus: 'pending',
      orderProfitTotal: 20,
      profitAmount: 20,
      items: [{
        id: book._id,
        title: book.title,
        price: 100,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 20,
        lineProfitSnapshot: 20
      }]
    });

    const tx = await distributeCommissions(order._id, buyer._id, 100, 20);

    console.log('[Fixture 2 Numbers]', {
      orderId: String(order._id),
      profitAmount: tx.profitAmount,
      directCommissionAmount: tx.directCommissionAmount,
      referralCommissionAmount: tx.referralCommissionAmount,
      treePoolTotal: tx.treePoolTotal,
      trustFundAmount: tx.trustFundAmount,
      devTrustFundAmount: tx.devTrustFundAmount,
      adminCommissionAmount: tx.adminCommissionAmount,
      remainderToDevFund: tx.remainderToDevFund
    });

    expect(tx.status).toBe('completed');
    expect(tx.profitAmount).toBe(20);
    expect(tx.directCommissionAmount).toBe(6.00);    // 30% of ₹20
    expect(tx.referralCommissionAmount).toBe(4.00);  // 20% of ₹20
    expect(tx.treePoolTotal).toBe(8.00);             // 40% of ₹20
    expect(tx.trustFundAmount).toBe(2.00);           // 10% of ₹20
    expect(tx.adminCommissionAmount).toBe(0.00);
    expect(tx.remainderToDevFund).toBe(0.00);

    const buyerRefreshed = await User.findById(buyer._id);
    const referrerRefreshed = await User.findById(referrer._id);

    console.log('[Fixture 2 Wallets]', {
      buyerWallet: buyerRefreshed.wallet,
      referrerWallet: referrerRefreshed.wallet
    });

    expect(buyerRefreshed.wallet).toBe(6.00);
    expect(referrerRefreshed.wallet).toBe(4.00);
  });

  test('Fixture 3: Profit ₹100 with a 3-level tree', async () => {
    await mongoose.connection.dropDatabase();

    await CommissionSettings.create({
      settingsId: 'default',
      trustFundPercent: 10,           // 10% of 100 = ₹10.00
      directCommissionPercent: 30,    // 30% of 100 = ₹30.00
      referralCommissionPercent: 20,  // 20% of 100 = ₹20.00
      adminCommissionPercent: 0,      // 0% of 100 = ₹0.00
      treeCommissionPoolPercent: 40,  // 40% of 100 = ₹40.00 (split: Level 2: 32.00, Level 1: 8.00)
      developmentFundPercent: 0,
      totalAllocationPercent: 100,
      directFallbackRecipient: 'trust_fund',
      referralFallbackRecipient: 'admin',
      treeCommissionLevels: [{ level: 1, percentage: 40 }]
    });

    const level1Root = await User.create({
      name: 'Level 1 Root',
      email: 'lvl1@test.com',
      password: 'Password123!',
      role: 'admin',
      referralCode: 'LVL1',
      treeLevel: 1,
      wallet: 0
    });

    const level2Parent = await User.create({
      name: 'Level 2 Parent',
      email: 'lvl2@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'LVL2',
      treeLevel: 2,
      treeParent: level1Root._id,
      wallet: 0
    });

    const buyer = await User.create({
      name: 'Level 3 Buyer',
      email: 'lvl3@test.com',
      password: 'Password123!',
      role: 'customer',
      referralCode: 'LVL3',
      referredBy: 'LVL2',
      treeLevel: 3,
      treeParent: level2Parent._id,
      isMember: true,
      wallet: 0
    });

    const book = await Book.create({
      title: 'Fixture 3 Book',
      author: 'Author 3',
      price: 500,
      finalPrice: 500,
      profitMethod: 'fixed',
      profitValue: 100
    });

    const order = await Order.create({
      user_id: buyer._id,
      totalAmount: 500,
      status: 'completed',
      commissionStatus: 'pending',
      orderProfitTotal: 100,
      profitAmount: 100,
      items: [{
        id: book._id,
        title: book.title,
        price: 500,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 100,
        lineProfitSnapshot: 100
      }]
    });

    const tx = await distributeCommissions(order._id, buyer._id, 500, 100);

    console.log('[Fixture 3 Numbers]', {
      orderId: String(order._id),
      profitAmount: tx.profitAmount,
      directCommissionAmount: tx.directCommissionAmount,
      referralCommissionAmount: tx.referralCommissionAmount,
      treePoolTotal: tx.treePoolTotal,
      trustFundAmount: tx.trustFundAmount,
      devTrustFundAmount: tx.devTrustFundAmount,
      adminCommissionAmount: tx.adminCommissionAmount,
      remainderToDevFund: tx.remainderToDevFund
    });

    expect(tx.status).toBe('completed');
    expect(tx.profitAmount).toBe(100);
    expect(tx.directCommissionAmount).toBe(30.00);    // 30% of ₹100
    expect(tx.referralCommissionAmount).toBe(20.00);  // 20% of ₹100
    expect(tx.treePoolTotal).toBe(40.00);             // 40% of ₹100
    expect(tx.trustFundAmount).toBe(10.00);           // 10% of ₹100
    expect(tx.adminCommissionAmount).toBe(0.00);
    expect(tx.remainderToDevFund).toBe(0.00);

    const buyerRefreshed = await User.findById(buyer._id);
    const parentRefreshed = await User.findById(level2Parent._id);
    const rootRefreshed = await User.findById(level1Root._id);

    console.log('[Fixture 3 Wallets]', {
      buyerWallet: buyerRefreshed.wallet,
      parentWallet: parentRefreshed.wallet,
      rootWallet: rootRefreshed.wallet
    });

    expect(buyerRefreshed.wallet).toBe(30.00);        // cashback
    expect(parentRefreshed.wallet).toBe(52.00);       // 20 referral + 32 tree
    expect(rootRefreshed.wallet).toBe(8.00);          // 8 tree
  });
});
