const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026';
const token = jwt.sign(
  { id: 'admin123', role: 'admin', name: 'Admin Test' },
  secret,
  { expiresIn: '7d' }
);

console.log('JWT Token:', token);
