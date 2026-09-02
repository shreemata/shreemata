require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

async function checkNiranjanUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find the user
        const user = await User.findOne({ email: 'niranjangudi@gmail.com' })
            .populate('treeParent', 'name email referralCode')
            .populate('treeChildren', 'name email referralCode');

        if (!user) {
            console.log('❌ User niranjangudi@gmail.com not found');
            return;
        }

        console.log('\n👤 USER DETAILS: NIRANJAN GUDI');
        console.log('=====================================');
        console.log(`Name: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`Phone: ${user.phone || 'Not set'}`);
        console.log(`Role: ${user.role}`);
        console.log(`Created At: ${user.createdAt.toISOString()}`);
        console.log(`Updated At: ${user.updatedAt.toISOString()}`);

        console.log('\n🔗 REFERRAL INFORMATION:');
        console.log(`Referral Code: ${user.referralCode}`);
        console.log(`Referred By: ${user.referredBy || 'None (Direct signup)'}`);
        console.log(`Referrals Count: ${user.referrals || 0}`);
        console.log(`Referral Joined At: ${user.referralJoinedAt || 'N/A'}`);

        console.log('\n💰 FINANCIAL INFORMATION:');
        console.log(`Wallet Balance: ₹${user.wallet || 0}`);
        console.log(`Direct Commission Earned: ₹${user.directCommissionEarned || 0}`);
        console.log(`Tree Commission Earned: ₹${user.treeCommissionEarned || 0}`);

        console.log('\n📦 PURCHASE INFORMATION:');
        console.log(`First Purchase Done: ${user.firstPurchaseDone}`);
        console.log(`First Purchase Date: ${user.firstPurchaseDate ? user.firstPurchaseDate.toISOString() : 'Not set'}`);

        console.log('\n🌳 TREE PLACEMENT:');
        console.log(`Tree Level: ${user.treeLevel}`);
        console.log(`Tree Position: ${user.treePosition}`);
        console.log(`Tree Parent: ${user.treeParent ? `${user.treeParent.name} (${user.treeParent.email})` : 'None (Root level)'}`);
        console.log(`Tree Children Count: ${user.treeChildren.length}`);
        
        if (user.treeChildren.length > 0) {
            console.log('Tree Children:');
            user.treeChildren.forEach((child, index) => {
                console.log(`   ${index + 1}. ${child.name} (${child.email})`);
            });
        }

        // Check orders
        console.log('\n📋 ORDER HISTORY:');
        const orders = await Order.find({ user_id: user._id })
            .select('orderNumber totalAmount status createdAt appliedOffer')
            .sort({ createdAt: 1 });

        if (orders.length === 0) {
            console.log('   No orders found');
        } else {
            console.log(`   Total Orders: ${orders.length}`);
            orders.forEach((order, index) => {
                const orderDate = order.createdAt.toISOString().split('T')[0];
                console.log(`   ${index + 1}. Order #${order.orderNumber} - ₹${order.totalAmount} - ${order.status} - ${orderDate}`);
                if (order.appliedOffer) {
                    console.log(`      Offer: ${order.appliedOffer.offerTitle} (₹${order.appliedOffer.savings} saved)`);
                }
            });
        }

        // Check if user has referrer and their status
        if (user.referredBy) {
            console.log('\n👥 REFERRER INFORMATION:');
            const referrer = await User.findOne({ referralCode: user.referredBy })
                .select('name email firstPurchaseDone treeLevel treeParent');
            
            if (referrer) {
                console.log(`Referrer: ${referrer.name} (${referrer.email})`);
                console.log(`Referrer First Purchase Done: ${referrer.firstPurchaseDone}`);
                console.log(`Referrer Tree Level: ${referrer.treeLevel}`);
                console.log(`Referrer Tree Parent: ${referrer.treeParent || 'None (Root)'}`);
            } else {
                console.log('❌ Referrer not found (invalid referral code)');
            }
        }

        // Check direct referrals
        console.log('\n👥 DIRECT REFERRALS:');
        const directReferrals = await User.find({ referredBy: user.referralCode })
            .select('name email firstPurchaseDone createdAt')
            .sort({ createdAt: 1 });

        if (directReferrals.length === 0) {
            console.log('   No direct referrals found');
        } else {
            console.log(`   Total Direct Referrals: ${directReferrals.length}`);
            directReferrals.forEach((ref, index) => {
                const joinDate = ref.createdAt.toISOString().split('T')[0];
                console.log(`   ${index + 1}. ${ref.name} (${ref.email}) - Joined: ${joinDate}, Purchased: ${ref.firstPurchaseDone}`);
            });
        }

        // Check tree position context
        if (user.treeLevel > 0) {
            console.log('\n🌳 TREE CONTEXT:');
            
            // Find users at same level
            const sameLevel = await User.find({ 
                treeLevel: user.treeLevel,
                firstPurchaseDone: true,
                _id: { $ne: user._id }
            })
            .select('name email firstPurchaseDate treePosition')
            .sort({ firstPurchaseDate: 1 });

            console.log(`Users at Level ${user.treeLevel}:`);
            sameLevel.forEach((u, index) => {
                const purchaseDate = u.firstPurchaseDate ? u.firstPurchaseDate.toISOString().split('T')[0] : 'N/A';
                const marker = u.firstPurchaseDate && user.firstPurchaseDate && u.firstPurchaseDate > user.firstPurchaseDate ? '⬅️ AFTER NIRANJAN' : 
                              u.firstPurchaseDate && user.firstPurchaseDate && u.firstPurchaseDate < user.firstPurchaseDate ? '➡️ BEFORE NIRANJAN' : '';
                console.log(`   ${index + 1}. ${u.name} - Purchase: ${purchaseDate}, Position: ${u.treePosition} ${marker}`);
            });
        }

        console.log('\n🔍 ANALYSIS:');
        if (user.firstPurchaseDone) {
            const regDate = user.createdAt.toISOString().split('T')[0];
            const purchaseDate = user.firstPurchaseDate ? user.firstPurchaseDate.toISOString().split('T')[0] : 'Unknown';
            
            if (user.firstPurchaseDate) {
                const daysBetween = Math.floor((user.firstPurchaseDate - user.createdAt) / (1000 * 60 * 60 * 24));
                console.log(`📅 Registration to Purchase Gap: ${daysBetween} days`);
                console.log(`📅 Registered: ${regDate}`);
                console.log(`📅 First Purchase: ${purchaseDate}`);
                
                if (daysBetween > 0) {
                    console.log(`⚠️ This user registered early but purchased ${daysBetween} days later`);
                    console.log(`🔧 With the fix, future similar users will be placed based on purchase time, not registration time`);
                } else {
                    console.log(`✅ This user purchased on the same day they registered`);
                }
            }
        } else {
            console.log(`❌ User has not made any purchases yet`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

checkNiranjanUser();