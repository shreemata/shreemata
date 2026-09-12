const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const User = require('../models/User');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
        console.log('No admin user found in DB');
        process.exit(1);
    }

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
            try {
                const parsed = JSON.parse(data);
                console.log('API Status Code:', res.statusCode);
                console.log('API Success:', parsed.success);
                console.log('Database Backup Health Payload:');
                console.log(JSON.stringify(parsed.data?.databaseBackup, null, 2));
            } catch (e) {
                console.log('Raw response:', data);
            }
            process.exit(0);
        });
    });

    req.on('error', err => {
        console.error(err);
        process.exit(1);
    });
    req.end();
}

test();
