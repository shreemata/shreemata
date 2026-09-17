const mongoose = require('mongoose');
const { isPaymentVerified } = require('../utils/paymentHelper');

// Mock dependencies
jest.mock('../models/Order');
jest.mock('../models/User');

const { autoGenerateInvoiceForOrder } = require('../routes/invoices');
const Order = require('../models/Order');
const Invoice = mongoose.models.Invoice;
const InvoiceSequence = mongoose.models.InvoiceSequence;

describe('Payment Status & Invoice Eligibility Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. isPaymentVerified utility unit tests', () => {
    test('returns true for completed paymentStatus', () => {
      const order = { paymentStatus: 'completed' };
      expect(isPaymentVerified(order)).toBe(true);
    });

    test('returns true for verified paymentStatus', () => {
      const order = { paymentStatus: 'verified' };
      expect(isPaymentVerified(order)).toBe(true);
    });

    test('returns true for verified paymentDetails.status', () => {
      const order = { paymentStatus: 'pending', paymentDetails: { status: 'verified' } };
      expect(isPaymentVerified(order)).toBe(true);
    });

    test('returns true for legacy order with status completed and payment evidence', () => {
      const order1 = { status: 'completed', paymentDetails: { utrNumber: 'UTR123' } };
      const order2 = { status: 'completed', paymentDetails: { razorpayPaymentId: 'pay_123' } };
      expect(isPaymentVerified(order1)).toBe(true);
      expect(isPaymentVerified(order2)).toBe(true);
    });

    test('returns false for legacy order with status completed but missing payment evidence', () => {
      const order = { status: 'completed' };
      expect(isPaymentVerified(order)).toBe(false);
    });

    test('returns false for pending paymentStatus', () => {
      const order = { paymentStatus: 'pending', paymentDetails: { status: 'pending' }, status: 'pending' };
      expect(isPaymentVerified(order)).toBe(false);
    });

    test('returns false for failed or cancelled paymentStatus', () => {
      expect(isPaymentVerified({ paymentStatus: 'failed' })).toBe(false);
      expect(isPaymentVerified({ paymentStatus: 'cancelled' })).toBe(false);
      expect(isPaymentVerified({ paymentStatus: 'pending_payment_verification' })).toBe(false);
    });

    test('returns false for null or undefined order', () => {
      expect(isPaymentVerified(null)).toBe(false);
      expect(isPaymentVerified(undefined)).toBe(false);
    });
  });

  describe('2. Invoice auto-generation gating', () => {
    test('autoGenerateInvoiceForOrder returns null when payment is unverified', async () => {
      const pendingOrder = {
        _id: 'order_123',
        paymentStatus: 'pending',
        paymentDetails: { status: 'pending' },
        items: [{ title: 'Book A', price: 100, quantity: 1 }]
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(pendingOrder)
      });

      const res = await autoGenerateInvoiceForOrder('order_123');
      expect(res).toBeNull();
    });

    test('autoGenerateInvoiceForOrder creates invoice when payment is verified', async () => {
      const verifiedOrder = {
        _id: 'order_456',
        paymentStatus: 'completed',
        paymentDetails: { status: 'verified' },
        items: [{ title: 'Book A', price: 100, quantity: 1 }],
        totalAmount: 100,
        user_id: { _id: 'user_1', name: 'John Doe', email: 'john@example.com' },
        save: jest.fn().mockResolvedValue(true)
      };

      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(verifiedOrder)
      });

      jest.spyOn(Invoice, 'findOne').mockResolvedValue(null);
      jest.spyOn(Invoice, 'countDocuments').mockResolvedValue(10);
      jest.spyOn(InvoiceSequence, 'findOne').mockResolvedValue({ currentSeq: 10 });
      jest.spyOn(InvoiceSequence, 'findOneAndUpdate').mockResolvedValue({ currentSeq: 11 });
      
      const mockSavedInvoice = {
        _id: 'inv_1',
        invoiceNumber: 'SM-HBL-2026-00011',
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(Invoice.prototype, 'save').mockResolvedValue(mockSavedInvoice);

      const invoice = await autoGenerateInvoiceForOrder('order_456');
      expect(invoice).toBeDefined();
    });
  });
});
