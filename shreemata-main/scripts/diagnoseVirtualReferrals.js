// scripts/diagnoseVirtualReferrals.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/mongo');
const User = require('../models/User');
const VipMasterCard = require('../models/VipMasterCard');
const VirtualReferralTransaction = require('../models/VirtualReferralTransaction');

async function runDiagnostic() {
  try {
    await connectDB();
    console.log("=== VIRTUAL REFERRAL READ-ONLY DIAGNOSTIC ===");

    const virtualUsers = await User.find({ isVirtual: true })
      .populate('originalUser', 'name email')
      .populate('treeParent', 'name email')
      .lean();

    console.log(`Total Virtual Referral positions in database: ${virtualUsers.length}`);

    // Group by owner
    const ownerMap = new Map();

    for (const v of virtualUsers) {
      const ownerId = v.originalUser ? v.originalUser._id.toString() : 'unowned';
      const ownerName = v.originalUser ? v.originalUser.name : 'Unknown';
      if (!ownerMap.has(ownerId)) {
        ownerMap.set(ownerId, { ownerName, virtuals: [] });
      }
      ownerMap.get(ownerId).virtuals.push(v);
    }

    let overallAvailablePaise = 0;
    let overallLifetimePaise = 0;
    let overallClaimedPaise = 0;

    for (const [ownerId, data] of ownerMap.entries()) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Owner: ${data.ownerName} (ID: ${ownerId})`);
      console.log(`Virtual Referral Count: ${data.virtuals.length}`);

      let ownerVipCard = null;
      if (ownerId !== 'unowned') {
        ownerVipCard = await VipMasterCard.findOne({ userId: ownerId }).sort({ tier: 1 }).lean();
      }

      console.log(`VIP Master Card: ${ownerVipCard ? `${ownerVipCard.cardNumber} (Balance: ₹${(ownerVipCard.balance || 0).toFixed(2)})` : 'None'}`);

      data.virtuals.forEach((v, idx) => {
        const avail = (v.virtualEarningsBalancePaise || 0) / 100;
        const life = (v.virtualLifetimeEarningsPaise || 0) / 100;
        const claimed = (v.virtualClaimedEarningsPaise || 0) / 100;

        overallAvailablePaise += (v.virtualEarningsBalancePaise || 0);
        overallLifetimePaise += (v.virtualLifetimeEarningsPaise || 0);
        overallClaimedPaise += (v.virtualClaimedEarningsPaise || 0);

        console.log(`  VR #${idx + 1} [${v._id}]: Level ${v.treeLevel || 0}, Position ${v.treePosition || 0}, Parent: ${v.treeParent ? v.treeParent.name : 'Root'}`);
        console.log(`    Available: ₹${avail.toFixed(2)}, Lifetime: ₹${life.toFixed(2)}, Claimed to VIP: ₹${claimed.toFixed(2)}`);
      });
    }

    console.log(`\n==================================================`);
    console.log(`OVERALL SUMMARY:`);
    console.log(`Total Virtual Available: ₹${(overallAvailablePaise / 100).toFixed(2)}`);
    console.log(`Total Virtual Lifetime:  ₹${(overallLifetimePaise / 100).toFixed(2)}`);
    console.log(`Total Claimed to VIP:   ₹${(overallClaimedPaise / 100).toFixed(2)}`);
    console.log(`==================================================`);

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(0);
  }
}

runDiagnostic();
