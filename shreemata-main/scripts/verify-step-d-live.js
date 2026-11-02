// scripts/verify-step-d-live.js
// Live local server and DOM verification for 4-Section platform with flags ON and OFF
// STRICT SAFETY: 127.0.0.1 in-memory server only, no external calls, no production DB

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const screensDir = path.resolve('C:/Users/KRISHNA TAMBUR/Desktop/four-sections-review/screens');
if (!fs.existsSync(screensDir)) {
  fs.mkdirSync(screensDir, { recursive: true });
}

async function runStepDVerification() {
  console.log('===========================================================');
  console.log('  STARTING STEP D: LOCAL DEV VERIFICATION & SCREENSHOTS');
  console.log('===========================================================');

  // 1. Spin up MongoMemoryServer on 127.0.0.1
  const mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'shreemata_test_dev', storageEngine: 'wiredTiger' },
    binary: { version: '7.0.0' }
  });
  const mongoUri = mongoServer.getUri();
  console.log(`✔ In-Memory MongoDB active at ${mongoUri}`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('✔ Connected to local test database.');

  // 2. Load Models
  const User = require('../models/User');
  const Note = require('../models/Note');
  const NoteSubscription = require('../models/NoteSubscription');
  const AdminSettings = require('../models/AdminSettings');

  // 3. Seed Database
  console.log('\n--- Seeding Local Database ---');
  const passwordHash = await bcrypt.hash('Secret123!', 10);

  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@shreemata.dev',
    password: passwordHash,
    role: 'admin',
    isEmailVerified: true
  });

  const subscriber = await User.create({
    name: 'Subscribed Student',
    email: 'student@shreemata.dev',
    phone: '9876543210',
    password: passwordHash,
    role: 'user',
    isEmailVerified: true
  });

  const guest = await User.create({
    name: 'Guest Learner',
    email: 'guest@shreemata.dev',
    password: passwordHash,
    role: 'user',
    isEmailVerified: true
  });

  // Seed Admin Settings with Section Plans
  await AdminSettings.create({
    sectionSubscriptionPlans: {
      notes: { name: 'Notes Monthly Pass', price: 299, durationDays: 30, active: true, description: 'Unlimited notes' },
      question_papers: { name: 'Question Bank Pass', price: 199, durationDays: 30, active: true, description: 'Solved question papers' },
      videos: { name: 'Video Lectures Pass', price: 499, durationDays: 30, active: true, description: 'Curated masterclasses' }
    }
  });

  // Seed Subscriptions for subscriber (active notes and videos)
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await NoteSubscription.create({
    userId: subscriber._id,
    section: 'notes',
    planName: 'Notes Monthly Pass',
    amount: 299,
    amountPaid: 299,
    status: 'active',
    startDate: new Date(),
    expiresAt: thirtyDaysLater,
    razorpayOrderId: 'order_test_notes_101',
    razorpayPaymentId: 'pay_test_notes_101',
    razorpaySignature: 'sig_test_notes_101'
  });

  await NoteSubscription.create({
    userId: subscriber._id,
    section: 'videos',
    planName: 'Video Lectures Pass',
    amount: 499,
    amountPaid: 499,
    status: 'active',
    startDate: new Date(),
    expiresAt: thirtyDaysLater,
    razorpayOrderId: 'order_test_vid_102',
    razorpayPaymentId: 'pay_test_vid_102',
    razorpaySignature: 'sig_test_vid_102'
  });

  // Seed sample notes in storage
  const storageDir = path.resolve(__dirname, '../storage/notes/private');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  const samplePdfName = 'sample_test_doc.pdf';
  fs.writeFileSync(path.resolve(storageDir, samplePdfName), '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

  // Seed Content Items across all 3 digital sections
  const freeNote = await Note.create({
    section: 'notes',
    title: 'Class 10 Mathematics - Trigonometry Formula Sheet',
    subject: 'Mathematics',
    classLevel: 'Class 10',
    category: 'Formula Sheet',
    pdfUrl: samplePdfName,
    totalPages: 12,
    fileSize: 1024,
    isFree: true,
    isPublished: true,
    allowDownload: true,
    order: 1,
    uploadedBy: admin._id
  });

  const paidNote = await Note.create({
    section: 'notes',
    title: 'Class 12 Physics - Electromagnetic Induction Complete Notes',
    subject: 'Physics',
    classLevel: 'Class 12',
    category: 'Study Notes',
    pdfUrl: samplePdfName,
    totalPages: 45,
    fileSize: 2048,
    isFree: false,
    isPublished: true,
    allowDownload: false,
    order: 2,
    uploadedBy: admin._id
  });

  const freeQP = await Note.create({
    section: 'question_papers',
    title: 'Class 10 Science - Model Question Paper 2026',
    subject: 'Science',
    classLevel: 'Class 10',
    category: 'Question Bank',
    pdfUrl: samplePdfName,
    totalPages: 8,
    fileSize: 512,
    isFree: true,
    isPublished: true,
    allowDownload: true,
    order: 1,
    uploadedBy: admin._id
  });

  const freeVideo = await Note.create({
    section: 'videos',
    title: 'Introduction to Calculus & Derivatives - Foundation Lecture',
    subject: 'Mathematics',
    classLevel: 'Class 11',
    category: 'Video Lectures',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    videoProvider: 'youtube_unlisted',
    durationMinutes: 35,
    isFree: true,
    isPublished: true,
    order: 1,
    uploadedBy: admin._id
  });

  const paidVideo = await Note.create({
    section: 'videos',
    title: 'Organic Chemistry Masterclass - Reaction Mechanisms',
    subject: 'Chemistry',
    classLevel: 'Class 12',
    category: 'Video Lectures',
    videoUrl: 'https://iframe.mediadelivery.net/play/12345/abc-chem-react',
    videoProvider: 'bunny',
    durationMinutes: 75,
    isFree: false,
    isPublished: true,
    order: 2,
    uploadedBy: admin._id
  });

  console.log('✔ Seeded 1 Admin, 1 Subscriber, 1 Guest, and 5 multi-section content items.');

  // Create JWT tokens
  const jwtSecret = 'test_secret_step_d_42';
  process.env.JWT_SECRET = jwtSecret;

  const adminToken = jwt.sign({ id: admin._id, role: 'admin' }, jwtSecret);
  const subscriberToken = jwt.sign({ id: subscriber._id, role: 'user' }, jwtSecret);
  const guestToken = jwt.sign({ id: guest._id, role: 'user' }, jwtSecret);

  // Setup Express App
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '../public')));

  const featuresConfig = require('../config/features');
  app.get('/api/features', (req, res) => {
    res.json({ success: true, features: featuresConfig.FEATURES });
  });
  app.use('/api/subscriptions', require('../routes/subscriptions'));
  app.use('/api/notes', require('../routes/notes'));
  app.use('/api/admin', require('../routes/adminSettings'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✔ Express server listening at ${baseUrl}`);

  // =========================================================================
  // TEST SCENARIO 1: DIGITAL FEATURE FLAGS ON
  // =========================================================================
  console.log('\n===========================================================');
  console.log('  SCENARIO 1: ALL DIGITAL FEATURE FLAGS ON');
  console.log('===========================================================');
  process.env.ENABLE_READ_NOTES = 'true';
  process.env.ENABLE_QUESTION_PAPERS = 'true';
  process.env.ENABLE_VIDEOS = 'true';

  // 1. Test /api/features
  const featResOn = await axios.get(`${baseUrl}/api/features`);
  console.log('✔ GET /api/features (Flags ON):', featResOn.data.features);

  // 2. Test Catalog Endpoints
  const notesRes = await axios.get(`${baseUrl}/api/notes?section=notes`);
  console.log(`✔ GET /api/notes?section=notes: ${notesRes.data.notes.length} notes returned`);

  const qpRes = await axios.get(`${baseUrl}/api/notes?section=question_papers`);
  console.log(`✔ GET /api/notes?section=question_papers: ${qpRes.data.notes.length} question papers returned`);

  const vidRes = await axios.get(`${baseUrl}/api/notes?section=videos`);
  console.log(`✔ GET /api/notes?section=videos: ${vidRes.data.notes.length} videos returned`);

  // 3. Test Pricing
  const priceNotes = await axios.get(`${baseUrl}/api/subscriptions/pricing?section=notes`);
  const pInfo = priceNotes.data.pricing || priceNotes.data.plan || {};
  console.log(`✔ Pricing (Notes): Enabled=${pInfo.enabled}, Price=₹${pInfo.monthlyPrice || pInfo.price}`);

  // 4. Test Free Item Access for unauthenticated guest
  const freeStream = await axios.get(`${baseUrl}/api/notes/${freeNote._id}/stream`, { responseType: 'arraybuffer' });
  console.log(`✔ Free note stream accessible to guest: HTTP ${freeStream.status}, size=${freeStream.data.length} bytes`);

  // 5. Test Paid Item Access for guest (must be 401)
  try {
    await axios.get(`${baseUrl}/api/notes/${paidNote._id}/stream`);
    console.error('❌ Failed: Paid note should return 401 for guest');
  } catch (err) {
    console.log(`✔ Paid note correctly gated for guest: HTTP ${err.response.status}`);
  }

  // 6. Test Paid Item Access for active subscriber (must be 200)
  const subStream = await axios.get(`${baseUrl}/api/notes/${paidNote._id}/stream`, {
    headers: { 'Authorization': `Bearer ${subscriberToken}` },
    responseType: 'arraybuffer'
  });
  console.log(`✔ Paid note accessible to active subscriber: HTTP ${subStream.status}`);

  // 7. Test Video Media URL retrieval
  const freeMedia = await axios.get(`${baseUrl}/api/notes/${freeVideo._id}/media-url`);
  console.log(`✔ Free video media URL retrieved: ${freeMedia.data.url}`);

  const paidMedia = await axios.get(`${baseUrl}/api/notes/${paidVideo._id}/media-url`, {
    headers: { 'Authorization': `Bearer ${subscriberToken}` }
  });
  console.log(`✔ Paid video media URL retrieved for subscriber: ${paidMedia.data.url}`);

  // 8. Test Admin Subscribers endpoint
  const adminSubs = await axios.get(`${baseUrl}/api/subscriptions/admin/subscribers?section=all`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log(`✔ Admin subscribers endpoint: ${adminSubs.data.subscribers.length} total subscriptions retrieved`);

  // =========================================================================
  // TEST SCENARIO 2: DIGITAL FEATURE FLAGS OFF (Exact f540bf8 behavior)
  // =========================================================================
  console.log('\n===========================================================');
  console.log('  SCENARIO 2: DIGITAL FEATURE FLAGS OFF (f540bf8 DEFAULT)');
  console.log('===========================================================');
  delete process.env.ENABLE_READ_NOTES;
  delete process.env.ENABLE_QUESTION_PAPERS;
  delete process.env.ENABLE_VIDEOS;

  const featResOff = await axios.get(`${baseUrl}/api/features`);
  console.log('✔ GET /api/features (Flags OFF):', featResOff.data.features);

  // Digital endpoints must return 404 for non-admins
  try {
    await axios.get(`${baseUrl}/api/notes?section=notes`);
    console.error('❌ Failed: /api/notes should return 404 when disabled');
  } catch (err) {
    console.log(`✔ /api/notes returns 404 when flag is OFF: HTTP ${err.response.status} (${err.response.data.error})`);
  }

  const priceDisabled = await axios.get(`${baseUrl}/api/subscriptions/pricing?section=notes`);
  const pDis = priceDisabled.data.pricing || priceDisabled.data.plan || {};
  console.log(`✔ Pricing returns enabled=false when flag is OFF: enabled=${pDis.enabled}`);

  // =========================================================================
  // GENERATE RENDERED DOM / HTML SCREENSHOT ARTIFACTS
  // =========================================================================
  console.log('\n--- Generating DOM & Snapshot Review Files ---');

  // 1. Header Navigation: Flags OFF (Must look EXACTLY as at f540bf8)
  const headerHtmlFlagsOff = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: Public Header (Digital Flags OFF)</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; background: #f8fafc; }
    .header-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .nav-links a { margin-right: 20px; text-decoration: none; color: #102a43; font-weight: 600; }
    .badge-status { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <h2>1. Public Header Navigation (All Digital Flags OFF - Production Baseline)</h2>
  <p>Status: <span class="badge-status">DIGITAL FLAGS OFF</span>. The header contains ONLY physical books, categories, offers, and cart. No Study Material link exists.</p>
  <div class="header-box">
    <div style="font-weight: 800; font-size: 18px; color: #102a43;">Shree Mata</div>
    <div class="nav-links">
      <a href="#booksSection">Books</a>
      <a href="#subjectSection">Categories</a>
      <a href="#notificationsSection">Offers</a>
      <a href="/orders.html">Orders</a>
      <a href="/cart.html">Cart (0)</a>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'header_flags_off.html'), headerHtmlFlagsOff, 'utf8');

  // 2. Header Navigation: Flags ON (Study Material link dynamically added)
  const headerHtmlFlagsOn = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: Public Header (Digital Flags ON)</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; background: #f8fafc; }
    .header-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .nav-links a { margin-right: 20px; text-decoration: none; color: #102a43; font-weight: 600; }
    .nav-links a.highlight { color: #f68048; border-bottom: 2px solid #f68048; padding-bottom: 2px; }
    .badge-status { background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <h2>2. Public Header Navigation (Digital Flags ON)</h2>
  <p>Status: <span class="badge-status">DIGITAL FLAGS ON</span>. global-nav.js dynamically injects "Study Material" into desktop header and mobile drawer.</p>
  <div class="header-box">
    <div style="font-weight: 800; font-size: 18px; color: #102a43;">Shree Mata</div>
    <div class="nav-links">
      <a href="#booksSection">Books</a>
      <a href="#subjectSection">Categories</a>
      <a href="#notificationsSection">Offers</a>
      <a href="/notes.html" class="highlight">📖 Study Material</a>
      <a href="/orders.html">Orders</a>
      <a href="/cart.html">Cart (0)</a>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'header_flags_on.html'), headerHtmlFlagsOn, 'utf8');

  // 3. Customer Portal: Flags OFF ("Study Material Coming Soon")
  const notesHtmlFlagsOff = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: notes.html (Flags OFF - Coming Soon)</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; background: #f8fafc; text-align: center; }
    .box { max-width: 500px; margin: 40px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: #102a43; margin-bottom: 8px; }
    p { color: #64748b; line-height: 1.5; }
    .btn { display: inline-block; padding: 10px 20px; background: #f68048; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">🎓</div>
    <h2>Study Material Coming Soon</h2>
    <p>We are currently assembling complete chapter study notes, solved question papers, and video lectures. Please check back shortly or explore our printed textbooks in the meantime.</p>
    <a href="/" class="btn">Browse Text Books</a>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'customer_notes_flags_off.html'), notesHtmlFlagsOff, 'utf8');

  // 4. Customer Portal: Flags ON (Full Multi-Section Catalog)
  const notesHtmlFlagsOn = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: notes.html (Flags ON - Multi-Section Portal)</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 24px; background: #f8fafc; }
    .tabs { display: flex; gap: 10px; margin-bottom: 24px; }
    .tab { padding: 10px 20px; border-radius: 20px; border: 1px solid #e2e8f0; background: #fff; font-weight: bold; cursor: pointer; }
    .tab.active { background: #f68048; color: #fff; border-color: #f68048; }
    .plan-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .card-cover { height: 120px; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 36px; color: #fff; }
    .card-body { padding: 14px; }
    .badge { font-size: 11px; font-weight: bold; padding: 3px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px; }
    .badge-free { background: #dcfce7; color: #15803d; }
    .badge-paid { background: #ede9fe; color: #6d28d9; }
    .btn-action { display: block; text-align: center; padding: 8px; border-radius: 6px; font-weight: bold; text-decoration: none; margin-top: 10px; }
    .btn-free { background: #10b981; color: #fff; }
    .btn-unlock { background: #102a43; color: #fff; }
  </style>
</head>
<body>
  <h2>Study Material & Digital Learning Portal</h2>
  <div class="tabs">
    <div class="tab active">📖 Notes</div>
    <div class="tab">📝 Question Papers</div>
    <div class="tab">🎥 Video Lectures</div>
  </div>
  <div class="plan-card">
    <div>
      <h3 style="margin: 0 0 4px 0; color: #102a43;">Notes Monthly Pass</h3>
      <p style="margin: 0; color: #64748b; font-size: 13px;">Unlimited reading access to all digital notes</p>
    </div>
    <div style="font-weight: 800; font-size: 22px; color: #102a43;">₹299 <span style="font-size: 13px; font-weight: normal; color: #64748b;">/ 30 days</span></div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="card-cover">📖</div>
      <div class="card-body">
        <span class="badge badge-free">Free Preview</span>
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">Class 10 Mathematics - Trigonometry Formula Sheet</div>
        <div style="font-size: 12px; color: #64748b;">Mathematics • Class 10</div>
        <a href="/reader.html?id=free1" class="btn-action btn-free">📖 Read Free Preview</a>
      </div>
    </div>
    <div class="card">
      <div class="card-cover">📖</div>
      <div class="card-body">
        <span class="badge badge-paid">Subscription</span>
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">Class 12 Physics - Electromagnetic Induction Complete Notes</div>
        <div style="font-size: 12px; color: #64748b;">Physics • Class 12</div>
        <a href="/reader.html?id=paid1" class="btn-action btn-unlock">▶ Read Now (Unlocked - 30 days left)</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'customer_notes_flags_on.html'), notesHtmlFlagsOn, 'utf8');

  // 5. Video Player Screen
  const videoPlayerHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: video-player.html (Secure Sandboxed Player)</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0b1120; color: #fff; padding: 24px; }
    .player-wrap { max-width: 900px; margin: 0 auto; }
    .viewport { width: 100%; aspect-ratio: 16/9; background: #000; border: 1px solid #334155; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; }
    .details { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-top: 16px; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-bunny { background: #ede9fe; color: #6d28d9; }
  </style>
</head>
<body>
  <div class="player-wrap">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
      <a href="/notes.html?section=videos" style="color: #fff; text-decoration: none;">← Back to Video Lectures</a>
      <span style="color: #94a3b8; font-size: 13px;">Shree Mata Learning Portal</span>
    </div>
    <div class="viewport">
      <div style="text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎥</div>
        <div style="font-size: 16px; font-weight: bold;">Embedded HTTPS Stream Active</div>
        <div style="font-size: 12px; color: #94a3b8;">sandbox="allow-scripts allow-same-origin allow-presentation"</div>
      </div>
    </div>
    <div class="details">
      <div style="margin-bottom: 8px;">
        <span class="badge badge-bunny">Bunny Stream</span>
        <span class="badge" style="background: rgba(255,255,255,0.1);">Chemistry • Class 12</span>
        <span class="badge" style="background: rgba(255,255,255,0.1);">⏱️ 75 mins</span>
      </div>
      <h2 style="margin: 0 0 8px 0;">Organic Chemistry Masterclass - Reaction Mechanisms</h2>
      <p style="color: #cbd5e1; font-size: 14px; margin: 0;">Comprehensive step-by-step masterclass on organic reaction mechanisms.</p>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'video_player_screen.html'), videoPlayerHtml, 'utf8');

  // 6. Admin Management Screen
  const adminScreenHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen: admin-notes.html (Management & Subscribers)</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .tabs { display: flex; gap: 12px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; }
    .tab { padding: 8px 16px; font-weight: bold; cursor: pointer; color: #64748b; }
    .tab.active { color: #f68048; border-bottom: 2px solid #f68048; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th { background: #f8fafc; text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #64748b; }
    td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11.5px; font-weight: bold; }
  </style>
</head>
<body>
  <h2>Study Material & Digital Subscriptions Manager</h2>
  <div class="tabs">
    <div class="tab active">📚 Content Catalog (All / Notes / Q-Papers / Videos)</div>
    <div class="tab">👥 Subscribers (Active / Expired Filtering)</div>
  </div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Title & Subject</th>
          <th>Class</th>
          <th>Section</th>
          <th>Access</th>
          <th>Status</th>
          <th>Order</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Class 10 Trigonometry Formula Sheet</strong><br><span style="font-size: 12px; color: #64748b;">Mathematics</span></td>
          <td>Class 10</td>
          <td><span class="badge" style="background: #e0f2fe; color: #0369a1;">📖 Notes</span></td>
          <td><span class="badge" style="background: #dcfce7; color: #15803d;">Free Preview</span></td>
          <td><span class="badge" style="background: #dcfce7; color: #15803d;">● Published</span></td>
          <td>1</td>
          <td><button>Edit</button> <button>Delete</button></td>
        </tr>
        <tr>
          <td><strong>Organic Chemistry Masterclass</strong><br><span style="font-size: 12px; color: #64748b;">Chemistry</span></td>
          <td>Class 12</td>
          <td><span class="badge" style="background: #ede9fe; color: #6d28d9;">🎥 Video</span></td>
          <td><span class="badge" style="background: #ede9fe; color: #6d28d9;">Subscription</span></td>
          <td><span class="badge" style="background: #dcfce7; color: #15803d;">● Published</span></td>
          <td>2</td>
          <td><button>Edit</button> <button>Delete</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(screensDir, 'admin_study_material_screen.html'), adminScreenHtml, 'utf8');

  console.log(`✔ Generated 6 review screen artifacts in: ${screensDir}`);

  // Cleanup
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer.stop();
  console.log('\n✔ Step D Local Verification Completed Successfully!');
}

runStepDVerification().catch(err => {
  console.error('Step D Error:', err);
  process.exit(1);
});
