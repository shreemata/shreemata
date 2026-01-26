require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Book = require('./models/Book');

require('dotenv').config();
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shreemata');

setTimeout(async () => {
  try {
    // First check book settings
    const books = await Book.find({}).select('title cashbackAmount rewardPoints');
    console.log('📚 Book Settings:');
    console.log('='.repeat(60));
    books.forEach(book => {
      console.log(`${book.title}: Cashback ₹${book.cashbackAmount || 0}, Points: ${book.rewardPoints || 0}`);
    });
    
    // Check users with 1 purchase
    const singlePurchaseUsers = await User.find({
      isVirtual: { $ne: true },
      totalPurchases: 1
    }).select('name email pointsWallet totalPointsEarned virtualReferralsCreated wallet totalPurchases');
    
    console.log('\n👥 Users with 1 book purchase:');
    console.log('Expected: 60 points, ₹16 in wallet');
    console.log('='.repeat(60));
    
    singlePurchaseUsers.forEach(user => {
      const pointsMatch = user.totalPointsEarned === 60 ? '✅' : '❌';
      const walletMatch = user.wallet === 16 ? '✅' : '❌';
      console.log(`${user.name}: ${pointsMatch} Points: ${user.pointsWallet || 0}/${user.totalPointsEarned || 0}, ${walletMatch} Wallet: ₹${user.wallet || 0}, Virtual Trees: ${user.virtualReferralsCreated || 0}`);
    });
    
    console.log(`\nTotal users with 1 purchase: ${singlePurchaseUsers.length}`);
    
    // Check users with multiple purchases
    const multiPurchaseUsers = await User.find({
      isVirtual: { $ne: true },
      totalPurchases: { $gte: 2 }
    }).select('name email pointsWallet totalPointsEarned virtualReferralsCreated wallet totalPurchases');
    
    console.log('\n👥 Users with 2+ book purchases:');
    console.log('='.repeat(60));
    
    multiPurchaseUsers.forEach(user => {
      const expectedPoints = user.totalPurchases * 60;
      const expectedCash = user.totalPurchases * 16;
      const pointsMatch = user.totalPointsEarned === expectedPoints ? '✅' : '❌';
      const walletMatch = user.wallet === expectedCash ? '✅' : '❌';
      console.log(`${user.name} (${user.totalPurchases} books): ${pointsMatch} Points: ${user.pointsWallet || 0}/${user.totalPointsEarned || 0} (exp ${expectedPoints}), ${walletMatch} Wallet: ₹${user.wallet || 0} (exp ₹${expectedCash}), Virtual Trees: ${user.virtualReferralsCreated || 0}`);
    });
    
    const users = await User.find({})
      .select('name email pointsWallet totalPointsEarned virtualReferralsCreated isVirtual')
      .sort({pointsWallet: -1})
      .limit(10);
    
    console.log('\nTop 10 users by points:');
    console.log('='.repeat(60));
    
    users.forEach(u => {
      console.log(`${u.name}: ${u.pointsWallet || 0} points, ${u.virtualReferralsCreated || 0} virtuals, isVirtual: ${u.isVirtual || false}`);
    });
    
    // Check total users
    const totalUsers = await User.countDocuments({});
    const virtualUsers = await User.countDocuments({isVirtual: true});
    const usersWithPoints = await User.countDocuments({pointsWallet: {$gt: 0}});
    
    console.log('\nSummary:');
    console.log(`Total users: ${totalUsers}`);
    console.log(`Virtual users: ${virtualUsers}`);
    console.log(`Users with points: ${usersWithPoints}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}, 1000);