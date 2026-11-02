// scripts/seed-four-sections-dev.js
// Local development database seeder for Four-Section platform
// STRICT SAFETY GATE: Refuses to run on any host other than 127.0.0.1 / localhost

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shreemata_dev';

function assertLocalhost(uri) {
  try {
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    const host = parsed.hostname || '';
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      console.error(`\n❌ [SAFETY GATE REFUSAL] Target host "${host}" is forbidden.`);
      console.error(`   The seeder is STRICTLY restricted to local databases (127.0.0.1 / localhost).\n`);
      process.exit(1);
    }
  } catch (e) {
    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
      console.error(`\n❌ [SAFETY GATE REFUSAL] Invalid or non-local URI: "${uri}".\n`);
      process.exit(1);
    }
  }
}

assertLocalhost(mongoUri);

// Create safe sample PDF fixture in storage for local dev testing
function ensureSamplePdfFixture() {
  const storageDir = path.resolve(__dirname, '../storage/notes/private');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  const samplePdfPath = path.resolve(storageDir, 'sample_dev_fixture.pdf');
  if (!fs.existsSync(samplePdfPath)) {
    const sampleContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF');
    fs.writeFileSync(samplePdfPath, sampleContent);
  }
  return 'sample_dev_fixture.pdf';
}

async function seed() {
  console.log(`\n======================================================`);
  console.log(`  SHREE MATA FOUR-SECTIONS LOCAL DEV SEEDER`);
  console.log(`  Target URI: 127.0.0.1 / localhost only`);
  console.log(`======================================================\n`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const host = mongoose.connection.host || '';
  const name = mongoose.connection.name || '';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`[SAFETY GATE] Connected host "${host}" is not local. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (/prod|production/i.test(name)) {
    console.error(`[SAFETY GATE] Connected DB name "${name}" resembles production. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const sampleKey = ensureSamplePdfFixture();

  const User = require('../models/User');
  const Book = require('../models/Book');
  const Note = require('../models/Note');
  const NoteSubscription = require('../models/NoteSubscription');
  const AdminSettings = require('../models/AdminSettings');

  console.log(`Cleaning existing dev seed data...`);
  await Promise.all([
    User.deleteMany({ email: /@shreemata\.local$/ }),
    Book.deleteMany({ author: 'Shree Mata Publications' }),
    Note.deleteMany({}),
    NoteSubscription.deleteMany({}),
    AdminSettings.deleteMany({})
  ]);

  const passwordHash = await bcrypt.hash('DevPass123!', 10);

  // 1. Users: 1 admin user, 3 normal users (guest/no sub, notes-only subscriber, all-sections subscriber)
  console.log(`Seeding users (1 admin + 3 normal users)...`);
  const adminUser = await User.create({
    name: 'Dev Admin',
    email: 'admin@shreemata.local',
    phone: '9888800001',
    password: passwordHash,
    role: 'admin'
  });

  const guestUser = await User.create({
    name: 'Dev Guest User',
    email: 'guest@shreemata.local',
    phone: '9888800002',
    password: passwordHash,
    role: 'user'
  });

  const notesOnlyUser = await User.create({
    name: 'Dev Notes Only Subscriber',
    email: 'notes_user@shreemata.local',
    phone: '9888800003',
    password: passwordHash,
    role: 'user'
  });

  const allSectionsUser = await User.create({
    name: 'Dev All Sections Subscriber',
    email: 'all_sections_user@shreemata.local',
    phone: '9888800004',
    password: passwordHash,
    role: 'user'
  });

  // 2. Admin Settings with plans configured (and question_papers/videos active)
  console.log(`Seeding AdminSettings with 4-section plans...`);
  await AdminSettings.create({
    readNotesSubscriptionSettings: {
      monthlyPrice: 99,
      enabled: true,
      description: 'Monthly unlimited access to all digital study notes'
    },
    sectionSubscriptionPlans: {
      notes: {
        name: 'Study Notes Pass',
        price: 99,
        durationDays: 30,
        active: true,
        description: 'Monthly unlimited access to all digital study notes'
      },
      question_papers: {
        name: 'Question Papers Pass',
        price: 99,
        durationDays: 30,
        active: true,
        description: 'Unlimited access to solved question papers and model answers'
      },
      videos: {
        name: 'Video Lectures Pass',
        price: 199,
        durationDays: 30,
        active: true,
        description: 'Unlimited streaming access to video lectures'
      }
    }
  });

  // 3. Section 1: 2 Physical Textbooks (models/Book.js)
  console.log(`Seeding Section 1: 2 Physical Textbooks...`);
  await Book.create([
    {
      title: 'Class 10 Mathematics Textbook',
      author: 'Shree Mata Publications',
      price: 250,
      sellingPrice: 220,
      class: 'Class 10',
      subject: 'Mathematics',
      stockQuantity: 100,
      description: 'Official printed state syllabus textbook with courier delivery.'
    },
    {
      title: 'Class 10 Science Textbook',
      author: 'Shree Mata Publications',
      price: 280,
      sellingPrice: 250,
      class: 'Class 10',
      subject: 'Science',
      stockQuantity: 80,
      description: 'Comprehensive physics, chemistry, and biology textbook.'
    }
  ]);

  // 4. Section 2: 2 Study Notes (1 free, 1 paid)
  console.log(`Seeding Section 2: 2 Study Notes (1 free, 1 paid)...`);
  await Note.create([
    {
      section: 'notes',
      title: 'Class 10 Trigonometry Formula Sheet (Free Preview)',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Formula Sheet',
      description: 'Quick reference formula sheet for board exam preparation.',
      pdfUrl: sampleKey,
      fileSize: 1024,
      totalPages: 4,
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    },
    {
      section: 'notes',
      title: 'Class 10 Quadratic Equations Detailed Notes',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Study Notes',
      description: 'Comprehensive step-by-step notes and worked examples.',
      pdfUrl: sampleKey,
      fileSize: 2048,
      totalPages: 18,
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    }
  ]);

  // 5. Section 3: 2 Question Papers (1 free, 1 paid)
  console.log(`Seeding Section 3: 2 Question Papers (1 free, 1 paid)...`);
  await Note.create([
    {
      section: 'question_papers',
      title: 'Class 10 Mathematics 2025 Model Paper (Free Sample)',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Model Papers',
      description: 'Official model question paper with blueprint and marks distribution.',
      pdfUrl: sampleKey,
      fileSize: 1024,
      totalPages: 8,
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    },
    {
      section: 'question_papers',
      title: 'Class 10 Mathematics 5-Year Solved Question Papers',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Solved Papers',
      description: 'Board exam papers from 2020 to 2024 with complete solutions.',
      pdfUrl: sampleKey,
      fileSize: 8192,
      totalPages: 60,
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    }
  ]);

  // 6. Section 4: 2 Videos (1 free with Bunny, 1 paid with Bunny)
  console.log(`Seeding Section 4: 2 Videos (1 free with Bunny, 1 paid with Bunny)...`);
  await Note.create([
    {
      section: 'videos',
      title: 'Introduction to Trigonometry: Concept Overview (Free Trial)',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Concept Video',
      description: 'Introductory video lecture introducing trigonometric ratios.',
      videoUrl: 'https://iframe.mediadelivery.net/play/12345/intro-free-preview',
      videoProvider: 'bunny',
      durationMinutes: 25,
      pdfUrl: '',
      isFree: true,
      order: 1,
      isPublished: true,
      uploadedBy: adminUser._id
    },
    {
      section: 'videos',
      title: 'Trigonometric Identities Mastery (Full Masterclass)',
      subject: 'Mathematics',
      classLevel: 'Class 10',
      category: 'Masterclass',
      description: 'Deep-dive walkthrough of all NCERT identity proofs and problem tricks.',
      videoUrl: 'https://iframe.mediadelivery.net/play/12345/identities-paid-masterclass',
      videoProvider: 'bunny',
      durationMinutes: 65,
      pdfUrl: '',
      isFree: false,
      order: 2,
      isPublished: true,
      uploadedBy: adminUser._id
    }
  ]);

  // 7. Subscriptions for seed users
  console.log(`Seeding user subscriptions...`);
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 86400000);

  // notesOnlyUser: Notes subscription only
  await NoteSubscription.create({
    userId: notesOnlyUser._id,
    section: 'notes',
    planType: 'standard',
    durationDays: 30,
    amountPaid: 99,
    currency: 'INR',
    status: 'active',
    startDate: now,
    expiresAt: nextMonth,
    razorpayOrderId: 'order_seed_notes_only',
    razorpayPaymentId: 'pay_seed_notes_only',
    razorpaySignature: 'dev_sig_notes_only',
    subscriptionIndex: 1
  });

  // allSectionsUser: Notes + Question Papers + Videos subscriptions
  await NoteSubscription.create([
    {
      userId: allSectionsUser._id,
      section: 'notes',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      currency: 'INR',
      status: 'active',
      startDate: now,
      expiresAt: nextMonth,
      razorpayOrderId: 'order_seed_all_notes',
      razorpayPaymentId: 'pay_seed_all_notes',
      razorpaySignature: 'dev_sig_all_notes',
      subscriptionIndex: 1
    },
    {
      userId: allSectionsUser._id,
      section: 'question_papers',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 99,
      currency: 'INR',
      status: 'active',
      startDate: now,
      expiresAt: nextMonth,
      razorpayOrderId: 'order_seed_all_qp',
      razorpayPaymentId: 'pay_seed_all_qp',
      razorpaySignature: 'dev_sig_all_qp',
      subscriptionIndex: 1
    },
    {
      userId: allSectionsUser._id,
      section: 'videos',
      planType: 'standard',
      durationDays: 30,
      amountPaid: 199,
      currency: 'INR',
      status: 'active',
      startDate: now,
      expiresAt: nextMonth,
      razorpayOrderId: 'order_seed_all_videos',
      razorpayPaymentId: 'pay_seed_all_videos',
      razorpaySignature: 'dev_sig_all_videos',
      subscriptionIndex: 1
    }
  ]);

  console.log(`\n======================================================`);
  console.log(`  DEV SEED COMPLETED SUCCESSFULLY!`);
  console.log(`  Target Database: 127.0.0.1 (${mongoose.connection.name})`);
  console.log(`  Test Accounts (Password: DevPass123!):`);
  console.log(`  1. Admin:               admin@shreemata.local`);
  console.log(`  2. Guest (No Sub):      guest@shreemata.local`);
  console.log(`  3. Notes Subscriber:    notes_user@shreemata.local (Notes Active)`);
  console.log(`  4. All-Sections Sub:    all_sections_user@shreemata.local (Notes + QP + Videos Active)`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
