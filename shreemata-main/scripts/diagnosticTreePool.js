/**
 * READ-ONLY Diagnostic Script for Final Level-Based Tree Pool Distribution
 * 
 * Simulates Tree Pool distributions for:
 * - Buyer Level 2
 * - Buyer Level 3 (Sharifsab F Pinjar ₹8 Example)
 * - Buyer Level 4
 * - Buyer Level 5
 * - Buyer Level 11
 * 
 * Run with: node scripts/diagnosticTreePool.js
 */

const { calculateLevelBasedTreePoolDistribution } = require('../services/commissionDistribution');

console.log("==================================================");
console.log("SHREE MATA — FINAL LEVEL-BASED TREE POOL DIAGNOSTIC");
console.log("==================================================\n");

function simulateLevelDistribution({ label, buyerLevel, profitAmount = 20, treePoolPercent = 40, levelMemberCounts, customNames = {} }) {
  const treePoolAmount = profitAmount * (treePoolPercent / 100);
  console.log(`--------------------------------------------------`);
  console.log(`SCENARIO: ${label}`);
  console.log(`Buyer Level: ${buyerLevel} | Profit Base: ₹${profitAmount} | Tree Pool (${treePoolPercent}%): ₹${treePoolAmount.toFixed(2)} (${Math.round(treePoolAmount * 100)} paise)`);
  console.log(`--------------------------------------------------`);

  // Build mock recipients map
  const levelRecipients = {};
  Object.keys(levelMemberCounts).forEach(lvlStr => {
    const lvl = Number(lvlStr);
    const count = levelMemberCounts[lvl];
    const names = customNames[lvl] || [];
    levelRecipients[lvl] = [];
    for (let i = 0; i < count; i++) {
      levelRecipients[lvl].push({
        _id: `user_L${lvl}_${i + 1}`,
        name: names[i] || `Level ${lvl} Member ${i + 1}`,
        email: `member_l${lvl}_${i + 1}@shreemata.com`,
        treeLevel: lvl,
        treePosition: i
      });
    }
  });

  const res = calculateLevelBasedTreePoolDistribution({
    buyerLevel,
    treePoolAmount,
    levelRecipients,
    orderId: "DIAGNOSTIC_ORDER_001"
  });

  console.log("\n1. BUCKET ALLOCATION & NORMALIZATION:");
  res.bucketResults.forEach(b => {
    console.log(`   - Bucket [${b.label.padEnd(5)}]: Original Weight = ${String(b.weight).padEnd(8)} | Normalized = ${b.normalizedPercent.toFixed(6)}% | Allocated = ₹${(b.finalPaise / 100).toFixed(2)} (${b.finalPaise} paise)`);
  });

  console.log("\n2. LEVEL-BY-LEVEL MEMBER DISTRIBUTION:");
  const levelGroups = {};
  res.distributions.forEach(d => {
    if (!levelGroups[d.level]) levelGroups[d.level] = [];
    levelGroups[d.level].push(d);
  });

  let totalDistributedPaise = 0;

  Object.keys(levelGroups).forEach(lvlStr => {
    const lvl = Number(lvlStr);
    const group = levelGroups[lvl];
    const groupPaise = group.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    totalDistributedPaise += groupPaise;

    console.log(`\n   Physical Level ${lvl} (${group.length} recipient${group.length > 1 ? 's' : ''}) — Level Total: ₹${(groupPaise / 100).toFixed(2)} (${groupPaise} paise):`);
    group.forEach(item => {
      const paise = Math.round(item.amount * 100);
      console.log(`     • ${item.recipientUser.name.padEnd(30)}: ₹${item.amount.toFixed(2)} (${paise} paise)`);
    });
  });

  console.log(`\n3. FINANCIAL RECONCILIATION:`);
  console.log(`   Total Tree Pool Configured : ₹${treePoolAmount.toFixed(2)} (${Math.round(treePoolAmount * 100)} paise)`);
  console.log(`   Total Tree Pool Distributed: ₹${(totalDistributedPaise / 100).toFixed(2)} (${totalDistributedPaise} paise)`);
  console.log(`   Tree Pool Remainder        : ₹${((Math.round(treePoolAmount * 100) - totalDistributedPaise) / 100).toFixed(2)}`);
  console.log(`   Financial Assertion Check  : ${totalDistributedPaise === Math.round(treePoolAmount * 100) ? 'PASSED ✅' : 'FAILED ❌'}\n`);
}

// 1. Buyer Level 2
simulateLevelDistribution({
  label: "Buyer Level 2",
  buyerLevel: 2,
  profitAmount: 20,
  treePoolPercent: 40,
  levelMemberCounts: { 1: 1 },
  customNames: { 1: ["Shakuntaladevi / Admin"] }
});

// 2. Buyer Level 3 — Sharifsab F Pinjar Example
simulateLevelDistribution({
  label: "Sharifsab F Pinjar Example (Buyer Level 3)",
  buyerLevel: 3,
  profitAmount: 20,
  treePoolPercent: 40,
  levelMemberCounts: { 1: 1, 2: 5 },
  customNames: {
    1: ["Shakuntaladevi / Admin"],
    2: ["Shivraj Palegar", "Ratnabai S Desai", "Nagarathan R Bharamagoudar", "Yuvaraj", "Revati C Patil"]
  }
});

// 3. Buyer Level 4
simulateLevelDistribution({
  label: "Buyer Level 4",
  buyerLevel: 4,
  profitAmount: 20,
  treePoolPercent: 40,
  levelMemberCounts: { 1: 1, 2: 5, 3: 10 },
  customNames: { 1: ["Shakuntaladevi / Admin"] }
});

// 4. Buyer Level 5
simulateLevelDistribution({
  label: "Buyer Level 5",
  buyerLevel: 5,
  profitAmount: 20,
  treePoolPercent: 40,
  levelMemberCounts: { 1: 1, 2: 5, 3: 10, 4: 15 },
  customNames: { 1: ["Shakuntaladevi / Admin"] }
});

// 5. Buyer Level 11
simulateLevelDistribution({
  label: "Buyer Level 11 (Max 10 Upper Level Buckets)",
  buyerLevel: 11,
  profitAmount: 20,
  treePoolPercent: 40,
  levelMemberCounts: { 1: 1, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5, 10: 5 },
  customNames: { 1: ["Shakuntaladevi / Admin"] }
});
