// Search for specific employee email
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function searchEmployeeEmail(searchEmail) {
    try {
        console.log(`🔍 Searching for employee with email: "${searchEmail}"\n`);

        // Search with exact match
        const exactMatch = await Employee.findOne({ email: searchEmail });
        
        // Search with case-insensitive match
        const caseInsensitiveMatch = await Employee.findOne({ 
            email: { $regex: new RegExp(`^${searchEmail}$`, 'i') } 
        });
        
        // Search with trimmed match
        const trimmedMatch = await Employee.findOne({ 
            email: { $regex: new RegExp(`^\\s*${searchEmail}\\s*$`, 'i') } 
        });

        // Search for similar emails
        const similarEmails = await Employee.find({
            email: { $regex: new RegExp(searchEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        });

        console.log('📊 Search Results:');
        console.log('==================');
        
        if (exactMatch) {
            console.log('✅ EXACT MATCH FOUND:');
            console.log(`   Name: ${exactMatch.name}`);
            console.log(`   Email: "${exactMatch.email}"`);
            console.log(`   Employee ID: ${exactMatch.employeeId}`);
            console.log(`   Status: ${exactMatch.status || 'active'}`);
            console.log(`   Created: ${exactMatch.createdAt}`);
            console.log(`   Email Verified: ${exactMatch.emailVerified ? 'Yes' : 'No'}`);
        } else {
            console.log('❌ No exact match found');
        }

        if (caseInsensitiveMatch && caseInsensitiveMatch._id.toString() !== exactMatch?._id.toString()) {
            console.log('\n⚠️  CASE-INSENSITIVE MATCH FOUND:');
            console.log(`   Name: ${caseInsensitiveMatch.name}`);
            console.log(`   Email: "${caseInsensitiveMatch.email}"`);
            console.log(`   Employee ID: ${caseInsensitiveMatch.employeeId}`);
            console.log(`   Status: ${caseInsensitiveMatch.status || 'active'}`);
        }

        if (trimmedMatch && trimmedMatch._id.toString() !== exactMatch?._id.toString() && trimmedMatch._id.toString() !== caseInsensitiveMatch?._id.toString()) {
            console.log('\n⚠️  WHITESPACE MATCH FOUND:');
            console.log(`   Name: ${trimmedMatch.name}`);
            console.log(`   Email: "${trimmedMatch.email}"`);
            console.log(`   Employee ID: ${trimmedMatch.employeeId}`);
            console.log(`   Status: ${trimmedMatch.status || 'active'}`);
        }

        if (similarEmails.length > 0) {
            console.log(`\n🔍 Similar emails found (${similarEmails.length}):`);
            similarEmails.forEach((emp, index) => {
                console.log(`   ${index + 1}. "${emp.email}" - ${emp.name} (${emp.employeeId})`);
            });
        }

        // Show all employees for reference
        const allEmployees = await Employee.find({}).select('name email employeeId status');
        console.log(`\n👥 All Employees in Database (${allEmployees.length}):`);
        console.log('=========================================');
        allEmployees.forEach((emp, index) => {
            console.log(`${index + 1}. ${emp.name}`);
            console.log(`   Email: "${emp.email}"`);
            console.log(`   ID: ${emp.employeeId}`);
            console.log(`   Status: ${emp.status || 'active'}`);
            console.log('   ---');
        });

    } catch (error) {
        console.error('❌ Error searching for employee:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Get email from command line argument or use default
const searchEmail = process.argv[2] || 'example@email.com';

console.log('🔍 Employee Email Search Tool');
console.log('=============================');
console.log('Usage: node search-employee-email.js <email@domain.com>');
console.log(`Searching for: ${searchEmail}\n`);

// Run the search
searchEmployeeEmail(searchEmail);