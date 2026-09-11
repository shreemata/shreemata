// scratch/test_book_edit_profit_persistence.js
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

async function runTests() {
  console.log('🧪 Starting Edit Book Profit / Reward Points Persistence Regression Tests...\n');
  const results = {};

  let createdBookId = null;

  try {
    // Connect to MongoDB to verify direct DB values
    await mongoose.connect(process.env.MONGODB_URI);
    const Book = require('../models/Book');
    const User = require('../models/User');

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('Creating temporary admin user...');
      admin = await User.create({
        name: 'Test Admin',
        email: `admin_${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        phone: '9999999999'
      });
    }

    const adminToken = jwt.sign(
      { id: admin._id.toString(), role: 'admin', email: admin.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------
    // Step 1: Create a test book with Selling Price = ₹100, Fixed Profit = ₹20, Reward Points = 1
    // -------------------------------------------------------------
    console.log('--- TEST 1: Create Book with Fixed Profit ₹20, Reward Points = 1 ---');
    const createPayload = {
      title: `Test Persistence Book ${Date.now()}`,
      author: 'Test Author',
      price: 100,
      description: 'A test book for profit persistence',
      class: '10',
      subject: 'Science',
      weight: 0.5,
      cover_image: 'https://res.cloudinary.com/degwjha60/image/upload/v1/test_cover.jpg',
      preview_images: [],
      rewardPoints: 1,
      profitType: 'fixed',
      profitValue: 20,
      profitConfigured: true,
      cashbackAmount: 0,
      cashbackPercentage: 0
    };

    const createRes = await axios.post(`${BASE_URL}/books`, createPayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    createdBookId = createRes.data.book._id;
    console.log('✅ Created Book ID:', createdBookId);

    // Verify initial creation
    const dbBook1 = await Book.findById(createdBookId);
    console.log('DB State after creation:', {
      profitType: dbBook1.profitType,
      profitValue: dbBook1.profitValue,
      profitConfigured: dbBook1.profitConfigured,
      rewardPoints: dbBook1.rewardPoints,
      cashbackAmount: dbBook1.cashbackAmount,
      cashbackPercentage: dbBook1.cashbackPercentage
    });

    if (
      dbBook1.profitType === 'fixed' &&
      dbBook1.profitValue === 20 &&
      dbBook1.profitConfigured === true &&
      dbBook1.rewardPoints === 1
    ) {
      results['Initial Book Creation'] = 'PASS';
    } else {
      results['Initial Book Creation'] = 'FAIL';
    }

    // -------------------------------------------------------------
    // Step 2: Fetch via Admin GET API and verify fields are present (not sanitized)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Admin GET Single Book (Edit Modal loading) ---');
    const adminGetRes = await axios.get(`${BASE_URL}/books/${createdBookId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const loadedBook = adminGetRes.data.book;
    console.log('Admin GET Book Data:', {
      profitType: loadedBook.profitType,
      profitValue: loadedBook.profitValue,
      profitConfigured: loadedBook.profitConfigured,
      rewardPoints: loadedBook.rewardPoints,
      cashbackAmount: loadedBook.cashbackAmount,
      cashbackPercentage: loadedBook.cashbackPercentage
    });

    results['Admin GET returns profitType'] = loadedBook.profitType === 'fixed' ? 'PASS' : 'FAIL';
    results['Admin GET returns profitValue'] = loadedBook.profitValue === 20 ? 'PASS' : 'FAIL';
    results['Admin GET returns rewardPoints'] = loadedBook.rewardPoints === 1 ? 'PASS' : 'FAIL';

    // Verify Public GET sanitizes profit fields
    const publicGetRes = await axios.get(`${BASE_URL}/books/${createdBookId}`);
    results['Public GET sanitizes profit fields'] = (publicGetRes.data.book.profitType === undefined && publicGetRes.data.book.profitValue === undefined) ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------
    // Step 3: Edit Book: Fixed Profit ₹30, Reward Points = 5 (JSON Edit Path)
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Update Book to Fixed Profit ₹30, Reward Points = 5 (JSON edit without images) ---');
    const updateJsonPayload = {
      title: createPayload.title,
      author: createPayload.author,
      price: 100,
      description: createPayload.description,
      class: '10',
      subject: 'Science',
      weight: 0.5,
      rewardPoints: 5,
      cashbackAmount: 0,
      cashbackPercentage: 0,
      profitType: 'fixed',
      profitValue: 30,
      profitConfigured: true
    };

    const updateRes1 = await axios.put(`${BASE_URL}/books/${createdBookId}`, updateJsonPayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const dbBook2 = await Book.findById(createdBookId);
    console.log('DB State after Update 1:', {
      profitType: dbBook2.profitType,
      profitValue: dbBook2.profitValue,
      profitConfigured: dbBook2.profitConfigured,
      rewardPoints: dbBook2.rewardPoints
    });

    results['Fixed -> Fixed profit update (₹20 -> ₹30)'] = dbBook2.profitValue === 30 && dbBook2.profitType === 'fixed' ? 'PASS' : 'FAIL';
    results['Reward points update (1 -> 5)'] = dbBook2.rewardPoints === 5 ? 'PASS' : 'FAIL';
    results['ProfitConfigured persists true'] = dbBook2.profitConfigured === true ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------
    // Step 4: Edit Book: Change Profit Method to Percentage 25%
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Update Book to Percentage Profit 25% ---');
    const updatePercentPayload = {
      title: createPayload.title,
      author: createPayload.author,
      price: 100,
      description: createPayload.description,
      class: '10',
      subject: 'Science',
      weight: 0.5,
      rewardPoints: 5,
      cashbackAmount: 0,
      cashbackPercentage: 0,
      profitType: 'percentage',
      profitValue: 25,
      profitConfigured: true
    };

    await axios.put(`${BASE_URL}/books/${createdBookId}`, updatePercentPayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const dbBook3 = await Book.findById(createdBookId);
    console.log('DB State after Update 2 (Percentage):', {
      profitType: dbBook3.profitType,
      profitValue: dbBook3.profitValue,
      profitConfigured: dbBook3.profitConfigured
    });

    results['Fixed -> Percentage edit (25%)'] = dbBook3.profitType === 'percentage' && dbBook3.profitValue === 25 ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------
    // Step 5: Edit Book: Change back Percentage -> Fixed ₹40
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Update Book Percentage -> Fixed ₹40 ---');
    const updateFixedBackPayload = {
      profitType: 'fixed',
      profitValue: 40,
      profitConfigured: true,
      rewardPoints: 7
    };

    await axios.put(`${BASE_URL}/books/${createdBookId}`, updateFixedBackPayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const dbBook4 = await Book.findById(createdBookId);
    results['Percentage -> Fixed edit (₹40)'] = dbBook4.profitType === 'fixed' && dbBook4.profitValue === 40 && dbBook4.rewardPoints === 7 ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------
    // Step 6: Test Optional Cashback Persistence
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Update Optional Cashback (Amount ₹5, then Percentage 10%) ---');
    await axios.put(`${BASE_URL}/books/${createdBookId}`, {
      cashbackAmount: 5,
      cashbackPercentage: 0,
      profitType: 'fixed',
      profitValue: 40,
      profitConfigured: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const dbBook5a = await Book.findById(createdBookId);
    const cbAmountPass = dbBook5a.cashbackAmount === 5 && dbBook5a.cashbackPercentage === 0;

    await axios.put(`${BASE_URL}/books/${createdBookId}`, {
      cashbackAmount: 0,
      cashbackPercentage: 10,
      profitType: 'fixed',
      profitValue: 40,
      profitConfigured: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const dbBook5b = await Book.findById(createdBookId);
    const cbPercentPass = dbBook5b.cashbackAmount === 0 && dbBook5b.cashbackPercentage === 10;

    results['Optional cashback persistence (₹5 and 10%)'] = (cbAmountPass && cbPercentPass) ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------
    // Step 7: Multipart FormData Edit Path (with image/files simulation)
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Update Book via Multipart FormData ---');
    const form = new FormData();
    form.append('title', 'Updated via Multipart');
    form.append('author', 'Author Multipart');
    form.append('price', '150');
    form.append('weight', '0.6');
    form.append('rewardPoints', '12');
    form.append('cashbackAmount', '0');
    form.append('cashbackPercentage', '5');
    form.append('profitType', 'fixed');
    form.append('profitValue', '45');
    form.append('profitConfigured', 'true');

    await axios.put(`${BASE_URL}/books/${createdBookId}`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${adminToken}`
      }
    });

    const dbBook6 = await Book.findById(createdBookId);
    console.log('DB State after Multipart Update:', {
      title: dbBook6.title,
      price: dbBook6.price,
      rewardPoints: dbBook6.rewardPoints,
      cashbackPercentage: dbBook6.cashbackPercentage,
      profitType: dbBook6.profitType,
      profitValue: dbBook6.profitValue,
      profitConfigured: dbBook6.profitConfigured
    });

    results['Multipart FormData edit persistence'] = (
      dbBook6.profitType === 'fixed' &&
      dbBook6.profitValue === 45 &&
      dbBook6.rewardPoints === 12 &&
      dbBook6.cashbackPercentage === 5 &&
      dbBook6.profitConfigured === true
    ) ? 'PASS' : 'FAIL';

    // Clean up test book
    await Book.findByIdAndDelete(createdBookId);
    console.log('\n🧹 Test book cleaned up.');

  } catch (err) {
    console.error('❌ Test failed with error:', err.response?.data || err.message);
    if (createdBookId) {
      try {
        const Book = require('../models/Book');
        await Book.findByIdAndDelete(createdBookId);
      } catch (cleanupErr) {}
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n==================================================');
  console.log('           REGRESSION TEST RESULTS SUMMARY         ');
  console.log('==================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(results)) {
    console.log(`${name.padEnd(50)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }
  console.log('==================================================');
  console.log(`FINAL RESULT: ${allPass ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'}`);
  return allPass;
}

runTests();
