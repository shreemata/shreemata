/**
 * Test Gmail SMTP Configuration
 * Run this script to test if your Gmail SMTP is working correctly
 * 
 * Usage: node test-gmail-smtp.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// Create transporter with Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    },
    debug: true,
    logger: true
});

async function testGmailSMTP() {
    console.log('🔍 Testing Gmail SMTP Configuration...\n');
    
    // Display configuration (without sensitive data)
    console.log('📋 Configuration:');
    console.log('   Service: Gmail');
    console.log('   Host: smtp.gmail.com');
    console.log('   Port: 587');
    console.log('   User:', process.env.GMAIL_USER);
    console.log('   App Password:', process.env.GMAIL_APP_PASSWORD ? '***' + process.env.GMAIL_APP_PASSWORD.slice(-4) : 'NOT SET');
    console.log('');
    
    // Check if credentials are set
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.error('❌ Gmail credentials not found in .env file!');
        console.error('');
        console.error('Please add these to your .env file:');
        console.error('GMAIL_USER=your_email@gmail.com');
        console.error('GMAIL_APP_PASSWORD=your_16_character_app_password');
        console.error('');
        console.error('📖 See GMAIL_SMTP_SETUP.md for detailed instructions');
        return;
    }
    
    // Verify transporter configuration
    try {
        console.log('🔐 Verifying Gmail SMTP connection...');
        await transporter.verify();
        console.log('✅ Gmail SMTP connection verified successfully!\n');
    } catch (error) {
        console.error('❌ Gmail SMTP connection failed:', error.message);
        console.error('');
        console.error('Common issues:');
        console.error('1. Make sure you\'re using an App Password (not your regular Gmail password)');
        console.error('2. Enable 2-Step Verification in your Google Account');
        console.error('3. Generate an App Password: https://myaccount.google.com/apppasswords');
        console.error('4. Remove all spaces from the App Password');
        console.error('');
        console.error('📖 See GMAIL_SMTP_SETUP.md for detailed instructions');
        return;
    }
    
    // Send test email
    const testEmailAddress = process.env.GMAIL_USER; // Send to yourself
    
    console.log(`📧 Sending test email to: ${testEmailAddress}`);
    
    try {
        const info = await transporter.sendMail({
            from: `"Shree Mata Test" <${process.env.GMAIL_USER}>`,
            to: testEmailAddress,
            subject: '✅ Gmail SMTP Test Email - Shree Mata',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #667eea;">🎉 Gmail SMTP is Working!</h1>
                    <p>This is a test email from your Shree Mata application.</p>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">✅ Configuration Details:</h3>
                        <ul>
                            <li><strong>Service:</strong> Gmail</li>
                            <li><strong>SMTP Host:</strong> smtp.gmail.com</li>
                            <li><strong>Port:</strong> 587</li>
                            <li><strong>From Email:</strong> ${process.env.GMAIL_USER}</li>
                            <li><strong>Encryption:</strong> STARTTLS</li>
                        </ul>
                    </div>
                    
                    <p>If you received this email, your Gmail SMTP configuration is working correctly!</p>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    
                    <p style="color: #666; font-size: 14px;">
                        <strong>Gmail Sending Limits:</strong><br>
                        • 500 emails per day (free Gmail)<br>
                        • 2000 emails per day (Google Workspace)<br>
                        • ~100 emails per hour rate limit<br>
                        • 100 recipients per email
                    </p>
                    
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">
                        Sent at: ${new Date().toLocaleString()}<br>
                        Test ID: ${Date.now()}
                    </p>
                </div>
            `
        });
        
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', info.messageId);
        console.log('   Response:', info.response);
        console.log('');
        console.log('📬 Check your inbox at:', testEmailAddress);
        console.log('');
        console.log('🎉 Gmail SMTP is configured correctly!');
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. Update all "from" addresses in utils/emailService.js');
        console.log('   2. Restart your server: pm2 restart shreemata');
        console.log('   3. Test order confirmation emails');
        
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
        console.error('');
        
        if (error.message.includes('Invalid login')) {
            console.error('⚠️  Invalid login credentials. Please check:');
            console.error('   1. You\'re using an App Password (not regular password)');
            console.error('   2. App Password has no spaces');
            console.error('   3. 2-Step Verification is enabled');
        } else if (error.message.includes('Daily sending quota exceeded')) {
            console.error('⚠️  Gmail daily sending limit exceeded (500 emails/day)');
            console.error('   Wait 24 hours or upgrade to Google Workspace');
        } else if (error.message.includes('EAUTH')) {
            console.error('⚠️  Authentication failed');
            console.error('   Generate a new App Password and update .env file');
        }
        
        console.error('');
        console.error('📖 See GMAIL_SMTP_SETUP.md for troubleshooting');
    }
}

// Run the test
testGmailSMTP().catch(console.error);
