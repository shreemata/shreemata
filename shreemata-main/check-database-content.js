// Load environment variables
require('dotenv').config();

// Check what content exists in the database
const mongoose = require('mongoose');
const Book = require('./models/Book');
const Bundle = require('./models/Bundle');

// Connect to MongoDB using the same connection as the app
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/shree-mata';
console.log('🔗 Connecting to database...');
console.log('📍 Database host:', mongoUri.split('@')[1]?.split('/')[0] || 'localhost');

mongoose.connect(mongoUri);

async function checkDatabaseContent() {
  try {
    console.log('🔍 Checking database content...\n');
    
    // Check books
    const books = await Book.find();
    console.log(`📚 Books in database: ${books.length}`);
    
    if (books.length > 0) {
      console.log('\n📋 Sample books:');
      books.slice(0, 5).forEach((book, index) => {
        console.log(`${index + 1}. ${book.title} - ₹${book.price}`);
      });
      if (books.length > 5) {
        console.log(`... and ${books.length - 5} more books`);
      }
    } else {
      console.log('❌ No books found! You need to add books first.');
    }
    
    // Check bundles
    const bundles = await Bundle.find();
    console.log(`\n📦 Bundles in database: ${bundles.length}`);
    
    if (bundles.length > 0) {
      console.log('\n📋 Bundles:');
      bundles.forEach((bundle, index) => {
        console.log(`${index + 1}. ${bundle.name} - ₹${bundle.bundlePrice} (Active: ${bundle.isActive})`);
      });
    } else {
      console.log('❌ No bundles found!');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY:');
    console.log('='.repeat(50));
    
    if (books.length === 0) {
      console.log('🎯 NEXT STEPS:');
      console.log('1. 📚 Add books through Admin Panel:');
      console.log('   - Go to http://localhost:3000/admin.html');
      console.log('   - Login as admin');
      console.log('   - Go to "Books" section');
      console.log('   - Add at least 2-3 books');
      console.log('');
      console.log('2. 📦 Create bundles:');
      console.log('   - Go to "Bundles" section in admin');
      console.log('   - Create bundles using the books you added');
      console.log('   - Make sure bundles are set as "Active"');
      console.log('');
      console.log('3. 🔄 Refresh home page to see bundles');
    } else if (bundles.length === 0) {
      console.log('🎯 NEXT STEPS:');
      console.log('1. 📦 Create bundles using existing books:');
      console.log('   - Go to http://localhost:3000/admin.html');
      console.log('   - Go to "Bundles" section');
      console.log('   - Create bundles using your existing books');
      console.log('   - Make sure bundles are set as "Active"');
      console.log('');
      console.log('2. 🔄 Refresh home page to see bundles');
    } else {
      const activeBundles = bundles.filter(b => b.isActive);
      if (activeBundles.length === 0) {
        console.log('🎯 ISSUE: All bundles are inactive!');
        console.log('💡 SOLUTION: Activate bundles in admin panel or run:');
        console.log('   node activate-bundles.js');
      } else {
        console.log('✅ Everything looks good!');
        console.log('🔄 Try refreshing the home page - bundles should appear.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkDatabaseContent();