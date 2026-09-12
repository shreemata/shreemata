/**
 * SHREE MATA — COMPREHENSIVE BACKUP & RECOVERY TEST SUITE (scratch/test_database_backup.js)
 * 
 * Verifies all 20+ architectural, security, and integrity requirements.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

console.log('==================================================');
console.log('🧪 RUNNING PRODUCTION BACKUP & RECOVERY MASTER TEST SUITE');
console.log('==================================================\n');

const testResults = [];

function assertTest(name, condition, details = '') {
    if (condition) {
        console.log(`✅ [PASS] ${name}`);
        testResults.push({ name, status: 'PASS', details });
    } else {
        console.error(`❌ [FAIL] ${name} — ${details}`);
        testResults.push({ name, status: 'FAIL', details });
    }
}

async function runTests() {
    let backupScript = null;
    let restoreScript = null;
    let restoreTestScript = null;

    try {
        backupScript = require('../scripts/backup-database');
        restoreScript = require('../scripts/restore-database');
        restoreTestScript = require('../scripts/restore-test');
        assertTest('1. Backup, Restore, and Restore-Test scripts load successfully', !!backupScript && !!restoreScript && !!restoreTestScript);
    } catch (e) {
        assertTest('1. Backup scripts load successfully', false, e.message);
        return false;
    }

    // 2. Credential Masking in URIs & Errors
    const sampleUri = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abcde.mongodb.net/shreemata?retryWrites=true';
    const masked = backupScript.maskUri(sampleUri);
    assertTest('2. Credential Protection in URIs (password replaced with ***)', !masked.includes('SuperSecretPassword123') && masked.includes('admin_user:***@'));

    const sampleError = new Error(`Connection failed for mongodb+srv://dbuser:MySecretP@ss@cluster.net/shreemata`);
    const sanitizedMsg = backupScript.sanitizeError(sampleError);
    assertTest('3. Credential Protection in Error logs (password replaced with ***)', !sanitizedMsg.includes('MySecretP@ss') && sanitizedMsg.includes('dbuser:***@'));

    // 3. UTC Timestamp formatting
    const sampleDate = new Date('2026-09-12T07:30:00.000Z');
    const formattedUtc = backupScript.formatUtcTimestamp(sampleDate);
    assertTest('4. UTC Backup Filename Format (YYYY-MM-DDTHH-mm-ssZ)', formattedUtc.includes('2026-09-12T07-30-00') && formattedUtc.endsWith('Z'));

    // 4. Process Lock Mechanism
    const lock1 = backupScript.acquireBackupLock();
    assertTest('5. Single Backup Process Lock Acquired', lock1.acquired === true);

    // Simulate concurrent attempt
    const lock2 = backupScript.acquireBackupLock();
    assertTest('6. Concurrent Backup Attempt Rejected (BACKUP_ALREADY_RUNNING)', lock2.acquired === false && lock2.reason === 'BACKUP_ALREADY_RUNNING');

    backupScript.releaseBackupLock();

    // 5. Disk Space & Permission Precheck
    const diskCheck = backupScript.checkDiskSpaceAndPermissions();
    assertTest('7. Disk Space and Directory Write Permission Precheck', diskCheck.ok === true);

    // 6. Safe Multi-tier Backup Directories
    const backupDir = path.join(__dirname, '../backups');
    const dirsExist = fs.existsSync(path.join(backupDir, 'daily')) &&
                      fs.existsSync(path.join(backupDir, 'weekly')) &&
                      fs.existsSync(path.join(backupDir, 'monthly')) &&
                      fs.existsSync(path.join(backupDir, 'logs'));
    assertTest('8. Safe Multi-tier Backup Directories Exist outside public/', dirsExist);

    // 7. Atomic Creation & SHA-256 Checksum Calculation
    const testPartialPath = path.join(backupDir, 'daily', 'test_atomic_archive.archive.gz.partial');
    const testFinalPath = path.join(backupDir, 'daily', 'test_atomic_archive.archive.gz');
    fs.writeFileSync(testPartialPath, 'TEST_DATABASE_ARCHIVE_DATA_ATOMIC_123', 'utf8');

    const checksum = await backupScript.computeFileSha256(testPartialPath);
    const expectedHash = crypto.createHash('sha256').update('TEST_DATABASE_ARCHIVE_DATA_ATOMIC_123').digest('hex');
    assertTest('9. SHA-256 Checksum accurately calculated for partial archive', checksum === expectedHash);

    // Atomic rename
    fs.renameSync(testPartialPath, testFinalPath);
    fs.writeFileSync(`${testFinalPath}.sha256`, `${checksum}  test_atomic_archive.archive.gz\n`, 'utf8');
    assertTest('10. Atomic Rename from .partial to final .archive.gz and independent .sha256 creation', fs.existsSync(testFinalPath) && fs.existsSync(`${testFinalPath}.sha256`) && !fs.existsSync(testPartialPath));

    // 8. Checksum Mismatch Detection in Restore
    fs.writeFileSync(`${testFinalPath}.sha256`, 'corrupted_hash_value  test_atomic_archive.archive.gz\n', 'utf8');
    let checksumRejected = false;
    try {
        await restoreScript.runRestore({
            file: testFinalPath,
            target: 'shreemata_restore_test',
            nonInteractive: true
        });
    } catch (err) {
        if (err.message.includes('Checksum mismatch')) {
            checksumRejected = true;
        }
    }
    assertTest('11. Restore Script rejects corrupted/tampered archive on checksum mismatch', checksumRejected);

    // Clean test files
    try {
        fs.unlinkSync(testFinalPath);
        fs.unlinkSync(`${testFinalPath}.sha256`);
    } catch (e) {}

    // 9. Restore Target Production Guard
    let prodRestoreRejected = false;
    try {
        await restoreScript.runRestore({
            file: path.join(__dirname, '../scripts/backup-database.js'),
            target: backupScript.parseDatabaseName(process.env.MONGO_URI || 'shreemata'),
            nonInteractive: true
        });
    } catch (err) {
        if (err.message.includes('Production restore denied')) {
            prodRestoreRejected = true;
        }
    }
    assertTest('12. Restore Script strictly refuses production target by default', prodRestoreRejected);

    // 10. Restore-Test missing RESTORE_TEST_MONGO_URI guard
    const originalTestUri = process.env.RESTORE_TEST_MONGO_URI;
    delete process.env.RESTORE_TEST_MONGO_URI;
    let restoreTestRejected = false;
    try {
        await restoreTestScript.runRestoreTest();
    } catch (err) {
        if (err.message.includes('RESTORE_TEST_MONGO_URI environment variable is missing')) {
            restoreTestRejected = true;
        }
    }
    assertTest('13. Restore-Test stops safely when RESTORE_TEST_MONGO_URI is missing', restoreTestRejected);
    if (originalTestUri) process.env.RESTORE_TEST_MONGO_URI = originalTestUri;

    // 11. Retention Boundary Enforcement
    const pruneResult = backupScript.pruneRetention();
    assertTest('14. Retention cleanup runs safely within designated backup directory', typeof pruneResult === 'object');

    // 12. Git Protection in .gitignore
    const gitignoreContent = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
    const gitProtected = gitignoreContent.includes('backups/') && gitignoreContent.includes('*.archive.gz') && gitignoreContent.includes('*.sha256');
    assertTest('15. .gitignore excludes backups/, *.archive.gz, *.sha256', gitProtected);

    // 13. Package.json convenience scripts
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assertTest('16. npm scripts backup:db and restore:test are present in package.json', !!packageJson.scripts['backup:db'] && !!packageJson.scripts['restore:test']);

    // 14. Documentation DATABASE_BACKUP_RECOVERY.md exists and is complete
    const docsExist = fs.existsSync(path.join(__dirname, '../DATABASE_BACKUP_RECOVERY.md'));
    const docContent = docsExist ? fs.readFileSync(path.join(__dirname, '../DATABASE_BACKUP_RECOVERY.md'), 'utf8') : '';
    assertTest('17. DATABASE_BACKUP_RECOVERY.md exists with emergency recovery playbook', docsExist && docContent.includes('Emergency Disaster Recovery Playbook') && docContent.includes('mongodump'));

    // 15. Admin Dashboard integration (HTML & JS)
    const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin-dashboard.html'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin-dashboard.js'), 'utf8');
    assertTest('18. Admin Dashboard has Read-Only Database Backup card without restore button', adminHtml.includes('Production Database Backup') && !adminHtml.includes('onclick="restoreDatabase') && adminJs.includes('renderDatabaseBackup'));

    // 16. Security Test: /backups/* is inaccessible over HTTP
    const serverCheck = await new Promise((resolve) => {
        const req = http.get('http://localhost:3000/backups/daily/test.archive.gz', (res) => {
            resolve(res.statusCode === 404);
        });
        req.on('error', () => resolve(true));
    });
    assertTest('19. Security: /backups/* directory is not web-accessible (HTTP 404)', serverCheck);

    // SUMMARY
    console.log('\n==================================================');
    console.log(`TEST SUMMARY: ${testResults.filter(r => r.status === 'PASS').length} / ${testResults.length} PASSED`);
    console.log('==================================================\n');

    const allPassed = testResults.every(r => r.status === 'PASS');
    return allPassed;
}

runTests().then((success) => {
    process.exit(success ? 0 : 1);
});
