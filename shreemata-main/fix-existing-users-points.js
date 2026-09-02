require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const AdminSettings = require('./models/AdminSettings');
const { processUserPointsWithPriority } = require('./services/pointsService');

mongoose.connect(process.env.MONGO_URI);

async function fixExistingUsers() {
    try {
        console.log('🔧 Fixing Existing Users with Priority Points System...\n');

        // Create default admin settings if they don't exist
        let settings = await AdminSettings.findOne();
        if (!settings) {
            settings = await AdminSettings.create({
                virtualTreeSettings: {
                    enabled: true,
                    pointsPerVirtualTree: 100,
                    maxVirtualTreesPerUser: 5,
                    autoCreateEnabled: true
                },
                cashConversionSettings: {
                    enabled: true,
                    pointsPerConversion: 50,
                    cashPerConversion: 25
                }
            });
            console.log('✅ Created default admin settings');
        }

        console.log('📊 Current Settings:');
        console.log(`   Virtual Trees: ${settings.virtualTreeSettings.pointsPerVirtualTree} points each, max ${settings.virtualTreeSettings.maxVirtualTreesPerUser} per user`);
        console.log(`   Cash Conversion: ${settings.cashConversionSettings.pointsPerConversion} points = ₹${settings.cashConversionSettings.cashPerConversion}`);
        console.log('');

        // Find users with points who need processing
        const usersWithPoints = await User.find({
            pointsWallet: { $gt: 0 },
            isVirtual: { $ne: true }
        }).select('name email pointsWallet virtualReferralsCreated wallet').sort({ pointsWallet: -1 });

        console.log(`👥 Found ${usersWithPoints.length} users with points to process:\n`);

        let totalVirtualTreesCreated = 0;
        let totalCashConverted = 0;
        let processedCount = 0;

        for (const user of usersWithPoints) {
            console.log(`🔄 Processing: ${user.name} (${user.email})`);
            console.log(`   Before: ${user.pointsWallet} points, ${user.virtualReferralsCreated} virtual trees, ₹${user.wallet || 0} cash`);

            try {
                const result = await processUserPointsWithPriority(user._id);

                // Get updated user data
                const updatedUser = await User.findById(user._id).select('pointsWallet virtualReferralsCreated wallet');

                console.log(`   After:  ${updatedUser.pointsWallet} points, ${updatedUser.virtualReferralsCreated} virtual trees, ₹${updatedUser.wallet || 0} cash`);
                console.log(`   ✅ Created ${result.virtualTreesCreated} virtual trees, converted ₹${result.cashConverted} to cash`);

                totalVirtualTreesCreated += result.virtualTreesCreated;
                totalCashConverted += result.cashConverted;
                processedCount++;

            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }

            console.log('');
        }

        console.log('📊 SUMMARY:');
        console.log('='.repeat(60));
        console.log(`✅ Users processed: ${processedCount}/${usersWithPoints.length}`);
        console.log(`🌳 Total virtual trees created: ${totalVirtualTreesCreated}`);
        console.log(`💰 Total cash converted: ₹${totalCashConverted}`);
        console.log('');

        // Show final system stats
        const finalStats = await User.aggregate([
            { $match: { isVirtual: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalPointsInSystem: { $sum: '$pointsWallet' },
                    totalCashInSystem: { $sum: '$wallet' },
                    totalVirtualTrees: { $sum: '$virtualReferralsCreated' }
                }
            }
        ]);

        const virtualUsers = await User.countDocuments({ isVirtual: true });

        if (finalStats.length > 0) {
            const stats = finalStats[0];
            console.log('🎯 FINAL SYSTEM STATUS:');
            console.log('='.repeat(60));
            console.log(`👥 Total users: ${stats.totalUsers}`);
            console.log(`🤖 Virtual users: ${virtualUsers}`);
            console.log(`💎 Points in system: ${stats.totalPointsInSystem}`);
            console.log(`💰 Cash in system: ₹${stats.totalCashInSystem}`);
            console.log(`🌳 Virtual trees: ${stats.totalVirtualTrees}`);
        }

        console.log('\n🎉 Priority Points System is now active!');
        console.log('📝 Next steps:');
        console.log('   1. Visit /admin-settings.html to adjust settings');
        console.log('   2. Test with new point earnings');
        console.log('   3. Monitor system performance');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the fix
fixExistingUsers();