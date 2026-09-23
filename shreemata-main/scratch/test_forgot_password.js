const axios = require('axios');

async function testForgotPassword() {
  try {
    console.log('Testing forgot-password route...');
    // Unregistered email test:
    const res1 = await axios.post('http://localhost:3000/api/auth/forgot-password-send-email-otp', {
      email: 'nonexistent_reset_user_123@example.com'
    });
    console.log('Unregistered email response:', res1.data);
  } catch (err) {
    console.error('Forgot password test error:', err.response?.data || err.message);
  }
}

testForgotPassword();
