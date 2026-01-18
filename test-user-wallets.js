require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testUserWallets() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get all users with wallet balance > 0
    const usersWithBalance = await User.find({ 
      isVirtual: { $ne: true },
      wallet: { $gt: 0 }
    }).select('name email wallet').sort({ wallet: -1 });
    
    console.log('👥 Users with wallet balance:');
    console.log('='.repeat(60));
    
    let totalWalletAmount = 0;
    
    usersWithBalance.forEach(user => {
      console.log(`${user.name}: ₹${user.wallet.toFixed(2)}`);
      totalWalletAmount += user.wallet;
    });
    
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`Total users with balance: ${usersWithBalance.length}`);
    console.log(`Total wallet amount: ₹${totalWalletAmount.toFixed(2)}`);
    
    // Also get all users (including those with 0 balance) for comparison
    const allUsers = await User.find({ isVirtual: { $ne: true } }).select('wallet');
    const totalAllWallets = allUsers.reduce((sum, user) => sum + (user.wallet || 0), 0);
    
    console.log(`Total users: ${allUsers.length}`);
    console.log(`Total of all wallets (including 0): ₹${totalAllWallets.toFixed(2)}`);
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testUserWallets();