// routes/employees.js
const express = require("express");
const Employee = require("../models/Employee");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { sendEmployeeVerificationEmail, sendSalaryNotificationEmail, sendSalaryPaymentStatusUpdateEmail } = require("../utils/emailService");
const crypto = require("crypto");

const router = express.Router();

/**
 * GET /api/employees
 * Get all employees with salary summary
 */
router.get("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    
    // Add salary summary for each employee and migrate old records if needed
    const employeesWithSummary = await Promise.all(employees.map(async (emp) => {
      // Migrate old salary records if needed
      const migrated = emp.migrateOldSalaryRecords();
      if (migrated) {
        await emp.save();
        console.log(`Migrated old salary records for employee ${emp.name}`);
      }
      
      const totalPaid = emp.getTotalPaidSalary();
      const pendingAmount = emp.getPendingSalary();
      const currentMonthSalary = emp.getCurrentMonthSalary();
      
      return {
        ...emp.toObject(),
        salarySummary: {
          totalPaid,
          pendingAmount,
          currentMonthSalary: currentMonthSalary || null,
          totalRecords: emp.salaryRecords.length
        }
      };
    }));
    
    res.json({
      success: true,
      employees: employeesWithSummary
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch employees",
      details: error.message
    });
  }
});

/**
 * POST /api/employees
 * Add new employee with email verification
 */
router.post("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      designation,
      department,
      joiningDate,
      basicSalary,
      bankDetails,
      address
    } = req.body;

    // Check if employee already exists
    const existingEmployee = await Employee.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        error: "Employee with this email or phone already exists"
      });
    }

    // Create new employee with email automatically verified
    const employee = new Employee({
      name,
      email,
      phone,
      designation,
      department,
      joiningDate: new Date(joiningDate),
      basicSalary,
      bankDetails,
      address,
      emailVerified: true, // Automatically verify email
      // Remove email verification token fields
      // emailVerificationToken: verificationToken,
      // emailVerificationExpires: verificationExpires
    });

    // Try to save with retry logic for duplicate employee ID
    let saveAttempts = 0;
    const maxAttempts = 3;
    
    while (saveAttempts < maxAttempts) {
      try {
        await employee.save();
        break; // Success, exit the retry loop
      } catch (saveError) {
        if (saveError.code === 11000 && saveError.keyPattern?.employeeId) {
          // Duplicate employee ID, regenerate and try again
          saveAttempts++;
          console.log(`Duplicate employee ID detected, attempt ${saveAttempts}/${maxAttempts}`);
          
          if (saveAttempts < maxAttempts) {
            // Force regenerate employee ID
            employee.employeeId = undefined;
            employee.isNew = true;
            continue;
          } else {
            throw new Error('Failed to generate unique employee ID after multiple attempts');
          }
        } else {
          throw saveError; // Re-throw other errors
        }
      }
    }

    // Skip sending verification email - employees are automatically verified
    console.log(`Employee created and automatically verified: ${employee.email}`);

    res.json({
      success: true,
      message: "Employee added successfully and email automatically verified.",
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        employeeId: employee.employeeId,
        emailVerified: employee.emailVerified
      }
    });
  } catch (error) {
    console.error("Error adding employee:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add employee",
      details: error.message
    });
  }
});

/**
 * PUT /api/employees/:id
 * Update employee details
 */
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.emailVerificationToken;
    delete updateData.emailVerificationExpires;
    delete updateData.salaryRecords;

    const employee = await Employee.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    res.json({
      success: true,
      message: "Employee updated successfully",
      employee
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update employee",
      details: error.message
    });
  }
});

/**
 * DELETE /api/employees/:id
 * Delete employee (soft delete by setting status to terminated)
 */
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByIdAndUpdate(
      id,
      { 
        status: 'terminated',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    res.json({
      success: true,
      message: "Employee terminated successfully",
      employee
    });
  } catch (error) {
    console.error("Error terminating employee:", error);
    res.status(500).json({
      success: false,
      error: "Failed to terminate employee",
      details: error.message
    });
  }
});

/**
 * DELETE /api/employees/:id/permanent-delete
 * Permanently delete employee and all salary records
 */
router.delete("/:id/permanent-delete", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    // Log the deletion for audit purposes
    console.log(`🚨 PERMANENT EMPLOYEE DELETION: Admin ${req.user.email} is permanently deleting employee ${employee.name} (${employee.employeeId}) with ${employee.salaryRecords.length} salary records`);

    // Permanently delete the employee
    await Employee.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Employee permanently deleted",
      deletedEmployee: {
        name: employee.name,
        employeeId: employee.employeeId,
        email: employee.email,
        salaryRecordsCount: employee.salaryRecords.length
      }
    });
  } catch (error) {
    console.error("Error permanently deleting employee:", error);
    res.status(500).json({
      success: false,
      error: "Failed to permanently delete employee",
      details: error.message
    });
  }
});

/**
 * POST /api/employees/:id/salary
 * Add salary record for employee
 */
router.post("/:id/salary", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      salaryType,
      period,
      periodDescription,
      startDate,
      endDate,
      salaryDate,
      basicSalary,
      allowances = 0,
      deductions = 0,
      bonus = 0,
      overtime = 0,
      paymentMethod = 'bank_transfer',
      notes = '',
      hoursWorked,
      hourlyRate
    } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    // Check if salary record already exists for this period
    const existingRecord = employee.salaryRecords.find(
      record => record.period === period && record.salaryType === salaryType
    );

    if (existingRecord) {
      return res.status(400).json({
        success: false,
        error: `Salary record already exists for this ${salaryType} period`
      });
    }

    // Calculate total salary
    const totalSalary = basicSalary + allowances + bonus + overtime - deductions;

    // Add salary record
    const salaryRecord = {
      salaryType,
      period,
      periodDescription,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      salaryDate: new Date(salaryDate),
      basicSalary,
      allowances,
      deductions,
      bonus,
      overtime,
      totalSalary,
      paymentMethod,
      notes
    };

    // Add hourly-specific fields if applicable
    if (salaryType === 'hourly' && hoursWorked && hourlyRate) {
      salaryRecord.hoursWorked = hoursWorked;
      salaryRecord.hourlyRate = hourlyRate;
    }

    employee.salaryRecords.push(salaryRecord);
    await employee.save();

    res.json({
      success: true,
      message: "Salary record added successfully",
      salaryRecord: employee.salaryRecords[employee.salaryRecords.length - 1]
    });
  } catch (error) {
    console.error("Error adding salary record:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add salary record",
      details: error.message
    });
  }
});

/**
 * POST /api/employees/:id/salary/:salaryId/request-otp
 * Request OTP for salary update verification
 */
router.post("/:id/salary/:salaryId/request-otp", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id, salaryId } = req.params;
    const { updateData } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    if (!employee.emailVerified) {
      return res.status(400).json({
        success: false,
        error: "Employee email is not verified. Cannot send OTP."
      });
    }

    const salaryRecord = employee.salaryRecords.id(salaryId);
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        error: "Salary record not found"
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in session or temporary storage (using employee record for simplicity)
    employee.salaryUpdateOTP = otp;
    employee.salaryUpdateOTPExpires = otpExpires;
    employee.pendingSalaryUpdate = {
      salaryId: salaryId,
      updateData: updateData,
      requestedBy: req.user.email,
      requestedAt: new Date()
    };
    
    await employee.save();

    // Send OTP email
    const { sendSalaryUpdateOTP } = require("../utils/emailService");
    const emailResult = await sendSalaryUpdateOTP(employee, otp, {
      periodDescription: salaryRecord.periodDescription || salaryRecord.period,
      totalSalary: salaryRecord.totalSalary,
      paymentStatus: updateData.paymentStatus || salaryRecord.paymentStatus,
      period: salaryRecord.period
    });

    if (emailResult.success) {
      res.json({
        success: true,
        message: "OTP sent to employee's email address",
        otpSent: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to send OTP email",
        details: emailResult.error
      });
    }
  } catch (error) {
    console.error("Error requesting salary update OTP:", error);
    res.status(500).json({
      success: false,
      error: "Failed to request OTP",
      details: error.message
    });
  }
});

/**
 * POST /api/employees/:id/salary/:salaryId/verify-otp
 * Verify OTP and update salary record
 */
router.post("/:id/salary/:salaryId/verify-otp", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id, salaryId } = req.params;
    const { otp } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    // Check if OTP exists and is valid
    if (!employee.salaryUpdateOTP || !employee.salaryUpdateOTPExpires) {
      return res.status(400).json({
        success: false,
        error: "No OTP request found. Please request OTP first."
      });
    }

    // Check if OTP has expired
    if (new Date() > employee.salaryUpdateOTPExpires) {
      return res.status(400).json({
        success: false,
        error: "OTP has expired. Please request a new OTP."
      });
    }

    // Verify OTP
    if (employee.salaryUpdateOTP !== otp) {
      return res.status(400).json({
        success: false,
        error: "Invalid OTP. Please check and try again."
      });
    }

    // Check if pending update exists
    if (!employee.pendingSalaryUpdate || employee.pendingSalaryUpdate.salaryId !== salaryId) {
      return res.status(400).json({
        success: false,
        error: "No pending salary update found for this record."
      });
    }

    // Migrate old salary records if needed
    const migrated = employee.migrateOldSalaryRecords();
    if (migrated) {
      console.log(`Migrated old salary records for employee ${employee.name} before update`);
    }

    const salaryRecord = employee.salaryRecords.id(salaryId);
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        error: "Salary record not found"
      });
    }

    // Apply the pending update
    const updateData = employee.pendingSalaryUpdate.updateData;
    const oldPaymentStatus = salaryRecord.paymentStatus;
    
    // If this is still an old record, migrate it manually
    if (salaryRecord.month && !salaryRecord.salaryType) {
      console.log('Manually migrating old salary record');
      salaryRecord.salaryType = 'monthly';
      salaryRecord.period = salaryRecord.month;
      
      // Generate period description from month
      if (salaryRecord.month.includes('-')) {
        const [year, month] = salaryRecord.month.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        salaryRecord.periodDescription = `${monthNames[parseInt(month) - 1]} ${year}`;
      } else {
        salaryRecord.periodDescription = salaryRecord.month;
      }
      
      // Set start and end dates for monthly records
      if (salaryRecord.month.includes('-')) {
        const [year, month] = salaryRecord.month.split('-');
        salaryRecord.startDate = new Date(year, month - 1, 1);
        salaryRecord.endDate = new Date(year, month, 0); // Last day of month
      }
      
      // If no salaryDate, use end date
      if (!salaryRecord.salaryDate && salaryRecord.endDate) {
        salaryRecord.salaryDate = salaryRecord.endDate;
      }
    }

    // Update salary record
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'createdAt') {
        salaryRecord[key] = updateData[key];
      }
    });
    
    // Recalculate total if components changed
    if (updateData.basicSalary || updateData.allowances || updateData.deductions || 
        updateData.bonus || updateData.overtime) {
      salaryRecord.totalSalary = 
        (salaryRecord.basicSalary || 0) + 
        (salaryRecord.allowances || 0) + 
        (salaryRecord.bonus || 0) + 
        (salaryRecord.overtime || 0) - 
        (salaryRecord.deductions || 0);
    }

    // If payment status is being updated to 'paid', set payment date
    if (updateData.paymentStatus === 'paid' && !salaryRecord.paymentDate) {
      salaryRecord.paymentDate = new Date();
    }

    salaryRecord.updatedAt = new Date();

    // Clear OTP and pending update
    employee.salaryUpdateOTP = undefined;
    employee.salaryUpdateOTPExpires = undefined;
    employee.pendingSalaryUpdate = undefined;
    
    console.log('Saving employee with updated salary record after OTP verification');
    await employee.save();

    // Send email notifications if employee email is verified
    if (employee.emailVerified) {
      try {
        // Send payment status update notification if status changed
        if (updateData.paymentStatus && updateData.paymentStatus !== oldPaymentStatus) {
          await sendSalaryPaymentStatusUpdateEmail(
            employee, 
            salaryRecord, 
            oldPaymentStatus, 
            updateData.paymentStatus,
            updateData.notes || ''
          );
          console.log(`Payment status update notification sent to ${employee.email}`);
        }

        // Send salary notification if salary is marked as paid
        if (updateData.paymentStatus === 'paid') {
          await sendSalaryNotificationEmail(employee, salaryRecord);
          console.log(`Salary notification sent to ${employee.email}`);
        }
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
        // Don't fail the update if email fails
      }
    }

    res.json({
      success: true,
      message: "OTP verified successfully. Salary record updated.",
      salaryRecord
    });
  } catch (error) {
    console.error("Error verifying OTP and updating salary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify OTP and update salary",
      details: error.message
    });
  }
});

/**
 * PUT /api/employees/:id/salary/:salaryId
 * Update salary record (now requires OTP verification for payment status changes)
 */
router.put("/:id/salary/:salaryId", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id, salaryId } = req.params;
    const updateData = req.body;

    console.log('Updating salary record:', { id, salaryId, updateData });

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    const salaryRecord = employee.salaryRecords.id(salaryId);
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        error: "Salary record not found"
      });
    }

    // Check if this is a payment status change that requires OTP verification
    const isPaymentStatusChange = updateData.paymentStatus && 
                                 updateData.paymentStatus !== salaryRecord.paymentStatus;

    if (isPaymentStatusChange) {
      if (!employee.emailVerified) {
        // Employee email is not verified, cannot proceed with payment status change
        return res.status(400).json({
          success: false,
          error: "Employee email is not verified. Payment status changes require email verification for OTP.",
          requiresEmailVerification: true,
          message: "Please verify the employee's email address before updating payment status"
        });
      }
      
      // Payment status change requires OTP verification for verified employees
      return res.status(400).json({
        success: false,
        error: "Payment status changes require OTP verification",
        requiresOTP: true,
        message: "Please use the OTP verification process to update payment status"
      });
    }

    // For non-payment status changes or unverified employees, proceed with direct update
    // Migrate old salary records if needed BEFORE finding the specific record
    const migrated = employee.migrateOldSalaryRecords();
    if (migrated) {
      console.log(`Migrated old salary records for employee ${employee.name} before update`);
    }

    console.log('Found salary record:', salaryRecord);

    // If this is still an old record, migrate it manually
    if (salaryRecord.month && !salaryRecord.salaryType) {
      console.log('Manually migrating old salary record');
      salaryRecord.salaryType = 'monthly';
      salaryRecord.period = salaryRecord.month;
      
      // Generate period description from month
      if (salaryRecord.month.includes('-')) {
        const [year, month] = salaryRecord.month.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        salaryRecord.periodDescription = `${monthNames[parseInt(month) - 1]} ${year}`;
      } else {
        salaryRecord.periodDescription = salaryRecord.month;
      }
      
      // Set start and end dates for monthly records
      if (salaryRecord.month.includes('-')) {
        const [year, month] = salaryRecord.month.split('-');
        salaryRecord.startDate = new Date(year, month - 1, 1);
        salaryRecord.endDate = new Date(year, month, 0); // Last day of month
      }
      
      // If no salaryDate, use end date
      if (!salaryRecord.salaryDate && salaryRecord.endDate) {
        salaryRecord.salaryDate = salaryRecord.endDate;
      }
    }

    // Update salary record - be careful with new fields
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'createdAt') {
        salaryRecord[key] = updateData[key];
      }
    });
    
    // Recalculate total if components changed
    if (updateData.basicSalary || updateData.allowances || updateData.deductions || 
        updateData.bonus || updateData.overtime) {
      salaryRecord.totalSalary = 
        (salaryRecord.basicSalary || 0) + 
        (salaryRecord.allowances || 0) + 
        (salaryRecord.bonus || 0) + 
        (salaryRecord.overtime || 0) - 
        (salaryRecord.deductions || 0);
    }

    // If payment status is being updated to 'paid', set payment date
    if (updateData.paymentStatus === 'paid' && !salaryRecord.paymentDate) {
      salaryRecord.paymentDate = new Date();
    }

    salaryRecord.updatedAt = new Date();
    
    console.log('Saving employee with updated salary record');
    await employee.save();

    // Send email notification if salary is marked as paid
    if (updateData.paymentStatus === 'paid' && employee.emailVerified) {
      try {
        await sendSalaryNotificationEmail(employee, salaryRecord);
        console.log(`Salary notification sent to ${employee.email}`);
      } catch (emailError) {
        console.error("Error sending salary notification:", emailError);
        // Don't fail the update if email fails
      }
    }

    res.json({
      success: true,
      message: "Salary record updated successfully",
      salaryRecord
    });
  } catch (error) {
    console.error("Error updating salary record:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update salary record",
      details: error.message
    });
  }
});

/**
 * GET /api/employees/:id/salary
 * Get all salary records for an employee
 */
router.get("/:id/salary", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    // Migrate old salary records if needed
    const migrated = employee.migrateOldSalaryRecords();
    if (migrated) {
      await employee.save();
      console.log(`Migrated old salary records for employee ${employee.name}`);
    }

    // Sort salary records by date (newest first)
    const sortedRecords = employee.salaryRecords.sort((a, b) => {
      const dateA = a.salaryDate || a.endDate || new Date(a.period + '-01');
      const dateB = b.salaryDate || b.endDate || new Date(b.period + '-01');
      return new Date(dateB) - new Date(dateA);
    });

    res.json({
      success: true,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeId: employee.employeeId,
        email: employee.email
      },
      salaryRecords: sortedRecords
    });
  } catch (error) {
    console.error("Error fetching salary records:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch salary records",
      details: error.message
    });
  }
});

/**
 * POST /api/employees/verify-email
 * Verify employee email with token
 */
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    const employee = await Employee.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!employee) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification token"
      });
    }

    employee.emailVerified = true;
    employee.emailVerificationToken = undefined;
    employee.emailVerificationExpires = undefined;
    await employee.save();

    res.json({
      success: true,
      message: "Email verified successfully",
      employee: {
        name: employee.name,
        email: employee.email,
        employeeId: employee.employeeId
      }
    });
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify email",
      details: error.message
    });
  }
});

/**
 * GET /api/employees/verify-email/:token
 * Direct email verification via GET request (one-click verification)
 */
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔍 Direct verification attempt for token:', token);

    const employee = await Employee.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!employee) {
      console.log('❌ Invalid or expired token');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://shreemata.com'}/employee-verify.html?status=error&message=Invalid or expired verification token`);
    }

    // Verify the employee
    employee.emailVerified = true;
    employee.emailVerificationToken = undefined;
    employee.emailVerificationExpires = undefined;
    await employee.save();

    console.log('✅ Employee email verified successfully:', employee.email);

    // Redirect to success page with employee info
    const successUrl = `${process.env.FRONTEND_URL || 'https://shreemata.com'}/employee-verify.html?status=success&name=${encodeURIComponent(employee.name)}&email=${encodeURIComponent(employee.email)}&employeeId=${encodeURIComponent(employee.employeeId)}`;
    
    res.redirect(successUrl);
  } catch (error) {
    console.error("❌ Error in direct email verification:", error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://shreemata.com'}/employee-verify.html?status=error&message=Verification failed. Please try again.`);
  }
});

/**
 * POST /api/employees/resend-verification
 * Resend verification email to employee
 */
router.post("/resend-verification", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { employeeId } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    if (employee.emailVerified) {
      return res.status(400).json({
        success: false,
        error: "Email is already verified"
      });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    employee.emailVerificationToken = verificationToken;
    employee.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await employee.save();

    // Send verification email
    const emailResult = await sendEmployeeVerificationEmail(employee, verificationToken);
    
    if (emailResult.success) {
      res.json({
        success: true,
        message: "Verification email sent successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to send verification email"
      });
    }
  } catch (error) {
    console.error("Error resending verification email:", error);
    res.status(500).json({
      success: false,
      error: "Failed to resend verification email"
    });
  }
});

/**
 * GET /api/employees/salary-summary
 * Get salary summary for all employees
 */
router.get("/salary-summary", authenticateToken, isAdmin, async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'active' });
    
    let totalPaidSalaries = 0;
    let totalPendingSalaries = 0;
    let totalEmployees = employees.length;
    let currentMonthPayments = 0;
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    employees.forEach(emp => {
      totalPaidSalaries += emp.getTotalPaidSalary();
      totalPendingSalaries += emp.getPendingSalary();
      
      const currentMonthSalary = emp.getCurrentMonthSalary();
      if (currentMonthSalary && currentMonthSalary.paymentStatus === 'paid') {
        currentMonthPayments += currentMonthSalary.totalSalary;
      }
    });

    res.json({
      success: true,
      summary: {
        totalEmployees,
        totalPaidSalaries,
        totalPendingSalaries,
        currentMonthPayments,
        currentMonth
      }
    });
  } catch (error) {
    console.error("Error fetching salary summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch salary summary",
      details: error.message
    });
  }
});

/**
 * POST /api/employees/cleanup-ids
 * Utility route to clean up duplicate employee IDs (Admin only)
 */
router.post("/cleanup-ids", authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('🧹 Starting employee ID cleanup...');
    
    const employees = await Employee.find().sort({ createdAt: 1 });
    const seenIds = new Set();
    const duplicates = [];
    let fixed = 0;
    
    for (const employee of employees) {
      if (seenIds.has(employee.employeeId)) {
        duplicates.push(employee);
      } else {
        seenIds.add(employee.employeeId);
      }
    }
    
    console.log(`Found ${duplicates.length} employees with duplicate IDs`);
    
    // Fix duplicate IDs
    for (const employee of duplicates) {
      const oldId = employee.employeeId;
      employee.employeeId = undefined; // Force regeneration
      employee.isNew = false; // But don't trigger other new document logic
      
      // Manually trigger ID generation
      const existingNumbers = Array.from(seenIds)
        .map(id => {
          const match = id.match(/EMP(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
      const newId = `EMP${String(nextNumber).padStart(4, '0')}`;
      
      employee.employeeId = newId;
      seenIds.add(newId);
      
      await employee.save();
      console.log(`Fixed employee ${employee.name}: ${oldId} → ${newId}`);
      fixed++;
    }
    
    res.json({
      success: true,
      message: `Cleanup completed. Fixed ${fixed} duplicate employee IDs.`,
      details: {
        totalEmployees: employees.length,
        duplicatesFound: duplicates.length,
        duplicatesFixed: fixed
      }
    });
  } catch (error) {
    console.error("Error during employee ID cleanup:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cleanup employee IDs",
      details: error.message
    });
  }
});

module.exports = router;