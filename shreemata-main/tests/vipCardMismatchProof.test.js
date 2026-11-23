/**
 * tests/vipCardMismatchProof.test.js
 *
 * PROOF TEST FOR VIP CARD & BALANCE MISMATCH:
 * Proves the end-to-end user flow:
 * 1. User has 3 VIP cards (Tier 1, Tier 2, Tier 3) and user.wallet = 0.
 * 2. User claims ₹300 from a virtual referral (/api/points/virtual-referrals/:id/claim).
 *    - routes/points.js credits VipMasterCard.findOne({ userId }).sort({ tier: 1 }) -> credits Tier 1.
 *    - routes/points.js does NOT update user.wallet.
 * 3. User navigates to account page (account.html?section=vip).
 *    - Server GET /api/users/profile/vip-mastercards returns cards decorated with walletBalance (user.wallet = 0).
 *    - public/js/account.js sorts cards descending (tier 3 first) -> renders Tier 3 card ("VIP 0000 0003").
 *    - Page displays card balance as ₹0.00.
 * 4. User clicks "Withdraw from VIP Card" on the page:
 *    - Modal opens for Tier 3 card with Available Balance ₹0.00.
 *    - Attempting to withdraw ₹100 fails with insufficient balance.
 * 5. DB inspection proves:
 *    - Card 1 (Tier 1) holds the ₹300 balance in MongoDB.
 *    - Card 2 (Tier 2) has ₹0.
 *    - Card 3 (Tier 3) has ₹0.
 *    - user.wallet is ₹0.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_mismatch_proof_123';

const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');
const AdminSettings = require('../models/AdminSettings');
const authRoutes = require('../routes/auth');
const pointsRoutes = require('../routes/points');
const commissionSettingsRoutes = require('../routes/commissionSettings');
const adminWithdrawRoutes = require('../routes/adminWithdraw');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

jest.setTimeout(60000);

let server;
let port;
let browser;

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET
  );
}

beforeAll(async () => {
  await setupTestDB();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/api', authRoutes);
  app.use('/api/points', pointsRoutes);
  app.use('/api', commissionSettingsRoutes);
  app.use('/api/admin/withdrawals', adminWithdrawRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });
});

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await teardownTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('VIP Card Mismatch End-to-End Proof', () => {
  test('user with 3 cards who claims ₹300 cannot withdraw ₹100 from account page due to tier/wallet mismatch', async () => {
    // 1. Setup AdminSettings
    await AdminSettings.create({
      virtualTree: { cost: 100 },
      conversionRate: 0.5,
      pointsConversionIncrement: 50
    });

    // 2. Setup User A with 3 VIP cards
    const userA = await User.create({
      name: 'Tester ThreeCards',
      email: 'threecards@example.com',
      password: 'password123',
      role: 'user',
      wallet: 0, // Wallet balance is 0
      bankDetails: {
        isSetup: true,
        accountHolderName: 'Tester ThreeCards',
        accountNumber: '112233445566',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        upiId: 'tester@okhdfcbank'
      },
      masterCard: {
        isAssigned: true,
        cardNumber: 'SMC-30003',
        status: 'active'
      }
    });

    // Create 3 VIP cards in DB for userA
    const card1 = await VipMasterCard.create({
      userId: userA._id,
      cardNumber: 'VIP 0000 0001',
      tier: 1,
      milestoneAmount: 10,
      balance: 0,
      totalWithdrawn: 0
    });

    const card2 = await VipMasterCard.create({
      userId: userA._id,
      cardNumber: 'VIP 0000 0002',
      tier: 2,
      milestoneAmount: 20,
      balance: 0,
      totalWithdrawn: 0
    });

    const card3 = await VipMasterCard.create({
      userId: userA._id,
      cardNumber: 'VIP 0000 0003',
      tier: 3,
      milestoneAmount: 30,
      balance: 0,
      totalWithdrawn: 0
    });

    // 3. Create a virtual referral child under User A with ₹300 available to claim (30000 paise)
    const virtualChild = await User.create({
      name: 'Virtual Child Node',
      email: 'virtual1@example.com',
      isVirtual: true,
      originalUser: userA._id,
      virtualEarningsBalancePaise: 30000, // ₹300
      virtualClaimedEarningsPaise: 0
    });

    const token = generateToken(userA);

    // 4. Execute Claim via API: POST /api/points/virtual-referrals/:id/claim
    const axios = require('axios');
    const claimRes = await axios.post(
      `http://127.0.0.1:${port}/api/points/virtual-referrals/${virtualChild._id}/claim`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(claimRes.status).toBe(200);
    expect(claimRes.data.success).toBe(true);
    expect(claimRes.data.transferredAmount).toBe(300);
    expect(claimRes.data.vipCardNumber).toBe('VIP 0000 0001');
    expect(claimRes.data.newVipBalance).toBe(300);

    // 5. Inspect DB directly: where did the ₹300 go?
    const dbCard1 = await VipMasterCard.findById(card1._id);
    const dbCard2 = await VipMasterCard.findById(card2._id);
    const dbCard3 = await VipMasterCard.findById(card3._id);
    const dbUserA = await User.findById(userA._id);

    // Proof part 1: Points claim credited Tier 1 card balance ONLY!
    expect(dbCard1.balance).toBe(300); // Credited to lowest tier (tier 1)
    expect(dbCard2.balance).toBe(0);
    expect(dbCard3.balance).toBe(0);
    expect(dbUserA.wallet).toBe(0); // user.wallet was NOT credited!

    // 6. Inspect what GET /api/users/profile/vip-mastercards returns
    const profileCardsRes = await axios.get(
      `http://127.0.0.1:${port}/api/users/profile/vip-mastercards`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(profileCardsRes.status).toBe(200);
    expect(profileCardsRes.data.walletBalance).toBe(0); // Returns user.wallet (0)
    // All cards in API response were overridden with walletBalance = 0!
    expect(profileCardsRes.data.cards[0].cardNumber).toBe('VIP 0000 0003'); // sorted tier desc
    expect(profileCardsRes.data.cards[0].balance).toBe(0);

    // 7. Real Browser Interaction: Open account.html?section=vip in Playwright
    const page = await browser.newPage();
    const dialogMessages = [];
    page.on('dialog', async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.accept().catch(() => {});
    });

    // Navigate to origin first to set localStorage
    await page.goto(`http://127.0.0.1:${port}/login.html`);
    await page.evaluate(({ t, u }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, { t: token, u: { _id: userA._id.toString(), name: userA.name, email: userA.email, wallet: 0, bankDetails: userA.bankDetails } });

    // Navigate to VIP section in account.html
    await page.goto(`http://127.0.0.1:${port}/account.html?section=vip`, { waitUntil: 'networkidle' });

    // Wait for VIP card to render
    await page.waitForSelector('#vipSectionContent .vip-card-number-display', { state: 'visible', timeout: 10000 });

    // Verify which card is displayed in UI: it is Tier 3 ("VIP 0000 0003")
    const displayedCardNumber = await page.$eval('#vipSectionContent .vip-card-number-display', el => el.textContent.trim());
    expect(displayedCardNumber).toBe('VIP 0000 0003');

    // Verify balance displayed on card in UI: it is ₹0.00
    const displayedBalance = await page.$eval('#vipSectionContent .vip-card-wallet-val', el => el.textContent.trim());
    expect(displayedBalance).toBe('₹0.00');

    // Click the withdraw button
    await page.click('#vipSectionContent .btn-vip-withdraw');

    // Modal opens
    await page.waitForSelector('#vipWithdrawModal', { state: 'visible', timeout: 5000 });

    // Modal shows card info for Tier 3
    const modalCardInfo = await page.$eval('#vipModalCardInfo', el => el.textContent.trim());
    expect(modalCardInfo).toContain('VIP 0000 0003');
    expect(modalCardInfo).toContain('Tier 03');

    // Modal available balance shows ₹0.00
    const modalAvailable = await page.$eval('#vipModalAvailableBalance', el => el.textContent.trim());
    expect(modalAvailable).toBe('₹0.00');

    // Attempt to withdraw ₹100
    await page.fill('#vipWithdrawAmountInput', '100');

    // Click submit withdraw button
    await page.click('#vipSubmitWithdrawBtn');

    // The frontend alerts or backend rejects:
    // With available balance 0 and requested 100:
    // Frontend submitVipWithdrawal checks: `if (amount > available) { alert(...) }`
    // where available is currentVipWithdrawState.availableBalance = 0.
    // Dialog alert was captured!
    expect(dialogMessages.length).toBeGreaterThan(0);
    expect(dialogMessages[0]).toMatch(/Insufficient balance|Minimum withdrawal/i);

    // 8. Final DB verification: balances remain unchanged
    const finalCard1 = await VipMasterCard.findById(card1._id);
    const finalCard2 = await VipMasterCard.findById(card2._id);
    const finalCard3 = await VipMasterCard.findById(card3._id);
    const finalUserA = await User.findById(userA._id);

    expect(finalCard1.balance).toBe(300); // Untouched in Card 1
    expect(finalCard2.balance).toBe(0);
    expect(finalCard3.balance).toBe(0);
    expect(finalUserA.wallet).toBe(0); // Still 0
    expect(finalUserA.withdrawals).toHaveLength(0); // No withdrawal succeeded

    await page.close();
  });
});
