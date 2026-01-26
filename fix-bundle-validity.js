// Fix bundle validity dates
require('dotenv').config();

const mongoose = require('mongoose');
const Bundle = require('./models/Bundle');

mongoose.connect(process.env.MONGO_URI);

async function fixBundleValidity() {
  try {
    console.log('🔧 Fixing bundle validity dates...\n');
    
    // Option 1: Extend validity to end of 2026
    const newValidUntil = new Date('2026-12-31T23:59:59');
    
    const result = await Bundle.updateMany(
      {},
      { validUntil: newValidUntil }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} bundles`);
    console.log(`📅 New validity date: ${newValidUntil}`);
    
    // Verify the fix
    console.log('\n🧪 Testing API filter after fix...');
    const apiFilteredBundles = await Bundle.find({ 
      isActive: true,
      $or: [
        { validUntil: { $gte: new Date() } },
        { validUntil: null }
      ]
    });
    
    console.log(`📊 API will now return: ${apiFilteredBundles.length} bundles`);
    
    if (apiFilteredBundles.length > 0) {
      console.log('\n🎉 SUCCESS! Bundles should now appear on the home page!');
      console.log('🔄 Refresh your browser to see the bundles.');
    } else {
      console.log('\n❌ Still not working. There might be another issue.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

fixBundleValidity();