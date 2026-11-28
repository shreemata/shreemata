// tests/classScopedAccess.test.js
// Authoritative, strict test suite for class-scoped study material access (Prompt A)

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

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

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const subscriptionsRoute = require('../routes/subscriptions');
const AdminSettings = require('../models/AdminSettings');
const { normalizeClassLevel } = require('../utils/classLevelHelper');

describe('Class-Scoped Study Material Access Control (Prompt A)', () => {
  let server;
  let client;
  let testStorageDir;
  const samplePdfKey = 'sample_class_doc.pdf';

  let adminUser, adminToken;
  let studentUser, studentToken;
  let secondStudentUser, secondStudentToken;

  let noteClass10;
  let noteClass8;
  let noteClass8ZeroPreview;
  let noteClass9;
  let noteQpClass10;
  let noteNoClass;

  const JWT_SECRET = 'test_jwt_secret_class_scoped_77';
  const RZP_KEY_ID = 'rzp_test_key_class_123';
  const RZP_KEY_SECRET = 'rzp_test_secret_class_456';

  let subCounter = 100;
  async function createSub(data) {
    subCounter++;
    const planType = data.planType || 'standard';
    return await NoteSubscription.create({
      planType,
      durationDays: 30,
      amountPaid: planType === 'admin_grant' ? 0 : 99,
      status: 'active',
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subscriptionIndex: subCounter,
      ...(planType !== 'admin_grant' ? {
        razorpayOrderId: data.razorpayOrderId || `ord_mock_${subCounter}_${Date.now()}`,
        razorpayPaymentId: data.razorpayPaymentId || `pay_mock_${subCounter}_${Date.now()}`,
        razorpaySignature: data.razorpaySignature || `sig_mock_${subCounter}_${Date.now()}`
      } : {}),
      ...data
    });
  }

  function makeSignature(orderId, paymentId) {
    return crypto.createHmac('sha256', RZP_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  }

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_KEY_ID = RZP_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = RZP_KEY_SECRET;
    process.env.ENABLE_READ_NOTES = 'true';
    process.env.ENABLE_QUESTION_PAPERS = 'true';
    process.env.ENABLE_VIDEOS = 'true';
    process.env.ENABLE_OTHERS = 'true';

    // 1. Prepare storage directory and write a 5-page PDF fixture
    testStorageDir = path.resolve(__dirname, '../storage/notes/private');
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 5; i++) {
      const page = doc.addPage([595, 842]);
      page.drawText(`Class-Scoped Document Page ${i} of 5`, {
        x: 50,
        y: 750,
        size: 18,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
    }
    const sampleBytes = await doc.save();
    fs.writeFileSync(samplePdfPath, sampleBytes);

    // 2. Setup Express test app
    const app = express();
    app.use(express.json());
    app.use('/api/subscriptions', subscriptionsRoute);
    app.use('/api/notes', require('../routes/notes'));
    app.use('/api/admin', require('../routes/adminSettings'));

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

    // 3. Seed Users
    adminUser = await User.create({
      name: 'Class Admin',
      email: 'admin.class@shreemata.test',
      phone: '9200000001',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET);

    studentUser = await User.create({
      name: 'Class Student',
      email: 'student.class@shreemata.test',
      phone: '9200000002',
      password: 'password123',
      role: 'user'
    });
    studentToken = jwt.sign({ id: studentUser._id, role: 'user' }, JWT_SECRET);

    secondStudentUser = await User.create({
      name: 'Second Student',
      email: 'second.student@shreemata.test',
      phone: '9200000003',
      password: 'password123',
      role: 'user'
    });
    secondStudentToken = jwt.sign({ id: secondStudentUser._id, role: 'user' }, JWT_SECRET);

    // 4. Seed Notes
    noteClass10 = await Note.create({
      title: 'Class 10 Science Notes',
      subject: 'Science',
      classLevel: 'Class 10',
      section: 'notes',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    noteClass8 = await Note.create({
      title: 'Class 8 Social Notes',
      subject: 'Social',
      classLevel: 'Class 8',
      section: 'notes',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    noteClass8ZeroPreview = await Note.create({
      title: 'Class 8 Math Locked Notes',
      subject: 'Mathematics',
      classLevel: 'Class 8',
      section: 'notes',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 0,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    noteClass9 = await Note.create({
      title: 'Class 9 English Notes',
      subject: 'English',
      classLevel: 'Class 9',
      section: 'notes',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    noteQpClass10 = await Note.create({
      title: 'Class 10 QP Board Exam',
      subject: 'Science',
      classLevel: 'Class 10',
      section: 'question_papers',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    noteNoClass = await Note.create({
      title: 'General Study Guidance Notes',
      subject: 'General',
      classLevel: '',
      section: 'notes',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await teardownTestDB();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test (1) Class 10 pass: full access to Class 10, preview only for Class 8
  // -------------------------------------------------------------------------
  test('(1) Class 10 pass gives full access to Class 10 note and preview only to Class 8 note; cannot download Class 8', async () => {
    await NoteSubscription.deleteMany({ userId: studentUser._id });

    await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 10'
    });

    // Stream Class 10 note: full page count (5)
    const res10 = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res10.status).toBe(200);
    const pdfDoc10 = await PDFDocument.load(res10.data);
    expect(pdfDoc10.getPageCount()).toBe(5);

    // Stream Class 8 note: preview only (2 pages)
    const res8 = await client.get(`/api/notes/${noteClass8._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res8.status).toBe(200);
    const pdfDoc8 = await PDFDocument.load(res8.data);
    expect(pdfDoc8.getPageCount()).toBe(2);

    // Direct download of Class 8 note: 403 Forbidden with CLASS_SUBSCRIPTION_REQUIRED
    const dl8 = await client.get(`/api/notes/${noteClass8._id}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(dl8.status).toBe(403);
    expect(dl8.data.code).toBe('CLASS_SUBSCRIPTION_REQUIRED');

    // Media-url of Class 8 note: 400 (not a video)
    const media8 = await client.get(`/api/notes/${noteClass8._id}/media-url`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(media8.status).toBe(400);

    // Direct GET /:id metadata of Class 8 note: does not leak full file access
    const detail8 = await client.get(`/api/notes/${noteClass8._id}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(detail8.status).toBe(200);
    expect(detail8.data.note.hasFullAccess).toBe(false);
    expect(detail8.data.note.previewOnly).toBe(true);
    expect(detail8.data.note.pdfUrl).toBeUndefined();
    expect(detail8.data.note.videoUrl).toBeUndefined();

    // Catalog list exposes hasFullAccess, previewOnly, classLevel, and classPrice
    const catRes = await client.get('/api/notes?section=notes', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(catRes.status).toBe(200);
    const item10 = catRes.data.notes.find(n => n.id === String(noteClass10._id));
    const item8 = catRes.data.notes.find(n => n.id === String(noteClass8._id));
    expect(item10.hasFullAccess).toBe(true);
    expect(item10.previewOnly).toBe(false);
    expect(item10.classLevel).toBe('Class 10');
    expect(typeof item10.classPrice).toBe('number');

    expect(item8.hasFullAccess).toBe(false);
    expect(item8.previewOnly).toBe(true);
    expect(item8.classLevel).toBe('Class 8');
    expect(typeof item8.classPrice).toBe('number');
  });

  // -------------------------------------------------------------------------
  // Test (2) previewPages 0 on Class 8 note returns 403 with CLASS_SUBSCRIPTION_REQUIRED
  // -------------------------------------------------------------------------
  test('(2) previewPages 0 on Class 8 note returns 403 with code CLASS_SUBSCRIPTION_REQUIRED, classLevel and classPrice', async () => {
    const res = await client.get(`/api/notes/${noteClass8ZeroPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(res.status).toBe(403);
    expect(res.data.code).toBe('CLASS_SUBSCRIPTION_REQUIRED');
    expect(res.data.classLevel).toBe('Class 8');
    expect(typeof res.data.classPrice).toBe('number');
  });

  // -------------------------------------------------------------------------
  // Test (3) Two active passes (Class 8 and Class 10) both give full access
  // -------------------------------------------------------------------------
  test('(3) Two active passes (Class 8 and Class 10) give full access to both classes, preview only for Class 9', async () => {
    // Add Class 8 pass alongside Class 10 pass
    await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 8'
    });

    // Class 8 note: full access (5 pages)
    const res8 = await client.get(`/api/notes/${noteClass8._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res8.status).toBe(200);
    const pdf8 = await PDFDocument.load(res8.data);
    expect(pdf8.getPageCount()).toBe(5);

    // Class 10 note: full access (5 pages)
    const res10 = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res10.status).toBe(200);
    const pdf10 = await PDFDocument.load(res10.data);
    expect(pdf10.getPageCount()).toBe(5);

    // Class 9 note: preview only (2 pages)
    const res9 = await client.get(`/api/notes/${noteClass9._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res9.status).toBe(200);
    const pdf9 = await PDFDocument.load(res9.data);
    expect(pdf9.getPageCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Test (4) Normalization: "Class 10", " class  10 ", and "CLASS 10" all match
  // -------------------------------------------------------------------------
  test('(4) Normalization: "Class 10", " class  10 " and "CLASS 10" all resolve identically', async () => {
    expect(normalizeClassLevel('Class 10')).toBe('class 10');
    expect(normalizeClassLevel(' class  10 ')).toBe('class 10');
    expect(normalizeClassLevel('CLASS 10')).toBe('class 10');

    // Create user with normalized pass
    await NoteSubscription.deleteMany({ userId: secondStudentUser._id });
    await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: normalizeClassLevel(' CLASS   10  ')
    });

    const res = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(res.status).toBe(200);
    const doc = await PDFDocument.load(res.data);
    expect(doc.getPageCount()).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test (5) Legacy pass: preview before choice, full after choice, atomic concurrency, 409 on second call
  // -------------------------------------------------------------------------
  test('(5) Legacy pass: preview only before choose-class; after choice grants full access; concurrent requests yield exactly one 200 and one 409; unknown class returns 400', async () => {
    await NoteSubscription.deleteMany({ userId: secondStudentUser._id });
    // Legacy pass: no classLevel stored
    await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: ''
    });

    // Check my-status reports needsClassChoice: true
    const statusBefore = await client.get('/api/subscriptions/my-status?section=notes', {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(statusBefore.status).toBe(200);
    expect(statusBefore.data.needsClassChoice).toBe(true);

    // Before choice: preview only on Class 10 (2 pages)
    const streamBefore = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(streamBefore.status).toBe(200);
    const docBefore = await PDFDocument.load(streamBefore.data);
    expect(docBefore.getPageCount()).toBe(2);

    // Unknown class returns 400
    const unknownRes = await client.post('/api/subscriptions/choose-class', {
      classLevel: 'Class 999 NonExistent'
    }, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(unknownRes.status).toBe(400);

    // Concurrent choose-class calls: exactly one 200, one 409
    const [resA, resB] = await Promise.all([
      client.post('/api/subscriptions/choose-class', { classLevel: 'Class 10' }, {
        headers: { Authorization: `Bearer ${secondStudentToken}` }
      }),
      client.post('/api/subscriptions/choose-class', { classLevel: 'Class 10' }, {
        headers: { Authorization: `Bearer ${secondStudentToken}` }
      })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Check my-status reports needsClassChoice: false, activeClasses has 'class 10'
    const statusAfter = await client.get('/api/subscriptions/my-status?section=notes', {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(statusAfter.status).toBe(200);
    expect(statusAfter.data.needsClassChoice).toBe(false);
    expect(statusAfter.data.activeClasses).toContain('class 10');

    // After choice: Class 10 note yields full page count (5 pages)
    const streamAfter10 = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(streamAfter10.status).toBe(200);
    const docAfter10 = await PDFDocument.load(streamAfter10.data);
    expect(docAfter10.getPageCount()).toBe(5);

    // Other class (Class 8) remains preview only (2 pages)
    const streamAfter8 = await client.get(`/api/notes/${noteClass8._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(streamAfter8.status).toBe(200);
    const docAfter8 = await PDFDocument.load(streamAfter8.data);
    expect(docAfter8.getPageCount()).toBe(2);

    // Second choose-class call returns 409
    const secondChoice = await client.post('/api/subscriptions/choose-class', {
      classLevel: 'Class 8'
    }, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(secondChoice.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Test (5b) Stacked legacy passes: choice cascades to all passes; second call 409; concurrent calls with different classes
  // -------------------------------------------------------------------------
  test('(5b) Stacked legacy passes: choosing a class updates all stacked passes; second choose call returns 409; concurrent calls with different classes yield exactly one 200 and one 409 and uniform class', async () => {
    await NoteSubscription.deleteMany({ userId: secondStudentUser._id });

    // 1. User with 2 stacked legacy passes
    const pass1 = await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: '',
      subscriptionIndex: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    const pass2 = await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: '',
      subscriptionIndex: 2,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    });

    // Choose Class 10
    const chooseRes = await client.post('/api/subscriptions/choose-class', {
      classLevel: 'Class 10'
    }, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(chooseRes.status).toBe(200);

    // Both passes become Class 10
    const updatedPass1 = await NoteSubscription.findById(pass1._id);
    const updatedPass2 = await NoteSubscription.findById(pass2._id);
    expect(updatedPass1.classLevel).toBe('class 10');
    expect(updatedPass2.classLevel).toBe('class 10');
    expect(updatedPass1.classChosenAt).toBeDefined();
    expect(updatedPass2.classChosenAt).toBeDefined();

    // A second choose call with Class 8 returns 409 and changes nothing
    const secondCall = await client.post('/api/subscriptions/choose-class', {
      classLevel: 'Class 8'
    }, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(secondCall.status).toBe(409);
    const unchangedPass1 = await NoteSubscription.findById(pass1._id);
    const unchangedPass2 = await NoteSubscription.findById(pass2._id);
    expect(unchangedPass1.classLevel).toBe('class 10');
    expect(unchangedPass2.classLevel).toBe('class 10');

    // 2. Two concurrent calls with different classes on a user with stacked passes
    await NoteSubscription.deleteMany({ userId: secondStudentUser._id });
    const cPass1 = await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: '',
      subscriptionIndex: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    const cPass2 = await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: '',
      subscriptionIndex: 2,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    });

    const [call10, call8] = await Promise.all([
      client.post('/api/subscriptions/choose-class', { classLevel: 'Class 10' }, {
        headers: { Authorization: `Bearer ${secondStudentToken}` }
      }),
      client.post('/api/subscriptions/choose-class', { classLevel: 'Class 8' }, {
        headers: { Authorization: `Bearer ${secondStudentToken}` }
      })
    ]);

    const statuses = [call10.status, call8.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalPass1 = await NoteSubscription.findById(cPass1._id);
    const finalPass2 = await NoteSubscription.findById(cPass2._id);
    expect(finalPass1.classLevel).toBe(finalPass2.classLevel);
    expect(['class 10', 'class 8']).toContain(finalPass1.classLevel);
  });

  // -------------------------------------------------------------------------
  // Test (6) admin_grant without class: full access to every class; admin: full access
  // -------------------------------------------------------------------------
  test('(6) admin_grant without class grants full access to every class; admin user has full access to every class', async () => {
    await NoteSubscription.deleteMany({ userId: secondStudentUser._id });
    await createSub({
      userId: secondStudentUser._id,
      section: 'notes',
      classLevel: '',
      planType: 'admin_grant'
    });

    // Student with admin_grant gets full 5 pages for Class 10 and Class 8
    const resGrant10 = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(resGrant10.status).toBe(200);
    expect((await PDFDocument.load(resGrant10.data)).getPageCount()).toBe(5);

    const resGrant8 = await client.get(`/api/notes/${noteClass8._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(resGrant8.status).toBe(200);
    expect((await PDFDocument.load(resGrant8.data)).getPageCount()).toBe(5);

    // Admin user also gets full access to both
    const resAdmin10 = await client.get(`/api/notes/${noteClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      responseType: 'arraybuffer'
    });
    expect(resAdmin10.status).toBe(200);
    expect((await PDFDocument.load(resAdmin10.data)).getPageCount()).toBe(5);

    const resAdmin8 = await client.get(`/api/notes/${noteClass8._id}/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      responseType: 'arraybuffer'
    });
    expect(resAdmin8.status).toBe(200);
    expect((await PDFDocument.load(resAdmin8.data)).getPageCount()).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test (7) create-order: price from admin or section fallback; ignores client price; rejects unknown class
  // -------------------------------------------------------------------------
  test('(7) create-order uses admin class price, falls back to section price, ignores client price, rejects unknown class with 400', async () => {
    // Set custom class price for Class 10: 149 INR
    const updatePriceRes = await client.put('/api/admin/settings/class-prices', {
      classPrices: {
        'Class 10': 149
      }
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(updatePriceRes.status).toBe(200);

    // Mock Razorpay order creation for Class 10
    mockRazorpayOrdersCreate.mockResolvedValueOnce({
      id: 'order_rzp_class10_test',
      amount: 14900,
      currency: 'INR',
      status: 'created'
    });

    // User attempts to send manipulated amount: 10 INR
    const orderRes10 = await client.post('/api/subscriptions/create-order', {
      section: 'notes',
      classLevel: 'Class 10',
      price: 10,
      amount: 10
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    expect(orderRes10.status).toBe(200);
    expect(orderRes10.data.amount).toBe(14900); // 149 INR in paise
    expect(mockRazorpayOrdersCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 14900,
      notes: expect.objectContaining({
        classLevel: 'class 10'
      })
    }));

    // Class 8 has no custom admin price: falls back to section plan price (99 INR -> 9900 paise)
    mockRazorpayOrdersCreate.mockResolvedValueOnce({
      id: 'order_rzp_class8_test',
      amount: 9900,
      currency: 'INR',
      status: 'created'
    });

    const orderRes8 = await client.post('/api/subscriptions/create-order', {
      section: 'notes',
      classLevel: 'Class 8',
      amount: 5
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    expect(orderRes8.status).toBe(200);
    expect(orderRes8.data.amount).toBe(9900);
    expect(mockRazorpayOrdersCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 9900
    }));

    // Unknown class returns 400
    const badClassRes = await client.post('/api/subscriptions/create-order', {
      section: 'notes',
      classLevel: 'Class 999 Nonexistent'
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(badClassRes.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Test (8) verify-order: takes class from SubscriptionOrder, enforces all 4 gates
  // -------------------------------------------------------------------------
  test('(8) verify-order takes classLevel from stored order, ignores request body classLevel, and strictly enforces 4 gates', async () => {
    const orderId = 'order_gate_test_10';
    const paymentId = 'pay_gate_test_10';
    const amountPaise = 14900;

    // Seed SubscriptionOrder with classLevel 'class 10'
    await SubscriptionOrder.create({
      razorpayOrderId: orderId,
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 10',
      durationDays: 30,
      amountPaise,
      currency: 'INR',
      status: 'created'
    });

    // Gate 1: Bad signature -> 400
    const badSigRes = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: 'invalid_tampered_signature_hex'
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(badSigRes.status).toBe(400);
    expect(badSigRes.data.error).toMatch(/signature/i);

    const validSig = makeSignature(orderId, paymentId);

    // Gate 2: Order ownership mismatch -> 403
    const hijackRes = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSig
    }, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(hijackRes.status).toBe(403);
    expect(hijackRes.data.error).toMatch(/ownership/i);

    // Gate 3: Payment not captured -> 400
    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'authorized', // Not captured
      amount: amountPaise,
      currency: 'INR'
    });

    const notCapturedRes = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSig
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(notCapturedRes.status).toBe(400);
    expect(notCapturedRes.data.error).toMatch(/captured/i);

    // Gate 3: Payment amount mismatch -> 400
    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      amount: 9900, // Expected 14900
      currency: 'INR'
    });

    const amountMismatchRes = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSig
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(amountMismatchRes.status).toBe(400);
    expect(amountMismatchRes.data.error).toMatch(/amount/i);

    // Successful Gate 4: Client tries to inject classLevel: 'class 8' in body
    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      amount: amountPaise,
      currency: 'INR',
      method: 'card'
    });

    const verifySuccess = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSig,
      classLevel: 'Class 8' // Tampered body class level
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    expect(verifySuccess.status).toBe(200);
    expect(verifySuccess.data.success).toBe(true);

    // Check newly created NoteSubscription has classLevel from order: 'class 10'
    const createdSub = await NoteSubscription.findOne({ razorpayPaymentId: paymentId });
    expect(createdSub).toBeTruthy();
    expect(createdSub.classLevel).toBe('class 10');
  });

  // -------------------------------------------------------------------------
  // Test (9) Renewal of Class 10 extends only Class 10 pass, leaves Class 8 pass untouched
  // -------------------------------------------------------------------------
  test('(9) Renewal of Class 10 extends only Class 10 pass, leaving Class 8 pass untouched', async () => {
    await NoteSubscription.deleteMany({ userId: studentUser._id });
    const NoteSubscriptionTimeline = mongoose.models.NoteSubscriptionTimeline || mongoose.model('NoteSubscriptionTimeline');
    if (NoteSubscriptionTimeline) {
      await NoteSubscriptionTimeline.deleteMany({});
    }

    const initialDate = new Date();
    const expiryClass8 = new Date(initialDate.getTime() + 15 * 86400000);
    const expiryClass10 = new Date(initialDate.getTime() + 20 * 86400000);

    const sub8 = await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 8',
      startDate: initialDate,
      expiresAt: expiryClass8
    });

    const sub10 = await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 10',
      startDate: initialDate,
      expiresAt: expiryClass10
    });

    // Create a renewal order for Class 10
    const renewalOrderId = 'ord_renew_c10';
    const renewalPaymentId = 'pay_renew_c10';
    await SubscriptionOrder.create({
      razorpayOrderId: renewalOrderId,
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 10',
      durationDays: 30,
      amountPaise: 9900,
      currency: 'INR',
      status: 'created'
    });

    mockRazorpayPaymentsFetch.mockResolvedValueOnce({
      id: renewalPaymentId,
      order_id: renewalOrderId,
      status: 'captured',
      amount: 9900,
      currency: 'INR'
    });

    const sig = makeSignature(renewalOrderId, renewalPaymentId);
    const renewRes = await client.post('/api/subscriptions/verify-order', {
      razorpay_order_id: renewalOrderId,
      razorpay_payment_id: renewalPaymentId,
      razorpay_signature: sig
    }, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(renewRes.status).toBe(200);

    // Verify Class 10 renewal extended from its previous expiry
    const renewedSub10 = await NoteSubscription.findOne({ razorpayPaymentId: renewalPaymentId });
    expect(renewedSub10).toBeTruthy();
    expect(renewedSub10.classLevel).toBe('class 10');
    expect(new Date(renewedSub10.expiresAt).getTime()).toBe(expiryClass10.getTime() + 30 * 86400000);

    // Verify Class 8 pass was NOT touched
    const refreshedSub8 = await NoteSubscription.findById(sub8._id);
    expect(new Date(refreshedSub8.expiresAt).getTime()).toBe(expiryClass8.getTime());
  });

  // -------------------------------------------------------------------------
  // Test (10) question_papers and videos sections behave section-wide as before
  // -------------------------------------------------------------------------
  test('(10) question_papers and videos sections behave section-wide as before', async () => {
    await NoteSubscription.deleteMany({ userId: studentUser._id });

    // Grant question_papers subscription
    await createSub({
      userId: studentUser._id,
      section: 'question_papers'
    });

    // Stream Class 10 QP note -> full 5 pages even though user holds no notes class pass
    const qpStream = await client.get(`/api/notes/${noteQpClass10._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(qpStream.status).toBe(200);
    const qpDoc = await PDFDocument.load(qpStream.data);
    expect(qpDoc.getPageCount()).toBe(5);

    // Seed a video item and grant videos subscription to secondStudentUser
    const paidVideo = await Note.create({
      title: 'Class 10 Math Video Lecture',
      section: 'videos',
      classLevel: 'Class 10',
      videoProvider: 'vimeo',
      videoUrl: 'https://player.vimeo.com/video/123456789',
      isFree: false,
      isPublished: true
    });

    await createSub({
      userId: secondStudentUser._id,
      section: 'videos'
    });

    const videoRes = await client.get(`/api/notes/${paidVideo._id}/media-url`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    expect(videoRes.status).toBe(200);
    expect(videoRes.data.url).toBe('https://player.vimeo.com/video/123456789');
  });

  // -------------------------------------------------------------------------
  // Test (11) Note with empty classLevel is readable with any active notes pass,
  // and other sections (others) are not affected by the class rule
  // -------------------------------------------------------------------------
  test('(11) Note with empty classLevel is readable with any active notes pass and other sections are not affected by class rule', async () => {
    // User has Class 8 pass; general note has empty classLevel
    await NoteSubscription.deleteMany({ userId: studentUser._id });

    await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 8'
    });

    const streamGeneral = await client.get(`/api/notes/${noteNoClass._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });
    expect(streamGeneral.status).toBe(200);
    const generalDoc = await PDFDocument.load(streamGeneral.data);
    expect(generalDoc.getPageCount()).toBe(5);

    // Other section (others) note with a classLevel: access governed by section pass, not class
    const othersNote = await Note.create({
      title: 'Class 10 Syllabus Guidance',
      section: 'others',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: 2048,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true
    });

    await createSub({
      userId: secondStudentUser._id,
      section: 'others'
    });

    const streamOthers = await client.get(`/api/notes/${othersNote._id}/stream`, {
      headers: { Authorization: `Bearer ${secondStudentToken}` },
      responseType: 'arraybuffer'
    });
    expect(streamOthers.status).toBe(200);
    const othersDoc = await PDFDocument.load(streamOthers.data);
    expect(othersDoc.getPageCount()).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test (12) Multi-class purchase (Class 8 then Class 10) saves with new indexes;
  // and proves that old indexes reject the second save with duplicate key errors
  // -------------------------------------------------------------------------
  test('(12) Multi-class purchase saves cleanly with new indexes, but old indexes reject second save with duplicate key error', async () => {
    await NoteSubscription.deleteMany({ userId: studentUser._id });

    const fixedExpiry = new Date('2026-12-30T10:00:00.000Z');

    // 1. User buys Class 8
    const sub8 = await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 8',
      subscriptionIndex: 1,
      expiresAt: fixedExpiry,
      status: 'active'
    });

    // 2. User buys Class 10 (same user, section 'notes', same subscriptionIndex and expiresAt)
    const sub10 = await createSub({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 10',
      subscriptionIndex: 1,
      expiresAt: fixedExpiry,
      status: 'active'
    });

    // Both documents save successfully with the NEW indexes!
    expect(sub8._id).toBeTruthy();
    expect(sub10._id).toBeTruthy();
    expect(sub8._id.toString()).not.toBe(sub10._id.toString());

    // Print the real documents' fields as requested:
    console.log('[PROMPT_VERIFY_4] Doc 1 (Class 8):', JSON.stringify({
      userId: sub8.userId.toString(),
      section: sub8.section,
      classLevel: sub8.classLevel,
      subscriptionIndex: sub8.subscriptionIndex,
      expiresAt: sub8.expiresAt.toISOString()
    }));

    console.log('[PROMPT_VERIFY_4] Doc 2 (Class 10):', JSON.stringify({
      userId: sub10.userId.toString(),
      section: sub10.section,
      classLevel: sub10.classLevel,
      subscriptionIndex: sub10.subscriptionIndex,
      expiresAt: sub10.expiresAt.toISOString()
    }));

    // 3. Now simulate the OLD indexes to prove which ones reject the second save:
    const oldIndexColl = mongoose.connection.collection('test_old_indexes_proof');
    await oldIndexColl.deleteMany({});

    // Create old indexes on test collection:
    // Old Index 1: userId_1_section_1_expiresAt_1
    await oldIndexColl.createIndex(
      { userId: 1, section: 1, expiresAt: 1 },
      { unique: true, partialFilterExpression: { status: 'active' }, name: 'userId_1_section_1_expiresAt_1' }
    );

    // Old Index 2: userId_1_section_1_subscriptionIndex_1
    await oldIndexColl.createIndex(
      { userId: 1, section: 1, subscriptionIndex: 1 },
      { unique: true, partialFilterExpression: { subscriptionIndex: { $type: 'number' } }, name: 'userId_1_section_1_subscriptionIndex_1' }
    );

    // Insert Doc 1 (Class 8):
    await oldIndexColl.insertOne({
      userId: studentUser._id,
      section: 'notes',
      classLevel: 'class 8',
      subscriptionIndex: 1,
      expiresAt: fixedExpiry,
      status: 'active'
    });

    // Attempt to insert Doc 2 (Class 10 with same subscriptionIndex):
    let subIndexCollisionErr = null;
    try {
      await oldIndexColl.insertOne({
        userId: studentUser._id,
        section: 'notes',
        classLevel: 'class 10',
        subscriptionIndex: 1,
        expiresAt: new Date('2026-12-31T10:00:00.000Z'),
        status: 'active'
      });
    } catch (err) {
      subIndexCollisionErr = err;
      console.log('[PROMPT_VERIFY_4] RAW ERROR on subscriptionIndex collision:', err.message);
    }
    expect(subIndexCollisionErr).toBeTruthy();
    expect(subIndexCollisionErr.code).toBe(11000);
    expect(subIndexCollisionErr.message).toMatch(/userId_1_section_1_subscriptionIndex_1/);

    // Attempt to insert Doc 3 (Class 10 with different subscriptionIndex but same expiresAt):
    let expiresAtCollisionErr = null;
    try {
      await oldIndexColl.insertOne({
        userId: studentUser._id,
        section: 'notes',
        classLevel: 'class 10',
        subscriptionIndex: 2,
        expiresAt: fixedExpiry,
        status: 'active'
      });
    } catch (err) {
      expiresAtCollisionErr = err;
      console.log('[PROMPT_VERIFY_4] RAW ERROR on expiresAt collision:', err.message);
    }
    expect(expiresAtCollisionErr).toBeTruthy();
    expect(expiresAtCollisionErr.code).toBe(11000);
    expect(expiresAtCollisionErr.message).toMatch(/userId_1_section_1_expiresAt_1/);
  });
});
