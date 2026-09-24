const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = await User.aggregate([{ $match: { isVirtual: { $ne: true } } }, { $group: { _id: null, total: { $sum: '$wallet' } } }]);
    const virtuals = await User.aggregate([{ $match: { isVirtual: true } }, { $group: { _id: null, totalPaise: { $sum: '$virtualEarningsBalancePaise' } } }]);
    const vips = await VipMasterCard.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$balance', 0] } } } }]);
    
    const allWithdrawalUsers = await User.find({ 'withdrawals.0': { $exists: true } }).select('withdrawals name email').lean();
    
    let pending = 0;
    let confirmed = 0;
    let unverified = 0;
    
    allWithdrawalUsers.forEach(u => {
      u.withdrawals.forEach(w => {
        const amt = w.amount || 0;
        if (w.status === 'pending') pending += amt;
        else if (w.status === 'approved') {
          const txId = (w.transferId || '').trim();
          const isGateway = txId && !txId.toLowerCase().startsWith('manual_') && !txId.toLowerCase().startsWith('test_') && (txId.startsWith('pout_') || txId.startsWith('payout_') || txId.startsWith('pay_') || txId.startsWith('txn_') || txId.length > 15);
          if (isGateway) confirmed += amt;
          else unverified += amt;
        }
      });
    });

    const walletVal = users[0]?.total || 0;
    const virtVal = (virtuals[0]?.totalPaise || 0) / 100;
    const vipVal = vips[0]?.total || 0;
    const totalNeedToPay = walletVal + virtVal + vipVal + pending + unverified;

    console.log('--- LIVE BACKEND CALCULATIONS ---');
    console.log('Customer Wallets:', walletVal.toFixed(2));
    console.log('Virtual Balance:', virtVal.toFixed(2));
    console.log('VIP MasterCard:', vipVal.toFixed(2));
    console.log('Pending Withdrawals:', pending.toFixed(2));
    console.log('Unverified Settlements:', unverified.toFixed(2));
    console.log('Active Customer Balances:', (walletVal + virtVal + vipVal).toFixed(2));
    console.log('Total Need to Pay:', totalNeedToPay.toFixed(2));
    console.log('Confirmed Paid:', confirmed.toFixed(2));
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error in test:', err);
  }
}
test();
