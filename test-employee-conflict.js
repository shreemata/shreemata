// Test what email/phone conflicts exist
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

async function testEmployeeConflict(testEmail, testPhone) {
    try {
        console.log('🔍 Testing Employee Conflict Check');
        console.log('==================================');
        console.log(`📧 Test Email: "${testEmail}"`);
        console.log(`📱 Test Phone: "${testPhone}"\n`);

        // Check for existing employee with same email or phone
        const existingEmployee = await Employee.findOne({ 
            $or: [{ email: testEmail }, { phone: testPhone }] 
        });

        if (existingEmployee) {
            console.log('❌ CONFLICT FOUND!');
            console.log('==================');
            console.log(`Existing Employee: ${existingEmployee.name}`);
            console.log(`Existing Email: "${existingEmployee.email}"`);
            console.log(`Existing Phone: "${existingEmployee.phone}"`);
            console.log(`Employee ID: ${existingEmployee.employeeId}`);
            console.log(`Status: ${existingEmployee.status || 'active'}\n`);

            // Check which field is conflicting
            if (existingEmployee.email === testEmail) {
                console.log('🔴 EMAIL CONFLICT: The email you\'re trying to use already exists');
            }
            if (existingEmployee.phone === testPhone) {
                console.log('🔴 PHONE CONFLICT: The phone number you\'re trying to use already exists');
            }
        } else {
            console.log('✅ NO CONFLICT FOUND');
            console.log('====================');
            console.log('You can safely create an employee with this email and phone number.');
        }

        // Show all existing employees for reference
        const allEmployees = await Employee.find({}).select('name email phone employeeId status');
        console.log(`\n👥 All Existing Employees (${allEmployees.length}):`);
        console.log('=========================================');
        allEmployees.forEach((emp, index) => {
            console.log(`${index + 1}. ${emp.name}`);
            console.log(`   Email: "${emp.email}"`);
            console.log(`   Phone: "${emp.phone}"`);
            console.log(`   ID: ${emp.employeeId}`);
            console.log(`   Status: ${emp.status || 'active'}`);
            console.log('   ---');
        });

    } catch (error) {
        console.error('❌ Error testing conflict:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Get email and phone from command line arguments
const testEmail = process.argv[2] || 'test@example.com';
const testPhone = process.argv[3] || '1234567890';

console.log('🧪 Employee Conflict Test Tool');
console.log('==============================');
console.log('Usage: node test-employee-conflict.js <email> <phone>');
console.log('Example: node test-employee-conflict.js "newemployee@gmail.com" "9876543210"\n');

// Run the test
testEmployeeConflict(testEmail, testPhone);