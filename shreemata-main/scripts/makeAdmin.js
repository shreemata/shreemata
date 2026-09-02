// scripts/makeAdmin.js
// Usage: node scripts/makeAdmin.js <email>

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function makeAdmin(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      console.error(`❌ User with email "${email}" not found`);
      process.exit(1);
    }

    // Update role to admin
    user.role = 'admin';
    await user.save();

    console.log(`✅ User "${user.name}" (${user.email}) is now an admin!`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/makeAdmin.js <email>');
  process.exit(1);
}

makeAdmin(email);
