// models/Employee.js
const mongoose = require("mongoose");

const salaryRecordSchema = new mongoose.Schema({
  salaryType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'project', 'hourly'],
    required: true,
    default: 'monthly'
  },
  period: {
    type: String,
    required: true // Format: "2024-01" for monthly, "2024-W01" for weekly, "2024-01-15" for daily, etc.
  },
  periodDescription: {
    type: String,
    required: true // Human readable: "January 2024", "Week 1, 2024", "15 Jan 2024", etc.
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  salaryDate: {
    type: Date,
    required: true
  },
  basicSalary: {
    type: Number,
    required: true,
    default: 0
  },
  allowances: {
    type: Number,
    default: 0
  },
  deductions: {
    type: Number,
    default: 0
  },
  bonus: {
    type: Number,
    default: 0
  },
  overtime: {
    type: Number,
    default: 0
  },
  totalSalary: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cash', 'cheque', 'upi'],
    default: 'bank_transfer'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  employeeId: {
    type: String,
    unique: true
  },
  designation: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  joiningDate: {
    type: Date,
    required: true
  },
  basicSalary: {
    type: Number,
    required: true,
    default: 0
  },
  bankDetails: {
    accountNumber: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true
    },
    bankName: {
      type: String,
      trim: true
    },
    accountHolderName: {
      type: String,
      trim: true
    }
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated'],
    default: 'active'
  },
  salaryRecords: [salaryRecordSchema],
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String
  },
  emailVerificationExpires: {
    type: Date
  },
  salaryUpdateOTP: {
    type: String
  },
  salaryUpdateOTPExpires: {
    type: Date
  },
  pendingSalaryUpdate: {
    salaryId: String,
    updateData: Object,
    requestedBy: String,
    requestedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate employee ID automatically
employeeSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    try {
      const Employee = this.constructor;
      
      // Find the highest existing employee ID number
      const employees = await Employee.find({}, { employeeId: 1 }).sort({ employeeId: -1 });
      
      let nextNumber = 1;
      if (employees.length > 0) {
        // Extract numbers from existing employee IDs and find the highest
        const existingNumbers = employees
          .map(emp => {
            const match = emp.employeeId.match(/EMP(\d+)/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(num => num > 0);
        
        if (existingNumbers.length > 0) {
          nextNumber = Math.max(...existingNumbers) + 1;
        }
      }
      
      this.employeeId = `EMP${String(nextNumber).padStart(4, '0')}`;
      console.log(`Generated new employee ID: ${this.employeeId}`);
    } catch (error) {
      console.error('Error generating employee ID:', error);
      return next(error);
    }
  }
  this.updatedAt = new Date();
  next();
});

// Calculate total salary for a salary record
salaryRecordSchema.pre('save', function(next) {
  this.totalSalary = this.basicSalary + this.allowances + this.bonus + this.overtime - this.deductions;
  this.updatedAt = new Date();
  next();
});

// Instance method to get current month salary
employeeSchema.methods.getCurrentMonthSalary = function() {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
  return this.salaryRecords.find(record => 
    record.period === currentMonth || record.month === currentMonth
  );
};

// Instance method to get total paid salary
employeeSchema.methods.getTotalPaidSalary = function() {
  return this.salaryRecords
    .filter(record => record.paymentStatus === 'paid')
    .reduce((total, record) => total + record.totalSalary, 0);
};

// Instance method to get pending salary amount
employeeSchema.methods.getPendingSalary = function() {
  return this.salaryRecords
    .filter(record => record.paymentStatus === 'pending')
    .reduce((total, record) => total + record.totalSalary, 0);
};

// Method to migrate old salary records to new format
employeeSchema.methods.migrateOldSalaryRecords = function() {
  let migrated = false;
  
  this.salaryRecords.forEach(record => {
    // Check if this is an old record (has month but no salaryType)
    if (record.month && !record.salaryType) {
      record.salaryType = 'monthly';
      record.period = record.month;
      
      // Generate period description from month
      if (record.month.includes('-')) {
        const [year, month] = record.month.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        record.periodDescription = `${monthNames[parseInt(month) - 1]} ${year}`;
      } else {
        record.periodDescription = record.month;
      }
      
      // Set start and end dates for monthly records
      if (record.month.includes('-')) {
        const [year, month] = record.month.split('-');
        record.startDate = new Date(year, month - 1, 1);
        record.endDate = new Date(year, month, 0); // Last day of month
      }
      
      // If no salaryDate, use end date
      if (!record.salaryDate && record.endDate) {
        record.salaryDate = record.endDate;
      }
      
      migrated = true;
    }
  });
  
  return migrated;
};

module.exports = mongoose.model("Employee", employeeSchema);