// Simple Twilio credentials test
require('dotenv').config();
const twilio = require('twilio');

console.log('🔧 Testing Twilio Credentials...\n');

// Check environment variables
console.log('Environment Variables:');
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing');
console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing');
console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER ? '✅ Set' : '❌ Missing');
console.log('');

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log('❌ Missing Twilio credentials in .env file');
    process.exit(1);
}

// Test Twilio client initialization
try {
    console.log('🔧 Initializing Twilio client...');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    console.log('✅ Twilio client initialized successfully');
    
    // Test account info (this will verify credentials)
    console.log('🔍 Testing account access...');
    
    client.api.accounts(process.env.TWILIO_ACCOUNT_SID)
        .fetch()
        .then(account => {
            console.log('✅ Account verified successfully!');
            console.log('Account Status:', account.status);
            console.log('Account Type:', account.type);
            console.log('');
            console.log('🎉 Twilio credentials are working correctly!');
        })
        .catch(error => {
            console.log('❌ Account verification failed:');
            console.log('Error Code:', error.code);
            console.log('Error Message:', error.message);
            console.log('More Info:', error.moreInfo);
            
            if (error.code === 20003) {
                console.log('');
                console.log('🔧 Authentication Error Solutions:');
                console.log('1. Check if Account SID starts with "AC"');
                console.log('2. Verify Auth Token is correct (32 characters)');
                console.log('3. Make sure Twilio account is active');
                console.log('4. Check if you have sufficient Twilio balance');
            }
        });
        
} catch (error) {
    console.log('❌ Failed to initialize Twilio client:');
    console.log(error.message);
}