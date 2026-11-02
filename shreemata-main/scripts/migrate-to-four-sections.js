// scripts/migrate-to-four-sections.js
// Idempotent migration script for 4-Section architecture
// DRY-RUN by default. Pass --apply --confirm-backup to execute mutations.

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shreemata_dev';

function verifyLocalhost(uri) {
  try {
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    const host = parsed.hostname || '';
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      console.error(`[SAFETY GATE REFUSAL] Target host "${host}" is forbidden. Only 127.0.0.1 / localhost is permitted.`);
      process.exit(1);
    }
  } catch (e) {
    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
      console.error(`[SAFETY GATE REFUSAL] Invalid or non-local URI: "${uri}". Only 127.0.0.1 / localhost is permitted.`);
      process.exit(1);
    }
  }
}

verifyLocalhost(mongoUri);

const isApply = process.argv.includes('--apply');
const hasConfirmBackup = process.argv.includes('--confirm-backup');

if (isApply && !hasConfirmBackup) {
  console.error('\n❌ ERROR: Applying changes requires explicit confirmation.\nUsage: node scripts/migrate-to-four-sections.js --apply --confirm-backup\n');
  process.exit(1);
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`  SHREE MATA FOUR-SECTIONS MIGRATION SCRIPT`);
  console.log(`  Mode: ${isApply ? '🚀 APPLY (MUTATING)' : '🔍 DRY-RUN (READ-ONLY)'}`);
  console.log(`======================================================\n`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const host = mongoose.connection.host || '';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`[SAFETY GATE] Connected host "${host}" is not 127.0.0.1/localhost. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const db = mongoose.connection.db;

  try {
    // ----------------------------------------------------
    // Step 1: Notes collection audit and migration
    // ----------------------------------------------------
    const notesColl = db.collection('notes');
    const notesWithoutSectionCount = await notesColl.countDocuments({ section: { $exists: false } });
    console.log(`[Step 1 - Notes] Documents missing 'section': ${notesWithoutSectionCount}`);

    if (isApply && notesWithoutSectionCount > 0) {
      const noteUpdateRes = await notesColl.updateMany(
        { section: { $exists: false } },
        {
          $set: {
            section: 'notes',
            isFree: false,
            order: 0
          }
        }
      );
      console.log(`  -> Applied update to ${noteUpdateRes.modifiedCount} notes.`);
    }

    // ----------------------------------------------------
    // Step 2: NoteSubscriptions collection audit and migration
    // ----------------------------------------------------
    const subsColl = db.collection('notesubscriptions');
    const subsWithoutSectionCount = await subsColl.countDocuments({ section: { $exists: false } });
    console.log(`[Step 2 - Subscriptions] Documents missing 'section': ${subsWithoutSectionCount}`);

    if (isApply && subsWithoutSectionCount > 0) {
      const subsUpdateRes = await subsColl.updateMany(
        { section: { $exists: false } },
        {
          $set: {
            section: 'notes',
            durationDays: 30
          }
        }
      );
      console.log(`  -> Applied update to ${subsUpdateRes.modifiedCount} subscriptions.`);
    }

    // ----------------------------------------------------
    // Step 3: SubscriptionOrders collection audit and migration
    // ----------------------------------------------------
    const ordersColl = db.collection('subscriptionorders');
    const ordersWithoutSectionCount = await ordersColl.countDocuments({ section: { $exists: false } });
    console.log(`[Step 3 - Orders] Documents missing 'section': ${ordersWithoutSectionCount}`);

    if (isApply && ordersWithoutSectionCount > 0) {
      const ordersUpdateRes = await ordersColl.updateMany(
        { section: { $exists: false } },
        {
          $set: {
            section: 'notes',
            durationDays: 30
          }
        }
      );
      console.log(`  -> Applied update to ${ordersUpdateRes.modifiedCount} subscription orders.`);
    }

    // ----------------------------------------------------
    // Step 4: AdminSettings sectionSubscriptionPlans sync
    // ----------------------------------------------------
    const settingsColl = db.collection('adminsettings');
    const settings = await settingsColl.findOne();
    console.log(`[Step 4 - AdminSettings] Found settings document: ${Boolean(settings)}`);

    if (settings) {
      const hasSectionPlans = Boolean(settings.sectionSubscriptionPlans && settings.sectionSubscriptionPlans.notes);
      console.log(`  -> Has sectionSubscriptionPlans.notes: ${hasSectionPlans}`);

      if (isApply && !hasSectionPlans) {
        const legacy = settings.readNotesSubscriptionSettings || {};
        const price = (typeof legacy.monthlyPrice === 'number' && legacy.monthlyPrice >= 1) ? legacy.monthlyPrice : 99;
        const active = (typeof legacy.enabled === 'boolean') ? legacy.enabled : true;
        const desc = (typeof legacy.description === 'string' && legacy.description.trim()) ? legacy.description : 'Monthly unlimited access to all digital study notes';

        await settingsColl.updateOne(
          { _id: settings._id },
          {
            $set: {
              'sectionSubscriptionPlans.notes': {
                name: 'Study Notes Pass',
                price,
                durationDays: 30,
                active,
                description: desc
              },
              'sectionSubscriptionPlans.question_papers': {
                name: 'Question Papers Pass',
                price: 99,
                durationDays: 30,
                active: false,
                description: 'Access to question papers and solved model papers'
              },
              'sectionSubscriptionPlans.videos': {
                name: 'Video Lectures Pass',
                price: 199,
                durationDays: 30,
                active: false,
                description: 'Unlimited streaming access to video lectures'
              }
            }
          }
        );
        console.log(`  -> Populated sectionSubscriptionPlans with legacy defaults.`);
      }
    }

    // ----------------------------------------------------
    // Step 5: Index audit and migration
    // ----------------------------------------------------
    console.log(`\n[Step 5 - Index Audit on notesubscriptions]`);
    const existingSubsIndexes = await subsColl.listIndexes().toArray();
    console.log(`  Existing indexes on notesubscriptions:`);
    for (const idx of existingSubsIndexes) {
      console.log(`    - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${Boolean(idx.unique)})`);
    }

    // Identify old key patterns
    const oldExpiryIdx = existingSubsIndexes.find(idx => idx.key.userId === 1 && idx.key.expiresAt === 1 && !idx.key.section);
    const oldSeqIdx = existingSubsIndexes.find(idx => idx.key.userId === 1 && idx.key.subscriptionIndex === 1 && !idx.key.section);

    if (oldExpiryIdx) {
      console.log(`  ⚠️ Found legacy index to replace: "${oldExpiryIdx.name}"`);
    }
    if (oldSeqIdx) {
      console.log(`  ⚠️ Found legacy index to replace: "${oldSeqIdx.name}"`);
    }

    if (isApply) {
      if (oldExpiryIdx) {
        console.log(`  -> Dropping legacy index: "${oldExpiryIdx.name}"`);
        await subsColl.dropIndex(oldExpiryIdx.name);
      }
      if (oldSeqIdx) {
        console.log(`  -> Dropping legacy index: "${oldSeqIdx.name}"`);
        await subsColl.dropIndex(oldSeqIdx.name);
      }

      console.log(`  -> Creating new section-scoped compound indexes...`);
      await subsColl.createIndex(
        { userId: 1, section: 1, expiresAt: 1 },
        { unique: true, partialFilterExpression: { status: 'active' }, background: true }
      );
      await subsColl.createIndex(
        { userId: 1, section: 1, subscriptionIndex: 1 },
        { unique: true, partialFilterExpression: { subscriptionIndex: { $type: 'number' } }, background: true }
      );
      await subsColl.createIndex(
        { userId: 1, section: 1, status: 1, expiresAt: -1 },
        { background: true }
      );

      // Create new Note catalog indexes
      await notesColl.createIndex(
        { section: 1, isPublished: 1, order: 1, createdAt: -1 },
        { background: true }
      );
      await notesColl.createIndex(
        { section: 1, subject: 1, classLevel: 1 },
        { background: true }
      );
      console.log(`  -> New section-scoped indexes created successfully.`);
    } else {
      console.log(`  [DRY-RUN] No indexes were dropped or created. Pass --apply --confirm-backup to execute.`);
    }

    console.log(`\n======================================================`);
    console.log(`  MIGRATION CHECK COMPLETED`);
    console.log(`======================================================\n`);

  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
