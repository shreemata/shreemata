/**
 * SHREE MATA — PRODUCTION DATABASE BACKUP ENGINE (scripts/backup-database.js)
 * 
 * Secure, automated, compressed database backup utility using mongodump.
 * Features:
 * - Single process locking (prevents concurrent backup collisions)
 * - Disk space and write permission precheck
 * - Atomic backup creation via .partial staging and atomic rename
 * - UTC timestamped filenames (YYYY-MM-DDTHH-mm-ssZ)
 * - Credential masking in all outputs and logs
 * - Multi-tier directory structure (daily, weekly, monthly, logs)
 * - Independent SHA-256 checksum generation (.sha256 files)
 * - Retention promotion (single-dump architecture)
 * - Boundary-enforced retention pruning with safety guards
 * - S3 off-server upload (archive + checksum) with SSE-S3 AES256
 * - Dual logging (MongoDB BackupRecord + persistent filesystem JSONL/log)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

// 1. CONFIGURATION & ENVIRONMENT
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const BACKUP_ENABLED = process.env.BACKUP_ENABLED !== 'false';
const BACKUP_ROOT = path.resolve(process.env.BACKUP_LOCAL_DIR || path.join(__dirname, '../backups'));
const MONGODUMP_BIN = process.env.MONGODUMP_PATH || 'mongodump';
const AWS_CLI_BIN = process.env.AWS_CLI_PATH || 'aws';
const LOCK_FILE_PATH = path.join(BACKUP_ROOT, '.backup.lock');

// Retention configuration (days / weeks / months)
const RETENTION_DAILY_DAYS = parseInt(process.env.BACKUP_DAILY_RETENTION_DAYS || '7', 10);
const RETENTION_WEEKLY_WEEKS = parseInt(process.env.BACKUP_WEEKLY_RETENTION_WEEKS || '4', 10);
const RETENTION_MONTHLY_MONTHS = parseInt(process.env.BACKUP_MONTHLY_RETENTION_MONTHS || '6', 10);

// S3 Configuration
const S3_ENABLED = process.env.BACKUP_S3_ENABLED === 'true' || process.env.BACKUP_S3_ENABLED === '1';
const S3_BUCKET = process.env.BACKUP_S3_BUCKET || 'shreemata-production-backups-2026';
const S3_REGION = process.env.BACKUP_S3_REGION || process.env.AWS_REGION || 'ap-south-1';

// 2. HELPER FUNCTIONS
function maskUri(uri) {
    if (!uri) return 'undefined';
    try {
        return uri.replace(/\/\/(.*):(.*)@/, '//$1:***@');
    } catch (e) {
        return '***REDACTED***';
    }
}

function sanitizeError(err) {
    if (!err) return 'Unknown error';
    const msg = typeof err === 'string' ? err : (err.message || String(err));
    return msg.replace(/\/\/(.*):(.*)@/g, '//$1:***@')
              .replace(/(AWS_SECRET_ACCESS_KEY|password)=[^&\s]+/gi, '$1=***');
}

function parseDatabaseName(uri) {
    if (!uri) return 'shreemata';
    try {
        const withoutQuery = uri.split('?')[0];
        const parts = withoutQuery.split('/');
        const dbName = parts[parts.length - 1];
        return dbName && dbName.trim().length > 0 ? dbName : 'shreemata';
    } catch (e) {
        return 'shreemata';
    }
}

function formatUtcTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
}

function computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

function ensureDirectories() {
    const dirs = [
        BACKUP_ROOT,
        path.join(BACKUP_ROOT, 'daily'),
        path.join(BACKUP_ROOT, 'weekly'),
        path.join(BACKUP_ROOT, 'monthly'),
        path.join(BACKUP_ROOT, 'logs')
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
    }
}

// Single Process Lock Handling
function acquireBackupLock() {
    ensureDirectories();
    if (fs.existsSync(LOCK_FILE_PATH)) {
        try {
            const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'));
            const lockAgeMs = Date.now() - new Date(lockData.startedAt).getTime();
            let isProcessRunning = false;

            if (lockData.pid) {
                try {
                    process.kill(lockData.pid, 0); // Check if PID exists
                    isProcessRunning = true;
                } catch (e) {
                    isProcessRunning = false;
                }
            }

            // Stale lock detection (PID dead or lock older than 4 hours)
            if (isProcessRunning && lockAgeMs < 4 * 60 * 60 * 1000) {
                return {
                    acquired: false,
                    reason: 'BACKUP_ALREADY_RUNNING',
                    pid: lockData.pid,
                    startedAt: lockData.startedAt
                };
            } else {
                console.warn(`⚠️ Warning: Removing stale backup lock file (PID ${lockData.pid}, age ${(lockAgeMs / 60000).toFixed(1)} mins).`);
                fs.unlinkSync(LOCK_FILE_PATH);
            }
        } catch (err) {
            try { fs.unlinkSync(LOCK_FILE_PATH); } catch (e) {}
        }
    }

    const newLock = {
        pid: process.pid,
        startedAt: new Date().toISOString()
    };
    fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(newLock), { mode: 0o600 });
    return { acquired: true };
}

function releaseBackupLock() {
    try {
        if (fs.existsSync(LOCK_FILE_PATH)) {
            const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'));
            if (lockData.pid === process.pid) {
                fs.unlinkSync(LOCK_FILE_PATH);
            }
        }
    } catch (e) {}
}

// Disk Space & Permissions Precheck
function checkDiskSpaceAndPermissions() {
    try {
        fs.accessSync(BACKUP_ROOT, fs.constants.W_OK);
    } catch (err) {
        return { ok: false, error: `Backup root directory is not writable: ${BACKUP_ROOT}` };
    }

    // Check available disk space via fs.statfsSync if available
    try {
        if (typeof fs.statfsSync === 'function') {
            const stats = fs.statfsSync(BACKUP_ROOT);
            const freeBytes = stats.bavail * stats.bsize;
            const minRequiredBytes = 250 * 1024 * 1024; // 250 MB minimum headroom

            if (freeBytes < minRequiredBytes) {
                return {
                    ok: false,
                    error: `Insufficient disk space: ${(freeBytes / (1024 * 1024)).toFixed(1)}MB free, minimum ${(minRequiredBytes / (1024 * 1024)).toFixed(0)}MB required.`
                };
            }
        }
    } catch (e) {
        // Fallback gracefully if statfsSync is unsupported
    }

    return { ok: true };
}

// Clean stale .partial files older than 2 hours
function cleanStalePartialFiles() {
    try {
        const dailyDir = path.join(BACKUP_ROOT, 'daily');
        if (!fs.existsSync(dailyDir)) return;
        const files = fs.readdirSync(dailyDir);
        const now = Date.now();
        for (const file of files) {
            if (file.endsWith('.partial')) {
                const fullPath = path.join(dailyDir, file);
                const stats = fs.statSync(fullPath);
                if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
                    fs.unlinkSync(fullPath);
                    console.log(`🧹 Cleaned stale partial backup file: ${file}`);
                }
            }
        }
    } catch (e) {}
}

function appendFilesystemLog(record) {
    try {
        const logDir = path.join(BACKUP_ROOT, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
        }
        
        // Append to JSONL history
        const jsonlPath = path.join(logDir, 'backup-history.jsonl');
        fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n', 'utf8');

        // Append to human-readable log
        const textLogPath = path.join(logDir, 'backup.log');
        const textEntry = `[${record.completedAt || new Date().toISOString()}] STATUS=${record.status} TYPE=${record.type} FILE=${record.filename} SIZE=${(record.sizeBytes / (1024 * 1024)).toFixed(2)}MB STAGE=${record.failureStage} LOCAL=${record.localStatus} REMOTE=${record.remoteStatus}${record.errorMessage ? ' ERROR=' + record.errorMessage : ''}\n`;
        fs.appendFileSync(textLogPath, textEntry, 'utf8');
    } catch (err) {
        console.error('⚠️ Warning: Failed to write to filesystem backup log:', sanitizeError(err));
    }
}

function uploadFileToS3(localFilePath, s3Bucket, s3Key, region) {
    if (!fs.existsSync(localFilePath)) {
        throw new Error(`Local file not found for S3 upload: ${localFilePath}`);
    }

    const s3Uri = `s3://${s3Bucket}/${s3Key}`;
    const cpArgs = [
        's3',
        'cp',
        localFilePath,
        s3Uri,
        '--region',
        region,
        '--sse',
        'AES256'
    ];

    const cpResult = childProcess.spawnSync(AWS_CLI_BIN, cpArgs, {
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
    });

    if (cpResult.error) {
        throw new Error(`AWS CLI execution error: ${sanitizeError(cpResult.error)}`);
    }

    if (cpResult.status !== 0) {
        const stderr = (cpResult.stderr || cpResult.stdout || 'Unknown S3 cp error').trim();
        throw new Error(`aws s3 cp exited with status ${cpResult.status}: ${sanitizeError(stderr)}`);
    }

    return true;
}

function verifyS3ObjectHead(s3Bucket, s3Key, region) {
    const headArgs = [
        's3api',
        'head-object',
        '--bucket',
        s3Bucket,
        '--key',
        s3Key,
        '--region',
        region
    ];

    const headResult = childProcess.spawnSync(AWS_CLI_BIN, headArgs, {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024
    });

    if (headResult.error) {
        throw new Error(`AWS CLI head-object execution error: ${sanitizeError(headResult.error)}`);
    }

    if (headResult.status !== 0) {
        const stderr = (headResult.stderr || headResult.stdout || 'HeadObject failed').trim();
        throw new Error(`aws s3api head-object failed (status ${headResult.status}): ${sanitizeError(stderr)}`);
    }

    let headData;
    try {
        headData = JSON.parse(headResult.stdout);
    } catch (parseErr) {
        throw new Error(`Failed to parse head-object JSON response: ${parseErr.message}`);
    }

    const contentLength = typeof headData.ContentLength === 'number' ? headData.ContentLength : parseInt(headData.ContentLength, 10);
    if (!contentLength || isNaN(contentLength) || contentLength <= 0) {
        throw new Error(`Remote object has invalid or zero ContentLength: ${headData.ContentLength}`);
    }

    return {
        contentLength,
        eTag: headData.ETag,
        versionId: headData.VersionId,
        serverSideEncryption: headData.ServerSideEncryption
    };
}

async function recordBackupToDb(record) {
    let connectionOpened = false;
    try {
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
            connectionOpened = true;
        }

        if (record.collectionsCount === null && mongoose.connection.readyState === 1) {
            try {
                const collections = await mongoose.connection.db.listCollections().toArray();
                record.collectionsCount = collections.length;
            } catch (e) {}
        }

        const BackupRecord = require('../models/BackupRecord');
        await BackupRecord.create(record);
    } catch (err) {
        console.warn('⚠️ Warning: Could not record backup in MongoDB BackupRecord collection (DB may be offline):', sanitizeError(err));
    } finally {
        if (connectionOpened) {
            try { await mongoose.disconnect(); } catch (e) {}
        }
    }
}

function checkMongodumpAvailable() {
    try {
        childProcess.execSync(`${MONGODUMP_BIN} --version`, { stdio: 'ignore', timeout: 3000 });
        return true;
    } catch (e) {
        return false;
    }
}

// Retention Pruning with strict boundary checks & last-backup safeguard
function pruneRetention() {
    const results = { dailyDeleted: 0, weeklyDeleted: 0, monthlyDeleted: 0 };
    const now = Date.now();

    function cleanDir(dirPath, maxAgeDays, counterKey) {
        const resolved = path.resolve(dirPath);
        if (!resolved.startsWith(BACKUP_ROOT) || resolved === BACKUP_ROOT) {
            console.error(`❌ Security alert: Attempted to clean outside backup root: ${resolved}`);
            return;
        }

        if (!fs.existsSync(resolved)) return;

        const allFiles = fs.readdirSync(resolved);
        const archives = allFiles.filter(f => f.endsWith('.archive.gz'));

        // Safeguard: Never delete if it is the only remaining backup
        if (archives.length <= 1) return;

        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

        for (const file of allFiles) {
            // Never remove active .partial files during retention
            if (file.endsWith('.partial')) continue;
            if (!file.endsWith('.archive.gz') && !file.endsWith('.sha256')) continue;

            const fullPath = path.join(resolved, file);
            try {
                const stats = fs.statSync(fullPath);
                if (now - stats.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(fullPath);
                    results[counterKey]++;
                }
            } catch (err) {
                console.warn(`⚠️ Warning cleaning old file ${file}:`, sanitizeError(err));
            }
        }
    }

    cleanDir(path.join(BACKUP_ROOT, 'daily'), RETENTION_DAILY_DAYS, 'dailyDeleted');
    cleanDir(path.join(BACKUP_ROOT, 'weekly'), RETENTION_WEEKLY_WEEKS * 7, 'weeklyDeleted');
    cleanDir(path.join(BACKUP_ROOT, 'monthly'), RETENTION_MONTHLY_MONTHS * 30, 'monthlyDeleted');

    return results;
}

// 3. MAIN BACKUP WORKFLOW
async function runBackup(options = {}) {
    const startedAt = new Date();
    const isManual = options.manual === true;
    const type = isManual ? 'manual' : 'daily';
    const timestamp = formatUtcTimestamp(startedAt);
    const filename = `shreemata-${timestamp}.archive.gz`;

    console.log('\n==================================================');
    console.log(`[DATABASE BACKUP] Started at ${startedAt.toISOString()}`);
    console.log(`Target: ${maskUri(MONGO_URI)}`);
    console.log('==================================================');

    const resultRecord = {
        filename,
        type,
        status: 'IN_PROGRESS',
        failureStage: 'NONE',
        localStatus: 'NOT_ATTEMPTED',
        remoteStatus: S3_ENABLED ? 'NOT_ATTEMPTED' : 'NOT_CONFIGURED',
        sizeBytes: 0,
        checksumSha256: null,
        storageLocation: 'none',
        s3Bucket: S3_BUCKET || null,
        s3Key: null,
        databaseName: parseDatabaseName(MONGO_URI),
        startedAt,
        completedAt: null,
        durationMs: 0,
        errorMessage: null,
        restoreTested: false,
        restoreTestedAt: null,
        collectionsCount: null,
        documentsCount: null
    };

    let lockAcquired = false;

    try {
        // STAGE 1: PRECHECK
        if (!BACKUP_ENABLED) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'PRECHECK';
            resultRecord.errorMessage = 'Backup is disabled via BACKUP_ENABLED=false';
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: PRECHECK - ${resultRecord.errorMessage}`);
            return resultRecord;
        }

        if (!MONGO_URI) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'PRECHECK';
            resultRecord.errorMessage = 'MONGO_URI is missing in environment';
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: PRECHECK - ${resultRecord.errorMessage}`);
            return resultRecord;
        }

        ensureDirectories();

        // Check Process Lock
        const lockRes = acquireBackupLock();
        if (!lockRes.acquired) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'PRECHECK';
            resultRecord.errorMessage = `BACKUP_ALREADY_RUNNING (Active PID ${lockRes.pid} since ${lockRes.startedAt})`;
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: PRECHECK - ${resultRecord.errorMessage}`);
            return resultRecord;
        }
        lockAcquired = true;

        // Check Disk Space & Permissions
        const diskCheck = checkDiskSpaceAndPermissions();
        if (!diskCheck.ok) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'PRECHECK';
            resultRecord.errorMessage = diskCheck.error;
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: PRECHECK - ${resultRecord.errorMessage}`);
            return resultRecord;
        }

        // Clean stale partial files
        cleanStalePartialFiles();

        if (!checkMongodumpAvailable()) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'PRECHECK';
            resultRecord.localStatus = 'FAILED';
            resultRecord.errorMessage = 'mongodump tool is not found or not executable. Production backup requires mongodump.';
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: PRECHECK - ${resultRecord.errorMessage}`);
            console.error('👉 Install mongodb-database-tools or configure MONGODUMP_PATH in .env');
            return resultRecord;
        }

        // STAGE 2: DUMP TO .partial STAGING FILE
        const dailyPath = path.join(BACKUP_ROOT, 'daily', filename);
        const partialPath = `${dailyPath}.partial`;

        console.log(`[DATABASE BACKUP] Staging mongodump to ${path.basename(partialPath)}...`);

        try {
            await new Promise((resolve, reject) => {
                const args = [
                    `--uri=${MONGO_URI}`,
                    `--archive=${partialPath}`,
                    '--gzip'
                ];

                const proc = childProcess.spawn(MONGODUMP_BIN, args, {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let stderrData = '';
                proc.stderr.on('data', (chunk) => {
                    stderrData += chunk.toString();
                });

                proc.on('error', (err) => {
                    reject(new Error(`Failed to spawn mongodump: ${err.message}`));
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`mongodump exited with code ${code}: ${stderrData}`));
                    }
                });
            });
        } catch (dumpErr) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'DUMP';
            resultRecord.localStatus = 'FAILED';
            resultRecord.errorMessage = sanitizeError(dumpErr);
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: DUMP - ${resultRecord.errorMessage}`);
            try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch (e) {}
            return resultRecord;
        }

        // STAGE 3: VERIFY PARTIAL FILE
        try {
            if (!fs.existsSync(partialPath)) {
                throw new Error(`Partial backup file was not created: ${partialPath}`);
            }
            const stats = fs.statSync(partialPath);
            if (stats.size <= 0) {
                throw new Error(`Partial backup file is zero bytes: ${partialPath}`);
            }
            resultRecord.sizeBytes = stats.size;
        } catch (verifyErr) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'VERIFY';
            resultRecord.localStatus = 'FAILED';
            resultRecord.errorMessage = sanitizeError(verifyErr);
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: VERIFY - ${resultRecord.errorMessage}`);
            try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch (e) {}
            return resultRecord;
        }

        // STAGE 4: CHECKSUM & ATOMIC RENAME
        try {
            const checksum = await computeFileSha256(partialPath);
            resultRecord.checksumSha256 = checksum;

            // Atomic rename from .partial to final .archive.gz
            fs.renameSync(partialPath, dailyPath);
            console.log(`[DATABASE BACKUP] Atomically renamed to ${filename}`);

            // Write independent .sha256 digest file
            fs.writeFileSync(`${dailyPath}.sha256`, `${checksum}  ${filename}\n`, 'utf8');
            console.log(`[DATABASE BACKUP] SHA-256 Checksum: ${checksum}`);

            resultRecord.localStatus = 'SUCCESS';
            resultRecord.storageLocation = 'local';
        } catch (checksumErr) {
            resultRecord.status = 'FAILED';
            resultRecord.failureStage = 'CHECKSUM';
            resultRecord.errorMessage = sanitizeError(checksumErr);
            console.error(`❌ [DATABASE BACKUP FAILED] Stage: CHECKSUM - ${resultRecord.errorMessage}`);
            try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch (e) {}
            return resultRecord;
        }

        // STAGE 5: RETENTION PROMOTION (Single-Dump Architecture)
        try {
            const dayOfWeek = startedAt.getUTCDay(); // 0 = Sunday
            const dayOfMonth = startedAt.getUTCDate(); // 1 = First day of month

            if (dayOfWeek === 0) {
                const weeklyPath = path.join(BACKUP_ROOT, 'weekly', filename);
                fs.copyFileSync(dailyPath, weeklyPath);
                fs.copyFileSync(`${dailyPath}.sha256`, `${weeklyPath}.sha256`);
                console.log(`[DATABASE BACKUP] Promoted to weekly retention: ${weeklyPath}`);
            }

            if (dayOfMonth === 1) {
                const monthlyPath = path.join(BACKUP_ROOT, 'monthly', filename);
                fs.copyFileSync(dailyPath, monthlyPath);
                fs.copyFileSync(`${dailyPath}.sha256`, `${monthlyPath}.sha256`);
                console.log(`[DATABASE BACKUP] Promoted to monthly retention: ${monthlyPath}`);
            }
        } catch (promoErr) {
            console.warn('⚠️ Warning: Retention promotion encountered an error:', sanitizeError(promoErr));
        }

        // STAGE 6: REAL S3 UPLOAD & VERIFICATION (Archive + Checksum Object)
        if (S3_ENABLED && S3_BUCKET) {
            const archiveKey = `database-backups/daily/${filename}`;
            const checksumKey = `database-backups/daily/${filename}.sha256`;
            const localChecksumPath = `${dailyPath}.sha256`;

            try {
                console.log(`[DATABASE BACKUP] Step 6a: Uploading archive to s3://${S3_BUCKET}/${archiveKey}...`);
                uploadFileToS3(dailyPath, S3_BUCKET, archiveKey, S3_REGION);

                console.log(`[DATABASE BACKUP] Step 6b: Verifying remote archive via HeadObject...`);
                const remoteArchiveHead = verifyS3ObjectHead(S3_BUCKET, archiveKey, S3_REGION);

                if (remoteArchiveHead.contentLength !== resultRecord.sizeBytes) {
                    throw new Error(`Remote archive size mismatch: remote ContentLength (${remoteArchiveHead.contentLength}) !== local size (${resultRecord.sizeBytes})`);
                }

                console.log(`[DATABASE BACKUP] Step 6c: Uploading checksum to s3://${S3_BUCKET}/${checksumKey}...`);
                uploadFileToS3(localChecksumPath, S3_BUCKET, checksumKey, S3_REGION);

                console.log(`[DATABASE BACKUP] Step 6d: Verifying remote checksum via HeadObject...`);
                const remoteChecksumHead = verifyS3ObjectHead(S3_BUCKET, checksumKey, S3_REGION);

                if (remoteChecksumHead.contentLength <= 0) {
                    throw new Error(`Remote checksum ContentLength is invalid (${remoteChecksumHead.contentLength})`);
                }

                // ONLY MARK SUCCESS ON COMPLETE VERIFICATION
                resultRecord.s3Key = archiveKey;
                resultRecord.remoteStatus = 'SUCCESS';
                resultRecord.storageLocation = 'both';
                console.log(`[DATABASE BACKUP] S3 Upload & Verification: SUCCESS -> s3://${S3_BUCKET}/${archiveKey}`);
            } catch (s3Err) {
                resultRecord.remoteStatus = 'FAILED';
                resultRecord.failureStage = 'UPLOAD';
                resultRecord.storageLocation = 'local';
                resultRecord.errorMessage = `S3 upload/verification failed: ${sanitizeError(s3Err)}`;
                console.error(`⚠️ [DATABASE BACKUP WARNING] S3 Upload Failed: ${resultRecord.errorMessage}`);
            }
        } else {
            resultRecord.remoteStatus = 'NOT_CONFIGURED';
        }

        // STAGE 7: RETENTION PRUNING
        try {
            const pruneResults = pruneRetention();
            console.log(`[DATABASE BACKUP] Retention cleanup complete: daily=${pruneResults.dailyDeleted}, weekly=${pruneResults.weeklyDeleted}, monthly=${pruneResults.monthlyDeleted}`);
        } catch (pruneErr) {
            console.warn('⚠️ Warning during retention cleanup:', sanitizeError(pruneErr));
        }

        // FINAL STATUS EVALUATION
        if (resultRecord.localStatus === 'SUCCESS') {
            if (resultRecord.remoteStatus === 'FAILED') {
                resultRecord.status = 'WARNING';
            } else {
                resultRecord.status = 'SUCCESS';
            }
        } else {
            resultRecord.status = 'FAILED';
        }

        return resultRecord;

    } finally {
        if (lockAcquired) {
            releaseBackupLock();
        }

        resultRecord.completedAt = new Date();
        resultRecord.durationMs = resultRecord.completedAt - startedAt;

        console.log('--------------------------------------------------');
        console.log(`[DATABASE BACKUP] Size: ${(resultRecord.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`[DATABASE BACKUP] Duration: ${(resultRecord.durationMs / 1000).toFixed(2)}s`);
        console.log(`[DATABASE BACKUP] Local Status: ${resultRecord.localStatus}`);
        console.log(`[DATABASE BACKUP] Remote Status: ${resultRecord.remoteStatus}`);
        console.log(`[DATABASE BACKUP] FINAL STATUS: ${resultRecord.status}`);
        console.log('==================================================\n');

        appendFilesystemLog(resultRecord);
        await recordBackupToDb(resultRecord);
    }
}

if (require.main === module) {
    const isManual = process.argv.includes('--manual');
    runBackup({ manual: isManual })
        .then((res) => {
            if (res.status === 'FAILED') {
                process.exit(1);
            } else {
                process.exit(0);
            }
        })
        .catch((err) => {
            console.error('Fatal backup error:', sanitizeError(err));
            process.exit(1);
        });
}

module.exports = {
    runBackup,
    maskUri,
    sanitizeError,
    computeFileSha256,
    checkMongodumpAvailable,
    uploadFileToS3,
    verifyS3ObjectHead,
    parseDatabaseName,
    acquireBackupLock,
    releaseBackupLock,
    checkDiskSpaceAndPermissions,
    cleanStalePartialFiles,
    pruneRetention,
    formatUtcTimestamp
};
