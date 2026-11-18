/** @jest-environment node */
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => {
    return {
      orders: {
        create: jest.fn().mockImplementation(async (opts) => ({
          id: `order_mock_${Date.now()}`,
          amount: opts.amount,
          currency: opts.currency || 'INR'
        }))
      }
    };
  });
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const Razorpay = require('razorpay');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const CommissionSettings = require('../models/CommissionSettings');
const { Invoice } = require('../routes/invoices');
const { finalizePaidOrder, dispatchOrderEmails } = require('../services/orderFinalizer');
const { validateCourierAddress } = require('../utils/deliveryAddressValidator');
const emailService = require('../utils/emailService');

let mongoServer;
let app;
let server;
let baseUrl;
let testBuyer;
let testBook;
let digitalBook;
let legacyDigitalBook;
let outOfStockBook;
let testNote;
let buyerToken;

const JWT_SECRET = 'test_jwt_secret_courier_fast_popup_2026';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'test_rzp_key_secret_for_tests';
  process.env.PORT = '0';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/orders', require('../routes/orders'));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  await CommissionSettings.create({
    directReferralBonus: 10,
    selfCashback: 5,
    treeCommissionPercentage: 20
  });

  testBuyer = await User.create({
    name: 'Courier Customer',
    email: 'courier.customer@example.com',
    phone: '9876543210',
    role: 'customer',
    address: {
      name: 'Courier Customer',
      street: '123 Saved Street',
      homeAddress1: '123 Saved Street',
      city: 'Hubballi',
      taluk: 'Hubballi',
      district: 'Dharwad',
      state: 'Karnataka',
      pincode: '580020',
      phone: '9876543210'
    }
  });

  testBook = await Book.create({
    title: 'Courier Test Book',
    author: 'Author Name',
    price: 150,
    originalPrice: 200,
    stockQuantity: 100,
    weight: 0.5,
    profitMethod: 'fixed',
    bookProfit: 30,
    isDigital: false
  });

  digitalBook = await Book.create({
    title: 'Digital E-Book Only',
    author: 'Digital Author',
    price: 120,
    originalPrice: 150,
    stockQuantity: 999,
    weight: 0,
    profitMethod: 'fixed',
    bookProfit: 25,
    isDigital: true
  });

  legacyDigitalBook = await Book.create({
    title: 'Legacy Digital Book (Old Schema Field)',
    author: 'Old Schema Author',
    price: 99,
    originalPrice: 120,
    stockQuantity: 999,
    weight: 0,
    profitMethod: 'fixed',
    bookProfit: 20,
    pdfUrl: 'https://storage.googleapis.com/shreemata-books/legacy.pdf',
    isDigitalAvailable: true
    // isDigital is NOT set (defaults to false in schema)
  });

  outOfStockBook = await Book.create({
    title: 'Out of Stock Physical Book',
    author: 'Stock Test Author',
    price: 150,
    originalPrice: 200,
    stockQuantity: 0,
    stockStatus: 'out_of_stock',
    trackStock: true,
    weight: 0.5,
    profitMethod: 'fixed',
    bookProfit: 30,
    isDigital: false
  });

  const Note = mongoose.models.Note || require('../models/Note');
  testNote = await Note.create({
    title: 'Class 10 Mathematics Revision Notes',
    section: 'notes',
    subject: 'Mathematics',
    classLevel: '10',
    pdfUrl: 'private/notes/test-math-note.pdf',
    price: 49
  });

  buyerToken = jwt.sign(
    { id: testBuyer._id, userId: testBuyer._id, email: testBuyer.email, role: testBuyer.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Part (A): Courier Delivery Address Validation & Storage', () => {
  test('validateCourierAddress helper flags missing required fields', () => {
    const invalidAddr = {
      name: '',
      phone: '',
      addressLine: '',
      city: '',
      state: '',
      pincode: ''
    };
    const res = validateCourierAddress(invalidAddr, null);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('name');
    expect(res.missingFields).toContain('phone');
    expect(res.missingFields).toContain('addressLine');
    expect(res.missingFields).toContain('city');
    expect(res.missingFields).toContain('state');
    expect(res.missingFields).toContain('pincode');
  });

  test('validateCourierAddress accepts valid address and sanitizes 10-digit phone and 6-digit pin', () => {
    const validAddr = {
      name: '  Suresh Kumar  ',
      phone: '  9887766554  ',
      addressLine: 'Door 42, Green Avenue',
      city: 'Hubballi',
      state: 'Karnataka',
      pincode: '580020'
    };
    const res = validateCourierAddress(validAddr, null);
    expect(res.isValid).toBe(true);
    expect(res.sanitizedAddress.name).toBe('Suresh Kumar');
    expect(res.sanitizedAddress.phone).toBe('9887766554');
    expect(res.sanitizedAddress.pincode).toBe('580020');
    expect(res.sanitizedAddress.city).toBe('Hubballi');
  });

  test('POST /api/payments/create-order: rejects courier order without delivery address (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toBeDefined();
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/payments/create-order: rejects request marking physical book as isDigital:true with courier and no address (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book',
            isDigital: true // Client attempts to forge digital flag to bypass address requirement
          }],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/payments/create-order: allows truly digital-only book order without delivery address', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 120,
        items: [{
          id: String(digitalBook._id),
          title: digitalBook.title,
          author: digitalBook.author,
          price: digitalBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'courier', // even if client selected courier
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();
    expect(res.data.order.id).toBeDefined();

    // Verify in DB that deliveryMethod resolved to 'digital' and address is null
    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.deliveryMethod).toBe('digital');
    expect(savedOrder.toObject().deliveryAddress).toBeNull();
  });

  test('POST /api/payments/create-order: an existing digital product with only legacy fields (no isDigital) is address-free', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 99,
        items: [{
          id: String(legacyDigitalBook._id),
          title: legacyDigitalBook.title,
          author: legacyDigitalBook.author,
          price: legacyDigitalBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'courier',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();
    expect(res.data.order.id).toBeDefined();

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.deliveryMethod).toBe('digital');
    expect(savedOrder.toObject().deliveryAddress).toBeNull();
  });

  test('POST /api/payments/create-order: a mixed cart (one physical book + one digital book) requires delivery address (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 270,
          items: [
            {
              id: String(testBook._id),
              title: testBook.title,
              author: testBook.author,
              price: testBook.price,
              quantity: 1,
              type: 'book'
            },
            {
              id: String(digitalBook._id),
              title: digitalBook.title,
              author: digitalBook.author,
              price: digitalBook.price,
              quantity: 1,
              type: 'book'
            }
          ],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/payments/create-order: rejects courier order with invalid phone format (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: {
            name: 'Recipient Name',
            phone: '12345', // invalid: only 5 digits
            addressLine: 'MG Road 12',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001'
          }
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/phone/i);
    }
  });

  test('POST /api/payments/create-order: rejects courier order with invalid pincode format (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            author: testBook.author,
            price: testBook.price,
            quantity: 1,
            type: 'book'
          }],
          deliveryMethod: 'courier',
          deliveryAddress: {
            name: 'Recipient Name',
            phone: '9876543210',
            addressLine: 'MG Road 12',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '5600' // invalid: only 4 digits
          }
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/pincode/i);
    }
  });

  test('POST /api/payments/create-order: allows store pickup without delivery address', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 150,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          author: testBook.author,
          price: testBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'pickup',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();
    expect(res.data.order.id).toBeDefined();
  });

  test('POST /api/payments/create-order: stores full entered courier delivery address on order', async () => {
    const customAddr = {
      name: 'Custom Consignee',
      phone: '9123456789',
      addressLine: 'Suite 101, Tech Park',
      homeAddress1: 'Suite 101, Tech Park',
      city: 'Dharwad',
      taluk: 'Dharwad',
      state: 'Karnataka',
      pincode: '580001'
    };

    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 180,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          author: testBook.author,
          price: testBook.price,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'courier',
        deliveryAddress: customAddr,
        courierCharge: 30
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    const rzpOrderId = res.data.order.id;

    // Check order in database
    const savedOrder = await Order.findOne({ razorpay_order_id: rzpOrderId });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.deliveryMethod).toBe('courier');
    expect(savedOrder.deliveryAddress.name).toBe('Custom Consignee');
    expect(savedOrder.deliveryAddress.phone).toBe('9123456789');
    expect(savedOrder.deliveryAddress.city).toBe('Dharwad');
    expect(savedOrder.deliveryAddress.pincode).toBe('580001');
  });

  test('POST /api/orders: rejects courier without address and allows pickup without address', async () => {
    // 1. Courier without address -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders`,
        {
          items: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
          totalAmount: 180,
          deliveryMethod: 'courier'
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Courier with forged isDigital -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders`,
        {
          items: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book', isDigital: true }],
          totalAmount: 180,
          deliveryMethod: 'courier'
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 3. Truly digital book without address -> 201/200, deliveryMethod: 'digital'
    const digitalRes = await axios.post(
      `${baseUrl}/api/orders`,
      {
        items: [{ id: String(digitalBook._id), title: digitalBook.title, price: 120, quantity: 1, type: 'book' }],
        totalAmount: 120,
        deliveryMethod: 'courier'
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect([200, 201]).toContain(digitalRes.status);
    expect(digitalRes.data.order).toBeDefined();
    expect(digitalRes.data.order.deliveryMethod).toBe('digital');

    // 4. Pickup without address -> 201/200
    const pickupRes = await axios.post(
      `${baseUrl}/api/orders`,
      {
        items: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
        totalAmount: 150,
        deliveryMethod: 'pickup'
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect([200, 201]).toContain(pickupRes.status);
    expect(pickupRes.data.order).toBeDefined();
    expect(pickupRes.data.order.deliveryMethod).toBe('pickup');
  });

  test('POST /api/orders/create-pending: rejects courier without address, rejects forged isDigital, allows digital & pickup', async () => {
    // 1. Courier without address -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-pending`,
        {
          bookId: String(testBook._id),
          quantity: 1,
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          basePrice: 150,
          courierCharge: 30,
          totalAmount: 180
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Forged isDigital on physical book -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-pending`,
        {
          bookId: String(testBook._id),
          quantity: 1,
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          basePrice: 150,
          courierCharge: 30,
          totalAmount: 180,
          isDigital: true
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 3. Truly digital book -> 200, deliveryMethod: 'digital'
    const digitalRes = await axios.post(
      `${baseUrl}/api/orders/create-pending`,
      {
        bookId: String(digitalBook._id),
        quantity: 1,
        paymentType: 'cheque',
        deliveryMethod: 'courier',
        basePrice: 120,
        courierCharge: 0,
        totalAmount: 120
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(digitalRes.status).toBe(200);
    expect(digitalRes.data.orderId).toBeDefined();
    const digitalSaved = await Order.findById(digitalRes.data.orderId);
    expect(digitalSaved.deliveryMethod).toBe('digital');

    // 4. Pickup without address -> 200, deliveryMethod: 'pickup'
    const pickupRes = await axios.post(
      `${baseUrl}/api/orders/create-pending`,
      {
        bookId: String(testBook._id),
        quantity: 1,
        paymentType: 'cheque',
        deliveryMethod: 'pickup',
        basePrice: 150,
        courierCharge: 0,
        totalAmount: 150
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(pickupRes.status).toBe(200);
    expect(pickupRes.data.orderId).toBeDefined();
    const pickupSaved = await Order.findById(pickupRes.data.orderId);
    expect(pickupSaved.deliveryMethod).toBe('pickup');
  });

  test('POST /api/orders/create-cart-pending: rejects courier without address, rejects forged isDigital, allows digital & pickup', async () => {
    // 1. Courier without address -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-cart-pending`,
        {
          cartItems: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          itemsTotal: 150,
          courierCharge: 30,
          totalAmount: 180,
          totalWeight: 0.5
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Forged isDigital on physical book -> 400
    try {
      await axios.post(
        `${baseUrl}/api/orders/create-cart-pending`,
        {
          cartItems: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book', isDigital: true }],
          paymentType: 'cheque',
          deliveryMethod: 'courier',
          itemsTotal: 150,
          courierCharge: 30,
          totalAmount: 180,
          totalWeight: 0.5
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 3. Truly digital book -> 200, deliveryMethod: 'digital'
    const digitalRes = await axios.post(
      `${baseUrl}/api/orders/create-cart-pending`,
      {
        cartItems: [{ id: String(digitalBook._id), title: digitalBook.title, price: 120, quantity: 1, type: 'book' }],
        paymentType: 'cheque',
        deliveryMethod: 'courier',
        itemsTotal: 120,
        courierCharge: 0,
        totalAmount: 120,
        totalWeight: 0
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(digitalRes.status).toBe(200);
    expect(digitalRes.data.orderId).toBeDefined();
    const digitalSaved = await Order.findById(digitalRes.data.orderId);
    expect(digitalSaved.deliveryMethod).toBe('digital');

    // 4. Pickup without address -> 200
    const pickupRes = await axios.post(
      `${baseUrl}/api/orders/create-cart-pending`,
      {
        cartItems: [{ id: String(testBook._id), title: testBook.title, price: 150, quantity: 1, type: 'book' }],
        paymentType: 'cheque',
        deliveryMethod: 'pickup',
        itemsTotal: 150,
        courierCharge: 0,
        totalAmount: 150,
        totalWeight: 0.5
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(pickupRes.status).toBe(200);
    expect(pickupRes.data.orderId).toBeDefined();
  });

  test('Invoice generation uses deliveryAddress for Consignee block', async () => {
    const orderWithAddr = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 180,
      deliveryMethod: 'courier',
      deliveryAddress: {
        name: 'Invoice Recipient',
        addressLine: 'House #7, Station Road',
        homeAddress1: 'House #7, Station Road',
        city: 'Belagavi',
        taluk: 'Belagavi',
        district: 'Belagavi',
        state: 'Karnataka',
        pincode: '590001',
        phone: '9845098450'
      },
      razorpay_order_id: 'order_invoice_test_1',
      paymentStatus: 'completed',
      finalizationStatus: 'completed'
    });

    const { autoGenerateInvoiceForOrder } = require('../routes/invoices');
    const invoice = await autoGenerateInvoiceForOrder(orderWithAddr);

    expect(invoice).toBeDefined();
    expect(invoice.customerName).toBe('Invoice Recipient');
    expect(invoice.phoneNumber).toBe('9845098450');
    expect(invoice.shippingPhone).toBe('9845098450');
    expect(invoice.shippingAddress).toMatch(/House #7/);
    expect(invoice.shippingAddress).toMatch(/Belagavi/);
    expect(invoice.shippingAddress).toMatch(/590001/);
  });

  // --- Delivery Method Matrix & Fallback Tests ---
  test('POST /api/payments/create-order: allows digital-only order without address or deliveryMethod', async () => {
    const res = await axios.post(`${baseUrl}/api/payments/create-order`, {
      amount: 120,
      items: [{
        id: String(digitalBook._id),
        title: digitalBook.title,
        price: 120,
        quantity: 1,
        type: 'book'
      }]
      // deliveryMethod omitted, deliveryAddress omitted
    }, {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.dbOrder).toBeDefined();
    expect(res.data.dbOrder.deliveryMethod).toBe('digital');
    expect(res.data.dbOrder.deliveryAddress).toBeNull();
  });

  test('POST /api/payments/create-order: requires address for deliveryMethod "home"', async () => {
    // Missing address -> 400
    try {
      await axios.post(`${baseUrl}/api/payments/create-order`, {
        amount: 150,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          price: 150,
          quantity: 1,
          type: 'book'
        }],
        deliveryMethod: 'home',
        deliveryAddress: null
      }, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // Valid address -> 200
    const successRes = await axios.post(`${baseUrl}/api/payments/create-order`, {
      amount: 150,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book'
      }],
      deliveryMethod: 'home',
      deliveryAddress: {
        name: 'Home Customer',
        phone: '9876543210',
        homeAddress1: '456 Home St',
        city: 'Dharwad',
        state: 'Karnataka',
        pincode: '580001'
      }
    }, {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    expect(successRes.status).toBe(200);
    expect(successRes.data.dbOrder.deliveryMethod).toBe('home');
  });

  test('POST /api/payments/create-order: unknown deliveryMethod safely requires address if order contains physical items', async () => {
    // Physical item + unknown deliveryMethod + missing address -> 400
    try {
      await axios.post(`${baseUrl}/api/payments/create-order`, {
        amount: 150,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          price: 150,
          quantity: 1,
          type: 'book' // physical item
        }],
        deliveryMethod: 'unknown_drone_delivery',
        deliveryAddress: null
      }, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // Digital item + unknown deliveryMethod -> allowed (200, deliveryMethod set to 'digital')
    const digiRes = await axios.post(`${baseUrl}/api/payments/create-order`, {
      amount: 120,
      items: [{
        id: String(digitalBook._id),
        title: digitalBook.title,
        price: 120,
        quantity: 1,
        type: 'book'
      }],
      deliveryMethod: 'unknown_drone_delivery',
      deliveryAddress: null
    }, {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    expect(digiRes.status).toBe(200);
    expect(digiRes.data.dbOrder.deliveryMethod).toBe('digital');
  });

  // --- Cancel Route Guard & Race Condition Protection ---
  test('POST /api/payments/cancel: cancels pending unpaid orders, but CANNOT cancel paid/completed orders', async () => {
    // 1. Create a pending order
    const pendingOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book'
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      status: 'pending',
      razorpay_order_id: 'rzp_cancel_test_pending_01'
    });

    // Cancel while pending -> 200 OK
    const cancelRes = await axios.post(`${baseUrl}/api/payments/cancel`, {
      razorpay_order_id: 'rzp_cancel_test_pending_01'
    }, {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.data.message).toBe('Order cancelled successfully');

    const cancelledOrder = await Order.findById(pendingOrder._id);
    expect(cancelledOrder.status).toBe('cancelled');

    // 2. Create an order that is already paid/completed (simulating payment succeeded before dismiss arrived)
    const paidOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book'
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      status: 'completed',
      paymentStatus: 'completed',
      finalizationStatus: 'completed',
      finalizedAt: new Date(),
      razorpay_order_id: 'rzp_cancel_test_paid_02'
    });

    // Attempting to cancel paid order -> 404 / cannot cancel
    try {
      await axios.post(`${baseUrl}/api/payments/cancel`, {
        razorpay_order_id: 'rzp_cancel_test_paid_02'
      }, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(404);
      expect(err.response.data.error).toMatch(/cannot be cancelled/i);
    }

    // Verify paid order was NOT corrupted
    const untouchedPaidOrder = await Order.findById(paidOrder._id);
    expect(untouchedPaidOrder.status).toBe('completed');
    expect(untouchedPaidOrder.paymentStatus).toBe('completed');
  });

  test('POST /api/payments/create-order: (a) physical book sent with type: "pdf" or "notes" and courier without address is rejected (400)', async () => {
    // 1. Sent with type: 'pdf'
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            price: testBook.price,
            quantity: 1,
            type: 'pdf',
            isDigital: true
          }],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }

    // 2. Sent with type: 'notes'
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(testBook._id),
            title: testBook.title,
            price: testBook.price,
            quantity: 1,
            type: 'notes',
            isDigital: true
          }],
          deliveryMethod: 'courier',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.requiresAddressSetup).toBe(true);
    }
  });

  test('POST /api/payments/create-order: (b) out-of-stock physical book sent with type: "pdf" is still rejected for stock (400)', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 150,
          items: [{
            id: String(outOfStockBook._id),
            title: outOfStockBook.title,
            price: outOfStockBook.price,
            quantity: 1,
            type: 'pdf',
            isDigital: true
          }],
          deliveryMethod: 'pickup',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/stock/i);
    }
  });

  test('POST /api/payments/create-order: (c) saved order item for physical book has isDigital: false even if request says digital and type pdf', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 150,
        items: [{
          id: String(testBook._id),
          title: testBook.title,
          price: testBook.price,
          quantity: 1,
          type: 'pdf',
          isDigital: true
        }],
        deliveryMethod: 'pickup',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.items[0].isDigital).toBe(false);
    expect(savedOrder.items[0].type).toBe('book');
  });

  test('POST /api/payments/create-order: (d) inventory is reduced for physical items on payment finalization', async () => {
    const stockTestBook = await Book.create({
      title: 'Inventory Reduction Book',
      author: 'Inventory Author',
      price: 100,
      originalPrice: 100,
      stockQuantity: 20,
      stockStatus: 'in_stock',
      trackStock: true,
      weight: 0.5,
      profitMethod: 'fixed',
      bookProfit: 20,
      isDigital: false
    });

    const createRes = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 200,
        items: [{
          id: String(stockTestBook._id),
          title: stockTestBook.title,
          price: 100,
          quantity: 2,
          type: 'book'
        }],
        deliveryMethod: 'pickup',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(createRes.status).toBe(200);

    const rzpOrderId = createRes.data.order.id;
    const dbOrder = await Order.findOne({ razorpay_order_id: rzpOrderId });

    // Finalize order
    const { finalizePaidOrder } = require('../services/orderFinalizer');
    await finalizePaidOrder(dbOrder, {
      razorpay_payment_id: 'pay_stock_test_123',
      razorpay_order_id: rzpOrderId,
      asyncEmails: true
    });

    // Check inventory
    const updatedBook = await Book.findById(stockTestBook._id);
    expect(updatedBook.stockQuantity).toBe(18); // 20 - 2 = 18

    // Idempotent finalization retry check
    await finalizePaidOrder(dbOrder, {
      razorpay_payment_id: 'pay_stock_test_123',
      razorpay_order_id: rzpOrderId,
      asyncEmails: true
    });
    const bookAfterRetry = await Book.findById(stockTestBook._id);
    expect(bookAfterRetry.stockQuantity).toBe(18);
  });

  test('POST /api/payments/create-order: (e) a real Note record (digital) in a cart is accepted without an address', async () => {
    const res = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      {
        amount: 49,
        items: [{
          id: String(testNote._id),
          title: testNote.title,
          price: 49,
          quantity: 1,
          type: 'notes'
        }],
        deliveryMethod: 'courier',
        deliveryAddress: null
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.order).toBeDefined();

    const savedOrder = await Order.findOne({ razorpay_order_id: res.data.order.id });
    expect(savedOrder.deliveryMethod).toBe('digital');
    expect(savedOrder.items[0].isDigital).toBe(true);
    expect(savedOrder.items[0].type).toBe('note');
  });

  test('POST /api/payments/create-order: (f) an unknown item id is rejected with 400', async () => {
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        {
          amount: 99,
          items: [{
            id: '600000000000000000000777',
            title: 'Nonexistent Phantom Item',
            price: 99,
            quantity: 1,
            type: 'pdf'
          }],
          deliveryMethod: 'pickup',
          deliveryAddress: null
        },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toMatch(/item not found/i);
    }
  });

  test('Variable scope check: no implicit global variables leaked to global object', () => {
    expect(typeof global.isItemDigital).toBe('undefined');
    expect(typeof global.isDigitalItem).toBe('undefined');
  });
});

describe('Part (B): Fast Verification, Asynchronous Emails & Timing', () => {
  test('Fast execution: finalizePaidOrder with asyncEmails: true finishes in < 150ms without waiting for email transport', async () => {
    const fastOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_fast_timing_1'
    });

    const t0 = performance.now();
    const finalResult = await finalizePaidOrder(fastOrder._id, {
      razorpay_payment_id: 'pay_fast_timing_1',
      razorpay_order_id: 'order_fast_timing_1',
      asyncEmails: true
    });
    const t1 = performance.now();

    const elapsedMs = t1 - t0;
    console.log(`⏱️ Fast finalizePaidOrder execution time: ${elapsedMs.toFixed(2)} ms`);

    expect(finalResult.success).toBe(true);
    expect(finalResult.order.finalizationStatus).toBe('completed');
    expect(elapsedMs).toBeLessThan(500); // typically < 50ms in memory
  });

  test('Email retry safety: send fails then retry sends exactly once', async () => {
    const retryOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_email_retry_flow_test',
      confirmationEmailSent: false
    });

    let sendAttempts = 0;
    let successfulSends = 0;
    const originalSendConfirm = emailService.sendOrderConfirmationEmail;
    const originalSendAdmin = emailService.sendAdminNotification;

    // First attempt will fail with SMTP timeout
    emailService.sendOrderConfirmationEmail = jest.fn().mockImplementation(async () => {
      sendAttempts++;
      if (sendAttempts === 1) {
        throw new Error('SMTP Timeout');
      }
      successfulSends++;
      return { success: true };
    });
    emailService.sendAdminNotification = jest.fn().mockResolvedValue(true);

    try {
      // 1. First dispatch attempt fails
      const res1 = await dispatchOrderEmails(retryOrder._id);
      expect(res1).toBe(false);

      // Verify DB: confirmationEmailSent must NOT be set to true before success!
      const failedState = await Order.findById(retryOrder._id);
      expect(failedState.confirmationEmailSent).toBe(false);
      expect(failedState.emailDispatchError).toBe('SMTP Timeout');
      expect(failedState.emailDispatchClaimedAt).toBeNull(); // Claim must be released for immediate retry

      // 2. Second dispatch attempt (retry) succeeds
      const res2 = await dispatchOrderEmails(retryOrder._id);
      expect(res2).toBe(true);

      const successState = await Order.findById(retryOrder._id);
      expect(successState.confirmationEmailSent).toBe(true);
      expect(successState.emailSentAt).toBeDefined();
      expect(successState.emailDispatchError).toBeNull();

      // 3. Third dispatch attempt is rejected as already sent
      const res3 = await dispatchOrderEmails(retryOrder._id);
      expect(res3).toBe(false);

      expect(successfulSends).toBe(1);
    } finally {
      emailService.sendOrderConfirmationEmail = originalSendConfirm;
      emailService.sendAdminNotification = originalSendAdmin;
    }
  });

  test('Two concurrent dispatches send exactly once', async () => {
    const emailOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      razorpay_order_id: 'order_email_concurrent_test',
      confirmationEmailSent: false
    });

    let sendCount = 0;
    const originalSendConfirm = emailService.sendOrderConfirmationEmail;
    const originalSendAdmin = emailService.sendAdminNotification;

    emailService.sendOrderConfirmationEmail = jest.fn().mockImplementation(async () => {
      // Simulate small transport delay so concurrent calls overlap
      await new Promise(r => setTimeout(r, 20));
      sendCount++;
    });
    emailService.sendAdminNotification = jest.fn().mockResolvedValue(true);

    try {
      // Run two concurrent dispatch attempts
      const [res1, res2] = await Promise.all([
        dispatchOrderEmails(emailOrder._id),
        dispatchOrderEmails(emailOrder._id)
      ]);

      // Exactly ONE succeeds (true), the other is rejected as duplicate (false)
      expect([res1, res2].filter(r => r === true).length).toBe(1);
      expect([res1, res2].filter(r => r === false).length).toBe(1);
      expect(sendCount).toBe(1);

      const updated = await Order.findById(emailOrder._id);
      expect(updated.confirmationEmailSent).toBe(true);
      expect(updated.emailSentAt).toBeDefined();
    } finally {
      emailService.sendOrderConfirmationEmail = originalSendConfirm;
      emailService.sendAdminNotification = originalSendAdmin;
    }
  });

  test('Process-restart simulation: missing email is picked up by next finalize/reconcile call', async () => {
    // Simulate order finalized with asyncEmails: true, but server restarted before setImmediate could run
    const restartedOrder = await Order.create({
      user_id: testBuyer._id,
      items: [{
        id: String(testBook._id),
        title: testBook.title,
        price: 150,
        quantity: 1,
        type: 'book',
        unitProfitSnapshot: 30,
        lineProfitSnapshot: 30
      }],
      totalAmount: 150,
      deliveryMethod: 'pickup',
      status: 'completed',
      paymentStatus: 'completed',
      finalizationStatus: 'completed',
      finalizedAt: new Date(),
      confirmationEmailSent: false, // Never sent due to restart
      razorpay_order_id: 'order_process_restart_sim'
    });

    let sent = false;
    const originalSendConfirm = emailService.sendOrderConfirmationEmail;
    const originalSendAdmin = emailService.sendAdminNotification;

    emailService.sendOrderConfirmationEmail = jest.fn().mockImplementation(async () => {
      sent = true;
    });
    emailService.sendAdminNotification = jest.fn().mockResolvedValue(true);

    try {
      // Next finalize/reconcile call (e.g. from admin reconcile or webhook retry)
      const reconcileResult = await finalizePaidOrder(restartedOrder._id, {
        razorpay_order_id: 'order_process_restart_sim',
        razorpay_payment_id: 'pay_sim_01',
        asyncEmails: false // default reconcile behaviour
      });

      // Both handleReconcileRazorpay and webhook check for missing email on completed orders
      if (!reconcileResult.order?.confirmationEmailSent) {
        await dispatchOrderEmails(restartedOrder._id);
      }

      expect(reconcileResult.success).toBe(true);
      expect(reconcileResult.alreadyProcessed).toBe(true);
      expect(sent).toBe(true);

      const verified = await Order.findById(restartedOrder._id);
      expect(verified.confirmationEmailSent).toBe(true);
      expect(verified.emailSentAt).toBeDefined();
    } finally {
      emailService.sendOrderConfirmationEmail = originalSendConfirm;
      emailService.sendAdminNotification = originalSendAdmin;
    }
  });
});
