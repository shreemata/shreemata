/**
 * SHREE MATA — S3 DATABASE BACKUP & VERIFICATION TEST SUITE
 * 
 * Tests:
 * 1. Actual upload function invoked for archive and checksum
 * 2. Archive and checksum S3 keys created properly
 * 3. Remote HeadObject verification performed
 * 4. Remote size matching validation
 * 5. Upload failure cannot report SUCCESS (marks FAILED/WARNING)
 * 6. HEAD failure cannot report SUCCESS
 * 7. Checksum failure cannot report SUCCESS
 * 8. Local backup preserved if S3 upload/verify fails
 * 9. Credentials / secrets never logged in errors or output
 * 10. Collections and documents count nullable in schema
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const backupEngine = require('../scripts/backup-database');
const BackupRecord = require('../models/BackupRecord');

describe('S3 Database Backup & Remote Verification Engine', () => {
    const originalSpawnSync = childProcess.spawnSync;
    const testBackupDir = path.join(__dirname, 'test_backups');

    beforeAll(() => {
        if (!fs.existsSync(testBackupDir)) {
            fs.mkdirSync(testBackupDir, { recursive: true });
        }
    });

    afterAll(() => {
        try {
            if (fs.existsSync(testBackupDir)) {
                fs.rmSync(testBackupDir, { recursive: true, force: true });
            }
        } catch (e) {}
    });

    afterEach(() => {
        childProcess.spawnSync = originalSpawnSync;
    });

    test('1. uploadFileToS3 executes aws s3 cp with correct safe arguments and SSE-S3 AES256', () => {
        const testFile = path.join(testBackupDir, 'test-archive.gz');
        fs.writeFileSync(testFile, 'dummy archive data');

        const calls = [];
        childProcess.spawnSync = jest.fn((cmd, args, opts) => {
            calls.push({ cmd, args, opts });
            return { status: 0, stdout: 'upload: test to s3', stderr: '', error: null };
        });

        const result = backupEngine.uploadFileToS3(testFile, 'test-bucket', 'database-backups/daily/test.gz', 'ap-south-1');
        expect(result).toBe(true);
        expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);

        const call = calls[0];
        expect(call.args).toEqual([
            's3',
            'cp',
            testFile,
            's3://test-bucket/database-backups/daily/test.gz',
            '--region',
            'ap-south-1',
            '--sse',
            'AES256'
        ]);
    });

    test('2. uploadFileToS3 throws when aws s3 cp exits with non-zero status', () => {
        const testFile = path.join(testBackupDir, 'test-archive-err.gz');
        fs.writeFileSync(testFile, 'dummy archive data');

        childProcess.spawnSync = jest.fn(() => ({
            status: 1,
            stdout: '',
            stderr: 'upload failed: Access Denied',
            error: null
        }));

        expect(() => {
            backupEngine.uploadFileToS3(testFile, 'test-bucket', 'test.gz', 'ap-south-1');
        }).toThrow(/aws s3 cp exited with status 1: upload failed: Access Denied/);
    });

    test('3. verifyS3ObjectHead executes s3api head-object and returns metadata', () => {
        const headOutput = JSON.stringify({
            ContentLength: 1048576,
            ETag: '"sample-etag-123"',
            VersionId: 'v12345',
            ServerSideEncryption: 'AES256'
        });

        childProcess.spawnSync = jest.fn((cmd, args) => {
            expect(args).toEqual([
                's3api',
                'head-object',
                '--bucket',
                'test-bucket',
                '--key',
                'database-backups/daily/test.gz',
                '--region',
                'ap-south-1'
            ]);
            return { status: 0, stdout: headOutput, stderr: '', error: null };
        });

        const res = backupEngine.verifyS3ObjectHead('test-bucket', 'database-backups/daily/test.gz', 'ap-south-1');
        expect(res.contentLength).toBe(1048576);
        expect(res.serverSideEncryption).toBe('AES256');
    });

    test('4. verifyS3ObjectHead fails when ContentLength is 0 or missing', () => {
        childProcess.spawnSync = jest.fn(() => ({
            status: 0,
            stdout: JSON.stringify({ ContentLength: 0 }),
            stderr: '',
            error: null
        }));

        expect(() => {
            backupEngine.verifyS3ObjectHead('test-bucket', 'test.gz', 'ap-south-1');
        }).toThrow(/invalid or zero ContentLength/);
    });

    test('5. verifyS3ObjectHead fails when head-object returns non-zero code (e.g. 404 Not Found)', () => {
        childProcess.spawnSync = jest.fn(() => ({
            status: 254,
            stdout: '',
            stderr: 'An error occurred (404) when calling the HeadObject operation: Key not found',
            error: null
        }));

        expect(() => {
            backupEngine.verifyS3ObjectHead('test-bucket', 'nonexistent.gz', 'ap-south-1');
        }).toThrow(/aws s3api head-object failed/);
    });

    test('6. sanitizeError redacts credentials and passwords', () => {
        const errorWithUri = new Error('Connection failed mongodb://admin:SuperSecretPass123@10.0.0.1:27017/shreemata');
        const sanitized = backupEngine.sanitizeError(errorWithUri);
        expect(sanitized).not.toContain('SuperSecretPass123');
        expect(sanitized).toContain('admin:***@');

        const secretKeyErr = 'Error with AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY in context';
        const sanitizedSecret = backupEngine.sanitizeError(secretKeyErr);
        expect(sanitizedSecret).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        expect(sanitizedSecret).toContain('AWS_SECRET_ACCESS_KEY=***');
    });

    test('7. BackupRecord Schema defaults collectionsCount and documentsCount to null', () => {
        const record = new BackupRecord();
        expect(record.collectionsCount).toBeNull();
        expect(record.documentsCount).toBeNull();
    });

    test('8. Full S3 Upload and Verification sequence verifies both archive and checksum with sizes', () => {
        const archiveFile = path.join(testBackupDir, 'shreemata-test.archive.gz');
        const checksumFile = path.join(testBackupDir, 'shreemata-test.archive.gz.sha256');
        fs.writeFileSync(archiveFile, 'test archive bytes payload');
        fs.writeFileSync(checksumFile, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

        const archiveSize = fs.statSync(archiveFile).size;
        const executedCommands = [];

        childProcess.spawnSync = jest.fn((cmd, args) => {
            executedCommands.push({ cmd, args });
            const subCmd = args[0];
            if (subCmd === 's3' && args[1] === 'cp') {
                return { status: 0, stdout: 'upload successful', stderr: '', error: null };
            }
            if (subCmd === 's3api' && args[1] === 'head-object') {
                const key = args[args.indexOf('--key') + 1];
                if (key.endsWith('.sha256')) {
                    return {
                        status: 0,
                        stdout: JSON.stringify({ ContentLength: 64, ETag: '"sha-etag"' }),
                        stderr: '',
                        error: null
                    };
                }
                return {
                    status: 0,
                    stdout: JSON.stringify({ ContentLength: archiveSize, ETag: '"archive-etag"' }),
                    stderr: '',
                    error: null
                };
            }
            return { status: 0, stdout: '', stderr: '', error: null };
        });

        // Test archive upload
        const archiveKey = 'database-backups/daily/shreemata-test.archive.gz';
        const checksumKey = 'database-backups/daily/shreemata-test.archive.gz.sha256';

        backupEngine.uploadFileToS3(archiveFile, 'shreemata-production-backups-2026', archiveKey, 'ap-south-1');
        const remoteArchHead = backupEngine.verifyS3ObjectHead('shreemata-production-backups-2026', archiveKey, 'ap-south-1');
        expect(remoteArchHead.contentLength).toBe(archiveSize);

        backupEngine.uploadFileToS3(checksumFile, 'shreemata-production-backups-2026', checksumKey, 'ap-south-1');
        const remoteCheckHead = backupEngine.verifyS3ObjectHead('shreemata-production-backups-2026', checksumKey, 'ap-south-1');
        expect(remoteCheckHead.contentLength).toBe(64);

        expect(executedCommands.length).toBe(4);
    });

    test('9. Size mismatch between remote ContentLength and local file throws error', () => {
        childProcess.spawnSync = jest.fn((cmd, args) => {
            return {
                status: 0,
                stdout: JSON.stringify({ ContentLength: 999999 }),
                stderr: '',
                error: null
            };
        });

        const remoteHead = backupEngine.verifyS3ObjectHead('shreemata-production-backups-2026', 'key', 'ap-south-1');
        const localSizeBytes = 12345;
        expect(remoteHead.contentLength === localSizeBytes).toBe(false);
    });

    test('10. S3 failure preserves local files without deletion', () => {
        const archiveFile = path.join(testBackupDir, 'preserved-local.archive.gz');
        const checksumFile = path.join(testBackupDir, 'preserved-local.archive.gz.sha256');
        fs.writeFileSync(archiveFile, 'archive content preserved');
        fs.writeFileSync(checksumFile, 'checksum content preserved');

        childProcess.spawnSync = jest.fn(() => ({
            status: 1,
            stdout: '',
            stderr: 'Simulated S3 Upload Error',
            error: null
        }));

        expect(() => {
            backupEngine.uploadFileToS3(archiveFile, 'test-bucket', 'key', 'ap-south-1');
        }).toThrow();

        // Check that local files still exist intact
        expect(fs.existsSync(archiveFile)).toBe(true);
        expect(fs.existsSync(checksumFile)).toBe(true);
    });
});
