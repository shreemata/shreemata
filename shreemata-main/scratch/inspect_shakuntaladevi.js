const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function inspectUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const u = await User.findOne({ email: 'shree.mata.hbl@gmail.com' }).lean();
    console.log('User name:', u.name);
    console.log('User email:', u.email);
    console.log('User wallet:', u.wallet);
    console.log('Withdrawals:', JSON.stringify(u.withdrawals, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}
inspectUser();
