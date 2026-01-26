// Test employee creation with specific data
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

async function testEmployeeCreation() {
    try {
        console.log('🧪 Testing Employee Creation');
        console.log('============================\n');

        // Show existing employees first
        const existingEmployees = await Employee.find({}).select('name email phone employeeId status');
        console.log(`📊 Current Employees in Database (${existingEmployees.length}):`);
        console.log('================================================');
        existingEmployees.forEach((emp, index) => {
            console.log(`${index + 1}. Name: ${emp.name}`);
            console.log(`   Email: "${emp.email}"`);
            console.log(`   Phone: "${emp.phone}"`);
            console.log(`   ID: ${emp.employeeId}`);
            console.log(`   Status: ${emp.status || 'active'}`);
            console.log('   ---');
        });

        console.log('\n🔍 What email and phone are you trying to use?');
        console.log('===============================================');
        console.log('Please provide the email and phone number you want to use for the new employee.');
        console.log('');
        console.log('Example usage:');
        console.log('node test-employee-creation.js "newemployee@gmail.com" "9876543210"');
        console.log('');
        
        // Get test data from command line arguments
        const testEmail = process.argv[2];
        const testPhone = process.argv[3];
        
        if (!testEmail || !testPhone) {
            console.log('❌ Please provide both email and phone number as arguments');
            console.log('Usage: node test-employee-creation.js <email> <phone>');
            return;
        }

        console.log(`📧 Testing Email: "${testEmail}"`);
        console.log(`📱 Testing Phone: "${testPhone}"\n`);

        // Check for conflicts
        const conflictCheck = await Employee.findOne({ 
            $or: [{ email: testEmail }, { phone: testPhone }] 
        });

        if (conflictCheck) {
            console.log('❌ CONFLICT DETECTED!');
            console.log('====================');
            console.log(`Conflicting Employee: ${conflictCheck.name}`);
            console.log(`Existing Email: "${conflictCheck.email}"`);
            console.log(`Existing Phone: "${conflictCheck.phone}"`);
            console.log(`Employee ID: ${conflictCheck.employeeId}`);
            console.log(`Status: ${conflictCheck.status || 'active'}\n`);

            if (conflictCheck.email === testEmail) {
                console.log('🔴 EMAIL CONFLICT: This email is already registered');
                console.log(`   Existing: "${conflictCheck.email}"`);
                console.log(`   Trying:   "${testEmail}"`);
            }
            
            if (conflictCheck.phone === testPhone) {
                console.log('🔴 PHONE CONFLICT: This phone number is already registered');
                console.log(`   Existing: "${conflictCheck.phone}"`);
                console.log(`   Trying:   "${testPhone}"`);
            }

            console.log('\n💡 SOLUTION:');
            console.log('============');
            console.log('Use different email and phone numbers that are not already in the database.');
            console.log('');
            console.log('Available options:');
            console.log('- Use a completely different email (e.g., employee2@gmail.com)');
            console.log('- Use a completely different phone (e.g., 8765432109)');
            
        } else {
            console.log('✅ NO CONFLICT FOUND!');
            console.log('=====================');
            console.log('You can safely create an employee with:');
            console.log(`📧 Email: "${testEmail}"`);
            console.log(`📱 Phone: "${testPhone}"`);
            console.log('');
            console.log('This combination is available and will work.');
        }

    } catch (error) {
        console.error('❌ Error testing employee creation:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the test
testEmployeeCreation();