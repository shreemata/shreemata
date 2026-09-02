const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Razorpay = require('razorpay');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const PointsTransaction = require('../models/PointsTransaction');
const CommissionTransaction = require('../models/CommissionTransaction');
const { Invoice } = require('./invoices');

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// Helper to escape CSV fields
function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// Helper to format date safely
function formatDate(d) {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return String(d);
  }
}

// Helper to format date & time
function formatDateTime(d) {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return String(d);
  }
}

// Helper to parse date filters from query
function parseDateRange(from, to) {
  let startDate = null;
  let endDate = null;

  if (from) {
    startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
  }
  if (to) {
    endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
  }

  const query = {};
  if (startDate && endDate) {
    query.$gte = startDate;
    query.$lte = endDate;
  } else if (startDate) {
    query.$gte = startDate;
  } else if (endDate) {
    query.$lte = endDate;
  }

  return { startDate, endDate, query: Object.keys(query).length > 0 ? query : null };
}

// Standard PDF Header Helper
function drawPDFHeader(doc, title, subtitle, dateRangeText) {
  const primaryColor = '#0f172a';
  const accentColor = '#F68048';
  const mutedColor = '#64748b';

  // Company Name & Accent Bar
  doc.rect(36, 36, 4, 32).fill(accentColor);
  doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text('SHREE MATA', 46, 38);
  doc.fontSize(9).font('Helvetica').fillColor(mutedColor).text('CENTRALIZED REPORTS & EXPORTS SYSTEM', 46, 56);

  // Report Title Box
  doc.fontSize(14).font('Helvetica-Bold').fillColor(accentColor).text(title.toUpperCase(), 36, 80);
  if (subtitle) {
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor).text(subtitle, 36, 96);
  }

  // Metadata Box on Top Right
  const generatedAt = formatDateTime(new Date());
  doc.fontSize(8).font('Helvetica').fillColor(mutedColor);
  doc.text(`Generated: ${generatedAt}`, 350, 38, { align: 'right', width: 210 });
  if (dateRangeText) {
    doc.text(`Period: ${dateRangeText}`, 350, 50, { align: 'right', width: 210 });
  }

  // Divider line
  doc.moveTo(36, 112).lineTo(560, 112).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.y = 122;
}

// Draw Summary KPI Box in PDF
function drawSummaryCards(doc, cards, startY) {
  const cardWidth = (524 - (cards.length - 1) * 8) / cards.length;
  let curX = 36;
  const cardHeight = 44;

  cards.forEach(card => {
    doc.roundedRect(curX, startY, cardWidth, cardHeight, 4).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text(card.label.toUpperCase(), curX + 8, startY + 8, { width: cardWidth - 16, ellipsis: true });
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(String(card.value), curX + 8, startY + 22, { width: cardWidth - 16, ellipsis: true });
    curX += cardWidth + 8;
  });

  doc.y = startY + cardHeight + 14;
}

// Draw PDF Table with automatic page breaking
function drawPDFTable(doc, headers, rows, colWidths, startY) {
  let y = startY || doc.y;
  const rowHeight = 20;
  const startX = 36;
  const tableWidth = 524;

  // Header Row
  doc.rect(startX, y, tableWidth, 22).fill('#1e293b');
  let curX = startX;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
  headers.forEach((h, i) => {
    doc.text(h, curX + 4, y + 6, { width: colWidths[i] - 8, align: i >= headers.length - 2 ? 'right' : 'left', ellipsis: true });
    curX += colWidths[i];
  });

  y += 22;

  // Data Rows
  rows.forEach((row, rowIndex) => {
    if (y + rowHeight > 750) {
      doc.addPage();
      y = 40;
      // Repeat header on new page
      doc.rect(startX, y, tableWidth, 22).fill('#1e293b');
      curX = startX;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      headers.forEach((h, i) => {
        doc.text(h, curX + 4, y + 6, { width: colWidths[i] - 8, align: i >= headers.length - 2 ? 'right' : 'left', ellipsis: true });
        curX += colWidths[i];
      });
      y += 22;
    }

    const isAlt = rowIndex % 2 === 1;
    if (isAlt) {
      doc.rect(startX, y, tableWidth, rowHeight).fill('#f8fafc');
    }

    doc.rect(startX, y, tableWidth, rowHeight).strokeColor('#f1f5f9').lineWidth(0.5).stroke();

    curX = startX;
    doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b');
    row.forEach((cell, i) => {
      doc.text(String(cell || '-'), curX + 4, y + 5, { width: colWidths[i] - 8, align: i >= row.length - 2 ? 'right' : 'left', ellipsis: true });
      curX += colWidths[i];
    });

    y += rowHeight;
  });

  doc.y = y + 10;
}

/* =========================================================================
   1. DAILY / BUSINESS REPORT (PDF & CSV)
   ========================================================================= */
router.get('/daily-report', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { date = 'today', format = 'pdf' } = req.query;

    let targetDate = new Date();
    if (date !== 'today') {
      targetDate = new Date(date + 'T00:00:00.000Z');
      if (isNaN(targetDate.getTime())) {
        targetDate = new Date();
      }
    }

    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

    const [
      orders,
      users,
      points,
      commissions,
      totalUsers,
      totalOrders,
      totalRevenueResult,
      walletBalanceResult
    ] = await Promise.all([
      Order.find({ createdAt: { $gte: startOfDay, $lt: endOfDay } }).populate('user_id', 'name email phone').sort({ createdAt: -1 }),
      User.find({ createdAt: { $gte: startOfDay, $lt: endOfDay }, isVirtual: { $ne: true } }).sort({ createdAt: -1 }),
      PointsTransaction.find({ createdAt: { $gte: startOfDay, $lt: endOfDay } }).populate('user', 'name email').sort({ createdAt: -1 }),
      CommissionTransaction.find({ createdAt: { $gte: startOfDay, $lt: endOfDay } }).populate('purchaser', 'name email').populate('directReferrer', 'name email').sort({ createdAt: -1 }),
      User.countDocuments({ isVirtual: { $ne: true } }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $in: ['completed', 'pending_payment_verification'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      User.aggregate([
        { $match: { isVirtual: { $ne: true } } },
        { $group: { _id: null, totalWallet: { $sum: '$wallet' }, totalPoints: { $sum: '$pointsWallet' } } }
      ])
    ]);

    const dateStr = date === 'today' ? new Date().toISOString().split('T')[0] : date;
    const totalDayRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalDayCommissions = commissions.reduce((sum, c) => sum + (c.directCommissionAmount || 0) + (c.treeCommissions || []).reduce((ts, tc) => ts + (tc.amount || 0), 0), 0);

    if (format.toLowerCase() === 'csv') {
      const csvLines = [];
      csvLines.push('=== SHREE MATA BUSINESS DAILY REPORT ===');
      csvLines.push(`Report Date,${escapeCSV(dateStr)}`);
      csvLines.push(`Generated At,${escapeCSV(formatDateTime(new Date()))}`);
      csvLines.push('');
      csvLines.push('--- DAILY SUMMARY METRICS ---');
      csvLines.push('Metric,Value');
      csvLines.push(`Selected Date Orders,${orders.length}`);
      csvLines.push(`Selected Date Revenue (Rs),${totalDayRevenue.toFixed(2)}`);
      csvLines.push(`New Users Registered,${users.length}`);
      csvLines.push(`Commissions Distributed (Rs),${totalDayCommissions.toFixed(2)}`);
      csvLines.push(`Total Platform Users,${totalUsers}`);
      csvLines.push(`Total Platform Orders,${totalOrders}`);
      csvLines.push(`Total Platform Revenue (Rs),${(totalRevenueResult[0]?.total || 0).toFixed(2)}`);
      csvLines.push(`Total Active Wallet Balances (Rs),${(walletBalanceResult[0]?.totalWallet || 0).toFixed(2)}`);
      csvLines.push('');
      csvLines.push('--- ORDERS ON SELECTED DATE ---');
      csvLines.push(['Order ID', 'Customer Name', 'Customer Email', 'Amount (Rs)', 'Payment Method', 'Status', 'Time'].map(escapeCSV).join(','));
      orders.forEach(o => {
        csvLines.push([
          o._id.toString(),
          o.user_id?.name || 'Guest/Unknown',
          o.user_id?.email || 'N/A',
          (o.totalAmount || 0).toFixed(2),
          o.paymentType || 'online',
          o.status || 'pending',
          formatDateTime(o.createdAt)
        ].map(escapeCSV).join(','));
      });
      csvLines.push('');
      csvLines.push('--- COMMISSIONS DISTRIBUTED ON SELECTED DATE ---');
      csvLines.push(['Transaction ID', 'Purchaser', 'Direct Referrer', 'Direct Commission (Rs)', 'Date'].map(escapeCSV).join(','));
      commissions.forEach(c => {
        csvLines.push([
          c._id.toString(),
          c.purchaser?.name || 'Unknown',
          c.directReferrer?.name || 'None',
          (c.directCommissionAmount || 0).toFixed(2),
          formatDateTime(c.createdAt)
        ].map(escapeCSV).join(','));
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Business_Report_${dateStr}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    // Default: Return PDF using PDFKit
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Business_Report_${dateStr}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'Business Summary Report', 'Daily Performance & Revenue Overview', `Date: ${dateStr}`);

    drawSummaryCards(doc, [
      { label: 'Day Revenue', value: `Rs ${totalDayRevenue.toFixed(2)}` },
      { label: 'Day Orders', value: orders.length },
      { label: 'New Signups', value: users.length },
      { label: 'Commissions', value: `Rs ${totalDayCommissions.toFixed(2)}` }
    ], doc.y + 4);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('ORDERS LOG FOR THE DAY', 36, doc.y + 10);

    const orderHeaders = ['Order ID', 'Customer', 'Payment Type', 'Status', 'Amount (Rs)'];
    const orderColWidths = [110, 160, 90, 84, 80];
    const orderRows = orders.slice(0, 40).map(o => [
      o._id.toString().substring(0, 14) + '...',
      o.user_id?.name || o.user_id?.email || 'Customer',
      (o.paymentType || 'online').toUpperCase(),
      (o.status || 'pending').toUpperCase(),
      (o.totalAmount || 0).toFixed(2)
    ]);

    drawPDFTable(doc, orderHeaders, orderRows, orderColWidths, doc.y + 6);

    doc.end();

  } catch (error) {
    console.error('Error generating daily report in Reports Center:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate daily report', details: error.message });
    }
  }
});

/* =========================================================================
   2. ORDERS MASTER REPORT (PDF & CSV)
   ========================================================================= */
router.get('/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, status = 'all', format = 'csv' } = req.query;
    const { startDate, endDate, query: dateQuery } = parseDateRange(from, to);

    const filter = {};
    if (dateQuery) filter.createdAt = dateQuery;
    if (status && status !== 'all') filter.status = status;

    const orders = await Order.find(filter)
      .populate('user_id', 'name email phone')
      .sort({ createdAt: -1 });

    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'All Time';
    const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Order ID',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Items Count',
        'Item Titles',
        'Total Amount (Rs)',
        'Delivery Method',
        'Payment Type',
        'Order Status',
        'Courier Tracking ID',
        'Created Date'
      ];

      const rows = orders.map(o => [
        o._id.toString(),
        o.user_id?.name || 'Guest/Unknown',
        o.user_id?.email || 'N/A',
        o.user_id?.phone || 'N/A',
        o.items?.length || 0,
        (o.items || []).map(item => `${item.title || 'Item'} (x${item.quantity || 1})`).join('; '),
        (o.totalAmount || 0).toFixed(2),
        o.deliveryMethod || 'courier',
        o.paymentType || 'online',
        o.status || 'pending',
        o.trackingInfo?.trackingId || '',
        formatDateTime(o.createdAt)
      ]);

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Orders_Report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Orders_Report_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'Orders Master Report', `Status: ${status.toUpperCase()} | Total Orders: ${orders.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Total Orders', value: orders.length },
      { label: 'Total Value', value: `Rs ${totalAmount.toFixed(2)}` },
      { label: 'Completed', value: orders.filter(o => o.status === 'completed').length },
      { label: 'Pending', value: orders.filter(o => o.status === 'pending' || o.status === 'pending_payment_verification').length }
    ], doc.y + 4);

    const headers = ['Order ID', 'Customer Name', 'Items', 'Payment', 'Status', 'Amount (Rs)'];
    const colWidths = [95, 120, 115, 64, 60, 70];
    const rows = orders.map(o => [
      o._id.toString().substring(0, 10) + '...',
      o.user_id?.name || o.user_id?.email || 'N/A',
      (o.items || []).map(i => i.title).join(', ').substring(0, 26),
      (o.paymentType || 'online').toUpperCase(),
      (o.status || 'pending').toUpperCase(),
      (o.totalAmount || 0).toFixed(2)
    ]);

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Orders report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export orders report', details: error.message });
    }
  }
});

/* =========================================================================
   3. INVOICES & DISPATCH REPORT (PDF & CSV)
   ========================================================================= */
router.get('/invoices', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, dispatchStatus = 'all', format = 'csv' } = req.query;
    const { startDate, endDate, query: dateQuery } = parseDateRange(from, to);

    const filter = {};
    if (dateQuery) filter.createdAt = dateQuery;
    if (dispatchStatus && dispatchStatus !== 'all') filter.dispatchStatus = dispatchStatus;

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 });

    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'All Time';
    const totalAmount = invoices.reduce((sum, inv) => {
      const invTotal = (inv.products || []).reduce((pSum, p) => pSum + (p.total || 0), 0) + (inv.forwardingCharges || 0) - (inv.discount || 0);
      return sum + invTotal;
    }, 0);

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Invoice Number',
        'Invoice Date',
        'Customer Name',
        'Phone Number',
        'GST Number',
        'District',
        'State',
        'Products List',
        'Forwarding Charges (Rs)',
        'Discount (Rs)',
        'Calculated Total (Rs)',
        'Transportation',
        'Courier Number',
        'Dispatch Status',
        'Created At'
      ];

      const rows = invoices.map(inv => {
        const invTotal = (inv.products || []).reduce((pSum, p) => pSum + (p.total || 0), 0) + (inv.forwardingCharges || 0) - (inv.discount || 0);
        return [
          inv.invoiceNumber,
          formatDate(inv.invoiceDate),
          inv.customerName,
          inv.phoneNumber || '',
          inv.gstNumber || '',
          inv.district || '',
          inv.state || '',
          (inv.products || []).map(p => `${p.productName} (x${p.bundles || 1})`).join('; '),
          (inv.forwardingCharges || 0).toFixed(2),
          (inv.discount || 0).toFixed(2),
          invTotal.toFixed(2),
          inv.transportationName || '',
          inv.courierNumber || '',
          inv.dispatchStatus || 'pending',
          formatDateTime(inv.createdAt)
        ];
      });

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Invoices_Report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoices_Report_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'Invoices & Dispatch Registry', `Dispatch: ${dispatchStatus.toUpperCase()} | Count: ${invoices.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Total Invoices', value: invoices.length },
      { label: 'Total Invoiced', value: `Rs ${totalAmount.toFixed(2)}` },
      { label: 'Dispatched', value: invoices.filter(i => i.dispatchStatus === 'dispatched').length },
      { label: 'Pending Dispatch', value: invoices.filter(i => i.dispatchStatus === 'pending').length }
    ], doc.y + 4);

    const headers = ['Invoice No.', 'Date', 'Customer', 'Courier No.', 'Dispatch', 'Amount (Rs)'];
    const colWidths = [100, 75, 135, 84, 60, 70];
    const rows = invoices.map(inv => {
      const invTotal = (inv.products || []).reduce((pSum, p) => pSum + (p.total || 0), 0) + (inv.forwardingCharges || 0) - (inv.discount || 0);
      return [
        inv.invoiceNumber,
        formatDate(inv.invoiceDate),
        inv.customerName || 'Customer',
        inv.courierNumber || '-',
        (inv.dispatchStatus || 'pending').toUpperCase(),
        invTotal.toFixed(2)
      ];
    });

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Invoices report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export invoices report', details: error.message });
    }
  }
});

/* =========================================================================
   4. RAZORPAY PAYMENTS REPORT (PDF & CSV)
   ========================================================================= */
router.get('/razorpay', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, status = 'captured', format = 'csv' } = req.query;

    const options = { count: 100 };
    if (from) options.from = Math.floor(new Date(from).getTime() / 1000);
    if (to) options.to = Math.floor(new Date(to + 'T23:59:59').getTime() / 1000);

    let paymentsItems = [];
    try {
      const payments = await razorpay.payments.all(options);
      paymentsItems = payments.items || [];
    } catch (razorpayError) {
      console.warn('⚠️ Razorpay live API call failed in reports center:', razorpayError.message);
      // Fall back to empty list rather than crashing
      paymentsItems = [];
    }

    const filteredPayments = status === 'all'
      ? paymentsItems
      : paymentsItems.filter(p => p.status === status);

    // Enhance payments with local order/user info
    const enhancedPayments = await Promise.all(
      filteredPayments.map(async payment => {
        let order = null;
        if (payment.order_id) {
          order = await Order.findOne({ razorpay_order_id: payment.order_id }).populate('user_id', 'name email phone');
        }
        if (!order && payment.id) {
          order = await Order.findOne({ razorpay_payment_id: payment.id }).populate('user_id', 'name email phone');
        }

        return {
          ...payment,
          user_name: order?.user_id?.name || 'Customer',
          user_email: order?.user_id?.email || payment.email || '',
          user_phone: order?.user_id?.phone || payment.contact || ''
        };
      })
    );

    const totalAmount = enhancedPayments.reduce((sum, p) => sum + (p.amount / 100), 0);
    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'Recent Transactions';

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Payment ID',
        'Order ID',
        'Amount (Rs)',
        'Status',
        'Method',
        'User Name',
        'User Email',
        'User Phone',
        'Razorpay Email',
        'Razorpay Contact',
        'Created At'
      ];

      const rows = enhancedPayments.map(p => [
        p.id,
        p.order_id || '',
        (p.amount / 100).toFixed(2),
        p.status,
        p.method || '',
        p.user_name || '',
        p.user_email || '',
        p.user_phone || '',
        p.email || '',
        p.contact || '',
        formatDateTime(new Date(p.created_at * 1000))
      ]);

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Razorpay_Payments_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Razorpay_Payments_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'Razorpay Payment Gateway Report', `Status: ${status.toUpperCase()} | Count: ${enhancedPayments.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Payments Count', value: enhancedPayments.length },
      { label: 'Total Volume', value: `Rs ${totalAmount.toFixed(2)}` },
      { label: 'Captured', value: enhancedPayments.filter(p => p.status === 'captured').length },
      { label: 'Failed/Refunded', value: enhancedPayments.filter(p => p.status === 'failed' || p.status === 'refunded').length }
    ], doc.y + 4);

    const headers = ['Payment ID', 'Customer', 'Method', 'Status', 'Date', 'Amount (Rs)'];
    const colWidths = [105, 120, 60, 65, 94, 80];
    const rows = enhancedPayments.map(p => [
      p.id,
      p.user_name || p.email || 'Customer',
      (p.method || 'card').toUpperCase(),
      (p.status || 'captured').toUpperCase(),
      formatDate(new Date(p.created_at * 1000)),
      (p.amount / 100).toFixed(2)
    ]);

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Razorpay report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export Razorpay report', details: error.message });
    }
  }
});

/* =========================================================================
   5. COMMISSION & MLM REWARDS REPORT (PDF & CSV)
   ========================================================================= */
router.get('/commissions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, format = 'csv' } = req.query;
    const { startDate, endDate, query: dateQuery } = parseDateRange(from, to);

    const filter = {};
    if (dateQuery) filter.createdAt = dateQuery;

    const commissions = await CommissionTransaction.find(filter)
      .populate('purchaser', 'name email phone')
      .populate('directReferrer', 'name email phone')
      .sort({ createdAt: -1 });

    const totalDistributed = commissions.reduce((sum, c) => {
      const direct = c.directCommissionAmount || 0;
      const tree = (c.treeCommissions || []).reduce((ts, tc) => ts + (tc.amount || 0), 0);
      return sum + direct + tree;
    }, 0);

    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'All Time';

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Transaction ID',
        'Order ID',
        'Order Amount (Rs)',
        'Purchaser Name',
        'Purchaser Email',
        'Direct Referrer',
        'Direct Commission (Rs)',
        'Tree Levels Count',
        'Tree Commissions Total (Rs)',
        'Total Commission (Rs)',
        'Date'
      ];

      const rows = commissions.map(c => {
        const direct = c.directCommissionAmount || 0;
        const tree = (c.treeCommissions || []).reduce((ts, tc) => ts + (tc.amount || 0), 0);
        return [
          c._id.toString(),
          c.orderId ? c.orderId.toString() : '',
          (c.orderAmount || 0).toFixed(2),
          c.purchaser?.name || 'Customer',
          c.purchaser?.email || '',
          c.directReferrer?.name || 'None',
          direct.toFixed(2),
          c.treeCommissions?.length || 0,
          tree.toFixed(2),
          (direct + tree).toFixed(2),
          formatDateTime(c.createdAt)
        ];
      });

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Commission_Report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Commission_Report_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'Referral Commission Payouts Report', `Total Distributions: ${commissions.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Distributions', value: commissions.length },
      { label: 'Total Distributed', value: `Rs ${totalDistributed.toFixed(2)}` },
      { label: 'Avg Payout/Txn', value: `Rs ${(commissions.length ? totalDistributed / commissions.length : 0).toFixed(2)}` }
    ], doc.y + 4);

    const headers = ['Txn ID', 'Purchaser', 'Referrer', 'Direct (Rs)', 'Tree (Rs)', 'Total (Rs)'];
    const colWidths = [100, 120, 114, 60, 60, 70];
    const rows = commissions.map(c => {
      const direct = c.directCommissionAmount || 0;
      const tree = (c.treeCommissions || []).reduce((ts, tc) => ts + (tc.amount || 0), 0);
      return [
        c._id.toString().substring(0, 12) + '...',
        c.purchaser?.name || 'Customer',
        c.directReferrer?.name || 'None',
        direct.toFixed(2),
        tree.toFixed(2),
        (direct + tree).toFixed(2)
      ];
    });

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Commission report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export commission report', details: error.message });
    }
  }
});

/* =========================================================================
   6. USER WITHDRAWALS REPORT (PDF & CSV)
   ========================================================================= */
router.get('/withdrawals', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, status = 'all', format = 'csv' } = req.query;
    const { startDate, endDate } = parseDateRange(from, to);

    const users = await User.find({
      'withdrawals.0': { $exists: true }
    }).select('name email phone withdrawals');

    let allWithdrawals = [];
    users.forEach(user => {
      user.withdrawals.forEach(w => {
        const wDate = new Date(w.date || w.requestedAt || w.createdAt || Date.now());
        
        let matchDate = true;
        if (startDate && wDate < startDate) matchDate = false;
        if (endDate && wDate > endDate) matchDate = false;

        let matchStatus = true;
        if (status && status !== 'all' && w.status !== status) matchStatus = false;

        if (matchDate && matchStatus) {
          allWithdrawals.push({
            withdrawId: w._id ? w._id.toString() : '',
            userName: user.name || 'User',
            userEmail: user.email || '',
            userPhone: user.phone || '',
            amount: w.amount || 0,
            status: w.status || 'pending',
            upi: w.upi || '',
            bankName: w.bankName || w.bank || '',
            accountNumber: w.accountNumber || '',
            ifsc: w.ifsc || '',
            requestedDate: wDate,
            transferId: w.transferId || '',
            transferDate: w.transferDate || null
          });
        }
      });
    });

    allWithdrawals.sort((a, b) => b.requestedDate - a.requestedDate);

    const totalAmount = allWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'All Time';

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Withdrawal ID',
        'User Name',
        'User Email',
        'User Phone',
        'Amount (Rs)',
        'Status',
        'UPI ID',
        'Bank Name',
        'Account Number',
        'IFSC Code',
        'Requested Date',
        'Transfer ID',
        'Transfer Date'
      ];

      const rows = allWithdrawals.map(w => [
        w.withdrawId,
        w.userName,
        w.userEmail,
        w.userPhone,
        w.amount.toFixed(2),
        w.status,
        w.upi,
        w.bankName,
        w.accountNumber,
        w.ifsc,
        formatDateTime(w.requestedDate),
        w.transferId,
        w.transferDate ? formatDateTime(w.transferDate) : ''
      ]);

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Withdrawals_Report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Withdrawals_Report_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'User Withdrawals & Payouts Report', `Status: ${status.toUpperCase()} | Requests: ${allWithdrawals.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Total Requests', value: allWithdrawals.length },
      { label: 'Total Amount', value: `Rs ${totalAmount.toFixed(2)}` },
      { label: 'Approved', value: allWithdrawals.filter(w => w.status === 'approved').length },
      { label: 'Pending', value: allWithdrawals.filter(w => w.status === 'pending').length }
    ], doc.y + 4);

    const headers = ['Request ID', 'User Name', 'Payment Mode', 'Status', 'Date', 'Amount (Rs)'];
    const colWidths = [100, 130, 100, 60, 64, 70];
    const rows = allWithdrawals.map(w => [
      w.withdrawId.substring(0, 12) + '...',
      w.userName,
      w.upi ? `UPI: ${w.upi}` : (w.bankName ? `Bank: ${w.bankName}` : 'Bank Transfer'),
      w.status.toUpperCase(),
      formatDate(w.requestedDate),
      w.amount.toFixed(2)
    ]);

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Withdrawals report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export withdrawals report', details: error.message });
    }
  }
});

/* =========================================================================
   7. USER DIRECTORY & BALANCES REPORT (PDF & CSV)
   ========================================================================= */
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to, format = 'csv' } = req.query;
    const { startDate, endDate, query: dateQuery } = parseDateRange(from, to);

    const filter = { isVirtual: { $ne: true } };
    if (dateQuery) filter.createdAt = dateQuery;

    const users = await User.find(filter)
      .populate('referredBy', 'name email')
      .sort({ createdAt: -1 });

    const totalWallet = users.reduce((sum, u) => sum + (u.wallet || 0), 0);
    const totalPoints = users.reduce((sum, u) => sum + (u.pointsWallet || 0), 0);
    const dateRangeStr = (from || to) ? `${from || 'Start'} to ${to || 'Present'}` : 'All Users';

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'User ID',
        'Name',
        'Email',
        'Phone',
        'Role',
        'Referral Code',
        'Referred By Name',
        'Referred By Email',
        'Wallet Balance (Rs)',
        'Points Balance',
        'First Purchase Done',
        'Registered Date'
      ];

      const rows = users.map(u => [
        u._id.toString(),
        u.name || '',
        u.email || '',
        u.phone || '',
        u.role || 'user',
        u.referralCode || '',
        u.referredBy?.name || 'Direct',
        u.referredBy?.email || '',
        (u.wallet || 0).toFixed(2),
        u.pointsWallet || 0,
        u.firstPurchaseDone ? 'Yes' : 'No',
        formatDateTime(u.createdAt)
      ]);

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(r => r.map(escapeCSV).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Users_Report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // PDF Format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Users_Report_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    drawPDFHeader(doc, 'User Directory & Wallet Balances', `Total Registered Members: ${users.length}`, dateRangeStr);

    drawSummaryCards(doc, [
      { label: 'Total Members', value: users.length },
      { label: 'Total Wallet Held', value: `Rs ${totalWallet.toFixed(2)}` },
      { label: 'Total Points', value: totalPoints },
      { label: 'Active Buyers', value: users.filter(u => u.firstPurchaseDone).length }
    ], doc.y + 4);

    const headers = ['User ID', 'Name / Email', 'Referred By', 'Registered', 'Points', 'Wallet (Rs)'];
    const colWidths = [95, 160, 105, 64, 40, 60];
    const rows = users.slice(0, 50).map(u => [
      u._id.toString().substring(0, 10) + '...',
      `${u.name || 'User'}\n${u.email || ''}`.substring(0, 30),
      u.referredBy?.name || 'Direct',
      formatDate(u.createdAt),
      String(u.pointsWallet || 0),
      (u.wallet || 0).toFixed(2)
    ]);

    drawPDFTable(doc, headers, rows, colWidths, doc.y + 6);
    doc.end();

  } catch (error) {
    console.error('Error in Users report export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export users report', details: error.message });
    }
  }
});

module.exports = router;
