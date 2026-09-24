const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function testApi() {
  await mongoose.connect(process.env.MONGO_URI);
  const adminUser = await User.findOne({ role: 'admin' }).lean();
  if (!adminUser) {
    console.error('No admin user found in DB');
    await mongoose.disconnect();
    return;
  }
  console.log('Found Admin User:', adminUser.email, adminUser._id);
  const token = jwt.sign({ id: adminUser._id.toString(), role: 'admin' }, process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026', { expiresIn: '1h' });
  await mongoose.disconnect();

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/commission-fund/summary?period=all',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log('SUCCESS:', json.success);
        console.log('SUMMARY:', json.data?.summary);
        console.log('LIABILITIES BREAKDOWN:', json.data?.liabilitiesBreakdown);
      } catch(e) {
        console.log('RAW BODY:', data.substring(0, 300));
      }
    });
  });

  req.on('error', err => console.error('ERROR:', err.message));
  req.end();
}

testApi();
