/**
 * tests/devServerRunner.js
 * Dev server dedicated for homePageFixesBrowser tests:
 * - In-memory MongoDB (MongoMemoryServer on 127.0.0.1)
 * - Seeds 36 books across 2 classes (10 and 5) and 2 subjects (Mathematics and Science):
 *     - Class 10 Mathematics: 12 books
 *     - Class 10 Science: 12 books
 *     - Class 5 Mathematics: 12 books
 * - Seeds 1 active bundle referencing books
 * - Seeds demo admin & student users
 * - Runs Express server on port 3100
 */

process.env.MONGOMS_STARTUP_TIMEOUT = '60000';

const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.ENABLE_TEXT_BOOK = 'true';
process.env.ENABLE_READ_NOTES = 'true';
process.env.ENABLE_QUESTION_PAPERS = 'true';
process.env.ENABLE_VIDEOS = 'true';
process.env.ENABLE_OTHERS = 'true';

const tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shreemata-test-storage-'));
process.env.READ_NOTES_STORAGE_DIR = tempStorageDir;
process.env.PORT = '3100';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test_dev_jwt_secret_four_sections_987654321';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_dev_key_123';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_dummy_dev_secret_456';

const dotenv = require('dotenv');
dotenv.config = function () { return { parsed: {} }; };

async function bootstrap() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create({
    instanceOpts: { launchTimeout: 60000 }
  });
  const mongoUri = mongod.getUri();
  process.env.MONGO_URI = mongoUri;
  process.env.MONGODB_URI = mongoUri;

  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri);

  const bcrypt = require('bcryptjs');
  const User = require('../models/User');
  const Book = require('../models/Book');
  const Bundle = require('../models/Bundle');
  const Category = require('../models/Category');
  const AdminSettings = require('../models/AdminSettings');

  await AdminSettings.deleteMany({});
  await AdminSettings.create({
    virtualTreeSettings: { enabled: true, pointsPerVirtualTree: 100, maxVirtualTreesPerUser: 10, autoCreateEnabled: true },
    cashConversionSettings: { enabled: true, pointsPerConversion: 10, cashPerConversion: 1 },
    pointsEarningSettings: { pointsPerRupeeSpent: 1, bonusPointsOnFirstPurchase: 50, bonusPointsOnReferral: 25 },
    sectionSubscriptionPlans: {
      notes: { name: 'Study Notes Pass', price: 99, durationDays: 30, active: true },
      question_papers: { name: 'Question Papers Pass', price: 99, durationDays: 30, active: true },
      videos: { name: 'Video Lectures Pass', price: 199, durationDays: 30, active: true }
    }
  });

  const passwordHash = await bcrypt.hash('DemoPass123!', 10);
  const adminUser = await User.create({
    name: 'Shree Mata Admin',
    email: 'admin@shreemata.com',
    phone: '9886000001',
    password: passwordHash,
    role: 'admin'
  });

  const studentUser = await User.create({
    name: 'Rohan Sharma',
    email: 'student@shreemata.com',
    phone: '9886000002',
    password: passwordHash,
    role: 'customer'
  });

  await Category.create([
    { name: 'High School', slug: 'high-school' },
    { name: 'Primary Education', slug: 'primary-education' }
  ]);

  // Seed 36 books across 2 classes (10 and 5) and 2 subjects (Mathematics and Science)
  // All have deterministic createdAt base
  const baseTime = new Date('2026-06-01T10:00:00Z').getTime();
  const seededBooks = [];

  // Group 1: 12 books - Class 10, Mathematics
  for (let i = 1; i <= 12; i++) {
    seededBooks.push({
      title: `Class 10 Mathematics Vol ${String(i).padStart(2, '0')}`,
      author: 'Dr. S. K. Narayan',
      price: 300 + i * 5,
      physicalPrice: 350 + i * 5,
      sellingPrice: 300 + i * 5,
      category: 'high-school',
      class: '10',
      subject: 'Mathematics',
      description: `Comprehensive textbook for Class 10 Mathematics module ${i}.`,
      stockQuantity: 50,
      stockStatus: 'in_stock',
      createdAt: new Date(baseTime + (i * 1000)),
      updatedAt: new Date(baseTime + (i * 1000))
    });
  }

  // Group 2: 12 books - Class 10, Science
  for (let i = 1; i <= 12; i++) {
    seededBooks.push({
      title: `Class 10 Science Master Vol ${String(i).padStart(2, '0')}`,
      author: 'Prof. Anitha Rao',
      price: 280 + i * 5,
      physicalPrice: 320 + i * 5,
      sellingPrice: 280 + i * 5,
      category: 'high-school',
      class: '10',
      subject: 'Science',
      description: `Complete practical theory guide for Class 10 Science module ${i}.`,
      stockQuantity: 50,
      stockStatus: 'in_stock',
      createdAt: new Date(baseTime + 100000 + (i * 1000)),
      updatedAt: new Date(baseTime + 100000 + (i * 1000))
    });
  }

  // Group 3: 12 books - Class 5, Mathematics
  for (let i = 1; i <= 12; i++) {
    seededBooks.push({
      title: `Class 5 Elementary Maths Vol ${String(i).padStart(2, '0')}`,
      author: 'M. G. Kulkarni',
      price: 190 + i * 5,
      physicalPrice: 220 + i * 5,
      sellingPrice: 190 + i * 5,
      category: 'primary-education',
      class: '5',
      subject: 'Mathematics',
      description: `Primary foundations and mental math exercises for Class 5 module ${i}.`,
      stockQuantity: 50,
      stockStatus: 'in_stock',
      createdAt: new Date(baseTime + 200000 + (i * 1000)),
      updatedAt: new Date(baseTime + 200000 + (i * 1000))
    });
  }

  const createdBooks = await Book.insertMany(seededBooks);
  console.log(`[Seed] Successfully seeded ${createdBooks.length} books across Class 10 & 5, Math & Science.`);

  // Seed 1 active bundle referencing books
  const bundle = await Bundle.create({
    name: 'Class 10 Board Master Combo',
    description: 'Special combo pack containing Class 10 Mathematics and Science textbooks.',
    books: [createdBooks[0]._id, createdBooks[12]._id],
    originalPrice: 600,
    bundlePrice: 499,
    discount: 17,
    isActive: true,
    isDigital: false,
    weight: 1.2,
    courierCharge: 40,
    rewardPoints: 20
  });
  console.log(`[Seed] Seeded active bundle: ${bundle.name} (${bundle._id})`);

  // Start Express server
  require('../server.js');
  console.log('[Server] Started Express on port 3100');

  async function cleanup() {
    try {
      if (fs.existsSync(tempStorageDir)) {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      }
      await mongoose.disconnect();
      await mongod.stop();
    } catch (_) {}
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

bootstrap().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
