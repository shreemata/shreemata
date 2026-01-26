// Debug script to check bundles issue
const mongoose = require('mongoose');
const Bundle = require('./models/Bundle');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shree-mata', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugBundlesIssue() {
  try {
    console.log('🔍 Debugging bundles issue...\n');
    
    // Check if Bundle model exists
    console.log('1. Checking Bundle model...');
    console.log('Bundle model loaded:', !!Bundle);
    
    // Check total bundles in database
    console.log('\n2. Checking bundles in database...');
    const allBundles = await Bundle.find();
    console.log(`Total bundles in database: ${allBundles.length}`);
    
    if (allBundles.length > 0) {
      console.log('\n📦 All bundles:');
      allBundles.forEach((bundle, index) => {
        console.log(`${index + 1}. ${bundle.name}`);
        console.log(`   - ID: ${bundle._id}`);
        console.log(`   - Active: ${bundle.isActive}`);
        console.log(`   - Price: ₹${bundle.bundlePrice}`);
        console.log(`   - Books: ${bundle.books.length}`);
        console.log(`   - Created: ${bundle.createdAt}`);
        console.log('');
      });
    }
    
    // Check active bundles (what the API should return)
    console.log('3. Checking active bundles (API filter)...');
    const activeBundles = await Bundle.find({ 
      isActive: true,
      $or: [
        { validFrom: { $exists: false } },
        { validFrom: { $lte: new Date() } }
      ]
    }).sort({ createdAt: -1 });
    
    console.log(`Active bundles: ${activeBundles.length}`);
    
    if (activeBundles.length > 0) {
      console.log('\n✅ Active bundles that should appear on home page:');
      activeBundles.forEach((bundle, index) => {
        console.log(`${index + 1}. ${bundle.name} (₹${bundle.bundlePrice})`);
      });
    } else {
      console.log('\n❌ No active bundles found!');
      console.log('This is why bundles are not showing on the home page.');
      
      if (allBundles.length > 0) {
        console.log('\n💡 Possible solutions:');
        console.log('1. Activate existing bundles by setting isActive: true');
        console.log('2. Check validFrom dates if they exist');
        
        // Show inactive bundles
        const inactiveBundles = allBundles.filter(b => !b.isActive);
        if (inactiveBundles.length > 0) {
          console.log('\n📋 Inactive bundles found:');
          inactiveBundles.forEach((bundle, index) => {
            console.log(`${index + 1}. ${bundle.name} - isActive: ${bundle.isActive}`);
          });
        }
      }
    }
    
    // Test the API endpoint simulation
    console.log('\n4. Simulating API response...');
    const apiResponse = {
      bundles: activeBundles
    };
    console.log('API would return:', JSON.stringify({
      bundlesCount: apiResponse.bundles.length,
      firstBundle: apiResponse.bundles[0] ? {
        name: apiResponse.bundles[0].name,
        price: apiResponse.bundles[0].bundlePrice,
        active: apiResponse.bundles[0].isActive
      } : null
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Error debugging bundles:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

debugBundlesIssue();