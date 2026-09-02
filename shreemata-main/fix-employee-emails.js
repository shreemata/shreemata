// Fix employee email issues
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function fixEmployeeEmails() {
    try {
        console.log('🔧 Fixing Employee Email Issues...\n');

        // Get all employees
        const allEmployees = await Employee.find({});
        console.log(`📊 Found ${allEmployees.length} employees to check\n`);

        let fixedCount = 0;
        let duplicatesRemoved = 0;

        // Fix email format issues (trim whitespace, convert to lowercase)
        console.log('🔧 Fixing email format issues...');
        for (const emp of allEmployees) {
            const originalEmail = emp.email;
            const fixedEmail = originalEmail.trim().toLowerCase();
            
            if (originalEmail !== fixedEmail) {
                console.log(`📧 Fixing email: "${originalEmail}" → "${fixedEmail}"`);
                console.log(`   Employee: ${emp.name} (${emp.employeeId})`);
                
                emp.email = fixedEmail;
                await emp.save();
                fixedCount++;
            }
        }

        // Find and handle duplicates
        console.log('\n🔍 Checking for duplicates after cleanup...');
        const updatedEmployees = await Employee.find({});
        const emailGroups = {};
        
        updatedEmployees.forEach(emp => {
            const email = emp.email;
            if (emailGroups[email]) {
                emailGroups[email].push(emp);
            } else {
                emailGroups[email] = [emp];
            }
        });

        // Handle duplicates
        for (const email of Object.keys(emailGroups)) {
            if (emailGroups[email].length > 1) {
                console.log(`\n❌ Found ${emailGroups[email].length} employees with email: ${email}`);
                
                // Sort by creation date (keep the oldest)
                const duplicates = emailGroups[email].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                const keepEmployee = duplicates[0];
                const removeEmployees = duplicates.slice(1);
                
                console.log(`✅ Keeping: ${keepEmployee.name} (${keepEmployee.employeeId}) - Created: ${keepEmployee.createdAt}`);
                
                for (const emp of removeEmployees) {
                    console.log(`❌ Removing duplicate: ${emp.name} (${emp.employeeId}) - Created: ${emp.createdAt}`);
                    await Employee.findByIdAndDelete(emp._id);
                    duplicatesRemoved++;
                }
            }
        }

        console.log('\n📊 Summary:');
        console.log('===========');
        console.log(`✅ Email formats fixed: ${fixedCount}`);
        console.log(`❌ Duplicate employees removed: ${duplicatesRemoved}`);
        
        // Show final employee list
        const finalEmployees = await Employee.find({}).select('name email employeeId status');
        console.log(`\n👥 Final Employee List (${finalEmployees.length} employees):`);
        console.log('===============================================');
        finalEmployees.forEach((emp, index) => {
            console.log(`${index + 1}. ${emp.name}`);
            console.log(`   Email: ${emp.email}`);
            console.log(`   ID: ${emp.employeeId}`);
            console.log(`   Status: ${emp.status || 'active'}`);
            console.log('   ---');
        });

        console.log('\n✅ Employee email cleanup completed!');

    } catch (error) {
        console.error('❌ Error fixing employee emails:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the fix
fixEmployeeEmails();