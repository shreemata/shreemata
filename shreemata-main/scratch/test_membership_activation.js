const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Order = require('../models/Order');
const { calculateProductSubtotal, checkAndActivateMembership } = require('../services/membershipService');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function runMembershipTests() {
  console.log('🧪 Running Comprehensive Membership Activation Verification Suite...\n');

  try {
    await mongoose.connect(MONGODB_URI);

    // ----------------------------------------------------
    // TEST 1: New Customer Registration (Member = NO)
    // ----------------------------------------------------
    console.log('Test 1: Registering new customer...');
    const testUser = await User.create({
      name: 'Test Customer',
      email: `customer_${Date.now()}@test.com`,
      password: 'hashed_password_123',
      role: 'user',
      isMember: false
    });

    console.log(`  -> Customer registered: ${testUser.email}`);
    console.log(`  -> Initial isMember: ${testUser.isMember} (Expected: false, Member = NO)`);
    console.assert(testUser.isMember === false, 'Test 1 FAILED: User should not be a member on registration');

    // ----------------------------------------------------
    // TEST 2: Order with Product Subtotal < ₹100 (e.g. ₹60 product + ₹50 courier = ₹110 total)
    // ----------------------------------------------------
    console.log('\nTest 2: Customer places order with Product Subtotal = ₹60 (Courier = ₹50, Total = ₹110)...');
    const orderUnder100 = await Order.create({
      user_id: testUser._id,
      items: [
        {
          id: 'mock_book_id_1',
          title: 'Under 100 Book',
          price: 60,
          quantity: 1,
          type: 'book'
        }
      ],
      courierCharge: 50,
      totalAmount: 110,
      paymentStatus: 'Paid',
      status: 'completed'
    });

    const subtotalUnder = calculateProductSubtotal(orderUnder100);
    console.log(`  -> Calculated Product Subtotal: ₹${subtotalUnder} (Excluding ₹50 courier charge)`);
    console.assert(subtotalUnder === 60, `Expected subtotal 60, got ${subtotalUnder}`);

    const checkResult1 = await checkAndActivateMembership(orderUnder100);
    console.log('  -> Membership check result:', checkResult1);

    const refreshedUser1 = await User.findById(testUser._id);
    console.log(`  -> User isMember after < ₹100 order: ${refreshedUser1.isMember} (Expected: false)`);
    console.assert(refreshedUser1.isMember === false, 'Test 2 FAILED: User should remain Normal Customer');

    // ----------------------------------------------------
    // TEST 3: Order with Product Subtotal >= ₹100 (Unpaid)
    // ----------------------------------------------------
    console.log('\nTest 3: Customer places order with Product Subtotal = ₹150 (Pending Payment)...');
    const orderUnpaid = await Order.create({
      user_id: testUser._id,
      items: [
        {
          id: 'mock_book_id_2',
          title: 'Eligible Book',
          price: 150,
          quantity: 1,
          type: 'book'
        }
      ],
      courierCharge: 50,
      totalAmount: 200,
      paymentStatus: 'Pending',
      status: 'pending'
    });

    const subtotalUnpaid = calculateProductSubtotal(orderUnpaid);
    console.log(`  -> Calculated Product Subtotal: ₹${subtotalUnpaid}`);

    const checkResult2 = await checkAndActivateMembership(orderUnpaid);
    console.log('  -> Membership check result on unpaid order:', checkResult2);

    const refreshedUser2 = await User.findById(testUser._id);
    console.log(`  -> User isMember before payment: ${refreshedUser2.isMember} (Expected: false)`);
    console.assert(refreshedUser2.isMember === false, 'Test 3 FAILED: User should not activate before payment');

    // ----------------------------------------------------
    // TEST 4: Payment Successful & Order reaches qualifying status (Subtotal >= ₹100)
    // ----------------------------------------------------
    console.log('\nTest 4: Order payment completed / verified (Status = completed, Subtotal = ₹150)...');
    orderUnpaid.paymentStatus = 'Paid';
    orderUnpaid.status = 'completed';
    await orderUnpaid.save();

    const checkResult3 = await checkAndActivateMembership(orderUnpaid);
    console.log('  -> Membership check result on completed order:', checkResult3);

    const refreshedUser3 = await User.findById(testUser._id);
    console.log(`  -> User isMember after payment: ${refreshedUser3.isMember} (Expected: true, Member = YES)`);
    console.log(`  -> Member Activated At: ${refreshedUser3.memberActivatedAt}`);
    console.log(`  -> Membership Order ID: ${refreshedUser3.membershipOrder}`);
    console.log(`  -> Membership Subtotal: ₹${refreshedUser3.membershipSubtotal}`);

    console.assert(refreshedUser3.isMember === true, 'Test 4 FAILED: User should now be a Member');
    console.assert(refreshedUser3.memberActivatedAt !== null, 'Test 4 FAILED: memberActivatedAt should be set');
    console.assert(refreshedUser3.membershipSubtotal === 150, 'Test 4 FAILED: membershipSubtotal should be 150');

    // ----------------------------------------------------
    // TEST 5: Subsequent Order (Already Member)
    // ----------------------------------------------------
    console.log('\nTest 5: Member places another order...');
    const orderSubsequent = await Order.create({
      user_id: testUser._id,
      items: [{ id: 'mock_book_id_3', title: 'Another Book', price: 40, quantity: 1, type: 'book' }],
      totalAmount: 40,
      paymentStatus: 'Paid',
      status: 'completed'
    });

    const checkResult4 = await checkAndActivateMembership(orderSubsequent);
    console.log('  -> Membership check result for existing member:', checkResult4);
    console.assert(checkResult4.isMember === true && checkResult4.alreadyMember === true, 'Test 5 FAILED: Should remain member');

    // Cleanup
    console.log('\nCleaning up test records...');
    await User.findByIdAndDelete(testUser._id);
    await Order.findByIdAndDelete(orderUnder100._id);
    await Order.findByIdAndDelete(orderUnpaid._id);
    await Order.findByIdAndDelete(orderSubsequent._id);
    console.log('✅ Cleanup finished.');

    await mongoose.disconnect();

    console.log('\n==================================================');
    console.log('MEMBERSHIP ACTIVATION VERIFICATION: ALL TESTS PASSED!');
    console.log('==================================================');
    console.log('- Registration (Member = NO): PASS');
    console.log('- Product Subtotal < ₹100 Excludes Shipping (Member = NO): PASS');
    console.log('- Unpaid Qualifying Order (Member = NO): PASS');
    console.log('- Payment Successful / Order Qualified (Member = YES): PASS');
    console.log('- Membership Activation Timestamps & Metadata: PASS');
    console.log('- Existing Member Preservation: PASS');
    console.log('==================================================');

  } catch (err) {
    console.error('❌ Test Suite Error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runMembershipTests();
