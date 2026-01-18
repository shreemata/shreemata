require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function fix325And375Users() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find users who made purchases of ₹325 or ₹375 (single book purchases)
    // These users should have ₹16 in wallet and 60 points
    
    // First, let's find all users and check their current status
    const allUsers = await User.find({ 
      isVirtual: { $ne: true },
      $or: [
        { wallet: { $gt: 0 } },
        { pointsWallet: { $gt: 0 } },
        { totalPointsEarned: { $gt: 0 } }
      ]
    }).select('name email wallet pointsWallet totalPointsEarned virtualReferralsCreated');
    
    console.log('🔍 Current user status:');
    console.log('='.repeat(80));
    
    const usersToFix = [];
    
    allUsers.forEach(user => {
      console.log(`${user.name}: Wallet: ₹${user.wallet || 0}, Points: ${user.pointsWallet || 0}, Total Earned: ${user.totalPointsEarned || 0}, Virtual Trees: ${user.virtualReferralsCreated || 0}`);
      
      // Identify users who likely bought 1 book (₹325 or ₹375)
      // These users should have ₹16 wallet and 60 total points earned
      if (user.totalPointsEarned === 60 && user.wallet !== 16) {
        usersToFix.push({
          user,
          expectedWallet: 16,
          expectedPoints: 60
        });
      }
    });
    
    console.log(`\n📝 Users to fix (should have ₹16 wallet, 60 points): ${usersToFix.length}`);
    console.log('='.repeat(80));
    
    if (usersToFix.length === 0) {
      console.log('✅ No users need fixing based on the criteria.');
      return;
    }
    
    // Show users that will be fixed
    usersToFix.forEach(({ user, expectedWallet, expectedPoints }) => {
      console.log(`${user.name}: Current wallet ₹${user.wallet} → ₹${expectedWallet}, Points: ${user.pointsWallet}/${user.totalPointsEarned} (keeping same)`);
    });
    
    console.log('\n⚠️  This will update the above users. Continue? (You have 5 seconds to cancel with Ctrl+C)');
    
    // Wait 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🔧 Fixing users...');
    
    let fixedCount = 0;
    
    for (const { user, expectedWallet } of usersToFix) {
      try {
        await User.findByIdAndUpdate(user._id, {
          wallet: expectedWallet
        });
        
        console.log(`✅ Fixed ${user.name}: Set wallet to ₹${expectedWallet}`);
        fixedCount++;
        
      } catch (err) {
        console.error(`❌ Error fixing ${user.name}:`, err.message);
      }
    }
    
    console.log(`\n🎉 Successfully fixed ${fixedCount} users!`);
    
    // Show final status
    console.log('\n📊 Final status check:');
    console.log('='.repeat(80));
    
    const updatedUsers = await User.find({ 
      _id: { $in: usersToFix.map(u => u.user._id) }
    }).select('name email wallet pointsWallet totalPointsEarned virtualReferralsCreated');
    
    updatedUsers.forEach(user => {
      const walletOK = user.wallet === 16 ? '✅' : '❌';
      const pointsOK = user.totalPointsEarned === 60 ? '✅' : '❌';
      console.log(`${user.name}: ${walletOK} Wallet: ₹${user.wallet}, ${pointsOK} Points: ${user.pointsWallet}/${user.totalPointsEarned}, Virtual Trees: ${user.virtualReferralsCreated || 0}`);
    });
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

fix325And375Users();