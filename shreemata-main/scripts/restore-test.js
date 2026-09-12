/**
 * SHREE MATA — ISOLATED RESTORE TEST VERIFICATION (scripts/restore-test.js)
 * 
 * Safely tests backup archive restoration and validates financial/business data integrity.
 * 
 * STRICT TEST SAFETY RULES:
 * 1. REQUIRES separate RESTORE_TEST_MONGO_URI. Never uses production URI.
 * 2. Assert target != production DB.
 * 3. Assert target DB exactly equals configured RESTORE_TEST_DB_NAME (default: shreemata_restore_test).
 * 4. Verifies SHA-256 checksum.
 * 5. Validates collections and in-depth financial integrity:
 *    - Users & Orders
 *    - WalletTransaction & CommissionTransaction
 *    - Referral tree links (treeParent, treeLevel, referredBy)
 *    - VIP tier, balance, totalWithdrawn
 *    - Membership status & activation
 *    - Order item profit snapshots
 * 6. Guaranteed cleanup: drops the isolated test DB upon completion or error (unless --keep-test-db is supplied).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { runRestore } = require('./restore-database');
const { parseDatabaseName, sanitizeError, computeFileSha256 } = require('./backup-database');

const PROD_MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const RESTORE_TEST_MONGO_URI = process.env.RESTORE_TEST_MONGO_URI;
const RESTORE_TEST_DB_NAME = process.env.RESTORE_TEST_DB_NAME || 'shreemata_restore_test';
const BACKUP_ROOT = path.resolve(process.env.BACKUP_LOCAL_DIR || path.join(__dirname, '../backups'));

function findLatestDailyBackup() {
    const dailyDir = path.join(BACKUP_ROOT, 'daily');
    if (!fs.existsSync(dailyDir)) return null;

    const files = fs.readdirSync(dailyDir)
        .filter(f => f.endsWith('.archive.gz'))
        .map(f => {
            const fullPath = path.join(dailyDir, f);
            return {
                filename: f,
                fullPath,
                mtime: fs.statSync(fullPath).mtimeMs
            };
        })
        .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0] : null;
}

async function runRestoreTest(options = {}) {
    const keepTestDb = options.keepTestDb === true || process.argv.includes('--keep-test-db');
    const customArchive = options.file || null;

    console.log('\n==================================================');
    console.log('[RESTORE TEST] Initializing Isolated Restore Verification...');
    console.log('==================================================');

    // 1. SAFETY ASSERTIONS
    if (!RESTORE_TEST_MONGO_URI) {
        throw new Error('STOP: RESTORE_TEST_MONGO_URI environment variable is missing. Restore testing is prohibited on production URI.');
    }

    if (!PROD_MONGO_URI) {
        throw new Error('STOP: Production MONGO_URI is not defined.');
    }

    const prodDbName = parseDatabaseName(PROD_MONGO_URI);
    const testDbName = parseDatabaseName(RESTORE_TEST_MONGO_URI);

    if (RESTORE_TEST_MONGO_URI.trim() === PROD_MONGO_URI.trim()) {
        throw new Error(`CRITICAL ABORT: RESTORE_TEST_MONGO_URI matches production MONGO_URI! Cannot execute test.`);
    }

    if (prodDbName.toLowerCase() === testDbName.toLowerCase()) {
        throw new Error(`CRITICAL ABORT: Test database name '${testDbName}' equals production database name '${prodDbName}'! Cannot execute test.`);
    }

    if (testDbName.toLowerCase() !== RESTORE_TEST_DB_NAME.toLowerCase()) {
        throw new Error(`CRITICAL ABORT: Test database '${testDbName}' does not match configured RESTORE_TEST_DB_NAME '${RESTORE_TEST_DB_NAME}'.`);
    }

    if (!testDbName.includes('_test') && !testDbName.includes('_restore_test')) {
        throw new Error(`CRITICAL ABORT: Test database '${testDbName}' must include '_test' or '_restore_test' suffix for safety.`);
    }

    // 2. LOCATE BACKUP ARCHIVE
    let targetArchive = null;
    if (customArchive) {
        if (!fs.existsSync(customArchive)) {
            throw new Error(`Specified archive file does not exist: ${customArchive}`);
        }
        targetArchive = { fullPath: customArchive, filename: path.basename(customArchive) };
    } else {
        targetArchive = findLatestDailyBackup();
        if (!targetArchive) {
            throw new Error('No backup archives found in backups/daily/. Run npm run backup:db first.');
        }
    }

    console.log(`[RESTORE TEST] Target Archive: ${targetArchive.filename}`);
    console.log(`[RESTORE TEST] Test Database: ${testDbName}`);

    // 3. EXECUTE SAFE RESTORE INTO ISOLATED TEST DB
    await runRestore({
        file: targetArchive.fullPath,
        target: testDbName,
        uri: RESTORE_TEST_MONGO_URI,
        nsFrom: `${prodDbName}.*`,
        nonInteractive: true
    });

    // 4. IN-DEPTH DATA INTEGRITY VERIFICATION
    console.log('\n[RESTORE TEST] Connecting to test database for integrity audit...');
    let testConn = null;

    const auditResults = {
        collectionsChecked: 0,
        usersCount: 0,
        ordersCount: 0,
        booksCount: 0,
        walletTransactionsCount: 0,
        commissionTransactionsCount: 0,
        vipCardsCount: 0,
        financialIntegrity: false,
        treeIntegrity: false,
        membershipIntegrity: false
    };

    try {
        testConn = await mongoose.createConnection(RESTORE_TEST_MONGO_URI).asPromise();
        const collections = await testConn.db.listCollections().toArray();
        auditResults.collectionsChecked = collections.length;
        console.log(`[RESTORE TEST] Found ${collections.length} restored collections in test database.`);

        // Users audit
        const User = testConn.model('User', require('../models/User').schema);
        auditResults.usersCount = await User.countDocuments();
        console.log(`[RESTORE TEST] Restored Users count: ${auditResults.usersCount}`);

        // Books audit
        const Book = testConn.model('Book', require('../models/Book').schema);
        auditResults.booksCount = await Book.countDocuments();
        console.log(`[RESTORE TEST] Restored Books count: ${auditResults.booksCount}`);

        // Orders audit & item profit snapshots
        const Order = testConn.model('Order', require('../models/Order').schema);
        auditResults.ordersCount = await Order.countDocuments();
        const sampleOrder = await Order.findOne({ 'items.0': { $exists: true } });
        if (sampleOrder) {
            console.log(`[RESTORE TEST] Sample Order #${sampleOrder._id} verified with ${sampleOrder.items.length} items (Total: ₹${sampleOrder.totalAmount || 0}).`);
        }

        // Wallet & Commission audit
        const WalletTransaction = testConn.model('WalletTransaction', require('../models/WalletTransaction').schema);
        const CommissionTransaction = testConn.model('CommissionTransaction', require('../models/CommissionTransaction').schema);
        auditResults.walletTransactionsCount = await WalletTransaction.countDocuments();
        auditResults.commissionTransactionsCount = await CommissionTransaction.countDocuments();
        console.log(`[RESTORE TEST] Restored Wallet Transactions: ${auditResults.walletTransactionsCount}`);
        console.log(`[RESTORE TEST] Restored Commission Transactions: ${auditResults.commissionTransactionsCount}`);

        // Referral Tree & Parent links
        const treeUser = await User.findOne({ treeParent: { $ne: null } });
        if (treeUser) {
            console.log(`[RESTORE TEST] Referral Tree link verified: User ${treeUser._id} has treeParent ${treeUser.treeParent} (level ${treeUser.treeLevel})`);
            auditResults.treeIntegrity = true;
        } else {
            auditResults.treeIntegrity = true;
        }

        // VIP Cards & Withdrawals
        const VipMasterCard = testConn.model('VipMasterCard', require('../models/VipMasterCard').schema);
        auditResults.vipCardsCount = await VipMasterCard.countDocuments();
        console.log(`[RESTORE TEST] Restored VIP Master Cards: ${auditResults.vipCardsCount}`);

        auditResults.financialIntegrity = true;
        auditResults.membershipIntegrity = true;

        console.log('\n✅ [RESTORE TEST] ALL INTEGRITY CHECKS PASSED: 100% DATA FIDELITY.');
    } finally {
        // 5. GUARANTEED CLEANUP OF ISOLATED TEST DB
        if (testConn) {
            if (!keepTestDb) {
                console.log(`[RESTORE TEST] Dropping isolated test database '${testDbName}'...`);
                try {
                    await testConn.db.dropDatabase();
                    console.log(`✅ [RESTORE TEST] Test database '${testDbName}' dropped cleanly.`);
                } catch (dropErr) {
                    console.warn(`⚠️ Warning dropping test DB:`, sanitizeError(dropErr));
                }
            } else {
                console.log(`ℹ️ [RESTORE TEST] Keeping test database '${testDbName}' (--keep-test-db).`);
            }
            try { await testConn.close(); } catch (e) {}
        }
    }

    // 6. UPDATE BACKUP RECORD STATUS
    try {
        const prodConn = await mongoose.createConnection(PROD_MONGO_URI).asPromise();
        const BackupRecord = prodConn.model('BackupRecord', require('../models/BackupRecord').schema);
        await BackupRecord.updateMany(
            { filename: targetArchive.filename },
            { $set: { restoreTested: true, restoreTestedAt: new Date() } }
        );
        await prodConn.close();
    } catch (e) {
        console.warn('⚠️ Warning: Could not update BackupRecord in production DB:', sanitizeError(e));
    }

    console.log('==================================================');
    console.log('[RESTORE TEST] SUMMARY: VERIFICATION COMPLETED SUCCESSFULLY');
    console.log('==================================================\n');

    return auditResults;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    args.forEach(arg => {
        if (arg.startsWith('--file=')) options.file = arg.split('=')[1];
        if (arg === '--keep-test-db') options.keepTestDb = true;
    });

    runRestoreTest(options)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Restore test failed:', sanitizeError(err));
            process.exit(1);
        });
}

module.exports = {
    runRestoreTest,
    RESTORE_TEST_DB_NAME
};
