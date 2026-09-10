const mongoose = require('mongoose');
require('dotenv').config();

async function auditRegistrationRewards() {
  await mongoose.connect(process.env.MONGO_URI);
  const WalletTransaction = require('../models/WalletTransaction');
  const txs = await WalletTransaction.find({ category: 'referral_registration_reward' });
  console.log('--- AUDIT REPORT: REFERRAL REGISTRATION REWARDS ---');
  console.log('Number of existing referral_registration_reward transactions:', txs.length);
  const totalAmount = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  console.log('Total ₹ amount:', totalAmount);
  const users = [...new Set(txs.map(tx => tx.userId.toString()))];
  console.log('Affected users count:', users.length);
  if (txs.length > 0) {
    console.log('Sample transaction:', txs[0]);
  }
  await mongoose.disconnect();
}

auditRegistrationRewards().catch(console.error);
