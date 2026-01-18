require('dotenv').config();
const mongoose = require('mongoose');
const AdminSettings = require('./models/AdminSettings');
const User = require('./models/User');
const Book = require('./models/Book');

async function checkUserData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get admin settings
    const settings = await AdminSettings.getSettings();
    console.log('\n📊 Current Admin Settings:');
    console.log('Virtual Tree Cost:', settings.virtualTreeSettings.pointsPerVirtualTree);
    console.log('Max Virtual Trees:', settings.virtualTreeSettings.maxVirtualTreesPerUser);
    console.log('Cash Conversion:', settings.cashConversionSettings.pointsPerConversion, 'points =', settings.cashConversionSettings.cashPerConversion, 'rupees');
    
    // Check book cashback rates
    const books = await Book.find({}).select('title cashbackAmount rewardPoints');
    console.log('\n📚 Book Cashback & Points:');
    books.forEach(book => {
      console.log(`${book.title}: Cashback ₹${book.cashbackAmount || 0}, Points: ${book.rewardPoints || 0}`);
    });
    
    // Check users who bought exactly 1 book
    const users = await User.find({ 
      isVirtual: { $ne: true },
      totalPurchases: 1 
    }).select('name email wallet pointsWallet totalPointsEarned virtualReferralsCreated totalPurchases');
    
    console.log('\n👥 Users with exactly 1 book purchase:');
    console.log('Expected: 60 points, ₹16 in wallet');
    console.log('='.repeat(60));
    
    users.forEach(user => {
      console.log(`${user.name}: Wallet: ₹${user.wallet || 0}, Points: ${user.pointsWallet || 0}, Total Earned: ${user.totalPointsEarned || 0}, Virtual Trees: ${user.virtualReferralsCreated || 0}`);
    });
    
    console.log(`\nTotal users with 1 purchase: ${users.length}`);
    
    // Check users with 2+ purchases
    const multiPurchaseUsers = await User.find({ 
      isVirtual: { $ne: true },
      totalPurchases: { $gte: 2 }
    }).select('name email wallet pointsWallet totalPointsEarned virtualReferralsCreated totalPurchases');
    
    console.log('\n👥 Users with 2+ book purchases:');
    console.log('='.repeat(60));
    
    multiPurchaseUsers.forEach(user => {
      const expectedPoints = user.totalPurchases * 60;
      const expectedCash = user.totalPurchases * 16;
      console.log(`${user.name} (${user.totalPurchases} books): Wallet: ₹${user.wallet || 0} (expected ₹${expectedCash}), Points: ${user.pointsWallet || 0}, Total Earned: ${user.totalPointsEarned || 0} (expected ${expectedPoints}), Virtual Trees: ${user.virtualReferralsCreated || 0}`);
    });
    
    console.log(`\nTotal users with 2+ purchases: ${multiPurchaseUsers.length}`);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

checkUserData();