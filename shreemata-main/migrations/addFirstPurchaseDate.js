require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

/**
 * Migration: Add firstPurchaseDate field for existing users
 * 
 * This migration:
 * 1. Adds firstPurchaseDate field to users who have firstPurchaseDone: true but no firstPurchaseDate
 * 2. Sets the firstPurchaseDate to their first completed order date
 * 3. This ensures tree placement uses purchase time instead of registration time
 */

async function addFirstPurchaseDate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find users who have made purchases but don't have firstPurchaseDate
        const usersToUpdate = await User.find({
            firstPurchaseDone: true,
            firstPurchaseDate: null
        }).select('_id name email firstPurchaseDone firstPurchaseDate');

        console.log(`\n🔄 Found ${usersToUpdate.length} users who need firstPurchaseDate...\n`);

        if (usersToUpdate.length === 0) {
            console.log('✅ All users already have firstPurchaseDate set!');
            return;
        }

        let updatedCount = 0;
        const updates = [];

        for (const user of usersToUpdate) {
            // Find the user's first completed order
            const firstOrder = await Order.findOne({
                user_id: user._id,
                status: 'completed'
            }).sort({ createdAt: 1 }); // Oldest first

            if (firstOrder) {
                // Use the order's creation date as the first purchase date
                const purchaseDate = firstOrder.createdAt;
                
                await User.findByIdAndUpdate(user._id, {
                    firstPurchaseDate: purchaseDate
                });

                updatedCount++;
                updates.push({
                    user: user.name,
                    email: user.email,
                    purchaseDate: purchaseDate.toISOString(),
                    orderId: firstOrder._id
                });

                console.log(`✅ Updated ${user.name} (${user.email})`);
                console.log(`   First Purchase Date: ${purchaseDate.toISOString()}`);
                console.log(`   Based on Order: ${firstOrder._id}`);
                console.log('');
            } else {
                console.log(`⚠️ No completed orders found for ${user.name} (${user.email})`);
                console.log(`   Setting firstPurchaseDate to current time as fallback`);
                
                await User.findByIdAndUpdate(user._id, {
                    firstPurchaseDate: new Date()
                });

                updatedCount++;
                updates.push({
                    user: user.name,
                    email: user.email,
                    purchaseDate: new Date().toISOString(),
                    orderId: 'No order found - used current time'
                });
                console.log('');
            }
        }

        console.log(`\n📈 MIGRATION SUMMARY:`);
        console.log(`Total users processed: ${usersToUpdate.length}`);
        console.log(`Users updated: ${updatedCount}`);

        if (updatedCount > 0) {
            console.log(`\n🎉 UPDATES APPLIED:`);
            updates.forEach((update, index) => {
                console.log(`${index + 1}. ${update.user} (${update.email})`);
                console.log(`   Purchase Date: ${update.purchaseDate}`);
                console.log(`   Order: ${update.orderId}`);
                console.log('');
            });
        }

        console.log(`\n✅ Migration completed successfully!`);
        console.log(`\n💡 IMPACT:`);
        console.log(`   - Tree placement will now use purchase time instead of registration time`);
        console.log(`   - Late purchasers will be placed at the end of the tree (correct behavior)`);
        console.log(`   - Early registrants who buy later won't jump to early positions`);

    } catch (error) {
        console.error('❌ Migration error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Ask for confirmation before running
console.log('🚨 MIGRATION: Add First Purchase Date');
console.log('This migration will add firstPurchaseDate field to existing users.');
console.log('This ensures tree placement uses purchase time instead of registration time.');
console.log('');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Do you want to proceed? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        addFirstPurchaseDate();
    } else {
        console.log('Migration cancelled.');
    }
    rl.close();
});