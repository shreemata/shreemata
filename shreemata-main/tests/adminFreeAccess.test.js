/** @jest-environment node */
// tests/adminFreeAccess.test.js
// Automated verification for Admin "Grant Free Access" feature

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const AdminSettings = require('../models/AdminSettings');
const { FEATURES } = require('../config/features');

describe('Admin Free Access Grants', () => {
  let server;
  let client;
  let testStorageDir;
  let samplePdfKey = 'sample_grant_test_note.pdf';

  let adminUser, adminToken;
  let studentUser, studentToken;
  let otherStudentUser, otherStudentToken;
  let paidStudentUser, paidStudentToken;

  let paidNote, paidQp, paidVideo;

  const JWT_SECRET = 'test_jwt_secret_grants_42';

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.ENABLE_READ_NOTES = 'true';
    process.env.ENABLE_QUESTION_PAPERS = 'true';
    process.env.ENABLE_VIDEOS = 'true';

    testStorageDir = path.resolve(__dirname, '../storage/notes/private');
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
    const pdfDoc = await PDFDocument.create();
    for (let p = 1; p <= 3; p++) {
      pdfDoc.addPage([400, 600]);
    }
    const validPdfBytes = await pdfDoc.save();
    fs.writeFileSync(samplePdfPath, validPdfBytes);

    const app = express();
    app.use(express.json());
    app.use('/api/subscriptions', require('../routes/subscriptions'));
    app.use('/api/notes', require('../routes/notes'));

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        client = axios.create({
          baseURL: `http://127.0.0.1:${port}`,
          validateStatus: () => true
        });
        resolve();
      });
    });

    adminUser = await User.create({
      name: 'Admin Boss',
      email: 'admin@school.test',
      phone: '9111111111',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET);

    studentUser = await User.create({
      name: 'Eager Student',
      email: 'student@school.test',
      phone: '9222222222',
      password: 'password123',
      role: 'user'
    });
    studentToken = jwt.sign({ id: studentUser._id, role: 'user' }, JWT_SECRET);

    otherStudentUser = await User.create({
      name: 'Second Student',
      email: 'second@school.test',
      phone: '9333333333',
      password: 'password123',
      role: 'user'
    });
    otherStudentToken = jwt.sign({ id: otherStudentUser._id, role: 'user' }, JWT_SECRET);

    paidStudentUser = await User.create({
      name: 'Paying Student',
      email: 'paying@school.test',
      phone: '9444444444',
      password: 'password123',
      role: 'user'
    });
    paidStudentToken = jwt.sign({ id: paidStudentUser._id, role: 'user' }, JWT_SECRET);

    // Create paid content items
    paidNote = await Note.create({
      title: 'Premium Physics Notes',
      description: 'Full syllabus formulas',
      subject: 'Physics',
      classLevel: 'Class 12',
      section: 'notes',
      pdfUrl: samplePdfKey,
      isFree: false,
      previewPages: 0,
      isPublished: true,
      totalPages: 10
    });

    paidQp = await Note.create({
      title: 'Premium Chemistry Exam Paper',
      description: 'Board Exam 2024',
      subject: 'Chemistry',
      classLevel: 'Class 12',
      section: 'question_papers',
      pdfUrl: samplePdfKey,
      isFree: false,
      previewPages: 0,
      isPublished: true,
      totalPages: 5
    });

    paidVideo = await Note.create({
      title: 'Premium Calculus Masterclass',
      description: 'Derivatives and integrals',
      subject: 'Mathematics',
      classLevel: 'Class 12',
      section: 'videos',
      videoUrl: 'https://iframe.mediadelivery.net/play/123/calc-vid',
      videoProvider: 'bunny',
      isFree: false,
      isPublished: true
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
    if (fs.existsSync(samplePdfPath)) {
      try { fs.unlinkSync(samplePdfPath); } catch (_) {}
    }
    await teardownTestDB();
  });

  test('1. Unauthenticated request to grant returns 401', async () => {
    const res = await client.post('/api/subscriptions/admin/grant', {
      email: 'student@school.test',
      section: 'notes',
      durationDays: 30
    });
    expect(res.status).toBe(401);
  });

  test('2. Non-admin user request to grant returns 403', async () => {
    const res = await client.post(
      '/api/subscriptions/admin/grant',
      {
        email: 'second@school.test',
        section: 'notes',
        durationDays: 30
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(res.status).toBe(403);
  });

  test('3. Invalid section, durationDays, or missing email returns 400', async () => {
    // Missing email
    let res = await client.post(
      '/api/subscriptions/admin/grant',
      { section: 'notes', durationDays: 30 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/email/i);

    // Invalid section
    res = await client.post(
      '/api/subscriptions/admin/grant',
      { email: 'student@school.test', section: 'invalid_section', durationDays: 30 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/section/i);

    // Negative duration
    res = await client.post(
      '/api/subscriptions/admin/grant',
      { email: 'student@school.test', section: 'notes', durationDays: -5 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/duration/i);

    // Duration > 3650
    res = await client.post(
      '/api/subscriptions/admin/grant',
      { email: 'student@school.test', section: 'notes', durationDays: 5000 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/duration/i);
  });

  test('4. Unknown user email returns 404', async () => {
    const res = await client.post(
      '/api/subscriptions/admin/grant',
      { email: 'nonexistent_user@school.test', section: 'notes', durationDays: 30 },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBe(404);
    expect(res.data.error).toMatch(/user not found/i);
  });

  test('5. Successful grant -> returns 201, student can immediately read paid notes/videos of that section', async () => {
    // Before grant: student gets 403 on paid note
    let accessCheck = await client.get(`/api/notes/${paidNote._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(accessCheck.status).toBe(403);

    // Admin grants free access for notes for 30 days
    const grantRes = await client.post(
      '/api/subscriptions/admin/grant',
      {
        email: 'STUDENT@school.test', // test case insensitivity
        section: 'notes',
        durationDays: 30,
        note: 'Review access for student'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(grantRes.status).toBe(201);
    expect(grantRes.data.success).toBe(true);
    expect(grantRes.data.subscription).toBeDefined();
    expect(grantRes.data.subscription.planType).toBe('admin_grant');
    expect(grantRes.data.subscription.amountPaid).toBe(0);

    // Immediately after grant: student can read paid note
    accessCheck = await client.get(`/api/notes/${paidNote._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(accessCheck.status).toBe(200);

    // Student status check
    const statusRes = await client.get('/api/subscriptions/my-status?section=notes', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.hasActiveSubscription).toBe(true);
    expect(statusRes.data.isGrantedByAdmin).toBe(true);
    expect(statusRes.data.subscription.note).toBe('Review access for student');
  });

  test('6. Section isolation: grant for "notes" does NOT grant access to "question_papers" or "videos"', async () => {
    // Student has active grant for 'notes', but should still be 403 for 'question_papers'
    const qpCheck = await client.get(`/api/notes/${paidQp._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(qpCheck.status).toBe(403);
    expect(qpCheck.data.section).toBe('question_papers');

    // And 403 for 'videos'
    const videoCheck = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(videoCheck.status).toBe(403);
    expect(videoCheck.data.section).toBe('videos');
  });

  test('7. Extending an existing grant -> extends expiry date, no duplicate active record', async () => {
    const activeBefore = await NoteSubscription.find({
      userId: studentUser._id,
      section: 'notes',
      status: 'active'
    });
    expect(activeBefore.length).toBe(1);
    const initialExpiry = new Date(activeBefore[0].expiresAt).getTime();

    // Extend by 15 days
    const extendRes = await client.post(
      '/api/subscriptions/admin/grant',
      {
        email: 'student@school.test',
        section: 'notes',
        durationDays: 15,
        note: 'Bonus extension'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(extendRes.status).toBe(200);
    expect(extendRes.data.extended).toBe(true);

    const activeAfter = await NoteSubscription.find({
      userId: studentUser._id,
      section: 'notes',
      status: 'active'
    });
    expect(activeAfter.length).toBe(1); // strictly 1, no duplicate E11000 collision

    const updatedExpiry = new Date(activeAfter[0].expiresAt).getTime();
    const diffDays = Math.round((updatedExpiry - initialExpiry) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(15);
    expect(activeAfter[0].note).toBe('Bonus extension');
  });

  test('8. Revoking grant -> terminates access immediately, student gets 403, status is cancelled', async () => {
    const grant = await NoteSubscription.findOne({
      userId: studentUser._id,
      section: 'notes',
      status: 'active'
    });
    expect(grant).not.toBeNull();

    // Revoke via POST /api/subscriptions/admin/grants/:id/revoke
    const revokeRes = await client.post(
      `/api/subscriptions/admin/grants/${grant._id}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.data.success).toBe(true);

    // Verify DB record
    const updatedSub = await NoteSubscription.findById(grant._id);
    expect(updatedSub.status).toBe('cancelled');
    expect(updatedSub.revokedBy.toString()).toBe(adminUser._id.toString());
    expect(updatedSub.revokedAt).toBeDefined();

    // Student access should be immediately cut off (403)
    const accessCheck = await client.get(`/api/notes/${paidNote._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(accessCheck.status).toBe(403);

    // Revoking already cancelled grant returns 400
    const reRevokeRes = await client.post(
      `/api/subscriptions/admin/grants/${grant._id}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(reRevokeRes.status).toBe(400);
  });

  test('9. Expired grant -> student loses access automatically', async () => {
    // Create an already-expired grant
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const expiredGrant = await NoteSubscription.create({
      userId: otherStudentUser._id,
      section: 'videos',
      planType: 'admin_grant',
      durationDays: 7,
      amountPaid: 0,
      status: 'active',
      startDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      expiresAt: pastDate,
      grantedBy: adminUser._id,
      grantedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
    });

    const videoCheck = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
      headers: { Authorization: `Bearer ${otherStudentToken}` }
    });
    expect(videoCheck.status).toBe(403);

    // Trying to revoke an already expired grant returns 400
    const revokeRes = await client.delete(
      `/api/subscriptions/admin/grants/${expiredGrant._id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(revokeRes.status).toBe(400);
    expect(revokeRes.data.error).toMatch(/already expired or cancelled/i);
  });

  test('10. Cannot revoke a paid customer subscription via admin grants endpoint -> 400', async () => {
    // Create a paid subscription
    const paidSub = await NoteSubscription.create({
      userId: paidStudentUser._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active',
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      razorpayOrderId: 'order_test_999999',
      razorpayPaymentId: 'pay_test_999999',
      razorpaySignature: 'sig_test_999999'
    });

    const revokeRes = await client.post(
      `/api/subscriptions/admin/grants/${paidSub._id}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(revokeRes.status).toBe(400);
    expect(revokeRes.data.error).toMatch(/cannot revoke a paid customer subscription/i);

    // Verify paid sub remains active
    const checkSub = await NoteSubscription.findById(paidSub._id);
    expect(checkSub.status).toBe('active');
  });

  test('11. GET /api/subscriptions/admin/grants list, filter, search', async () => {
    // Non-admin gets 403
    let res = await client.get('/api/subscriptions/admin/grants', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(res.status).toBe(403);

    // Admin gets list
    res = await client.get('/api/subscriptions/admin/grants', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.grants)).toBe(true);
    expect(res.data.grants.length).toBeGreaterThan(0);

    // Filter by section
    res = await client.get('/api/subscriptions/admin/grants?section=videos', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    res.data.grants.forEach(g => {
      expect(g.section).toBe('videos');
    });

    // Search by email
    res = await client.get('/api/subscriptions/admin/grants?search=second@school', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    expect(res.data.grants.length).toBe(1);
    expect(res.data.grants[0].user.email).toBe('second@school.test');
  });

  test('12. Grant to user with active paid subscription returns 409 and record is byte-for-byte unchanged', async () => {
    // Find the active paid subscription of paidStudentUser
    const paidSub = await NoteSubscription.findOne({
      userId: paidStudentUser._id,
      section: 'notes',
      status: 'active'
    });
    expect(paidSub).not.toBeNull();

    const beforeDoc = await NoteSubscription.findById(paidSub._id).lean();

    // Attempt to grant access to notes for this paid student
    const grantRes = await client.post(
      '/api/subscriptions/admin/grant',
      {
        email: paidStudentUser.email,
        section: 'notes',
        durationDays: 30,
        note: 'Attempting to overwrite paid subscription'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    // Expect 409 Conflict with clear error message
    expect(grantRes.status).toBe(409);
    expect(grantRes.data.error).toMatch(/Member already has paid access to notes until/i);

    // Verify document in MongoDB is byte-for-byte unchanged
    const afterDoc = await NoteSubscription.findById(paidSub._id).lean();
    expect(JSON.stringify(afterDoc)).toBe(JSON.stringify(beforeDoc));
    expect(afterDoc.expiresAt.toISOString()).toBe(beforeDoc.expiresAt.toISOString());
    expect(afterDoc.grantedBy).toBeUndefined();
    expect(afterDoc.note).toBeUndefined();
  });

  test('13. A user whose paid subscription has expired CAN be granted free access', async () => {
    const expiredPaidStudent = await User.create({
      name: 'Expired Paid Student',
      email: 'expiredpaid@school.test',
      phone: '9555555555',
      password: 'password123',
      role: 'user'
    });

    const pastExpiry = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const pastStart = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

    const oldPaidSub = await NoteSubscription.create({
      userId: expiredPaidStudent._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active', // expired by date
      startDate: pastStart,
      expiresAt: pastExpiry,
      razorpayOrderId: 'order_test_old_111',
      razorpayPaymentId: 'pay_test_old_111',
      razorpaySignature: 'sig_test_old_111'
    });

    // Admin grants free access to notes for 45 days
    const grantRes = await client.post(
      '/api/subscriptions/admin/grant',
      {
        email: expiredPaidStudent.email,
        section: 'notes',
        durationDays: 45,
        note: 'Special grant after paid plan expired'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(grantRes.status).toBe(201);
    expect(grantRes.data.success).toBe(true);
    expect(grantRes.data.subscription).toBeDefined();
    expect(grantRes.data.subscription.planType).toBe('admin_grant');
    expect(grantRes.data.subscription.amountPaid).toBe(0);

    // Verify the old paid subscription is still intact
    const originalSub = await NoteSubscription.findById(oldPaidSub._id).lean();
    expect(originalSub.planType).toBe('standard');
    expect(originalSub.amountPaid).toBe(99);

    // Verify new grant is active and unlocks access
    const activeGrant = await NoteSubscription.findOne({
      userId: expiredPaidStudent._id,
      section: 'notes',
      status: 'active',
      planType: 'admin_grant'
    });
    expect(activeGrant).not.toBeNull();
    expect(activeGrant.durationDays).toBe(45);
    expect(activeGrant.note).toBe('Special grant after paid plan expired');
  });
});
