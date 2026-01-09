// Test webhook on hosted server
const https = require('https');

console.log('🔍 Testing webhook on hosted server...');

const testData = {
  orderId: 'TEST_' + Date.now(),
  checkNumber: 'TEST123',
  bankName: 'SBI',
  userEmail: 'test@example.com',
  userName: 'Test User',
  amount: '599'
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

console.log('📤 Sending test data:', testData);

const req = https.request(options, (res) => {
  console.log(`📥 Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📥 Response:', data);
    
    if (res.statusCode === 404 && data.includes('Order not found')) {
      console.log('✅ Webhook is working! (404 expected - test order doesn\'t exist)');
    } else if (res.statusCode === 400 && data.includes('Order ID is required')) {
      console.log('✅ Webhook endpoint exists but needs valid order ID');
    } else if (res.statusCode === 200) {
      console.log('✅ Webhook working perfectly!');
    } else {
      console.log('🤔 Unexpected response');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.write(postData);
req.end();