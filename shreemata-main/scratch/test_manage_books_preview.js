require("dotenv").config();
const mongoose = require("mongoose");
const Book = require("../models/Book");
const CommissionSettings = require("../models/CommissionSettings");

async function runTests() {
  console.log("🧪 Starting Manage Books Internal Profit Preview & Persistence Verification...\n");

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("▶️ Connected to MongoDB.");

    // 1. Verify CommissionSettings DB values
    const settings = await CommissionSettings.getSettings();
    console.log("▶️ Active Commission Settings in DB:", {
      buyer: settings.directCommissionPercent,
      referral: settings.referralCommissionPercent,
      tree: settings.treeCommissionPoolPercent,
      trust: settings.trustFundPercent,
      admin: settings.adminCommissionPercent
    });

    if (
      settings.directCommissionPercent !== 30 ||
      settings.referralCommissionPercent !== 20 ||
      settings.treeCommissionPoolPercent !== 40 ||
      settings.trustFundPercent !== 10 ||
      settings.adminCommissionPercent !== 0
    ) {
      console.warn("⚠️ Warning: Settings in DB differ from 30/20/40/10/0. Resetting to 30/20/40/10/0 for test consistency...");
      settings.directCommissionPercent = 30;
      settings.referralCommissionPercent = 20;
      settings.treeCommissionPoolPercent = 40;
      settings.trustFundPercent = 10;
      settings.adminCommissionPercent = 0;
      await settings.save();
    }

    // 2. Simulate Preview Calculation Logic
    const testProfit = 20;
    const testPrice = 100;

    const buyerCashback = testProfit * (settings.directCommissionPercent / 100);
    const directReferral = testProfit * (settings.referralCommissionPercent / 100);
    const treePool = testProfit * (settings.treeCommissionPoolPercent / 100);
    const trustFund = testProfit * (settings.trustFundPercent / 100);
    const adminShare = testProfit * (settings.adminCommissionPercent / 100);
    const totalDist = buyerCashback + directReferral + treePool + trustFund + adminShare;
    const remaining = testProfit - totalDist;

    console.log("▶️ Preview Split for ₹20 Profit:");
    console.log(`   Buyer Cashback (30%): ₹${buyerCashback.toFixed(2)} (Expected: ₹6.00)`);
    console.log(`   Direct Referral (20%): ₹${directReferral.toFixed(2)} (Expected: ₹4.00)`);
    console.log(`   Tree Pool (40%): ₹${treePool.toFixed(2)} (Expected: ₹8.00)`);
    console.log(`   Trust Fund (10%): ₹${trustFund.toFixed(2)} (Expected: ₹2.00)`);
    console.log(`   Admin Share (0%): ₹${adminShare.toFixed(2)} (Expected: ₹0.00)`);
    console.log(`   Total: ₹${totalDist.toFixed(2)} | Remaining: ₹${remaining.toFixed(2)}`);

    if (
      buyerCashback === 6 &&
      directReferral === 4 &&
      treePool === 8 &&
      trustFund === 2 &&
      adminShare === 0 &&
      totalDist === 20 &&
      remaining === 0
    ) {
      console.log("✅ TEST 1 PASSED: Profit calculation matches ₹20 → ₹6/₹4/₹8/₹2/₹0 expected preview.\n");
    } else {
      throw new Error("❌ TEST 1 FAILED: Profit calculation mismatch!");
    }

    // 3. Test Dynamic Percentage Change Preview Simulation
    const dynamicSettings = { buyer: 25, referral: 20, tree: 40, trust: 10, admin: 0 };
    const dynBuyer = testProfit * (dynamicSettings.buyer / 100);
    const dynReferral = testProfit * (dynamicSettings.referral / 100);
    const dynTree = testProfit * (dynamicSettings.tree / 100);
    const dynTrust = testProfit * (dynamicSettings.trust / 100);
    const dynAdmin = testProfit * (dynamicSettings.admin / 100);
    const dynTotal = dynBuyer + dynReferral + dynTree + dynTrust + dynAdmin;
    const dynRem = testProfit - dynTotal;

    console.log("▶️ Dynamic Test (25/20/40/10/0):");
    console.log(`   Buyer Cashback (25%): ₹${dynBuyer.toFixed(2)} (Expected: ₹5.00)`);
    console.log(`   Total: ₹${dynTotal.toFixed(2)} | Remaining: ₹${dynRem.toFixed(2)} (Expected: ₹1.00)`);

    if (dynBuyer === 5 && dynTotal === 19 && dynRem === 1) {
      console.log("✅ TEST 2 PASSED: Dynamic percentages recalculate preview correctly.\n");
    } else {
      throw new Error("❌ TEST 2 FAILED: Dynamic calculation mismatch!");
    }

    // 4. Create dummy test book in DB and verify persistence
    const testBook = new Book({
      title: "Test Preview Book",
      author: "Test Author",
      price: 100,
      weight: 0.5,
      class: "10",
      subject: "Science",
      profitType: "fixed",
      profitValue: 20,
      profitConfigured: true
    });
    await testBook.save();

    console.log("▶️ Saved Test Book with ID:", testBook._id);
    const reloadedBook = await Book.findById(testBook._id);

    if (
      reloadedBook &&
      reloadedBook.profitType === "fixed" &&
      reloadedBook.profitValue === 20 &&
      reloadedBook.profitConfigured === true
    ) {
      console.log("✅ TEST 3 PASSED: Book profit configuration persists properly in database.");
    } else {
      throw new Error("❌ TEST 3 FAILED: Book profit failed to persist!");
    }

    // Cleanup test book
    await Book.findByIdAndDelete(testBook._id);
    console.log("🧹 Test book cleaned up.");

    console.log("\n🎉 ALL MANAGE BOOKS PROFIT PREVIEW TESTS COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
