const axios = require('axios');

async function testOtp() {
  try {
    console.log('Sending OTP request to http://localhost:3000/api/send-email-otp...');
    const res = await axios.post('http://localhost:3000/api/send-email-otp', {
      email: 'nonexistent_test_12345@example.com'
    });
    console.log('Response status:', res.status);
    console.log('Response data:', res.data);
  } catch (err) {
    console.error('Request error status:', err.response?.status);
    console.error('Request error data:', err.response?.data);
    console.error('Full message:', err.message);
  }
}

testOtp();
