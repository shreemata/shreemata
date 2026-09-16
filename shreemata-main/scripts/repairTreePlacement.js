require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const User = require('../models/User');

async function repairTreePlacement() {
  const isApply = process.argv.includes('--apply');
  console.log('===============================================================');
  console.log(`🌳 REFERRAL TREE PLACEMENT AUDIT & REPAIR SCRIPT (${isApply ? 'APPLY MODE' : 'DRY RUN MODE'})`);
  console.log('===============================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB database.\n');

    // 1. Audit Dangling References in treeChildren arrays
    const allUsers = await User.find({}).lean();
    const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));

    let danglingCount = 0;
    const danglingReport = [];

    for (const user of allUsers) {
      if (Array.isArray(user.treeChildren) && user.treeChildren.length > 0) {
        const validChildren = [];
        for (const childId of user.treeChildren) {
          const childStr = childId.toString();
          if (!userMap.has(childStr)) {
            danglingCount++;
            danglingReport.push({ parent: user.name || user.email, parentId: user._id, deadId: childStr });
          } else {
            validChildren.push(childId);
          }
        }
      }
    }

    // 2. Audit Duplicate (treeParent, treePosition) Slots
    const slotMap = new Map();
    const duplicates = [];

    for (const user of allUsers) {
      if (user.treeParent && typeof user.treePosition === 'number') {
        const key = `${user.treeParent.toString()}:${user.treePosition}`;
        if (!slotMap.has(key)) {
          slotMap.set(key, []);
        }
        slotMap.get(key).push(user);
      }
    }

    slotMap.forEach((usersInSlot, key) => {
      if (usersInSlot.length > 1) {
        duplicates.push({ key, users: usersInSlot.map(u => ({ id: u._id, name: u.name, position: u.treePosition })) });
      }
    });

    // 3. Find placed root users (treeLevel = 1 or admin role)
    const rootUser = await User.findOne({
      role: 'admin',
      treeLevel: 1
    }) || await User.findOne({ treeLevel: 1, firstPurchaseDone: true }) || allUsers.find(u => u.treeLevel === 1);

    if (!rootUser) {
      throw new Error('No root/admin user found at level 1 in database');
    }

    // 4. Separate PLACED users from ELIGIBLE BUT UNPLACED users
    // Rule for PLACED USERS: treeParent !== null && treeParent !== undefined (excluding rootUser)
    const placedUsers = allUsers.filter(u => 
      u.treeParent !== null && u.treeParent !== undefined && u._id.toString() !== rootUser._id.toString()
    );

    // Rule for ELIGIBLE BUT UNPLACED USERS: treeParent === null/undefined AND firstPurchaseDone === true (excluding rootUser)
    const eligibleUnplacedUsers = allUsers.filter(u => 
      (!u.treeParent) && u.firstPurchaseDone === true && u._id.toString() !== rootUser._id.toString()
    );

    // Canonical sorting by business placement eligibility date for placed users:
    // 1) firstPurchaseDate ASC
    // 2) createdAt ASC (fallback if firstPurchaseDate is missing for legacy records)
    // 3) _id ASC (deterministic fallback)
    placedUsers.sort((a, b) => {
      const dateA = a.firstPurchaseDate ? new Date(a.firstPurchaseDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const dateB = b.firstPurchaseDate ? new Date(b.firstPurchaseDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      if (dateA !== dateB) return dateA - dateB;
      
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (createdA !== createdB) return createdA - createdB;

      return a._id.toString().localeCompare(b._id.toString());
    });

    console.log(`Found Root User: ${rootUser.name} (${rootUser.email}) [_id: ${rootUser._id}]`);
    console.log(`Total Placed Users to evaluate: ${placedUsers.length} (excluding ROOT)`);
    console.log(`Total Eligible Unplaced Users: ${eligibleUnplacedUsers.length}\n`);

    // 5. Calculate Canonical Strict Queue-based Serial BFS Placement
    const proposedPlacements = [];
    const queue = [{ id: rootUser._id.toString(), level: rootUser.treeLevel, name: rootUser.name }];
    const canonicalSlots = new Map(); // parentId -> array of child user objects (length max 5)

    for (const candidate of placedUsers) {
      let assigned = false;

      while (queue.length > 0) {
        const parentNode = queue[0];
        const parentIdStr = parentNode.id;

        if (!canonicalSlots.has(parentIdStr)) {
          canonicalSlots.set(parentIdStr, []);
        }

        const currentChildren = canonicalSlots.get(parentIdStr);

        if (currentChildren.length < 5) {
          const slotPosition = currentChildren.length;
          const assignedLevel = parentNode.level + 1;

          const childData = {
            user: candidate,
            currentParent: candidate.treeParent ? candidate.treeParent.toString() : null,
            currentLevel: candidate.treeLevel,
            currentPosition: candidate.treePosition,
            proposedParent: parentIdStr,
            proposedParentName: parentNode.name,
            proposedLevel: assignedLevel,
            proposedPosition: slotPosition
          };

          currentChildren.push(childData);
          proposedPlacements.push(childData);

          // Add candidate to queue for future level expansion
          queue.push({ id: candidate._id.toString(), level: assignedLevel, name: candidate.name });

          assigned = true;
          break;
        } else {
          // Parent is full (5/5 children). Dequeue parent.
          queue.shift();
        }
      }

      if (!assigned) {
        throw new Error(`Failed to assign serial placement for user ${candidate.name} (${candidate._id})`);
      }
    }

    // 6. Identify Serial Violations / Proposed Moves
    const violations = proposedPlacements.filter(p => 
      p.currentParent !== p.proposedParent ||
      p.currentLevel !== p.proposedLevel ||
      p.currentPosition !== p.proposedPosition
    );

    // 7. PRINT COMPLETE DRY RUN REPORT
    console.log('---------------------------------------------------------------');
    console.log('📊 DRY RUN AUDIT REPORT SUMMARY');
    console.log('---------------------------------------------------------------');
    console.log(`TOTAL PLACED USERS:               ${placedUsers.length} (excluding ROOT)`);
    console.log(`ELIGIBLE BUT UNPLACED USERS:     ${eligibleUnplacedUsers.length}`);
    console.log(`DANGLING treeChildren REFERENCES: ${danglingCount}`);
    console.log(`DUPLICATE TREE SLOTS:             ${duplicates.length}`);
    console.log(`SERIAL PLACEMENT VIOLATIONS:     ${violations.length}`);
    console.log(`PROPOSED MOVES:                   ${violations.length}\n`);

    if (eligibleUnplacedUsers.length > 0) {
      console.log('⚠️ ELIGIBLE BUT UNPLACED USERS:');
      console.log('='.repeat(70));
      eligibleUnplacedUsers.forEach((u, idx) => {
        console.log(`User #${idx + 1}: ${u.name || u.email}`);
        console.log(`  User ID:           ${u._id}`);
        console.log(`  firstPurchaseDone: ${u.firstPurchaseDone}`);
        console.log(`  firstPurchaseDate: ${u.firstPurchaseDate ? new Date(u.firstPurchaseDate).toISOString() : 'N/A'}`);
        console.log(`  referredBy:        ${u.referredBy || 'null'}`);
        console.log(`  treeParent:        ${u.treeParent || 'null'}`);
        console.log(`  treeLevel:         ${u.treeLevel ?? 0}`);
        console.log(`  treePosition:      ${u.treePosition ?? 0}`);
        console.log(`  Action:            NO CHANGE — REVIEW REQUIRED`);
        console.log('-'.repeat(70));
      });
      console.log('');
    }

    if (danglingCount > 0) {
      console.log('⚠️ DANGLING REFERENCES DETECTED:');
      danglingReport.forEach(d => console.log(`   - Parent ${d.parent} contains non-existent ObjectId ${d.deadId}`));
      console.log('');
    }

    if (duplicates.length > 0) {
      console.log('⚠️ DUPLICATE SLOTS DETECTED:');
      duplicates.forEach(dup => console.log(`   - Slot ${dup.key}: Users [${dup.users.map(u => u.name).join(', ')}]`));
      console.log('');
    }

    if (violations.length === 0) {
      console.log('✅ All users are already placed in exact canonical serial order. No moves required.\n');
    } else {
      console.log('📋 PROPOSED PLACEMENT MOVES:');
      console.log('='.repeat(70));
      violations.forEach((v, idx) => {
        console.log(`Move #${idx + 1}: ${v.user.name} (${v.user.email})`);
        console.log(`  User ID:          ${v.user._id}`);
        console.log(`  Current Parent:   ${v.currentParent} | Level: ${v.currentLevel} | Pos: ${v.currentPosition}`);
        console.log(`  Proposed Parent:  ${v.proposedParent} (${v.proposedParentName}) | Level: ${v.proposedLevel} | Pos: ${v.proposedPosition}`);
        console.log(`  referredBy:       ${v.user.referredBy} (UNCHANGED)`);
        console.log(`  Financial records: UNCHANGED`);
        console.log('-'.repeat(70));
      });
    }

    // Stop if not in apply mode
    if (!isApply) {
      console.log('\n🔒 DRY RUN COMPLETE. No database changes were made.');
      console.log('   To execute the database backup and apply changes, run:');
      console.log('   node scripts/repairTreePlacement.js --apply\n');
      process.exit(0);
    }

    // ===============================================================
    // APPLY MODE Execution with MANDATORY BACKUP HARD GATE
    // ===============================================================
    console.log('\n===============================================================');
    console.log('🚀 EXECUTING DATABASE REPAIR (--apply mode active)');
    console.log('===============================================================\n');

    // 1. Mandatory Database Backup Gate
    console.log('📦 Step 1: Triggering Production Database Backup...');
    try {
      const backupScriptPath = path.join(__dirname, 'backup-database.js');
      console.log(`Running: node "${backupScriptPath}"`);
      const output = execSync(`node "${backupScriptPath}"`, { encoding: 'utf-8' });
      console.log(output);

      // Verify backup archive directory / file
      const backupDir = path.join(__dirname, '..', 'backups', 'daily');
      if (!fs.existsSync(backupDir)) {
        throw new Error(`Backup directory ${backupDir} does not exist!`);
      }

      const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.gz') || f.endsWith('.json'));
      if (backupFiles.length === 0) {
        throw new Error('No backup archive files found in backups/daily after backup execution!');
      }

      // Check newest backup file size
      const newestFile = backupFiles.map(f => path.join(backupDir, f))
        .map(file => ({ file, mtime: fs.statSync(file).mtimeMs, size: fs.statSync(file).size }))
        .sort((a, b) => b.mtime - a.mtime)[0];

      if (!newestFile || newestFile.size === 0) {
        throw new Error(`Backup file ${newestFile ? newestFile.file : 'none'} is 0 bytes! Backup verification failed.`);
      }

      console.log(`✅ DATABASE BACKUP VERIFIED: ${path.basename(newestFile.file)} (${newestFile.size} bytes)\n`);
    } catch (backupError) {
      console.error('❌ DATABASE BACKUP HARD GATE FAILED!');
      console.error('   Error:', backupError.message);
      console.error('\n🛑 ABORTING REPAIR. No user records were modified.');
      process.exit(1);
    }

    // 2. Clean up dangling treeChildren references in all User documents
    console.log('🧹 Step 2: Cleaning dangling treeChildren references...');
    for (const user of allUsers) {
      const realChildDocs = await User.find({ treeParent: user._id }).select('_id');
      await User.updateOne(
        { _id: user._id },
        { $set: { treeChildren: realChildDocs.map(c => c._id) } }
      );
    }
    console.log('✅ Cleaned denormalized treeChildren caches.\n');

    // 3. Apply Proposed Placements
    console.log('📝 Step 3: Applying canonical placements to database...');
    for (const move of proposedPlacements) {
      await User.updateOne(
        { _id: move.user._id },
        {
          $set: {
            treeParent: move.proposedParent,
            treeLevel: move.proposedLevel,
            treePosition: move.proposedPosition
          }
        }
      );
    }
    console.log(`✅ Repositioned ${proposedPlacements.length} users successfully.\n`);

    // 4. Rebuild all treeChildren denormalized caches
    console.log('🔄 Step 4: Rebuilding denormalized treeChildren arrays...');
    const updatedUsers = await User.find({}).select('_id name');
    for (const u of updatedUsers) {
      const children = await User.find({ treeParent: u._id }).sort({ treePosition: 1 });
      await User.updateOne(
        { _id: u._id },
        { $set: { treeChildren: children.map(c => c._id) } }
      );
    }
    console.log('✅ Denormalized treeChildren caches updated.\n');

    // 5. Create/Sync Partial Unique Index on (treeParent, treePosition)
    console.log('⚡ Step 5: Syncing partial unique index on (treeParent, treePosition)...');
    await User.syncIndexes();
    console.log('✅ Partial unique index synced successfully.\n');

    console.log('===============================================================');
    console.log('🎉 REPAIR COMPLETE! All tree positions repaired strictly to 5-wide BFS.');
    console.log('===============================================================\n');

    process.exit(0);

  } catch (err) {
    console.error('❌ Script Error:', err);
    process.exit(1);
  }
}

repairTreePlacement();
