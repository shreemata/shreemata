// Auto-verify all existing employees
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

async function autoVerifyAllEmployees() {
    try {
        console.log('🔧 Auto-Verifying All Employees');
        console.log('================================\n');

        // Find all employees
        const allEmployees = await Employee.find({});
        console.log(`📊 Found ${allEmployees.length} employees in database\n`);

        if (allEmployees.length === 0) {
            console.log('❌ No employees found in database');
            return;
        }

        let verifiedCount = 0;
        let alreadyVerifiedCount = 0;

        for (const employee of allEmployees) {
            if (employee.emailVerified) {
                console.log(`✅ ${employee.name} (${employee.email}) - Already verified`);
                alreadyVerifiedCount++;
            } else {
                console.log(`🔧 ${employee.name} (${employee.email}) - Verifying now...`);

                // Auto-verify the employee
                employee.emailVerified = true;
                employee.emailVerificationToken = undefined;
                employee.emailVerificationExpires = undefined;
                await employee.save();

                verifiedCount++;
                console.log(`✅ ${employee.name} - Email verified successfully`);
            }
        }

        console.log('\n📊 Summary:');
        console.log('===========');
        console.log(`✅ Already verified: ${alreadyVerifiedCount}`);
        console.log(`🔧 Newly verified: ${verifiedCount}`);
        console.log(`📊 Total employees: ${allEmployees.length}`);

        if (verifiedCount > 0) {
            console.log('\n🎉 All employees are now verified and can receive salary notifications!');
        } else {
            console.log('\n✅ All employees were already verified!');
        }

    } catch (error) {
        console.error('❌ Error auto-verifying employees:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the auto-verification
autoVerifyAllEmployees();