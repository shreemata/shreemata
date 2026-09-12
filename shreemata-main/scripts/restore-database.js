/**
 * SHREE MATA — PRODUCTION DATABASE RESTORE UTILITY (scripts/restore-database.js)
 * 
 * Secure database restore utility using mongorestore.
 * 
 * STRICT SAFETY RULES:
 * 1. Default target MUST NOT be production.
 * 2. Requires explicit --file and --target parameters.
 * 3. Triple-lock production restore protection with typed confirmation.
 * 4. Automatic SHA-256 integrity validation before execution.
 * 5. Namespace remapping (--nsFrom / --nsTo) support.
 * 6. NO HTTP endpoint is allowed to invoke this utility.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { maskUri, sanitizeError, computeFileSha256, parseDatabaseName } = require('./backup-database');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const MONGORESTORE_BIN = process.env.MONGORESTORE_PATH || 'mongorestore';

function checkMongorestoreAvailable() {
    try {
        execSync(`${MONGORESTORE_BIN} --version`, { stdio: 'ignore', timeout: 3000 });
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
    const skipPrompt = options.nonInteractive === true;
    const nsFrom = options.nsFrom || null;

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

        // Must be interactive terminal or explicitly confirmed
        if (!process.stdin.isTTY && skipPrompt) {
            console.warn('⚠️ Warning: Non-interactive production restore detected.');
        }

        if (!skipPrompt) {
            console.warn('👉 To proceed, type EXACTLY: RESTORE SHREEMATA PRODUCTION');
            const confirmation = await promptConfirmation('Confirmation phrase: ');
            if (confirmation !== 'RESTORE SHREEMATA PRODUCTION') {
                throw new Error('Confirmation phrase did not match. Aborting production restore.');
            }
        }
    }

    if (!checkMongorestoreAvailable()) {
        throw new Error('mongorestore tool is not found or not executable. Restore requires mongorestore CLI.');
    }

    // 3. EXECUTE RESTORE WITH NAMESPACE REMAPPING
    const sourceNs = nsFrom || `${detectedProductionDb}.*`;
    const targetNs = `${targetDb}.*`;

    console.log(`[DATABASE RESTORE] Restoring from ${path.basename(filePath)}...`);
    console.log(`[DATABASE RESTORE] Target DB: ${targetDb}`);
    console.log(`[DATABASE RESTORE] Remapping namespaces: ${sourceNs} -> ${targetNs}`);
    console.log(`[DATABASE RESTORE] Target URI: ${maskUri(customUri)}`);

    const restoreArgs = [
        `--uri=${customUri}`,
        `--archive=${filePath}`,
        '--gzip',
        `--nsFrom=${sourceNs}`,
        `--nsTo=${targetNs}`,
        '--drop' // Drops collections in the target database before restoring
    ];

    await new Promise((resolve, reject) => {
        const proc = spawn(MONGORESTORE_BIN, restoreArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderrData = '';
        proc.stderr.on('data', (chunk) => {
            stderrData += chunk.toString();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn mongorestore: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ [DATABASE RESTORE] mongorestore completed successfully (Exit Code 0).');
                resolve();
            } else {
                reject(new Error(`mongorestore failed with exit code ${code}: ${stderrData}`));
            }
        });
    });

    console.log('==================================================');
    console.log(`[DATABASE RESTORE] COMPLETE: Database '${targetDb}' restored successfully.`);
    console.log('==================================================\n');

    return {
        success: true,
        targetDb,
        filePath,
        checksum: calculatedChecksum
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
        if (arg === '--non-interactive') options.nonInteractive = true;
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
    checkMongorestoreAvailable
};
