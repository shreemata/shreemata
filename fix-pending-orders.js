// Script to manually process pending orders with successful payments
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGO_URI);

const Order = require('./models/Order');
const User = require('./models/User');
const { distributeCommissions } = require('./services/commissionDistribution');
const { awardPoints } = require('./services/pointsService');
const Book = require('./models/Book');
const Bundle = require('./models/Bundle');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secr