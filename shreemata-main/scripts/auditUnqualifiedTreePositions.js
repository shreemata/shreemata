const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

/**
 * Non-Mutating Audit Script: Scans for unqualified users currently holding or assigned tree positions.
 * Requirement 9: Produce an audit report without mutating production records.
 */
async function auditUnqualifiedTreePositions() {
  console.log('🔍 Starting non-mutating audit of referral tree positions...');

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shreemata';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    }

    // Unqualified users: NOT a member, NOT completed first purchase, NOT virtual node, BUT has treeParent or treeLevel > 0
    const unqualifiedUsersWithTreePositions = await User.find({
      isVirtual: { $ne: true },
      isMember: { $ne: true },
      firstPurchaseDone: { $ne: true },
      $or: [
        { treeParent: { $ne: null, $exists: true } },
        { treeLevel: { $gt: 0 } }
      ]
    }).select('name email referralCode referredBy treeParent treeLevel treePosition createdAt');

    console.log('\n==================================================');
    console.log('📋 REFERRAL TREE UNQUALIFIED USERS AUDIT REPORT');
    console.log('==================================================');
    console.log(`Total unqualified users holding reserved tree positions: ${unqualifiedUsersWithTreePositions.length}\n`);

    if (unqualifiedUsersWithTreePositions.length === 0) {
      console.log('✅ CLEAN AUDIT: No unqualified users are holding reserved tree positions.');
    } else {
      console.log('AFFECTED USERS & PHYSICAL SLOTS:');
      const affectedSlots = [];

      unqualifiedUsersWithTreePositions.forEach((user, index) => {
        const slotDetail = {
          userId: user._id,
          name: user.name,
          email: user.email,
          referredBy: user.referredBy || 'None',
          treeParent: user.treeParent,
          treeLevel: user.treeLevel,
          treePosition: user.treePosition,
          registeredAt: user.createdAt
        };
        affectedSlots.push(slotDetail);
        console.log(`${index + 1}. User: ${user.name} (${user.email}) | ID: ${user._id}`);
        console.log(`   - Registration Date: ${user.createdAt}`);
        console.log(`   - Referred By: ${user.referredBy || 'None'}`);
        console.log(`   - Reserved Tree Parent: ${user.treeParent}`);
        console.log(`   - Reserved Level: ${user.treeLevel} | Reserved Position: ${user.treePosition}\n`);
      });

      console.log('==================================================');
      console.log('RECOMMENDATION FOR MIGRATION / REMEDIATION');
      console.log('==================================================');
      console.log('1. Do NOT mutate production database records automatically until reviewed by admin.');
      console.log('2. For each identified unqualified user:');
      console.log('   - Preserve their direct referrer attribution (`referredBy`).');
      console.log('   - Unset reserved tree fields: `treeParent = null`, `treeLevel = 0`, `treePosition = 0`.');
      console.log('   - Re-sync tree parent `treeChildren` arrays.');
      console.log('3. When these users make a qualifying purchase (subtotal >= ₹100), they will be placed in the current global BFS slot dynamically.');
    }

    if (mongoose.connection.readyState !== 0 && process.env.NODE_ENV !== 'test') {
      await mongoose.disconnect();
      console.log('\n✅ Database disconnected. Audit complete.');
    }

    return {
      count: unqualifiedUsersWithTreePositions.length,
      users: unqualifiedUsersWithTreePositions
    };
  } catch (err) {
    console.error('❌ Audit failed:', err);
    throw err;
  }
}

if (require.main === module) {
  auditUnqualifiedTreePositions()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = auditUnqualifiedTreePositions;
