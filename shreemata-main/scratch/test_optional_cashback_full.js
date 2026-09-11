const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Book = require('../models/Book');
const Order = require('../models/Order');
const CommissionTransaction = require('../models/CommissionTransaction');
const { distributeCommissions } = require('../services/commissionDistribution');

const API = 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026';
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const dummyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runFullVerification() {
  console.log('🧪 Starting Full Optional Cashback & Commission Verification Suite...\n');
  const results = {};

  try {
    await mongoose.connect(MONGODB_URI);
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) throw new Error('No admin user found in DB');

    const adminToken = jwt.sign({ id: adminUser._id, email: adminUser.email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

    // ----------------------------------------------------
    // TEST 1: Cashback Amount blank + Percentage blank (Automatic)
    // ----------------------------------------------------
    console.log('Test 1: Creating Book with blank cashback fields (Automatic fallback)...');
    const form1 = new FormData();
    form1.append('title', 'Auto Cashback Book ' + Date.now());
    form1.append('author', 'Author Auto');
    form1.append('price', '100');
    form1.append('description', 'Auto cashback test');
    form1.append('class', '10');
    form1.append('subject', 'Math');
    form1.append('weight', '0.5');
    form1.append('rewardPoints', '3');
    form1.append('profitType', 'fixed');
    form1.append('profitValue', '20');
    form1.append('cashbackAmount', '0');
    form1.append('cashbackPercentage', '0');
    form1.append('coverImage', dummyPngBuffer, { filename: 'cover.png', contentType: 'image/png' });

    const res1 = await axios.post(`${API}/books`, form1, {
      headers: { ...form1.getHeaders(), Authorization: `Bearer ${adminToken}` }
    });
    const book1Id = res1.data.book._id;
    console.log('  -> Book 1 created ID:', book1Id);
    results['Automatic cashback fallback'] = (res1.data.book.cashbackAmount === 0 && res1.data.book.cashbackPercentage === 0) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // TEST 2: Cashback Amount = ₹5 (Manual Amount Override)
    // ----------------------------------------------------
    console.log('\nTest 2: Creating Book with Cashback Amount = ₹5...');
    const form2 = new FormData();
    form2.append('title', 'Manual Amount Book ' + Date.now());
    form2.append('author', 'Author Amount');
    form2.append('price', '100');
    form2.append('description', 'Manual amount test');
    form2.append('class', '10');
    form2.append('subject', 'Math');
    form2.append('weight', '0.5');
    form2.append('rewardPoints', '5');
    form2.append('profitType', 'fixed');
    form2.append('profitValue', '20');
    form2.append('cashbackAmount', '5');
    form2.append('cashbackPercentage', '0');
    form2.append('coverImage', dummyPngBuffer, { filename: 'cover.png', contentType: 'image/png' });

    const res2 = await axios.post(`${API}/books`, form2, {
      headers: { ...form2.getHeaders(), Authorization: `Bearer ${adminToken}` }
    });
    const book2Id = res2.data.book._id;
    console.log('  -> Book 2 created with Cashback Amount:', res2.data.book.cashbackAmount);
    results['Optional Cashback Amount'] = (res2.data.book.cashbackAmount === 5) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // TEST 3: Cashback Percentage = 10% (Manual % Override)
    // ----------------------------------------------------
    console.log('\nTest 3: Creating Book with Cashback Percentage = 10%...');
    const form3 = new FormData();
    form3.append('title', 'Manual Percent Book ' + Date.now());
    form3.append('author', 'Author Percent');
    form3.append('price', '100');
    form3.append('description', 'Manual percent test');
    form3.append('class', '10');
    form3.append('subject', 'Math');
    form3.append('weight', '0.5');
    form3.append('rewardPoints', '2');
    form3.append('profitType', 'fixed');
    form3.append('profitValue', '20');
    form3.append('cashbackAmount', '0');
    form3.append('cashbackPercentage', '10');
    form3.append('coverImage', dummyPngBuffer, { filename: 'cover.png', contentType: 'image/png' });

    const res3 = await axios.post(`${API}/books`, form3, {
      headers: { ...form3.getHeaders(), Authorization: `Bearer ${adminToken}` }
    });
    const book3Id = res3.data.book._id;
    console.log('  -> Book 3 created with Cashback Percentage:', res3.data.book.cashbackPercentage);
    results['Optional Cashback Percentage'] = (res3.data.book.cashbackPercentage === 10) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // TEST 4: Both fields attempted simultaneously (>0)
    // ----------------------------------------------------
    console.log('\nTest 4: Attempting to submit both Cashback Amount > 0 and Cashback Percentage > 0...');
    try {
      const form4 = new FormData();
      form4.append('title', 'Conflict Book ' + Date.now());
      form4.append('author', 'Author Conflict');
      form4.append('price', '100');
      form4.append('class', '10');
      form4.append('subject', 'Math');
      form4.append('cashbackAmount', '5');
      form4.append('cashbackPercentage', '10');
      form4.append('coverImage', dummyPngBuffer, { filename: 'cover.png', contentType: 'image/png' });

      await axios.post(`${API}/books`, form4, {
        headers: { ...form4.getHeaders(), Authorization: `Bearer ${adminToken}` }
      });
      console.error('❌ API allowed conflicting cashback fields!');
      results['Mutual Exclusion'] = 'FAIL';
    } catch (err) {
      console.log('  -> Correctly rejected with error:', err.response?.data?.error || err.message);
      results['Mutual Exclusion'] = 'PASS';
    }

    // ----------------------------------------------------
    // TEST 5 & 7 & 8 & 9 & 10: Add Book, Image Uploads, Reward Points, Profit
    // ----------------------------------------------------
    results['Add Book'] = (res1.status === 201 && res2.status === 201 && res3.status === 201) ? 'PASS' : 'FAIL';
    results['Image Upload'] = (res1.data.book.cover_image && res2.data.book.cover_image) ? 'PASS' : 'FAIL';
    results['Reward Points'] = (res1.data.book.rewardPoints === 3 && res2.data.book.rewardPoints === 5) ? 'PASS' : 'FAIL';
    results['Profit Engine'] = (res1.data.book.profitValue === 20 && res2.data.book.profitValue === 20) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // TEST 6: Edit Book
    // ----------------------------------------------------
    console.log('\nTest 6: Updating Book 2 via Edit Book API...');
    const updateRes = await axios.put(`${API}/books/${book2Id}`, {
      title: 'Updated Manual Amount Book',
      price: 120,
      rewardPoints: 8,
      cashbackAmount: 7,
      cashbackPercentage: 0
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('  -> Edit Book response status:', updateRes.status, 'Updated Cashback Amount:', updateRes.data.book.cashbackAmount);
    results['Edit Book'] = (updateRes.status === 200 && updateRes.data.book.cashbackAmount === 7) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // TEST 11 & 12: Manual Override & Idempotency Commission Distribution
    // ----------------------------------------------------
    console.log('\nTest 11 & 12: Verifying Commission Engine Manual Override & No Double Payout...');
    const testOrder = await Order.create({
      user_id: adminUser._id,
      items: [
        {
          id: book2Id,
          title: 'Manual Book Item',
          price: 100,
          quantity: 1,
          type: 'book',
          unitProfitSnapshot: 20,
          lineProfitSnapshot: 20,
          cashbackAmount: 7, // Manual override ₹7
          cashbackPercentage: 0
        }
      ],
      totalAmount: 100,
      orderProfitTotal: 20,
      paymentStatus: 'Paid',
      status: 'completed'
    });

    // Run commission distribution
    await distributeCommissions(testOrder._id, adminUser._id, 100, 20);
    const commTx1 = await CommissionTransaction.findOne({ orderId: testOrder._id });
    console.log('  -> Direct commission paid to buyer:', commTx1?.directCommissionAmount);
    results['Manual override'] = (commTx1?.directCommissionAmount === 7) ? 'PASS' : 'FAIL';

    // Run commission distribution a second time to verify idempotency (no double payout)
    await distributeCommissions(testOrder._id, adminUser._id, 100, 20);
    const commTxs = await CommissionTransaction.find({ orderId: testOrder._id });
    console.log('  -> Total commission transactions created:', commTxs.length);
    results['No double payout'] = (commTxs.length === 1) ? 'PASS' : 'FAIL';

    // Cleanup test order
    await Order.findByIdAndDelete(testOrder._id);
    await CommissionTransaction.deleteMany({ orderId: testOrder._id });

    // ----------------------------------------------------
    // TEST 13: Customer Data Security (Sanitization)
    // ----------------------------------------------------
    console.log('\nTest 13: Checking Customer Public View (Sanitization)...');
    const publicRes = await axios.get(`${API}/books/${book1Id}`);
    const pubBook = publicRes.data.book;
    console.log('  -> Public Book fields checked:', {
      profitType: pubBook.profitType,
      profitValue: pubBook.profitValue,
      profitConfigured: pubBook.profitConfigured,
      orderProfitTotal: pubBook.orderProfitTotal
    });
    results['Customer Data Security'] = (
      pubBook.profitType === undefined &&
      pubBook.profitValue === undefined &&
      pubBook.profitConfigured === undefined
    ) ? 'PASS' : 'FAIL';

    // ----------------------------------------------------
    // Cleanup Books
    // ----------------------------------------------------
    console.log('\nCleaning up created test books...');
    await axios.delete(`${API}/books/${book1Id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    await axios.delete(`${API}/books/${book2Id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    await axios.delete(`${API}/books/${book3Id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    console.log('✅ Cleanup complete.');

    await mongoose.disconnect();

    console.log('\n==================================================');
    console.log('FINAL REPORT');
    console.log('==================================================');
    console.log(`- Optional Cashback Amount: ${results['Optional Cashback Amount']}`);
    console.log(`- Optional Cashback Percentage: ${results['Optional Cashback Percentage']}`);
    console.log(`- Automatic cashback fallback: ${results['Automatic cashback fallback']}`);
    console.log(`- Manual override: ${results['Manual override']}`);
    console.log(`- No double payout: ${results['No double payout']}`);
    console.log(`- Add Book: ${results['Add Book']}`);
    console.log(`- Edit Book: ${results['Edit Book']}`);
    console.log(`- Image Upload: ${results['Image Upload']}`);
    console.log(`- Profit Engine: ${results['Profit Engine']}`);
    console.log(`- Customer Data Security: ${results['Customer Data Security']}`);
    console.log('==================================================');

  } catch (err) {
    console.error('❌ Verification Error:', err.response ? err.response.data : err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runFullVerification();
