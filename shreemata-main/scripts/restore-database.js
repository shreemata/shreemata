/**
 * SHREE MATA — PRODUCTION DATABASE RESTORE UTILITY (scripts/restore-database.js)
 * 
 * Secure database restore utility using mongorestore.
 * 
 * STRICT SAFETY RULES:
 * 1. Default target MUST NOT be production.
 * 2. Requires explicit --file and --target parameters.
 * 3. Triple-lock production restore protection with typed confirmation on interactive TTY only.
 * 4. Automatic SHA-256 integrity validation before execution.
 * 5. Namespace remapping (--nsFrom / --nsTo) support with database-less connection URI.
 * 6. NO HTTP endpoint is allowed to invoke this utility.
 * 7. Non-interactive production restore is strictly blocked.
 * 8. Captures mongorestore stream output and verifies non-zero documents restored.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const childProcess = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { maskUri, sanitizeError, computeFileSha256, parseDatabaseName } = require('./backup-database');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const MONGORESTORE_BIN = process.env.MONGORESTORE_PATH || 'mongorestore';

/**
 * Builds a database-less URI for mongorestore to allow namespace remapping (--nsFrom / --nsTo)
 * Preserves host, port, username, password, query parameters (authSource, replicaSet, ssl, etc.)
 * Removes ONLY the database pathname.
 */
function buildDeploymentRestoreUri(uri) {
    if (!uri) return uri;
    try {
        const qIndex = uri.indexOf('?');
        const queryString = qIndex !== -1 ? uri.substring(qIndex) : '';
        const baseUri = qIndex !== -1 ? uri.substring(0, qIndex) : uri;

        const protocolMatch = baseUri.match(/^mongodb(\+srv)?:\/\//i);
        if (!protocolMatch) return uri;
        const protocol = protocolMatch[0];
        const rest = baseUri.substring(protocol.length);

        let authPart = '';
        let hostsAndDb = rest;
        const atIndex = rest.lastIndexOf('@');
        if (atIndex !== -1) {
            authPart = rest.substring(0, atIndex + 1);
            hostsAndDb = rest.substring(atIndex + 1);
        }

        const slashIndex = hostsAndDb.indexOf('/');
        let hostPart = hostsAndDb;
        if (slashIndex !== -1) {
            hostPart = hostsAndDb.substring(0, slashIndex);
        }

        return `${protocol}${authPart}${hostPart}/${queryString}`;
    } catch (e) {
        return uri;
    }
}

/**
 * Parses mongorestore output to extract document restore counts
 */
function parseMongorestoreStats(output) {
    let totalRestored = 0;
    let totalFailed = 0;
    let foundMatch = false;

    // Matches patterns like:
    // "266 document(s) restored successfully. 0 document(s) failed to restore."
    // "5 document(s) restored successfully"
    const restoreRegex = /(\d+)\s+document\(s\)\s+restored\s+successfully(?:[,\.]\s+(\d+)\s+document\(s\)\s+failed\s+to\s+restore)?/gi;
    let match;
    while ((match = restoreRegex.exec(output)) !== null) {
        foundMatch = true;
        totalRestored += parseInt(match[1], 10);
        if (match[2]) {
            totalFailed += parseInt(match[2], 10);
        }
    }

    return {
        foundMatch,
        totalRestored,
        totalFailed
    };
}

function checkMongorestoreAvailable() {
    try {
        childProcess.execSync(`${MONGORESTORE_BIN} --version`, { stdio: 'ignore', timeout: 3000 });
        return true;
    } catch (e) {
        return false;
    }
}

function promptConfirmation(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function runRestore(options = {}) {
    const filePath = options.file || null;
    const targetDb = options.target || null;
    const customUri = options.uri || MONGO_URI;
    const allowProd = options.allowProductionRestore === true || process.argv.includes('--allow-production-restore');
    const confirmOverwrite = options.confirmProductionOverwrite === true || process.argv.includes('--confirm-production-overwrite');
    const nsFrom = options.nsFrom || null;
    const allowZeroDocuments = options.allowZeroDocuments === true;

    console.log('\n==================================================');
    console.log('[DATABASE RESTORE] Initializing Restore Engine...');
    console.log('==================================================');

    if (!filePath) {
        throw new Error('Missing required parameter: --file=<backup_archive_path>');
    }

    if (!targetDb) {
        throw new Error('Missing required parameter: --target=<target_database_name>. Default is NEVER production.');
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`Backup archive file not found: ${filePath}`);
    }

    // 1. CHECKSUM VERIFICATION
    console.log(`[DATABASE RESTORE] Verifying SHA-256 checksum of ${path.basename(filePath)}...`);
    const calculatedChecksum = await computeFileSha256(filePath);
    const checksumFilePath = `${filePath}.sha256`;

    if (fs.existsSync(checksumFilePath)) {
        const expectedChecksumContent = fs.readFileSync(checksumFilePath, 'utf8').trim().split(/\s+/)[0];
        if (calculatedChecksum.toLowerCase() !== expectedChecksumContent.toLowerCase()) {
            throw new Error(`CRITICAL SECURITY HALT: Checksum mismatch! Expected ${expectedChecksumContent} but calculated ${calculatedChecksum}. Archive may be corrupted or tampered.`);
        }
        console.log(`✅ [DATABASE RESTORE] Checksum Verified: ${calculatedChecksum}`);
    } else {
        console.warn(`⚠️ Warning: Adjacent .sha256 file not found. Calculated checksum: ${calculatedChecksum}`);
    }

    // 2. PRODUCTION TARGET PROTECTION
    const detectedProductionDb = parseDatabaseName(MONGO_URI);
    const isTargetingProduction = targetDb.toLowerCase() === detectedProductionDb.toLowerCase();

    if (isTargetingProduction) {
        console.warn('\n🚨 ==================================================');
        console.warn('CRITICAL WARNING: TARGET IS THE PRODUCTION DATABASE!');
        console.warn(`Target DB: ${targetDb}`);
        console.warn('==================================================\n');

        const envFlag = process.env.PRODUCTION_RESTORE_ALLOWED === 'true';

        if (!allowProd || !confirmOverwrite || !envFlag) {
            console.error('❌ RESTORE HALTED: Production restore requires ALL of the following:');
            console.error('   1. Flag: --allow-production-restore');
            console.error('   2. Flag: --confirm-production-overwrite');
            console.error('   3. Environment: PRODUCTION_RESTORE_ALLOWED=true');
            throw new Error('Production restore denied due to missing safety overrides.');
        }

        // Section 11 Fix: Production restore must NEVER run non-interactively
        if (!process.stdin.isTTY) {
            throw new Error('CRITICAL SECURITY HALT: Production database restore is forbidden in non-interactive environments (automation/cron/script). A real interactive TTY terminal is mandatory.');
        }

        console.warn('👉 To proceed, type EXACTLY: RESTORE SHREEMATA PRODUCTION');
        const confirmation = await promptConfirmation('Confirmation phrase: ');
        if (confirmation !== 'RESTORE SHREEMATA PRODUCTION') {
            throw new Error('Confirmation phrase did not match. Aborting production restore.');
        }
    }

    if (!checkMongorestoreAvailable()) {
        throw new Error('mongorestore tool is not found or not executable. Restore requires mongorestore CLI.');
    }

    // 3. EXECUTE RESTORE WITH DATABASE-LESS URI & NAMESPACE REMAPPING
    const sourceNs = nsFrom || `${detectedProductionDb}.*`;
    const targetNs = `${targetDb}.*`;
    const restoreDeploymentUri = buildDeploymentRestoreUri(customUri);

    console.log(`[DATABASE RESTORE] Restoring from ${path.basename(filePath)}...`);
    console.log(`[DATABASE RESTORE] Target DB: ${targetDb}`);
    console.log(`[DATABASE RESTORE] Remapping namespaces: ${sourceNs} -> ${targetNs}`);
    console.log(`[DATABASE RESTORE] Deployment URI: ${maskUri(restoreDeploymentUri)}`);

    const restoreArgs = [
        `--uri=${restoreDeploymentUri}`,
        `--archive=${filePath}`,
        '--gzip',
        `--nsFrom=${sourceNs}`,
        `--nsTo=${targetNs}`,
        '--drop',
        '--stopOnError',
        '--verbose'
    ];

    let combinedOutput = '';

    await new Promise((resolve, reject) => {
        const proc = childProcess.spawn(MONGORESTORE_BIN, restoreArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        proc.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            combinedOutput += text;
        });

        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            combinedOutput += text;
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn mongorestore: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ [DATABASE RESTORE] mongorestore command exited with code 0.');
                resolve();
            } else {
                reject(new Error(`mongorestore failed with exit code ${code}: ${sanitizeError(combinedOutput)}`));
            }
        });
    });

    // 4. CAPTURE & VALIDATE MONGORESTORE RESTORE STATS
    const stats = parseMongorestoreStats(combinedOutput);
    if (stats.foundMatch) {
        console.log(`[DATABASE RESTORE] mongorestore Summary: ${stats.totalRestored} document(s) restored successfully, ${stats.totalFailed} document(s) failed to restore.`);
        if (stats.totalRestored === 0 && !allowZeroDocuments) {
            throw new Error(`CRITICAL RESTORE FAILURE: mongorestore reported 0 document(s) restored successfully!`);
        }
        if (stats.totalFailed > 0) {
            throw new Error(`CRITICAL RESTORE FAILURE: mongorestore reported ${stats.totalFailed} document(s) failed to restore.`);
        }
    } else {
        console.log(`[DATABASE RESTORE] mongorestore process completed without structured doc count lines.`);
    }

    console.log('==================================================');
    console.log(`[DATABASE RESTORE] COMPLETE: Database '${targetDb}' restored successfully.`);
    console.log('==================================================\n');

    return {
        success: true,
        targetDb,
        filePath,
        checksum: calculatedChecksum,
        stats
    };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    args.forEach(arg => {
        if (arg.startsWith('--file=')) options.file = arg.split('=')[1];
        if (arg.startsWith('--target=')) options.target = arg.split('=')[1];
        if (arg.startsWith('--uri=')) options.uri = arg.split('=')[1];
        if (arg.startsWith('--nsFrom=')) options.nsFrom = arg.split('=')[1];
        if (arg === '--allow-production-restore') options.allowProductionRestore = true;
        if (arg === '--confirm-production-overwrite') options.confirmProductionOverwrite = true;
        if (arg === '--allow-zero-documents') options.allowZeroDocuments = true;
    });

    runRestore(options)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('❌ Restore failed:', sanitizeError(err));
            process.exit(1);
        });
}

module.exports = {
    runRestore,
    buildDeploymentRestoreUri,
    parseMongorestoreStats,
    checkMongorestoreAvailable
};
