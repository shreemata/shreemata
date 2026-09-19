const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/User');

async function testLiveApi() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://13.232.234.218:27017/shreemata';
  await mongoose.connect(mongoUri);

  try {
    const user = await User.findOne({ name: /Shakuntaladevi/i });
    if (!user) {
      console.log('Shakuntaladevi not found');
      return;
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'secret');
    console.log('Generated token for user:', user.name, user._id);

    const res = await fetch('http://localhost:3000/api/referral/commissions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const status = res.status;
    const body = await res.json();

    console.log('HTTP Status:', status);
    console.log('FULL JSON RESPONSE FROM LIVE SERVER:');
    console.log(JSON.stringify(body, null, 2));

  } catch (err) {
    console.error('Error fetching live API:', err);
  } finally {
    await mongoose.disconnect();
  }
}

testLiveApi();
