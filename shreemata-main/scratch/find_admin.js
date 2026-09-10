const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/User');

async function findAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await User.findOne({ role: 'admin' });
  if (admin) {
    console.log('Found Admin User:', admin._id.toString(), admin.email || admin.phone);
    const token = jwt.sign(
      { id: admin._id.toString(), role: admin.role, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('Valid Admin JWT Token:', token);
  } else {
    console.log('No admin user found!');
  }
  await mongoose.disconnect();
}

findAdmin();
