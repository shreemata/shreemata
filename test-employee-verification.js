// Test script to verify employee email verification system
const { sendEmployeeVerificationEmail } = require('./utils/emailService');
const crypto = require('crypto');

// Test employee data
const testEmployee = {
    name: "Test Employee",
    email: "test@example.com", // Replace with actual email for testing
    employeeId: "EMP001",
    designation: "Software Developer",
    department: "IT",
    joiningDate: new Date()
};

// Generate test verification token
const verificationToken = crypto.randomBytes(32).toString('hex');

console.log('🧪 Testing Employee Verification Email System');
console.log('📧 Test Employee:', testEmployee.email);
console.log('🔑 Verification Token:', verificationToken);
console.log('🌐 Frontend URL:', process.env.FRONTEND_URL || 'https://shreemata.com');

// Test the email sending
async function testVerificationEmail() {
    try {
        console.log('\n📤 Sending verification email...');
        
        const result = await sendEmployeeVerificationEmail(testEmployee, verificationToken);
        
        if (result.success) {
            console.log('✅ Email sent successfully!');
            console.log('📧 Message ID:', result.messageId);
            
            console.log('\n🔗 Verification URLs that were sent:');
            console.log('Direct (One-Click):', `${process.env.FRONTEND_URL || 'https://shreemata.com'}/api/employees/verify-email/${verificationToken}`);
            console.log('Fallback:', `${process.env.FRONTEND_URL || 'https://shreemata.com'}/employee-verify.html?token=${verificationToken}`);
            
            console.log('\n✨ The employee should receive an email with:');
            console.log('1. A blue "Verify Email Address (One-Click)" button');
            console.log('2. A gray "Alternative Verification Link" button');
            console.log('3. Clear instructions and employee details');
            console.log('4. Contact information for support');
            
        } else {
            console.log('❌ Email sending failed:', result.error);
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testVerificationEmail();