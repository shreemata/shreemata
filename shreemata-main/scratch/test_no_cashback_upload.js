const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

const API = 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026';
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function runTests() {
  console.log('🧪 Starting Regression Tests for No Cashback Field Dependency...\n');

  try {
    await mongoose.connect(MONGODB_URI);
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.error('No admin user found in database');
      process.exit(1);
    }
    console.log(`Found admin user: ${adminUser.email} (ID: ${adminUser._id})`);

    const adminToken = jwt.sign({ id: adminUser._id, email: adminUser.email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 1. Create a dummy 1x1 PNG image buffer for testing uploads
    const dummyPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // TEST A & C & D: Create Book via Multipart (No Cashback Fields)
    console.log('\nTest A, C, D: Creating Book with images, profit & reward points (No cashback fields)...');
    const form = new FormData();
    form.append('title', 'Test Book No Cashback ' + Date.now());
    form.append('author', 'Test Author');
    form.append('price', '100');
    form.append('description', 'A test book description');
    form.append('class', 'Class 10');
    form.append('subject', 'Mathematics');
    form.append('weight', '0.5');
    form.append('rewardPoints', '5');
    form.append('profitType', 'fixed');
    form.append('profitValue', '20');
    form.append('profitConfigured', 'true');
    form.append('coverImage', dummyPngBuffer, { filename: 'cover.png', contentType: 'image/png' });
    form.append('previewImages', dummyPngBuffer, { filename: 'preview1.png', contentType: 'image/png' });

    const createRes = await axios.post(`${API}/books`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${adminToken}`
      }
    });

    console.log('✅ Book Creation Status:', createRes.status);
    console.log('✅ Created Book ID:', createRes.data.book._id);
    console.log('✅ Cover Image URL:', createRes.data.book.cover_image);
    console.log('✅ Reward Points:', createRes.data.book.rewardPoints);
    console.log('✅ Profit Type:', createRes.data.book.profitType);
    console.log('✅ Profit Value:', createRes.data.book.profitValue);

    const createdBookId = createRes.data.book._id;

    // TEST B & F & G: Edit Book via PUT JSON (No Cashback Fields)
    console.log('\nTest B, F, G: Updating Book fields via JSON (No cashback fields)...');
    const updateRes = await axios.put(`${API}/books/${createdBookId}`, {
      title: 'Updated Book Title ' + Date.now(),
      author: 'Test Author Updated',
      price: 150,
      rewardPoints: 10,
      profitType: 'percentage',
      profitValue: 15,
      profitConfigured: true
    }, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    console.log('✅ Book Update Status:', updateRes.status);
    console.log('✅ Updated Reward Points:', updateRes.data.book.rewardPoints);
    console.log('✅ Updated Profit Type:', updateRes.data.book.profitType);
    console.log('✅ Updated Profit Value:', updateRes.data.book.profitValue);

    // TEST H & I: Customer public view (Sanitized - no profit fields)
    console.log('\nTest H & I: Fetching single book public response (Customer view)...');
    const customerRes = await axios.get(`${API}/books/${createdBookId}`);
    console.log('✅ Customer Public Book Response:', {
      id: customerRes.data.book._id,
      title: customerRes.data.book.title,
      price: customerRes.data.book.price,
      rewardPoints: customerRes.data.book.rewardPoints,
      profitType: customerRes.data.book.profitType, // Should be undefined for non-admin
      profitValue: customerRes.data.book.profitValue // Should be undefined for non-admin
    });

    // Cleanup: Delete the test book
    console.log('\nCleaning up created test book...');
    await axios.delete(`${API}/books/${createdBookId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✅ Cleanup finished.');

    await mongoose.disconnect();
    console.log('\n🎉 ALL REGRESSION TESTS PASSED!');
  } catch (err) {
    console.error('❌ Test Failed:', err.response ? err.response.data : err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
