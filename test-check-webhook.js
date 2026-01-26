// Test script to verify the check payment webhook is working
// Run this with: node test-check-webhook.js

const https = require('https');

const testData = {
  orderId: 'TEST_ORDER_123',
  checkNumber: 'TEST_CHECK_456',
  bankName: 'Test Bank',
  checkDate: '2026-01-09',
  utrNumber: 'TEST_UTR_789',
  formResponseId: 'test_response_123',
  checkImageUrl: 'https://example.com/test-image.jpg',
  checkImageDriveId: 'test_drive_id_123',
  driveFileIds: ['test_file_1', 'test_file_2'],
  userEmail: 'test@example.com',
  userName: 'Test User',
  amount: '599',
  timestamp: new Date().toISOString(),
  message: 'Test webhook call from Node.js script'
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

console.log('🔍 Testing webhook endpoint...');
console.log('URL:', `https://${options.hostname}${options.path}`);
console.log('Data:', testData);

const req = https.request(options, (res) => {
  console.log(`\n📥 Response Status: ${res.statusCode}`);
  console.log('📥 Response Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📥 Response Body:', data);
    
    if (res.statusCode === 200) {
      console.log('✅ Webhook test successful!');
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