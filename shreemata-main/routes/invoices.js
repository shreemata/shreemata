const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Order = require('../models/Order');
const User = require('../models/User');

// Document Types Configuration
const DOCUMENT_CONFIG = {
  tax_invoice: {
    key: 'SM_HBL_GLOBAL',
    prefix: 'SM-HBL-',
    title: 'TAX INVOICE',
    label: 'Tax Invoice',
    docType: 'tax_invoice',
    numberLabel: 'Invoice No:',
    dateLabel: 'Invoice Date:'
  },
  delivery_challan: {
    key: 'SM_DCT_GLOBAL',
    prefix: 'SM-DCT-',
    title: 'DELIVERY CHALLAN',
    label: 'Delivery Challan',
    docType: 'delivery_challan',
    numberLabel: 'Challan No:',
    dateLabel: 'Challan Date:'
  },
  quotation: {
    key: 'SM_QUO_GLOBAL',
    prefix: 'SM-QUO-',
    title: 'QUOTATION',
    label: 'Quotation',
    docType: 'quotation',
    numberLabel: 'Quotation No:',
    dateLabel: 'Quotation Date:'
  },
  proforma_invoice: {
    key: 'SM_PRI_GLOBAL',
    prefix: 'SM-PRI-',
    title: 'PROFORMA INVOICE',
    label: 'Proforma Invoice',
    docType: 'proforma_invoice',
    numberLabel: 'Proforma Inv No:',
    dateLabel: 'Proforma Date:'
  },
  cash_challan: {
    key: 'SM_CCH_GLOBAL',
    prefix: 'SM-CCH-',
    title: 'TAX INVOICE',
    label: 'Tax Invoice',
    docType: 'cash_challan',
    numberLabel: 'Invoice No:',
    dateLabel: 'Invoice Date:'
  }
};

function normalizeDocType(type) {
  if (!type) return 'tax_invoice';
  const t = String(type).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (t === 'delivery_challan' || t === 'challan' || t === 'sm_dct' || t === 'dct') return 'delivery_challan';
  if (t === 'quotation' || t === 'quote' || t === 'sm_quo' || t === 'quo') return 'quotation';
  if (t === 'proforma_invoice' || t === 'proforma' || t === 'sm_pri' || t === 'pri') return 'proforma_invoice';
  if (t === 'cash_challan' || t === 'cash' || t === 'sm_cch' || t === 'cch') return 'cash_challan';
  return 'tax_invoice';
}

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  invoiceNumber: { type: String, required: true, unique: true },
  documentType: {
    type: String,
    enum: ['tax_invoice', 'delivery_challan', 'quotation', 'proforma_invoice', 'cash_challan'],
    default: 'tax_invoice'
  },
  documentNumbers: {
    tax_invoice: { type: String, default: '' },
    delivery_challan: { type: String, default: '' },
    quotation: { type: String, default: '' },
    proforma_invoice: { type: String, default: '' },
    cash_challan: { type: String, default: '' }
  },
  cashChallanData: {
    customerName: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    billingAddress: { type: String, default: '' },
    products: [{
      productName: String,
      hsnCode: { type: String, default: '4901' },
      unitPrice: Number,
      bundles: Number,
      total: Number
    }],
    subtotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
  },
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
  forwardingGstPercent: { type: Number, default: 5 },
  discount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  bankName: { type: String, default: 'IDFC FIRST' },
  accountNumber: { type: String, default: '10198316912' },
  ifscCode: { type: String, default: 'IDFB0080281' },
  branch: { type: String, default: 'HUBBALLI' },
  receivedBy: String,
  sentBy: String,
  digitalSignature: { type: Boolean, default: true },
  dispatchStatus: {
    type: String,
    enum: ['pending', 'dispatched'],
    default: 'pending'
  },
  courierNumber: {
    type: String,
    default: ''
  },
  createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

// Legacy Invoice Counter Schema (kept for backward schema compatibility)
const invoiceCounterSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  counter: { type: Number, default: 0 }
});
const InvoiceCounter = mongoose.models.InvoiceCounter || mongoose.model('InvoiceCounter', invoiceCounterSchema);

// Continuous Global Invoice Sequence Schema for SM-HBL-, SM-DCT-, SM-QUO-, SM-PRI-, SM-CCH- formats
const invoiceSequenceSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});
const InvoiceSequence = mongoose.models.InvoiceSequence || mongoose.model('InvoiceSequence', invoiceSequenceSchema);

/**
 * Atomically retrieves and increments the next sequence number for a given document type.
 * Synchronizes with the highest existing invoice in the database if counter is not initialized.
 */
async function getNextInvoiceSequence(docType = 'tax_invoice') {
  const normType = normalizeDocType(docType);
  const { key, prefix } = DOCUMENT_CONFIG[normType];

  const existingCounter = await InvoiceSequence.findOne({ key });

  if (!existingCounter) {
    // Find the highest existing invoice with this prefix to prevent collisions
    const regex = new RegExp(`^${prefix}\\d{10}$`);
    const matchingInvoices = await Invoice.find({
      $or: [
        { invoiceNumber: regex },
        { [`documentNumbers.${normType}`]: regex }
      ]
    }).select(`invoiceNumber documentNumbers.${normType}`).lean();

    let maxSeq = 0;
    matchingInvoices.forEach(inv => {
      const val = (inv.documentNumbers && inv.documentNumbers[normType]) || inv.invoiceNumber;
      if (val && val.startsWith(prefix)) {
        const numStr = val.replace(prefix, '');
        const parsed = parseInt(numStr, 10);
        if (!isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }
    });

    // Initialize the counter document if not yet present
    await InvoiceSequence.findOneAndUpdate(
      { key },
      { $setOnInsert: { seq: maxSeq } },
      { upsert: true, new: true }
    );
  }

  // Atomically increment sequence by 1
  const counterDoc = await InvoiceSequence.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return counterDoc.seq;
}

/**
 * Previews the next invoice number for a given document type without incrementing the counter.
 */
async function previewNextInvoiceNumber(docType = 'tax_invoice') {
  const normType = normalizeDocType(docType);
  const { key, prefix } = DOCUMENT_CONFIG[normType];

  const counterDoc = await InvoiceSequence.findOne({ key });
  let currentSeq = counterDoc ? counterDoc.seq : 0;

  if (!counterDoc) {
    const regex = new RegExp(`^${prefix}\\d{10}$`);
    const matchingInvoices = await Invoice.find({
      $or: [
        { invoiceNumber: regex },
        { [`documentNumbers.${normType}`]: regex }
      ]
    }).select(`invoiceNumber documentNumbers.${normType}`).lean();

    matchingInvoices.forEach(inv => {
      const val = (inv.documentNumbers && inv.documentNumbers[normType]) || inv.invoiceNumber;
      if (val && val.startsWith(prefix)) {
        const numStr = val.replace(prefix, '');
        const parsed = parseInt(numStr, 10);
        if (!isNaN(parsed) && parsed > currentSeq) {
          currentSeq = parsed;
        }
      }
    });
  }

  const nextSeq = currentSeq + 1;
  const serial = String(nextSeq).padStart(10, '0');
  return `${prefix}${serial}`;
}

/**
 * Generates next sequential invoice number for a specific document type.
 * Starts at 0000000001 and continuously increments atomically for the lifetime of the system.
 */
async function generateInvoiceNumber(docType = 'tax_invoice') {
  const normType = normalizeDocType(docType);
  const config = DOCUMENT_CONFIG[normType];
  const seq = await getNextInvoiceSequence(normType);
  const serial = String(seq).padStart(10, '0');
  return `${config.prefix}${serial}`;
}

/**
 * Auto-generates an Invoice document from an Order document
 * @param {Object|String} orderOrId - Order document or Order ID
 * @returns {Promise<Object|null>} - Saved Invoice document or null
 */
async function autoGenerateInvoiceForOrder(orderOrId) {
  try {
    let order = orderOrId;
    if (typeof orderOrId === 'string' || (mongoose.Types.ObjectId.isValid(orderOrId) && !orderOrId.items)) {
      order = await Order.findById(orderOrId).populate('user_id', 'name email phone');
    } else if (order && order.user_id && !order.user_id.name && mongoose.Types.ObjectId.isValid(order.user_id)) {
      order = await Order.findById(order._id).populate('user_id', 'name email phone');
    }

    if (!order) {
      console.error('❌ autoGenerateInvoiceForOrder: Order not found');
      return null;
    }

    // Check if invoice already exists for this order
    const existing = await Invoice.findOne({ orderId: order._id });
    if (existing) {
      return existing;
    }

    const user = order.user_id || {};
    const addr = order.deliveryAddress || {};

    const customerName = user.name || (addr.street ? 'Customer' : 'Valued Customer');
    const phoneNumber = user.phone || addr.phone || '';
    const district = addr.district || addr.taluk || '';
    const state = addr.state || 'Karnataka';
    const pinCode = addr.pincode || '';
    
    // Construct full address
    const addressParts = [
      addr.street,
      addr.taluk,
      addr.district,
      addr.state,
      addr.pincode ? `PIN: ${addr.pincode}` : ''
    ].filter(Boolean);
    const fullAddress = addressParts.join(', ') || 'Address on file';

    // Map order items to invoice products
    const rawItems = order.items && order.items.length > 0 ? order.items : [];
    const products = rawItems.map((item) => {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.price) || 0;
      const taxableAmount = qty * unitPrice;
      const gstPercent = 0; // Books are GST exempt (0%)
      const sgstAmount = 0;
      const cgstAmount = 0;
      const total = taxableAmount;

      return {
        productName: item.title || 'Book/Product',
        hsnCode: '4901', // Standard HSN for printed books
        unitPrice,
        bundles: qty,
        gstPercent,
        taxableAmount,
        sgstAmount,
        cgstAmount,
        total
      };
    });

    const forwardingCharges = Number(order.courierCharge) || 0;
    const discount = (order.appliedOffer && order.appliedOffer.savings) ? Number(order.appliedOffer.savings) : 0;
    
    // Invoice date
    const invDateObj = order.updatedAt || order.createdAt || new Date();
    const invoiceDate = invDateObj.toISOString();

    // Generate unique Tax Invoice number (SM-HBL- format)
    const invoiceNumber = await generateInvoiceNumber('tax_invoice');

    const docNumbers = {
      tax_invoice: invoiceNumber,
      delivery_challan: '',
      quotation: '',
      proforma_invoice: '',
      cash_challan: ''
    };

    const newInvoice = new Invoice({
      orderId: order._id,
      invoiceNumber,
      documentType: 'tax_invoice',
      documentNumbers: docNumbers,
      invoiceDate,
      customerName,
      phoneNumber,
      gstNumber: addr.gstNumber || '',
      district,
      state,
      pinCode,
      billingAddress: fullAddress,
      shipToName: customerName,
      shippingPhone: phoneNumber,
      shippingAddress: fullAddress,
      shippingDistrict: district,
      shippingPinCode: pinCode,
      transportationName: order.deliveryMethod === 'pickup' ? 'Self Pickup' : (order.trackingInfo?.courierName || 'Road Transport'),
      vehicleNo: order.trackingInfo?.trackingId || '',
      products,
      forwardingCharges,
      forwardingGstPercent: 5,
      discount,
      otherCharges: 0,
      bankName: 'IDFC FIRST',
      accountNumber: '10198316912',
      ifscCode: 'IDFB0080281',
      branch: 'HUBBALLI',
      receivedBy: user.name || '',
      sentBy: 'Shree Mata',
      digitalSignature: true,
      dispatchStatus: 'pending',
      courierNumber: order.trackingInfo?.trackingId || ''
    });

    await newInvoice.save();

    // Also link sequence number to Order
    await Order.findByIdAndUpdate(order._id, {
      $set: { 'documentNumbers.tax_invoice': invoiceNumber }
    });

    console.log(`✅ Auto-generated Invoice ${invoiceNumber} for Order ${order._id}`);
    return newInvoice;
  } catch (error) {
    console.error('❌ Error in autoGenerateInvoiceForOrder:', error);
    return null;
  }
}

// =========================================================================
// PUBLIC TRACKING ROUTE: GET INVOICE DISPATCH STATUS (NO AUTH REQUIRED)
// =========================================================================
router.get('/track/:invoiceNumber', async (req, res) => {
  try {
    const rawNumber = (req.params.invoiceNumber || '').trim();
    if (!rawNumber) {
      return res.status(400).json({ error: 'Invoice number is required' });
    }

    const query = {
      $or: [
        { invoiceNumber: { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { 'documentNumbers.tax_invoice': { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { 'documentNumbers.delivery_challan': { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { 'documentNumbers.quotation': { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { 'documentNumbers.proforma_invoice': { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { 'documentNumbers.cash_challan': { $regex: new RegExp(`^${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    };

    const invoice = await Invoice.findOne(query).select('invoiceNumber documentNumbers dispatchStatus courierNumber -_id');

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice number not found' });
    }

    const responseData = {
      invoiceNumber: invoice.documentNumbers?.tax_invoice || invoice.invoiceNumber,
      dispatchStatus: invoice.dispatchStatus || 'pending'
    };

    if (invoice.dispatchStatus === 'dispatched' && invoice.courierNumber) {
      responseData.courierNumber = invoice.courierNumber;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error in GET /invoices/track/:invoiceNumber:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =========================================================================
// PUBLIC QR CODE ENDPOINT (NO AUTH REQUIRED)
// Generates and returns a PNG QR code encoding <site-origin>/track-order.html
// =========================================================================
const handleQRCodeRequest = async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const trackingUrl = `${protocol}://${host}/track-order.html`;

    const qrBuffer = await QRCode.toBuffer(trackingUrl, {
      type: 'png',
      width: 140,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (error) {
    console.error('Error in GET /invoices/qr:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
};

router.get('/qr', handleQRCodeRequest);
router.get('/qr/:invoiceNumber', handleQRCodeRequest);

// =========================================================================
// CUSTOMER-FACING ROUTE: GET INVOICE BY ORDER ID
// STRICT OVERRIDE: Always returns strictly Tax Invoice (SM-HBL-)
// =========================================================================
router.get('/by-order/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId).populate('user_id', 'name email phone');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check ownership: requesting user must be the order owner or an admin
    const orderUserId = order.user_id ? (order.user_id._id ? order.user_id._id.toString() : order.user_id.toString()) : '';
    const isOwner = orderUserId === req.user.id.toString();
    const isAdminUser = req.user.role === 'admin';

    if (!isOwner && !isAdminUser) {
      return res.status(403).json({ message: "You don't have access to this invoice." });
    }

    if (order.status === 'cancelled' || order.status === 'failed') {
      return res.status(400).json({ message: 'Cannot generate invoice for a cancelled or failed order.' });
    }

    let invoice = await Invoice.findOne({ orderId: order._id });

    if (!invoice) {
      invoice = await autoGenerateInvoiceForOrder(order);
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice is being generated — please check back shortly' });
    }

    // Customer view strict enforcement: Ensure Tax Invoice number is used
    const invoiceObj = invoice.toObject ? invoice.toObject() : { ...invoice };
    if (invoiceObj.documentNumbers && invoiceObj.documentNumbers.tax_invoice) {
      invoiceObj.invoiceNumber = invoiceObj.documentNumbers.tax_invoice;
    }
    invoiceObj.documentType = 'tax_invoice';

    res.json(invoiceObj);
  } catch (error) {
    console.error('Error in GET /invoices/by-order/:orderId:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =========================================================================
// ADMIN ROUTES
// =========================================================================

// Get all invoices (admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Generate or retrieve a specific document type sequence number for an invoice (admin only)
router.post('/:id/document-number', authenticateToken, isAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    const docType = normalizeDocType(req.body.documentType || req.query.docType || req.query.documentType || 'tax_invoice');
    const config = DOCUMENT_CONFIG[docType];

    const query = mongoose.Types.ObjectId.isValid(rawId)
      ? {
          $or: [
            { _id: rawId },
            { invoiceNumber: rawId },
            { 'documentNumbers.tax_invoice': rawId },
            { 'documentNumbers.delivery_challan': rawId },
            { 'documentNumbers.quotation': rawId },
            { 'documentNumbers.proforma_invoice': rawId },
            { 'documentNumbers.cash_challan': rawId }
          ]
        }
      : {
          $or: [
            { invoiceNumber: rawId },
            { 'documentNumbers.tax_invoice': rawId },
            { 'documentNumbers.delivery_challan': rawId },
            { 'documentNumbers.quotation': rawId },
            { 'documentNumbers.proforma_invoice': rawId },
            { 'documentNumbers.cash_challan': rawId }
          ]
        };

    let invoice = await Invoice.findOne(query);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!invoice.documentNumbers) {
      invoice.documentNumbers = {
        tax_invoice: invoice.invoiceNumber || '',
        delivery_challan: '',
        quotation: '',
        proforma_invoice: '',
        cash_challan: ''
      };
    }

    let docNumber = invoice.documentNumbers[docType];
    let isNew = false;

    // Special case: if tax_invoice is requested and not yet set in documentNumbers, use invoiceNumber
    if (docType === 'tax_invoice' && !docNumber) {
      docNumber = invoice.invoiceNumber;
      invoice.documentNumbers.tax_invoice = docNumber;
      await invoice.save();
    }

    // If still not generated for this type, atomically generate a new sequential number
    if (!docNumber) {
      docNumber = await generateInvoiceNumber(docType);
      invoice.documentNumbers[docType] = docNumber;
      await invoice.save();
      isNew = true;

      if (invoice.orderId) {
        await Order.findByIdAndUpdate(invoice.orderId, {
          $set: { [`documentNumbers.${docType}`]: docNumber }
        });
      }
    }

    // If custom manual data is provided (e.g. for Cash Challan), update cashChallanData
    if (req.body.manualData && typeof req.body.manualData === 'object') {
      invoice.cashChallanData = {
        customerName: req.body.manualData.customerName || invoice.customerName,
        phoneNumber: req.body.manualData.phoneNumber || invoice.phoneNumber,
        billingAddress: req.body.manualData.billingAddress || invoice.billingAddress,
        products: Array.isArray(req.body.manualData.products) ? req.body.manualData.products.map(p => ({
          productName: p.productName || 'Item',
          hsnCode: p.hsnCode || '4901',
          unitPrice: parseFloat(p.unitPrice || p.price) || 0,
          bundles: parseFloat(p.bundles || p.quantity) || 1,
          total: parseFloat(p.total) || ((parseFloat(p.unitPrice || p.price) || 0) * (parseFloat(p.bundles || p.quantity) || 1))
        })) : [],
        subtotal: parseFloat(req.body.manualData.subtotal) || 0,
        grandTotal: parseFloat(req.body.manualData.grandTotal) || 0
      };
      await invoice.save();
    }

    res.json({
      success: true,
      documentType: docType,
      documentNumber: docNumber,
      title: config.title,
      label: config.label,
      numberLabel: config.numberLabel,
      dateLabel: config.dateLabel,
      isNew,
      documentNumbers: invoice.documentNumbers,
      cashChallanData: invoice.cashChallanData
    });
  } catch (error) {
    console.error('Error in POST /invoices/:id/document-number:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single invoice by invoiceNumber or _id or document number (admin only)
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    const query = mongoose.Types.ObjectId.isValid(rawId)
      ? {
          $or: [
            { _id: rawId },
            { invoiceNumber: rawId },
            { 'documentNumbers.tax_invoice': rawId },
            { 'documentNumbers.delivery_challan': rawId },
            { 'documentNumbers.quotation': rawId },
            { 'documentNumbers.proforma_invoice': rawId },
            { 'documentNumbers.cash_challan': rawId }
          ]
        }
      : {
          $or: [
            { invoiceNumber: rawId },
            { 'documentNumbers.tax_invoice': rawId },
            { 'documentNumbers.delivery_challan': rawId },
            { 'documentNumbers.quotation': rawId },
            { 'documentNumbers.proforma_invoice': rawId },
            { 'documentNumbers.cash_challan': rawId }
          ]
        };

    const invoice = await Invoice.findOne(query);
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
    const docType = normalizeDocType(req.body.documentType || req.query.documentType || 'tax_invoice');
    const previewNumber = await previewNextInvoiceNumber(docType);
    const config = DOCUMENT_CONFIG[docType];
    res.json({
      invoiceNumber: previewNumber,
      documentType: docType,
      title: config.title,
      label: config.label,
      prefix: config.prefix
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new invoice (admin manual creation)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      documentType,
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
      digitalSignature,
      dispatchStatus,
      courierNumber
    } = req.body;

    // Validate required fields
    if (!invoiceDate || !customerName) {
      return res.status(400).json({ message: 'Invoice date and customer name are required' });
    }

    const normDocType = normalizeDocType(documentType);
    const generatedNumber = await generateInvoiceNumber(normDocType);

    const docNumbers = {
      tax_invoice: normDocType === 'tax_invoice' ? generatedNumber : '',
      delivery_challan: normDocType === 'delivery_challan' ? generatedNumber : '',
      quotation: normDocType === 'quotation' ? generatedNumber : '',
      proforma_invoice: normDocType === 'proforma_invoice' ? generatedNumber : '',
      cash_challan: normDocType === 'cash_challan' ? generatedNumber : ''
    };

    const invoice = new Invoice({
      invoiceNumber: generatedNumber,
      documentType: normDocType,
      documentNumbers: docNumbers,
      cashChallanData: req.body.cashChallanData || req.body.manualData || {
        customerName,
        phoneNumber,
        billingAddress,
        products: (products || []).map(p => ({
          productName: p.productName || 'Item',
          hsnCode: p.hsnCode || '4901',
          unitPrice: parseFloat(p.unitPrice || p.price) || 0,
          bundles: parseFloat(p.bundles || p.quantity) || 1,
          total: parseFloat(p.total) || 0
        })),
        subtotal: parseFloat(req.body.subtotal) || 0,
        grandTotal: parseFloat(req.body.grandTotal) || 0
      },
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
      forwardingGstPercent: (req.body.forwardingGstPercent !== undefined && !isNaN(parseFloat(req.body.forwardingGstPercent))) ? parseFloat(req.body.forwardingGstPercent) : 5,
      discount: parseFloat(discount) || 0,
      otherCharges: parseFloat(otherCharges) || 0,
      bankName: bankName || 'IDFC FIRST',
      accountNumber: accountNumber || '10198316912',
      ifscCode: ifscCode || 'IDFB0080281',
      branch: branch || 'HUBBALLI',
      receivedBy,
      sentBy,
      digitalSignature: digitalSignature !== undefined ? digitalSignature : true,
      dispatchStatus: ['pending', 'dispatched'].includes(dispatchStatus) ? dispatchStatus : 'pending',
      courierNumber: (courierNumber || '').trim()
    });

    await invoice.save();
    res.status(201).json({ message: 'Invoice created successfully', invoice });
  } catch (error) {
    console.error('Invoice creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update dispatch status and optional courier tracking number (admin only)
router.patch('/:id/dispatch-status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { dispatchStatus, courierNumber } = req.body;
    if (!dispatchStatus || !['pending', 'dispatched'].includes(dispatchStatus)) {
      return res.status(400).json({ message: 'Invalid dispatch status. Must be "pending" or "dispatched"' });
    }

    const updateFields = { dispatchStatus };
    if (courierNumber !== undefined) {
      updateFields.courierNumber = (courierNumber || '').trim();
    }

    const query = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { $or: [{ _id: req.params.id }, { invoiceNumber: req.params.id }] }
      : { invoiceNumber: req.params.id };

    const invoice = await Invoice.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({
      success: true,
      message: `Invoice dispatch status updated to ${dispatchStatus}`,
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        dispatchStatus: invoice.dispatchStatus,
        courierNumber: invoice.courierNumber || ''
      }
    });
  } catch (error) {
    console.error('Error in PATCH /invoices/:id/dispatch-status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete invoice (admin only)
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
module.exports.Invoice = Invoice;
module.exports.generateInvoiceNumber = generateInvoiceNumber;
module.exports.autoGenerateInvoiceForOrder = autoGenerateInvoiceForOrder;
module.exports.DOCUMENT_CONFIG = DOCUMENT_CONFIG;
module.exports.normalizeDocType = normalizeDocType;
