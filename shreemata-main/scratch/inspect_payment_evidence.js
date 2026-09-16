require("dotenv").config();
const connectDB = require("../config/mongo");
const User = require("../models/User");
const Order = require("../models/Order");

async function checkOrders() {
  await connectDB();
  const orderIds = [
    "6aa3b923abed6257712246c4",
    "6aa92540ca15d85adb167936",
    "6aa9488bca15d85adb167ee1",
    "6aa94d3bca15d85adb168135",
    "6aa94f4dca15d85adb1681e4",
    "6aa952e3ca15d85adb1682b0"
  ];

  for (let i = 0; i < orderIds.length; i++) {
    const o = await Order.findById(orderIds[i]).populate('user_id', 'name email');
    console.log(`\n--- Order #${i + 1}: ${o._id} ---`);
    console.log(`Buyer: ${o.user_id?.name} (${o.user_id?.email})`);
    console.log(`Order Status: ${o.status}`);
    console.log(`Payment Type: ${o.paymentType}`);
    console.log(`Razorpay Order ID: ${o.razorpay_order_id || 'N/A'}`);
    console.log(`Razorpay Payment ID: ${o.razorpay_payment_id || 'N/A'}`);
    console.log(`Payment Details Subdoc:`, JSON.stringify(o.paymentDetails));
  }

  process.exit(0);
}

checkOrders();
