require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');

async function testLiveApi() {
  const token = jwt.sign(
    { id: '6a2e71e995ab8626a57076e7', email: 'shakuntaladevi@example.com', role: 'user' },
    process.env.JWT_SECRET || 'secret'
  );

  console.log('Sending request to http://localhost:3000/api/points/virtual-referrals with token...');

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/points/virtual-referrals',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`HTTP Status: ${res.statusCode}`);
      console.log('Response JSON:');
      console.log(data);
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    process.exit(1);
  });

  req.end();
}

testLiveApi();
