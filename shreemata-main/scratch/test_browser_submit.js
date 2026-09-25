const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const FormData = require('form-data');
const fetch = require('node-fetch');
require('dotenv').config();

const User = require('../models/User');
const Book = require('../models/Book');

async function testSubmitFlow() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.error('No admin user found');
      process.exit(1);
    }

    const token = jwt.sign(
      { id: adminUser._id, role: adminUser.role, email: adminUser.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    console.log('Got admin token.');

    // Helper to simulate updateOfferCalculation
    function getOfferData(physicalPrice, isEnabled, discountType, discountVal) {
      if (!isEnabled) {
        return {
          valid: true,
          sellingPrice: physicalPrice,
          discountEnabled: false,
          discountType: 'flat',
          discountValue: 0,
          physicalPrice: physicalPrice
        };
      }
      let sellingPrice = 0;
      if (discountType === 'flat') {
        sellingPrice = Math.max(0, physicalPrice - discountVal);
      } else {
        sellingPrice = Math.max(0, physicalPrice - (physicalPrice * discountVal / 100));
      }
      return {
        valid: true,
        sellingPrice,
        discountEnabled: true,
        discountType,
        discountValue: discountVal,
        physicalPrice
      };
    }

    // ----------------------------------------------------
    // TEST 1: ADD BOOK - MULTIPART (FormData) - Offer OFF
    // ----------------------------------------------------
    console.log('\n--- TEST 1: ADD BOOK (FormData - Offer OFF) ---');
    const offer1 = getOfferData(125, false, 'flat', 0);
    const form1 = new FormData();
    form1.append('title', 'FormData Book Offer OFF');
    form1.append('author', 'Author 1');
    form1.append('price', String(offer1.sellingPrice));
    form1.append('physicalPrice', String(offer1.physicalPrice));
    form1.append('discountEnabled', String(offer1.discountEnabled));
    form1.append('discountType', offer1.discountType);
    form1.append('discountValue', String(offer1.discountValue));
    form1.append('sellingPrice', String(offer1.sellingPrice));
    form1.append('description', 'Test desc');
    form1.append('class', '10');
    form1.append('subject', 'Math');
    form1.append('weight', '0.5');
    form1.append('rewardPoints', '0');
    form1.append('cashbackAmount', '0');
    form1.append('cashbackPercentage', '0');
    form1.append('profitType', 'fixed');
    form1.append('profitValue', '0');
    form1.append('profitConfigured', 'true');
    form1.append('trackStock', 'true');
    form1.append('stockQuantity', '10');
    form1.append('lowStockThreshold', '5');
    form1.append('stockStatus', 'in_stock');
    form1.append('existingCoverRemoved', 'false');
    form1.append('retainedPreviewImages', '[]');

    // Dummy cover image file buffer
    form1.append('coverImage', Buffer.from('fake image content'), {
      filename: 'cover.jpg',
      contentType: 'image/jpeg'
    });

    const res1 = await fetch('http://localhost:3000/api/books', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form1.getHeaders()
      },
      body: form1
    });

    const data1 = await res1.json();
    console.log('Status:', res1.status);
    console.log('Response:', data1);

    let bookId1 = data1.book ? data1.book._id : null;

    // ----------------------------------------------------
    // TEST 2: ADD BOOK - MULTIPART (FormData) - Offer ON (MRP 125, Flat 25)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: ADD BOOK (FormData - Offer ON: MRP 125, Flat 25) ---');
    const offer2 = getOfferData(125, true, 'flat', 25);
    const form2 = new FormData();
    form2.append('title', 'FormData Book Offer ON');
    form2.append('author', 'Author 2');
    form2.append('price', String(offer2.sellingPrice));
    form2.append('physicalPrice', String(offer2.physicalPrice));
    form2.append('discountEnabled', String(offer2.discountEnabled));
    form2.append('discountType', offer2.discountType);
    form2.append('discountValue', String(offer2.discountValue));
    form2.append('sellingPrice', String(offer2.sellingPrice));
    form2.append('description', 'Test desc 2');
    form2.append('class', '10');
    form2.append('subject', 'Math');
    form2.append('weight', '0.5');
    form2.append('rewardPoints', '0');
    form2.append('cashbackAmount', '0');
    form2.append('cashbackPercentage', '0');
    form2.append('profitType', 'fixed');
    form2.append('profitValue', '0');
    form2.append('profitConfigured', 'true');
    form2.append('trackStock', 'true');
    form2.append('stockQuantity', '10');
    form2.append('lowStockThreshold', '5');
    form2.append('stockStatus', 'in_stock');
    form2.append('existingCoverRemoved', 'false');
    form2.append('retainedPreviewImages', '[]');

    form2.append('coverImage', Buffer.from('fake image content'), {
      filename: 'cover2.jpg',
      contentType: 'image/jpeg'
    });

    const res2 = await fetch('http://localhost:3000/api/books', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form2.getHeaders()
      },
      body: form2
    });

    const data2 = await res2.json();
    console.log('Status:', res2.status);
    console.log('Response:', data2);

    let bookId2 = data2.book ? data2.book._id : null;

    // ----------------------------------------------------
    // TEST 3: EDIT BOOK (JSON mode - no new image) - Enable Offer
    // ----------------------------------------------------
    if (bookId1) {
      console.log('\n--- TEST 3: EDIT BOOK (JSON - Enable Offer on Book 1) ---');
      const offer3 = getOfferData(125, true, 'flat', 25);
      const res3 = await fetch(`http://localhost:3000/api/books/${bookId1}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'FormData Book Offer OFF -> ON',
          author: 'Author 1',
          price: offer3.sellingPrice,
          physicalPrice: offer3.physicalPrice,
          discountEnabled: offer3.discountEnabled,
          discountType: offer3.discountType,
          discountValue: offer3.discountValue,
          sellingPrice: offer3.sellingPrice,
          description: 'Updated desc',
          class: '10',
          subject: 'Math',
          weight: 0.5,
          rewardPoints: 0,
          cashbackAmount: 0,
          cashbackPercentage: 0,
          profitType: 'fixed',
          profitValue: 0,
          profitConfigured: true,
          trackStock: true,
          stockQuantity: 10,
          lowStockThreshold: 5,
          stockStatus: 'in_stock'
        })
      });

      const data3 = await res3.json();
      console.log('Status:', res3.status);
      console.log('Response:', data3);
    }

    // ----------------------------------------------------
    // TEST 4: EDIT BOOK (FormData mode with coverImage) - Edit discount 25 -> 30
    // ----------------------------------------------------
    if (bookId2) {
      console.log('\n--- TEST 4: EDIT BOOK (FormData - Update discount 25 -> 30) ---');
      const offer4 = getOfferData(125, true, 'flat', 30);
      const form4 = new FormData();
      form4.append('title', 'FormData Book Offer ON (Updated 30)');
      form4.append('author', 'Author 2');
      form4.append('price', String(offer4.sellingPrice));
      form4.append('physicalPrice', String(offer4.physicalPrice));
      form4.append('discountEnabled', String(offer4.discountEnabled));
      form4.append('discountType', offer4.discountType);
      form4.append('discountValue', String(offer4.discountValue));
      form4.append('sellingPrice', String(offer4.sellingPrice));
      form4.append('description', 'Updated desc 2');
      form4.append('class', '10');
      form4.append('subject', 'Math');
      form4.append('weight', '0.5');
      form4.append('rewardPoints', '0');
      form4.append('cashbackAmount', '0');
      form4.append('cashbackPercentage', '0');
      form4.append('profitType', 'fixed');
      form4.append('profitValue', '0');
      form4.append('profitConfigured', 'true');
      form4.append('trackStock', 'true');
      form4.append('stockQuantity', '10');
      form4.append('lowStockThreshold', '5');
      form4.append('stockStatus', 'in_stock');
      form4.append('existingCoverRemoved', 'false');
      form4.append('retainedPreviewImages', '[]');

      form4.append('coverImage', Buffer.from('fake image content updated'), {
        filename: 'cover_updated.jpg',
        contentType: 'image/jpeg'
      });

      const res4 = await fetch(`http://localhost:3000/api/books/${bookId2}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...form4.getHeaders()
        },
        body: form4
      });

      const data4 = await res4.json();
      console.log('Status:', res4.status);
      console.log('Response:', data4);
    }

    // Cleanup created books
    if (bookId1) await Book.findByIdAndDelete(bookId1);
    if (bookId2) await Book.findByIdAndDelete(bookId2);
    console.log('\nCleaned up test books.');
    process.exit(0);

  } catch (err) {
    console.error('Error running submit flow test:', err);
    process.exit(1);
  }
}

testSubmitFlow();
