/**
 * dev-run-four-sections.js
 * One-command local review launcher for Shree Mata 4-Sections feature.
 * 
 * Safety:
 * - Refuses to start if MONGO_URI/MONGODB_URI in environment is non-local.
 * - Uses in-memory MongoDB (MongoMemoryServer) on 127.0.0.1.
 * - Seeds demo users, physical books, digital items, real 3-page PDFs in temp storage.
 * - Runs on http://127.0.0.1:3100.
 */

process.env.MONGOMS_STARTUP_TIMEOUT = '60000';

const path = require('path');
const fs = require('fs');
const os = require('os');

// 1. Strict Environment Safety Guard
const incomingMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (incomingMongoUri) {
  const isLocal = incomingMongoUri.includes('127.0.0.1') || incomingMongoUri.includes('localhost');
  if (!isLocal) {
    console.error('\n❌ FATAL: MONGO_URI or MONGODB_URI in environment points to an external database!');
    console.error('   This script only runs with isolated in-memory or 127.0.0.1 MongoDB.');
    console.error('   Refusing to start to protect production data.\n');
    process.exit(1);
  }
}

// 2. Feature Flags Evaluation
const rawFlags = (process.env.FLAGS || 'on').trim().toLowerCase();
const isFlagsOn = rawFlags !== 'off' && rawFlags !== 'false' && rawFlags !== '0';

process.env.ENABLE_TEXT_BOOK = 'true';
process.env.ENABLE_READ_NOTES = isFlagsOn ? 'true' : 'false';
process.env.ENABLE_QUESTION_PAPERS = isFlagsOn ? 'true' : 'false';
process.env.ENABLE_VIDEOS = isFlagsOn ? 'true' : 'false';

// 3. Isolated Private Storage in OS Temp Directory
const tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shreemata-dev-storage-'));
process.env.READ_NOTES_STORAGE_DIR = tempStorageDir;

// 4. Set Safe Mock Environment Before Any Module Loads
process.env.PORT = '3100';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev_dummy_jwt_secret_four_sections_review_987654321';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_dev_key_123';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_dummy_dev_secret_456';

// Prevent dotenv from overriding our in-memory configuration
const dotenv = require('dotenv');
const origDotenvConfig = dotenv.config;
dotenv.config = function () { return { parsed: {} }; };

async function bootstrap() {
  console.log('\n================================================================');
  console.log('🚀 SHREE MATA — 4-SECTIONS LOCAL REVIEW ENVIRONMENT');
  console.log('================================================================');
  console.log(`[Config] Feature Flags Mode: ${isFlagsOn ? 'ON (Digital sections enabled)' : 'OFF (Post-deploy baseline simulation)'}`);
  console.log(`[Storage] Temporary Private Storage: ${tempStorageDir}`);

  // 5. Start In-Memory MongoDB
  console.log('[Mongo] Starting isolated in-memory MongoMemoryServer...');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create({
    instanceOpts: { launchTimeout: 60000 }
  });
  const mongoUri = mongod.getUri();
  process.env.MONGO_URI = mongoUri;
  process.env.MONGODB_URI = mongoUri;

  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri);

  // 6. Generate Real 3-Page PDFs with PDFKit
  console.log('[PDFKit] Generating real 3-page test PDFs with visible text...');
  const PDFDocument = require('pdfkit');

  function create3PageDoc(filename, title, subject, classLevel) {
    return new Promise((resolve, reject) => {
      const fullPath = path.join(tempStorageDir, filename);
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(fullPath);
      doc.pipe(stream);

      // Page 1
      doc.fontSize(22).fillColor('#101820').text(`PAGE 1 OF 3: ${title}`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#4A5568').text(`Subject: ${subject} | Level: ${classLevel}`);
      doc.moveDown(1.5);
      doc.fontSize(12).fillColor('#2B3642').text(
        'Welcome to Shree Mata Study Notes. This module covers essential theoretical definitions, fundamental laws, and conceptual blueprints designed for high-scoring board examination revision.\n\n' +
        'Core Principles:\n' +
        '• Systematic breakdown of syllabus units with marked importance weights.\n' +
        '• Direct cross-references to corresponding textbook chapters and question banks.\n' +
        '• Highlighting recurring examination questions over the past decade.\n\n' +
        'Notice: This document is watermarked and served directly through the secure PDF engine.'
      );

      // Page 2
      doc.addPage();
      doc.fontSize(22).fillColor('#101820').text(`PAGE 2 OF 3: Mathematical Derivations & Diagrams`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#4A5568').text('Step-by-Step Analytical Proofs and Diagram Sequences');
      doc.moveDown(1.5);
      doc.fontSize(12).fillColor('#2B3642').text(
        'Analytical Formula Matrix:\n\n' +
        '1. Primary Formulation:\n' +
        '   Integral and differential forms of governing laws applied to closed boundary conditions.\n\n' +
        '2. Variable Definitions & SI Units:\n' +
        '   All empirical constants specified with standard dimensional analysis notation.\n\n' +
        '3. Critical Exam Scoring Technique:\n' +
        '   Always begin derivations with an explicit definition of all terms to secure step-by-step marks.'
      );

      // Page 3
      doc.addPage();
      doc.fontSize(22).fillColor('#101820').text(`PAGE 3 OF 3: Solved Board Questions & Solutions`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#4A5568').text('5-Mark Long Answer Exemplars and Marking Keys');
      doc.moveDown(1.5);
      doc.fontSize(12).fillColor('#2B3642').text(
        'Question 1 (5 Marks Exemplar):\n' +
        'State the underlying theorem, deduce its general equation, and calculate value under given parameters.\n\n' +
        'Step-by-Step Scoring Solution:\n' +
        '[Step 1] Statement and notation definition (+1 Mark)\n' +
        '[Step 2] Intermediate algebraic manipulation (+2 Marks)\n' +
        '[Step 3] Numerical substitution and final value with unit (+2 Marks)\n\n' +
        'Checklist: Re-verify all calculation signs before submitting examination sheets.'
      );

      doc.end();
      stream.on('finish', () => resolve(fs.statSync(fullPath).size));
      stream.on('error', reject);
    });
  }

  const pdfFiles = [
    { file: 'notes_physics.pdf', title: 'Electromagnetism & Magnetic Effects of Current', subject: 'Physics', level: 'Class 10' },
    { file: 'notes_chemistry.pdf', title: 'Carbon Compounds & Functional Group Mastery', subject: 'Chemistry', level: 'Class 10' },
    { file: 'notes_maths.pdf', title: 'Quadratic Equations & Arithmetic Progressions', subject: 'Mathematics', level: 'Class 10' },
    { file: 'qp_physics_2025.pdf', title: 'SSLC 2025 Model Question Paper - Physics', subject: 'Physics', level: 'Class 10' },
    { file: 'qp_maths_2024.pdf', title: 'Karnataka State Board 2024 Solved Papers', subject: 'Mathematics', level: 'Class 10' },
    { file: 'qp_science_2024.pdf', title: 'Comprehensive Science Model Paper with Key', subject: 'Science', level: 'Class 10' }
  ];

  const pdfSizes = {};
  for (const item of pdfFiles) {
    pdfSizes[item.file] = await create3PageDoc(item.file, item.title, item.subject, item.level);
  }

  // 7. Seed Database Models
  console.log('[Seed] Seeding database models...');
  const bcrypt = require('bcryptjs');
  const User = require('../models/User');
  const Category = require('../models/Category');
  const Book = require('../models/Book');
  const Note = require('../models/Note');
  const NoteSubscription = require('../models/NoteSubscription');
  const AdminSettings = require('../models/AdminSettings');

  // A. AdminSettings with Active Section Plans
  await AdminSettings.deleteMany({});
  await AdminSettings.create({
    virtualTreeSettings: { enabled: true, pointsPerVirtualTree: 100, maxVirtualTreesPerUser: 10, autoCreateEnabled: true },
    cashConversionSettings: { enabled: true, pointsPerConversion: 10, cashPerConversion: 1 },
    pointsEarningSettings: { pointsPerRupeeSpent: 1, bonusPointsOnFirstPurchase: 50, bonusPointsOnReferral: 25 },
    sectionSubscriptionPlans: {
      notes: { name: 'Study Notes Pass', price: 99, durationDays: 30, active: true, description: 'Unlimited monthly access to all digital study notes' },
      question_papers: { name: 'Question Papers Pass', price: 99, durationDays: 30, active: true, description: 'Access to question papers and solved model papers' },
      videos: { name: 'Video Lectures Pass', price: 199, durationDays: 30, active: true, description: 'Unlimited streaming access to video lectures' }
    }
  });

  // B. Seed 3 Users
  const passwordHash = await bcrypt.hash('DemoPass123!', 10);

  const adminUser = await User.create({
    name: 'Shree Mata Admin',
    email: 'admin@shreemata.com',
    phone: '9886000001',
    password: passwordHash,
    role: 'admin'
  });

  const guestStudent = await User.create({
    name: 'Rohan Sharma (Unsubscribed)',
    email: 'student@shreemata.com',
    phone: '9886000002',
    password: passwordHash,
    role: 'customer'
  });

  const subscriberStudent = await User.create({
    name: 'Priya Patel (All-Access Pass)',
    email: 'subscriber@shreemata.com',
    phone: '9886000003',
    password: passwordHash,
    role: 'customer'
  });

  // C. Active Subscriptions for subscriberStudent across all 3 sections
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await NoteSubscription.create([
    {
      userId: subscriberStudent._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active',
      startDate: new Date(),
      expiresAt: expiryDate,
      razorpayOrderId: 'order_dev_notes_001',
      razorpayPaymentId: 'pay_dev_notes_001',
      razorpaySignature: 'sig_dev_notes_001'
    },
    {
      userId: subscriberStudent._id,
      section: 'question_papers',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      status: 'active',
      startDate: new Date(),
      expiresAt: expiryDate,
      razorpayOrderId: 'order_dev_qp_002',
      razorpayPaymentId: 'pay_dev_qp_002',
      razorpaySignature: 'sig_dev_qp_002'
    },
    {
      userId: subscriberStudent._id,
      section: 'videos',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 199,
      status: 'active',
      startDate: new Date(),
      expiresAt: expiryDate,
      razorpayOrderId: 'order_dev_vid_003',
      razorpayPaymentId: 'pay_dev_vid_003',
      razorpaySignature: 'sig_dev_vid_003'
    }
  ]);

  // D. Seed Categories & 6 Physical Books for Home Page Populating
  const catHighSchool = await Category.create({ name: 'High School', slug: 'high-school' });
  const catPrimary = await Category.create({ name: 'Primary Education', slug: 'primary-education' });
  const catCompetitive = await Category.create({ name: 'Competitive Exams', slug: 'competitive-exams' });

  await Book.create([
    {
      title: 'Class 10 Mathematics Complete Guide',
      author: 'Dr. S. K. Narayan',
      price: 340,
      physicalPrice: 400,
      sellingPrice: 340,
      category: 'high-school',
      class: '10',
      subject: 'Mathematics',
      description: 'Comprehensive curriculum coverage with step-by-step solved examples and model papers.',
      stockQuantity: 45,
      stockStatus: 'in_stock'
    },
    {
      title: 'Class 10 Science Master Practice Book',
      author: 'Prof. Anitha Rao',
      price: 295,
      physicalPrice: 350,
      sellingPrice: 295,
      category: 'high-school',
      class: '10',
      subject: 'Science',
      description: 'Theory revision, practical lab questions, and high-yield physics and chemistry diagrams.',
      stockQuantity: 30,
      stockStatus: 'in_stock'
    },
    {
      title: 'Social Science Board Success Series',
      author: 'K. R. Hiremath',
      price: 260,
      physicalPrice: 300,
      sellingPrice: 260,
      category: 'high-school',
      class: '10',
      subject: 'Social Science',
      description: 'History timelines, political science essays, geography maps, and economics summaries.',
      stockQuantity: 50,
      stockStatus: 'in_stock'
    },
    {
      title: 'Primary English Grammar & Composition',
      author: 'E. M. Vasudev',
      price: 180,
      physicalPrice: 210,
      sellingPrice: 180,
      category: 'primary-education',
      class: '5',
      subject: 'English',
      description: 'Interactive workbook for primary grammar foundations, vocabulary, and sentence construction.',
      stockQuantity: 60,
      stockStatus: 'in_stock'
    },
    {
      title: 'Foundations of Arithmetic & Geometry',
      author: 'M. G. Kulkarni',
      price: 195,
      physicalPrice: 230,
      sellingPrice: 195,
      category: 'primary-education',
      class: '5',
      subject: 'Mathematics',
      description: 'Illustrated numeracy exercises and mental math activities for elementary students.',
      stockQuantity: 40,
      stockStatus: 'in_stock'
    },
    {
      title: 'National Talent Search Exam (NTSE) Explorer',
      author: 'Expert Academic Panel',
      price: 450,
      physicalPrice: 550,
      sellingPrice: 450,
      category: 'competitive-exams',
      class: '10',
      subject: 'Aptitude',
      description: 'Mental ability test (MAT) and scholastic aptitude test (SAT) solved papers.',
      stockQuantity: 25,
      stockStatus: 'in_stock'
    }
  ]);

  // E. Seed Digital Items in Each of the 3 Digital Sections
  // Notes & Question Papers have previewPages (2 pages preview, with one 0-page locked item)
  // Video lectures have 3 free and 3 paid
  const digitalNotes = [
    // --- SECTION: NOTES (Preview / Paid) ---
    {
      title: 'Physics Chapter 1: Electromagnetism & Induction',
      section: 'notes',
      subject: 'Physics',
      classLevel: 'Class 10',
      category: 'Theory Summary',
      description: 'Clear concise notes on magnetic fields, Flemings left-hand rule, and electromagnetic induction with 3-page revision sheet.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:notes_physics.pdf',
      fileSize: pdfSizes['notes_physics.pdf'],
      isPublished: true,
      order: 1
    },
    {
      title: 'Chemistry Chapter 4: Carbon Compounds & Hydrocarbons',
      section: 'notes',
      subject: 'Chemistry',
      classLevel: 'Class 10',
      category: 'Complete Notes',
      description: 'Structural isomerism, nomenclature of functional groups, and chemical reactions of ethanol and ethanoic acid.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:notes_chemistry.pdf',
      fileSize: pdfSizes['notes_chemistry.pdf'],
      isPublished: true,
      order: 2
    },
    {
      title: 'Mathematics Chapter 5: Arithmetic Progressions Quick Sheet',
      section: 'notes',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Formula Sheet',
      description: 'Formulas for nth term, sum of first n terms, and practical word problem techniques.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:notes_maths.pdf',
      fileSize: pdfSizes['notes_maths.pdf'],
      isPublished: true,
      order: 3
    },
    {
      title: 'Class 10 Science Master Notes: All-Chapter Revision Pack',
      section: 'notes',
      subject: 'Science',
      classLevel: 'Class 10',
      category: 'Master Notes',
      description: 'Comprehensive high-yield notes covering Physics, Chemistry, and Biology modules.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:notes_physics.pdf',
      fileSize: pdfSizes['notes_physics.pdf'],
      isPublished: true,
      order: 4
    },
    {
      title: 'Class 10 Mathematics Complete Solved Theorems & Proofs',
      section: 'notes',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Theorems & Proofs',
      description: 'Step-by-step proofs for Thales Theorem, Areas of Similar Triangles, and Tangents to Circles.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:notes_maths.pdf',
      fileSize: pdfSizes['notes_maths.pdf'],
      isPublished: true,
      order: 5
    },
    {
      title: 'Biology Chapter 6: Life Processes Deep Dive Notes',
      section: 'notes',
      subject: 'Biology',
      classLevel: 'Class 10',
      category: 'Comprehensive Notes',
      description: 'Nutrition, respiration, transportation, and excretion with annotated diagrams.',
      isFree: false,
      previewPages: 0, // Locked item: no preview
      totalPages: 3,
      pdfUrl: 'private:notes_chemistry.pdf',
      fileSize: pdfSizes['notes_chemistry.pdf'],
      isPublished: true,
      order: 6
    },

    // --- SECTION: QUESTION PAPERS (Preview / Paid) ---
    {
      title: '2025 State Board Physics Model Question Paper',
      section: 'question_papers',
      subject: 'Physics',
      classLevel: 'Class 10',
      category: 'Model Papers',
      description: 'Latest pattern board model examination question paper with solution keys and blueprint.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:qp_physics_2025.pdf',
      fileSize: pdfSizes['qp_physics_2025.pdf'],
      isPublished: true,
      order: 1
    },
    {
      title: '2024 Solved Board Examination Paper - Mathematics',
      section: 'question_papers',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Solved Papers',
      description: 'Official board paper with step-by-step solutions for 1-mark, 2-mark, and 4-mark questions.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:qp_maths_2024.pdf',
      fileSize: pdfSizes['qp_maths_2024.pdf'],
      isPublished: true,
      order: 2
    },
    {
      title: 'Science High-Yield 3-Mark Question Bank with Answers',
      section: 'question_papers',
      subject: 'Science',
      classLevel: 'Class 10',
      category: 'Question Bank',
      description: 'Top 50 high-probability questions frequently asked in state board examinations.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:qp_science_2024.pdf',
      fileSize: pdfSizes['qp_science_2024.pdf'],
      isPublished: true,
      order: 3
    },
    {
      title: '5-Year Solved Question Paper Compilation (2020-2024)',
      section: 'question_papers',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Previous Years Solved',
      description: 'Previous 5 years of board papers fully solved with marking distribution hints.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:qp_maths_2024.pdf',
      fileSize: pdfSizes['qp_maths_2024.pdf'],
      isPublished: true,
      order: 4
    },
    {
      title: 'Top Scorers Practice Mock Test Series - Physics & Chemistry',
      section: 'question_papers',
      subject: 'Science',
      classLevel: 'Class 10',
      category: 'Mock Exam Series',
      description: '3 full-length timed mock tests with detailed scoring rubrics and answers.',
      isFree: false,
      previewPages: 2,
      totalPages: 3,
      pdfUrl: 'private:qp_physics_2025.pdf',
      fileSize: pdfSizes['qp_physics_2025.pdf'],
      isPublished: true,
      order: 5
    },
    {
      title: 'State Level Preparatory Examination 2025 (All Subjects)',
      section: 'question_papers',
      subject: 'General',
      classLevel: 'Class 10',
      category: 'Preparatory Papers',
      description: 'Official district-level preparatory exam papers with verified marking schemes.',
      isFree: false,
      previewPages: 0, // Locked item: no preview
      totalPages: 3,
      pdfUrl: 'private:qp_science_2024.pdf',
      fileSize: pdfSizes['qp_science_2024.pdf'],
      isPublished: true,
      order: 6
    },

    // --- SECTION: VIDEO LECTURES (3 Free, 3 Paid) ---
    // Note: Video URLs use approved Vimeo/Bunny hosts from the server allowlist.
    // They will open in secure sandboxed iframes. Offline network playback depends on provider connectivity.
    {
      title: 'Introduction to Electromagnetic Induction & Faraday Laws',
      section: 'videos',
      subject: 'Physics',
      classLevel: 'Class 10',
      category: 'Concept Video',
      description: 'Visual demonstration of magnetic flux change and Fleming right-hand rule applications.',
      isFree: true,
      videoUrl: 'https://iframe.mediadelivery.net/embed/12345/demo-induction-lecture',
      isPublished: true,
      order: 1
    },
    {
      title: 'Quadratic Equations: Derivation of the Quadratic Formula',
      section: 'videos',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Lecture Series',
      description: 'Graphical explanation of completing the square and the discriminant condition.',
      isFree: true,
      videoUrl: 'https://player.vimeo.com/video/76979871',
      isPublished: true,
      order: 2
    },
    {
      title: 'Carbon Chains, Rings & Functional Groups Walkthrough',
      section: 'videos',
      subject: 'Chemistry',
      classLevel: 'Class 10',
      category: 'Concept Video',
      description: '3D molecular modeling of alkanes, alkenes, alkynes, and functional group isomers.',
      isFree: true,
      videoUrl: 'https://iframe.mediadelivery.net/embed/12345/demo-carbon-lecture',
      isPublished: true,
      order: 3
    },
    {
      title: 'Physics Board Masterclass: 3-Hour Problem-Solving Marathon',
      section: 'videos',
      subject: 'Physics',
      classLevel: 'Class 10',
      category: 'Masterclass',
      description: 'Solving numerical problems from electricity, magnetism, and ray optics.',
      isFree: false,
      videoUrl: 'https://player.vimeo.com/video/76979871',
      isPublished: true,
      order: 4
    },
    {
      title: 'Trigonometry & Heights and Distances Complete Video Course',
      section: 'videos',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Full Course',
      description: 'Visual real-world problem breakdowns of angle of elevation and depression.',
      isFree: false,
      videoUrl: 'https://iframe.mediadelivery.net/embed/12345/demo-trig-mastery',
      isPublished: true,
      order: 5
    },
    {
      title: 'Biology Board Exam Preparation: All Diagrams & Processes',
      section: 'videos',
      subject: 'Biology',
      classLevel: 'Class 10',
      category: 'Masterclass',
      description: 'Step-by-step guided sketching of heart, nephron, brain, and reflex arc for exams.',
      isFree: false,
      videoUrl: 'https://iframe.mediadelivery.net/embed/12345/demo-biology-diagrams',
      isPublished: true,
      order: 6
    }
  ];

  await Note.create(digitalNotes);
  console.log(`[Seed] Seeded ${digitalNotes.length} digital study materials (Notes, QPs, Videos).`);

  // 8. Start Real Express App from server.js
  console.log('[Server] Launching Express application on port 3100...');
  require('../server.js');

  // 9. Print Guidance Banner
  setTimeout(() => {
    console.log('\n================================================================');
    console.log('✅ SHREE MATA DEV SERVER IS RUNNING');
    console.log('================================================================');
    console.log('🌐 Web URL: http://127.0.0.1:3100');
    console.log('   (IMPORTANT: Open http://127.0.0.1:3100 — not localhost — so config.js');
    console.log('   resolves API_URL to http://127.0.0.1:3100/api dynamically.)\n');
    console.log(`🚩 Mode: FLAGS=${isFlagsOn ? 'on (Digital sections active)' : 'off (Baseline physical-only site)'}\n`);

    console.log('🔑 DEMO LOGIN CREDENTIALS (Email & Password):');
    console.log('   1. Administrator:');
    console.log('      Email:    admin@shreemata.com');
    console.log('      Password: DemoPass123!');
    console.log('      Use for:  Managing study materials at /admin-notes.html and pricing at /admin-settings.html\n');

    console.log('   2. Unsubscribed Student (Guest/Regular):');
    console.log('      Email:    student@shreemata.com');
    console.log('      Password: DemoPass123!');
    console.log('      Use for:  Verifying free notes open, while paid notes trigger subscription prompt\n');

    console.log('   3. Subscribed Student (All-Access Pass):');
    console.log('      Email:    subscriber@shreemata.com');
    console.log('      Password: DemoPass123!');
    console.log('      Use for:  Verifying paid notes, question papers, and video lectures unlock\n');

    console.log('📌 NOTE ON PAYMENTS & VIDEOS:');
    console.log('   • Razorpay: In-browser checkout requires live Razorpay keys and will not complete locally.');
    console.log('   • Videos: Embed URLs use Vimeo/Bunny providers from server allowlist; playback requires external network.');
    console.log('\n🛑 Press Ctrl+C in this terminal to stop the server and clean up temporary storage.');
    console.log('================================================================\n');
  }, 1200);

  // 10. Clean Shutdown Handler
  async function cleanupAndExit() {
    console.log('\n[Shutdown] Stopping server and cleaning up...');
    try {
      if (fs.existsSync(tempStorageDir)) {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
        console.log(`[Storage] Deleted temporary storage directory: ${tempStorageDir}`);
      }
      await mongoose.disconnect();
      await mongod.stop();
      console.log('[Mongo] In-memory MongoDB stopped cleanly.');
    } catch (err) {
      console.error('[Shutdown Error]', err.message);
    }
    process.exit(0);
  }

  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);
}

bootstrap().catch(err => {
  console.error('\n❌ Fatal Error starting dev environment:', err);
  process.exit(1);
});
