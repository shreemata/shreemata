const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const VipMasterCard = require('../models/VipMasterCard');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const payload = postData ? (typeof postData === 'string' ? postData : JSON.stringify(postData)) : null;
    const reqOptions = {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 STARTING ADMIN FINANCIAL DELETE TEST SUITE...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    const timestamp = Date.now();
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

    // 1. Fetch Existing Admin User from DB
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      throw new Error("No existing admin user found in database");
    }
    const adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, jwtSecret, { expiresIn: '1h' });

    // 2. Create Dedicated Test Customer User
    const customerUser = await User.create({
      name: `Test Customer ${timestamp}`,
      email: `test_customer_${timestamp}@example.com`,
      phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      role: 'user',
      wallet: 200
    });
    const customerToken = jwt.sign({ id: customerUser._id, role: 'user' }, jwtSecret, { expiresIn: '1h' });

    console.log('--- TEST A: Admin Deletes Normal Test Financial Record ---');
    const testNormalTx = await WalletTransaction.create({
      userId: customerUser._id,
      amount: 100,
      type: 'debit',
      category: 'withdrawal',
      description: 'Test General Withdrawal',
      balanceAfter: 100
    });

    const resA = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${testNormalTx._id}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { recordId: testNormalTx._id.toString(), sourceType: 'wallet_transaction' });

    assert(resA.status === 200, `Admin delete HTTP 200 (Got ${resA.status})`);
    assert(resA.body.success === true, `Response success is true: ${JSON.stringify(resA.body)}`);
    const txAfterA = await WalletTransaction.findById(testNormalTx._id);
    assert(txAfterA === null, 'WalletTransaction was purged from database');

    console.log('\n--- TEST B: Customer Attempts Same DELETE Endpoint (RBAC 403) ---');
    const testCustomerTx = await WalletTransaction.create({
      userId: customerUser._id,
      amount: 50,
      type: 'debit',
      category: 'withdrawal',
      description: 'Customer Test Transaction',
      balanceAfter: 150
    });

    const resB = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${testCustomerTx._id}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, { recordId: testCustomerTx._id.toString(), sourceType: 'wallet_transaction' });

    assert(resB.status === 403, `Customer delete blocked with HTTP 403 Forbidden (Got ${resB.status})`);
    const txAfterB = await WalletTransaction.findById(testCustomerTx._id);
    assert(txAfterB !== null, 'Customer record remained intact and was NOT deleted');

    console.log('\n--- TEST C: Double Deletion (Idempotency Safe) ---');
    const resC = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${testNormalTx._id}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { recordId: testNormalTx._id.toString(), sourceType: 'wallet_transaction' });

    assert(resC.status === 200, `Second deletion returns HTTP 200 (Got ${resC.status})`);
    assert(resC.body.success === true, `Second deletion handled gracefully without crashing: ${JSON.stringify(resC.body)}`);

    console.log('\n--- TEST D: VIP Master Card Withdrawal Test Record Deletion & Financial Consistency ---');
    // Setup VIP card
    const vipCard = await VipMasterCard.create({
      userId: customerUser._id,
      cardNumber: `VIP-${timestamp}`,
      tier: 1,
      milestoneAmount: 10000,
      balance: 1500,
      totalWithdrawn: 501,
      issuedAt: new Date()
    });

    // Setup initial customer wallet
    customerUser.wallet = 1000 - 501; // debited 501
    customerUser.withdrawals = [{
      amount: 501,
      source: 'vip_master_card',
      cardNumber: vipCard.cardNumber,
      cardTier: 1,
      cardId: vipCard._id,
      status: 'pending',
      requestedAt: new Date()
    }];
    await customerUser.save();

    const vipWithdrawalTx = await WalletTransaction.create({
      userId: customerUser._id,
      amount: 501,
      type: 'debit',
      category: 'vip_master_card_withdrawal',
      description: `VIP Master Card Withdrawal (${vipCard.cardNumber} - Tier 1)`,
      balanceAfter: 499
    });

    console.log(`  Initial State: wallet=₹${customerUser.wallet}, VIP totalWithdrawn=₹${vipCard.totalWithdrawn}, withdrawals count=${customerUser.withdrawals.length}`);

    // Admin deletes this pending VIP withdrawal
    const resD = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${vipWithdrawalTx._id}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { recordId: vipWithdrawalTx._id.toString(), sourceType: 'wallet_transaction', category: 'vip_master_card_withdrawal' });

    assert(resD.status === 200, `VIP withdrawal delete HTTP 200 (Got ${resD.status})`);
    assert(resD.body.reconciled === true, 'Response indicates reconciliation was applied');
    assert(resD.body.reconciledAmount === 501, `Reconciled amount is ₹501 (Got ${resD.body.reconciledAmount})`);

    // Verify database state after deletion
    const updatedCustomer = await User.findById(customerUser._id);
    const updatedVipCard = await VipMasterCard.findById(vipCard._id);
    const deletedWtx = await WalletTransaction.findById(vipWithdrawalTx._id);

    assert(deletedWtx === null, 'WalletTransaction document was purged');
    assert(updatedCustomer.wallet === 1000, `Customer wallet restored from ₹499 to ₹1000 (Got ₹${updatedCustomer.wallet})`);
    assert(updatedCustomer.withdrawals.length === 0, `Pending withdrawal subdocument removed from user.withdrawals (Got ${updatedCustomer.withdrawals.length})`);
    assert(updatedVipCard.totalWithdrawn === 0, `VIP card totalWithdrawn decremented from ₹501 to ₹0 (Got ₹${updatedVipCard.totalWithdrawn})`);

    // Clean up test customer data
    await User.deleteMany({ _id: customerUser._id });
    await WalletTransaction.deleteMany({ userId: customerUser._id });
    await VipMasterCard.deleteMany({ userId: customerUser._id });

    console.log(`\n========================================`);
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
