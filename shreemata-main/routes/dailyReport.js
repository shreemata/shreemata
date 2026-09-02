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
    
    const dateStr = dateParam === 'today' ? new Date().toISOString().split('T')[0] : dateParam;
    
    // Check if CSV format requested
    if (req.query.format && req.query.format.toLowerCase() === 'csv') {
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      };
      
      const csvLines = [
        '=== SHREE MATA BUSINESS DAILY REPORT ===',
        `Report Date,${escapeCSV(dateStr)}`,
        `Generated At,${escapeCSV(new Date().toLocaleString('en-IN'))}`,
        '',
        '--- DAILY SUMMARY METRICS ---',
        'Metric,Value',
        `Selected Date Orders,${selectedDateOrders.length}`,
        `Selected Date Revenue (Rs),${stats.selectedDate.revenue.toFixed(2)}`,
        `New Users Registered,${selectedDateUsers.length}`,
        `Commissions Distributed (Rs),${stats.selectedDate.commissionsDistributed.toFixed(2)}`,
        `Total Platform Users,${stats.total.users}`,
        `Total Platform Orders,${stats.total.orders}`,
        `Total Platform Revenue (Rs),${stats.total.revenue.toFixed(2)}`,
        `Total Active Wallet Balances (Rs),${stats.total.totalWalletBalance.toFixed(2)}`,
        '',
        '--- ORDERS ON SELECTED DATE ---',
        ['Order ID', 'Customer Name', 'Customer Email', 'Amount (Rs)', 'Payment Method', 'Status', 'Time'].map(escapeCSV).join(','),
        ...selectedDateOrders.map(o => [
          o._id.toString(),
          o.user_id?.name || 'Guest',
          o.user_id?.email || 'N/A',
          (o.totalAmount || 0).toFixed(2),
          o.paymentType || 'online',
          o.status || 'pending',
          new Date(o.createdAt).toLocaleString('en-IN')
        ].map(escapeCSV).join(',')),
        '',
        '--- COMMISSIONS DISTRIBUTED ON SELECTED DATE ---',
        ['Transaction ID', 'Purchaser', 'Direct Referrer', 'Direct Commission (Rs)', 'Date'].map(escapeCSV).join(','),
        ...selectedDateCommissions.map(c => [
          c._id.toString(),
          c.purchaser?.name || 'Unknown',
          c.directReferrer?.name || 'None',
          (c.directCommissionAmount || 0).toFixed(2),
          new Date(c.createdAt).toLocaleString('en-IN')
        ].map(escapeCSV).join(','))
      ];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Business_Report_${dateStr}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    // Create PDF
    console.log('📄 Creating PDF document...');
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', `attachment; filename="Business_Report_${dateStr}.pdf"`);
    
    const doc = new PDFDocument({ 
      margin: 36,
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

// Brand colors matching the Shree Mata Invoice template
const BRAND = {
  primary: '#000000',
  accent: '#F68048',        // Shree Mata orange
  accentDark: '#d9642c',
  bgHeader: '#f0f0f0',      // Invoice table/party header gray
  bgSubtle: '#fafafa',
  bgRowAlt: '#fcfcfc',
  border: '#000000',
  borderLight: '#cccccc',
  text: '#000000',
  textMuted: '#555555',
  success: '#28a745',       // Functional green
  warning: '#d97706',       // Functional amber
  danger: '#dc3545',        // Functional red
  info: '#0284c7'           // Functional blue
};

// Generate PDF content
async function generatePDFContent(doc, data) {
  const { 
    date, 
    dateParam, 
    stats, 
    selectedDateOrders = [], 
    selectedDateUsers = [], 
    selectedDatePoints = [], 
    selectedDateCommissions = [], 
    ordersByPaymentType = {}, 
    ordersByStatus = {}, 
    allUsers = [] 
  } = data;
  
  const startX = 36;
  const contentWidth = 523;
  const pageBottom = 785;
  let yPosition = 36;

  // Helper function to check page overflow and handle page breaks
  function checkPageBreak(requiredHeight) {
    if (yPosition + requiredHeight > pageBottom) {
      drawPageFooter();
      doc.addPage();
      yPosition = 36;
      return true;
    }
    return false;
  }

  // Draw Page Footer (matching invoice footer note)
  function drawPageFooter() {
    const footerY = 798;
    doc.rect(startX, footerY - 4, contentWidth, 0.75)
       .fillColor(BRAND.border)
       .fill();

    doc.font('Times-Bold')
       .fontSize(8)
       .fillColor(BRAND.textMuted)
       .text('This is a Computer Generated Business Report | SHREE MATA', startX, footerY, {
         width: contentWidth,
         align: 'center'
       });

    doc.font('Times-Italic')
       .fontSize(7)
       .fillColor('#777777')
       .text(`Generated on: ${new Date().toLocaleString('en-IN')} | Confidential Business Information`, startX, footerY + 11, {
         width: contentWidth,
         align: 'center'
       });
  }

  // Helper to draw section header bar (matching Buyer (Bill to) style from invoice)
  function drawSectionHeader(title, y, height = 20) {
    // Header box background
    doc.rect(startX, y, contentWidth, height)
       .fillColor(BRAND.bgHeader)
       .fill();

    // Header box border
    doc.rect(startX, y, contentWidth, height)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    // Accent line on left (orange)
    doc.rect(startX, y, 4, height)
       .fillColor(BRAND.accent)
       .fill();

    // Section title
    doc.font('Times-Bold')
       .fontSize(10)
       .fillColor(BRAND.accent)
       .text(title.toUpperCase(), startX + 10, y + 5);
  }

  // ==========================================
  // 1. TOP HEADER BAND (Matching Invoice Header)
  // ==========================================
  const headerHeight = 84;
  const logoBoxWidth = 80;
  const taxBoxWidth = 135;
  const centerBoxWidth = contentWidth - logoBoxWidth - taxBoxWidth; // 308

  // Outer header border
  doc.rect(startX, yPosition, contentWidth, headerHeight)
     .lineWidth(1.25)
     .strokeColor(BRAND.border)
     .stroke();

  // Vertical dividers
  doc.moveTo(startX + logoBoxWidth, yPosition)
     .lineTo(startX + logoBoxWidth, yPosition + headerHeight)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();

  doc.moveTo(startX + logoBoxWidth + centerBoxWidth, yPosition)
     .lineTo(startX + logoBoxWidth + centerBoxWidth, yPosition + headerHeight)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();

  // Logo Box (Left)
  const logoPath = path.join(__dirname, '../public/images/shiva.png');
  const fallbackLogoPath = path.join(__dirname, '../public/images/logo.png');
  const actualLogoPath = fs.existsSync(logoPath) ? logoPath : (fs.existsSync(fallbackLogoPath) ? fallbackLogoPath : null);

  if (actualLogoPath) {
    try {
      doc.image(actualLogoPath, startX + 6, yPosition + 7, {
        fit: [68, 70],
        align: 'center',
        valign: 'center'
      });
    } catch (e) {
      console.error('Failed to render logo in report header:', e);
    }
  }

  // Center Box (Company title & report subtitle)
  const centerX = startX + logoBoxWidth;
  
  doc.font('Times-Bold')
     .fontSize(8.5)
     .fillColor('#444444')
     .text('DAILY BUSINESS REPORT', centerX, yPosition + 7, {
       width: centerBoxWidth,
       align: 'center'
     });

  doc.font('Times-Bold')
     .fontSize(21)
     .fillColor(BRAND.accent)
     .text('SHREE MATA', centerX, yPosition + 18, {
       width: centerBoxWidth,
       align: 'center'
     });

  doc.font('Times-Roman')
     .fontSize(7.8)
     .fillColor(BRAND.text)
     .text('Nekar Bhavan, Opp. K.H. Patil College, Vidyanagar, Hubballi, Karnataka - 580031', centerX, yPosition + 42, {
       width: centerBoxWidth,
       align: 'center'
     });

  doc.font('Times-Roman')
     .fontSize(7.5)
     .fillColor(BRAND.textMuted)
     .text('Phone: 9886086278 | Email: shree.mata.hbl@gmail.com | Website: www.shreemata.com', centerX, yPosition + 53, {
       width: centerBoxWidth,
       align: 'center'
     });

  // Selected date formatted
  const formattedDate = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const dateDisplayText = dateParam === 'today' ? `Report Period: Today (${formattedDate})` : `Report Period: ${formattedDate}`;

  doc.font('Times-Bold')
     .fontSize(8)
     .fillColor(BRAND.text)
     .text(dateDisplayText, centerX, yPosition + 66, {
       width: centerBoxWidth,
       align: 'center'
     });

  // Right Box (Tax & Metadata Box - shaded, matching invoice)
  const taxX = startX + logoBoxWidth + centerBoxWidth;
  doc.rect(taxX, yPosition, taxBoxWidth, headerHeight)
     .fillColor(BRAND.bgSubtle)
     .fill();

  doc.rect(taxX, yPosition, taxBoxWidth, headerHeight)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();

  const taxDetails = [
    { label: 'GSTIN/UIN:', val: '29GZTPP0335K1ZL' },
    { label: 'PAN No:', val: 'GZTPP0335K' },
    { label: 'State:', val: '29-Karnataka' },
    { label: 'Generated:', val: new Date().toLocaleDateString('en-IN') }
  ];

  let taxY = yPosition + 8;
  taxDetails.forEach(item => {
    doc.font('Times-Bold')
       .fontSize(8)
       .fillColor(BRAND.text)
       .text(item.label, taxX + 8, taxY);

    doc.font('Times-Roman')
       .fontSize(8)
       .fillColor(BRAND.text)
       .text(item.val, taxX + 60, taxY);

    taxY += 17;
  });

  yPosition += headerHeight + 12;

  // ==========================================
  // 2. EXECUTIVE SUMMARY
  // ==========================================
  checkPageBreak(80);
  drawSectionHeader('Executive Summary', yPosition);
  yPosition += 20;

  const cardCount = 4;
  const cardWidth = contentWidth / cardCount;
  const cardHeight = 50;

  const summaryCards = [
    { title: 'Selected Date Orders', value: (stats.selectedDate?.orders ?? 0).toString(), label: 'ORDERS', color: BRAND.text },
    { title: 'Selected Date Revenue', value: `Rs ${(stats.selectedDate?.revenue ?? 0).toLocaleString('en-IN')}`, label: 'REVENUE', color: BRAND.success },
    { title: 'New Users Today', value: (stats.selectedDate?.newUsers ?? 0).toString(), label: 'NEW USERS', color: BRAND.text },
    { title: 'Total Registered Users', value: (stats.total?.users ?? 0).toString(), label: 'TOTAL USERS', color: BRAND.text }
  ];

  summaryCards.forEach((card, index) => {
    const x = startX + (index * cardWidth);
    
    // Outer border for card cell
    doc.rect(x, yPosition, cardWidth, cardHeight)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    // Top subtle bar for label
    doc.rect(x, yPosition, cardWidth, 15)
       .fillColor(BRAND.bgSubtle)
       .fill();
    doc.rect(x, yPosition, cardWidth, 15)
       .lineWidth(0.5)
       .strokeColor(BRAND.border)
       .stroke();

    // Card Label
    doc.font('Times-Bold')
       .fontSize(7.5)
       .fillColor(BRAND.textMuted)
       .text(card.label, x, yPosition + 3.5, { width: cardWidth, align: 'center' });

    // Card Value
    doc.font('Times-Bold')
       .fontSize(13)
       .fillColor(card.color)
       .text(card.value, x + 4, yPosition + 18, { width: cardWidth - 8, align: 'center' });

    // Subtitle
    doc.font('Times-Roman')
       .fontSize(6.8)
       .fillColor('#666666')
       .text(card.title, x + 4, yPosition + 35.5, { width: cardWidth - 8, align: 'center' });
  });

  yPosition += cardHeight + 12;

  // ==========================================
  // 3. SELECTED DATE'S ORDERS TABLE
  // ==========================================
  if (selectedDateOrders && selectedDateOrders.length > 0) {
    const ordersSectionTitle = dateParam === 'today' ? "Today's Orders" : "Orders for Selected Date";
    const tableHeaders = ['Order ID', 'Customer', 'Items', 'Amount', 'Payment', 'Status'];
    const colWidths = [75, 148, 45, 85, 85, 85]; // Total = 523
    const rowHeight = 20;

    checkPageBreak(50 + Math.min(selectedDateOrders.length, 15) * rowHeight);
    drawSectionHeader(`${ordersSectionTitle} (${selectedDateOrders.length})`, yPosition);
    yPosition += 20;

    // Table Header Row
    doc.rect(startX, yPosition, contentWidth, rowHeight)
       .fillColor(BRAND.bgHeader)
       .fill();
    doc.rect(startX, yPosition, contentWidth, rowHeight)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    let curX = startX;
    tableHeaders.forEach((header, i) => {
      if (i > 0) {
        doc.moveTo(curX, yPosition)
           .lineTo(curX, yPosition + rowHeight)
           .lineWidth(0.5)
           .strokeColor(BRAND.border)
           .stroke();
      }

      const align = (i === 2 || i === 4 || i === 5) ? 'center' : (i === 3 ? 'right' : 'left');
      doc.font('Times-Bold')
         .fontSize(8.5)
         .fillColor(BRAND.text)
         .text(header, curX + 5, yPosition + 6, { width: colWidths[i] - 10, align });

      curX += colWidths[i];
    });

    yPosition += rowHeight;

    // Table Rows
    selectedDateOrders.slice(0, 15).forEach((order, rowIndex) => {
      if (checkPageBreak(rowHeight + 20)) {
        // Redraw table header on new page
        doc.rect(startX, yPosition, contentWidth, rowHeight)
           .fillColor(BRAND.bgHeader)
           .fill();
        doc.rect(startX, yPosition, contentWidth, rowHeight)
           .lineWidth(0.75)
           .strokeColor(BRAND.border)
           .stroke();

        let hX = startX;
        tableHeaders.forEach((header, i) => {
          if (i > 0) {
            doc.moveTo(hX, yPosition)
               .lineTo(hX, yPosition + rowHeight)
               .lineWidth(0.5)
               .strokeColor(BRAND.border)
               .stroke();
          }
          const align = (i === 2 || i === 4 || i === 5) ? 'center' : (i === 3 ? 'right' : 'left');
          doc.font('Times-Bold')
             .fontSize(8.5)
             .fillColor(BRAND.text)
             .text(header, hX + 5, yPosition + 6, { width: colWidths[i] - 10, align });
          hX += colWidths[i];
        });
        yPosition += rowHeight;
      }

      const rowBg = rowIndex % 2 === 1 ? BRAND.bgRowAlt : '#ffffff';
      doc.rect(startX, yPosition, contentWidth, rowHeight)
         .fillColor(rowBg)
         .fill();
      doc.rect(startX, yPosition, contentWidth, rowHeight)
         .lineWidth(0.5)
         .strokeColor(BRAND.border)
         .stroke();

      const status = (order.status || 'pending').toUpperCase();
      let statusColor = BRAND.text;
      if (status.includes('COMPLETED') || status === 'DELIVERED') statusColor = BRAND.success;
      else if (status.includes('PENDING') || status === 'PROCESSING') statusColor = BRAND.warning;
      else if (status.includes('CANCEL') || status.includes('FAIL')) statusColor = BRAND.danger;

      const rowData = [
        { text: (order._id ? order._id.toString().slice(-8) : 'N/A'), align: 'left', font: 'Times-Bold', color: BRAND.text },
        { text: order.user_id?.name || 'Unknown', align: 'left', font: 'Times-Roman', color: BRAND.text },
        { text: (order.items?.length || 0).toString(), align: 'center', font: 'Times-Roman', color: BRAND.text },
        { text: `Rs ${(order.totalAmount || 0).toLocaleString('en-IN')}`, align: 'right', font: 'Times-Bold', color: BRAND.text },
        { text: (order.paymentType || 'online').toUpperCase(), align: 'center', font: 'Times-Roman', color: BRAND.textMuted },
        { text: status, align: 'center', font: 'Times-Bold', color: statusColor }
      ];

      curX = startX;
      rowData.forEach((col, i) => {
        if (i > 0) {
          doc.moveTo(curX, yPosition)
             .lineTo(curX, yPosition + rowHeight)
             .lineWidth(0.5)
             .strokeColor(BRAND.border)
             .stroke();
        }

        doc.font(col.font)
           .fontSize(8)
           .fillColor(col.color)
           .text(col.text, curX + 4, yPosition + 5.5, {
             width: colWidths[i] - 8,
             align: col.align,
             ellipsis: true
           });

        curX += colWidths[i];
      });

      yPosition += rowHeight;
    });

    if (selectedDateOrders.length > 15) {
      doc.rect(startX, yPosition, contentWidth, 18)
         .fillColor(BRAND.bgSubtle)
         .fill();
      doc.rect(startX, yPosition, contentWidth, 18)
         .lineWidth(0.5)
         .strokeColor(BRAND.border)
         .stroke();

      doc.font('Times-Italic')
         .fontSize(8)
         .fillColor(BRAND.textMuted)
         .text(`... and ${selectedDateOrders.length - 15} more orders recorded for this date`, startX, yPosition + 5, {
           width: contentWidth,
           align: 'center'
         });
      yPosition += 18;
    }

    yPosition += 12;
  }

  // ==========================================
  // 4. NEW USERS FOR SELECTED DATE
  // ==========================================
  if (selectedDateUsers && selectedDateUsers.length > 0) {
    const userSectionTitle = dateParam === 'today' ? "New Users Registered Today" : "New Users Registered on Selected Date";
    const userHeaders = ['Name', 'Email', 'Phone', 'Registration Time', 'Referral Code'];
    const userColWidths = [115, 158, 80, 90, 80]; // Total = 523
    const rowHeight = 20;

    checkPageBreak(50 + Math.min(selectedDateUsers.length, 10) * rowHeight);
    drawSectionHeader(`${userSectionTitle} (${selectedDateUsers.length})`, yPosition);
    yPosition += 20;

    // Header
    doc.rect(startX, yPosition, contentWidth, rowHeight)
       .fillColor(BRAND.bgHeader)
       .fill();
    doc.rect(startX, yPosition, contentWidth, rowHeight)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    let curX = startX;
    userHeaders.forEach((header, i) => {
      if (i > 0) {
        doc.moveTo(curX, yPosition)
           .lineTo(curX, yPosition + rowHeight)
           .lineWidth(0.5)
           .strokeColor(BRAND.border)
           .stroke();
      }

      const align = (i >= 2) ? 'center' : 'left';
      doc.font('Times-Bold')
         .fontSize(8.5)
         .fillColor(BRAND.text)
         .text(header, curX + 5, yPosition + 6, { width: userColWidths[i] - 10, align });

      curX += userColWidths[i];
    });

    yPosition += rowHeight;

    // Rows
    selectedDateUsers.slice(0, 10).forEach((user, rowIndex) => {
      if (checkPageBreak(rowHeight + 20)) {
        doc.rect(startX, yPosition, contentWidth, rowHeight)
           .fillColor(BRAND.bgHeader)
           .fill();
        doc.rect(startX, yPosition, contentWidth, rowHeight)
           .lineWidth(0.75)
           .strokeColor(BRAND.border)
           .stroke();

        let hX = startX;
        userHeaders.forEach((header, i) => {
          if (i > 0) {
            doc.moveTo(hX, yPosition)
               .lineTo(hX, yPosition + rowHeight)
               .lineWidth(0.5)
               .strokeColor(BRAND.border)
               .stroke();
          }
          const align = (i >= 2) ? 'center' : 'left';
          doc.font('Times-Bold')
             .fontSize(8.5)
             .fillColor(BRAND.text)
             .text(header, hX + 5, yPosition + 6, { width: userColWidths[i] - 10, align });
          hX += userColWidths[i];
        });
        yPosition += rowHeight;
      }

      const rowBg = rowIndex % 2 === 1 ? BRAND.bgRowAlt : '#ffffff';
      doc.rect(startX, yPosition, contentWidth, rowHeight)
         .fillColor(rowBg)
         .fill();
      doc.rect(startX, yPosition, contentWidth, rowHeight)
         .lineWidth(0.5)
         .strokeColor(BRAND.border)
         .stroke();

      const timeStr = user.createdAt ? new Date(user.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
      const userData = [
        { text: user.name || 'N/A', align: 'left', font: 'Times-Bold' },
        { text: user.email || 'N/A', align: 'left', font: 'Times-Roman' },
        { text: user.phone || '-', align: 'center', font: 'Times-Roman' },
        { text: timeStr, align: 'center', font: 'Times-Roman' },
        { text: user.referralCode || '-', align: 'center', font: 'Times-Bold' }
      ];

      curX = startX;
      userData.forEach((col, i) => {
        if (i > 0) {
          doc.moveTo(curX, yPosition)
             .lineTo(curX, yPosition + rowHeight)
             .lineWidth(0.5)
             .strokeColor(BRAND.border)
             .stroke();
        }

        doc.font(col.font)
           .fontSize(8)
           .fillColor(BRAND.text)
           .text(col.text, curX + 4, yPosition + 5.5, {
             width: userColWidths[i] - 8,
             align: col.align,
             ellipsis: true
           });

        curX += userColWidths[i];
      });

      yPosition += rowHeight;
    });

    if (selectedDateUsers.length > 10) {
      doc.rect(startX, yPosition, contentWidth, 18)
         .fillColor(BRAND.bgSubtle)
         .fill();
      doc.rect(startX, yPosition, contentWidth, 18)
         .lineWidth(0.5)
         .strokeColor(BRAND.border)
         .stroke();

      doc.font('Times-Italic')
         .fontSize(8)
         .fillColor(BRAND.textMuted)
         .text(`... and ${selectedDateUsers.length - 10} more new users registered`, startX, yPosition + 5, {
           width: contentWidth,
           align: 'center'
         });
      yPosition += 18;
    }

    yPosition += 12;
  }

  // ==========================================
  // 5. REFERRAL SYSTEM OVERVIEW & TOP REFERRERS
  // ==========================================
  const usersWithReferrals = allUsers.filter(user => user.referredBy);
  const usersWithReferralCode = allUsers.filter(user => user.referralCode);
  const topReferrers = allUsers
    .map(user => ({
      ...(user.toObject ? user.toObject() : user),
      referralCount: allUsers.filter(u => u.referredBy === user.referralCode).length
    }))
    .filter(user => user.referralCount > 0)
    .sort((a, b) => b.referralCount - a.referralCount)
    .slice(0, 8);

  checkPageBreak(110);
  drawSectionHeader('Referral System Overview', yPosition);
  yPosition += 20;

  // Referral 4-metric grid
  const refCardWidth = contentWidth / 4;
  const refCardHeight = 44;
  const refCards = [
    { label: 'ACTIVE REFERRERS', value: usersWithReferralCode.length.toString(), sub: 'Users with Code' },
    { label: 'REFERRED USERS', value: usersWithReferrals.length.toString(), sub: 'Users with Referrer' },
    { label: 'VIRTUAL TREES', value: (stats.total?.virtualUsers ?? 0).toString(), sub: 'Virtual Nodes' },
    { label: 'CONVERSION RATE', value: `${((usersWithReferrals.length / Math.max(usersWithReferralCode.length, 1)) * 100).toFixed(1)}%`, sub: 'Referred Ratio' }
  ];

  refCards.forEach((rc, i) => {
    const x = startX + (i * refCardWidth);

    doc.rect(x, yPosition, refCardWidth, refCardHeight)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    doc.rect(x, yPosition, refCardWidth, 14)
       .fillColor(BRAND.bgSubtle)
       .fill();
    doc.rect(x, yPosition, refCardWidth, 14)
       .lineWidth(0.5)
       .strokeColor(BRAND.border)
       .stroke();

    doc.font('Times-Bold')
       .fontSize(7.5)
       .fillColor(BRAND.textMuted)
       .text(rc.label, x, yPosition + 3, { width: refCardWidth, align: 'center' });

    doc.font('Times-Bold')
       .fontSize(12)
       .fillColor(BRAND.text)
       .text(rc.value, x + 4, yPosition + 17, { width: refCardWidth - 8, align: 'center' });

    doc.font('Times-Roman')
       .fontSize(6.5)
       .fillColor('#777777')
       .text(rc.sub, x + 4, yPosition + 31.5, { width: refCardWidth - 8, align: 'center' });
  });

  yPosition += refCardHeight + 8;

  // Top Referrers Table
  if (topReferrers.length > 0) {
    const refHeaders = ['Rank', 'Name', 'Referral Code', 'Total Referrals', 'Purchases'];
    const refColWidths = [45, 178, 100, 100, 100]; // Total = 523
    const refRowHeight = 19;

    checkPageBreak(30 + topReferrers.length * refRowHeight);

    // Subheader bar
    doc.rect(startX, yPosition, contentWidth, 17)
       .fillColor(BRAND.bgSubtle)
       .fill();
    doc.rect(startX, yPosition, contentWidth, 17)
       .lineWidth(0.5)
       .strokeColor(BRAND.border)
       .stroke();
    doc.font('Times-Bold')
       .fontSize(8)
       .fillColor(BRAND.text)
       .text('TOP REFERRAL LEADERS', startX + 8, yPosition + 4.5);
    yPosition += 17;

    // Table Header
    doc.rect(startX, yPosition, contentWidth, refRowHeight)
       .fillColor(BRAND.bgHeader)
       .fill();
    doc.rect(startX, yPosition, contentWidth, refRowHeight)
       .lineWidth(0.75)
       .strokeColor(BRAND.border)
       .stroke();

    let curX = startX;
    refHeaders.forEach((header, i) => {
      if (i > 0) {
        doc.moveTo(curX, yPosition)
           .lineTo(curX, yPosition + refRowHeight)
           .lineWidth(0.5)
           .strokeColor(BRAND.border)
           .stroke();
      }

      const align = (i === 0 || i === 2 || i === 3) ? 'center' : (i === 4 ? 'right' : 'left');
      doc.font('Times-Bold')
         .fontSize(8)
         .fillColor(BRAND.text)
         .text(header, curX + 4, yPosition + 5, { width: refColWidths[i] - 8, align });
      curX += refColWidths[i];
    });

    yPosition += refRowHeight;

    topReferrers.forEach((user, index) => {
      if (checkPageBreak(refRowHeight + 20)) {
        doc.rect(startX, yPosition, contentWidth, refRowHeight)
           .fillColor(BRAND.bgHeader)
           .fill();
        doc.rect(startX, yPosition, contentWidth, refRowHeight)
           .lineWidth(0.75)
           .strokeColor(BRAND.border)
           .stroke();

        let hX = startX;
        refHeaders.forEach((header, i) => {
          if (i > 0) {
            doc.moveTo(hX, yPosition)
               .lineTo(hX, yPosition + refRowHeight)
               .lineWidth(0.5)
               .strokeColor(BRAND.border)
               .stroke();
          }
          const align = (i === 0 || i === 2 || i === 3) ? 'center' : (i === 4 ? 'right' : 'left');
          doc.font('Times-Bold')
             .fontSize(8)
             .fillColor(BRAND.text)
             .text(header, hX + 4, yPosition + 5, { width: refColWidths[i] - 8, align });
          hX += refColWidths[i];
        });
        yPosition += refRowHeight;
      }

      const medal = index < 3 ? ['1st', '2nd', '3rd'][index] : `${index + 1}th`;
      const rowBg = index < 3 ? '#fffbee' : (index % 2 === 1 ? BRAND.bgRowAlt : '#ffffff');

      doc.rect(startX, yPosition, contentWidth, refRowHeight)
         .fillColor(rowBg)
         .fill();
      doc.rect(startX, yPosition, contentWidth, refRowHeight)
         .lineWidth(0.5)
         .strokeColor(BRAND.border)
         .stroke();

      const rowData = [
        { text: medal, align: 'center', font: 'Times-Bold', color: index < 3 ? BRAND.accentDark : BRAND.text },
        { text: user.name || 'N/A', align: 'left', font: 'Times-Roman', color: BRAND.text },
        { text: user.referralCode || '-', align: 'center', font: 'Times-Roman', color: BRAND.textMuted },
        { text: (user.referralCount ?? 0).toString(), align: 'center', font: 'Times-Bold', color: BRAND.text },
        { text: (user.totalPurchases || 0).toString(), align: 'right', font: 'Times-Roman', color: BRAND.text }
      ];

      curX = startX;
      rowData.forEach((col, i) => {
        if (i > 0) {
          doc.moveTo(curX, yPosition)
             .lineTo(curX, yPosition + refRowHeight)
             .lineWidth(0.5)
             .strokeColor(BRAND.border)
             .stroke();
        }

        doc.font(col.font)
           .fontSize(8)
           .fillColor(col.color)
           .text(col.text, curX + 4, yPosition + 5, {
             width: refColWidths[i] - 8,
             align: col.align,
             ellipsis: true
           });

        curX += refColWidths[i];
      });

      yPosition += refRowHeight;
    });

    yPosition += 12;
  }

  // ==========================================
  // 6. BUSINESS OVERVIEW & SELECTED DATE STATS
  // (Two-Column Invoice Layout: Cumulative vs Selected Date)
  // ==========================================
  checkPageBreak(175);

  const halfWidth = (contentWidth - 11) / 2; // 256
  const boxHeight = 168;
  const col2X = startX + halfWidth + 11;
  const selectedDateLabel = dateParam === 'today' ? 'Today' : 'Selected Date';

  // Left Box: Cumulative Business Overview
  doc.rect(startX, yPosition, halfWidth, 20)
     .fillColor(BRAND.bgHeader)
     .fill();
  doc.rect(startX, yPosition, halfWidth, 20)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();
  doc.rect(startX, yPosition, 3.5, 20)
     .fillColor(BRAND.accent)
     .fill();

  doc.font('Times-Bold')
     .fontSize(9.5)
     .fillColor(BRAND.accent)
     .text('BUSINESS OVERVIEW (ALL-TIME)', startX + 8, yPosition + 5);

  doc.rect(startX, yPosition + 20, halfWidth, boxHeight - 20)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();

  const businessStats = [
    { label: 'Total Revenue', value: `Rs ${(stats.total?.revenue ?? 0).toLocaleString('en-IN')}`, bold: true, color: BRAND.success },
    { label: 'Total Orders', value: (stats.total?.orders ?? 0).toLocaleString('en-IN'), bold: false, color: BRAND.text },
    { label: 'Total Users', value: (stats.total?.users ?? 0).toLocaleString('en-IN'), bold: false, color: BRAND.text },
    { label: 'Virtual Users', value: (stats.total?.virtualUsers ?? 0).toLocaleString('en-IN'), bold: false, color: BRAND.text },
    { label: 'Wallet Balance', value: `Rs ${(stats.total?.totalWalletBalance ?? 0).toLocaleString('en-IN')}`, bold: false, color: BRAND.text },
    { label: 'Points Balance', value: `${(stats.total?.totalPointsBalance ?? 0).toLocaleString('en-IN')} pts`, bold: false, color: BRAND.text },
    { label: 'Platform Status', value: 'Active / Operational', bold: false, color: BRAND.success }
  ];

  let lineY = yPosition + 26;
  businessStats.forEach((stat, i) => {
    if (i % 2 === 1) {
      doc.rect(startX + 1, lineY - 3, halfWidth - 2, 20)
         .fillColor(BRAND.bgSubtle)
         .fill();
    }

    doc.font('Times-Roman')
       .fontSize(8.5)
       .fillColor(BRAND.text)
       .text(stat.label, startX + 8, lineY + 1.5);

    doc.font(stat.bold ? 'Times-Bold' : 'Times-Roman')
       .fontSize(8.5)
       .fillColor(stat.color)
       .text(stat.value, startX + 8, lineY + 1.5, { width: halfWidth - 16, align: 'right' });

    lineY += 20.5;
  });

  // Right Box: Selected Date Statistics
  doc.rect(col2X, yPosition, halfWidth, 20)
     .fillColor(BRAND.bgHeader)
     .fill();
  doc.rect(col2X, yPosition, halfWidth, 20)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();
  doc.rect(col2X, yPosition, 3.5, 20)
     .fillColor(BRAND.accent)
     .fill();

  doc.font('Times-Bold')
     .fontSize(9.5)
     .fillColor(BRAND.accent)
     .text(`${selectedDateLabel.toUpperCase()} PERFORMANCE`, col2X + 8, yPosition + 5);

  doc.rect(col2X, yPosition + 20, halfWidth, boxHeight - 20)
     .lineWidth(0.75)
     .strokeColor(BRAND.border)
     .stroke();

  const selectedDateStats = [
    { label: 'Day Revenue', value: `Rs ${(stats.selectedDate?.revenue ?? 0).toLocaleString('en-IN')}`, bold: true, color: BRAND.success },
    { label: 'Day Orders', value: (stats.selectedDate?.orders ?? 0).toString(), bold: false, color: BRAND.text },
    { label: 'New Registrations', value: (stats.selectedDate?.newUsers ?? 0).toString(), bold: false, color: BRAND.text },
    { label: 'Points Awarded', value: `${(stats.selectedDate?.pointsAwarded ?? 0).toLocaleString('en-IN')} pts`, bold: false, color: BRAND.text },
    { label: 'Points Redeemed', value: `${(stats.selectedDate?.pointsRedeemed ?? 0).toLocaleString('en-IN')} pts`, bold: false, color: BRAND.text },
    { label: 'Cash Conversions', value: `Rs ${(stats.selectedDate?.pointsConvertedToCash ?? 0).toLocaleString('en-IN')}`, bold: false, color: BRAND.text },
    { label: 'Commissions Dist.', value: `Rs ${(stats.selectedDate?.commissionsDistributed ?? 0).toLocaleString('en-IN')}`, bold: false, color: BRAND.text }
  ];

  lineY = yPosition + 26;
  selectedDateStats.forEach((stat, i) => {
    if (i % 2 === 1) {
      doc.rect(col2X + 1, lineY - 3, halfWidth - 2, 20)
         .fillColor(BRAND.bgSubtle)
         .fill();
    }

    doc.font('Times-Roman')
       .fontSize(8.5)
       .fillColor(BRAND.text)
       .text(stat.label, col2X + 8, lineY + 1.5);

    doc.font(stat.bold ? 'Times-Bold' : 'Times-Roman')
       .fontSize(8.5)
       .fillColor(stat.color)
       .text(stat.value, col2X + 8, lineY + 1.5, { width: halfWidth - 16, align: 'right' });

    lineY += 20.5;
  });

  yPosition += boxHeight + 12;

  // Final page footer call on last page
  drawPageFooter();
}

module.exports = router;