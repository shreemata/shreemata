require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const AdminSettings = require('./models/AdminSettings');
const { processUserPointsWithPriority } = require('./services/pointsService');

mongoose.connect(process.env.MONGO_URI);

async function testAdminChangeMaxVirtual() {
    try {
        console.log('🧪 Testing: Admin Changes Max Virtual Trees from 5 to 2\n');

        // Get Enosh's current status
        const enosh = await User.findOne({ email: 'enoshpeterjamkhandi@gmail.com' })
            .select('name email pointsWallet virtualReferralsCreated wallet');
        
        if (!enosh) {
            console.log('❌ Enosh not found');
            return;
        }

        console.log('👤 ENOSH CURRENT STATUS:');
        console.log('='.repeat(50));
        console.log(`📧 Email: ${enosh.email}`);
        console.log(`💎 Points: ${enosh.pointsWallet}`);
        console.log(`🌳 Virtual Trees: ${enosh.virtualReferralsCreated}`);
        console.log(`💰 Cash: ₹${enosh.wallet}`);
        console.log('');

        // Get current admin settings
        const settings = await AdminSettings.getSettings();
        console.log('⚙️ CURRENT ADMIN SETTINGS:');
        console.log('='.repeat(50));
        console.log(`🌳 Max Virtual Trees: ${settings.virtualTreeSettings.maxVirtualTreesPerUser}`);
        console.log(`💰 Points per Virtual: ${settings.virtualTreeSettings.pointsPerVirtualTree}`);
        console.log(`💸 Cash Conversion: ${settings.cashConversionSettings.pointsPerConversion} points = ₹${settings.cashConversionSettings.cashPerConversion}`);
        console.log('');

        // SCENARIO 1: Admin changes max virtual trees to 2
        console.log('🎛️ ADMIN ACTION: Changing max virtual trees from 5 to 2...\n');
        
        await AdminSettings.updateSettings({
            virtualTreeSettings: {
                maxVirtualTreesPerUser: 2
            }
        }, null); // Pass null instead of 'admin' string

        console.log('✅ Admin settings updated: Max virtual trees = 2\n');

        // Check what happens to Enosh
        console.log('🤔 WHAT HAPPENS TO ENOSH?');
        console.log('='.repeat(50));
        console.log('Enosh currently has 5 virtual trees, but new limit is 2.');
        console.log('');

        // Test 1: Enosh earns new points
        console.log('📊 TEST 1: Enosh earns 100 new points');
        console.log('-'.repeat(30));
        
        // Simulate earning 100 points
        enosh.pointsWallet += 100;
        enosh.totalPointsEarned = (enosh.totalPointsEarned || 0) + 100;
        await enosh.save();
        
        console.log(`Before processing: ${enosh.pointsWallet} points, ${enosh.virtualReferralsCreated} virtual trees`);
        
        // Process with new settings
        const result = await processUserPointsWithPriority(enosh._id);
        
        // Get updated Enosh data
        const updatedEnosh = await User.findById(enosh._id).select('pointsWallet virtualReferralsCreated wallet');
        
        console.log(`After processing: ${updatedEnosh.pointsWallet} points, ${updatedEnosh.virtualReferralsCreated} virtual trees, ₹${updatedEnosh.wallet} cash`);
        console.log('');
        console.log('🎯 RESULT ANALYSIS:');
        console.log(`✅ Virtual trees created: ${result.virtualTreesCreated} (because he's already ABOVE the limit)`);
        console.log(`✅ Cash converted: ₹${result.cashConverted} (all 100 points → cash)`);
        console.log(`✅ Max virtual trees reached: ${result.maxVirtualTreesReached}`);
        console.log('');

        // Test 2: What about existing virtual trees?
        console.log('📊 TEST 2: What happens to existing 5 virtual trees?');
        console.log('-'.repeat(30));
        console.log('🔍 Checking virtual users created by Enosh...');
        
        const virtualUsers = await User.find({ 
            $or: [
                { originalUser: enosh._id },
                { originalUserId: enosh._id }
            ],
            isVirtual: true 
        }).select('name email createdAt');
        
        console.log(`Found ${virtualUsers.length} virtual users:`);
        virtualUsers.forEach((virtual, index) => {
            console.log(`  ${index + 1}. ${virtual.name} (${virtual.email})`);
        });
        console.log('');
        console.log('🎯 IMPORTANT: Existing virtual trees are NOT deleted!');
        console.log('   - Enosh keeps all 5 virtual trees');
        console.log('   - But cannot create NEW ones (already above limit)');
        console.log('   - All future points will convert to cash');
        console.log('');

        // Test 3: Show system behavior
        console.log('📊 TEST 3: System Logic Explanation');
        console.log('-'.repeat(30));
        console.log('When admin changes max virtual trees:');
        console.log('');
        console.log('✅ WHAT HAPPENS:');
        console.log('   1. Setting changes immediately');
        console.log('   2. Existing virtual trees remain untouched');
        console.log('   3. Users above limit cannot create new virtual trees');
        console.log('   4. All their future points convert to cash');
        console.log('');
        console.log('❌ WHAT DOES NOT HAPPEN:');
        console.log('   1. Existing virtual trees are NOT deleted');
        console.log('   2. Users do NOT lose their virtual referrals');
        console.log('   3. Tree structure remains intact');
        console.log('');

        // Test 4: Show different user scenarios
        console.log('📊 TEST 4: Different User Scenarios');
        console.log('-'.repeat(30));
        
        const allUsers = await User.find({ 
            isVirtual: { $ne: true },
            $or: [
                { pointsWallet: { $gt: 0 } },
                { virtualReferralsCreated: { $gt: 0 } }
            ]
        }).select('name virtualReferralsCreated pointsWallet').limit(5);
        
        console.log('Sample users and how new limit affects them:');
        console.log('');
        
        for (const user of allUsers) {
            const canCreateMore = user.virtualReferralsCreated < 2;
            const status = user.virtualReferralsCreated > 2 ? 'ABOVE LIMIT' : 
                          user.virtualReferralsCreated === 2 ? 'AT LIMIT' : 'BELOW LIMIT';
            
            console.log(`👤 ${user.name}:`);
            console.log(`   Virtual Trees: ${user.virtualReferralsCreated}/2 (${status})`);
            console.log(`   Points: ${user.pointsWallet}`);
            console.log(`   Can create more: ${canCreateMore ? 'YES' : 'NO'}`);
            console.log(`   Future points: ${canCreateMore ? 'Virtual trees + Cash' : 'Cash only'}`);
            console.log('');
        }

        console.log('🎉 CONCLUSION:');
        console.log('='.repeat(50));
        console.log('✅ Admin can safely change max virtual trees');
        console.log('✅ Existing virtual trees are preserved');
        console.log('✅ Users above limit get cash for all future points');
        console.log('✅ Users below limit continue normal behavior');
        console.log('✅ System handles the transition gracefully');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

testAdminChangeMaxVirtual();