const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const User = require('../models/User');

async function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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
    req.end();
  });
}

async function runDashboardTests() {
  console.log('🚀 TESTING ADMIN OPERATIONS DASHBOARD API...\n');
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

    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

    // 1. Fetch Existing Admin
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) throw new Error("No admin found in DB");
    const adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, jwtSecret, { expiresIn: '1h' });

    // 2. Create Test Customer
    const testCustomer = await User.create({
      name: `Dashboard Test Customer ${Date.now()}`,
      email: `dash_test_${Date.now()}@example.com`,
      phone: `95${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      role: 'user',
      wallet: 300
    });
    const customerToken = jwt.sign({ id: testCustomer._id, role: 'user' }, jwtSecret, { expiresIn: '1h' });

    console.log('--- TEST 1: Admin Accesses Operations Dashboard (HTTP 200) ---');
    const resAdmin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/dashboard/operations?period=today',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    assert(resAdmin.status === 200, `Admin access returns HTTP 200 (Got ${resAdmin.status})`);
    assert(resAdmin.body.success === true, 'Response body success is true');
    const data = resAdmin.body.data;
    assert(data && typeof data.kpis === 'object', 'Data contains kpis object');
    assert(data && Array.isArray(data.actionRequired), 'Data contains actionRequired array');
    assert(data && typeof data.financialOverview === 'object', 'Data contains financialOverview object');
    assert(data && typeof data.inventoryAlerts === 'object', 'Data contains inventoryAlerts object');
    assert(data && typeof data.customersAndMembership === 'object', 'Data contains customersAndMembership object');
    assert(data && typeof data.referralNetwork === 'object', 'Data contains referralNetwork object');
    assert(data && typeof data.vipMasterCards === 'object', 'Data contains vipMasterCards object');
    assert(data && Array.isArray(data.sevenDaysSales), 'Data contains sevenDaysSales array');

    console.log('\n--- TEST 2: Customer Access Is Blocked (RBAC HTTP 403) ---');
    const resCustomer = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/dashboard/operations?period=today',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    });

    assert(resCustomer.status === 403, `Customer blocked with HTTP 403 (Got ${resCustomer.status})`);

    console.log('\n--- TEST 3: Unauthenticated Access Is Blocked (HTTP 401) ---');
    const resNoAuth = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/dashboard/operations?period=today',
      method: 'GET'
    });

    assert(resNoAuth.status === 401, `No auth blocked with HTTP 401 (Got ${resNoAuth.status})`);

    console.log('\n--- TEST 4: Date Period Filtering (7days, 30days, this_month) ---');
    const res7Days = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/dashboard/operations?period=7days',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert(res7Days.status === 200 && res7Days.body.data.period === '7days', '7 Days period filtering works correctly');

    // Clean up test customer
    await User.deleteMany({ _id: testCustomer._id });

    console.log(`\n========================================`);
    console.log(`DASHBOARD TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    else process.exit(0);

  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runDashboardTests();
