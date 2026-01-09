// Test script for your specific Google Form
// Run this with: node test-your-form.js

const https = require('https');

// Test data matching your form structure
const testData = {
  orderId: 'TEST_ORDER_' + Date.now(),
  amount: '599',
  userEmail: 'shashistudy2125@gmail.com',
  userName: 'Test User',
  userPhone: '9449171605',
  bankName: 'SBI',
  checkDate: '2026-01-09',
  checkNumber: 'AUTO_' + Date.now(),
  formResponseId: 'test_response_' + Date.now(),
  timestamp: new Date().toISOString(),
  message: 'Test from your working form'
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'shreemata.com',
  port: 443,
  path: '/api/payments/webhook/check-payment-submitted',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🔍 Testing webhook with your form data...');
console.log('URL:', `https://${options.hostname}${options.path}`);
console.log('Test Data:', testData);

const req = https.request(options, (res) => {
  console.log(`\n📥 Response Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📥 Response Body:', data);
    
    if (res.statusCode === 200) {
      console.log('✅ Webhook test successful!');
      console.log('✅ Your form integration should work now');
    } else {
      console.log('❌ Webhook test failed');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(postData);
req.end();