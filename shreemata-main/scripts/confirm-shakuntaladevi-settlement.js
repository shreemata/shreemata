const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function confirmShakuntaladeviPayout() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'shree.mata.hbl@gmail.com' });
    if (!user) {
      console.error('User Shakuntaladevi not found!');
      await mongoose.disconnect();
      return;
    }

    const w = user.withdrawals.find(item => item.transferId === 'manual_1789651179931' || (item.amount === 100 && item.status === 'approved'));

    if (!w) {
      console.error('Withdrawal record for Shakuntaladevi not found!');
      await mongoose.disconnect();
      return;
    }

    w.externalSettlementVerified = true;
    w.externalSettlementVerifiedAt = new Date();
    w.externalSettlementVerifiedBy = 'admin';
    w.adminPaymentStatus = 'confirmed_paid';
    w.bankReference = w.transferId || 'manual_1789651179931';
    w.paymentMethod = w.transferMethod || 'UPI / Manual Bank Settlement';
    w.settlementNotes = 'User explicitly confirmed external payout received';

    await user.save();

    console.log('✅ Successfully recorded authoritative external settlement proof for Shakuntaladevi (₹100.00)!');
    console.log('Withdrawal details:', {
      id: w._id,
      amount: w.amount,
      status: w.status,
      transferId: w.transferId,
      externalSettlementVerified: w.externalSettlementVerified,
      adminPaymentStatus: w.adminPaymentStatus,
      bankReference: w.bankReference
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error confirming settlement:', err);
  }
}

confirmShakuntaladeviPayout();
