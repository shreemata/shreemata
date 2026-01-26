// List all employees and their email verification status
require('dotenv').config();

const mongoose = require('mongoose');
const Employee = require('./models/Employee');

mongoose.connect(process.env.MONGO_URI);

async function listAllEmployees() {
  try {
    console.log('👥 Listing all employees...\n');
    
    const employees = await Employee.find().sort({ createdAt: -1 });
    
    if (employees.length === 0) {
      console.log('❌ No employees found in database');
      return;
    }
    
    console.log(`📊 Found ${employees.length} employees:\n`);
    
    employees.forEach((employee, index) => {
      console.log(`${index + 1}. ${employee.name}`);
      console.log(`   📧 Email: ${employee.email}`);
      console.log(`   🆔 Employee ID: ${employee.employeeId}`);
      console.log(`   🔑 Database ID: ${employee._id}`);
      console.log(`   ✅ Email Verified: ${employee.emailVerified ? 'YES' : 'NO'}`);
      console.log(`   📅 Created: ${employee.createdAt?.toLocaleDateString()}`);
      console.log('');
    });
    
    // Show unverified employees
    const unverifiedEmployees = employees.filter(emp => !emp.emailVerified);
    
    if (unverifiedEmployees.length > 0) {
      console.log('⚠️  Unverified employees:');
      unverifiedEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. ${emp.name} (${emp.email})`);
        console.log(`   To verify: node verify-employee-email-direct.js ${emp._id}`);
        console.log('');
      });
    } else {
      console.log('✅ All employees have verified emails!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

listAllEmployees();