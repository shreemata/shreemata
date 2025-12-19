const cloudinary = require("cloudinary").v2;

// Force fresh configuration with new variable names
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Log config for debugging (remove in production)
console.log('🔧 Cloudinary configured:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
  api_key: (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY) ? '***' + (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY).slice(-4) : 'NOT SET',
  api_secret: (process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET) ? '***' + (process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET).slice(-4) : 'NOT SET'
});

module.exports = cloudinary;
