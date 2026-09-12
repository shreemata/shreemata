const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Bundle = require('../models/Bundle');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const VipMasterCard = require('../models/VipMasterCard');

// Helper to get start and end of day in local time
function getDateBoundaries(period = 'today') {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let startDate = startOfToday;
  let endDate = endOfToday;

  if (period === '7days') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
  } else if (period === '30days') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
  } else if (period === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  return { startOfToday, endOfToday, startDate, endDate, startOfMonth, now };
}

/* --------------------------------------------------------------------------
   GET /api/admin/dashboard/operations
   Admin Operations Control Center Aggregated Metrics (Read-only, Zero Side-Effects)
-------------------------------------------------------------------------- */
router.get('/operations', authenticateToken, isAdmin, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const { startOfToday, endOfToday, startDate, endDate, startOfMonth, now } = getDateBoundaries(period);

    // Run parallel read-only queries for peak performance
    const [
      ordersTodayAgg,
      revenueTodayAgg,
      paidOrdersTodayCount,
      pendingPaymentsList,
      ordersToProcessCount,
      readyToDispatchCount,
      readyForPickupCount,
      deliveredTodayCount,
      cancelledTodayCount,
      recentOrdersList,
      orderStatusCountsAgg,
      deliveryStatusCountsAgg,
      deliveryMethodCountsAgg,
      salesMonthAgg,
      salesTotalAgg,
      financialCommissionsAgg,
      walletDebitsAgg,
      walletRefundsAgg,
      usersWithPendingWithdrawals,
      lowStockBooksList,
      totalBooksCount,
      totalCatalogStockAgg,
      totalCustomersCount,
      newCustomersTodayCount,
      totalMembersCount,
      newMembersTodayCount,
      totalReferredUsersCount,
      vipCardsAgg,
      sevenDaysSalesAgg,
      pendingTrackingOrders
    ] = await Promise.all([
      // 1. Orders Today Count
      Order.countDocuments({ createdAt: { $gte: startOfToday, $lte: endOfToday } }),

      // 2. Revenue Today (completed / paid orders)
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),

      // 3. Paid Orders Today
      Order.countDocuments({ createdAt: { $gte: startOfToday, $lte: endOfToday }, status: 'completed' }),

      // 4. Pending Payments (orders awaiting verification)
      Order.find({
        $or: [
          { status: 'pending_payment_verification' },
          { 'paymentDetails.status': 'pending_verification' },
          { paymentType: { $in: ['check', 'cheque', 'transfer'] }, status: 'pending' }
        ]
      })
      .populate('user_id', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

      // 5. Orders To Process (completed orders with deliveryStatus in pending/processing)
      Order.countDocuments({
        status: 'completed',
        deliveryStatus: { $in: ['pending', 'processing'] }
      }),

      // 6. Ready To Dispatch (completed, processing, not store pickup)
      Order.countDocuments({
        status: 'completed',
        deliveryStatus: 'processing',
        deliveryMethod: { $ne: 'pickup' }
      }),

      // 7. Ready For Pickup (deliveryMethod === 'pickup' and not yet delivered)
      Order.countDocuments({
        status: 'completed',
        deliveryMethod: 'pickup',
        deliveryStatus: { $in: ['pending', 'processing'] }
      }),

      // 8. Delivered Today
      Order.countDocuments({
        deliveryStatus: 'delivered',
        updatedAt: { $gte: startOfToday, $lte: endOfToday }
      }),

      // 9. Cancelled Today
      Order.countDocuments({
        status: 'cancelled',
        updatedAt: { $gte: startOfToday, $lte: endOfToday }
      }),

      // 10. Recent Orders (latest 10)
      Order.find({})
        .populate('user_id', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // 11. Order Status breakdown
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // 12. Delivery Status breakdown
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } }
      ]),

      // 13. Delivery Method breakdown
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$deliveryMethod', count: { $sum: 1 } } }
      ]),

      // 14. Sales This Month
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),

      // 15. Total Sales All-Time
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),

      // 16. Persisted Commission Totals from CommissionTransaction
      CommissionTransaction.aggregate([
        {
          $group: {
            _id: null,
            totalDirect: { $sum: '$directCommissionAmount' },
            totalReferral: { $sum: '$referralCommissionAmount' },
            treeArrays: { $push: '$treeCommissions' }
          }
        }
      ]),

      // 17. Wallet Debits & Withdrawals from WalletTransaction
      WalletTransaction.aggregate([
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 18. Wallet Refunds from WalletTransaction
      WalletTransaction.aggregate([
        { $match: { category: 'refund' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),

      // 19. Pending Withdrawal requests from User.withdrawals
      User.find({
        'withdrawals.status': 'pending'
      }).select('name email phone withdrawals').lean(),

      // 20. Low Stock and Out of Stock Books
      Book.find({
        $or: [
          { stockStatus: 'out_of_stock' },
          { stockQuantity: { $lte: 5 } },
          { isOutOfStock: true }
        ]
      }).select('title author price stockQuantity stockStatus lowStockThreshold class subject cover_image').limit(15).lean(),

      // 21. Total Books Count
      Book.countDocuments({}),

      // 22. Total Units Stock Quantity
      Book.aggregate([
        { $group: { _id: null, totalStock: { $sum: '$stockQuantity' } } }
      ]),

      // 23. Total Customers (non-admin)
      User.countDocuments({ role: { $ne: 'admin' } }),

      // 24. New Customers Today
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: startOfToday, $lte: endOfToday } }),

      // 25. Total Members
      User.countDocuments({ isMember: true }),

      // 26. New Members Today
      User.countDocuments({ isMember: true, memberSince: { $gte: startOfToday, $lte: endOfToday } }),

      // 27. Total Referred Users
      User.countDocuments({ referredBy: { $ne: null } }),

      // 28. VIP Master Card stats
      VipMasterCard.aggregate([
        {
          $group: {
            _id: null,
            totalCards: { $sum: 1 },
            maxTier: { $max: '$tier' },
            totalWithdrawn: { $sum: '$totalWithdrawn' }
          }
        }
      ]),

      // 29. 7-Day Sales Trend (Last 7 Days)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0) },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),

      // 30. Completed orders with missing courier tracking info
      Order.find({
        status: 'completed',
        deliveryStatus: { $in: ['processing', 'shipped'] },
        deliveryMethod: { $ne: 'pickup' },
        $or: [
          { 'trackingInfo.trackingId': { $exists: false } },
          { 'trackingInfo.trackingId': '' },
          { 'trackingInfo.trackingId': null }
        ]
      })
      .populate('user_id', 'name phone')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean()
    ]);

    // Extract Tree Commission sum from aggregated arrays
    let totalTreeCommissions = 0;
    if (financialCommissionsAgg.length > 0 && Array.isArray(financialCommissionsAgg[0].treeArrays)) {
      for (const treeList of financialCommissionsAgg[0].treeArrays) {
        if (Array.isArray(treeList)) {
          for (const tc of treeList) {
            totalTreeCommissions += Number(tc.amount || 0);
          }
        }
      }
    }

    // Extract pending withdrawals details
    let pendingWithdrawalsTotalCount = 0;
    let pendingWithdrawalsTotalAmount = 0;
    let pendingVipWithdrawalsCount = 0;
    let pendingVipWithdrawalsAmount = 0;
    const pendingWithdrawalItems = [];

    for (const u of usersWithPendingWithdrawals) {
      if (Array.isArray(u.withdrawals)) {
        for (const w of u.withdrawals) {
          if (w.status === 'pending') {
            pendingWithdrawalsTotalCount++;
            pendingWithdrawalsTotalAmount += Number(w.amount || 0);
            if (w.source === 'vip_master_card') {
              pendingVipWithdrawalsCount++;
              pendingVipWithdrawalsAmount += Number(w.amount || 0);
            }
            if (pendingWithdrawalItems.length < 10) {
              pendingWithdrawalItems.push({
                _id: w._id,
                userId: u._id,
                userName: u.name || 'User',
                userPhone: u.phone || '-',
                amount: Number(w.amount || 0),
                source: w.source || 'wallet',
                requestedAt: w.requestedAt,
                upi: w.upi || w.paymentDetails?.upiId || null,
                bankName: w.bankName || w.paymentDetails?.bankName || null
              });
            }
          }
        }
      }
    }

    // Process 7-day trend into continuous day array
    const last7DaysData = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const dayName = dayNames[d.getDay()];

      const match = sevenDaysSalesAgg.find(
        item => item._id.year === year && item._id.month === month && item._id.day === day
      );

      last7DaysData.push({
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        label: `${dayName} ${day}`,
        revenue: match ? Number(match.revenue || 0) : 0,
        ordersCount: match ? Number(match.count || 0) : 0
      });
    }

    // Build Action Required List
    const actionRequiredList = [];

    // A. Pending payment approvals
    for (const po of pendingPaymentsList) {
      actionRequiredList.push({
        type: 'pending_payment',
        priority: 'high',
        title: `Payment Verification: #${po._id.toString().slice(-8).toUpperCase()}`,
        description: `${po.user_id?.name || 'Customer'} • ₹${Number(po.totalAmount || 0).toFixed(2)} (${(po.paymentType || 'Cheque').toUpperCase()})`,
        link: `/admin-check-payments.html`,
        linkText: 'Review Payment',
        timestamp: po.createdAt
      });
    }

    // B. Pending withdrawals
    for (const pw of pendingWithdrawalItems.slice(0, 5)) {
      actionRequiredList.push({
        type: 'pending_withdrawal',
        priority: 'high',
        title: `Withdrawal Request: ₹${pw.amount.toFixed(2)}`,
        description: `${pw.userName} • ${pw.source === 'vip_master_card' ? 'VIP Master Card' : 'Commission Wallet'}`,
        link: `/admin-withdrawals.html`,
        linkText: 'Process Payout',
        timestamp: pw.requestedAt
      });
    }

    // C. Orders missing tracking
    for (const mo of pendingTrackingOrders) {
      actionRequiredList.push({
        type: 'missing_tracking',
        priority: 'medium',
        title: `Missing Courier Info: #${mo._id.toString().slice(-8).toUpperCase()}`,
        description: `${mo.user_id?.name || 'Customer'} • Paid • Ready for Dispatch`,
        link: `/admin-orders.html`,
        linkText: 'Add Tracking',
        timestamp: mo.createdAt
      });
    }

    // D. Low / Out of stock items
    for (const b of lowStockBooksList.slice(0, 4)) {
      actionRequiredList.push({
        type: 'low_stock',
        priority: b.stockQuantity === 0 || b.stockStatus === 'out_of_stock' ? 'high' : 'medium',
        title: `${b.stockQuantity === 0 ? 'Out of Stock' : 'Low Stock'}: ${b.title}`,
        description: `Units Remaining: ${b.stockQuantity || 0} (Threshold: ${b.lowStockThreshold || 5})`,
        link: `/admin.html`,
        linkText: 'Manage Stock',
        timestamp: b.updatedAt || now
      });
    }

    // Wallet debits breakdown
    let totalBuyerCashbackPaid = 0;
    let totalWithdrawalsPaid = 0;
    let totalRefundsPaid = 0;

    for (const item of walletDebitsAgg) {
      if (item._id === 'cashback') totalBuyerCashbackPaid += Number(item.totalAmount || 0);
      else if (item._id === 'withdrawal' || item._id === 'vip_master_card_withdrawal') {
        totalWithdrawalsPaid += Number(item.totalAmount || 0);
      }
    }
    if (walletRefundsAgg.length > 0) {
      totalRefundsPaid = Number(walletRefundsAgg[0].totalAmount || 0);
    }

    // If CommissionTransaction has direct commission (which also serves buyer cashback in self referrals)
    const directReferralTotal = financialCommissionsAgg.length > 0 ? Number(financialCommissionsAgg[0].totalDirect || 0) : 0;
    const referralCommissionTotal = financialCommissionsAgg.length > 0 ? Number(financialCommissionsAgg[0].totalReferral || 0) : 0;

    // Structure complete operational response
    const dashboardData = {
      timestamp: now.toISOString(),
      period: period,
      kpis: {
        ordersToday: ordersTodayAgg,
        revenueToday: revenueTodayAgg.length > 0 ? Number(revenueTodayAgg[0].total || 0) : 0,
        paidOrdersToday: paidOrdersTodayCount,
        pendingPaymentsCount: pendingPaymentsList.length,
        ordersToProcess: ordersToProcessCount,
        readyToDispatch: readyToDispatchCount,
        readyForPickup: readyForPickupCount,
        deliveredToday: deliveredTodayCount,
        cancelledToday: cancelledTodayCount,
        newMembersToday: newMembersTodayCount,
        pendingWithdrawalsCount: pendingWithdrawalsTotalCount,
        pendingWithdrawalsAmount: pendingWithdrawalsTotalAmount,
        lowStockCount: lowStockBooksList.filter(b => (b.stockQuantity || 0) > 0).length,
        outOfStockCount: lowStockBooksList.filter(b => (b.stockQuantity || 0) === 0 || b.stockStatus === 'out_of_stock').length
      },
      actionRequired: actionRequiredList,
      orderOperations: {
        totalOrdersCount: ordersTodayAgg,
        toProcessCount: ordersToProcessCount,
        readyToDispatchCount: readyToDispatchCount,
        readyForPickupCount: readyForPickupCount,
        statusBreakdown: orderStatusCountsAgg.reduce((acc, curr) => ({ ...acc, [curr._id || 'unknown']: curr.count }), {}),
        deliveryStatusBreakdown: deliveryStatusCountsAgg.reduce((acc, curr) => ({ ...acc, [curr._id || 'unknown']: curr.count }), {}),
        deliveryMethodBreakdown: deliveryMethodCountsAgg.reduce((acc, curr) => ({ ...acc, [curr._id || 'unknown']: curr.count }), {})
      },
      recentOrders: recentOrdersList.map(o => ({
        _id: o._id,
        invoiceNumber: o.invoiceNumber || ('SM-' + o._id.toString().slice(-8).toUpperCase()),
        customerName: o.user_id?.name || o.deliveryAddress?.fullName || 'Guest Customer',
        customerPhone: o.user_id?.phone || o.deliveryAddress?.phone || '-',
        deliveryMethod: o.deliveryMethod || 'home',
        totalAmount: Number(o.totalAmount || 0),
        status: o.status || 'pending',
        deliveryStatus: o.deliveryStatus || 'pending',
        paymentType: o.paymentType || 'online',
        paymentStatus: o.paymentDetails?.status || (o.status === 'completed' ? 'paid' : o.status),
        createdAt: o.createdAt
      })),
      financialOverview: {
        salesToday: revenueTodayAgg.length > 0 ? Number(revenueTodayAgg[0].total || 0) : 0,
        salesThisMonth: salesMonthAgg.length > 0 ? Number(salesMonthAgg[0].total || 0) : 0,
        salesAllTime: salesTotalAgg.length > 0 ? Number(salesTotalAgg[0].total || 0) : 0,
        buyerCashbackPaid: totalBuyerCashbackPaid,
        directReferralPaid: directReferralTotal,
        treeCommissionPaid: totalTreeCommissions,
        referralCommissionPaid: referralCommissionTotal,
        withdrawalsCompleted: totalWithdrawalsPaid,
        pendingWithdrawals: pendingWithdrawalsTotalAmount,
        refundsReversals: totalRefundsPaid
      },
      inventoryAlerts: {
        totalTitles: totalBooksCount,
        totalStockUnits: totalCatalogStockAgg.length > 0 ? Number(totalCatalogStockAgg[0].totalStock || 0) : 0,
        outOfStockCount: lowStockBooksList.filter(b => (b.stockQuantity || 0) === 0 || b.stockStatus === 'out_of_stock').length,
        lowStockCount: lowStockBooksList.filter(b => (b.stockQuantity || 0) > 0).length,
        items: lowStockBooksList.map(b => ({
          _id: b._id,
          title: b.title,
          author: b.author,
          price: b.price,
          stock: b.stockQuantity || 0,
          status: b.stockQuantity === 0 || b.stockStatus === 'out_of_stock' ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          threshold: b.lowStockThreshold || 5,
          class: b.class,
          subject: b.subject,
          coverImage: b.cover_image
        }))
      },
      customersAndMembership: {
        totalCustomers: totalCustomersCount,
        newCustomersToday: newCustomersTodayCount,
        totalMembers: totalMembersCount,
        newMembersToday: newMembersTodayCount,
        nonMembersCount: Math.max(0, totalCustomersCount - totalMembersCount),
        referralUsersCount: totalReferredUsersCount
      },
      referralNetwork: {
        totalReferred: totalReferredUsersCount,
        treeMembersCount: totalMembersCount,
        treeCommissionsPaid: totalTreeCommissions
      },
      vipMasterCards: {
        totalCards: vipCardsAgg.length > 0 ? Number(vipCardsAgg[0].totalCards || 0) : 0,
        highestTier: vipCardsAgg.length > 0 ? Number(vipCardsAgg[0].maxTier || 1) : 1,
        totalWithdrawn: vipCardsAgg.length > 0 ? Number(vipCardsAgg[0].totalWithdrawn || 0) : 0,
        pendingWithdrawalsCount: pendingVipWithdrawalsCount,
        pendingWithdrawalsAmount: pendingVipWithdrawalsAmount
      },
      paymentsMonitoring: {
        successfulCount: paidOrdersTodayCount,
        pendingVerificationCount: pendingPaymentsList.length,
        failedCount: orderStatusCountsAgg.find(s => s._id === 'failed')?.count || 0
      },
      sevenDaysSales: last7DaysData,
      databaseBackup: await getBackupHealthData()
    };

    return res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (err) {
    console.error('❌ Error fetching admin dashboard operations data:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load operations dashboard metrics'
    });
  }
});

// Helper: Get Read-Only Database Backup Health
async function getBackupHealthData() {
  const fs = require('fs');
  const path = require('path');
  const BackupRecord = require('../models/BackupRecord');

  let latestSuccess = null;
  let latestTested = null;

  try {
    latestSuccess = await BackupRecord.findOne({ status: { $in: ['SUCCESS', 'WARNING'] } }).sort({ completedAt: -1 }).lean();
    latestTested = await BackupRecord.findOne({ restoreTested: true }).sort({ restoreTestedAt: -1 }).lean();
  } catch (e) {
    // Database query fallback
  }

  // Filesystem fallback if DB record is not yet synced
  if (!latestSuccess) {
    try {
      const jsonlPath = path.join(__dirname, '../backups/logs/backup-history.jsonl');
      if (fs.existsSync(jsonlPath)) {
        const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            if (entry.status === 'SUCCESS' || entry.status === 'WARNING') {
              latestSuccess = entry;
              break;
            }
          } catch (err) {}
        }
      }
    } catch (fsErr) {}
  }

  if (!latestSuccess) {
    return {
      status: 'NOT_CONFIGURED',
      statusLabel: 'Backup Monitoring Not Configured',
      lastBackupDate: null,
      lastBackupFormatted: 'No Backups Recorded',
      ageHours: null,
      sizeBytes: 0,
      sizeFormatted: '0 MB',
      offServerStatus: 'Not Configured',
      lastRestoreTestDate: null,
      lastRestoreTestFormatted: 'Not Tested',
      alertLevel: 'NOT_CONFIGURED'
    };
  }

  const completedAt = new Date(latestSuccess.completedAt || latestSuccess.startedAt);
  const now = new Date();
  const ageHours = Math.max(0, Math.floor((now - completedAt) / (1000 * 60 * 60)));

  let alertLevel = 'HEALTHY';
  let statusLabel = 'HEALTHY';

  if (ageHours > 48 || latestSuccess.status === 'FAILED') {
    alertLevel = 'CRITICAL';
    statusLabel = 'CRITICAL';
  } else if (ageHours > 26 || latestSuccess.status === 'WARNING') {
    alertLevel = 'WARNING';
    statusLabel = 'WARNING';
  }

  let offServerLabel = 'Healthy';
  if (latestSuccess.remoteStatus === 'NOT_CONFIGURED') {
    offServerLabel = 'Not Configured';
  } else if (latestSuccess.remoteStatus === 'FAILED') {
    offServerLabel = 'Failed';
  }

  const sizeMb = (Number(latestSuccess.sizeBytes || 0) / (1024 * 1024)).toFixed(1);

  return {
    status: alertLevel,
    statusLabel,
    lastBackupDate: completedAt,
    lastBackupFormatted: completedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' • ' + completedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    ageHours,
    sizeBytes: latestSuccess.sizeBytes || 0,
    sizeFormatted: `${sizeMb} MB`,
    offServerStatus: offServerLabel,
    lastRestoreTestDate: latestTested ? (latestTested.restoreTestedAt || latestTested.updatedAt) : null,
    lastRestoreTestFormatted: latestTested ? new Date(latestTested.restoreTestedAt || latestTested.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not Tested',
    alertLevel
  };
}

module.exports = router;
