require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testTreePlacementOrder() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Get all users who have made purchases, ordered by different criteria
        console.log('\n📊 TREE PLACEMENT ORDER ANALYSIS\n');

        // 1. Current tree users ordered by registration time (old behavior)
        console.log('🔴 OLD BEHAVIOR - Ordered by Registration Time (createdAt):');
        const usersByRegistration = await User.find({ 
            firstPurchaseDone: true,
            treeLevel: { $gte: 1 }
        })
        .select('name email createdAt firstPurchaseDate treeLevel treePosition')
        .sort({ createdAt: 1 });

        usersByRegistration.forEach((user, index) => {
            const regDate = user.createdAt.toISOString().split('T')[0];
            const purchaseDate = user.firstPurchaseDate ? user.firstPurchaseDate.toISOString().split('T')[0] : 'N/A';
            console.log(`   ${index + 1}. ${user.name} - Reg: ${regDate}, Purchase: ${purchaseDate}, Level: ${user.treeLevel}`);
        });

        console.log('\n🟢 NEW BEHAVIOR - Ordered by Purchase Time (firstPurchaseDate):');
        const usersByPurchase = await User.find({ 
            firstPurchaseDone: true,
            treeLevel: { $gte: 1 }
        })
        .select('name email createdAt firstPurchaseDate treeLevel treePosition')
        .sort({ firstPurchaseDate: 1 });

        usersByPurchase.forEach((user, index) => {
            const regDate = user.createdAt.toISOString().split('T')[0];
            const purchaseDate = user.firstPurchaseDate ? user.firstPurchaseDate.toISOString().split('T')[0] : 'N/A';
            console.log(`   ${index + 1}. ${user.name} - Reg: ${regDate}, Purchase: ${purchaseDate}, Level: ${user.treeLevel}`);
        });

        // 3. Show users who registered early but purchased late
        console.log('\n⚠️ USERS WHO REGISTERED EARLY BUT PURCHASED LATE:');
        const allUsers = await User.find({ 
            firstPurchaseDone: true,
            treeLevel: { $gte: 1 }
        })
        .select('name email createdAt firstPurchaseDate treeLevel')
        .sort({ createdAt: 1 });

        let foundLateUsers = false;
        for (let i = 0; i < allUsers.length; i++) {
            const user = allUsers[i];
            if (user.firstPurchaseDate) {
                // Check if this user registered early but purchased after someone who registered later
                const laterRegistrants = allUsers.filter(u => 
                    u.createdAt > user.createdAt && 
                    u.firstPurchaseDate && 
                    u.firstPurchaseDate < user.firstPurchaseDate
                );

                if (laterRegistrants.length > 0) {
                    foundLateUsers = true;
                    const regDate = user.createdAt.toISOString().split('T')[0];
                    const purchaseDate = user.firstPurchaseDate.toISOString().split('T')[0];
                    console.log(`   📅 ${user.name} - Registered: ${regDate}, Purchased: ${purchaseDate}`);
                    console.log(`      ⚡ ${laterRegistrants.length} users registered after them but purchased before them`);
                }
            }
        }

        if (!foundLateUsers) {
            console.log('   ✅ No users found who registered early but purchased late');
        }

        console.log('\n💡 IMPACT OF THE FIX:');
        console.log('   - Tree placement now uses purchase time instead of registration time');
        console.log('   - Late purchasers will be placed at the correct position (end of tree)');
        console.log('   - Early registrants who buy later won\'t jump to early positions');
        console.log('   - Tree structure will be more fair and logical');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

testTreePlacementOrder();