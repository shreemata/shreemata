// Remove user from referral tree while preserving their account and orders
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI);

async function removeFromReferralTree() {
  try {
    console.log('🌳 REMOVING USER FROM REFERRAL TREE\n');
    
    // Find Basavaraj Akki
    const user = await User.findOne({ 
      name: { $regex: /basavaraj.*akki/i }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 Found user:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Referral Code: ${user.referralCode}`);
    console.log(`   Referred By: ${user.referredBy || 'None'}`);
    console.log(`   Wallet: ₹${user.wallet || 0}`);
    
    // Check if anyone was referred by this user
    const referredUsers = await User.find({ referredBy: user.referralCode });
    console.log(`\n🔗 Users referred by ${user.name}: ${referredUsers.length}`);
    
    if (referredUsers.length > 0) {
      console.log('   Referred users:');
      referredUsers.forEach((refUser, index) => {
        console.log(`   ${index + 1}. ${refUser.name} (${refUser.email})`);
      });
    }
    
    // Option 1: Remove referral connection (break the chain)
    console.log('\n🔧 OPTION 1: Remove from referral chain');
    console.log('   - Removes referredBy connection');
    console.log('   - Keeps account and orders intact');
    console.log('   - User becomes independent (no referrer)');
    
    // Option 2: Complete removal
    console.log('\n🔧 OPTION 2: Complete account removal');
    console.log('   - Deletes entire account');
    console.log('   - Removes all orders and data');
    console.log('   - ⚠️  Irreversible action');
    
    console.log('\n❓ What would you like to do?');
    console.log('1. Remove from referral tree only (recommended)');
    console.log('2. Delete account completely');
    console.log('3. Cancel operation');
    
    // For now, let's implement option 1 (safer approach)
    console.log('\n🔧 Proceeding with Option 1: Remove from referral tree only');
    
    // Store original referrer for logging
    const originalReferrer = user.referredBy;
    
    // Remove referral connection
    user.referredBy = null;
    await user.save();
    
    console.log(`✅ Removed referral connection:`);
    console.log(`   Before: Referred by ${originalReferrer}`);
    console.log(`   After: Independent user (no referrer)`);
    
    // Update any users who were referred by this user to point to the original referrer
    if (referredUsers.length > 0 && originalReferrer) {
      console.log(`\n🔄 Updating ${referredUsers.length} users who were referred by ${user.name}`);
      console.log(`   Changing their referrer from ${user.referralCode} to ${originalReferrer}`);
      
      for (const refUser of referredUsers) {
        refUser.referredBy = originalReferrer;
        await refUser.save();
        console.log(`   ✅ Updated ${refUser.name} referrer`);
      }
    }
    
    console.log('\n✅ OPERATION COMPLETED');
    console.log(`   ${user.name} is now removed from referral tree`);
    console.log(`   Account and orders preserved`);
    console.log(`   Wallet balance maintained: ₹${user.wallet || 0}`);
    
    if (referredUsers.length > 0) {
      console.log(`   ${referredUsers.length} referred users updated`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

removeFromReferralTree();