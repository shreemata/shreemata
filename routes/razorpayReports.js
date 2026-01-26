// routes/razorpayReports.js
const express = require("express");
const Razorpay = require("razorpay");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const Order = require("../models/Order");
const User = require("../models/User");

const router = express.Router();

// Test endpoint to verify route is working
router.get("/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Razorpay reports route is working!",
    timestamp: new Date().toISOString()
  });
});

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * GET /api/razorpay-reports/payments
 * Fetch payments from Razorpay with filters and match with user data
 */
router.get("/payments", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { 
      from, 
      to, 
      count = 100, 
      skip = 0,
      status = 'captured' // captured, authorized, failed, refunded
    } = req.query;

    console.log("Fetching Razorpay payments with filters:", { from, to, count, skip, status });

    // Build Razorpay API options
    const options = {
      count: Math.min(parseInt(count), 100), // Max 100 per request
      skip: parseInt(skip)
    };

    // Add date filters if provided
    if (from) {
      options.from = Math.floor(new Date(from).getTime() / 1000); // Unix timestamp
    }
    if (to) {
      options.to = Math.floor(new Date(to).getTime() / 1000); // Unix timestamp
    }

    // Fetch payments from Razorpay
    const payments = await razorpay.payments.all(options);

    // Filter by status if specified
    let filteredPayments = payments.items;
    if (status && status !== 'all') {
      filteredPayments = payments.items.filter(payment => payment.status === status);
    }

    // Enhance payments with user data from our database
    const enhancedPayments = await Promise.all(
      filteredPayments.map(async (payment) => {
        try {
          // Find order by razorpay_order_id or razorpay_payment_id
          let order = null;
          
          // Method 1: Search by razorpay_order_id (most reliable)
          if (payment.order_id) {
            order = await Order.findOne({ razorpay_order_id: payment.order_id }).populate('user_id', 'name email phone');
          }
          
          // Method 2: Search by razorpay_payment_id (fallback)
          if (!order && payment.id) {
            order = await Order.findOne({ razorpay_payment_id: payment.id }).populate('user_id', 'name email phone');
          }
          
          // Method 3: Search by amount and email (last resort for older payments)
          if (!order && payment.email && payment.amount) {
            const paymentAmount = payment.amount / 100; // Convert paise to rupees
            const paymentDate = new Date(payment.created_at * 1000);
            
            // Search for orders with matching amount and user email within 24 hours
            const potentialOrders = await Order.find({
              totalAmount: paymentAmount,
              createdAt: {
                $gte: new Date(paymentDate.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
                $lte: new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000)   // 24 hours after
              }
            }).populate('user_id', 'name email phone');
            
            // Find order with matching user email
            order = potentialOrders.find(o => 
              o.user_id?.email?.toLowerCase() === payment.email?.toLowerCase()
            );
            
            if (order) {
              console.log(`📧 Found order by email match: ${order._id} for payment ${payment.id}`);
            }
          }

          // Add user information to payment
          const enhancedPayment = {
            ...payment,
            user_name: order?.user_id?.name || 'Unknown User',
            user_email: order?.user_id?.email || payment.email || 'No Email',
            user_phone: order?.user_id?.phone || payment.contact || 'No Phone',
            order_found: !!order,
            db_order_id: order?._id || null,
            match_method: order ? (
              order.razorpay_order_id === payment.order_id ? 'order_id' :
              order.razorpay_payment_id === payment.id ? 'payment_id' : 'email_match'
            ) : 'none'
          };

          return enhancedPayment;
        } catch (error) {
          console.error(`Error enhancing payment ${payment.id}:`, error);
          // Return payment with default user info if error occurs
          return {
            ...payment,
            user_name: 'Error Loading',
            user_email: payment.email || 'No Email',
            user_phone: payment.contact || 'No Phone',
            order_found: false,
            db_order_id: null,
            match_method: 'error'
          };
        }
      })
    );

    // Calculate totals
    const totalAmount = enhancedPayments.reduce((sum, payment) => {
      return sum + (payment.amount / 100); // Convert paise to rupees
    }, 0);

    const summary = {
      totalPayments: enhancedPayments.length,
      totalAmount: totalAmount,
      currency: 'INR',
      statusBreakdown: {}
    };

    // Calculate status breakdown
    payments.items.forEach(payment => {
      const status = payment.status;
      if (!summary.statusBreakdown[status]) {
        summary.statusBreakdown[status] = {
          count: 0,
          amount: 0
        };
      }
      summary.statusBreakdown[status].count++;
      summary.statusBreakdown[status].amount += (payment.amount / 100);
    });

    res.json({
      success: true,
      payments: enhancedPayments,
      summary: summary,
      pagination: {
        count: options.count,
        skip: options.skip,
        hasMore: payments.items.length === options.count
      }
    });

  } catch (error) {
    console.error("Error fetching Razorpay payments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment data from Razorpay",
      details: error.message
    });
  }
});

/**
 * GET /api/razorpay-reports/settlements
 * Fetch settlement data from Razorpay
 */
router.get("/settlements", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { 
      from, 
      to, 
      count = 50, 
      skip = 0 
    } = req.query;

    const options = {
      count: Math.min(parseInt(count), 50),
      skip: parseInt(skip)
    };

    if (from) {
      options.from = Math.floor(new Date(from).getTime() / 1000);
    }
    if (to) {
      options.to = Math.floor(new Date(to).getTime() / 1000);
    }

    const settlements = await razorpay.settlements.all(options);

    const totalSettled = settlements.items.reduce((sum, settlement) => {
      return sum + (settlement.amount / 100);
    }, 0);

    res.json({
      success: true,
      settlements: settlements.items,
      summary: {
        totalSettlements: settlements.items.length,
        totalSettledAmount: totalSettled,
        currency: 'INR'
      },
      pagination: {
        count: options.count,
        skip: options.skip,
        hasMore: settlements.items.length === options.count
      }
    });

  } catch (error) {
    console.error("Error fetching Razorpay settlements:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch settlement data from Razorpay",
      details: error.message
    });
  }
});

/**
 * GET /api/razorpay-reports/summary
 * Get payment summary for dashboard
 */
router.get("/summary", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    
    // Get current month if no dates provided
    const now = new Date();
    const defaultFrom = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultTo = to || now.toISOString().split('T')[0];

    const options = {
      count: 100,
      from: Math.floor(new Date(defaultFrom).getTime() / 1000),
      to: Math.floor(new Date(defaultTo + 'T23:59:59').getTime() / 1000)
    };

    console.log("Fetching summary data with options:", options);

    // Initialize summary with default values
    const summary = {
      dateRange: { from: defaultFrom, to: defaultTo },
      total: {
        count: 0,
        amount: 0
      },
      captured: {
        count: 0,
        amount: 0
      },
      failed: {
        count: 0,
        amount: 0
      },
      refunded: {
        count: 0,
        amount: 0
      },
      settled: {
        count: 0,
        amount: 0,
        fees: 0,
        tax: 0
      },
      methodBreakdown: {
        card: { count: 0, amount: 0 },
        netbanking: { count: 0, amount: 0 },
        upi: { count: 0, amount: 0 },
        wallet: { count: 0, amount: 0 },
        other: { count: 0, amount: 0 }
      }
    };

    // Fetch payments (required)
    let payments;
    try {
      payments = await razorpay.payments.all(options);
      console.log("Payments fetched successfully:", payments.items.length, "items");
    } catch (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      throw new Error("Failed to fetch payments: " + paymentsError.message);
    }

    // Fetch settlements (optional - don't fail if this doesn't work)
    // IMPORTANT: Use the SAME date range as payments for consistency
    let settlements = { items: [] };
    try {
      // Use the SAME date range as payments to ensure consistency
      const settlementsOptions = {
        count: 100,
        from: options.from, // Same date range as payments
        to: options.to      // Same date range as payments
      };
      
      console.log("Fetching settlements for SAME date range as payments:", {
        from: new Date(options.from * 1000).toLocaleDateString(),
        to: new Date(options.to * 1000).toLocaleDateString()
      });
      
      settlements = await razorpay.settlements.all(settlementsOptions);
      console.log("Date-filtered settlements fetched successfully:", settlements.items.length, "items");
      
      // If we have many settlements, we might need to fetch more
      if (settlements.items.length === 100) {
        console.log("Warning: Reached settlement limit, there might be more settlements");
        // TODO: Implement pagination if needed
      }
    } catch (settlementsError) {
      console.warn("Warning: Could not fetch settlements (this is normal for new accounts):", settlementsError.message);
      // Continue with empty settlements - this is normal for accounts without settlements yet
    }

    // Process payments
    payments.items.forEach(payment => {
      const amount = payment.amount / 100;
      
      summary.total.count++;
      summary.total.amount += amount;

      // Status breakdown
      if (payment.status === 'captured') {
        summary.captured.count++;
        summary.captured.amount += amount;
      } else if (payment.status === 'failed') {
        summary.failed.count++;
        summary.failed.amount += amount;
      } else if (payment.status === 'refunded') {
        summary.refunded.count++;
        summary.refunded.amount += amount;
      }

      // Method breakdown (only for captured payments)
      if (payment.status === 'captured') {
        const method = payment.method || 'other';
        if (summary.methodBreakdown[method]) {
          summary.methodBreakdown[method].count++;
          summary.methodBreakdown[method].amount += amount;
        } else {
          summary.methodBreakdown.other.count++;
          summary.methodBreakdown.other.amount += amount;
        }
      }
    });

    // Process settlements (if available)
    // NOTE: Now using SAME date range as payments for consistency
    if (settlements.items && settlements.items.length > 0) {
      console.log(`Processing ${settlements.items.length} settlements for the same date range`);
      settlements.items.forEach(settlement => {
        summary.settled.count++;
        summary.settled.amount += (settlement.amount / 100);
        summary.settled.fees += (settlement.fees / 100);
        summary.settled.tax += (settlement.tax / 100);
      });
      console.log(`Settlements total: ₹${summary.settled.amount.toFixed(2)} (${summary.settled.count} settlements)`);
    } else {
      console.log("No settlements found for the date range");
    }

    console.log("Final summary:", summary);

    res.json({
      success: true,
      summary: summary
    });

  } catch (error) {
    console.error("Error fetching Razorpay summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment summary from Razorpay",
      details: error.message
    });
  }
});

/**
 * GET /api/razorpay-reports/export
 * Export payment data as CSV with user information
 */
router.get("/export", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, status = 'captured' } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: "From and To dates are required for export"
      });
    }

    const options = {
      count: 100,
      from: Math.floor(new Date(from).getTime() / 1000),
      to: Math.floor(new Date(to + 'T23:59:59').getTime() / 1000)
    };

    const payments = await razorpay.payments.all(options);
    
    // Filter by status
    const filteredPayments = status === 'all' 
      ? payments.items 
      : payments.items.filter(payment => payment.status === status);

    // Enhance payments with user data
    const enhancedPayments = await Promise.all(
      filteredPayments.map(async (payment) => {
        try {
          let order = null;
          if (payment.order_id) {
            order = await Order.findOne({ razorpay_order_id: payment.order_id }).populate('user_id', 'name email phone');
          }
          if (!order && payment.id) {
            order = await Order.findOne({ razorpay_payment_id: payment.id }).populate('user_id', 'name email phone');
          }

          return {
            ...payment,
            user_name: order?.user_id?.name || 'Unknown User',
            user_email: order?.user_id?.email || payment.email || 'No Email',
            user_phone: order?.user_id?.phone || payment.contact || 'No Phone'
          };
        } catch (error) {
          return {
            ...payment,
            user_name: 'Error Loading',
            user_email: payment.email || 'No Email',
            user_phone: payment.contact || 'No Phone'
          };
        }
      })
    );

    // Generate CSV content with user information
    const csvHeaders = [
      'Payment ID',
      'Order ID', 
      'Amount (₹)',
      'Status',
      'Method',
      'User Name',
      'User Email',
      'User Phone',
      'Razorpay Email',
      'Razorpay Contact',
      'Created At',
      'Captured At'
    ];

    const csvRows = enhancedPayments.map(payment => [
      payment.id,
      payment.order_id || '',
      (payment.amount / 100).toFixed(2),
      payment.status,
      payment.method || '',
      payment.user_name || '',
      payment.user_email || '',
      payment.user_phone || '',
      payment.email || '',
      payment.contact || '',
      new Date(payment.created_at * 1000).toLocaleString('en-IN'),
      payment.captured_at ? new Date(payment.captured_at * 1000).toLocaleString('en-IN') : ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="razorpay-payments-${from}-to-${to}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error("Error exporting Razorpay data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export payment data",
      details: error.message
    });
  }
});

/**
 * GET /api/razorpay-reports/all-settlements
 * Get ALL settlements from Razorpay (not date-filtered)
 */
router.get("/all-settlements", authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log("Fetching ALL settlements from Razorpay...");
    
    let allSettlements = [];
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;
    
    // Fetch all settlements with pagination
    while (hasMore && skip < 1000) { // Safety limit of 1000 settlements
      try {
        const options = {
          count: batchSize,
          skip: skip
        };
        
        console.log(`Fetching settlements batch: skip=${skip}, count=${batchSize}`);
        const batch = await razorpay.settlements.all(options);
        
        if (batch.items && batch.items.length > 0) {
          allSettlements = allSettlements.concat(batch.items);
          skip += batchSize;
          hasMore = batch.items.length === batchSize;
          console.log(`Fetched ${batch.items.length} settlements, total so far: ${allSettlements.length}`);
        } else {
          hasMore = false;
        }
      } catch (batchError) {
        console.error(`Error fetching settlements batch at skip=${skip}:`, batchError);
        hasMore = false;
      }
    }
    
    // Calculate totals
    const totalSettled = allSettlements.reduce((sum, settlement) => {
      return sum + (settlement.amount / 100);
    }, 0);
    
    const totalFees = allSettlements.reduce((sum, settlement) => {
      return sum + (settlement.fees / 100);
    }, 0);
    
    const totalTax = allSettlements.reduce((sum, settlement) => {
      return sum + (settlement.tax / 100);
    }, 0);
    
    console.log(`Total settlements processed: ${allSettlements.length}`);
    console.log(`Total settled amount: ₹${totalSettled}`);
    console.log(`Total fees: ₹${totalFees}`);
    console.log(`Total tax: ₹${totalTax}`);
    
    res.json({
      success: true,
      settlements: {
        count: allSettlements.length,
        totalAmount: totalSettled,
        totalFees: totalFees,
        totalTax: totalTax,
        items: allSettlements // Return all settlements for history view
      }
    });
    
  } catch (error) {
    console.error("Error fetching all settlements:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch all settlements from Razorpay",
      details: error.message
    });
  }
});

/**
 * GET /api/razorpay-reports/all-refunds
 * Get ALL refunds from Razorpay (completed and pending)
 */
router.get("/all-refunds", authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log("Fetching ALL refunds from Razorpay...");
    
    let allRefunds = [];
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;
    
    // Fetch all refunds with pagination
    while (hasMore && skip < 1000) { // Safety limit
      try {
        const options = {
          count: batchSize,
          skip: skip
        };
        
        console.log(`Fetching refunds batch: skip=${skip}, count=${batchSize}`);
        const batch = await razorpay.refunds.all(options);
        
        if (batch.items && batch.items.length > 0) {
          allRefunds = allRefunds.concat(batch.items);
          skip += batchSize;
          hasMore = batch.items.length === batchSize;
          console.log(`Fetched ${batch.items.length} refunds, total so far: ${allRefunds.length}`);
        } else {
          hasMore = false;
        }
      } catch (batchError) {
        console.error(`Error fetching refunds batch at skip=${skip}:`, batchError);
        hasMore = false;
      }
    }
    
    // Categorize refunds by status
    const refundStats = {
      processed: { count: 0, amount: 0, items: [] },
      pending: { count: 0, amount: 0, items: [] },
      failed: { count: 0, amount: 0, items: [] },
      total: { count: 0, amount: 0 }
    };
    
    allRefunds.forEach(refund => {
      const amount = refund.amount / 100;
      refundStats.total.count++;
      refundStats.total.amount += amount;
      
      // Categorize by status
      if (refund.status === 'processed') {
        refundStats.processed.count++;
        refundStats.processed.amount += amount;
        refundStats.processed.items.push(refund);
      } else if (refund.status === 'pending') {
        refundStats.pending.count++;
        refundStats.pending.amount += amount;
        refundStats.pending.items.push(refund);
      } else if (refund.status === 'failed') {
        refundStats.failed.count++;
        refundStats.failed.amount += amount;
        refundStats.failed.items.push(refund);
      }
    });
    
    console.log(`Total refunds processed: ${allRefunds.length}`);
    console.log(`Processed refunds: ${refundStats.processed.count} (₹${refundStats.processed.amount})`);
    console.log(`Pending refunds: ${refundStats.pending.count} (₹${refundStats.pending.amount})`);
    console.log(`Failed refunds: ${refundStats.failed.count} (₹${refundStats.failed.amount})`);
    
    res.json({
      success: true,
      refunds: refundStats,
      recentRefunds: allRefunds.slice(0, 20) // Return 20 most recent for display
    });
    
  } catch (error) {
    console.error("Error fetching all refunds:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch all refunds from Razorpay",
      details: error.message
    });
  }
});

module.exports = router;