// tests/sectionContentAndSubscriptions.test.js
// Comprehensive test suite for 4-Section platform: Content Access, Subscriptions, Security, and Migrations

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const AdminSettings = require('../models/AdminSettings');
const { FEATURES } = require('../config/features');

// Mock Razorpay SDK before loading routes
const mockRazorpayOrdersCreate = jest.fn();
const mockRazorpayPaymentsFetch = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: mockRazorpayOrdersCreate
    },
    payments: {
      fetch: mockRazorpayPaymentsFetch
    }
  }));
});

describe('4-Section Platform: Content, Access Control, and Subscriptions', () => {
  let server;
  let client;
  let testStorageDir;
  let samplePdfKey = 'sample_test_note.pdf';

  let adminUser, adminToken;
  let guestUser, guestToken;
  let notesUser, notesToken;
  let qpUser, qpToken;
  let videosUser, videosToken;
  let allSubUser, allSubToken;
  let expiredUser, expiredToken;

  let freeNote, paidNote, unpublishedNote;
  let freeQp, paidQp;
  let freeVideo, paidVideo;
  let legacyNote, legacySub;

  const JWT_SECRET = 'test_jwt_secret_four_sections_42';
  const RZP_KEY_ID = 'rzp_test_key_12345';
  const RZP_KEY_SECRET = 'rzp_test_secret_67890';

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_KEY_ID = RZP_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = RZP_KEY_SECRET;

    // Feature flags on by default for testing
    process.env.ENABLE_READ_NOTES = 'true';
    process.env.ENABLE_QUESTION_PAPERS = 'true';
    process.env.ENABLE_VIDEOS = 'true';

    // Prepare private storage directory and valid PDF fixture
    testStorageDir = path.resolve(__dirname, '../storage/notes/private');
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
    const validPdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
    );
    fs.writeFileSync(samplePdfPath, validPdfBytes);

    // Setup Express App with 4-Section routers
    const app = express();
    app.use(express.json());
    app.get('/api/features', (req, res) => {
      res.json({ success: true, features: FEATURES });
    });
    app.use('/api/subscriptions', require('../routes/subscriptions'));
    app.use('/api/notes', require('../routes/notes'));
    app.use('/api/admin', require('../routes/adminSettings'));
    app.use('/api/categories', require('../routes/categories'));
    app.use('/api/books', require('../routes/books'));

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

    // Seed test users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@shreemata.test',
      phone: '9000000001',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET);

    guestUser = await User.create({
      name: 'Guest User',
      email: 'guest@shreemata.test',
      phone: '9000000002',
      password: 'password123',
      role: 'user'
    });
    guestToken = jwt.sign({ id: guestUser._id, role: 'user' }, JWT_SECRET);

    notesUser = await User.create({
      name: 'Notes Only User',
      email: 'notes@shreemata.test',
      phone: '9000000003',
      password: 'password123',
      role: 'user'
    });
    notesToken = jwt.sign({ id: notesUser._id, role: 'user' }, JWT_SECRET);

    qpUser = await User.create({
      name: 'QP Only User',
      email: 'qp@shreemata.test',
      phone: '9000000004',
      password: 'password123',
      role: 'user'
    });
    qpToken = jwt.sign({ id: qpUser._id, role: 'user' }, JWT_SECRET);

    videosUser = await User.create({
      name: 'Videos Only User',
      email: 'videos@shreemata.test',
      phone: '9000000005',
      password: 'password123',
      role: 'user'
    });
    videosToken = jwt.sign({ id: videosUser._id, role: 'user' }, JWT_SECRET);

    allSubUser = await User.create({
      name: 'All Sections User',
      email: 'allsub@shreemata.test',
      phone: '9000000006',
      password: 'password123',
      role: 'user'
    });
    allSubToken = jwt.sign({ id: allSubUser._id, role: 'user' }, JWT_SECRET);

    expiredUser = await User.create({
      name: 'Expired User',
      email: 'expired@shreemata.test',
      phone: '9000000007',
      password: 'password123',
      role: 'user'
    });
    expiredToken = jwt.sign({ id: expiredUser._id, role: 'user' }, JWT_SECRET);

    // Seed AdminSettings
    await AdminSettings.deleteMany({});
    await AdminSettings.create({
      readNotesSubscriptionSettings: {
        monthlyPrice: 99,
        enabled: true,
        description: 'Monthly notes subscription'
      },
      sectionSubscriptionPlans: {
        notes: {
          name: 'Study Notes Pass',
          price: 99,
          durationDays: 30,
          active: true,
          description: 'Unlimited notes access'
        },
        question_papers: {
          name: 'Question Papers Pass',
          price: 99,
          durationDays: 30,
          active: true,
          description: 'Unlimited question papers'
        },
        videos: {
          name: 'Video Lectures Pass',
          price: 199,
          durationDays: 30,
          active: true,
          description: 'Unlimited video lectures'
        }
      }
    });

    // Seed Notes: free, paid, unpublished
    freeNote = await Note.create({
      section: 'notes',
      title: 'Free Trigonometry Notes',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Formula Sheet',
      pdfUrl: samplePdfKey,
      fileSize: 1024,
      totalPages: 2,
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    paidNote = await Note.create({
      section: 'notes',
      title: 'Paid Algebra Mastery Notes',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Study Notes',
      pdfUrl: samplePdfKey,
      fileSize: 2048,
      totalPages: 10,
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    unpublishedNote = await Note.create({
      section: 'notes',
      title: 'Draft Unreleased Physics Notes',
      subject: 'Science',
      classLevel: 'Class 10',
      category: 'Study Notes',
      pdfUrl: samplePdfKey,
      fileSize: 2048,
      totalPages: 10,
      isFree: false,
      order: 3,
      isPublished: false,
      uploadedBy: adminUser._id
    });

    // Seed Question Papers: free, paid
    freeQp = await Note.create({
      section: 'question_papers',
      title: 'Free Model Paper 2025',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Model Papers',
      pdfUrl: samplePdfKey,
      fileSize: 1024,
      totalPages: 5,
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    paidQp = await Note.create({
      section: 'question_papers',
      title: 'Paid 5-Year Solved Papers',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Solved Papers',
      pdfUrl: samplePdfKey,
      fileSize: 5120,
      totalPages: 40,
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    // Seed Videos: free (Bunny), paid (Bunny)
    freeVideo = await Note.create({
      section: 'videos',
      title: 'Free Intro to Geometry',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Intro Video',
      videoUrl: 'https://iframe.mediadelivery.net/play/100/free-geom',
      videoProvider: 'bunny',
      durationMinutes: 15,
      pdfUrl: '',
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    paidVideo = await Note.create({
      section: 'videos',
      title: 'Paid Full Geometry Masterclass',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Masterclass',
      videoUrl: 'https://iframe.mediadelivery.net/play/100/paid-geom',
      videoProvider: 'bunny',
      durationMinutes: 60,
      pdfUrl: '',
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    // Seed Subscriptions
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 86400000);
    const past = new Date(now.getTime() - 2 * 86400000);

    // notesUser: active notes sub
    await NoteSubscription.create({
      userId: notesUser._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active',
      startDate: now,
      expiresAt: future,
      razorpayOrderId: 'ord_notes_active',
      razorpayPaymentId: 'pay_notes_active',
      razorpaySignature: 'sig_notes_active',
      subscriptionIndex: 1
    });

    // qpUser: active question_papers sub
    await NoteSubscription.create({
      userId: qpUser._id,
      section: 'question_papers',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active',
      startDate: now,
      expiresAt: future,
      razorpayOrderId: 'ord_qp_active',
      razorpayPaymentId: 'pay_qp_active',
      razorpaySignature: 'sig_qp_active',
      subscriptionIndex: 1
    });

    // videosUser: active videos sub
    await NoteSubscription.create({
      userId: videosUser._id,
      section: 'videos',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 199,
      status: 'active',
      startDate: now,
      expiresAt: future,
      razorpayOrderId: 'ord_vid_active',
      razorpayPaymentId: 'pay_vid_active',
      razorpaySignature: 'sig_vid_active',
      subscriptionIndex: 1
    });

    // expiredUser: expired notes sub
    await NoteSubscription.create({
      userId: expiredUser._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'expired',
      startDate: new Date(now.getTime() - 32 * 86400000),
      expiresAt: past,
      razorpayOrderId: 'ord_exp_active',
      razorpayPaymentId: 'pay_exp_active',
      razorpaySignature: 'sig_exp_active',
      subscriptionIndex: 1
    });
  });

  afterAll(async () => {
    if (server) await new Promise((res) => server.close(res));
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
    if (fs.existsSync(samplePdfPath)) {
      try { fs.unlinkSync(samplePdfPath); } catch (_) {}
    }
    await teardownTestDB();
  });

  // Helper for generating valid Razorpay HMAC signatures
  function generateSignature(orderId, paymentId) {
    return crypto
      .createHmac('sha256', RZP_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  // =========================================================================
  // SCENARIO 1: Guest + Free item -> 200 OK
  // =========================================================================
  describe('1. guest + free ok', () => {
    it('allows unauthenticated guest to stream a free note PDF', async () => {
      const res = await client.get(`/api/notes/${freeNote._id}/stream`, {
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('allows unauthenticated guest to get media-url for a free video', async () => {
      const res = await client.get(`/api/notes/${freeVideo._id}/media-url`);
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('provider', 'bunny');
      expect(res.data).toHaveProperty('url', 'https://iframe.mediadelivery.net/play/100/free-geom');
    });
  });

  // =========================================================================
  // SCENARIO 2: Guest + Paid item -> 401 Unauthorized
  // =========================================================================
  describe('2. guest + paid 401', () => {
    it('returns 401 Unauthorized when guest attempts to stream paid PDF', async () => {
      const res = await client.get(`/api/notes/${paidNote._id}/stream`);
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/Authentication required/i);
    });

    it('returns 401 Unauthorized when guest attempts to get media-url for paid video', async () => {
      const res = await client.get(`/api/notes/${paidVideo._id}/media-url`);
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/Authentication required/i);
    });

    it('returns 401 when invalid Bearer token is provided for paid item (treated as guest)', async () => {
      const res = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: 'Bearer totally_invalid_token' }
      });
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/Authentication required/i);
    });
  });

  // =========================================================================
  // SCENARIO 3: Expired subscription -> 403 Forbidden
  // =========================================================================
  describe('3. expired 403', () => {
    it('returns 403 SUBSCRIPTION_REQUIRED for user with expired subscription', async () => {
      const res = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.data.section).toBe('notes');
    });
  });

  // =========================================================================
  // SCENARIO 4: Cross-section access -> 403 Forbidden
  // =========================================================================
  describe('4. cross-section 403', () => {
    it('refuses notes subscriber access to paid question papers', async () => {
      const res = await client.get(`/api/notes/${paidQp._id}/stream`, {
        headers: { Authorization: `Bearer ${notesToken}` }
      });
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.data.section).toBe('question_papers');
    });

    it('allows question_papers subscriber to stream paid question paper', async () => {
      const res = await client.get(`/api/notes/${paidQp._id}/stream`, {
        headers: { Authorization: `Bearer ${qpToken}` },
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // =========================================================================
  // SCENARIO 5: Notes subscriber cannot open videos -> 403 Forbidden
  // =========================================================================
  describe('5. notes-sub cannot open videos', () => {
    it('refuses notes subscriber access to paid video media-url', async () => {
      const res = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
        headers: { Authorization: `Bearer ${notesToken}` }
      });
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.data.section).toBe('videos');
    });

    it('allows videos subscriber access to paid video media-url', async () => {
      const res = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
        headers: { Authorization: `Bearer ${videosToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.provider).toBe('bunny');
      expect(res.data.url).toBe('https://iframe.mediadelivery.net/play/100/paid-geom');
    });
  });

  // =========================================================================
  // SCENARIO 6: Concurrent notes + videos purchases with no E11000
  // =========================================================================
  describe('6. concurrent notes+videos purchases both active with no E11000', () => {
    it('allows concurrent active subscriptions in notes and videos for the same user', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 86400000);

      // Create active notes sub for allSubUser
      const subNotes = await NoteSubscription.create({
        userId: allSubUser._id,
        section: 'notes',
        planType: 'standard',
        durationDays: 30,
        amountPaid: 99,
        status: 'active',
        startDate: now,
        expiresAt: expiresAt,
        razorpayOrderId: 'ord_concurrent_notes',
        razorpayPaymentId: 'pay_concurrent_notes',
        razorpaySignature: 'sig_concurrent_notes',
        subscriptionIndex: 1
      });

      // Create active videos sub for allSubUser with same expiresAt and subscriptionIndex
      const subVideos = await NoteSubscription.create({
        userId: allSubUser._id,
        section: 'videos',
        planType: 'standard',
        durationDays: 30,
        amountPaid: 199,
        status: 'active',
        startDate: now,
        expiresAt: expiresAt,
        razorpayOrderId: 'ord_concurrent_videos',
        razorpayPaymentId: 'pay_concurrent_videos',
        razorpaySignature: 'sig_concurrent_videos',
        subscriptionIndex: 1
      });

      expect(subNotes._id).toBeDefined();
      expect(subVideos._id).toBeDefined();
      expect(subNotes.section).toBe('notes');
      expect(subVideos.section).toBe('videos');

      // Verify allSubUser can access both paid notes and paid videos
      const resNote = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${allSubToken}` },
        responseType: 'arraybuffer'
      });
      expect(resNote.status).toBe(200);

      const resVideo = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
        headers: { Authorization: `Bearer ${allSubToken}` }
      });
      expect(resVideo.status).toBe(200);
    });
  });

  // =========================================================================
  // SCENARIO 7: Replay idempotency on verify-order
  // =========================================================================
  describe('7. replay idempotency', () => {
    it('returns duplicate: true on repeated verification and does not create duplicate subscriptions', async () => {
      const orderId = 'order_replay_test_001';
      const paymentId = 'pay_replay_test_001';
      const signature = generateSignature(orderId, paymentId);

      // Create pre-existing order and active subscription
      const subOrder = await SubscriptionOrder.create({
        userId: guestUser._id,
        section: 'notes',
        durationDays: 30,
        amountPaise: 9900,
        amountRupees: 99,
        currency: 'INR',
        razorpayOrderId: orderId,
        status: 'created'
      });

      mockRazorpayPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'INR',
        amount: 9900
      });

      // First verification: should succeed and create subscription
      const res1 = await client.post(
        '/api/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${guestToken}` } }
      );

      expect(res1.status).toBe(200);
      expect(res1.data.success).toBe(true);
      expect(res1.data.duplicate).toBeUndefined();

      const initialCount = await NoteSubscription.countDocuments({ razorpayPaymentId: paymentId });
      expect(initialCount).toBe(1);

      // Replay / second verification: should return duplicate: true without creating new record
      const res2 = await client.post(
        '/api/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        },
        { headers: { Authorization: `Bearer ${guestToken}` } }
      );

      expect(res2.status).toBe(200);
      expect(res2.data.success).toBe(true);
      expect(res2.data.duplicate).toBe(true);
      expect(res2.data.message).toMatch(/already active/i);

      const finalCount = await NoteSubscription.countDocuments({ razorpayPaymentId: paymentId });
      expect(finalCount).toBe(1);
    });
  });

  // =========================================================================
  // SCENARIO 8: Client-sent section ignored on verify-order
  // =========================================================================
  describe('8. client-sent section ignored on verify', () => {
    it('uses subOrder.section exclusively even if client sends different section in verify body', async () => {
      const orderId = 'order_ignore_client_sec_002';
      const paymentId = 'pay_ignore_client_sec_002';
      const signature = generateSignature(orderId, paymentId);

      // Server order was created for 'notes'
      await SubscriptionOrder.create({
        userId: guestUser._id,
        section: 'notes',
        durationDays: 30,
        amountPaise: 9900,
        amountRupees: 99,
        currency: 'INR',
        razorpayOrderId: orderId,
        status: 'created'
      });

      mockRazorpayPaymentsFetch.mockResolvedValueOnce({
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        currency: 'INR',
        amount: 9900
      });

      // Malicious or mismatched client passes section: 'videos'
      const res = await client.post(
        '/api/subscriptions/verify-order',
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          section: 'videos' // SHOULD BE IGNORED
        },
        { headers: { Authorization: `Bearer ${guestToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const createdSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
      expect(createdSub).toBeDefined();
      expect(createdSub.section).toBe('notes'); // STRICT SERVER ENFORCEMENT
    });
  });

  // =========================================================================
  // SCENARIO 9: Inactive plan -> create-order rejected (400)
  // =========================================================================
  describe('9. question_papers/videos plan inactive -> create-order rejected', () => {
    it('rejects create-order if the section plan is marked inactive in AdminSettings', async () => {
      // Disable question_papers plan in AdminSettings
      await AdminSettings.updateOne({}, { $set: { 'sectionSubscriptionPlans.question_papers.active': false } });

      const res = await client.post(
        '/api/subscriptions/create-order',
        { section: 'question_papers' },
        { headers: { Authorization: `Bearer ${guestToken}` } }
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/disabled|unavailable/i);

      // Restore active flag
      await AdminSettings.updateOne({}, { $set: { 'sectionSubscriptionPlans.question_papers.active': true } });
    });
  });

  // =========================================================================
  // SCENARIO 10: Disabled feature flags -> 404 for non-admins
  // =========================================================================
  describe('10. disabled flags -> 404', () => {
    afterEach(() => {
      process.env.ENABLE_QUESTION_PAPERS = 'true';
      process.env.ENABLE_VIDEOS = 'true';
    });

    it('returns 404 when non-admin requests a section whose feature flag is false', async () => {
      process.env.ENABLE_QUESTION_PAPERS = 'false';

      const res = await client.get('/api/notes?section=question_papers', {
        headers: { Authorization: `Bearer ${guestToken}` }
      });
      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/disabled|not available/i);
    });

    it('allows admin to access catalog even when feature flag is false', async () => {
      process.env.ENABLE_QUESTION_PAPERS = 'false';

      const res = await client.get('/api/notes?section=question_papers', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('notes');
    });
  });

  // =========================================================================
  // SCENARIO 11: List endpoints never leak pdfUrl or videoUrl
  // =========================================================================
  describe('11. list endpoints never leak pdfUrl/videoUrl', () => {
    it('strictly omits pdfUrl and videoUrl from GET /api/notes catalog response', async () => {
      const res = await client.get('/api/notes?section=notes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.notes)).toBe(true);
      expect(res.data.notes.length).toBeGreaterThan(0);

      for (const item of res.data.notes) {
        expect(item.pdfUrl).toBeUndefined();
        expect(item.videoUrl).toBeUndefined();
        expect(item.id).toBeDefined();
        expect(item.title).toBeDefined();
      }
    });

    it('strictly omits pdfUrl and videoUrl from GET /api/notes/:id metadata endpoint', async () => {
      const res = await client.get(`/api/notes/${paidNote._id}`);
      expect(res.status).toBe(200);
      expect(res.data.note).toBeDefined();
      expect(res.data.note.pdfUrl).toBeUndefined();
      expect(res.data.note.videoUrl).toBeUndefined();
      expect(res.data.note.id).toBe(paidNote._id.toString());
      expect(res.data.note.title).toBe(paidNote.title);
    });
  });

  // =========================================================================
  // SCENARIO 12: Video URL Validation
  // =========================================================================
  describe('12. video URL validation', () => {
    it('rejects javascript: protocol URLs', async () => {
      const res = await client.post(
        '/api/notes',
        {
          section: 'videos',
          title: 'Exploit Video',
          videoUrl: 'javascript:alert(1)',
          videoProvider: 'bunny',
          isFree: true
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/HTTPS|URL/i);
    });

    it('rejects unencrypted http:// URLs', async () => {
      const res = await client.post(
        '/api/notes',
        {
          section: 'videos',
          title: 'HTTP Video',
          videoUrl: 'http://iframe.mediadelivery.net/play/123/video',
          videoProvider: 'bunny',
          isFree: true
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/HTTPS/i);
    });

    it('rejects untrusted/unknown video hosts', async () => {
      const res = await client.post(
        '/api/notes',
        {
          section: 'videos',
          title: 'Untrusted Host Video',
          videoUrl: 'https://malicious-site.com/video.mp4',
          videoProvider: 'none',
          isFree: true
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/not in the allowed video provider list/i);
    });

    it('rejects YouTube URLs for paid video items', async () => {
      const res = await client.post(
        '/api/notes',
        {
          section: 'videos',
          title: 'Paid YouTube Video',
          videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          videoProvider: 'youtube_unlisted',
          isFree: false // PAID ITEM WITH YOUTUBE IS FORBIDDEN
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/YouTube unlisted videos are only permitted for free preview items/i);
    });

    it('accepts allowed Bunny CDN HTTPS URLs for paid items', async () => {
      const res = await client.post(
        '/api/notes',
        {
          section: 'videos',
          title: 'Valid Bunny Paid Video',
          videoUrl: 'https://iframe.mediadelivery.net/play/12345/valid-stream',
          videoProvider: 'bunny',
          durationMinutes: 45,
          isFree: false
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(201);
      expect(res.data.note).toBeDefined();
      expect(res.data.note.section).toBe('videos');
    });
  });

  // =========================================================================
  // SCENARIO 13: Admin bypass
  // =========================================================================
  describe('13. admin bypass', () => {
    it('allows admin to stream paid PDF notes without any active subscription', async () => {
      const res = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('allows admin to stream unpublished/draft note without active subscription', async () => {
      const res = await client.get(`/api/notes/${unpublishedNote._id}/stream`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('allows admin to get media-url for paid video without active subscription', async () => {
      const res = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.provider).toBe('bunny');
      expect(res.data.url).toBe(paidVideo.videoUrl);
    });
  });

  // =========================================================================
  // SCENARIO 14: Path traversal protection
  // =========================================================================
  describe('14. path traversal on stream', () => {
    it('rejects attempts to stream notes containing directory traversal sequences', async () => {
      // Create malicious note record directly
      const traversalNote = await Note.create({
        section: 'notes',
        title: 'Traversal Attack Note',
        pdfUrl: '../../../../etc/passwd',
        fileSize: 100,
        totalPages: 1,
        isFree: true,
        isPublished: true,
        uploadedBy: adminUser._id
      });

      const res = await client.get(`/api/notes/${traversalNote._id}/stream`);
      // Should reject with 400 or 403 or 404 or 500 (safe rejection without file leakage)
      expect([400, 403, 404, 500]).toContain(res.status);
    });
  });

  // =========================================================================
  // SCENARIO 15: Legacy note without section behaves as 'notes'
  // =========================================================================
  describe("15. legacy note without section behaves as 'notes'", () => {
    beforeAll(async () => {
      // Directly insert via raw mongo collection to bypass mongoose default
      const rawCollection = mongoose.connection.collection('notes');
      const insertResult = await rawCollection.insertOne({
        title: 'Legacy Board Exam Notes',
        subject: 'Mathematics',
        classLevel: 'Class 10',
        category: 'Study Notes',
        pdfUrl: samplePdfKey,
        fileSize: 1024,
        totalPages: 5,
        isFree: false,
        isPublished: true,
        uploadedBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      legacyNote = await Note.findById(insertResult.insertedId);
    });

    it("appears when querying ?section=notes and defaults section to 'notes'", async () => {
      const res = await client.get('/api/notes?section=notes');
      expect(res.status).toBe(200);
      const found = res.data.notes.find((n) => n.id === legacyNote._id.toString());
      expect(found).toBeDefined();
      expect(found.section).toBe('notes');
    });

    it('can be streamed by a notes subscriber', async () => {
      const res = await client.get(`/api/notes/${legacyNote._id}/stream`, {
        headers: { Authorization: `Bearer ${notesToken}` },
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // =========================================================================
  // SCENARIO 16: Legacy subscription without section still grants notes access
  // =========================================================================
  describe('16. legacy subscription without section still grants notes access', () => {
    let legacySubUser, legacySubToken;

    beforeAll(async () => {
      legacySubUser = await User.create({
        name: 'Legacy Subscribed User',
        email: 'legacysub@shreemata.test',
        phone: '9000000099',
        password: 'password123',
        role: 'user'
      });
      legacySubToken = jwt.sign({ id: legacySubUser._id, role: 'user' }, JWT_SECRET);

      // Raw insert subscription without section field
      const rawCollection = mongoose.connection.collection('notesubscriptions');
      await rawCollection.insertOne({
        userId: legacySubUser._id,
        // section intentionally omitted
        planType: 'standard',
        amountPaid: 99,
        currency: 'INR',
        status: 'active',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        razorpayOrderId: 'ord_legacy_raw',
        razorpayPaymentId: 'pay_legacy_raw',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    it("grants access to paid items in section 'notes'", async () => {
      const res = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${legacySubToken}` },
        responseType: 'arraybuffer'
      });
      expect(res.status).toBe(200);
      expect(res.data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  // =========================================================================
  // SCENARIO 17: Existing default /pricing and /my-status shapes unchanged
  // =========================================================================
  describe('17. existing default /pricing and /my-status shapes unchanged', () => {
    it('returns exact legacy response shape for GET /api/subscriptions/pricing without query params', async () => {
      const res = await client.get('/api/subscriptions/pricing');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      // Legacy response structure: res.data.pricing has monthlyPrice, enabled, description
      expect(res.data).toHaveProperty('pricing');
      expect(res.data.pricing).toHaveProperty('monthlyPrice');
      expect(typeof res.data.pricing.monthlyPrice).toBe('number');
      expect(res.data.pricing).toHaveProperty('enabled');
      expect(typeof res.data.pricing.enabled).toBe('boolean');
      expect(res.data.pricing).toHaveProperty('description');
      expect(typeof res.data.pricing.description).toBe('string');
      expect(res.data.pricing).toHaveProperty('section', 'notes');
    });

    it('returns exact legacy response shape for GET /api/subscriptions/my-status without query params', async () => {
      const res = await client.get('/api/subscriptions/my-status', {
        headers: { Authorization: `Bearer ${notesToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      // Legacy top-level keys
      expect(res.data).toHaveProperty('hasActiveSubscription');
      expect(typeof res.data.hasActiveSubscription).toBe('boolean');
      expect(res.data.hasActiveSubscription).toBe(true);

      expect(res.data).toHaveProperty('subscription');
      expect(res.data.subscription).toHaveProperty('status', 'active');
      expect(res.data.subscription).toHaveProperty('daysRemaining');
      expect(typeof res.data.subscription.daysRemaining).toBe('number');
      expect(res.data.subscription).toHaveProperty('section', 'notes');
    });
  });

  // =========================================================================
  // SCENARIO 18: Admin Settings PUT and GET for 4-Section Plans
  // =========================================================================
  describe('18. admin settings sectionSubscriptionPlans management', () => {
    it('allows admin to update sectionSubscriptionPlans with valid price and duration', async () => {
      const updatePayload = {
        sectionSubscriptionPlans: {
          notes: {
            name: 'Updated Notes Pass',
            price: 149,
            durationDays: 45,
            active: true,
            description: 'Updated notes description'
          },
          videos: {
            name: 'Updated Videos Pass',
            price: 299,
            durationDays: 60,
            active: true,
            description: 'Premium video lecture access'
          }
        }
      };

      const res = await client.put('/api/admin/settings', updatePayload, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.settings.sectionSubscriptionPlans.notes.price).toBe(149);
      expect(res.data.settings.sectionSubscriptionPlans.notes.durationDays).toBe(45);
      expect(res.data.settings.sectionSubscriptionPlans.videos.price).toBe(299);
      expect(res.data.settings.sectionSubscriptionPlans.videos.durationDays).toBe(60);
    });

    it('rejects invalid plan pricing (price < 1)', async () => {
      const badPayload = {
        sectionSubscriptionPlans: {
          notes: {
            price: -50
          }
        }
      };

      const res = await client.put('/api/admin/settings', badPayload, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/between ₹1 and|positive number/i);
    });
  });

  // =========================================================================
  // SCENARIO 19: Migration and Rollback Safety & Dry-Run Modes
  // =========================================================================
  describe('19. migration and rollback scripts execution & safety', () => {
    const { execFile } = require('child_process');

    it('migration script runs in dry-run mode by default and prints counts without altering data', async () => {
      const scriptPath = path.resolve(__dirname, '../scripts/migrate-to-four-sections.js');
      const uri = mongoose.connection.client.s.url;

      const output = await new Promise((resolve, reject) => {
        execFile(process.execPath, [scriptPath], { env: { ...process.env, MONGODB_URI: uri } }, (err, stdout, stderr) => {
          resolve(stdout + stderr);
        });
      });

      expect(output).toMatch(/DRY-RUN/i);
      expect(output).toMatch(/No indexes were dropped or created/i);
    });

    it('migration script refuses to run with --apply unless --confirm-backup is passed', async () => {
      const scriptPath = path.resolve(__dirname, '../scripts/migrate-to-four-sections.js');
      const uri = mongoose.connection.client.s.url;

      const output = await new Promise((resolve) => {
        execFile(process.execPath, [scriptPath, '--apply'], { env: { ...process.env, MONGODB_URI: uri } }, (err, stdout, stderr) => {
          resolve(stdout + stderr);
        });
      });

      expect(output).toMatch(/--confirm-backup/i);
    });

    it('rollback script runs in dry-run mode and refuses if non-notes items exist', async () => {
      const scriptPath = path.resolve(__dirname, '../scripts/rollback-four-sections.js');
      const uri = mongoose.connection.client.s.url;

      const output = await new Promise((resolve) => {
        execFile(process.execPath, [scriptPath], { env: { ...process.env, MONGODB_URI: uri } }, (err, stdout, stderr) => {
          resolve(stdout + stderr);
        });
      });

      // Because our test DB contains question_papers and videos, rollback MUST refuse!
      expect(output).toMatch(/ROLLBACK REFUSED/i);
    });
  });

  // =========================================================================
  // SCENARIO 20: Feature Flags Default Behavior & Physical Books/Categories Parity
  // =========================================================================
  describe('20. feature flags default behavior & physical books/categories parity with f540bf8', () => {
    let prevTextBook;
    let prevReadNotes;
    let prevQp;
    let prevVideos;

    beforeEach(() => {
      prevTextBook = process.env.ENABLE_TEXT_BOOK;
      prevReadNotes = process.env.ENABLE_READ_NOTES;
      prevQp = process.env.ENABLE_QUESTION_PAPERS;
      prevVideos = process.env.ENABLE_VIDEOS;
    });

    afterEach(() => {
      if (prevTextBook !== undefined) process.env.ENABLE_TEXT_BOOK = prevTextBook; else delete process.env.ENABLE_TEXT_BOOK;
      if (prevReadNotes !== undefined) process.env.ENABLE_READ_NOTES = prevReadNotes; else delete process.env.ENABLE_READ_NOTES;
      if (prevQp !== undefined) process.env.ENABLE_QUESTION_PAPERS = prevQp; else delete process.env.ENABLE_QUESTION_PAPERS;
      if (prevVideos !== undefined) process.env.ENABLE_VIDEOS = prevVideos; else delete process.env.ENABLE_VIDEOS;
    });

    it('with no env vars set, textBook is true and digital flags are false', async () => {
      delete process.env.ENABLE_TEXT_BOOK;
      delete process.env.ENABLE_READ_NOTES;
      delete process.env.ENABLE_QUESTION_PAPERS;
      delete process.env.ENABLE_VIDEOS;

      expect(FEATURES.textBook).toBe(true);
      expect(FEATURES.readNotes).toBe(false);
      expect(FEATURES.questionPapers).toBe(false);
      expect(FEATURES.videos).toBe(false);

      const res = await client.get('/api/features');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.features.textBook).toBe(true);
      expect(res.data.features.readNotes).toBe(false);
      expect(res.data.features.questionPapers).toBe(false);
      expect(res.data.features.videos).toBe(false);
    });

    it('only an explicit ENABLE_TEXT_BOOK=false turns off textBook', async () => {
      process.env.ENABLE_TEXT_BOOK = 'false';
      expect(FEATURES.textBook).toBe(false);

      process.env.ENABLE_TEXT_BOOK = 'true';
      expect(FEATURES.textBook).toBe(true);
    });

    it('existing categories and books endpoints behave the same as at f540bf8 with no env vars set', async () => {
      delete process.env.ENABLE_TEXT_BOOK;
      delete process.env.ENABLE_READ_NOTES;
      delete process.env.ENABLE_QUESTION_PAPERS;
      delete process.env.ENABLE_VIDEOS;

      const Category = require('../models/Category');
      const Book = require('../models/Book');

      await Category.create({ name: 'State Board Textbooks', slug: 'state-board-textbooks' });
      await Book.create({
        title: 'Class 10 Kannada Sahitya Textbook',
        author: 'Shree Mata Publications',
        price: 200,
        sellingPrice: 180,
        stockQuantity: 50,
        class: 'Class 10',
        category: 'State Board Textbooks'
      });

      const catRes = await client.get('/api/categories');
      expect(catRes.status).toBe(200);
      expect(Array.isArray(catRes.data.categories)).toBe(true);
      const foundCat = catRes.data.categories.find(c => c.slug === 'state-board-textbooks');
      expect(foundCat).toBeDefined();
      expect(foundCat.name).toBe('State Board Textbooks');

      const bookRes = await client.get('/api/books');
      expect(bookRes.status).toBe(200);
      expect(Array.isArray(bookRes.data.books)).toBe(true);
      const foundBook = bookRes.data.books.find(b => b.title === 'Class 10 Kannada Sahitya Textbook');
      expect(foundBook).toBeDefined();
      expect(foundBook.price).toBe(200);
      expect(foundBook.sellingPrice).toBe(180);
    });
  });

  // =========================================================================
  // SCENARIO 21: Search Block Section Isolation (Defect 1)
  // =========================================================================
  describe('21. search block section isolation (Defect 1)', () => {
    it('search on ?section=notes never returns items from other sections even if matching keyword', async () => {
      process.env.ENABLE_READ_NOTES = 'true';
      process.env.ENABLE_QUESTION_PAPERS = 'false';
      process.env.ENABLE_VIDEOS = 'false';

      // Seed items in notes, question_papers, videos all with the keyword "TrigonometrySecret"
      await Note.create([
        {
          section: 'notes',
          title: 'Notes on TrigonometrySecret Board Review',
          pdfUrl: samplePdfKey,
          isPublished: true,
          isFree: true,
          uploadedBy: adminUser._id
        },
        {
          section: 'question_papers',
          title: 'Question Paper TrigonometrySecret Exam 2026',
          pdfUrl: samplePdfKey,
          isPublished: true,
          isFree: true,
          uploadedBy: adminUser._id
        },
        {
          section: 'videos',
          title: 'Video Lecture TrigonometrySecret Essentials',
          videoUrl: 'https://iframe.mediadelivery.net/play/123/trig',
          videoProvider: 'bunny',
          isPublished: true,
          isFree: true,
          uploadedBy: adminUser._id
        }
      ]);

      const res = await client.get('/api/notes?section=notes&search=TrigonometrySecret', {
        headers: { Authorization: `Bearer ${guestToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.notes)).toBe(true);
      expect(res.data.notes.length).toBe(1);
      // Every single returned item MUST belong to section 'notes'
      for (const item of res.data.notes) {
        expect(item.section).toBe('notes');
        expect(item.title).not.toMatch(/Question Paper/i);
        expect(item.title).not.toMatch(/Video Lecture/i);
      }

      // Check /subjects: disabled sections return 404 for non-admin
      const subjDisabled = await client.get('/api/notes/subjects?section=question_papers', {
        headers: { Authorization: `Bearer ${guestToken}` }
      });
      expect(subjDisabled.status).toBe(404);

      // Enabled notes section returns subjects
      const subjNotes = await client.get('/api/notes/subjects?section=notes', {
        headers: { Authorization: `Bearer ${guestToken}` }
      });
      expect(subjNotes.status).toBe(200);
      expect(Array.isArray(subjNotes.data.subjects)).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO 22: Enforce Section Feature Flag on Detail, Stream, Media-Url, Download (Defect 2)
  // =========================================================================
  describe('22. enforce section feature flag on detail, stream, media-url, and download (Defect 2)', () => {
    it('free item in a disabled section must return 404 for guests; admin still works', async () => {
      process.env.ENABLE_READ_NOTES = 'true';
      process.env.ENABLE_QUESTION_PAPERS = 'false';
      process.env.ENABLE_VIDEOS = 'false';

      // 1. Create a free video in disabled section 'videos'
      const videoItem = await Note.create({
        section: 'videos',
        title: 'Free Disabled Section Video',
        videoUrl: 'https://iframe.mediadelivery.net/play/123/free-vid',
        videoProvider: 'bunny',
        isPublished: true,
        isFree: true,
        uploadedBy: adminUser._id
      });

      // 2. Create a free question paper in disabled section 'question_papers'
      const qpItem = await Note.create({
        section: 'question_papers',
        title: 'Free Disabled Section QP',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: true,
        allowDownload: true,
        uploadedBy: adminUser._id
      });

      // Guest requests on disabled section items -> MUST BE 404
      const resDetailVideo = await client.get(`/api/notes/${videoItem._id}`);
      expect(resDetailVideo.status).toBe(404);

      const resMediaUrl = await client.get(`/api/notes/${videoItem._id}/media-url`);
      expect(resMediaUrl.status).toBe(404);

      const resDetailQP = await client.get(`/api/notes/${qpItem._id}`);
      expect(resDetailQP.status).toBe(404);

      const resStreamQP = await client.get(`/api/notes/${qpItem._id}/stream`);
      expect(resStreamQP.status).toBe(404);

      const resDownloadQP = await client.get(`/api/notes/${qpItem._id}/download`);
      expect(resDownloadQP.status).toBe(404);

      // Admin requests on disabled section items -> MUST BE ALLOWED (not 404 disabled)
      const adminDetailVideo = await client.get(`/api/notes/${videoItem._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminDetailVideo.status).toBe(200);

      const adminMediaUrl = await client.get(`/api/notes/${videoItem._id}/media-url`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminMediaUrl.status).toBe(200);

      const adminStreamQP = await client.get(`/api/notes/${qpItem._id}/stream`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(adminStreamQP.status).toBe(200);
    });
  });

  // =========================================================================
  // SCENARIO 23: Video URL Rules, Validation & PUT Section Transitions (Defect 3)
  // =========================================================================
  describe('23. video url rules, validation & PUT section transitions (Defect 3)', () => {
    it('(a) treats youtube-nocookie.com and m.youtube.com as YouTube, rejecting on paid items', async () => {
      // Paid with youtube-nocookie.com -> 400
      const resNoCookiePaid = await client.post('/api/notes', {
        section: 'videos',
        title: 'Paid YouTube NoCookie Video',
        videoUrl: 'https://www.youtube-nocookie.com/embed/test1234',
        videoProvider: 'bunny',
        isFree: false
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resNoCookiePaid.status).toBe(400);
      expect(resNoCookiePaid.data.error).toMatch(/YouTube.*free preview/i);

      // Paid with m.youtube.com -> 400
      const resSubdomainPaid = await client.post('/api/notes', {
        section: 'videos',
        title: 'Paid YouTube Mobile Subdomain',
        videoUrl: 'https://m.youtube.com/watch?v=test1234',
        videoProvider: 'none',
        isFree: false
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resSubdomainPaid.status).toBe(400);

      // Free with youtube-nocookie.com -> 201
      const resNoCookieFree = await client.post('/api/notes', {
        section: 'videos',
        title: 'Free YouTube NoCookie Video',
        videoUrl: 'https://www.youtube-nocookie.com/embed/test1234',
        videoProvider: 'youtube_unlisted',
        isFree: true
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resNoCookieFree.status).toBe(201);
    });

    it('(b) PUT re-runs validateVideoUrl on resulting values so paid video cannot keep YouTube, and switching to videos requires videoUrl', async () => {
      // 1. Create a free video with YouTube URL
      const freeVid = await Note.create({
        section: 'videos',
        title: 'Free Vid with YouTube',
        videoUrl: 'https://www.youtube.com/watch?v=testabc',
        videoProvider: 'youtube_unlisted',
        isPublished: true,
        isFree: true,
        uploadedBy: adminUser._id
      });

      // Update isFree to false WITHOUT sending videoUrl
      const resFlipPaid = await client.put(`/api/notes/${freeVid._id}`, {
        isFree: false
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resFlipPaid.status).toBe(400);
      expect(resFlipPaid.data.error).toMatch(/YouTube.*free preview/i);

      // 2. Create a normal note with PDF
      const docNote = await Note.create({
        section: 'notes',
        title: 'Document Note For Conversion',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: false,
        uploadedBy: adminUser._id
      });

      // Update section to 'videos' WITHOUT sending videoUrl
      const resConvertToVideosNoUrl = await client.put(`/api/notes/${docNote._id}`, {
        section: 'videos'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resConvertToVideosNoUrl.status).toBe(400);
      expect(resConvertToVideosNoUrl.data.error).toMatch(/Video URL is required/i);
    });

    it('(c) rejects unknown videoProvider values with 400 instead of 500', async () => {
      // POST with invalid provider
      const resPostBad = await client.post('/api/notes', {
        section: 'videos',
        title: 'Video with bad provider',
        videoUrl: 'https://iframe.mediadelivery.net/play/123/bad',
        videoProvider: 'dailymotion',
        isFree: false
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resPostBad.status).toBe(400);
      expect(resPostBad.data.error).toMatch(/Invalid videoProvider/i);

      // PUT with invalid provider
      const validVid = await Note.create({
        section: 'videos',
        title: 'Valid Bunny Video',
        videoUrl: 'https://iframe.mediadelivery.net/play/123/good',
        videoProvider: 'bunny',
        isPublished: true,
        isFree: false,
        uploadedBy: adminUser._id
      });

      const resPutBad = await client.put(`/api/notes/${validVid._id}`, {
        videoProvider: 'facebook_watch'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resPutBad.status).toBe(400);
      expect(resPutBad.data.error).toMatch(/Invalid videoProvider/i);
    });

    it('(d) section change away from videos clears videoUrl/videoProvider; changing to videos requires no PDF', async () => {
      const FormData = require('form-data');

      // 1. A video item with no PDF cannot switch to 'notes' without uploading a PDF
      const vidNoPdf = await Note.create({
        section: 'videos',
        title: 'Video Lecture to be Reclassified',
        videoUrl: 'https://iframe.mediadelivery.net/play/123/reclass',
        videoProvider: 'bunny',
        isPublished: true,
        isFree: false,
        uploadedBy: adminUser._id
      });

      const resFailSwitch = await client.put(`/api/notes/${vidNoPdf._id}`, {
        section: 'notes'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resFailSwitch.status).toBe(400);
      expect(resFailSwitch.data.error).toMatch(/PDF file is required/i);

      // 2. An item with a PDF switching away from videos clears videoUrl and videoProvider
      const disposableKey = 'disposable_test_note.pdf';
      fs.writeFileSync(path.resolve(testStorageDir, disposableKey), '%PDF-1.4 disposable test content %%EOF');

      const vidWithPdf = await Note.create({
        section: 'videos',
        title: 'Video Lecture With Stored Doc',
        pdfUrl: disposableKey,
        videoUrl: 'https://iframe.mediadelivery.net/play/123/reclass',
        videoProvider: 'bunny',
        isPublished: true,
        isFree: false,
        uploadedBy: adminUser._id
      });

      const resReclass = await client.put(`/api/notes/${vidWithPdf._id}`, {
        section: 'notes'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resReclass.status).toBe(200);

      const updatedItem = await Note.findById(vidWithPdf._id).lean();
      expect(updatedItem.section).toBe('notes');
      expect(updatedItem.videoUrl).toBe('');
      expect(updatedItem.videoProvider).toBe('none');

      // 3. Changing to videos requires NO PDF (clears old pdfUrl and succeeds)
      const resSwitchToVid = await client.put(`/api/notes/${updatedItem._id}`, {
        section: 'videos',
        videoUrl: 'https://iframe.mediadelivery.net/play/123/switchtovid',
        videoProvider: 'bunny'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resSwitchToVid.status).toBe(200);

      const vidCleared = await Note.findById(updatedItem._id).lean();
      expect(vidCleared.section).toBe('videos');
      expect(vidCleared.pdfUrl).toBe('');

      // 4. Changing to videos rejects PDF upload if one is sent
      const form = new FormData();
      form.append('section', 'videos');
      form.append('videoUrl', 'https://iframe.mediadelivery.net/play/123/rejectpdf');
      form.append('pdf', Buffer.from('%PDF-1.4 mock content %%EOF'), 'sample.pdf');

      const resPdfReject = await client.put(`/api/notes/${vidCleared._id}`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${adminToken}`
        }
      });
      expect(resPdfReject.status).toBe(400);
      expect(resPdfReject.data.error).toMatch(/PDF uploads are not allowed/i);
    });
  });

  // =========================================================================
  // SCENARIO 24: Stream Route Byte Range Clamping & Suffix Ranges (Defect 4)
  // =========================================================================
  describe('24. stream range clamping and suffix ranges (Defect 4)', () => {
    let streamNote;
    let actualFileSize;

    beforeAll(async () => {
      const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
      if (!fs.existsSync(samplePdfPath)) {
        fs.writeFileSync(samplePdfPath, Buffer.from(
          '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
        ));
      }
      actualFileSize = fs.statSync(samplePdfPath).size;

      streamNote = await Note.create({
        section: 'notes',
        title: 'Range Test Free PDF Note',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: true,
        uploadedBy: adminUser._id
      });
    });

    it('clamps range end to fileSize - 1 without returning 416 when end >= fileSize', async () => {
      // Request bytes=0-65535 on file smaller than 64KB (sample is ~140 bytes)
      const res = await client.get(`/api/notes/${streamNote._id}/stream`, {
        headers: { Range: 'bytes=0-65535' }
      });

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 0-${actualFileSize - 1}/${actualFileSize}`);
      expect(parseInt(res.headers['content-length'], 10)).toBe(actualFileSize);
    });

    it('supports suffix ranges bytes=-N returning the last N bytes of the file', async () => {
      const suffixN = 30;
      const res = await client.get(`/api/notes/${streamNote._id}/stream`, {
        headers: { Range: `bytes=-${suffixN}` }
      });

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes ${actualFileSize - suffixN}-${actualFileSize - 1}/${actualFileSize}`);
      expect(parseInt(res.headers['content-length'], 10)).toBe(suffixN);
    });

    it('returns 416 with Content-Range: bytes */size only when start >= fileSize', async () => {
      const res = await client.get(`/api/notes/${streamNote._id}/stream`, {
        headers: { Range: 'bytes=50000-60000' }
      });

      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe(`bytes */${actualFileSize}`);
    });
  });

  // =========================================================================
  // SCENARIO 25: optionalAuth User DB Verification & Guest Fallback (Defect 5)
  // =========================================================================
  describe('25. optionalAuth user verification (Defect 5)', () => {
    let freeNote;
    let paidNote;

    beforeAll(async () => {
      const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);
      if (!fs.existsSync(samplePdfPath)) {
        fs.writeFileSync(samplePdfPath, Buffer.from(
          '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
        ));
      }

      freeNote = await Note.create({
        section: 'notes',
        title: 'Free Note for optionalAuth test',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: true,
        uploadedBy: adminUser._id
      });

      paidNote = await Note.create({
        section: 'notes',
        title: 'Paid Note for optionalAuth test',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: false,
        uploadedBy: adminUser._id
      });
    });

    it('treats token of a non-existent or deleted user as an unauthenticated guest', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId();
      const ghostToken = jwt.sign({ id: nonExistentUserId, role: 'user' }, JWT_SECRET);

      // Free note stream succeeds as guest
      const resFree = await client.get(`/api/notes/${freeNote._id}/stream`, {
        headers: { Authorization: `Bearer ${ghostToken}` }
      });
      expect(resFree.status).toBe(200);

      // Paid note stream fails as guest with 401
      const resPaid = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${ghostToken}` }
      });
      expect(resPaid.status).toBe(401);
      expect(resPaid.data.error).toMatch(/Authentication required/i);
    });

    it('treats tokens with non-ObjectId payload or invalid signature as unauthenticated guest', async () => {
      const stringIdToken = jwt.sign({ id: 'not-a-valid-object-id', role: 'user' }, JWT_SECRET);

      const resFree = await client.get(`/api/notes/${freeNote._id}/stream`, {
        headers: { Authorization: `Bearer ${stringIdToken}` }
      });
      expect(resFree.status).toBe(200);

      const resPaid = await client.get(`/api/notes/${paidNote._id}/stream`, {
        headers: { Authorization: `Bearer ${stringIdToken}` }
      });
      expect(resPaid.status).toBe(401);
    });
  });

  // =========================================================================
  // SCENARIO 26: GET /:id viewCount Skipping for Guests (Defect 6)
  // =========================================================================
  describe('26. GET /:id viewCount guest vs logged-in (Defect 6)', () => {
    it('skips increment for unauthenticated guests and keeps for logged-in users', async () => {
      const noteItem = await Note.create({
        section: 'notes',
        title: 'ViewCount Counting Test Note',
        pdfUrl: samplePdfKey,
        isPublished: true,
        isFree: true,
        viewCount: 0,
        uploadedBy: adminUser._id
      });

      // 1. Unauthenticated guest request -> viewCount should NOT increment
      const guestRes = await client.get(`/api/notes/${noteItem._id}`);
      expect(guestRes.status).toBe(200);

      const afterGuestDoc = await Note.findById(noteItem._id).lean();
      expect(afterGuestDoc.viewCount).toBe(0);

      // 2. Logged-in user request -> viewCount increments by 1
      const userRes = await client.get(`/api/notes/${noteItem._id}`, {
        headers: { Authorization: `Bearer ${guestToken}` }
      });
      expect(userRes.status).toBe(200);

      const afterUserDoc = await Note.findById(noteItem._id).lean();
      expect(afterUserDoc.viewCount).toBe(1);
    });
  });

  // =========================================================================
  // SCENARIO 27: GET /pricing Returns enabled: false for Disabled Sections (Defect 8)
  // =========================================================================
  describe('27. GET /pricing returns enabled: false for disabled section feature flag (Defect 8)', () => {
    it('returns enabled: false when section flag is disabled, while preserving shape and default notes call', async () => {
      process.env.ENABLE_READ_NOTES = 'true';
      process.env.ENABLE_QUESTION_PAPERS = 'false';
      process.env.ENABLE_VIDEOS = 'false';

      // 1. Question papers flag is disabled -> returns 200 with pricing payload and enabled: false
      const resQp = await client.get('/api/subscriptions/pricing?section=question_papers');
      expect(resQp.status).toBe(200);
      expect(resQp.data.success).toBe(true);
      expect(resQp.data.pricing).toBeDefined();
      expect(resQp.data.pricing.section).toBe('question_papers');
      expect(resQp.data.pricing.enabled).toBe(false);
      expect(resQp.data.pricing.monthlyPrice).toBeGreaterThan(0);

      // 2. Videos flag is disabled -> returns 200 with pricing payload and enabled: false
      const resVid = await client.get('/api/subscriptions/pricing?section=videos');
      expect(resVid.status).toBe(200);
      expect(resVid.data.pricing.section).toBe('videos');
      expect(resVid.data.pricing.enabled).toBe(false);

      // 3. Default call with no ?section= preserves exact legacy notes shape with enabled: true
      const resDefault = await client.get('/api/subscriptions/pricing');
      expect(resDefault.status).toBe(200);
      expect(resDefault.data.pricing.section).toBe('notes');
      expect(resDefault.data.pricing.enabled).toBe(true);
      expect(resDefault.data.pricing).toHaveProperty('monthlyPrice');
      expect(resDefault.data.pricing).toHaveProperty('amountInPaise');
      expect(resDefault.data.pricing).toHaveProperty('currency', 'INR');
      expect(resDefault.data.pricing).toHaveProperty('planType', 'monthly');
    });
  });
});
