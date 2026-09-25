const fetch = require('node-fetch');
const mongoose = require('mongoose');
require('dotenv').config();

const Book = require('../models/Book');
const { getBookDisplayPricing } = require('../utils/pricingHelper');

async function testCustomerOfferDisplay() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // Create a sample book with ₹125 MRP & ₹25 Flat Offer
    const sampleBook = await Book.create({
      title: 'Kannada Class 10 Customer Offer Test Book',
      author: 'Shree Mata Author',
      price: 100,
      physicalPrice: 125,
      discountEnabled: true,
      discountType: 'flat',
      discountValue: 25,
      sellingPrice: 100,
      class: '10',
      subject: 'Kannada'
    });

    console.log('Created test book ID:', sampleBook._id);

    // Fetch from public GET /api/books
    const resList = await fetch('http://localhost:3000/api/books');
    const dataList = await resList.json();
    console.log('GET /api/books status:', resList.status);

    const fetchedFromList = dataList.books.find(b => b._id.toString() === sampleBook._id.toString());
    console.log('Fetched from GET /api/books:');
    console.log('Title:', fetchedFromList.title);
    console.log('Physical Price (MRP):', fetchedFromList.physicalPrice);
    console.log('Selling Price:', fetchedFromList.sellingPrice);
    console.log('Discount Enabled:', fetchedFromList.discountEnabled);
    console.log('Discount Type:', fetchedFromList.discountType);
    console.log('Discount Value:', fetchedFromList.discountValue);

    const pricingList = getBookDisplayPricing(fetchedFromList);
    console.log('\n--- HOMEPAGE PRODUCT CARD DISPLAY HELPER RESULT ---');
    console.log('hasOffer:', pricingList.hasOffer);
    console.log('MRP:', pricingList.mrp);
    console.log('Selling Price:', pricingList.sellingPrice);
    console.log('Discount Percentage:', pricingList.discountPercentage + '% OFF');
    console.log('Savings:', 'Save ₹' + pricingList.discountAmount);

    // Fetch from public GET /api/books/:id
    const resSingle = await fetch(`http://localhost:3000/api/books/${sampleBook._id}`);
    const dataSingle = await resSingle.json();
    console.log('\nGET /api/books/:id status:', resSingle.status);
    const pricingSingle = getBookDisplayPricing(dataSingle.book);
    console.log('--- BOOK DETAILS PAGE DISPLAY HELPER RESULT ---');
    console.log('hasOffer:', pricingSingle.hasOffer);
    console.log('MRP:', pricingSingle.mrp);
    console.log('Selling Price:', pricingSingle.sellingPrice);
    console.log('Discount Percentage:', pricingSingle.discountPercentage + '% OFF');
    console.log('Savings:', 'You Save ₹' + pricingSingle.discountAmount);

    // Clean up sample book
    await Book.findByIdAndDelete(sampleBook._id);
    console.log('\n✅ Test book cleaned up successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Customer Offer Display Test Error:', err);
    process.exit(1);
  }
}

testCustomerOfferDisplay();
