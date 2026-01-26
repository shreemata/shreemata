// Test the bundles API endpoint directly
const fetch = require('node-fetch');

async function testBundlesAPI() {
  try {
    console.log('🧪 Testing Bundles API directly...\n');
    
    const url = 'http://localhost:3000/api/bundles';
    console.log('📡 Fetching:', url);
    
    const response = await fetch(url);
    console.log('📊 Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      console.log('❌ API Error:', response.status, '-', response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ API Response received');
    console.log('📦 Response data:', JSON.stringify(data, null, 2));
    
    if (data.bundles) {
      console.log(`\n📊 Bundles count: ${data.bundles.length}`);
      
      if (data.bundles.length > 0) {
        console.log('\n📋 Bundle details:');
        data.bundles.forEach((bundle, index) => {
          console.log(`${index + 1}. ${bundle.name}`);
          console.log(`   - Price: ₹${bundle.bundlePrice}`);
          console.log(`   - Original: ₹${bundle.originalPrice}`);
          console.log(`   - Active: ${bundle.isActive}`);
          console.log(`   - Books: ${bundle.books?.length || 0}`);
          console.log('');
        });
        
        console.log('✅ API is working correctly!');
        console.log('🎯 The issue might be in the frontend JavaScript.');
      } else {
        console.log('❌ API returns empty bundles array');
        console.log('🔍 Check the bundle filtering logic in routes/bundles.js');
      }
    } else {
      console.log('❌ No bundles property in response');
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    console.log('💡 Make sure the server is running on port 3000');
  }
}

testBundlesAPI();