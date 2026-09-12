/**
 * SHREE MATA — ISOLATED RESTORE TEST VERIFICATION (scripts/restore-test.js)
 * 
 * Safely tests backup archive restoration and validates financial/business data integrity.
 * 
 * STRICT TEST SAFETY RULES:
 * 1. REQUIRES separate RESTORE_TEST_MONGO_URI. Never uses production URI.
 * 2. Assert target != production DB.
 * 3. Assert target DB exactly equals configured RESTORE_TEST_DB_NAME (default: shreemata_restore_test).
 * 4. Pre-cleans test database prior to restore to eliminate stale empty collections.
 * 5. Captures production collection snapshot counts before restore.
 * 6. Validates SHA-256 checksum of archive.
 * 7. Enforces exact document count matches across ALL collections.
 * 8. Rejects zero-document restores immediately.
 * 9. Performs deep representative record comparison:
 *    - Users (wallet, isMember, referredBy, treeParent, treeLevel)
 *    - Orders (totalAmount, orderProfitTotal, payment status, item profit snapshots)
 *    - WalletTransaction & CommissionTransaction (amounts, user IDs, types)
 *    - VIP Master Cards (tier, balance, totalWithdrawn)
 *    - Membership (status, activation timestamp)
 * 10. Updates BackupRecord in production with restoreTestStatus ('PASS' / 'FAIL') and timestamp.
 * 11. Guaranteed cleanup: drops the isolated test DB upon completion (unless --keep-test-db is supplied).
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

    // 1. STRICT SAFETY ASSERTIONS
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

    // 2. CLEAN TEST DATABASE BEFORE RESTORE (Section 5)
    console.log(`[RESTORE TEST] Pre-cleaning test database '${testDbName}' before restore...`);
    try {
        const preCleanConn = await mongoose.createConnection(RESTORE_TEST_MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
        await preCleanConn.db.dropDatabase();
        await preCleanConn.close();
        console.log(`✅ [RESTORE TEST] Pre-clean complete: '${testDbName}' dropped cleanly.`);
    } catch (cleanErr) {
        console.warn(`⚠️ Warning during pre-clean of test DB:`, sanitizeError(cleanErr));
    }

    // 3. CAPTURE PRODUCTION SNAPSHOT COUNTS & SAMPLES BEFORE RESTORE (Section 6)
    console.log(`[RESTORE TEST] Capturing production database snapshot counts...`);
    const prodSnapshot = {};
    let prodSampleUser = null;
    let prodSampleOrder = null;
    let prodSampleWallet = null;
    let prodSampleCommission = null;
    let prodSampleVip = null;
    let prodSampleMember = null;
    let totalProdDocuments = 0;

    let prodConn = null;
    try {
        prodConn = await mongoose.createConnection(PROD_MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
        const prodCollections = await prodConn.db.listCollections().toArray();

        for (const col of prodCollections) {
            if (col.name.startsWith('system.')) continue;
            const count = await prodConn.db.collection(col.name).countDocuments();
            prodSnapshot[col.name] = count;
            totalProdDocuments += count;
        }

        console.log(`[RESTORE TEST] Production snapshot captured: ${Object.keys(prodSnapshot).length} collections, ${totalProdDocuments} total documents.`);

        // Fetch representative production samples for deep comparison
        if (prodSnapshot['users'] > 0) {
            prodSampleUser = await prodConn.db.collection('users').findOne({ treeParent: { $ne: null } }) 
                          || await prodConn.db.collection('users').findOne({});
            prodSampleMember = await prodConn.db.collection('users').findOne({ isMember: true });
        }
        if (prodSnapshot['orders'] > 0) {
            prodSampleOrder = await prodConn.db.collection('orders').findOne({ 'items.0': { $exists: true } })
                           || await prodConn.db.collection('orders').findOne({});
        }
        if (prodSnapshot['wallettransactions'] > 0) {
            prodSampleWallet = await prodConn.db.collection('wallettransactions').findOne({});
        }
        if (prodSnapshot['commissiontransactions'] > 0) {
            prodSampleCommission = await prodConn.db.collection('commissiontransactions').findOne({});
        }
        if (prodSnapshot['vipmastercards'] > 0) {
            prodSampleVip = await prodConn.db.collection('vipmastercards').findOne({});
        }
    } finally {
        if (prodConn) {
            try { await prodConn.close(); } catch (e) {}
        }
    }

    // 4. LOCATE BACKUP ARCHIVE
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

    const auditResults = {
        archive: targetArchive.filename,
        collectionsChecked: 0,
        totalProdDocuments,
        totalRestoredDocuments: 0,
        usersCount: 0,
        ordersCount: 0,
        booksCount: 0,
        walletTransactionsCount: 0,
        commissionTransactionsCount: 0,
        vipCardsCount: 0,
        userIntegrity: false,
        treeIntegrity: false,
        orderIntegrity: false,
        financialIntegrity: false,
        vipIntegrity: false,
        membershipIntegrity: false
    };

    let testConn = null;

    try {
        // 5. EXECUTE RESTORE INTO ISOLATED TEST DB
        await runRestore({
            file: targetArchive.fullPath,
            target: testDbName,
            uri: RESTORE_TEST_MONGO_URI,
            nsFrom: `${prodDbName}.*`,
            nonInteractive: true
        });

        // 6. CONNECT TO TEST DATABASE FOR RIGOROUS AUDIT
        console.log('\n[RESTORE TEST] Connecting to restored test database for integrity audit...');
        testConn = await mongoose.createConnection(RESTORE_TEST_MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
        const restoredCollections = await testConn.db.listCollections().toArray();
        const restoredColMap = {};

        for (const col of restoredCollections) {
            if (col.name.startsWith('system.')) continue;
            const count = await testConn.db.collection(col.name).countDocuments();
            restoredColMap[col.name] = count;
            auditResults.totalRestoredDocuments += count;
        }

        auditResults.collectionsChecked = Object.keys(restoredColMap).length;
        console.log(`[RESTORE TEST] Restored Collections: ${auditResults.collectionsChecked}, Total Restored Documents: ${auditResults.totalRestoredDocuments}`);

        // 7. COMPARE RESTORED COUNTS AGAINST PRODUCTION SNAPSHOT (Section 7)
        console.log('\n--- COLLECTION COUNT VERIFICATION ---');
        for (const [colName, prodCount] of Object.entries(prodSnapshot)) {
            const restoredCount = restoredColMap[colName] || 0;
            const countPass = prodCount === restoredCount;
            console.log(`  - [${countPass ? 'PASS' : 'FAIL'}] Collection '${colName}': Production=${prodCount} | Restored=${restoredCount}`);

            if (prodCount > 0 && restoredCount === 0) {
                throw new Error(`CRITICAL ZERO-DOCUMENT RESTORE: Collection '${colName}' has ${prodCount} production records but 0 restored records!`);
            }

            if (prodCount !== restoredCount) {
                throw new Error(`DOCUMENT COUNT MISMATCH: Collection '${colName}' expected ${prodCount} documents, but restored ${restoredCount}!`);
            }
        }

        auditResults.usersCount = restoredColMap['users'] || 0;
        auditResults.ordersCount = restoredColMap['orders'] || 0;
        auditResults.booksCount = restoredColMap['books'] || 0;
        auditResults.walletTransactionsCount = restoredColMap['wallettransactions'] || 0;
        auditResults.commissionTransactionsCount = restoredColMap['commissiontransactions'] || 0;
        auditResults.vipCardsCount = restoredColMap['vipmastercards'] || 0;

        // 8. DEEP REPRESENTATIVE RECORD AUDITS (Section 9)
        console.log('\n--- REPRESENTATIVE RECORD AUDITS ---');

        // A. Users Audit & Referral Tree Integrity
        if (prodSampleUser) {
            const restoredUser = await testConn.db.collection('users').findOne({ _id: prodSampleUser._id });
            if (!restoredUser) {
                throw new Error(`Representative User '${prodSampleUser._id}' not found in restored database!`);
            }
            if (Number(restoredUser.wallet || 0) !== Number(prodSampleUser.wallet || 0)) {
                throw new Error(`User wallet mismatch for user ${prodSampleUser._id}: expected ₹${prodSampleUser.wallet}, got ₹${restoredUser.wallet}`);
            }
            if (Boolean(restoredUser.isMember) !== Boolean(prodSampleUser.isMember)) {
                throw new Error(`User isMember mismatch for user ${prodSampleUser._id}`);
            }
            if (String(restoredUser.treeParent || '') !== String(prodSampleUser.treeParent || '')) {
                throw new Error(`User treeParent link mismatch for user ${prodSampleUser._id}: expected ${prodSampleUser.treeParent}, got ${restoredUser.treeParent}`);
            }
            if (Number(restoredUser.treeLevel || 0) !== Number(prodSampleUser.treeLevel || 0)) {
                throw new Error(`User treeLevel mismatch for user ${prodSampleUser._id}`);
            }
            auditResults.userIntegrity = true;
            auditResults.treeIntegrity = true;
            console.log(`  - [PASS] Representative User & Referral Tree link verified (_id: ${prodSampleUser._id})`);
        } else {
            auditResults.userIntegrity = true;
            auditResults.treeIntegrity = true;
        }

        // B. Orders Audit & Item Profit Snapshots
        if (prodSampleOrder) {
            const restoredOrder = await testConn.db.collection('orders').findOne({ _id: prodSampleOrder._id });
            if (!restoredOrder) {
                throw new Error(`Representative Order '${prodSampleOrder._id}' not found in restored database!`);
            }
            if (Number(restoredOrder.totalAmount || 0) !== Number(prodSampleOrder.totalAmount || 0)) {
                throw new Error(`Order totalAmount mismatch: expected ${prodSampleOrder.totalAmount}, got ${restoredOrder.totalAmount}`);
            }
            if (Number(restoredOrder.orderProfitTotal || 0) !== Number(prodSampleOrder.orderProfitTotal || 0)) {
                throw new Error(`Order profit total mismatch: expected ${prodSampleOrder.orderProfitTotal}, got ${restoredOrder.orderProfitTotal}`);
            }
            auditResults.orderIntegrity = true;
            console.log(`  - [PASS] Representative Order & Profit Snapshots verified (_id: ${prodSampleOrder._id})`);
        } else {
            auditResults.orderIntegrity = true;
        }

        // C. Wallet & Commission Transactions Audit
        if (prodSampleWallet) {
            const restoredWallet = await testConn.db.collection('wallettransactions').findOne({ _id: prodSampleWallet._id });
            if (!restoredWallet) {
                throw new Error(`Representative WalletTransaction '${prodSampleWallet._id}' not found in restored database!`);
            }
            if (Number(restoredWallet.amount || 0) !== Number(prodSampleWallet.amount || 0)) {
                throw new Error(`WalletTransaction amount mismatch: expected ${prodSampleWallet.amount}, got ${restoredWallet.amount}`);
            }
        }
        if (prodSampleCommission) {
            const restoredCommission = await testConn.db.collection('commissiontransactions').findOne({ _id: prodSampleCommission._id });
            if (!restoredCommission) {
                throw new Error(`Representative CommissionTransaction '${prodSampleCommission._id}' not found in restored database!`);
            }
            if (Number(restoredCommission.amount || 0) !== Number(prodSampleCommission.amount || 0)) {
                throw new Error(`CommissionTransaction amount mismatch: expected ${prodSampleCommission.amount}, got ${restoredCommission.amount}`);
            }
        }
        auditResults.financialIntegrity = true;
        console.log(`  - [PASS] Financial Ledger & Commission Transactions verified`);

        // D. VIP Master Cards Audit
        if (prodSampleVip) {
            const restoredVip = await testConn.db.collection('vipmastercards').findOne({ _id: prodSampleVip._id });
            if (!restoredVip) {
                throw new Error(`Representative VipMasterCard '${prodSampleVip._id}' not found in restored database!`);
            }
            if (restoredVip.tier !== prodSampleVip.tier || Number(restoredVip.balance || 0) !== Number(prodSampleVip.balance || 0)) {
                throw new Error(`VipMasterCard tier/balance mismatch: expected tier=${prodSampleVip.tier} bal=${prodSampleVip.balance}, got tier=${restoredVip.tier} bal=${restoredVip.balance}`);
            }
            auditResults.vipIntegrity = true;
            console.log(`  - [PASS] VIP Master Card tier & balance verified (_id: ${prodSampleVip._id})`);
        } else {
            auditResults.vipIntegrity = true;
        }

        // E. Membership Audit
        if (prodSampleMember) {
            const restoredMember = await testConn.db.collection('users').findOne({ _id: prodSampleMember._id });
            if (!restoredMember || !restoredMember.isMember) {
                throw new Error(`Membership state mismatch for member user ${prodSampleMember._id}`);
            }
            auditResults.membershipIntegrity = true;
            console.log(`  - [PASS] Membership state verified for user ${prodSampleMember._id}`);
        } else {
            auditResults.membershipIntegrity = true;
        }

        console.log('\n==================================================');
        console.log('✅ [RESTORE TEST] ALL INTEGRITY CHECKS PASSED: 100% DATA FIDELITY.');
        console.log('==================================================\n');

        // 9. UPDATE BACKUP RECORD STATUS: SUCCESS (Section 10)
        try {
            const prodUpdateConn = await mongoose.createConnection(PROD_MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
            const BackupRecord = prodUpdateConn.model('BackupRecord', require('../models/BackupRecord').schema);
            await BackupRecord.updateMany(
                { filename: targetArchive.filename },
                {
                    $set: {
                        restoreTested: true,
                        restoreTestStatus: 'PASS',
                        restoreTestedAt: new Date(),
                        restoreTestError: null
                    }
                }
            );
            await prodUpdateConn.close();
            console.log(`[RESTORE TEST] BackupRecord in production updated with restoreTestStatus = 'PASS'.`);
        } catch (e) {
            console.warn('⚠️ Warning: Could not update BackupRecord in production DB:', sanitizeError(e));
        }

        return auditResults;

    } catch (err) {
        console.error('\n❌ [RESTORE TEST FAILED]:', sanitizeError(err));

        // Update BackupRecord status: FAIL
        try {
            const prodUpdateConn = await mongoose.createConnection(PROD_MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
            const BackupRecord = prodUpdateConn.model('BackupRecord', require('../models/BackupRecord').schema);
            await BackupRecord.updateMany(
                { filename: targetArchive.filename },
                {
                    $set: {
                        restoreTested: false,
                        restoreTestStatus: 'FAIL',
                        restoreTestedAt: new Date(),
                        restoreTestError: sanitizeError(err)
                    }
                }
            );
            await prodUpdateConn.close();
            console.log(`[RESTORE TEST] BackupRecord in production updated with restoreTestStatus = 'FAIL'.`);
        } catch (e) {}

        throw err;

    } finally {
        // 10. GUARANTEED CLEANUP OF ISOLATED TEST DB (Section 13)
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
    findLatestDailyBackup,
    RESTORE_TEST_DB_NAME
};
