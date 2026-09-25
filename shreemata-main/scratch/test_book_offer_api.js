const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Book = require('../models/Book');

async function testApi() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
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

    console.log('Got admin token for:', adminUser.email);

    // Test 1: Add Book with ₹125 MRP and ₹25 Flat Offer
    console.log('\n--- TEST 1: Add Book with ₹125 MRP & ₹25 Flat Offer ---');
    const resAdd = await fetch('http://localhost:3000/api/books', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Offer Book ₹125',
        author: 'Test Author',
        price: 125,
        physicalPrice: 125,
        discountEnabled: true,
        discountType: 'flat',
        discountValue: 25,
        sellingPrice: 100,
        class: '10',
        subject: 'Mathematics',
        cover_image: 'https://via.placeholder.com/150'
      })
    });

    const dataAdd = await resAdd.json();
    console.log('Add Book Status:', resAdd.status);
    console.log('Add Book Response:', dataAdd);

    if (!resAdd.ok || !dataAdd.book) {
      console.error('Add book failed');
      process.exit(1);
    }

    const createdBook = dataAdd.book;
    console.log('ASSERTIONS FOR ADD BOOK:');
    console.log('Physical Price:', createdBook.physicalPrice, '(Expected: 125)');
    console.log('Discount Enabled:', createdBook.discountEnabled, '(Expected: true)');
    console.log('Discount Type:', createdBook.discountType, '(Expected: flat)');
    console.log('Discount Value:', createdBook.discountValue, '(Expected: 25)');
    console.log('Selling Price:', createdBook.sellingPrice, '(Expected: 100)');
    console.log('Price Field:', createdBook.price, '(Expected: 100)');

    // Test 2: Edit Book — Turn Offer OFF
    console.log('\n--- TEST 2: Edit Book — Turn Offer OFF ---');
    const resEditOff = await fetch(`http://localhost:3000/api/books/${createdBook._id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Offer Book ₹125 (No Offer)',
        physicalPrice: 125,
        discountEnabled: false,
        discountType: 'flat',
        discountValue: 0
      })
    });

    const dataEditOff = await resEditOff.json();
    console.log('Edit Book Off Status:', resEditOff.status);
    console.log('Edit Book Off Response:', dataEditOff);

    const updatedOff = dataEditOff.book;
    console.log('ASSERTIONS FOR OFFER OFF:');
    console.log('Physical Price:', updatedOff.physicalPrice, '(Expected: 125)');
    console.log('Discount Enabled:', updatedOff.discountEnabled, '(Expected: false)');
    console.log('Selling Price:', updatedOff.sellingPrice, '(Expected: 125)');

    // Cleanup test book
    await Book.findByIdAndDelete(createdBook._id);
    console.log('\n✅ Cleaned up test book');
    process.exit(0);
  } catch (err) {
    console.error('API Test Error:', err);
    process.exit(1);
  }
}

testApi();
