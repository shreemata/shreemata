require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkReferralCountAccuracy() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Get all users with referral codes
        const users = await User.find({ 
            referralCode: { $exists: true, $ne: null } 
        }).select('name email referralCode referrals');

        console.log(`\n📊 Checking referral count accuracy for ${users.length} users...\n`);

        let totalDiscrepancies = 0;
        const discrepancies = [];

        for (const user of users) {
            // Count actual direct referrals
            const actualReferrals = await User.countDocuments({ 
                referredBy: user.referralCode 
            });

            // Compare with stored count
            const storedCount = user.referrals || 0;

            if (actualReferrals !== storedCount) {
                totalDiscrepancies++;
                discrepancies.push({
                    user: user.name,
                    email: user.email,
                    referralCode: user.referralCode,
                    storedCount,
                    actualCount: actualReferrals,
                    difference: actualReferrals - storedCount
                });

                console.log(`❌ MISMATCH: ${user.name} (${user.email})`);
                console.log(`   Referral Code: ${user.referralCode}`);
                console.log(`   Stored Count: ${storedCount}`);
                console.log(`   Actual Count: ${actualReferrals}`);
                console.log(`   Difference: ${actualReferrals - storedCount}`);
                console.log('');
            } else {
                console.log(`✅ CORRECT: ${user.name} - ${actualReferrals} referrals`);
            }
        }

        console.log(`\n📈 SUMMARY:`);
        console.log(`Total users checked: ${users.length}`);
        console.log(`Users with correct counts: ${users.length - totalDiscrepancies}`);
        console.log(`Users with incorrect counts: ${totalDiscrepancies}`);

        if (totalDiscrepancies > 0) {
            console.log(`\n🔧 DISCREPANCIES FOUND:`);
            discrepancies.forEach((d, index) => {
                console.log(`${index + 1}. ${d.user} (${d.email}): ${d.storedCount} → ${d.actualCount} (${d.difference > 0 ? '+' : ''}${d.difference})`);
            });

            console.log(`\n💡 To fix these discrepancies, you can run:`);
            console.log(`   node fix-referral-counts.js`);
        } else {
            console.log(`\n✅ All referral counts are accurate!`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

checkReferralCountAccuracy();