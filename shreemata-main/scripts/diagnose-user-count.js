/**
 * scripts/diagnose-user-count.js
 * 
 * Diagnostic script to inspect user counts, roles, and collection queries.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');

async function diagnose() {
    console.log('================================================================');
    console.log('            USER COUNT & ROLE DIAGNOSTIC REPORT                 ');
    console.log('================================================================');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.\n');

    // 1. Raw Mongoose & MongoDB Collection Counts
    const db = mongoose.connection.db;
    const totalUsersInMongo = await db.collection('users').countDocuments();
    const totalUsersViaModel = await User.countDocuments({});
    const totalEmployees = await db.collection('employees').countDocuments();

    console.log(`📊 Total documents in 'users' collection (raw MongoDB): ${totalUsersInMongo}`);
    console.log(`📊 Total documents in User model (Mongoose)          : ${totalUsersViaModel}`);
    console.log(`📊 Total documents in 'employees' collection        : ${totalEmployees}\n`);

    // 2. Count by Role Filters
    const adminExact = await User.countDocuments({ role: 'admin' });
    const adminCaseInsensitive = await User.countDocuments({ role: /^admin$/i });
    const notAdminNe = await User.countDocuments({ role: { $ne: 'admin' } });
    const roleUser = await User.countDocuments({ role: 'user' });
    const roleVirtual = await User.countDocuments({ role: 'virtual' });
    const roleNullOrUndefined = await User.countDocuments({ $or: [{ role: null }, { role: { $exists: false } }] });

    console.log('--- Role Filter Breakdown ---');
    console.log(`- role: 'admin' (exact)                : ${adminExact}`);
    console.log(`- role: /^admin$/i (case-insensitive) : ${adminCaseInsensitive}`);
    console.log(`- role: { $ne: 'admin' }               : ${notAdminNe}`);
    console.log(`- role: 'user'                         : ${roleUser}`);
    console.log(`- role: 'virtual'                      : ${roleVirtual}`);
    console.log(`- role: null or missing                : ${roleNullOrUndefined}`);
    console.log(`- Sum of (role === 'admin' + role !== 'admin') = ${adminExact + notAdminNe}\n`);

    // 3. List EVERY user with full details
    const allUsersRaw = await db.collection('users').find({}).toArray();
    console.log(`--- All ${allUsersRaw.length} Users in 'users' Collection (Raw Data) ---`);
    allUsersRaw.forEach((u, i) => {
        console.log(`[#${i + 1}] ID: ${u._id}`);
        console.log(`     Name          : ${u.name}`);
        console.log(`     Email         : ${u.email}`);
        console.log(`     Phone         : ${u.phone || 'N/A'}`);
        console.log(`     Raw role field: ${JSON.stringify(u.role)} (type: ${typeof u.role})`);
        console.log(`     isVirtual     : ${u.isVirtual}`);
        console.log(`     referralCode  : ${u.referralCode}`);
        console.log(`     createdAt     : ${u.createdAt}`);
        console.log('----------------------------------------------------------------');
    });

    // 4. Check Employees collection
    if (totalEmployees > 0) {
        const allEmployees = await db.collection('employees').find({}).toArray();
        console.log(`\n--- All ${allEmployees.length} Employees in 'employees' Collection ---`);
        allEmployees.forEach((e, i) => {
            console.log(`[#${i + 1}] ID: ${e._id} | Name: ${e.name} | Email: ${e.email} | Role/Designation: ${e.designation} | Status: ${e.status}`);
        });
    }

    // 5. Check all collections in the DB
    const collections = await db.listCollections().toArray();
    console.log('\n--- All Collections in Database ---');
    for (const c of collections) {
        const count = await db.collection(c.name).countDocuments();
        console.log(`- ${c.name.padEnd(25)}: ${count} documents`);
    }

    await mongoose.disconnect();
}

diagnose().catch(err => {
    console.error('Diagnostic error:', err);
    process.exit(1);
});
