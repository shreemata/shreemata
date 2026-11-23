const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const VipMasterCard = require('../models/VipMasterCard');
const VipMasterCardSequence = require('../models/VipMasterCardSequence');
const Order = require('../models/Order');
const User = require('../models/User');
const CommissionSettings = require('../models/CommissionSettings');
const { distributeCommissions } = require('../services/commissionDistribution');

describe('VIP Master Card Bulk Issuance & Contiguity Verification', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await VipMasterCard.deleteMany({});
    await VipMasterCardSequence.deleteMany({});
    await Order.deleteMany({});
    await User.deleteMany({});
    await CommissionSettings.deleteMany({});

    await CommissionSettings.create({
      directReferralRate: 0.05,
      levelCommissionRates: [0.03, 0.02, 0.01],
      maxLevels: 3,
      minimumWithdrawalAmount: 100,
      adminCommissionRate: 0.1,
      commissionFundRate: 0.05,
      virtualPoolRate: 0.05,
      globalPoolRate: 0.05,
      vipMasterCardWithdrawalMin: 100,
      vipMasterCardReserveMin: 100
    });
  });

  test('1 card, 15 cards, 105 cards and 1,000 cards: sequential numbers, contiguous tiers, no duplicates', async () => {
    const user = await User.create({
      name: 'Bulk VIP Tester',
      email: 'bulkvip@test.com',
      password: 'Password123!',
      wallet: 0
    });

    // 1 card: order ₹10 -> floor(10/10) = 1 card
    const order1 = await Order.create({
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 10,
      profitAmount: 2,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(order1._id, user._id, 10, 2);

    let cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(1);
    expect(cards[0].tier).toBe(1);
    expect(cards[0].cardNumber).toBe('VIP 0000 0001');
    expect(cards[0].milestoneAmount).toBe(10);

    // Running distribution twice for the SAME order creates NO duplicate cards
    await distributeCommissions(order1._id, user._id, 10, 2);
    cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(1);

    // 15 cards total: order ₹140 -> cumulative ₹150 -> floor(150/10) = 15 cards (14 new cards)
    const order2 = await Order.create({
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 140,
      profitAmount: 28,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(order2._id, user._id, 140, 28);

    cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(15);
    for (let i = 0; i < 15; i++) {
      expect(cards[i].tier).toBe(i + 1);
      const expectedNum = 'VIP ' + String(i + 1).padStart(8, '0').slice(0, 4) + ' ' + String(i + 1).padStart(8, '0').slice(4, 8);
      expect(cards[i].cardNumber).toBe(expectedNum);
      expect(cards[i].milestoneAmount).toBe((i + 1) * 10);
    }

    // 105 cards total: order ₹900 -> cumulative ₹1,050 -> floor(1050/10) = 105 cards (90 new cards)
    const order3 = await Order.create({
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 900,
      profitAmount: 180,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(order3._id, user._id, 900, 180);

    cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(105);
    const cardNums105 = new Set(cards.map(c => c.cardNumber));
    expect(cardNums105.size).toBe(105); // unique numbers
    const tiers105 = new Set(cards.map(c => c.tier));
    expect(tiers105.size).toBe(105); // no duplicate tiers
    expect(cards[104].tier).toBe(105);
    expect(cards[104].cardNumber).toBe('VIP 0000 0105');
    expect(cards[104].milestoneAmount).toBe(1050);

    // 1,000 cards total: order ₹8,950 -> cumulative ₹10,000 -> floor(10000/10) = 1,000 cards (895 new cards across 2 chunks)
    const order4 = await Order.create({
      user_id: user._id,
      customerName: user.name,
      customerEmail: user.email,
      totalAmount: 8950,
      profitAmount: 1790,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(order4._id, user._id, 8950, 1790);

    cards = await VipMasterCard.find({ userId: user._id }).sort({ tier: 1 });
    expect(cards.length).toBe(1000);
    const cardNums1000 = new Set(cards.map(c => c.cardNumber));
    expect(cardNums1000.size).toBe(1000);
    const tiers1000 = new Set(cards.map(c => c.tier));
    expect(tiers1000.size).toBe(1000);
    expect(cards[999].tier).toBe(1000);
    expect(cards[999].cardNumber).toBe('VIP 0000 1000');
    expect(cards[999].milestoneAmount).toBe(10000);

    // Contiguous check 1..1000
    for (let i = 0; i < 1000; i++) {
      expect(cards[i].tier).toBe(i + 1);
    }
  });

  test('Simulated failure in middle of a chunk: leaves no tier gap and subsequent order recovers', async () => {
    const user2 = await User.create({
      name: 'Failure Recovery User',
      email: 'recover@test.com',
      password: 'Password123!',
      wallet: 0
    });

    // Seed 10 existing cards
    const initialOrder = await Order.create({
      user_id: user2._id,
      customerName: user2.name,
      customerEmail: user2.email,
      totalAmount: 100,
      profitAmount: 20,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(initialOrder._id, user2._id, 100, 20);
    let cards = await VipMasterCard.find({ userId: user2._id }).sort({ tier: 1 });
    expect(cards.length).toBe(10);

    // Mock insertMany to reject on a failed order
    const origInsertMany = VipMasterCard.insertMany;
    VipMasterCard.insertMany = jest.fn().mockRejectedValueOnce(new Error('Simulated DB network failure'));

    const failOrder = await Order.create({
      user_id: user2._id,
      customerName: user2.name,
      customerEmail: user2.email,
      totalAmount: 100,
      profitAmount: 20,
      paymentStatus: 'completed',
      status: 'completed'
    });

    // distributeCommissions should catch error gracefully without throwing
    await expect(distributeCommissions(failOrder._id, user2._id, 100, 20)).resolves.toBeDefined();

    // Verify no broken cards were inserted (remains exactly 10 cards)
    cards = await VipMasterCard.find({ userId: user2._id }).sort({ tier: 1 });
    expect(cards.length).toBe(10);

    // Restore insertMany
    VipMasterCard.insertMany = origInsertMany;

    // Next order of ₹50 -> cumulative total = 100 + 100 + 50 = ₹250 -> floor(250/10) = 25 cards
    // Recovers cleanly by issuing tiers 11 through 25
    const recoverOrder = await Order.create({
      user_id: user2._id,
      customerName: user2.name,
      customerEmail: user2.email,
      totalAmount: 50,
      profitAmount: 10,
      paymentStatus: 'completed',
      status: 'completed'
    });
    await distributeCommissions(recoverOrder._id, user2._id, 50, 10);

    cards = await VipMasterCard.find({ userId: user2._id }).sort({ tier: 1 });
    expect(cards.length).toBe(25);
    for (let i = 0; i < 25; i++) {
      expect(cards[i].tier).toBe(i + 1);
      expect(cards[i].milestoneAmount).toBe((i + 1) * 10);
    }
  });
});
