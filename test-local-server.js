// Test local server connectivity
const http = require('http');

console.log('🔍 Testing local server...');

// Test local server first
const localOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/health',
  method: 'GET'
};

const localReq = http.request(localOptions, (res) => {
  console.log(`\n📥 Local Server Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📥 Local Server Response:', data);
    
    if (res.statusCode === 200) {
      console.log('✅ Local server is running!');
      
      // Now test the webhook endpoint locally
      testLocalWebhook();
    } else {
      console.log('❌ Local server health check failed');
    }
  });
});

localReq.on('error', (error) => {
  console.error('❌ Local server not accessible:', error.message);
  console.log('\n🔧 Please start your server with: node server.js');
});

localReq.end();

function testLocalWebhook() {
  console.log('\n🔍 Testing local webhook endpoint...');
  
  const testData = {
    orderId: 'TEST_LOCAL_' + Date.now(),
    amount: '599',
    userEmail: 'test@example.com',
    userName: 'Test User',
    message: 'Local webhook test'
  };

  const postData = JSON.stringify(testData);

  const webhookOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments/webhook/check-payment-submitted',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const webhookReq = http.request(webhookOptions, (res) => {
    console.log(`📥 Local Webhook Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📥 Local Webhook Response:', data);
      
      if (res.statusCode === 200) {
        console.log('✅ Local webhook is working!');
        console.log('✅ The issue is with your hosted server, not local');
      } else {
        console.log('❌ Local webhook failed');
      }
    });
  });

  webhookReq.on('error', (error) => {
    console.error('❌ Local webhook error:', error);
  });

  webhookReq.write(postData);
  webhookReq.end();
}