const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME_NEW;
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY_NEW;
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET_NEW;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

const missingVars = [];
if (!cloudName) missingVars.push('CLOUDINARY_CLOUD_NAME');
if (!apiKey) missingVars.push('CLOUDINARY_API_KEY');
if (!apiSecret) missingVars.push('CLOUDINARY_API_SECRET');

if (missingVars.length > 0) {
  console.error(`⚠️ Cloudinary configuration incomplete: ${missingVars.join(', ')} is missing in environment (.env).`);
} else {
  console.log('🔧 Cloudinary configured successfully:', {
    cloud_name: cloudName,
    api_key: apiKey ? '***' + apiKey.slice(-4) : 'NOT SET',
    api_secret: apiSecret ? '***' + apiSecret.slice(-4) : 'NOT SET'
  });
}

module.exports = cloudinary;
