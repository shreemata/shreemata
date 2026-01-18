const express = require('express');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const PointsTransaction = require('../models/PointsTransaction');
const CommissionTransaction = require('../models/CommissionTransaction');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Generate Daily Report PDF
router.get('/daily-report', authenticateToken, isAdmin, async (req, res) => {
  // Set a timeout for the request
  req.setTimeout(60000, () => {
    console.log('❌ Daily report request timed out');
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  
  try {
    console.log('📊 Daily report request received from user:', req.user?.email);
    console.log('📊 Generating daily report...');
    
    // Get date from query parameter or default to today
    const dateParam = req.query.date || 'today';
    let targetDate;
    
    if (dateParam === 'today') {
      targetDate = new Date();
    } else {
      // Parse the date string (YYYY-MM-DD format)
      targetDate = new Date(dateParam + 'T00:00:00.000Z');
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or "today"' });
      }
    }
    
    // Get date range (start and end of selected day)
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);
    
    console.log('📅 Selected date:', dateParam);
    console.log('📅 Date range:', startOfDay.toISOString(), 'to', endOfDay.toISOString());
    
    console.log('🔍 Fetching data from database...');
    
    // Fetch selected date's data with timeout
    const fetchPromise = Promise.all([
      // Selected date's orders
      Order.find({
        createdAt: { $gte: startOfDay, $lt: endOfDay }
      }).populate('user_id', 'name email phone').sort({ createdAt: -1 }),
      
      // Selected date's new users (non-virtual only)
      User.find({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        isVirtual: { $ne: true }
      }).sort({ createdAt: -1 }),
      
      // Selected date's points transactions
      PointsTransaction.find({
        createdAt: { $gte: startOfDay, $lt: endOfDay }
      }).populate('user', 'name email').sort({ createdAt: -1 }),
      
      // Selected date's commission transactions
      CommissionTransaction.find({
        createdAt: { $gte: startOfDay, $lt: endOfDay }
      }).populate('purchaser', 'name email').populate('directReferrer', 'name email').sort({ createdAt: -1 }),
      
      // Total users count (non-virtual)
      User.countDocuments({ isVirtual: { $ne: true } }),
      
      // Total orders count
      Order.countDocuments(),
      
      // All users for referral tree analysis (limited to active users)
      User.find({ 
        isVirtual: { $ne: true },
        createdAt: { $exists: true }
      }).select('name email referralCode referredBy createdAt wallet pointsWallet').limit(200).sort({ createdAt: -1 }),
      
      // Virtual users count
      User.countDocuments({ isVirtual: true }),
      
      // Total revenue calculation from all completed orders
      Order.aggregate([
        { $match: { status: { $in: ['completed', 'pending_payment_verification'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      
      // Total wallet balance across all users
      User.aggregate([
        { $match: { isVirtual: { $ne: true } } },
        { $group: { _id: null, totalWallet: { $sum: '$wallet' }, totalPoints: { $sum: '$pointsWallet' } } }
      ])
    ]);
    
    // Add timeout to database queries
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 30000);
    });
    
    const [
      selectedDateOrders,
      selectedDateUsers,
      selectedDatePoints,
      selectedDateCommissions,
      totalUsers,
      totalOrders,
      allUsers,
      virtualUsersCount,
      totalRevenueResult,
      walletBalanceResult
    ] = await Promise.race([fetchPromise, timeoutPromise]);
    
    console.log('✅ Data fetched successfully');
    console.log(`📊 Selected date data: ${selectedDateOrders.length} orders, ${selectedDateUsers.length} users, ${selectedDatePoints.length} points, ${selectedDateCommissions.length} commissions`);
    
    // Calculate accurate statistics from database
    const stats = {
      selectedDate: {
        orders: selectedDateOrders.length,
        revenue: selectedDateOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
        newUsers: selectedDateUsers.length,
        pointsAwarded: selectedDatePoints.filter(p => p.type === 'earned').reduce((sum, p) => sum + (p.points || 0), 0),
        pointsRedeemed: selectedDatePoints.filter(p => p.type === 'redeemed').reduce((sum, p) => sum + (p.points || 0), 0),
        pointsConvertedToCash: selectedDatePoints.filter(p => p.type.includes('converted_to_cash')).reduce((sum, p) => sum + (p.cashAmount || 0), 0),
        commissionsDistributed: selectedDateCommissions.reduce((sum, c) => sum + (c.directCommissionAmount || 0) + (c.treeCommissions || []).reduce((tSum, tc) => tSum + (tc.amount || 0), 0), 0)
      },
      total: {
        users: totalUsers,
        orders: totalOrders,
        revenue: totalRevenueResult[0]?.total || 0,
        virtualUsers: virtualUsersCount,
        totalWalletBalance: walletBalanceResult[0]?.totalWallet || 0,
        totalPointsBalance: walletBalanceResult[0]?.totalPoints || 0
      }
    };
    
    // Group orders by payment type
    const ordersByPaymentType = selectedDateOrders.reduce((acc, order) => {
      const type = order.paymentType || 'online';
      if (!acc[type]) acc[type] = [];
      acc[type].push(order);
      return acc;
    }, {});
    
    // Group orders by status
    const ordersByStatus = selectedDateOrders.reduce((acc, order) => {
      const status = order.status || 'unknown';
      if (!acc[status]) acc[status] = [];
      acc[status].push(order);
      return acc;
    }, {});
    
    console.log('📊 Statistics calculated:', stats);
    
    // Create PDF
    console.log('📄 Creating PDF document...');
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const dateStr = dateParam === 'today' ? new Date().toISOString().split('T')[0] : dateParam;
    res.setHeader('Content-Disposition', `attachment; filename="Business_Report_${dateStr}.pdf"`);
    
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });
    
    // Pipe PDF directly to response
    doc.pipe(res);
    
    // Add content to PDF
    console.log('📝 Adding content to PDF...');
    await generatePDFContent(doc, {
      date: targetDate,
      dateParam,
      stats,
      selectedDateOrders,
      selectedDateUsers,
      selectedDatePoints,
      selectedDateCommissions,
      ordersByPaymentType,
      ordersByStatus,
      allUsers: allUsers.slice(0, 200) // Increased limit for better data
    });
    
    // Finalize PDF
    console.log('🔚 Finalizing PDF...');
    doc.end();
    
    console.log('✅ Daily report PDF generated successfully');
    
  } catch (error) {
    console.error('❌ Error generating daily report:', error);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate daily report', 
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Generate PDF content
async function generatePDFContent(doc, data) {
  const { date, dateParam, stats, selectedDateOrders, selectedDateUsers, selectedDatePoints, selectedDateCommissions, ordersByPaymentType, ordersByStatus, allUsers } = data;
  
  // Colors
  const colors = {
    primary: '#667eea',
    secondary: '#764ba2',
    success: '#28a745',
    warning: '#ffc107',
    danger: '#dc3545',
    info: '#17a2b8',
    dark: '#343a40',
    light: '#f8f9fa'
  };
  
  let yPosition = 50;
  
  // Header with Logo Area
  doc.fontSize(28)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text('BUSINESS REPORT', 50, yPosition, { align: 'center' });
  
  yPosition += 40;
  
  // Display selected date with proper formatting
  const dateDisplayText = dateParam === 'today' 
    ? `Today - ${date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
    : `${date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  
  doc.fontSize(16)
     .fillColor(colors.dark)
     .font('Helvetica')
     .text(dateDisplayText, 50, yPosition, { align: 'center' });
  
  yPosition += 50;
  
  // Executive Summary Cards
  doc.fontSize(18)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text('EXECUTIVE SUMMARY', 50, yPosition);
  
  yPosition += 30;
  
  // Create professional summary cards
  const summaryCards = [
    { title: 'Orders', value: stats.selectedDate.orders, label: 'ORDERS', color: colors.primary, bgColor: '#e3f2fd' },
    { title: 'Revenue', value: `Rs ${stats.selectedDate.revenue.toLocaleString('en-IN')}`, label: 'REVENUE', color: colors.success, bgColor: '#e8f5e8' },
    { title: 'New Users', value: stats.selectedDate.newUsers, label: 'USERS', color: colors.info, bgColor: '#e0f7fa' },
    { title: 'Total Users', value: stats.total.users, label: 'TOTAL', color: colors.warning, bgColor: '#fff8e1' }
  ];
  
  const cardWidth = 120;
  const cardHeight = 70;
  const cardSpacing = 15;
  
  summaryCards.forEach((card, index) => {
    const x = 50 + (index * (cardWidth + cardSpacing));
    
    // Card background
    doc.rect(x, yPosition, cardWidth, cardHeight)
       .fillColor(card.bgColor)
       .fill();
    
    // Card border
    doc.rect(x, yPosition, cardWidth, cardHeight)
       .strokeColor(card.color)
       .lineWidth(1.5)
       .stroke();
    
    // Label
    doc.fillColor(card.color)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(card.label, x + 10, yPosition + 8);
    
    // Value
    doc.fillColor(colors.dark)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text(card.value, x + 8, yPosition + 25, { width: cardWidth - 16, align: 'center' });
    
    // Title
    doc.fontSize(9)
       .font('Helvetica')
       .text(card.title, x + 8, yPosition + 52, { width: cardWidth - 16, align: 'center' });
  });
  
  yPosition += cardHeight + 40;
  
  // Check if we need a new page
  if (yPosition > 650) {
    doc.addPage();
    yPosition = 50;
  }
  
  // SELECTED DATE'S ORDERS TABLE
  if (selectedDateOrders.length > 0) {
    const dateLabel = dateParam === 'today' ? 'TODAY\'S ORDERS' : 'ORDERS FOR SELECTED DATE';
    doc.fontSize(18)
       .fillColor(colors.primary)
       .font('Helvetica-Bold')
       .text(dateLabel, 50, yPosition);
    
    yPosition += 30;
    
    // Table headers
    const tableHeaders = ['Order ID', 'Customer', 'Items', 'Amount', 'Payment', 'Status'];
    const colWidths = [80, 120, 60, 70, 70, 60];
    const tableX = 50;
    const rowHeight = 25;
    
    // Header background
    doc.rect(tableX, yPosition, colWidths.reduce((a, b) => a + b, 0), rowHeight)
       .fillColor(colors.primary)
       .fill();
    
    // Header text
    let xPos = tableX;
    tableHeaders.forEach((header, index) => {
      doc.fontSize(10)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text(header, xPos + 5, yPosition + 8, { width: colWidths[index] - 10 });
      xPos += colWidths[index];
    });
    
    yPosition += rowHeight;
    
    // Table rows
    selectedDateOrders.slice(0, 15).forEach((order, rowIndex) => {
      if (yPosition > 720) {
        doc.addPage();
        yPosition = 50;
      }
      
      // Alternate row colors
      const rowColor = rowIndex % 2 === 0 ? '#f8f9fa' : 'white';
      doc.rect(tableX, yPosition, colWidths.reduce((a, b) => a + b, 0), rowHeight)
         .fillColor(rowColor)
         .fill();
      
      // Row border
      doc.rect(tableX, yPosition, colWidths.reduce((a, b) => a + b, 0), rowHeight)
         .strokeColor('#dee2e6')
         .lineWidth(0.5)
         .stroke();
      
      xPos = tableX;
      const rowData = [
        order._id.toString().slice(-8),
        order.user_id?.name || 'Unknown',
        order.items?.length || 0,
        `Rs ${(order.totalAmount || 0).toLocaleString('en-IN')}`,
        (order.paymentType || 'online').toUpperCase(),
        (order.status || 'pending').toUpperCase()
      ];
      
      rowData.forEach((data, colIndex) => {
        doc.fontSize(9)
           .fillColor(colors.dark)
           .font('Helvetica')
           .text(data.toString(), xPos + 5, yPosition + 8, { 
             width: colWidths[colIndex] - 10,
             ellipsis: true
           });
        xPos += colWidths[colIndex];
      });
      
      yPosition += rowHeight;
    });
    
    if (selectedDateOrders.length > 15) {
      yPosition += 10;
      doc.fontSize(10)
         .fillColor(colors.info)
         .font('Helvetica-Oblique')
         .text(`... and ${selectedDateOrders.length - 15} more orders`, tableX, yPosition);
    }
    
    yPosition += 30;
  }
  
  // Check if we need a new page
  if (yPosition > 600) {
    doc.addPage();
    yPosition = 50;
  }
  
  // NEW USERS FOR SELECTED DATE
  if (selectedDateUsers.length > 0) {
    const userLabel = dateParam === 'today' ? 'NEW USERS TODAY' : 'NEW USERS FOR SELECTED DATE';
    doc.fontSize(18)
       .fillColor(colors.primary)
       .font('Helvetica-Bold')
       .text(userLabel, 50, yPosition);
    
    yPosition += 30;
    
    // User table headers
    const userHeaders = ['Name', 'Email', 'Phone', 'Registration Time', 'Referral Code'];
    const userColWidths = [100, 140, 80, 100, 80];
    
    // Header background
    doc.rect(50, yPosition, userColWidths.reduce((a, b) => a + b, 0), 25)
       .fillColor(colors.info)
       .fill();
    
    // Header text
    xPos = 50;
    userHeaders.forEach((header, index) => {
      doc.fontSize(10)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text(header, xPos + 5, yPosition + 8, { width: userColWidths[index] - 10 });
      xPos += userColWidths[index];
    });
    
    yPosition += 25;
    
    // User rows
    selectedDateUsers.slice(0, 10).forEach((user, rowIndex) => {
      if (yPosition > 720) {
        doc.addPage();
        yPosition = 50;
      }
      
      const rowColor = rowIndex % 2 === 0 ? '#f0f8ff' : 'white';
      doc.rect(50, yPosition, userColWidths.reduce((a, b) => a + b, 0), 25)
         .fillColor(rowColor)
         .fill();
      
      doc.rect(50, yPosition, userColWidths.reduce((a, b) => a + b, 0), 25)
         .strokeColor('#dee2e6')
         .lineWidth(0.5)
         .stroke();
      
      xPos = 50;
      const userData = [
        user.name || 'N/A',
        user.email || 'N/A',
        user.phone || 'N/A',
        new Date(user.createdAt).toLocaleTimeString('en-IN', { hour12: true }),
        user.referralCode || 'N/A'
      ];
      
      userData.forEach((data, colIndex) => {
        doc.fontSize(9)
           .fillColor(colors.dark)
           .font('Helvetica')
           .text(data, xPos + 5, yPosition + 8, { 
             width: userColWidths[colIndex] - 10,
             ellipsis: true
           });
        xPos += userColWidths[colIndex];
      });
      
      yPosition += 25;
    });
    
    yPosition += 30;
  }
  
  // Check if we need a new page
  if (yPosition > 600) {
    doc.addPage();
    yPosition = 50;
  }
  
  // REFERRAL TREE SUMMARY
  doc.fontSize(18)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text('REFERRAL SYSTEM OVERVIEW', 50, yPosition);
  
  yPosition += 30;
  
  // Calculate referral statistics
  const usersWithReferrals = allUsers.filter(user => user.referredBy);
  const usersWithReferralCode = allUsers.filter(user => user.referralCode);
  
  // Referral stats cards
  const referralStats = [
    { label: 'Active Referrers', value: usersWithReferralCode.length, text: 'REFERRERS' },
    { label: 'Referred Users', value: usersWithReferrals.length, text: 'REFERRED' },
    { label: 'Virtual Trees', value: stats.total.virtualUsers, text: 'VIRTUAL' },
    { label: 'Conversion Rate', value: `${((usersWithReferrals.length / Math.max(usersWithReferralCode.length, 1)) * 100).toFixed(1)}%`, text: 'RATE' }
  ];
  
  referralStats.forEach((stat, index) => {
    const x = 50 + (index * 130);
    
    doc.rect(x, yPosition, 120, 50)
       .fillColor('#f0f8ff')
       .fill();
    
    doc.rect(x, yPosition, 120, 50)
       .strokeColor(colors.info)
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(16)
       .fillColor(colors.info)
       .text(stat.text, x + 10, yPosition + 8);
    
    doc.fontSize(14)
       .fillColor(colors.dark)
       .font('Helvetica-Bold')
       .text(stat.value, x + 35, yPosition + 10);
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(stat.label, x + 10, yPosition + 32, { width: 100 });
  });
  
  yPosition += 70;
  
  // Top Referrers Table
  const topReferrers = allUsers
    .map(user => ({
      ...user.toObject(),
      referralCount: allUsers.filter(u => u.referredBy === user.referralCode).length
    }))
    .filter(user => user.referralCount > 0)
    .sort((a, b) => b.referralCount - a.referralCount)
    .slice(0, 8);
  
  if (topReferrers.length > 0) {
    doc.fontSize(14)
       .fillColor(colors.success)
       .font('Helvetica-Bold')
       .text('TOP REFERRERS', 50, yPosition);
    
    yPosition += 25;
    
    // Top referrers table
    const refHeaders = ['Rank', 'Name', 'Referral Code', 'Referrals', 'Total Purchases'];
    const refColWidths = [40, 120, 100, 60, 80];
    
    // Header
    doc.rect(50, yPosition, refColWidths.reduce((a, b) => a + b, 0), 25)
       .fillColor(colors.success)
       .fill();
    
    xPos = 50;
    refHeaders.forEach((header, index) => {
      doc.fontSize(10)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text(header, xPos + 5, yPosition + 8, { width: refColWidths[index] - 10 });
      xPos += refColWidths[index];
    });
    
    yPosition += 25;
    
    // Referrer rows
    topReferrers.forEach((user, index) => {
      if (yPosition > 720) {
        doc.addPage();
        yPosition = 50;
      }
      
      const medal = index < 3 ? ['1st', '2nd', '3rd'][index] : `${index + 1}th`;
      const rowColor = index < 3 ? '#fff8e1' : (index % 2 === 0 ? '#f8f9fa' : 'white');
      
      doc.rect(50, yPosition, refColWidths.reduce((a, b) => a + b, 0), 25)
         .fillColor(rowColor)
         .fill();
      
      doc.rect(50, yPosition, refColWidths.reduce((a, b) => a + b, 0), 25)
         .strokeColor('#dee2e6')
         .lineWidth(0.5)
         .stroke();
      
      xPos = 50;
      const refData = [
        medal,
        user.name || 'N/A',
        user.referralCode || 'N/A',
        user.referralCount,
        user.totalPurchases || 0
      ];
      
      refData.forEach((data, colIndex) => {
        doc.fontSize(9)
           .fillColor(colors.dark)
           .font('Helvetica')
           .text(data.toString(), xPos + 5, yPosition + 8, { 
             width: refColWidths[colIndex] - 10,
             ellipsis: true
           });
        xPos += refColWidths[colIndex];
      });
      
      yPosition += 25;
    });
    
    yPosition += 30;
  }
  
  // Footer
  if (yPosition > 700) {
    doc.addPage();
    yPosition = 50;
  }
  
  // Business Summary
  doc.fontSize(16)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text('BUSINESS OVERVIEW', 50, yPosition);
  
  yPosition += 25;
  
  const businessStats = [
    `Total Revenue: Rs ${stats.total.revenue.toLocaleString('en-IN')}`,
    `Total Orders: ${stats.total.orders.toLocaleString('en-IN')}`,
    `Total Users: ${stats.total.users.toLocaleString('en-IN')}`,
    `Virtual Users: ${stats.total.virtualUsers.toLocaleString('en-IN')}`,
    `Wallet Balance: Rs ${stats.total.totalWalletBalance.toLocaleString('en-IN')}`,
    `Points Balance: ${stats.total.totalPointsBalance.toLocaleString('en-IN')} points`
  ];
  
  // Add selected date specific stats
  const selectedDateLabel = dateParam === 'today' ? 'Today' : 'Selected Date';
  const selectedDateStats = [
    `${selectedDateLabel} Revenue: Rs ${stats.selectedDate.revenue.toLocaleString('en-IN')}`,
    `${selectedDateLabel} Orders: ${stats.selectedDate.orders}`,
    `${selectedDateLabel} New Users: ${stats.selectedDate.newUsers}`,
    `${selectedDateLabel} Points Awarded: ${stats.selectedDate.pointsAwarded}`,
    `${selectedDateLabel} Points Redeemed: ${stats.selectedDate.pointsRedeemed}`,
    `${selectedDateLabel} Cash Conversions: Rs ${stats.selectedDate.pointsConvertedToCash.toLocaleString('en-IN')}`,
    `${selectedDateLabel} Commissions: Rs ${stats.selectedDate.commissionsDistributed.toLocaleString('en-IN')}`
  ];
  
  // Display business stats
  businessStats.forEach((stat, index) => {
    doc.fontSize(12)
       .fillColor(colors.dark)
       .font('Helvetica')
       .text(`• ${stat}`, 70, yPosition + (index * 20));
  });
  
  yPosition += businessStats.length * 20 + 20;
  
  // Display selected date stats
  doc.fontSize(14)
     .fillColor(colors.info)
     .font('Helvetica-Bold')
     .text(`${selectedDateLabel.toUpperCase()} STATISTICS`, 50, yPosition);
  
  yPosition += 20;
  
  selectedDateStats.forEach((stat, index) => {
    doc.fontSize(12)
       .fillColor(colors.dark)
       .font('Helvetica')
       .text(`• ${stat}`, 70, yPosition + (index * 20));
  });
  
  yPosition += selectedDateStats.length * 20 + 30;
  
  // Report Footer
  doc.fontSize(10)
     .fillColor(colors.info)
     .font('Helvetica-Oblique')
     .text(`Report generated on ${new Date().toLocaleString('en-IN')} by Shree Mata Admin System`, 50, yPosition, { align: 'center' });
  
  yPosition += 20;
  
  doc.fontSize(8)
     .fillColor(colors.dark)
     .text('This report contains confidential business information. Please handle with care.', 50, yPosition, { align: 'center' });
}

module.exports = router;