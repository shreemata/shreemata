// Update existing virtual users to mark them as having made a purchase
// This will make them visible in the referral tree

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function updateVirtualUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find all virtual users
        const virtualUsers = await User.find({ isVirtual: true });
        console.log(`📊 Found ${virtualUsers.length} virtual users`);

        if (virtualUsers.length === 0) {
            console.log('No virtual users to update');
            process.exit(0);
        }

        // Update each virtual user
        let updated = 0;
        for (const user of virtualUsers) {
            if (!user.firstPurchaseDone) {
                user.firstPurchaseDone = true;
                await user.save();
                console.log(`✅ Updated ${user.name} (${user.email}) - firstPurchaseDone set to true`);
                updated++;
            } else {
                console.log(`⏭️  Skipped ${user.name} - already marked as purchased`);
            }
        }

        console.log(`\n✅ Successfully updated ${updated} virtual users`);
        console.log('Virtual users should now be visible in the referral tree!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating virtual users:', error);
        process.exit(1);
    }
}

updateVirtualUsers();
