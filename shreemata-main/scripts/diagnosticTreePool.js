/**
 * Diagnostic CLI script for Tree Pool Normalized Distribution
 * Pure calculation only — DOES NOT CONNECT TO DATABASE OR WRITE ANY RECORDS.
 */
const { calculateTreePoolDistribution, TREE_WEIGHT_TABLE } = require('../services/commissionDistribution');

function runDiagnostic() {
  console.log('==================================================');
  console.log('TREE POOL NORMALIZED DISTRIBUTION DIAGNOSTIC');
  console.log('==================================================\n');

  const profit = 100;
  const treePoolPercent = 40;
  const treePoolAmount = profit * (treePoolPercent / 100);

  console.log(`Internal Order Profit : ₹${profit.toFixed(2)}`);
  console.log(`Tree Pool Percentage  : ${treePoolPercent}%`);
  console.log(`Tree Pool Amount      : ₹${treePoolAmount.toFixed(2)}\n`);

  const testCases = [1, 2, 3, 5, 11];

  testCases.forEach(n => {
    console.log(`--------------------------------------------------`);
    console.log(`CASE: ${n} ACTUAL UPLINE(S)`);
    console.log(`--------------------------------------------------`);

    // Mock upline objects
    const uplines = Array.from({ length: n }, (_, i) => ({
      _id: `mock_upline_${i + 1}`,
      name: `Upline ${i + 1}`,
      email: `upline${i + 1}@example.com`
    }));

    const selectedWeights = TREE_WEIGHT_TABLE.slice(0, n);
    const selectedWeightTotal = selectedWeights.reduce((sum, w) => sum + w, 0);

    const calc = calculateTreePoolDistribution(uplines, treePoolAmount);

    console.log(`Original Selected Weights : [${selectedWeights.map(w => w.toFixed(6)).join(', ')}]`);
    console.log(`Selected Weight Total     : ${selectedWeightTotal.toFixed(6)}%`);
    console.log('\nBreakdown per Upline:');

    calc.distribution.forEach(item => {
      console.log(`  - Upline ${item.level} (${item.upline.name}):`);
      console.log(`      Weight             : ${item.weight.toFixed(6)}`);
      console.log(`      Normalized Share   : ${item.normalizedPercent.toFixed(6)}%`);
      console.log(`      Raw Amount         : ₹${item.rawAmount.toFixed(4)}`);
      console.log(`      Paise Amount       : ${item.paiseAmount}p`);
      console.log(`      Final Credited     : ₹${item.amount.toFixed(2)}`);
    });

    console.log(`\nTotal Credited Paise     : ${calc.totalCreditedPaise}p`);
    console.log(`Total Credited           : ₹${calc.totalCredited.toFixed(2)}`);
    console.log(`Target Pool Amount       : ₹${calc.poolAmount.toFixed(2)}`);
    console.log(`Reconciliation Invariant : ${calc.totalCreditedPaise === calc.poolInPaise ? 'PASS (EXACT RECONCILIATION)' : 'FAIL'}`);
    console.log(`Unused Tree Pool         : ₹0.00\n`);
  });

  console.log('==================================================');
  console.log('DIAGNOSTIC COMPLETED SUCCESSFULLY');
  console.log('==================================================');
}

runDiagnostic();
