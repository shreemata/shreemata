/**
 * scripts/delete-non-admin-users.js
 * 
 * ONE-TIME MANUALLY-RUN SCRIPT:
 * Deletes all non-admin users and all related collections/data while preserving
 * admin accounts and admin-owned data completely intact.
 * 
 * Safety features:
 * 1. Defaults to DRY-RUN mode (no changes made).
 * 2. Requires explicit `--confirm` CLI flag to execute changes.
 * 3. Unconditionally dumps full backups of all affected collections to `backups/` before deleting.
 * 4. Cleans up referral tree dangling pointers on surviving admin accounts.
 * 
 * Usage:
 *   Dry Run:  node scripts/delete-non-admin-users.js
 *   Execute:  node scripts/delete-non-admin-users.js --confirm
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Import Models
const User = require('../models/User');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const { Invoice } = require('../routes/invoices');
const CommissionTransaction = require('../models/CommissionTransaction');
const DigitalPurchase = require('../models/DigitalPurchase');
const PointsTransaction = require('../models/PointsTransaction');
const ReadingSession = require('../models/ReadingSession');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const Notification = require('../models/Notification');

async function run() {
    const isConfirmed = process.argv.includes('--confirm');

    console.log('================================================================');
    console.log('       SHREE MATA - NON-ADMIN USER CLEANUP UTILITY               ');
    console.log('================================================================');
    console.log(`Execution Mode : ${isConfirmed ? '🚨 LIVE EXECUTION (--confirm)' : '🔍 DRY RUN (Preview only)'}`);
    console.log(`Database URI   : ${process.env.MONGO_URI ? process.env.MONGO_URI.replace(/:([^@]+)@/, ':****@') : 'Not Set'}`);
    console.log(`Timestamp      : ${new Date().toISOString()}`);
    console.log('================================================================\n');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB successfully.\n');

        // 1. Identify Admin & Non-Admin Users
        const adminUsers = await User.find({ role: 'admin' });
        const adminIds = adminUsers.map(a => a._id.toString());

        const nonAdminUsers = await User.find({ role: { $ne: 'admin' } });
        const nonAdminIds = nonAdminUsers.map(u => u._id);
        const nonAdminIdStrings = nonAdminIds.map(id => id.toString());

        console.log(`👑 Surviving Admin Users (${adminUsers.length}):`);
        if (adminUsers.length === 0) {
            console.error('❌ SAFETY ABORT: No admin users found! Aborting to prevent deleting all users.');
            process.exit(1);
        }
        adminUsers.forEach((a, i) => {
            console.log(`   ${i + 1}. [Admin] ID: ${a._id} | Email: ${a.email} | Name: ${a.name || 'N/A'}`);
        });

        console.log(`\n👥 Non-Admin Users to Delete (${nonAdminUsers.length}):`);
        if (nonAdminUsers.length === 0) {
            console.log('   (No non-admin users found in database.)');
        } else {
            nonAdminUsers.forEach((u, i) => {
                console.log(`   ${i + 1}. [${u.role || 'user'}] ID: ${u._id} | Email: ${u.email || 'N/A'} | Name: ${u.name || 'N/A'}`);
            });
        }

        // 2. Discover Related Documents
        // Orders
        const nonAdminOrders = await Order.find({ user_id: { $in: nonAdminIds } });
        const nonAdminOrderIds = nonAdminOrders.map(o => o._id);

        // Invoices linked to non-admin orders
        const nonAdminInvoices = await Invoice.find({ orderId: { $in: nonAdminOrderIds } });

        // Purchases
        const nonAdminPurchases = await Purchase.find({ user_id: { $in: nonAdminIds } });

        // Commission Transactions matching any non-admin reference
        // Fields used: purchaser, directReferrer, orderId, treeCommissions.recipient, treeCommissions.redirectedTo
        const nonAdminCommissionTx = await CommissionTransaction.find({
            $or: [
                { purchaser: { $in: nonAdminIds } },
                { directReferrer: { $in: nonAdminIds } },
                { orderId: { $in: nonAdminOrderIds } },
                { 'treeCommissions.recipient': { $in: nonAdminIds } },
                { 'treeCommissions.redirectedTo': { $in: nonAdminIds } }
            ]
        });

        // Digital Purchases
        const nonAdminDigitalPurchases = await DigitalPurchase.find({ userId: { $in: nonAdminIds } });

        // Points Transactions (user or virtualUserId)
        const nonAdminPointsTx = await PointsTransaction.find({
            $or: [
                { user: { $in: nonAdminIds } },
                { virtualUserId: { $in: nonAdminIds } }
            ]
        });

        // Reading Sessions
        const nonAdminReadingSessions = await ReadingSession.find({ userId: { $in: nonAdminIds } });

        // Password Reset Requests
        const nonAdminPasswordResets = await PasswordResetRequest.find({ userId: { $in: nonAdminIds } });

        // Notifications check (createdBy non-admin)
        const nonAdminNotifications = await Notification.find({ createdBy: { $in: nonAdminIds } });

        // 3. Tree Cleanup Analysis on Surviving Admins
        const adminTreeUpdates = [];
        for (const admin of adminUsers) {
            let needsUpdate = false;
            let newParent = admin.treeParent;
            let newChildren = Array.isArray(admin.treeChildren) ? [...admin.treeChildren] : [];

            if (admin.treeParent && nonAdminIdStrings.includes(admin.treeParent.toString())) {
                newParent = null;
                needsUpdate = true;
            }

            const filteredChildren = newChildren.filter(c => !nonAdminIdStrings.includes(c?.toString()));
            if (filteredChildren.length !== newChildren.length) {
                newChildren = filteredChildren;
                needsUpdate = true;
            }

            if (needsUpdate) {
                adminTreeUpdates.push({
                    adminId: admin._id,
                    adminName: admin.name,
                    adminEmail: admin.email,
                    oldParent: admin.treeParent,
                    newParent: newParent,
                    oldChildren: admin.treeChildren,
                    newChildren: newChildren
                });
            }
        }

        // Summary Counts Table
        console.log('\n----------------------------------------------------------------');
        console.log('                 DOCUMENTS AFFECTED SUMMARY                     ');
        console.log('----------------------------------------------------------------');
        console.log(` 1. Users (role != 'admin')          : ${nonAdminUsers.length}`);
        console.log(` 2. Orders (user_id in non-admins)   : ${nonAdminOrders.length}`);
        console.log(` 3. Invoices (orderId in orders)     : ${nonAdminInvoices.length}`);
        console.log(` 4. Purchases (user_id in non-admins): ${nonAdminPurchases.length}`);
        console.log(` 5. Commission Transactions          : ${nonAdminCommissionTx.length} (fields: purchaser, directReferrer, orderId, treeCommissions)`);
        console.log(` 6. Digital Purchases                : ${nonAdminDigitalPurchases.length}`);
        console.log(` 7. Points Transactions              : ${nonAdminPointsTx.length} (fields: user, virtualUserId)`);
        console.log(` 8. Reading Sessions                 : ${nonAdminReadingSessions.length}`);
        console.log(` 9. Password Reset Requests          : ${nonAdminPasswordResets.length}`);
        console.log(`10. Notifications (by non-admins)    : ${nonAdminNotifications.length}`);
        console.log(`11. Admin Tree Pointer Fixes         : ${adminTreeUpdates.length} admin account(s)`);
        console.log('----------------------------------------------------------------\n');

        if (adminTreeUpdates.length > 0) {
            console.log('🌳 Admin Tree Cleanups Required:');
            adminTreeUpdates.forEach(u => {
                console.log(`   - Admin: ${u.adminName} (${u.adminEmail})`);
                console.log(`     treeParent: ${u.oldParent || 'null'} -> ${u.newParent || 'null'}`);
                console.log(`     treeChildren: [${u.oldChildren}] -> [${u.newChildren}]`);
            });
            console.log('');
        }

        if (!isConfirmed) {
            console.log('================================================================');
            console.log('                   🔍 DRY-RUN COMPLETE                          ');
            console.log('================================================================');
            console.log('NO DATA WAS DELETED OR MODIFIED.');
            console.log('To execute this deletion and create mandatory backup files, run:');
            console.log('   node scripts/delete-non-admin-users.js --confirm');
            console.log('================================================================\n');
            await mongoose.disconnect();
            return;
        }

        // =====================================================================
        // LIVE EXECUTION: MANDATORY BACKUP STEP FIRST
        // =====================================================================
        console.log('📦 Step 1: Performing mandatory backup to backups/ folder...');
        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const backupPrefix = `${dateStr}_pre-delete`;

        const backupFiles = [
            { name: `${backupPrefix}-users.json`, data: nonAdminUsers },
            { name: `${backupPrefix}-orders.json`, data: nonAdminOrders },
            { name: `${backupPrefix}-invoices.json`, data: nonAdminInvoices },
            { name: `${backupPrefix}-purchases.json`, data: nonAdminPurchases },
            { name: `${backupPrefix}-commission-transactions.json`, data: nonAdminCommissionTx },
            { name: `${backupPrefix}-digital-purchases.json`, data: nonAdminDigitalPurchases },
            { name: `${backupPrefix}-points-transactions.json`, data: nonAdminPointsTx },
            { name: `${backupPrefix}-reading-sessions.json`, data: nonAdminReadingSessions },
            { name: `${backupPrefix}-password-reset-requests.json`, data: nonAdminPasswordResets },
            { name: `${backupPrefix}-admin-tree-states.json`, data: adminTreeUpdates }
        ];

        for (const b of backupFiles) {
            const filePath = path.join(backupDir, b.name);
            fs.writeFileSync(filePath, JSON.stringify(b.data, null, 2), 'utf8');
            console.log(`   💾 Saved: backups/${b.name} (${b.data.length} records)`);
        }
        console.log('✅ Mandatory backup completed successfully.\n');

        // =====================================================================
        // LIVE EXECUTION: STEP 2: TREE CLEANUP ON SURVIVING ADMINS
        // =====================================================================
        console.log('🌳 Step 2: Cleaning up tree references on surviving admins...');
        for (const update of adminTreeUpdates) {
            await User.updateOne(
                { _id: update.adminId },
                {
                    $set: {
                        treeParent: update.newParent,
                        treeChildren: update.newChildren
                    }
                }
            );
            console.log(`   ✅ Cleaned tree references on admin ${update.adminName} (${update.adminId})`);
        }
        if (adminTreeUpdates.length === 0) {
            console.log('   (No admin tree dangling references found.)');
        }
        console.log('');

        // =====================================================================
        // LIVE EXECUTION: STEP 3 & 4: CASCADE DELETE NON-ADMIN USERS
        // =====================================================================
        console.log('🗑️  Step 3: Cascading deletions for each non-admin user...');
        const { deleteUserCascade } = require('../utils/deleteUserCascade');

        let totalDeletedOrders = 0;
        let totalDeletedInvoices = 0;
        let totalDeletedPurchases = 0;
        let totalDeletedCommTx = 0;
        let totalDeletedDigitalPurchases = 0;
        let totalDeletedPoints = 0;
        let totalDeletedSessions = 0;
        let totalDeletedResets = 0;
        let totalDeletedUsers = 0;

        for (const u of nonAdminUsers) {
            const res = await deleteUserCascade(u._id);
            totalDeletedOrders += res.deletedCounts.orders;
            totalDeletedInvoices += res.deletedCounts.invoices;
            totalDeletedPurchases += res.deletedCounts.purchases;
            totalDeletedCommTx += res.deletedCounts.commissionTransactions;
            totalDeletedDigitalPurchases += res.deletedCounts.digitalPurchases;
            totalDeletedPoints += res.deletedCounts.pointsTransactions;
            totalDeletedSessions += res.deletedCounts.readingSessions;
            totalDeletedResets += res.deletedCounts.passwordResetRequests;
            totalDeletedUsers += res.deletedCounts.users;
            console.log(`   ✅ Cascade deleted user ${u.name || u.email} (${u._id})`);
        }

        console.log('\n--- Total Records Deleted Across All Users ---');
        console.log(` - Users Deleted                  : ${totalDeletedUsers}`);
        console.log(` - Orders Deleted                 : ${totalDeletedOrders}`);
        console.log(` - Invoices Deleted               : ${totalDeletedInvoices}`);
        console.log(` - Purchases Deleted              : ${totalDeletedPurchases}`);
        console.log(` - Commission Tx Deleted          : ${totalDeletedCommTx}`);
        console.log(` - Digital Purchases Deleted      : ${totalDeletedDigitalPurchases}`);
        console.log(` - Points Transactions Deleted    : ${totalDeletedPoints}`);
        console.log(` - Reading Sessions Deleted       : ${totalDeletedSessions}`);
        console.log(` - Password Reset Requests Deleted: ${totalDeletedResets}`);

        // =====================================================================
        // VERIFICATION & POST-CLEANUP SUMMARY
        // =====================================================================
        const remainingUsers = await User.find();
        const remainingOrders = await Order.find();
        const remainingInvoices = await Invoice.find();
        const remainingCommTx = await CommissionTransaction.find();
        const remainingPointsTx = await PointsTransaction.find();

        console.log('\n================================================================');
        console.log('            ✨ DELETION OPERATION COMPLETE                      ');
        console.log('================================================================');
        console.log('Surviving Database State:');
        console.log(` - Users remaining   : ${remainingUsers.length} (all role: admin)`);
        remainingUsers.forEach(u => console.log(`     * [${u.role}] ${u.name} (${u.email})`));
        console.log(` - Orders remaining  : ${remainingOrders.length} (all admin orders)`);
        console.log(` - Invoices remaining: ${remainingInvoices.length} (admin / manual invoices)`);
        console.log(` - Commission Tx     : ${remainingCommTx.length} (admin transactions)`);
        console.log(` - Points Tx         : ${remainingPointsTx.length} (admin points)`);
        console.log(` - Backups stored in : backups/`);
        console.log('================================================================\n');

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    } catch (error) {
        console.error('\n❌ An error occurred during script execution:', error);
        try {
            await mongoose.disconnect();
        } catch (e) {}
        process.exit(1);
    }
}

run();
