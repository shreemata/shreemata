require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

async function addFirstPurchaseDate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find users who have made purchases but don't have firstPurchaseDate
        const usersToUpdate = await User.find({
            firstPurchaseDone: true,
            $or: [
                { firstPurchaseDate: null },
                { firstPurchaseDate: { $exists: false } }
            ]
        }).select('_id name email firstPurchaseDone firstPurchaseDate');

        console.log(`\n🔄 Found ${usersToUpdate.length} users who need firstPurchaseDate...\n`);

        if (usersToUpdate.length === 0) {
            console.log('✅ All users already have firstPurchaseDate set!');
            return;
        }

        let updatedCount = 0;

        for (const user of usersToUpdate) {
            // Find the user's first completed order
            const firstOrder = await Order.findOne({
                user_id: user._id,
                status: 'completed'
            }).sort({ createdAt: 1 }); // Oldest first

            let purchaseDate;
            if (firstOrder) {
                purchaseDate = firstOrder.createdAt;
                console.log(`✅ ${user.name}: Using order date ${purchaseDate.toISOString()}`);
            } else {
                // Fallback: use current time
                purchaseDate = new Date();
                console.log(`⚠️ ${user.name}: No orders found, using current time`);
            }
            
            await User.findByIdAndUpdate(user._id, {
                firstPurchaseDate: purchaseDate
            });

            updatedCount++;
        }

        console.log(`\n📈 MIGRATION SUMMARY:`);
        console.log(`Total users processed: ${usersToUpdate.length}`);
        console.log(`Users updated: ${updatedCount}`);
        console.log(`\n✅ Migration completed successfully!`);

    } catch (error) {
        console.error('❌ Migration error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

addFirstPurchaseDate();