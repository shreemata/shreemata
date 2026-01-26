// Delete user with safety checks
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI);

async function deleteUserConfirmed(userId) {
  try {
    console.log('🗑️  USER DELETION WITH SAFETY CHECKS\n');
    
    if (!userId) {
      console.log('❌ Please provide a user ID');
      console.log('Usage: node delete-user-confirmed.js <user-id>');
      return;
    }
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 User to Delete:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Created: ${user.createdAt?.toLocaleDateString()}`);
    console.log(`   Wallet: ₹${user.wallet || 0}`);
    
    // Check orders
    const orders = await Order.find({ user_id: userId });
    const completedOrders = orders.filter(order => order.status === 'completed');
    const pendingOrders = orders.filter(order => order.status !== 'completed');
    
    console.log(`\n📊 Order Analysis:`);
    console.log(`   Total Orders: ${orders.length}`);
    console.log(`   Completed Orders: ${completedOrders.length}`);
    console.log(`   Pending Orders: ${pendingOrders.length}`);
    
    // Safety checks
    let canDelete = true;
    let warnings = [];
    
    if (completedOrders.length > 0) {
      canDelete = false;
      const totalPaid = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      warnings.push(`Has ${completedOrders.length} completed orders worth ₹${totalPaid}`);
    }
    
    if (user.wallet > 0) {
      warnings.push(`Has wallet balance of ₹${user.wallet}`);
    }
    
    if (user.role === 'admin') {
      canDelete = false;
      warnings.push('User is an admin');
    }
    
    // Show warnings
    if (warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS:`);
      warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    
    // Decision
    if (!canDelete) {
      console.log(`\n❌ CANNOT DELETE USER`);
      console.log(`   Reason: User has completed orders or is admin`);
      console.log(`   Recommendation: Only remove pending orders if needed`);
      console.log(`   Command: node remove-pending-orders.js ${userId}`);
      return;
    }
    
    if (pendingOrders.length > 0) {
      console.log(`\n🗑️  Will also delete ${pendingOrders.length} pending orders`);
    }
    
    console.log(`\n✅ SAFE TO DELETE`);
    console.log(`   User has no completed orders`);
    console.log(`   No financial impact`);
    
    // Perform deletion
    console.log(`\n🗑️  Deleting user and associated data...`);
    
    // Delete orders first
    if (orders.length > 0) {
      const deleteOrdersResult = await Order.deleteMany({ user_id: userId });
      console.log(`   ✅ Deleted ${deleteOrdersResult.deletedCount} orders`);
    }
    
    // Delete user
    await User.findByIdAndDelete(userId);
    console.log(`   ✅ Deleted user: ${user.name}`);
    
    console.log(`\n🎉 USER DELETION COMPLETED`);
    console.log(`   Deleted: ${user.name} (${user.email})`);
    console.log(`   Orders removed: ${orders.length}`);
    console.log(`   Status: User completely removed from system`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Get user ID from command line argument
const userId = process.argv[2];
deleteUserConfirmed(userId);