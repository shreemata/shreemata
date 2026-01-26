// Test the fixed settlement logic
require('dotenv').config();

const mongoose = require('mongoose');
const Razorpay = require('razorpay');

mongoose.connect(process.env.MONGO_URI);

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function testFixedSettlementLogic() {
  try {
    console.log('🧪 TESTING FIXED SETTLEMENT LOGIC\n');
    
    // Simulate the same logic as the fixed API
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultTo = now.toISOString().split('T')[0];
    
    console.log(`📅 Date range: ${defaultFrom} to ${defaultTo}`);
    
    const options = {
      count: 100,
      from: Math.floor(new Date(defaultFrom).getTime() / 1000),
      to: Math.floor(new Date(defaultTo + 'T23:59:59').getTime() / 1000)
    };
    
    console.log('\n1️⃣ FETCHING PAYMENTS (with date filter):');
    const payments = await razorpay.payments.all(options);
    console.log(`Found ${payments.items.length} payments`);
    
    // Process payments
    const paymentStats = {
      total: { count: 0, amount: 0 },
      captured: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 }
    };
    
    payments.items.forEach(payment => {
      const amount = payment.amount / 100;
      paymentStats.total.count++;
      paymentStats.total.amount += amount;
      
      if (payment.status === 'captured') {
        paymentStats.captured.count++;
        paymentStats.captured.amount += amount;
      } else if (payment.status === 'failed') {
        paymentStats.failed.count++;
        paymentStats.failed.amount += amount;
      }
    });
    
    console.log('\n2️⃣ FETCHING SETTLEMENTS (with SAME date filter):');
    
    // Use the SAME date range as payments
    const settlementsOptions = {
      count: 100,
      from: options.from, // Same as payments
      to: options.to      // Same as payments
    };
    
    const settlements = await razorpay.settlements.all(settlementsOptions);
    console.log(`Found ${settlements.items.length} settlements for the same date range`);
    
    // Process settlements
    const settlementStats = {
      count: 0,
      amount: 0,
      fees: 0,
      tax: 0
    };
    
    if (settlements.items && settlements.items.length > 0) {
      settlements.items.forEach(settlement => {
        settlementStats.count++;
        settlementStats.amount += (settlement.amount / 100);
        settlementStats.fees += (settlement.fees / 100);
        settlementStats.tax += (settlement.tax / 100);
      });
    }
    
    console.log('\n3️⃣ RESULTS COMPARISON:');
    console.log(`📊 PAYMENTS (${defaultFrom} to ${defaultTo}):`);
    console.log(`   Total: ${paymentStats.total.count} payments (₹${paymentStats.total.amount.toFixed(2)})`);
    console.log(`   Captured: ${paymentStats.captured.count} payments (₹${paymentStats.captured.amount.toFixed(2)})`);
    console.log(`   Failed: ${paymentStats.failed.count} payments (₹${paymentStats.failed.amount.toFixed(2)})`);
    
    console.log(`\n🏦 SETTLEMENTS (${defaultFrom} to ${defaultTo}):`);
    console.log(`   Settled: ${settlementStats.count} settlements (₹${settlementStats.amount.toFixed(2)})`);
    console.log(`   Fees: ₹${settlementStats.fees.toFixed(2)}`);
    console.log(`   Tax: ₹${settlementStats.tax.toFixed(2)}`);
    
    console.log('\n4️⃣ LOGICAL VALIDATION:');
    const difference = settlementStats.amount - paymentStats.captured.amount;
    
    if (settlementStats.amount <= paymentStats.captured.amount) {
      console.log('✅ LOGICAL: Settled amount ≤ Captured amount');
      console.log(`   Difference: ₹${Math.abs(difference).toFixed(2)} (${difference >= 0 ? 'settled more' : 'settled less'})`);
      
      if (difference < 0) {
        console.log('💡 This is normal - settlements can be delayed or partial');
      }
    } else {
      console.log('❌ ILLOGICAL: Settled amount > Captured amount');
      console.log(`   Excess: ₹${difference.toFixed(2)}`);
      console.log('🚨 This should not happen with the fix!');
    }
    
    console.log('\n5️⃣ EXPECTED DASHBOARD VALUES:');
    console.log(`Total Payments: ₹${paymentStats.total.amount.toFixed(2)}`);
    console.log(`Captured Payments: ₹${paymentStats.captured.amount.toFixed(2)}`);
    console.log(`Settled to Bank: ₹${settlementStats.amount.toFixed(2)}`);
    console.log(`Failed Payments: ₹${paymentStats.failed.amount.toFixed(2)}`);
    console.log(`Razorpay Fees: ₹${settlementStats.fees.toFixed(2)}`);
    
    console.log('\n✅ TEST COMPLETED');
    
    if (settlementStats.amount <= paymentStats.captured.amount) {
      console.log('🎉 SUCCESS: The fix resolves the logical inconsistency!');
      console.log('Now both payments and settlements use the same date range.');
    } else {
      console.log('⚠️  The issue persists - further investigation needed.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

testFixedSettlementLogic();