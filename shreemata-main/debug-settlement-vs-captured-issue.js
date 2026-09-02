// Debug why settled amount is higher than captured amount
require('dotenv').config();

const mongoose = require('mongoose');
const Razorpay = require('razorpay');

mongoose.connect(process.env.MONGO_URI);

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function debugSettlementVsCapturedIssue() {
  try {
    console.log('🔍 DEBUGGING SETTLEMENT VS CAPTURED AMOUNT ISSUE\n');
    
    // Get the current date range that's being used in the reports
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultTo = now.toISOString().split('T')[0];
    
    console.log(`📅 Current month date range: ${defaultFrom} to ${defaultTo}`);
    
    // 1. Get payments for current month (same as summary API)
    console.log('\n1️⃣ FETCHING PAYMENTS FOR CURRENT MONTH:');
    
    const paymentsOptions = {
      count: 100,
      from: Math.floor(new Date(defaultFrom).getTime() / 1000),
      to: Math.floor(new Date(defaultTo + 'T23:59:59').getTime() / 1000)
    };
    
    const payments = await razorpay.payments.all(paymentsOptions);
    console.log(`Found ${payments.items.length} payments in current month`);
    
    // Analyze payments by status
    const paymentStats = {
      total: { count: 0, amount: 0 },
      captured: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 },
      refunded: { count: 0, amount: 0 }
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
      } else if (payment.status === 'refunded') {
        paymentStats.refunded.count++;
        paymentStats.refunded.amount += amount;
      }
    });
    
    console.log('\n📊 PAYMENTS ANALYSIS (CURRENT MONTH):');
    console.log(`Total Payments: ${paymentStats.total.count} (₹${paymentStats.total.amount.toFixed(2)})`);
    console.log(`Captured: ${paymentStats.captured.count} (₹${paymentStats.captured.amount.toFixed(2)})`);
    console.log(`Failed: ${paymentStats.failed.count} (₹${paymentStats.failed.amount.toFixed(2)})`);
    console.log(`Refunded: ${paymentStats.refunded.count} (₹${paymentStats.refunded.amount.toFixed(2)})`);
    
    // 2. Get ALL settlements (not date-filtered, as settlements can happen later)
    console.log('\n2️⃣ FETCHING ALL SETTLEMENTS:');
    
    let allSettlements = [];
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;
    
    while (hasMore && skip < 500) { // Safety limit
      try {
        const settlementsOptions = {
          count: batchSize,
          skip: skip
        };
        
        const batch = await razorpay.settlements.all(settlementsOptions);
        
        if (batch.items && batch.items.length > 0) {
          allSettlements = allSettlements.concat(batch.items);
          skip += batchSize;
          hasMore = batch.items.length === batchSize;
        } else {
          hasMore = false;
        }
      } catch (batchError) {
        console.error(`Error fetching settlements batch:`, batchError.message);
        hasMore = false;
      }
    }
    
    console.log(`Found ${allSettlements.length} total settlements`);
    
    // Analyze settlements
    const settlementStats = {
      total: { count: 0, amount: 0, fees: 0, tax: 0 },
      currentMonth: { count: 0, amount: 0, fees: 0, tax: 0 }
    };
    
    const currentMonthStart = Math.floor(new Date(defaultFrom).getTime() / 1000);
    const currentMonthEnd = Math.floor(new Date(defaultTo + 'T23:59:59').getTime() / 1000);
    
    allSettlements.forEach(settlement => {
      const amount = settlement.amount / 100;
      const fees = settlement.fees / 100;
      const tax = settlement.tax / 100;
      
      // All settlements
      settlementStats.total.count++;
      settlementStats.total.amount += amount;
      settlementStats.total.fees += fees;
      settlementStats.total.tax += tax;
      
      // Current month settlements
      if (settlement.created_at >= currentMonthStart && settlement.created_at <= currentMonthEnd) {
        settlementStats.currentMonth.count++;
        settlementStats.currentMonth.amount += amount;
        settlementStats.currentMonth.fees += fees;
        settlementStats.currentMonth.tax += tax;
      }
    });
    
    console.log('\n📊 SETTLEMENTS ANALYSIS:');
    console.log(`ALL TIME Settlements: ${settlementStats.total.count} (₹${settlementStats.total.amount.toFixed(2)})`);
    console.log(`CURRENT MONTH Settlements: ${settlementStats.currentMonth.count} (₹${settlementStats.currentMonth.amount.toFixed(2)})`);
    
    // 3. Compare and identify the issue
    console.log('\n3️⃣ COMPARISON ANALYSIS:');
    console.log(`Current Month Captured: ₹${paymentStats.captured.amount.toFixed(2)}`);
    console.log(`Current Month Settled: ₹${settlementStats.currentMonth.amount.toFixed(2)}`);
    console.log(`ALL TIME Settled: ₹${settlementStats.total.amount.toFixed(2)}`);
    
    const currentMonthDiff = settlementStats.currentMonth.amount - paymentStats.captured.amount;
    const allTimeDiff = settlementStats.total.amount - paymentStats.captured.amount;
    
    console.log(`\n🔍 DIFFERENCES:`);
    console.log(`Current Month Difference: ₹${currentMonthDiff.toFixed(2)}`);
    console.log(`All Time Difference: ₹${allTimeDiff.toFixed(2)}`);
    
    // 4. Identify the root cause
    console.log('\n4️⃣ ROOT CAUSE ANALYSIS:');
    
    if (allTimeDiff > 0) {
      console.log('🚨 ISSUE IDENTIFIED: The reports are mixing time periods!');
      console.log('\n💡 EXPLANATION:');
      console.log('• Captured Payments: Shows CURRENT MONTH only');
      console.log('• Settled Amount: Shows ALL TIME settlements');
      console.log('\nThis is why settled amount is higher than captured amount.');
      console.log('Settlements include money from previous months/years.');
      
      // Show recent settlements to prove this
      console.log('\n📋 RECENT SETTLEMENTS (showing dates):');
      const recentSettlements = allSettlements
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 10);
      
      recentSettlements.forEach((settlement, index) => {
        const date = new Date(settlement.created_at * 1000).toLocaleDateString();
        const amount = (settlement.amount / 100).toFixed(2);
        const isCurrentMonth = settlement.created_at >= currentMonthStart && settlement.created_at <= currentMonthEnd;
        const indicator = isCurrentMonth ? '📅 CURRENT MONTH' : '📆 OLDER';
        
        console.log(`${index + 1}. ${date} - ₹${amount} - ${indicator}`);
      });
      
    } else {
      console.log('✅ No issue found - amounts are consistent');
    }
    
    // 5. Show the fix
    console.log('\n5️⃣ SOLUTION:');
    console.log('The reports should either:');
    console.log('A) Show CURRENT MONTH data for both payments and settlements, OR');
    console.log('B) Show ALL TIME data for both payments and settlements');
    console.log('\nCurrently it\'s mixing: CURRENT MONTH payments vs ALL TIME settlements');
    
    console.log('\n✅ ANALYSIS COMPLETED');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

debugSettlementVsCapturedIssue();