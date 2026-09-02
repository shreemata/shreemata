const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const Order = require('../models/Order');
const User = require('../models/User');
const CommissionTransaction = require('../models/CommissionTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const VipCard = require('../models/VipCard');

// Helper to parse date filters from query params
function parseDateRange(req) {
  const from = req.query.startDate || req.query.from;
  const to = req.query.endDate || req.query.to;

  let start = null;
  let end = null;

  if (from) {
    start = new Date(from);
    start.setHours(0, 0, 0, 0);
  }
  if (to) {
    end = new Date(to);
    end.setHours(23, 59, 59, 999);
  }

  const query = {};
  if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
    query.$gte = start;
    query.$lte = end;
  } else if (start && !isNaN(start.getTime())) {
    query.$gte = start;
  } else if (end && !isNaN(end.getTime())) {
    query.$lte = end;
  }

  return Object.keys(query).length > 0 ? query : null;
}

// Format date & time helper
function formatDateTime(d) {
  if (!d) return '-';
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

// =========================================================================
// 1. ORDERS REPORT
// GET /api/admin/reports/orders
// =========================================================================
router.get('/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const dateQuery = parseDateRange(req);
    const filter = {};

    if (dateQuery) {
      filter.createdAt = dateQuery;
    }

    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    const orders = await Order.find(filter)
      .populate('user_id', 'name email phone referralCode')
      .sort({ createdAt: -1 })
      .lean();

    const data = orders.map((order, idx) => {
      const buyer = order.user_id || {};
      const addr = order.deliveryAddress || {};
      const buyerName = buyer.name || addr.fullName || addr.name || 'Unknown Customer';
      const buyerPhone = addr.phone || buyer.phone || '-';
      const buyerEmail = buyer.email || '-';

      const itemsSummary = (order.items || []).map(i => {
        const qty = i.quantity || 1;
        return `${i.title || 'Book'} (x${qty})`;
      }).join('; ');

      const totalItemsCount = (order.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
      const invoiceNo = order.invoiceNumber || ('SM-' + String(order._id).slice(-8).toUpperCase());

      return {
        "Sl No": idx + 1,
        "Order Date": formatDateTime(order.createdAt),
        "Order ID": String(order._id),
        "Invoice No": invoiceNo,
        "Buyer Name": buyerName,
        "Buyer Phone": buyerPhone,
        "Buyer Email": buyerEmail,
        "Items Count": totalItemsCount,
        "Items Description": itemsSummary || '-',
        "Order Total (₹)": Number((order.totalAmount || 0).toFixed(2)),
        "Courier Charge (₹)": Number((order.courierCharge || 0).toFixed(2)),
        "Payment Mode": order.paymentType || 'online',
        "Payment Status": (order.status || 'pending').toUpperCase(),
        "Delivery Status": (order.deliveryStatus || 'pending').toUpperCase(),
        "Tracking No": order.trackingInfo?.trackingId || order.trackingNumber || '-'
      };
    });

    res.json({
      success: true,
      reportName: "Sales & Orders Report",
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error generating orders report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// 2. COMMISSIONS REPORT
// GET /api/admin/reports/commissions
// =========================================================================
router.get('/commissions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const dateQuery = parseDateRange(req);
    const filter = {};

    if (dateQuery) {
      filter.createdAt = dateQuery;
    }

    const txns = await CommissionTransaction.find(filter)
      .populate('orderId', 'totalAmount invoiceNumber createdAt')
      .populate('purchaser', 'name email phone referralCode')
      .populate('directReferrer', 'name email phone referralCode')
      .populate('referralReferrer', 'name email phone referralCode')
      .populate('adminRecipient', 'name email')
      .populate('treeCommissions.recipient', 'name email phone referralCode treeLevel')
      .sort({ createdAt: -1 })
      .lean();

    const flatRows = [];
    let slNo = 1;

    for (const txn of txns) {
      const orderDate = txn.createdAt || txn.orderId?.createdAt;
      const orderIdStr = txn.orderId?._id ? String(txn.orderId._id) : (txn.orderId ? String(txn.orderId) : '-');
      const invoiceNo = txn.orderId?.invoiceNumber || (orderIdStr !== '-' ? 'SM-' + orderIdStr.slice(-8).toUpperCase() : '-');
      const purchaserName = txn.purchaser?.name || 'Customer';
      const purchaserPhone = txn.purchaser?.phone || '-';
      const orderAmt = Number((txn.orderAmount || txn.orderId?.totalAmount || 0).toFixed(2));

      // Direct Commission (Cashback / Direct Referrer)
      if (txn.directCommissionAmount > 0) {
        flatRows.push({
          "Sl No": slNo++,
          "Date": formatDateTime(orderDate),
          "Order ID": orderIdStr,
          "Invoice No": invoiceNo,
          "Purchaser": `${purchaserName} (${purchaserPhone})`,
          "Recipient Name": txn.directReferrer?.name || purchaserName,
          "Recipient Phone": txn.directReferrer?.phone || purchaserPhone,
          "Commission Category": "Direct Commission (3%)",
          "Commission Amount (₹)": Number(txn.directCommissionAmount.toFixed(2)),
          "Order Amount (₹)": orderAmt,
          "Status": (txn.status || 'completed').toUpperCase()
        });
      }

      // Referral Commission (Upline Referrer)
      if (txn.referralCommissionAmount > 0) {
        flatRows.push({
          "Sl No": slNo++,
          "Date": formatDateTime(orderDate),
          "Order ID": orderIdStr,
          "Invoice No": invoiceNo,
          "Purchaser": `${purchaserName} (${purchaserPhone})`,
          "Recipient Name": txn.referralReferrer?.name || 'Upline Referrer',
          "Recipient Phone": txn.referralReferrer?.phone || '-',
          "Commission Category": "Referral Commission (2%)",
          "Commission Amount (₹)": Number(txn.referralCommissionAmount.toFixed(2)),
          "Order Amount (₹)": orderAmt,
          "Status": (txn.status || 'completed').toUpperCase()
        });
      }

      // Tree Commissions (Levels 1 to N)
      if (Array.isArray(txn.treeCommissions)) {
        for (const tc of txn.treeCommissions) {
          if (tc.amount > 0) {
            flatRows.push({
              "Sl No": slNo++,
              "Date": formatDateTime(orderDate),
              "Order ID": orderIdStr,
              "Invoice No": invoiceNo,
              "Purchaser": `${purchaserName} (${purchaserPhone})`,
              "Recipient Name": tc.recipient?.name || `Tree Parent (Level ${tc.level})`,
              "Recipient Phone": tc.recipient?.phone || '-',
              "Commission Category": `Tree Commission Level ${tc.level} (${tc.percentage}%)`,
              "Commission Amount (₹)": Number(tc.amount.toFixed(2)),
              "Order Amount (₹)": orderAmt,
              "Status": (txn.status || 'completed').toUpperCase()
            });
          }
        }
      }

      // Admin Commission
      if (txn.adminCommissionAmount > 0) {
        flatRows.push({
          "Sl No": slNo++,
          "Date": formatDateTime(orderDate),
          "Order ID": orderIdStr,
          "Invoice No": invoiceNo,
          "Purchaser": `${purchaserName} (${purchaserPhone})`,
          "Recipient Name": txn.adminRecipient?.name || 'Admin',
          "Recipient Phone": '-',
          "Commission Category": "Admin Pool Share",
          "Commission Amount (₹)": Number(txn.adminCommissionAmount.toFixed(2)),
          "Order Amount (₹)": orderAmt,
          "Status": (txn.status || 'completed').toUpperCase()
        });
      }
    }

    res.json({
      success: true,
      reportName: "Commission Payouts & Distribution Report",
      count: flatRows.length,
      data: flatRows
    });
  } catch (error) {
    console.error('Error generating commissions report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// 3. WALLETS REPORT
// GET /api/admin/reports/wallets
// =========================================================================
router.get('/wallets', authenticateToken, isAdmin, async (req, res) => {
  try {
    const dateQuery = parseDateRange(req);
    const filter = {};

    if (dateQuery) {
      filter.createdAt = dateQuery;
    }

    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }

    if (req.query.category && req.query.category !== 'all') {
      filter.category = req.query.category;
    }

    const txns = await WalletTransaction.find(filter)
      .populate('userId', 'name email phone wallet')
      .populate('orderId', 'totalAmount invoiceNumber')
      .sort({ createdAt: -1 })
      .lean();

    const data = txns.map((t, idx) => {
      const user = t.userId || {};
      const order = t.orderId || {};
      const orderIdStr = order._id ? String(order._id) : (t.orderId ? String(t.orderId) : '-');

      return {
        "Sl No": idx + 1,
        "Transaction Date": formatDateTime(t.createdAt),
        "User Name": user.name || 'Member',
        "User Phone": user.phone || '-',
        "User Email": user.email || '-',
        "Type": (t.type || 'credit').toUpperCase(),
        "Category": (t.category || 'general').replace(/_/g, ' ').toUpperCase(),
        "Description": t.description || '-',
        "Amount (₹)": Number((t.amount || 0).toFixed(2)),
        "Balance After (₹)": t.balanceAfter !== null && t.balanceAfter !== undefined
          ? Number(t.balanceAfter.toFixed(2))
          : (user.wallet !== undefined ? Number(user.wallet.toFixed(2)) : '-'),
        "Order ID": orderIdStr
      };
    });

    res.json({
      success: true,
      reportName: "Wallet Ledger & Transactions Report",
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error generating wallets report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// 4. USERS & VIP MEMBERS REPORT
// GET /api/admin/reports/users
// =========================================================================
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const dateQuery = parseDateRange(req);
    const filter = { isVirtual: { $ne: true } };

    if (dateQuery) {
      filter.createdAt = dateQuery;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Fetch VIP cards to map tiers
    const vipCards = await VipCard.find({ status: 'Active' }).lean();
    const vipMap = new Map();
    vipCards.forEach(c => {
      if (c.userId) {
        vipMap.set(String(c.userId), c);
      }
    });

    const data = users.map((u, idx) => {
      const vip = vipMap.get(String(u._id));
      const vipTier = vip ? vip.cardTier : (u.role === 'admin' ? 'Admin' : 'Regular');
      const vipCardNo = vip ? vip.cardNumber : '-';
      const addr = u.address || {};
      const location = [addr.taluk || addr.district, addr.state].filter(Boolean).join(', ') || '-';

      return {
        "Sl No": idx + 1,
        "Registration Date": formatDateTime(u.createdAt),
        "Member Name": u.name || 'Member',
        "Email": u.email || '-',
        "Phone": u.phone || '-',
        "Member Role": (u.role || 'user').toUpperCase(),
        "Membership Tier": vipTier,
        "VIP Card No": vipCardNo,
        "Referral Code": u.referralCode || '-',
        "Referred By": u.referredBy || '-',
        "Total Referrals": u.referrals || 0,
        "First Purchase Done": u.firstPurchaseDone ? 'YES' : 'NO',
        "Wallet Balance (₹)": Number((u.wallet || 0).toFixed(2)),
        "Points Wallet": u.pointsWallet || 0,
        "Location": location
      };
    });

    res.json({
      success: true,
      reportName: "Users & VIP Members Directory Report",
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error generating users report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
