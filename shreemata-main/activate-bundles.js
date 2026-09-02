// Script to activate all bundles
const mongoose = require('mongoose');
const Bundle = require('./models/Bundle');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shree-mata', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function activateAllBundles() {
  try {
    console.log('🔧 Activating all bundles...\n');
    
    // Find all inactive bundles
    const inactiveBundles = await Bundle.find({ isActive: false });
    console.log(`Found ${inactiveBundles.length} inactive bundles`);
    
    if (inactiveBundles.length === 0) {
      console.log('✅ All bundles are already active!');
      
      // Check if there are any bundles at all
      const totalBundles = await Bundle.countDocuments();
      console.log(`Total bundles in database: ${totalBundles}`);
      
      if (totalBundles === 0) {
        console.log('❌ No bundles found in database!');
        console.log('💡 You need to create bundles first through the admin panel.');
      }
    } else {
      // Activate all inactive bundles
      const result = await Bundle.updateMany(
        { isActive: false },
        { $set: { isActive: true } }
      );
      
      console.log(`✅ Activated ${result.modifiedCount} bundles!`);
      
      // Show activated bundles
      const activatedBundles = await Bundle.find({ isActive: true });
      console.log('\n📦 Now active bundles:');
      activatedBundles.forEach((bundle, index) => {
        console.log(`${index + 1}. ${bundle.name} - ₹${bundle.bundlePrice}`);
      });
    }
    
    console.log('\n🎉 Done! Bundles should now appear on the home page.');
    
  } catch (error) {
    console.error('❌ Error activating bundles:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

activateAllBundles();