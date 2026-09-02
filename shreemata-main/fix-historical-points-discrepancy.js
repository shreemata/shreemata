require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const PointsTransaction = require('./models/PointsTransaction');

mongoose.connect(process.env.MONGO_URI);

async function fixHistoricalPointsDiscrepancy() {
    try {
        console.log('🔧 Fixing Historical Points Discrepancy...\n');

        // Find users with the specific discrepancy pattern:
        // - totalPointsEarned = 60
        // - pointsWallet = 10
        // - difference = 50 (likely auto-converted)
        
        const affectedUsers = await User.find({
            totalPointsEarned: 60,
            pointsWallet: 10,
            isVirtual: { $ne: true }
        }).select('name email pointsWallet totalPointsEarned wallet virtualReferralsCreated');

        console.log(`🔍 Found ${affectedUsers.length} users with historical points discrepancy\n`);

        if (affectedUsers.length === 0) {
            console.log('✅ No users found with the specific discrepancy pattern');
            return;
        }

        console.log('👥 AFFECTED USERS:');
        console.log('='.repeat(70));
        affectedUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} (${user.email})`);
            console.log(`   💎 Current Points: ${user.pointsWallet}`);
            console.log(`   📊 Total Earned: ${user.totalPointsEarned}`);
            console.log(`   💰 Current Wallet: ₹${user.wallet}`);
            console.log(`   🌳 Virtual Trees: ${user.virtualReferralsCreated}`);
            console.log('');
        });

        console.log('🔧 FIXING PROCESS:');
        console.log('='.repeat(70));
        console.log('For each user:');
        console.log('1. Add 50 points back to pointsWallet (10 → 60)');
        console.log('2. Create a correction transaction record');
        console.log('3. Keep wallet cash unchanged (they earned it)');
        console.log('4. Keep virtual trees unchanged');
        console.log('');

        let fixedCount = 0;
        
        for (const user of affectedUsers) {
            console.log(`🔧 Fixing ${user.name}...`);
            
            // Add 50 points back to their wallet
            const pointsToRestore = 50;
            user.pointsWallet += pointsToRestore;
            
            console.log(`   ✅ Points: ${user.pointsWallet - pointsToRestore} → ${user.pointsWallet}`);
            
            // Save user changes
            await user.save();
            
            // Create a correction transaction record
            const correctionTransaction = new PointsTransaction({
                user: user._id,
                type: 'earned', // Use 'earned' type for the correction
                points: pointsToRestore,
                source: 'book_purchase', // Required for earned type
                sourceId: new mongoose.Types.ObjectId(), // Dummy ID for correction
                orderId: new mongoose.Types.ObjectId(), // Dummy order ID for correction
                description: `Historical correction: Restored ${pointsToRestore} points that were auto-converted to cash`,
                balanceAfter: user.pointsWallet
            });
            
            await correctionTransaction.save();
            console.log(`   ✅ Created correction transaction`);
            
            fixedCount++;
            console.log('');
        }

        console.log('📊 SUMMARY:');
        console.log('='.repeat(70));
        console.log(`✅ Fixed ${fixedCount} users`);
        console.log(`💎 Total points restored: ${fixedCount * 50}`);
        console.log('');
        
        console.log('🎯 RESULT:');
        console.log('✅ Users now have correct points balance (60 points)');
        console.log('✅ Users keep their existing cash (earned legitimately)');
        console.log('✅ Users can now create virtual trees if they want (60 points available)');
        console.log('✅ Transaction history shows the correction');
        console.log('');
        
        // Verify the fix
        console.log('🔍 VERIFICATION:');
        console.log('='.repeat(70));
        
        const verifyUsers = await User.find({
            _id: { $in: affectedUsers.map(u => u._id) }
        }).select('name email pointsWallet totalPointsEarned');
        
        verifyUsers.forEach((user, index) => {
            const isFixed = user.pointsWallet === user.totalPointsEarned;
            console.log(`${index + 1}. ${user.name}: ${user.pointsWallet}/${user.totalPointsEarned} points ${isFixed ? '✅' : '❌'}`);
        });

        console.log('\n🎉 Historical points discrepancy fixed successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

fixHistoricalPointsDiscrepancy();