const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const User = require('../models/User');

async function testCalculatedHealth() {
    const backupDir = path.join(__dirname, '../backups/logs');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const sampleCompleted = new Date(Date.now() - 9 * 60 * 60 * 1000); // 9 hours ago
    const sampleRecord = {
        filename: 'shreemata-2026-09-12T02-00-00-000Z.archive.gz',
        type: 'daily',
        status: 'SUCCESS',
        failureStage: 'NONE',
        localStatus: 'SUCCESS',
        remoteStatus: 'SUCCESS',
        sizeBytes: 183 * 1024 * 1024,
        checksumSha256: 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        storageLocation: 'both',
        startedAt: new Date(sampleCompleted.getTime() - 120000).toISOString(),
        completedAt: sampleCompleted.toISOString(),
        durationMs: 120000,
        errorMessage: null,
        restoreTested: true,
        restoreTestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    };

    fs.writeFileSync(path.join(backupDir, 'backup-history.jsonl'), JSON.stringify(sampleRecord) + '\n', 'utf8');

    await mongoose.connect(process.env.MONGO_URI);
    const admin = await User.findOne({ role: 'admin' });
    const token = jwt.sign({ id: admin._id, role: 'admin', email: admin.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/dashboard/operations',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const parsed = JSON.parse(data);
            console.log('--- Database Backup Health Payload with Sample Record ---');
            console.log(JSON.stringify(parsed.data?.databaseBackup, null, 2));

            // Clean up test file
            fs.unlinkSync(path.join(backupDir, 'backup-history.jsonl'));
            process.exit(0);
        });
    });

    req.end();
}

testCalculatedHealth();
