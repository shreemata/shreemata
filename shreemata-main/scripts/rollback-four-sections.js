// scripts/rollback-four-sections.js
// Safe rollback script for 4-Section architecture
// DRY-RUN by default. Pass --apply --confirm-backup to execute rollback.
// REFUSES TO RUN if any non-notes data exists (question_papers or videos).

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
  console.error('\n❌ ERROR: Rollback requires explicit confirmation.\nUsage: node scripts/rollback-four-sections.js --apply --confirm-backup\n');
  process.exit(1);
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`  SHREE MATA FOUR-SECTIONS ROLLBACK SCRIPT`);
  console.log(`  Mode: ${isApply ? '🚀 APPLY (ROLLING BACK)' : '🔍 DRY-RUN (READ-ONLY)'}`);
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
    const notesColl = db.collection('notes');
    const subsColl = db.collection('notesubscriptions');
    const ordersColl = db.collection('subscriptionorders');

    // ----------------------------------------------------
    // Safety check: Are there non-notes items created?
    // ----------------------------------------------------
    const nonNotesContentCount = await notesColl.countDocuments({ section: { $exists: true, $ne: 'notes' } });
    const nonNotesSubsCount = await subsColl.countDocuments({ section: { $exists: true, $ne: 'notes' } });
    const nonNotesOrdersCount = await ordersColl.countDocuments({ section: { $exists: true, $ne: 'notes' } });

    console.log(`[Safety Pre-Check]`);
    console.log(`  - Non-notes content items (question_papers/videos): ${nonNotesContentCount}`);
    console.log(`  - Non-notes subscription passes: ${nonNotesSubsCount}`);
    console.log(`  - Non-notes subscription orders: ${nonNotesOrdersCount}`);

    if (nonNotesContentCount > 0 || nonNotesSubsCount > 0 || nonNotesOrdersCount > 0) {
      console.error(`\n❌ ROLLBACK REFUSED: Database contains non-notes section records!`);
      console.error(`   Rollback is only permitted when no question_papers or videos items exist to avoid data corruption.`);
      console.error(`   Please manually archive or remove active question_papers / video records first.`);
      process.exit(1);
    }

    console.log(`\n✅ Pre-check passed: Zero non-notes data found.`);

    // ----------------------------------------------------
    // Step: Revert indexes on notesubscriptions
    // ----------------------------------------------------
    const existingSubsIndexes = await subsColl.listIndexes().toArray();
    console.log(`\nExisting indexes on notesubscriptions:`);
    for (const idx of existingSubsIndexes) {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    }

    const sectionExpiryIdx = existingSubsIndexes.find(idx => idx.key.userId === 1 && idx.key.section === 1 && idx.key.expiresAt === 1);
    const sectionSeqIdx = existingSubsIndexes.find(idx => idx.key.userId === 1 && idx.key.section === 1 && idx.key.subscriptionIndex === 1);

    if (isApply) {
      if (sectionExpiryIdx) {
        console.log(`-> Dropping section-scoped index: "${sectionExpiryIdx.name}"`);
        await subsColl.dropIndex(sectionExpiryIdx.name);
      }
      if (sectionSeqIdx) {
        console.log(`-> Dropping section-scoped index: "${sectionSeqIdx.name}"`);
        await subsColl.dropIndex(sectionSeqIdx.name);
      }

      console.log(`-> Restoring original single-section partial indexes...`);
      await subsColl.createIndex(
        { userId: 1, expiresAt: 1 },
        { unique: true, partialFilterExpression: { status: 'active' }, background: true }
      );
      await subsColl.createIndex(
        { userId: 1, subscriptionIndex: 1 },
        { unique: true, partialFilterExpression: { subscriptionIndex: { $type: 'number' } }, background: true }
      );

      console.log(`✅ Rollback of indexes completed. Data fields were NOT deleted.`);
    } else {
      console.log(`\n[DRY-RUN] Rollback preconditions satisfied. No indexes were changed. Pass --apply --confirm-backup to execute.`);
    }

  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Rollback error:", err);
  process.exit(1);
});
