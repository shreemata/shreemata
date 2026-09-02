// config/razorpay.js
const Razorpay = require("razorpay");

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "dummy_secret",
});

module.exports = rzp;
