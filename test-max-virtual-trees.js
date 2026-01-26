require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const AdminSettings = require('./models/AdminSettings');

async function testMaxVirtualTrees() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get current admin settings
    const settings = await AdminSettings.getSettings();
    console.log('📊 Current Admin Settings:');
    console.log(`Max Virtual Trees per User: ${settings.virtualTreeSettings.maxVirtualTreesPerUser}`);
    console.log(`Points per Virtual Tree: ${settings.virtualTreeSettings.pointsPerVirtualTree}`);
    
    // Find users who have reached max virtual trees
    const usersAtMax = await User.find({
      isVirtual: { $ne: true },
      virtualReferralsCreated: { $gte: settings.virtualTreeSettings.maxVirtualTreesPerUser }
    }).select('name email virtualReferralsCreated pointsWallet');
    
    console.log(`\n👥 Users at max virtual trees (${settings.virtualTreeSettings.maxVirtualTreesPerUser}+):`);
    console.log('='.repeat(60));
    
    if (usersAtMax.length === 0) {
      console.log('No users have reached the maximum virtual trees limit.');
    } else {
      usersAtMax.forEach(user => {
        console.log(`${user.name}: ${user.virtualReferralsCreated} virtual trees, ${user.pointsWallet} points`);
      });
    }
    
    // Find users who can still create virtual trees
    const usersCanCreate = await User.find({
      isVirtual: { $ne: true },
      virtualReferralsCreated: { $lt: settings.virtualTreeSettings.maxVirtualTreesPerUser },
      pointsWallet: { $gte: settings.virtualTreeSettings.pointsPerVirtualTree }
    }).select('name email virtualReferralsCreated pointsWallet');
    
    console.log(`\n👥 Users who can still create virtual trees:`);
    console.log('='.repeat(60));
    
    if (usersCanCreate.length === 0) {
      console.log('No users can create more virtual trees.');
    } else {
      usersCanCreate.forEach(user => {
        const canCreate = Math.min(
          Math.floor(user.pointsWallet / settings.virtualTreeSettings.pointsPerVirtualTree),
          settings.virtualTreeSettings.maxVirtualTreesPerUser - user.virtualReferralsCreated
        );
        console.log(`${user.name}: ${user.virtualReferralsCreated}/${settings.virtualTreeSettings.maxVirtualTreesPerUser} trees, ${user.pointsWallet} points (can create ${canCreate} more)`);
      });
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testMaxVirtualTrees();