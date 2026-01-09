// Check what endpoints exist on hosted server
const https = require('https');

console.log('🔍 Checking hosted server endpoints...');

// Test different endpoints to see what exists
const endpoints = [
  '/api/health',
  '/api/payments/webhook',
  '/api/payments/webhook/check-payment-submitted',
  '/api/payments/create-order'
];

async function testEndpoint(path, method = 'GET') {
  return new Promise((resolve) => {
    const options = {
      hostname: 'shreemata.com',
      port: 443,
      path: path,
      method: method,
      headers: method === 'POST' ? {
        'Content-Type': 'application/json',
        'Content-Length': '2'
      } : {}
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`${method} ${path}: ${res.statusCode} - ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
        resolve({ status: res.statusCode, response: data });
      });
    });

    req.on('error', (error) => {
      console.log(`${method} ${path}: ERROR - ${error.message}`);
      resolve({ status: 'ERROR', response: error.message });
    });

    if (method === 'POST') {
      req.write('{}');
    }
    req.end();
  });
}

async function checkAllEndpoints() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint, 'GET');
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
  }
  
  // Test POST to webhook
  console.log('\n📤 Testing POST to webhook endpoint...');
  await testEndpoint('/api/payments/webhook/check-payment-submitted', 'POST');
  
  console.log('\n📋 Summary:');
  console.log('If you see "API endpoint not found" for the webhook, you need to deploy your updated code.');
  console.log('If you see "Order not found" or other errors, the endpoint exists and is working.');
}

checkAllEndpoints();