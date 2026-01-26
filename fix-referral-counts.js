require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function fixReferralCounts() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Get all users with referral codes
        const users = await User.find({ 
            referralCode: { $exists: true, $ne: null } 
        }).select('name email referralCode referrals');

        console.log(`\n🔧 Fixing referral counts for ${users.length} users...\n`);

        let fixedCount = 0;
        const fixes = [];

        for (const user of users) {
            // Count actual direct referrals
            const actualReferrals = await User.countDocuments({ 
                referredBy: user.referralCode 
            });

            // Compare with stored count
            const storedCount = user.referrals || 0;

            if (actualReferrals !== storedCount) {
                // Update the stored count
                await User.findByIdAndUpdate(user._id, { 
                    referrals: actualReferrals 
                });

                fixedCount++;
                fixes.push({
                    user: user.name,
                    email: user.email,
                    referralCode: user.referralCode,
                    oldCount: storedCount,
                    newCount: actualReferrals,
                    difference: actualReferrals - storedCount
                });

                console.log(`✅ FIXED: ${user.name} (${user.email})`);
                console.log(`   Referral Code: ${user.referralCode}`);
                console.log(`   Old Count: ${storedCount} → New Count: ${actualReferrals}`);
                console.log(`   Difference: ${actualReferrals - storedCount > 0 ? '+' : ''}${actualReferrals - storedCount}`);
                console.log('');
            } else {
                console.log(`✅ ALREADY CORRECT: ${user.name} - ${actualReferrals} referrals`);
            }
        }

        console.log(`\n📈 SUMMARY:`);
        console.log(`Total users processed: ${users.length}`);
        console.log(`Users fixed: ${fixedCount}`);
        console.log(`Users already correct: ${users.length - fixedCount}`);

        if (fixedCount > 0) {
            console.log(`\n🎉 FIXES APPLIED:`);
            fixes.forEach((fix, index) => {
                console.log(`${index + 1}. ${fix.user} (${fix.email}): ${fix.oldCount} → ${fix.newCount} (${fix.difference > 0 ? '+' : ''}${fix.difference})`);
            });
        }

        console.log(`\n✅ All referral counts are now accurate!`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Ask for confirmation before running
console.log('🚨 WARNING: This script will update referral counts in the database.');
console.log('Make sure you have a backup before proceeding.');
console.log('');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Do you want to proceed? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        fixReferralCounts();
    } else {
        console.log('Operation cancelled.');
    }
    rl.close();
});