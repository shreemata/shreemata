// tests/previewPagesAndAccess.test.js
// Comprehensive test suite for PDF Preview Pages and Access Control

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const { setupTestDB, teardownTestDB } = require('./setup');
const User = require('../models/User');
const Note = require('../models/Note');
const NoteSubscription = require('../models/NoteSubscription');
const AdminSettings = require('../models/AdminSettings');
const { FEATURES } = require('../config/features');

describe('PDF Preview Pages & Access Control', () => {
  let server;
  let client;
  let testStorageDir;
  const samplePdfKey = 'sample_multi_page.pdf';

  let adminUser, adminToken;
  let regularUser, regularToken;
  let notesSubUser, notesSubToken;
  let qpSubUser, qpSubToken;
  let grantUser, grantToken;

  let noteWithPreview;
  let noteWithIsFreeTrue;
  let noteLocked;
  let qpNote;
  let othersNote;
  let freeVideo;
  let paidVideo;
  let othersSubUser, othersSubToken;

  const JWT_SECRET = 'test_jwt_secret_preview_pages_99';

  beforeAll(async () => {
    await setupTestDB();

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.ENABLE_READ_NOTES = 'true';
    process.env.ENABLE_QUESTION_PAPERS = 'true';
    process.env.ENABLE_VIDEOS = 'true';
    process.env.ENABLE_OTHERS = 'true';

    // 1. Prepare storage dir and create a real 5-page PDF fixture using pdf-lib
    testStorageDir = path.resolve(__dirname, '../storage/notes/private');
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    const samplePdfPath = path.resolve(testStorageDir, samplePdfKey);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 5; i++) {
      const page = doc.addPage([595, 842]);
      page.drawText(`Sample Test Document - Page ${i} of 5`, {
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
    app.use('/api/subscriptions', require('../routes/subscriptions'));
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
      name: 'Admin User',
      email: 'admin.preview@shreemata.test',
      phone: '9100000001',
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET);

    regularUser = await User.create({
      name: 'Regular Non-Sub User',
      email: 'regular.preview@shreemata.test',
      phone: '9100000002',
      password: 'password123',
      role: 'user'
    });
    regularToken = jwt.sign({ id: regularUser._id, role: 'user' }, JWT_SECRET);

    notesSubUser = await User.create({
      name: 'Notes Sub User',
      email: 'notessub.preview@shreemata.test',
      phone: '9100000003',
      password: 'password123',
      role: 'user'
    });
    notesSubToken = jwt.sign({ id: notesSubUser._id, role: 'user' }, JWT_SECRET);

    qpSubUser = await User.create({
      name: 'QP Sub User',
      email: 'qpsub.preview@shreemata.test',
      phone: '9100000004',
      password: 'password123',
      role: 'user'
    });
    qpSubToken = jwt.sign({ id: qpSubUser._id, role: 'user' }, JWT_SECRET);

    grantUser = await User.create({
      name: 'Admin Grant User',
      email: 'grant.preview@shreemata.test',
      phone: '9100000005',
      password: 'password123',
      role: 'user'
    });
    grantToken = jwt.sign({ id: grantUser._id, role: 'user' }, JWT_SECRET);

    othersSubUser = await User.create({
      name: 'Others Sub User',
      email: 'others.preview@shreemata.test',
      phone: '9100000006',
      password: 'password123',
      role: 'user'
    });
    othersSubToken = jwt.sign({ id: othersSubUser._id, role: 'user' }, JWT_SECRET);

    // 4. Seed Subscriptions
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await NoteSubscription.create({
      userId: notesSubUser._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      razorpayOrderId: 'ord_notes_test',
      razorpayPaymentId: 'pay_notes_test',
      razorpaySignature: 'sig_notes_test',
      status: 'active',
      expiresAt: futureDate
    });

    await NoteSubscription.create({
      userId: qpSubUser._id,
      section: 'question_papers',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      razorpayOrderId: 'ord_qp_test',
      razorpayPaymentId: 'pay_qp_test',
      razorpaySignature: 'sig_qp_test',
      status: 'active',
      expiresAt: futureDate
    });

    await NoteSubscription.create({
      userId: othersSubUser._id,
      section: 'others',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      razorpayOrderId: 'ord_others_test',
      razorpayPaymentId: 'pay_others_test',
      razorpaySignature: 'sig_others_test',
      status: 'active',
      expiresAt: futureDate
    });

    await NoteSubscription.create({
      userId: grantUser._id,
      section: 'notes',
      planType: 'admin_grant',
      durationDays: 30,
      amountPaid: 0,
      status: 'active',
      grantedBy: adminUser._id,
      grantedAt: new Date(),
      expiresAt: futureDate
    });

    // 5. Seed Test Notes
    noteWithPreview = await Note.create({
      section: 'notes',
      title: 'Note with 2 Preview Pages',
      subject: 'Physics',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true,
      uploadedBy: adminUser._id
    });

    noteWithIsFreeTrue = await Note.create({
      section: 'notes',
      title: 'Note with isFree true in DB',
      subject: 'Chemistry',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: true, // MUST be ignored for PDF section!
      isPublished: true,
      allowDownload: true,
      uploadedBy: adminUser._id
    });

    noteLocked = await Note.create({
      section: 'notes',
      title: 'Fully Locked Note (0 preview pages)',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 0,
      isFree: false,
      isPublished: true,
      allowDownload: true,
      uploadedBy: adminUser._id
    });

    qpNote = await Note.create({
      section: 'question_papers',
      title: 'Question Paper with 3 Preview Pages',
      subject: 'Science',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 3,
      isFree: false,
      isPublished: true,
      allowDownload: true,
      uploadedBy: adminUser._id
    });

    othersNote = await Note.create({
      section: 'others',
      title: 'Other Item with 2 Preview Pages',
      subject: 'Guidance',
      classLevel: 'Class 10',
      pdfUrl: samplePdfKey,
      fileSize: sampleBytes.length,
      totalPages: 5,
      previewPages: 2,
      isFree: false,
      isPublished: true,
      allowDownload: true,
      uploadedBy: adminUser._id
    });

    freeVideo = await Note.create({
      section: 'videos',
      title: 'Free Video Lecture',
      videoUrl: 'https://iframe.mediadelivery.net/play/100/free-stream',
      videoProvider: 'bunny',
      isFree: true,
      isPublished: true,
      uploadedBy: adminUser._id
    });

    paidVideo = await Note.create({
      section: 'videos',
      title: 'Paid Video Lecture',
      videoUrl: 'https://iframe.mediadelivery.net/play/100/paid-stream',
      videoProvider: 'bunny',
      isFree: false,
      isPublished: true,
      uploadedBy: adminUser._id
    });
  });

  // =========================================================================
  // 1. NON-ENTITLED USER RECEIVES EXACTLY N PREVIEW PAGES
  // =========================================================================
  it('streams exactly previewPages (2 pages) for logged-in non-entitled user', async () => {
    const res = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${regularToken}` },
      responseType: 'arraybuffer'
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/preview\.pdf/i);

    const receivedDoc = await PDFDocument.load(res.data);
    expect(receivedDoc.getPageCount()).toBe(2);
  });

  // =========================================================================
  // 2. isFree: true IN DATABASE DOES NOT GRANT FULL ACCESS FOR PDF SECTIONS
  // =========================================================================
  it('ignores isFree: true on PDF notes and delivers only preview pages to non-subscribers', async () => {
    const res = await client.get(`/api/notes/${noteWithIsFreeTrue._id}/stream`, {
      headers: { Authorization: `Bearer ${regularToken}` },
      responseType: 'arraybuffer'
    });

    expect(res.status).toBe(200);
    const receivedDoc = await PDFDocument.load(res.data);
    expect(receivedDoc.getPageCount()).toBe(2);
    expect(receivedDoc.getPageCount()).not.toBe(5);
  });

  // =========================================================================
  // 3. DOWNLOAD IS REJECTED (403) FOR PREVIEW-ONLY USERS
  // =========================================================================
  it('rejects download attempt by non-entitled preview user with 403 SUBSCRIPTION_REQUIRED', async () => {
    const res = await client.get(`/api/notes/${noteWithPreview._id}/download`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });

    expect(res.status).toBe(403);
    expect(res.data.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(res.data.error).toMatch(/Download is only available for subscribers/i);
  });

  // =========================================================================
  // 4. previewPages: 0 RETURNS 403 FOR NON-SUBSCRIBERS
  // =========================================================================
  it('returns 403 Forbidden for non-subscribers when previewPages is 0', async () => {
    const resStream = await client.get(`/api/notes/${noteLocked._id}/stream`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });

    expect(resStream.status).toBe(403);
    expect(resStream.data.code).toBe('SUBSCRIPTION_REQUIRED');

    const resDl = await client.get(`/api/notes/${noteLocked._id}/download`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    expect(resDl.status).toBe(403);
  });

  // =========================================================================
  // 5. UNAUTHENTICATED GUEST GETS 401
  // =========================================================================
  it('returns 401 Unauthorized for unauthenticated guests streaming PDF notes', async () => {
    const res = await client.get(`/api/notes/${noteWithPreview._id}/stream`);
    expect(res.status).toBe(401);
    expect(res.data.error).toMatch(/Authentication required/i);
  });

  // =========================================================================
  // 6. SUBSCRIBER GETS FULL FILE (5 PAGES) AND FULL DOWNLOAD
  // =========================================================================
  it('delivers all 5 pages and authorizes download for active notes subscriber', async () => {
    const resStream = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${notesSubToken}` },
      responseType: 'arraybuffer'
    });

    expect(resStream.status).toBe(200);
    expect(resStream.headers['content-disposition']).toMatch(/document\.pdf/i);
    const streamDoc = await PDFDocument.load(resStream.data);
    expect(streamDoc.getPageCount()).toBe(5);

    const resDl = await client.get(`/api/notes/${noteWithPreview._id}/download`, {
      headers: { Authorization: `Bearer ${notesSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resDl.status).toBe(200);
    const dlDoc = await PDFDocument.load(resDl.data);
    expect(dlDoc.getPageCount()).toBe(5);
  });

  // =========================================================================
  // 7. ADMIN GETS FULL FILE (5 PAGES) AND FULL DOWNLOAD
  // =========================================================================
  it('delivers all 5 pages and authorizes download for administrator', async () => {
    const resStream = await client.get(`/api/notes/${noteLocked._id}/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      responseType: 'arraybuffer'
    });

    expect(resStream.status).toBe(200);
    const streamDoc = await PDFDocument.load(resStream.data);
    expect(streamDoc.getPageCount()).toBe(5);

    const resDl = await client.get(`/api/notes/${noteLocked._id}/download`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      responseType: 'arraybuffer'
    });
    expect(resDl.status).toBe(200);
    const dlDoc = await PDFDocument.load(resDl.data);
    expect(dlDoc.getPageCount()).toBe(5);
  });

  // =========================================================================
  // 8. ADMIN GRANT USER GETS FULL ACCESS
  // =========================================================================
  it('delivers all 5 pages for admin_grant access recipient', async () => {
    const resStream = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${grantToken}` },
      responseType: 'arraybuffer'
    });

    expect(resStream.status).toBe(200);
    const streamDoc = await PDFDocument.load(resStream.data);
    expect(streamDoc.getPageCount()).toBe(5);
  });

  // =========================================================================
  // 9. SECTION ISOLATION HOLDS
  // =========================================================================
  it('enforces section isolation between notes and question papers', async () => {
    // QP subscriber gets only preview of notes
    const resNoteForQpUser = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${qpSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resNoteForQpUser.status).toBe(200);
    const noteDoc = await PDFDocument.load(resNoteForQpUser.data);
    expect(noteDoc.getPageCount()).toBe(2);

    // QP subscriber gets FULL access to question papers
    const resQpForQpUser = await client.get(`/api/notes/${qpNote._id}/stream`, {
      headers: { Authorization: `Bearer ${qpSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resQpForQpUser.status).toBe(200);
    const qpDoc = await PDFDocument.load(resQpForQpUser.data);
    expect(qpDoc.getPageCount()).toBe(5);
  });

  it('enforces section isolation between notes and others section', async () => {
    // Unauthenticated guest gets 401 on others
    const resGuest = await client.get(`/api/notes/${othersNote._id}/stream`);
    expect(resGuest.status).toBe(401);

    // Notes subscriber gets only preview of others
    const resOtherForNotesUser = await client.get(`/api/notes/${othersNote._id}/stream`, {
      headers: { Authorization: `Bearer ${notesSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resOtherForNotesUser.status).toBe(200);
    const otherDocForNotes = await PDFDocument.load(resOtherForNotesUser.data);
    expect(otherDocForNotes.getPageCount()).toBe(2);

    // Others subscriber gets only preview of notes
    const resNoteForOthersUser = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: { Authorization: `Bearer ${othersSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resNoteForOthersUser.status).toBe(200);
    const noteDocForOthers = await PDFDocument.load(resNoteForOthersUser.data);
    expect(noteDocForOthers.getPageCount()).toBe(2);

    // Others subscriber gets FULL access to others
    const resOtherForOthersUser = await client.get(`/api/notes/${othersNote._id}/stream`, {
      headers: { Authorization: `Bearer ${othersSubToken}` },
      responseType: 'arraybuffer'
    });
    expect(resOtherForOthersUser.status).toBe(200);
    const fullOtherDoc = await PDFDocument.load(resOtherForOthersUser.data);
    expect(fullOtherDoc.getPageCount()).toBe(5);
  });

  // =========================================================================
  // 10. VIDEOS RULES REMAIN UNAFFECTED
  // =========================================================================
  it('preserves existing video access rules: free videos playable by guests', async () => {
    const resFreeVid = await client.get(`/api/notes/${freeVideo._id}/media-url`);
    expect(resFreeVid.status).toBe(200);
    expect(resFreeVid.data).toHaveProperty('url', 'https://iframe.mediadelivery.net/play/100/free-stream');

    const resPaidVid = await client.get(`/api/notes/${paidVideo._id}/media-url`);
    expect(resPaidVid.status).toBe(401);
  });

  // =========================================================================
  // 11. API CONTRACT: previewPages, totalPages, hasFullAccess, previewOnly
  // =========================================================================
  it('exposes previewPages, totalPages, hasFullAccess, previewOnly in API metadata', async () => {
    // Non-entitled user view
    const resUser = await client.get(`/api/notes/${noteWithPreview._id}`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    expect(resUser.status).toBe(200);
    expect(resUser.data.note).toHaveProperty('previewPages', 2);
    expect(resUser.data.note).toHaveProperty('totalPages', 5);
    expect(resUser.data.note).toHaveProperty('hasFullAccess', false);
    expect(resUser.data.note).toHaveProperty('previewOnly', true);
    expect(resUser.data.note).not.toHaveProperty('pdfUrl');

    // Subscribed user view
    const resSub = await client.get(`/api/notes/${noteWithPreview._id}`, {
      headers: { Authorization: `Bearer ${notesSubToken}` }
    });
    expect(resSub.status).toBe(200);
    expect(resSub.data.note).toHaveProperty('hasFullAccess', true);
    expect(resSub.data.note).toHaveProperty('previewOnly', false);
  });

  // =========================================================================
  // 12. RANGE REQUEST STREAMING ON PREVIEW PDF
  // =========================================================================
  it('supports HTTP range requests on preview stream', async () => {
    const resRange = await client.get(`/api/notes/${noteWithPreview._id}/stream`, {
      headers: {
        Authorization: `Bearer ${regularToken}`,
        Range: 'bytes=0-100'
      },
      responseType: 'arraybuffer'
    });

    expect(resRange.status).toBe(206);
    expect(resRange.headers['accept-ranges']).toBe('bytes');
    expect(resRange.headers['content-range']).toMatch(/^bytes 0-100\/\d+/);
    expect(resRange.data.length).toBe(101);
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDB();
  });
});
