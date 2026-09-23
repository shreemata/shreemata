const axios = require('axios');
const fs = require('fs');

async function runE2E() {
  const timestamp = Date.now();
  const testEmail = `shreematatest_${timestamp}@gmail.com`;
  const testPhone = '9' + String(Math.floor(100000000 + Math.random() * 900000000));
  const testPassword = 'TestPassword123!';
  const testName = 'E2E Test User';

  console.log(`Starting E2E test with email: ${testEmail}, phone: ${testPhone}`);

  // 1. Send OTP
  console.log('Step 1: Requesting Email OTP...');
  const sendRes = await axios.post('http://localhost:3000/api/send-email-otp', {
    email: testEmail
  });
  console.log('Send OTP response:', sendRes.data);
  if (!sendRes.data.success) throw new Error('Send OTP failed');

  // Wait 1.5 seconds for log flush
  await new Promise(r => setTimeout(r, 1500));

  // Read log file to extract OTP
  const logContent = fs.readFileSync('C:\\Users\\SERVER\\.gemini\\antigravity-ide\\brain\\42a78d01-13af-4ecf-8bc1-27c6f2531ac0\\.system_generated\\tasks\\task-181.log', 'utf8');
  const otpMatch = logContent.match(new RegExp(`Generated email OTP for ${testEmail}: (\\d{6})`));
  if (!otpMatch) throw new Error('Could not find OTP in log');
  const otp = otpMatch[1];
  console.log(`Extracted OTP from server log: ${otp}`);

  // 2. Verify OTP
  console.log('Step 2: Verifying Email OTP...');
  const verifyRes = await axios.post('http://localhost:3000/api/verify-email-otp', {
    email: testEmail,
    otp: otp
  });
  console.log('Verify OTP response:', verifyRes.data);
  if (!verifyRes.data.success) throw new Error('Verify OTP failed');

  // 3. Signup
  console.log('Step 3: Completing signup...');
  const signupRes = await axios.post('http://localhost:3000/api/signup', {
    name: testName,
    email: testEmail,
    phone: testPhone,
    password: testPassword
  });
  console.log('Signup response status:', signupRes.status);
  console.log('Signup response data:', {
    user: signupRes.data.user?.email,
    token: signupRes.data.token ? 'JWT_TOKEN_PRESENT' : 'NO_TOKEN'
  });
  if (!signupRes.data.token) throw new Error('Signup failed: No token returned');

  // 4. Login
  console.log('Step 4: Testing Login with newly created user...');
  const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
    email: testEmail,
    password: testPassword
  });
  console.log('Login response status:', loginRes.status);
  console.log('Login response data:', {
    token: loginRes.data.token ? 'JWT_TOKEN_PRESENT' : 'NO_TOKEN',
    user: loginRes.data.user?.email
  });
  if (!loginRes.data.token) throw new Error('Login failed');

  console.log('🎉 ALL BACKEND E2E STEPS SUCCEEDED PERFECTLY!');
}

runE2E().catch(err => {
  console.error('E2E Test Failed:', err.response?.data || err.message);
  process.exit(1);
});
