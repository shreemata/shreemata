const mongoose = require('mongoose');
const User = require('./models/User');
const PointsTransaction = require('./models/PointsTransaction');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shreemata', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function checkVirtualChildren() {
    try {
        console.log('🔍 Analyzing Virtual Children System...\n');

        // Find users with high points but few virtual children
        const usersWithHighPoints = await User.find({
            pointsWallet: { $gte: 100 },
            isVirtual: { $ne: true }
        }).select('name email pointsWallet totalPointsEarned virtualReferralsCreated').sort({ pointsWallet: -1 });

        console.log('📊 Users with 100+ points:');
        console.log('='.repeat(80));
        
        for (const user of usersWithHighPoints) {
            const maxPossibleVirtual = Math.floor(user.pointsWallet / 100);
            const actualVirtual = user.virtualReferralsCreated || 0;
            const missing = maxPossibleVirtual - actualVirtual;
            
            console.log(`👤 ${user.name} (${user.email})`);
            console.log(`   💰 Points Wallet: ${user.pointsWallet}`);
            console.log(`   📈 Total Earned: ${user.totalPointsEarned}`);
            console.log(`   🤖 Virtual Created: ${actualVirtual}`);
            console.log(`   ✅ Max Possible: ${maxPossibleVirtual}`);
            console.log(`   ❌ Missing: ${missing}`);
            
            if (missing > 0) {
                console.log(`   🚨 ISSUE: Should have ${missing} more virtual children!`);
            }
            console.log('');
        }

        // Check total virtual users in system
        const totalVirtualUsers = await User.countDocuments({ isVirtual: true });
        console.log(`🤖 Total Virtual Users in System: ${totalVirtualUsers}`);

        // Find virtual users and their original owners
        const virtualUsers = await User.find({ isVirtual: true })
            .select('name email originalUserId')
            .populate('originalUserId', 'name email');

        console.log('\n🤖 Virtual Users Details:');
        console.log('='.repeat(80));
        
        const virtualByOwner = {};
        for (const virtual of virtualUsers) {
            const ownerId = virtual.originalUserId?._id?.toString() || 'unknown';
            if (!virtualByOwner[ownerId]) {
                virtualByOwner[ownerId] = {
                    owner: virtual.originalUserId,
                    count: 0,
                    virtuals: []
                };
            }
            virtualByOwner[ownerId].count++;
            virtualByOwner[ownerId].virtuals.push(virtual.name);
        }

        for (const [ownerId, data] of Object.entries(virtualByOwner)) {
            if (data.owner) {
                console.log(`👤 ${data.owner.name} (${data.owner.email})`);
                console.log(`   🤖 Virtual Children: ${data.count}`);
                console.log(`   📝 Names: ${data.virtuals.join(', ')}`);
                console.log('');
            }
        }

        // Check points transactions for virtual creation
        const virtualTransactions = await PointsTransaction.find({
            type: 'redeemed',
            points: -100,
            description: { $regex: /virtual referral/i }
        }).populate('user', 'name email').sort({ createdAt: -1 });

        console.log('\n💸 Recent Virtual Redemptions:');
        console.log('='.repeat(80));
        
        for (const transaction of virtualTransactions.slice(0, 10)) {
            console.log(`📅 ${transaction.createdAt.toLocaleDateString()}`);
            console.log(`👤 ${transaction.user?.name} (${transaction.user?.email})`);
            console.log(`💰 ${transaction.points} points`);
            console.log(`📝 ${transaction.description}`);
            console.log('');
        }

        // Analysis of the issue
        console.log('\n🔍 ANALYSIS:');
        console.log('='.repeat(80));
        console.log('Current Logic:');
        console.log('1. checkAndCreateVirtualReferral() only creates ONE virtual child per call');
        console.log('2. It checks: if (pointsWallet >= 100) → create 1 virtual → deduct 100 points');
        console.log('3. It does NOT loop to create multiple virtuals in one go');
        console.log('');
        console.log('The Issue:');
        console.log('- User earns 660 points');
        console.log('- System creates 1 virtual child (660 → 560 points)');
        console.log('- User still has 560 points (enough for 5 more virtuals)');
        console.log('- But system waits for next points earning to check again');
        console.log('');
        console.log('Solutions:');
        console.log('1. Modify checkAndCreateVirtualReferral() to use a WHILE loop');
        console.log('2. Create all possible virtual children in one go');
        console.log('3. Or add a manual "Create All Possible Virtuals" button');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the analysis
checkVirtualChildren();