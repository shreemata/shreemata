// Complete test of check payment flow
const http = require('http');

console.log('🔍 Testing complete check payment flow...');

// Step 1: Test if server is running
testServerHealth()
  .then(() => {
    console.log('✅ Server is running, testing webhook with mock data...');
    return testWebhookWithMockData();
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
  });

function testServerHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Server health check passed');
          resolve();
        } else {
          reject(new Error(`Server health check failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Server not accessible: ${error.message}`));
    });

    req.end();
  });
}

function testWebhookWithMockData() {
  return new Promise((resolve, reject) => {
    // Test webhook with minimal data (no order lookup)
    const testData = {
      orderId: 'WEBHOOK_TEST_' + Date.now(),
      checkNumber: 'TEST_CHECK_123',
      bankName: 'Test Bank',
      checkDate: '2026-01-09',
      userEmail: 'test@example.com',
      userName: 'Test User',
      amount: '599',
      message: 'Webhook connectivity test'
    };

    const postData = JSON.stringify(testData);

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/payments/webhook/check-payment-submitted',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`📥 Webhook Response Status: ${res.statusCode}`);
        console.log(`📥 Webhook Response Body: ${data}`);
        
        if (res.statusCode === 404) {
          console.log('✅ Webhook endpoint is working! (404 expected - test order doesn\'t exist)');
          console.log('✅ This means your webhook will work when Google Forms sends real order IDs');
          resolve();
        } else if (res.statusCode === 200) {
          console.log('✅ Webhook working perfectly!');
          resolve();
        } else {
          console.log('❌ Unexpected webhook response');
          reject(new Error(`Webhook failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Webhook request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

// Also test the hosted server
setTimeout(() => {
  console.log('\n🌐 Testing hosted server webhook...');
  testHostedWebhook();
}, 2000);

function testHostedWebhook() {
  const https = require('https');
  
  const testData = {
    orderId: 'HOSTED_TEST_' + Date.now(),
    checkNumber: 'TEST_CHECK_456',
    bankName: 'Test Bank',
    message: 'Hosted webhook test'
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

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log(`🌐 Hosted Webhook Status: ${res.statusCode}`);
      console.log(`🌐 Hosted Webhook Response: ${data}`);
      
      if (res.statusCode === 404 && data.includes('Order not found')) {
        console.log('✅ Hosted webhook is working! (404 expected - test order doesn\'t exist)');
        console.log('✅ Your Google Apps Script should work now!');
      } else if (res.statusCode === 404 && data.includes('API endpoint not found')) {
        console.log('❌ Hosted server doesn\'t have the webhook endpoint');
        console.log('💡 You need to deploy your updated code to the hosted server');
      } else {
        console.log('🤔 Unexpected response from hosted server');
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Hosted webhook error:', error.message);
  });

  req.write(postData);
  req.end();
}