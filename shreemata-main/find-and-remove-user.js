// Find and remove user who hasn't made payment
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI);

async function findAndRemoveUser(searchName) {
  try {
    console.log('🔍 SEARCHING FOR USER TO REMOVE\n');
    
    if (!searchName) {
      console.log('❌ Please provide a name to search for');
      console.log('Usage: node find-and-remove-user.js "Basavaraj Akki"');
      return;
    }
    
    // Search for users with similar names (case insensitive)
    const users = await User.find({
      name: { $regex: searchName, $options: 'i' }
    });
    
    if (users.length === 0) {
      console.log(`❌ No users found with name containing: "${searchName}"`);
      
      // Show all users for reference
      console.log('\n📋 All users in database:');
      const allUsers = await User.find().sort({ createdAt: -1 }).limit(10);
      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} (${user.email}) - Created: ${user.createdAt?.toLocaleDateString()}`);
      });
      return;
    }
    
    console.log(`📋 Found ${users.length} user(s) matching "${searchName}":\n`);
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`${i + 1}. User Details:`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phone || 'Not provided'}`);
      console.log(`   Role: ${user.role || 'user'}`);
      console.log(`   Created: ${user.createdAt?.toLocaleDateString()}`);
      console.log(`   User ID: ${user._id}`);
      
      // Check if user has any orders
      const orders = await Order.find({ user_id: user._id });
      console.log(`   Orders: ${orders.length}`);
      
      if (orders.length > 0) {
        console.log(`   📦 Order details:`);
        orders.forEach((order, orderIndex) => {
          console.log(`      ${orderIndex + 1}. Order ${order._id}`);
          console.log(`         - Status: ${order.status}`);
          console.log(`         - Amount: ₹${order.totalAmount}`);
          console.log(`         - Date: ${order.createdAt?.toLocaleDateString()}`);
          console.log(`         - Payment ID: ${order.razorpay_payment_id || 'None'}`);
        });
      }
      
      // Check wallet balance
      console.log(`   Wallet: ₹${user.wallet || 0}`);
      
      // Check referral info
      if (user.referralCode) {
        console.log(`   Referral Code: ${user.referralCode}`);
      }
      if (user.referredBy) {
        console.log(`   Referred By: ${user.referredBy}`);
      }
      
      console.log('');
    }
    
    // Ask for confirmation before deletion
    console.log('⚠️  DELETION ANALYSIS:');
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const orders = await Order.find({ user_id: user._id });
      const paidOrders = orders.filter(order => order.status === 'completed');
      const pendingOrders = orders.filter(order => order.status === 'pending');
      
      console.log(`\n${i + 1}. ${user.name}:`);
      
      if (paidOrders.length > 0) {
        console.log(`   ❌ CANNOT DELETE - Has ${paidOrders.length} completed orders`);
        console.log(`   💰 Total paid: ₹${paidOrders.reduce((sum, order) => sum + order.totalAmount, 0)}`);
      } else if (pendingOrders.length > 0) {
        console.log(`   ⚠️  Has ${pendingOrders.length} pending orders`);
        console.log(`   💭 Pending amount: ₹${pendingOrders.reduce((sum, order) => sum + order.totalAmount, 0)}`);
        console.log(`   ✅ SAFE TO DELETE (no completed payments)`);
      } else {
        console.log(`   ✅ SAFE TO DELETE (no orders)`);
      }
      
      if (user.wallet > 0) {
        console.log(`   ⚠️  Has wallet balance: ₹${user.wallet}`);
      }
    }
    
    // Show deletion command
    console.log('\n🔧 TO DELETE USER(S):');
    users.forEach((user, index) => {
      const orders = Order.find({ user_id: user._id });
      console.log(`${index + 1}. To delete "${user.name}":`);
      console.log(`   node delete-user-confirmed.js ${user._id}`);
    });
    
    console.log('\n💡 RECOMMENDATION:');
    console.log('   Only delete users with no completed orders');
    console.log('   Users with pending orders can be deleted if payment was never made');
    console.log('   Check with the user before deletion if they have wallet balance');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Get search name from command line argument
const searchName = process.argv[2];
findAndRemoveUser(searchName);