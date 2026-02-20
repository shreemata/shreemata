const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const mongoose = require('mongoose');

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  invoiceDate: { type: String, required: true },
  customerName: { type: String, required: true },
  phoneNumber: String,
  gstNumber: String,
  district: String,
  state: String,
  pinCode: String,
  billingAddress: String,
  shipToName: String,
  shippingPhone: String,
  shippingAddress: String,
  shippingDistrict: String,
  shippingPinCode: String,
  transportationName: String,
  vehicleNo: String,
  products: [{
    productName: String,
    hsnCode: String,
    unitPrice: Number,
    bundles: Number,
    gstPercent: Number,
    taxableAmount: Number,
    sgstAmount: Number,
    cgstAmount: Number,
    total: Number
  }],
  forwardingCharges: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  bankName: String,
  accountNumber: String,
  ifscCode: String,
  branch: String,
  receivedBy: String,
  sentBy: String,
  digitalSignature: Boolean,
  createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

// Invoice Counter Schema - tracks daily serial numbers
const invoiceCounterSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // Format: YYYYMMDD
  counter: { type: Number, default: 0 }
});

const InvoiceCounter = mongoose.model('InvoiceCounter', invoiceCounterSchema);

// Generate invoice number based on billing date
async function generateInvoiceNumber(billingDate) {
  // Parse billing date (format: YYYY-MM-DD)
  const date = new Date(billingDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateKey = `${year}${month}${day}`;
  
  // Find or create counter for this date
  let counterDoc = await InvoiceCounter.findOne({ date: dateKey });
  
  if (!counterDoc) {
    // First invoice for this date
    counterDoc = new InvoiceCounter({ date: dateKey, counter: 1 });
    await counterDoc.save();
    const serial = '0001';
    return `SM${dateKey}${serial}`;
  } else {
    // Increment counter for this date
    counterDoc.counter += 1;
    await counterDoc.save();
    const serial = String(counterDoc.counter).padStart(4, '0');
    return `SM${dateKey}${serial}`;
  }
}

// Get all invoices (admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single invoice
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Generate invoice number preview (without saving)
router.post('/preview-number', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { invoiceDate } = req.body;
    if (!invoiceDate) {
      return res.status(400).json({ message: 'Invoice date is required' });
    }
    
    // Parse billing date
    const date = new Date(invoiceDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${year}${month}${day}`;
    
    // Get next counter for this date (without incrementing)
    const counterDoc = await InvoiceCounter.findOne({ date: dateKey });
    const nextCounter = counterDoc ? counterDoc.counter + 1 : 1;
    const serial = String(nextCounter).padStart(4, '0');
    const previewNumber = `SM${dateKey}${serial}`;
    
    res.json({ invoiceNumber: previewNumber });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new invoice
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      invoiceDate,
      customerName,
      phoneNumber,
      gstNumber,
      district,
      state,
      pinCode,
      billingAddress,
      shipToName,
      shippingPhone,
      shippingAddress,
      shippingDistrict,
      shippingPinCode,
      transportationName,
      vehicleNo,
      products,
      forwardingCharges,
      discount,
      otherCharges,
      bankName,
      accountNumber,
      ifscCode,
      branch,
      receivedBy,
      sentBy,
      digitalSignature
    } = req.body;

    // Validate required fields
    if (!invoiceDate || !customerName) {
      return res.status(400).json({ message: 'Invoice date and customer name are required' });
    }

    // Generate invoice number based on billing date
    const invoiceNumber = await generateInvoiceNumber(invoiceDate);
    
    const invoice = new Invoice({
      invoiceNumber,
      invoiceDate,
      customerName,
      phoneNumber,
      gstNumber,
      district,
      state,
      pinCode,
      billingAddress,
      shipToName,
      shippingPhone,
      shippingAddress,
      shippingDistrict,
      shippingPinCode,
      transportationName,
      vehicleNo,
      products,
      forwardingCharges: parseFloat(forwardingCharges) || 0,
      discount: parseFloat(discount) || 0,
      otherCharges: parseFloat(otherCharges) || 0,
      bankName,
      accountNumber,
      ifscCode,
      branch,
      receivedBy,
      sentBy,
      digitalSignature
    });

    await invoice.save();
    res.status(201).json({ message: 'Invoice created successfully', invoice });
  } catch (error) {
    console.error('Invoice creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete invoice
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ invoiceNumber: req.params.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
