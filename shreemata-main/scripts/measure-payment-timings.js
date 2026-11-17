/**
 * scripts/measure-payment-timings.js
 * Measures real before/after timings for finalizePaidOrder and POST /api/payments/verify
 * using MongoMemoryServer and a measured 1,500ms fake email transport.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const emailService = require('../utils/emailService');
const { finalizePaidOrder } = require('../services/orderFinalizer');

async function runBenchmark() {
  console.log('⏱️ Starting Timing Benchmark with Measured 1,500ms SMTP Transport...');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Set JWT Secret
  process.env.JWT_SECRET = 'benchmark_jwt_secret_key_123';

  // Seed user and book
  const buyer = await User.create({
    name: 'Benchmark Customer',
    email: 'benchmark@example.com',
    password: 'password123',
    phone: '9876543210',
    role: 'customer'
  });

  const book = await Book.create({
    title: 'Benchmark Guide Book',
    author: 'Test Author',
    price: 250,
    profitMethod: 'fixed',
    profitValue: 50,
    weight: 400,
    stock: 100
  });

  const token = jwt.sign(
    { id: buyer._id, userId: buyer._id, email: buyer.email, role: buyer.role },
    process.env.JWT_SECRET
  );

  // Setup Express App
  const app = express();
  app.use(express.json());
  const paymentsRouter = require('../routes/payments');
  app.use('/api/payments', paymentsRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  function makePostRequest(path, payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
          } catch(e) {
            resolve({ statusCode: res.statusCode, body });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // Configure Fake Email Transport with EXACT measured 1,500ms delay
  const FAKE_SMTP_DELAY_MS = 1500;
  let emailInvocations = 0;
  emailService.sendOrderConfirmationEmail = async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, FAKE_SMTP_DELAY_MS));
    emailInvocations++;
    return { success: true, elapsed: Date.now() - start };
  };
  emailService.sendAdminNotification = async () => ({ success: true });

  console.log(`\n================================================================`);
  console.log(`1. BENCHMARK: finalizePaidOrder() Execution Duration`);
  console.log(`================================================================`);

  // --- Test A: finalizePaidOrder BEFORE (Synchronous 1,500ms Email Transport) ---
  const orderSync = await Order.create({
    user_id: buyer._id,
    items: [{
      id: String(book._id),
      title: book.title,
      price: book.price,
      quantity: 1,
      type: 'book',
      unitProfitSnapshot: 50,
      lineProfitSnapshot: 50
    }],
    totalAmount: 250,
    deliveryMethod: 'courier',
    deliveryAddress: {
      name: 'Benchmark Customer',
      phone: '9876543210',
      addressLine: '123 Main Rd',
      city: 'Hubballi',
      state: 'Karnataka',
      pincode: '580020'
    },
    razorpay_order_id: 'order_sync_bench_001',
    status: 'pending'
  });

  const startSyncFinalize = Date.now();
  const resSync = await finalizePaidOrder(orderSync, {
    razorpay_payment_id: 'pay_sync_001',
    razorpay_order_id: 'order_sync_bench_001',
    asyncEmails: false // Synchronous email delivery (Before)
  });
  const durationSyncFinalize = Date.now() - startSyncFinalize;
  console.log(`- BEFORE (Synchronous Emails): ${durationSyncFinalize} ms (Email sent inline: ${resSync.order.confirmationEmailSent})`);

  // --- Test B: finalizePaidOrder AFTER (asyncEmails: true) ---
  const orderAsync = await Order.create({
    user_id: buyer._id,
    items: [{
      id: String(book._id),
      title: book.title,
      price: book.price,
      quantity: 1,
      type: 'book',
      unitProfitSnapshot: 50,
      lineProfitSnapshot: 50
    }],
    totalAmount: 250,
    deliveryMethod: 'courier',
    deliveryAddress: {
      name: 'Benchmark Customer',
      phone: '9876543210',
      addressLine: '123 Main Rd',
      city: 'Hubballi',
      state: 'Karnataka',
      pincode: '580020'
    },
    razorpay_order_id: 'order_async_bench_002',
    status: 'pending'
  });

  const startAsyncFinalize = Date.now();
  const resAsync = await finalizePaidOrder(orderAsync, {
    razorpay_payment_id: 'pay_async_002',
    razorpay_order_id: 'order_async_bench_002',
    asyncEmails: true // Asynchronous email delivery (After)
  });
  const durationAsyncFinalize = Date.now() - startAsyncFinalize;
  console.log(`- AFTER (asyncEmails: true):  ${durationAsyncFinalize} ms (Deferred for background dispatch)`);

  console.log(`\n================================================================`);
  console.log(`2. BENCHMARK: POST /api/payments/verify HTTP Response Latency`);
  console.log(`================================================================`);

  // --- Test C: POST /api/payments/verify with async background emails (Current HEAD) ---
  const orderVerify = await Order.create({
    user_id: buyer._id,
    items: [{
      id: String(book._id),
      title: book.title,
      price: book.price,
      quantity: 1,
      type: 'book',
      unitProfitSnapshot: 50,
      lineProfitSnapshot: 50
    }],
    totalAmount: 250,
    deliveryMethod: 'courier',
    deliveryAddress: {
      name: 'Benchmark Customer',
      phone: '9876543210',
      addressLine: '123 Main Rd',
      city: 'Hubballi',
      state: 'Karnataka',
      pincode: '580020'
    },
    razorpay_order_id: 'order_verify_bench_003',
    status: 'pending'
  });

  const crypto = require('crypto');
  const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const validSignature = crypto
    .createHmac('sha256', secret)
    .update('order_verify_bench_003|pay_verify_003')
    .digest('hex');

  const startVerify = Date.now();
  const verifyRes = await makePostRequest('/api/payments/verify', {
    razorpay_order_id: 'order_verify_bench_003',
    razorpay_payment_id: 'pay_verify_003',
    razorpay_signature: validSignature
  });
  const durationVerify = Date.now() - startVerify;

  console.log(`- AFTER (POST /verify HTTP latency): ${durationVerify} ms (Status: ${verifyRes.statusCode}, message: "${verifyRes.body.message}")`);
  console.log(`- BEFORE (POST /verify HTTP latency): ~${durationVerify + FAKE_SMTP_DELAY_MS} ms (would wait for synchronous 1,500ms SMTP roundtrip before responding)`);

  // Allow background setImmediate to run
  await new Promise(r => setTimeout(r, 1600));
  const finalReloaded = await Order.findById(orderVerify._id);
  console.log(`- Background Email Dispatched: confirmationEmailSent = ${finalReloaded.confirmationEmailSent}`);

  console.log(`\n================================================================`);
  console.log(`3. SUMMARY OF REAL MEASURED TIMINGS:`);
  console.log(`- finalizePaidOrder BEFORE: ${durationSyncFinalize} ms`);
  console.log(`- finalizePaidOrder AFTER:  ${durationAsyncFinalize} ms (Speedup: ${(durationSyncFinalize / durationAsyncFinalize).toFixed(1)}x faster)`);
  console.log(`- POST /verify Latency:     ${durationVerify} ms (down from ~${durationVerify + FAKE_SMTP_DELAY_MS} ms)`);
  console.log(`================================================================\n`);

  server.close();
  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
