// Debug script to check employee email conflicts
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function debugEmployeeEmails() {
    try {
        console.log('🔍 Debugging Employee Email Issues...\n');

        // Get all employees (including soft-deleted ones)
        const allEmployees = await Employee.find({}).select('name email employeeId status createdAt');
        
        console.log(`📊 Total employees in database: ${allEmployees.length}\n`);

        if (allEmployees.length === 0) {
            console.log('❌ No employees found in database');
            return;
        }

        // Display all employees
        console.log('👥 All Employees in Database:');
        console.log('=====================================');
        allEmployees.forEach((emp, index) => {
            console.log(`${index + 1}. Name: ${emp.name}`);
            console.log(`   Email: "${emp.email}"`);
            console.log(`   Employee ID: ${emp.employeeId}`);
            console.log(`   Status: ${emp.status || 'active'}`);
            console.log(`   Created: ${emp.createdAt}`);
            console.log('   ---');
        });

        // Check for duplicate emails
        console.log('\n🔍 Checking for Email Duplicates:');
        console.log('==================================');
        
        const emailCounts = {};
        allEmployees.forEach(emp => {
            const email = emp.email.toLowerCase().trim();
            if (emailCounts[email]) {
                emailCounts[email].push(emp);
            } else {
                emailCounts[email] = [emp];
            }
        });

        let duplicatesFound = false;
        Object.keys(emailCounts).forEach(email => {
            if (emailCounts[email].length > 1) {
                duplicatesFound = true;
                console.log(`❌ DUPLICATE EMAIL: ${email}`);
                emailCounts[email].forEach((emp, index) => {
                    console.log(`   ${index + 1}. ${emp.name} (ID: ${emp.employeeId}, Status: ${emp.status || 'active'})`);
                });
                console.log('');
            }
        });

        if (!duplicatesFound) {
            console.log('✅ No duplicate emails found');
        }

        // Check for emails with whitespace or case issues
        console.log('\n🔍 Checking for Email Format Issues:');
        console.log('====================================');
        
        let formatIssues = false;
        allEmployees.forEach(emp => {
            const email = emp.email;
            const trimmedEmail = email.trim();
            const lowerEmail = email.toLowerCase();
            
            if (email !== trimmedEmail) {
                formatIssues = true;
                console.log(`⚠️  WHITESPACE ISSUE: "${email}" → "${trimmedEmail}"`);
                console.log(`   Employee: ${emp.name} (${emp.employeeId})`);
            }
            
            if (email !== lowerEmail && email === trimmedEmail) {
                formatIssues = true;
                console.log(`⚠️  CASE ISSUE: "${email}" → "${lowerEmail}"`);
                console.log(`   Employee: ${emp.name} (${emp.employeeId})`);
            }
        });

        if (!formatIssues) {
            console.log('✅ No email format issues found');
        }

        // Show active vs inactive employees
        console.log('\n📊 Employee Status Summary:');
        console.log('===========================');
        const activeEmployees = allEmployees.filter(emp => emp.status !== 'inactive');
        const inactiveEmployees = allEmployees.filter(emp => emp.status === 'inactive');
        
        console.log(`✅ Active Employees: ${activeEmployees.length}`);
        console.log(`❌ Inactive Employees: ${inactiveEmployees.length}`);

        if (inactiveEmployees.length > 0) {
            console.log('\n❌ Inactive Employees:');
            inactiveEmployees.forEach(emp => {
                console.log(`   - ${emp.name} (${emp.email}) - ID: ${emp.employeeId}`);
            });
        }

    } catch (error) {
        console.error('❌ Error debugging employees:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the debug
debugEmployeeEmails();