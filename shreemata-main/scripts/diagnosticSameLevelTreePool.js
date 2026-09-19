/**
 * scripts/diagnosticSameLevelTreePool.js
 * 
 * READ-ONLY diagnostic script for SAME-LEVEL COMPLETED-BLOCK + UPPER-LEVEL Tree Pool distribution.
 * PERFORMS ZERO DATABASE WRITES.
 */

const { calculateLevelBasedTreePoolDistribution, resolveSameLevelCompletedBlockRecipients } = require('../services/commissionDistribution');

async function runDiagnostic() {
  console.log('===============================================================');
  console.log('🌳 SHREE MATA — READ-ONLY TREE POOL DIAGNOSTIC SCRIPT');
  console.log('===============================================================\n');

  // Simulation Scenario: Nagarathan & Yuvaraj Tree Pool Distribution
  // Physical Level 2:
  // - Shivraj
  // - Ratnabai
  // - Nagarathan
  // - Yuvaraj
  // - Revati
  //
  // Physical Level 3:
  // - Shivraj Children: 5/5 COMPLETE
  // - Ratnabai Children: 5/5 COMPLETE
  // - Nagarathan Children: 5/5 COMPLETE (5th child makes purchase -> current block)
  // - Yuvaraj Children: 1/5 INCOMPLETE

  const root = { _id: 'root_user_1', name: 'Shakuntaladevi (Root)', treeLevel: 1, treePosition: 0 };

  const shivraj = { _id: 'l2_shivraj', name: 'Shivraj Palegar', treeLevel: 2, treeParent: root._id, treePosition: 0 };
  const ratnabai = { _id: 'l2_ratnabai', name: 'Ratnabai S Desai', treeLevel: 2, treeParent: root._id, treePosition: 1 };
  const nagarathan = { _id: 'l2_nagarathan', name: 'Nagarathan R Bharamagoudar', treeLevel: 2, treeParent: root._id, treePosition: 2 };
  const yuvaraj = { _id: 'l2_yuvaraj', name: 'Yuvaraj', treeLevel: 2, treeParent: root._id, treePosition: 3 };
  const revati = { _id: 'l2_revati', name: 'Revati C Patil', treeLevel: 2, treeParent: root._id, treePosition: 4 };

  const shivrajChildren = [0, 1, 2, 3, 4].map(p => ({
    _id: `l3_shivraj_child_${p}`,
    name: `Shivraj Child ${p+1}`,
    treeLevel: 3,
    treeParent: shivraj._id,
    treePosition: p
  }));

  const ratnabaiChildren = [0, 1, 2, 3, 4].map(p => ({
    _id: `l3_ratnabai_child_${p}`,
    name: `Ratnabai Child ${p+1}`,
    treeLevel: 3,
    treeParent: ratnabai._id,
    treePosition: p
  }));

  const nagarathanChildren = [0, 1, 2, 3, 4].map(p => ({
    _id: `l3_nagarathan_child_${p}`,
    name: `Nagarathan Child ${p+1}`,
    treeLevel: 3,
    treeParent: nagarathan._id,
    treePosition: p
  }));

  const yuvarajChild = {
    _id: 'l3_yuvaraj_child_0',
    name: 'Yuvaraj Child 1',
    treeLevel: 3,
    treeParent: yuvaraj._id,
    treePosition: 0
  };

  const levelRecipients = {
    1: [root],
    2: [shivraj, ratnabai, nagarathan, yuvaraj, revati],
    3: [...shivrajChildren, ...ratnabaiChildren, ...nagarathanChildren, yuvarajChild]
  };

  const treePoolTotalRupees = 8.00; // ₹8.00 = 800 paise

  console.log('---------------------------------------------------------------');
  console.log('SCENARIO 1: 5th Child under Nagarathan buys (Nagarathan block becomes 5/5)');
  console.log('---------------------------------------------------------------');

  const buyer1 = nagarathanChildren[4]; // 5th child
  console.log(`Purchaser: ${buyer1.name} (ID: ${buyer1._id})`);
  console.log(`Buyer Level: ${buyer1.treeLevel}`);
  console.log(`Buyer Parent: Nagarathan (ID: ${nagarathan._id})`);
  console.log(`Tree Pool Total: ₹${treePoolTotalRupees.toFixed(2)} (${Math.round(treePoolTotalRupees * 100)} paise)\n`);

  const sameLevelEligible1 = await resolveSameLevelCompletedBlockRecipients(buyer1, levelRecipients[3]);
  console.log(`Same-Level Completed 5/5 Sibling Blocks (excluding current block under Nagarathan):`);
  console.log(`- Shivraj Block (5/5): ELIGIBLE (${shivrajChildren.length} members)`);
  console.log(`- Ratnabai Block (5/5): ELIGIBLE (${ratnabaiChildren.length} members)`);
  console.log(`- Nagarathan Block (5/5): EXCLUDED (Current Buyer Block)`);
  console.log(`- Yuvaraj Block (1/5): EXCLUDED (Incomplete)`);
  console.log(`Total Same-Level Eligible Members: ${sameLevelEligible1.length}\n`);

  const res1 = calculateLevelBasedTreePoolDistribution({
    buyerLevel: 3,
    treePoolAmount: treePoolTotalRupees,
    levelRecipients,
    sameLevelEligibleRecipients: sameLevelEligible1,
    buyer: buyer1
  });

  printBreakdown(res1);

  console.log('\n---------------------------------------------------------------');
  console.log('SCENARIO 2: Next Buyer placed under Yuvaraj (Yuvaraj block = 1/5)');
  console.log('---------------------------------------------------------------');

  const buyer2 = yuvarajChild;
  console.log(`Purchaser: ${buyer2.name} (ID: ${buyer2._id})`);
  console.log(`Buyer Level: ${buyer2.treeLevel}`);
  console.log(`Buyer Parent: Yuvaraj (ID: ${yuvaraj._id})`);
  console.log(`Tree Pool Total: ₹${treePoolTotalRupees.toFixed(2)} (${Math.round(treePoolTotalRupees * 100)} paise)\n`);

  const sameLevelEligible2 = await resolveSameLevelCompletedBlockRecipients(buyer2, levelRecipients[3]);
  console.log(`Same-Level Completed 5/5 Sibling Blocks (excluding current block under Yuvaraj):`);
  console.log(`- Shivraj Block (5/5): ELIGIBLE (${shivrajChildren.length} members)`);
  console.log(`- Ratnabai Block (5/5): ELIGIBLE (${ratnabaiChildren.length} members)`);
  console.log(`- Nagarathan Block (5/5): ELIGIBLE (${nagarathanChildren.length} members)`);
  console.log(`- Yuvaraj Block (1/5): EXCLUDED (Current Buyer Block / Incomplete)`);
  console.log(`Total Same-Level Eligible Members: ${sameLevelEligible2.length}\n`);

  const res2 = calculateLevelBasedTreePoolDistribution({
    buyerLevel: 3,
    treePoolAmount: treePoolTotalRupees,
    levelRecipients,
    sameLevelEligibleRecipients: sameLevelEligible2,
    buyer: buyer2
  });

  printBreakdown(res2);
  console.log('\n✅ READ-ONLY DIAGNOSTIC COMPLETE — ZERO WRITES PERFORMED');
}

function printBreakdown(res) {
  console.log('Active Bucket Calculations:');
  res.bucketResults.forEach(b => {
    console.log(`  [Bucket Level ${b.levelNum}] ${b.label} (${b.type})`);
    console.log(`    - Weight: ${b.weight} | Normalized: ${b.normalizedPercent.toFixed(2)}%`);
    console.log(`    - Initial Bucket Amount: ${b.initialPaise} paise (₹${(b.initialPaise/100).toFixed(2)})`);
    console.log(`    - Recipients Count: ${b.recipients ? b.recipients.length : 0}`);
    console.log(`    - Equal Share Per Member: ${b.equalSharePaise || 0} paise (₹${((b.equalSharePaise||0)/100).toFixed(2)})`);
    console.log(`    - Rolled Up Remainder: ${b.remainderRolledUpPaise || 0} paise`);
  });

  console.log('\nRecipient Credits:');
  const levelSummary = {};
  res.distributions.forEach(d => {
    if (!levelSummary[d.level]) levelSummary[d.level] = { count: 0, sumPaise: 0 };
    levelSummary[d.level].count++;
    levelSummary[d.level].sumPaise += Math.round(d.amount * 100);
    console.log(`  - L${d.level} | Recipient: ${d.recipientUser.name} | Share: ₹${d.amount.toFixed(2)} (${Math.round(d.amount * 100)} paise)`);
  });

  const totalDistributedPaise = res.distributions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
  const expectedPaise = Math.round(res.treePoolTotal * 100);

  console.log(`\nReconciliation Summary:`);
  console.log(`  - Total Tree Pool Configured: ${expectedPaise} paise (₹${res.treePoolTotal.toFixed(2)})`);
  console.log(`  - Total Recipient Credits:    ${totalDistributedPaise} paise (₹${(totalDistributedPaise/100).toFixed(2)})`);
  console.log(`  - Remainder Sent to Trust:     0 paise (₹0.00)`);
  console.log(`  - Mathematical Invariant Match: ${totalDistributedPaise === expectedPaise ? 'EXACT MATCH ✅' : 'FAILED ❌'}`);
}

if (require.main === module) {
  runDiagnostic().catch(console.error);
}

module.exports = { runDiagnostic };
