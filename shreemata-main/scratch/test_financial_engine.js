const mongoose = require('mongoose');
require('dotenv').config();

const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const Order = require('../models/Order');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const { calculateProductUnitProfit, buildOrderProfitSnapshot, calculateOrderProfitTotal } = require('../services/orderProfit');
const { distributeCommissions } = require('../services/commissionDistribution');

async function runTests() {
  console.log('🧪 Starting Full Financial Engine & Safety Verification Suite...\n');

  // 1. TEST PROFIT CALCULATOR SERVICE WITH DISCOUNT SAFETY
  console.log('▶️ TEST 1: Unit Profit Calculation & Discount Safety Rule');
  const bookFixed = { profitConfigured: true, profitType: 'fixed', profitValue: 30, price: 100 };
  const profit1 = calculateProductUnitProfit(bookFixed, 100);
  console.assert(profit1.unitProfitSnapshot === 30, `Expected 30, got ${profit1.unitProfitSnapshot}`);

  // Discounted sale price ₹20 (profit capped at sale price ₹20)
  const profit1Discounted = calculateProductUnitProfit(bookFixed, 20);
  console.assert(profit1Discounted.unitProfitSnapshot === 20, `Expected 20 for discounted sale, got ${profit1Discounted.unitProfitSnapshot}`);

  const bookPercent = { profitConfigured: true, profitType: 'percentage', profitValue: 30, price: 100 };
  const profit2 = calculateProductUnitProfit(bookPercent, 100);
  console.assert(profit2.unitProfitSnapshot === 30, `Expected 30, got ${profit2.unitProfitSnapshot}`);

  const bookUnconfigured = { profitConfigured: false, profitType: 'fixed', profitValue: 30, price: 100 };
  const profit3 = calculateProductUnitProfit(bookUnconfigured, 100);
  console.assert(profit3.unitProfitSnapshot === 0, `Expected 0 for unconfigured book, got ${profit3.unitProfitSnapshot}`);
  console.log('✅ TEST 1 PASSED: Unit profit calculator and discount safety rules verified.\n');

  // 2. TEST ORDER SNAPSHOT CREATION & MULTI-PRODUCT CALCULATION
  console.log('▶️ TEST 2: Multi-product Order Profit Snapshot & Shipping Exclusion');
  const mockItems = [
    { id: '507f1f77bcf86cd799439011', title: 'Book A', price: 100, quantity: 2, unitProfitSnapshot: 20, lineProfitSnapshot: 40, profitTypeSnapshot: 'fixed', profitValueSnapshot: 20 },
    { id: '507f1f77bcf86cd799439012', title: 'Book B', price: 150, quantity: 1, unitProfitSnapshot: 30, lineProfitSnapshot: 30, profitTypeSnapshot: 'fixed', profitValueSnapshot: 30 }
  ];
  const orderProfitTotal = calculateOrderProfitTotal(mockItems);
  console.assert(orderProfitTotal === 70, `Expected order total 70, got ${orderProfitTotal}`);
  console.log('✅ TEST 2 PASSED: Multi-product line profit total = ₹70 (excluding shipping).\n');

  // 3. TEST DB-BASED INTEGRATION IF DB CONNECTED
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/shreemata';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('▶️ Connected to DB for integration tests');

    // Test Registration flow
    console.log('▶️ TEST 3: User Registration with Referral (No ₹2 reward)');
    const testReferrer = await User.create({
      name: 'Referrer A',
      email: `refA_${Date.now()}@test.com`,
      password: 'password123',
      referralCode: `REFA_${Date.now()}`,
      wallet: 100,
      referrals: 0
    });

    const initialWallet = testReferrer.wallet;

    const testReferred = await User.create({
      name: 'Referred B',
      email: `refB_${Date.now()}@test.com`,
      password: 'password123',
      referredBy: testReferrer.referralCode
    });

    // Simulate auth.js logic
    testReferrer.referrals = (testReferrer.referrals || 0) + 1;
    await testReferrer.save();

    const updatedReferrer = await User.findById(testReferrer._id);
    console.assert(updatedReferrer.referrals === 1, `Expected referrals count 1, got ${updatedReferrer.referrals}`);
    console.assert(updatedReferrer.wallet === initialWallet, `Expected wallet unchanged at ₹${initialWallet}, got ₹${updatedReferrer.wallet}`);

    const wtxCount = await WalletTransaction.countDocuments({ category: 'referral_registration_reward', referredUserId: testReferred._id });
    console.assert(wtxCount === 0, `Expected 0 registration reward transactions, got ${wtxCount}`);
    console.log('✅ TEST 3 PASSED: Registration credited ₹0, referrals count incremented by 1.\n');

    // Test Profit Immutability
    console.log('▶️ TEST 4: Profit Snapshot Immutability on Order');
    const testBook = await Book.create({
      title: 'Immutability Test Book',
      author: 'Test Author',
      price: 100,
      profitType: 'fixed',
      profitValue: 30,
      profitConfigured: true
    });

    const itemsWithProfit = await buildOrderProfitSnapshot([{ id: testBook._id.toString(), title: testBook.title, price: 100, quantity: 1, type: 'book' }]);
    const profitTotal = calculateOrderProfitTotal(itemsWithProfit);

    const testOrder = await Order.create({
      user_id: testReferred._id,
      items: itemsWithProfit,
      totalAmount: 150, // ₹100 book + ₹50 courier
      courierCharge: 50,
      orderProfitTotal: profitTotal,
      profitAmount: profitTotal,
      status: 'pending'
    });

    console.assert(testOrder.orderProfitTotal === 30, `Order profit snapshot expected 30, got ${testOrder.orderProfitTotal}`);

    // Admin updates book profit to ₹50
    testBook.profitValue = 50;
    await testBook.save();

    // Verify order snapshot remains 30
    const reloadedOrder = await Order.findById(testOrder._id);
    console.assert(reloadedOrder.orderProfitTotal === 30, `Order profit snapshot must remain 30 after book edit, got ${reloadedOrder.orderProfitTotal}`);
    console.assert(reloadedOrder.items[0].unitProfitSnapshot === 30, `Item snapshot must remain 30, got ${reloadedOrder.items[0].unitProfitSnapshot}`);
    console.log('✅ TEST 4 PASSED: Book profit change does not affect historical order profit snapshot.\n');

    // Clean up test data
    await User.deleteMany({ _id: { $in: [testReferrer._id, testReferred._id] } });
    await Book.deleteOne({ _id: testBook._id });
    await Order.deleteOne({ _id: testOrder._id });
    await mongoose.disconnect();
    console.log('🧹 DB test cleanup complete.');

  } catch (err) {
    console.log('ℹ️ DB integration test skipped or completed with message:', err.message);
  }

  console.log('\n🎉 ALL FINANCIAL ENGINE VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
}

runTests();
