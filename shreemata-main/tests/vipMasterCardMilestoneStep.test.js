const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const { distributeCommissions } = require('../services/commissionDistribution');
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionSettings = require('../models/CommissionSettings');
const VipMasterCard = require('../models/VipMasterCard');
const VipMasterCardSequence = require('../models/VipMasterCardSequence');
const TrustFund = require('../models/TrustFund');

jest.setTimeout(60000);

let server;
let client;
let adminUser;

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());

  // Mount API endpoints for dev server parity
  app.get('/api/vip-cards/:userId', async (req, res) => {
    try {
      const cards = await VipMasterCard.find({ userId: req.params.userId }).sort({ tier: 1 });
      res.json({ success: true, count: cards.length, cards });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      client = axios.create({
        baseURL: `http://127.0.0.1:${port}/api`,
        validateStatus: () => true
      });
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await teardownTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  // Seed baseline CommissionSettings
  await CommissionSettings.create({
    trustFundPercent: 1,
    directCommissionPercent: 3,
    referralCommissionPercent: 2,
    developmentFundPercent: 0,
    treeCommissionPoolPercent: 4,
    adminCommissionPercent: 1
  });

  // Seed Admin user
  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@shreemata.com',
    role: 'admin',
    wallet: 0,
    treeLevel: 1
  });

  // Seed TrustFund
  await TrustFund.create({
    fundType: 'trust',
    balance: 0,
    transactions: []
  });
  await TrustFund.create({
    fundType: 'development',
    balance: 0,
    transactions: []
  });
});

describe('VIP Master Card Milestone Step (₹10) Engine Tests', () => {

  test('1. A user with completed orders totalling ₹9 gets 0 cards', async () => {
    const user = await User.create({
      name: 'Buyer 9',
      email: 'buyer9@example.com',
      wallet: 0
    });

    const orderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderId,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 9,
      profitAmount: 2,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await distributeCommissions(orderId, user._id.toString(), 9, 2);

    const cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(0);

    // Verify via dev server endpoint as well
    const apiRes = await client.get(`/vip-cards/${user._id}`);
    expect(apiRes.status).toBe(200);
    expect(apiRes.data.count).toBe(0);
    expect(apiRes.data.cards.length).toBe(0);
  });

  test('2. A user with completed orders totalling ₹10 gets exactly 1 card (tier 1, milestoneAmount 10)', async () => {
    const user = await User.create({
      name: 'Buyer 10',
      email: 'buyer10@example.com',
      wallet: 0
    });

    const orderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderId,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 10,
      profitAmount: 2,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await distributeCommissions(orderId, user._id.toString(), 10, 2);

    const cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(1);
    expect(cards[0].tier).toBe(1);
    expect(cards[0].milestoneAmount).toBe(10);
    expect(cards[0].cardNumber).toBe('VIP 0000 0001');

    const apiRes = await client.get(`/vip-cards/${user._id}`);
    expect(apiRes.status).toBe(200);
    expect(apiRes.data.count).toBe(1);
    expect(apiRes.data.cards[0].tier).toBe(1);
    expect(apiRes.data.cards[0].milestoneAmount).toBe(10);
  });

  test('3. A user with completed orders totalling ₹25 gets 2 cards (milestoneAmount 10 and 20)', async () => {
    const user = await User.create({
      name: 'Buyer 25',
      email: 'buyer25@example.com',
      wallet: 0
    });

    const orderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderId,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 25,
      profitAmount: 5,
      status: 'completed',
      paymentStatus: 'completed'
    });

    await distributeCommissions(orderId, user._id.toString(), 25, 5);

    const cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(2);

    expect(cards[0].tier).toBe(1);
    expect(cards[0].milestoneAmount).toBe(10);

    expect(cards[1].tier).toBe(2);
    expect(cards[1].milestoneAmount).toBe(20);
  });

  test('4. A second order raising total from ₹25 to ₹47 adds exactly 2 cards (tiers 3 and 4) and never duplicates a tier', async () => {
    const user = await User.create({
      name: 'Buyer MultiOrder',
      email: 'buyermulti@example.com',
      wallet: 0
    });

    // First order: ₹25
    const order1Id = new mongoose.Types.ObjectId();
    await Order.create({
      _id: order1Id,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 25,
      profitAmount: 5,
      status: 'completed',
      paymentStatus: 'completed'
    });
    await distributeCommissions(order1Id, user._id.toString(), 25, 5);

    const initialCards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(initialCards.length).toBe(2);
    expect(initialCards[0].tier).toBe(1);
    expect(initialCards[1].tier).toBe(2);

    // Second order: ₹22, raising total from ₹25 to ₹47
    const order2Id = new mongoose.Types.ObjectId();
    await Order.create({
      _id: order2Id,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 22,
      profitAmount: 4,
      status: 'completed',
      paymentStatus: 'completed'
    });
    await distributeCommissions(order2Id, user._id.toString(), 22, 4);

    const updatedCards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(updatedCards.length).toBe(4);

    // Initial tiers remain intact
    expect(updatedCards[0].tier).toBe(1);
    expect(updatedCards[0].milestoneAmount).toBe(10);
    expect(updatedCards[1].tier).toBe(2);
    expect(updatedCards[1].milestoneAmount).toBe(20);

    // Exactly 2 new cards added
    expect(updatedCards[2].tier).toBe(3);
    expect(updatedCards[2].milestoneAmount).toBe(30);
    expect(updatedCards[3].tier).toBe(4);
    expect(updatedCards[3].milestoneAmount).toBe(40);

    // Never duplicates a tier
    const tiers = updatedCards.map(c => c.tier);
    const uniqueTiers = new Set(tiers);
    expect(uniqueTiers.size).toBe(4);
    expect(uniqueTiers.size).toBe(updatedCards.length);
  });

  test('5. Running the distribution twice for the same order creates no duplicate cards', async () => {
    const user = await User.create({
      name: 'Buyer Idempotent',
      email: 'buyeridempotent@example.com',
      wallet: 0
    });

    const orderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderId,
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 35,
      profitAmount: 7,
      status: 'completed',
      paymentStatus: 'completed'
    });

    // Run 1
    await distributeCommissions(orderId, user._id.toString(), 35, 7);
    const cardsRun1 = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cardsRun1.length).toBe(3);

    // Run 2 (retry on identical orderId)
    await distributeCommissions(orderId, user._id.toString(), 35, 7);
    const cardsRun2 = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cardsRun2.length).toBe(3);

    const tiers = cardsRun2.map(c => c.tier);
    expect(tiers).toEqual([1, 2, 3]);
  });

  test('6. Card numbers are unique and sequential (VIP 0000 0001, VIP 0000 0002...)', async () => {
    const userA = await User.create({ name: 'User A', email: 'usera@example.com', wallet: 0 });
    const userB = await User.create({ name: 'User B', email: 'userb@example.com', wallet: 0 });

    const orderAId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderAId,
      user_id: userA._id,
      totalAmount: 10,
      profitAmount: 2,
      status: 'completed'
    });
    await distributeCommissions(orderAId, userA._id.toString(), 10, 2);

    const orderBId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderBId,
      user_id: userB._id,
      totalAmount: 20,
      profitAmount: 4,
      status: 'completed'
    });
    await distributeCommissions(orderBId, userB._id.toString(), 20, 4);

    const cardsA = await VipMasterCard.find({ userId: userA._id }).sort({ tier: 1 });
    const cardsB = await VipMasterCard.find({ userId: userB._id }).sort({ tier: 1 });

    expect(cardsA.length).toBe(1);
    expect(cardsA[0].cardNumber).toBe('VIP 0000 0001');

    expect(cardsB.length).toBe(2);
    expect(cardsB[0].cardNumber).toBe('VIP 0000 0002');
    expect(cardsB[1].cardNumber).toBe('VIP 0000 0003');

    const allNumbers = [cardsA[0].cardNumber, cardsB[0].cardNumber, cardsB[1].cardNumber];
    expect(new Set(allNumbers).size).toBe(3);
  });

  test('7. Existing customer with 10 cards at old ₹100 step with ₹1,000 total orders then orders ₹50 receives exactly 95 new cards (total 105 expected)', async () => {
    const user = await User.create({
      name: 'Existing Customer 10',
      email: 'existing10@example.com',
      wallet: 0
    });

    // Seed 10 existing cards (tiers 1 through 10) issued under old ₹100 step
    const existingCardsDocs = [];
    for (let t = 1; t <= 10; t++) {
      existingCardsDocs.push({
        userId: user._id,
        cardNumber: `VIP 0000 ${String(t).padStart(4, '0')}`,
        tier: t,
        milestoneAmount: t * 100,
        issuedAt: new Date(Date.now() - 86400000)
      });
    }
    await VipMasterCard.insertMany(existingCardsDocs);
    await VipMasterCardSequence.findOneAndUpdate(
      { key: 'vip_master_card_seq' },
      { $set: { seq: 10 } },
      { upsert: true }
    );

    // Prior completed order of ₹1,000
    const priorOrderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: priorOrderId,
      user_id: user._id,
      totalAmount: 1000,
      profitAmount: 200,
      status: 'completed'
    });

    // New order of ₹50
    const newOrderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: newOrderId,
      user_id: user._id,
      totalAmount: 50,
      profitAmount: 10,
      status: 'completed'
    });

    // Compute expected numbers directly in the test:
    // Prior total = ₹1,000, new order = ₹50 -> cumulative total = ₹1,050
    // VIP milestone step = 10 -> total expected milestones = Math.floor(1050 / 10) = 105
    // Existing cards held = 10
    // Expected new cards to issue = 105 - 10 = 95
    const priorCardsCount = await VipMasterCard.countDocuments({ userId: user._id });
    expect(priorCardsCount).toBe(10);

    await distributeCommissions(newOrderId, user._id.toString(), 50, 10);

    const allCards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    const newlyIssuedCards = allCards.filter(c => c.tier > 10);

    const cumulativeTotal = 1000 + 50;
    const targetMilestones = Math.floor(cumulativeTotal / 10);
    const highestExistingTier = 10;
    const expectedNewCards = targetMilestones - highestExistingTier; // 105 - 10 = 95

    // Strict equality assertions
    expect(expectedNewCards).toBe(95);
    expect(newlyIssuedCards.length).toBe(95);
    expect(allCards.length).toBe(105);

    // Highest tier reached must be 105
    expect(allCards[allCards.length - 1].tier).toBe(105);

    // Milestone amount of highest tier 105 must be 105 * 10 = 1050
    expect(allCards[allCards.length - 1].milestoneAmount).toBe(1050);

    // First newly issued card must be tier 11 with milestoneAmount 11 * 10 = 110
    expect(newlyIssuedCards[0].tier).toBe(11);
    expect(newlyIssuedCards[0].milestoneAmount).toBe(110);

    // Verify all tiers from 1 to 105 exist without duplicates
    const allTiers = allCards.map(c => c.tier);
    expect(new Set(allTiers).size).toBe(105);
    expect(allTiers[0]).toBe(1);
    expect(allTiers[allTiers.length - 1]).toBe(105);
  });

  test('8. Large order safety check: > 500 new cards in a single order logs clear warning and still issues them without truncation', async () => {
    const user = await User.create({
      name: 'Bulk Buyer 6000',
      email: 'bulkbuyer@example.com',
      wallet: 0
    });

    const warnSpy = jest.spyOn(console, 'warn');

    // Single order of ₹6,000 -> 600 milestones at ₹10 step (> 500 cards in single order)
    const orderId = new mongoose.Types.ObjectId();
    await Order.create({
      _id: orderId,
      user_id: user._id,
      totalAmount: 6000,
      profitAmount: 1200,
      status: 'completed'
    });

    await distributeCommissions(orderId, user._id.toString(), 6000, 1200);

    // Confirm warning logged
    const warningLogged = warnSpy.mock.calls.some(call =>
      call.some(arg => String(arg).includes('User') && String(arg).includes('600 new VIP Master Cards'))
    );
    expect(warningLogged).toBe(true);

    // Confirm all 600 cards issued without truncation
    const allCards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(allCards.length).toBe(600);
    expect(allCards[0].tier).toBe(1);
    expect(allCards[0].milestoneAmount).toBe(10);
    expect(allCards[599].tier).toBe(600);
    expect(allCards[599].milestoneAmount).toBe(6000);

    warnSpy.mockRestore();
  });

});
