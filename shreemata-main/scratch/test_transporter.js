require('dotenv').config();
const nodemailer = require('nodemailer');

const emailUser = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_FROM;
const emailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
const emailHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const emailPort = parseInt(process.env.SMTP_PORT) || 587;

console.log('SMTP Config Check:');
console.log('- emailUser present:', !!emailUser, emailUser ? `(${emailUser})` : '');
console.log('- emailPass present:', !!emailPass, emailPass ? `(length: ${emailPass.length})` : '');
console.log('- emailHost:', emailHost);
console.log('- emailPort:', emailPort);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: emailHost,
    port: emailPort,
    secure: false,
    auth: {
        user: emailUser,
        pass: emailPass
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Transporter verify failed:', error.message);
        process.exit(1);
    } else {
        console.log('✅ Transporter verify successful! SMTP authenticated.');
        process.exit(0);
    }
});
