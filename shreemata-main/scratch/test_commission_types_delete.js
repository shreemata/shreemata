const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const User = require('../models/User');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');

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
  console.log('🚀 TESTING CASHBACK & COMMISSION TYPES DELETIONS...\n');
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

    const adminUser = await User.findOne({ role: 'admin' });
    const adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, jwtSecret, { expiresIn: '1h' });

    const customerUser = await User.create({
      name: `Test Comm User ${timestamp}`,
      email: `test_comm_${timestamp}@example.com`,
      phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      role: 'user',
      wallet: 500
    });
    const customerToken = jwt.sign({ id: customerUser._id, role: 'user' }, jwtSecret, { expiresIn: '1h' });

    // Test 1: Cashback Deletion
    const order = await Order.create({
      user_id: customerUser._id,
      items: [],
      totalAmount: 1000,
      status: 'completed'
    });
    const cashbackTxId = `${order._id}_cashback`;

    const resCashback = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${cashbackTxId}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { recordId: order._id.toString(), sourceType: 'cashback' });

    assert(resCashback.status === 200, 'Cashback delete returned HTTP 200');
    const updatedCustomer1 = await User.findById(customerUser._id);
    assert(updatedCustomer1.adminDeletedTransactions.includes(cashbackTxId), 'Target user document has cashbackTxId in adminDeletedTransactions');

    // Test 2: Direct Commission Deletion
    const commTx = await CommissionTransaction.create({
      orderId: order._id,
      orderAmount: 1000,
      purchaser: customerUser._id,
      directReferrer: customerUser._id,
      directCommissionAmount: 50,
      treeCommissions: []
    });
    const directTxId = `${commTx._id}_direct`;

    const resDirect = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/commission/transactions/${directTxId}`,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { recordId: commTx._id.toString(), sourceType: 'commission_direct' });

    assert(resDirect.status === 200, 'Direct commission delete returned HTTP 200');
    const updatedCustomer2 = await User.findById(customerUser._id);
    assert(updatedCustomer2.adminDeletedTransactions.includes(directTxId), 'Target user document has directTxId in adminDeletedTransactions');

    // Clean up
    await User.deleteMany({ _id: customerUser._id });
    await Order.deleteMany({ _id: order._id });
    await CommissionTransaction.deleteMany({ _id: commTx._id });

    console.log(`\n========================================`);
    console.log(`COMMISSION DELETIONS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    else process.exit(0);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
