const { calculateInvoiceTotals, numberToWords } = require('../utils/invoicePdf');

/**
 * Exact replica of the calculations inside public/customer-invoice.html (populateInvoice)
 */
function websiteInvoiceCalculation(invoice) {
  let taxableSubtotal = 0;
  let totalQty = 0;
  let totalSGST = 0;
  let totalCGST = 0;
  let activeGstRate = 0;

  const productsList = (invoice.products && Array.isArray(invoice.products) && invoice.products.length > 0)
    ? invoice.products
    : [];

  productsList.forEach((product) => {
    const qty = parseFloat(product.bundles || product.qty || product.quantity || 1);
    const unitPrice = parseFloat(product.unitPrice) || 0;
    const taxableAmt = (product.taxableAmount !== undefined && product.taxableAmount !== null)
      ? parseFloat(product.taxableAmount)
      : (qty * unitPrice);

    const gstPercent = (product.gstPercent !== undefined && product.gstPercent !== null && !isNaN(parseFloat(product.gstPercent)))
      ? parseFloat(product.gstPercent)
      : 0;

    if (gstPercent > 0 && !activeGstRate) {
      activeGstRate = gstPercent;
    }

    const sgst = (product.sgstAmount !== undefined && product.sgstAmount !== null)
      ? parseFloat(product.sgstAmount)
      : (taxableAmt * (gstPercent / 200));

    const cgst = (product.cgstAmount !== undefined && product.cgstAmount !== null)
      ? parseFloat(product.cgstAmount)
      : (taxableAmt * (gstPercent / 200));

    taxableSubtotal += taxableAmt;
    totalQty += qty;
    totalSGST += sgst;
    totalCGST += cgst;
  });

  const forwarding = parseFloat(invoice.forwardingCharges) || 0;
  if (forwarding > 0) {
    const fwdGstPercent = (invoice.forwardingGstPercent !== undefined && invoice.forwardingGstPercent !== null && !isNaN(parseFloat(invoice.forwardingGstPercent)))
      ? parseFloat(invoice.forwardingGstPercent)
      : 5;
    const fwdSgst = forwarding * (fwdGstPercent / 200);
    const fwdCgst = forwarding * (fwdGstPercent / 200);

    taxableSubtotal += forwarding;
    totalQty += 1;
    totalSGST += fwdSgst;
    totalCGST += fwdCgst;

    if (!activeGstRate && fwdGstPercent > 0) {
      activeGstRate = fwdGstPercent;
    }
  }

  const halfGstRate = activeGstRate > 0 ? (activeGstRate / 2).toFixed(1).replace('.0', '') : '0';
  const cgstLabel = `OUT CGST @${halfGstRate}%`;
  const sgstLabel = `OUT SGST @${halfGstRate}%`;

  const discount = parseFloat(invoice.discount) || 0;
  const rawGrandTotal = taxableSubtotal + totalSGST + totalCGST - discount;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOffDiff = roundedGrandTotal - rawGrandTotal;

  function pageNumberToWords(num) {
    if (num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    function convertLessThanThousand(n) {
      if (n === 0) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
    }

    if (num < 1000) return convertLessThanThousand(num);
    if (num < 100000) {
      const thousands = Math.floor(num / 1000);
      const remainder = num % 1000;
      return convertLessThanThousand(thousands) + ' Thousand' + (remainder ? ' ' + convertLessThanThousand(remainder) : '');
    }
    if (num < 10000000) {
      const lakhs = Math.floor(num / 100000);
      const remainder = num % 100000;
      return convertLessThanThousand(lakhs) + ' Lakh' + (remainder ? ' ' + pageNumberToWords(remainder) : '');
    }
    const crores = Math.floor(num / 10000000);
    const remainder = num % 10000000;
    return convertLessThanThousand(crores) + ' Crore' + (remainder ? ' ' + pageNumberToWords(remainder) : '');
  }

  const grandTotalInWords = pageNumberToWords(roundedGrandTotal) + ' Rupees Only';
  const totalTaxAmount = Math.round(totalSGST + totalCGST);
  const taxInWords = pageNumberToWords(totalTaxAmount) + ' Rupees Only';

  return {
    taxableSubtotal: taxableSubtotal.toFixed(2),
    totalQty: totalQty,
    cgstLabel: cgstLabel,
    sgstLabel: sgstLabel,
    totalCGST: totalCGST.toFixed(2),
    totalSGST: totalSGST.toFixed(2),
    discount: discount.toFixed(2),
    roundOff: (roundOffDiff >= 0 ? '+' : '') + roundOffDiff.toFixed(2),
    grandTotal: roundedGrandTotal.toFixed(2),
    amountInWords: grandTotalInWords,
    taxAmountInWords: taxInWords
  };
}

describe('Invoice Calculation Parity Tests (Website vs Server PDF)', () => {
  const fixtures = [
    {
      name: 'Fixture 1: .5 Rounding Up Edge Case (.50 raw remainder)',
      invoice: {
        products: [
          { productName: 'Item A', qty: 1, unitPrice: 333.81, gstPercent: 5 }
        ],
        forwardingCharges: 0,
        discount: 0
      }
    },
    {
      name: 'Fixture 2: .5 Rounding Down Edge Case (.49 raw remainder)',
      invoice: {
        products: [
          { productName: 'Item B', qty: 1, unitPrice: 333.80, gstPercent: 5 }
        ],
        forwardingCharges: 0,
        discount: 0
      }
    },
    {
      name: 'Fixture 3: Discount Edge Case with Multi-Product Subtotal',
      invoice: {
        products: [
          { productName: 'Book 1', bundles: 2, unitPrice: 250, gstPercent: 5 },
          { productName: 'Book 2', bundles: 3, unitPrice: 150, gstPercent: 5 }
        ],
        forwardingCharges: 60,
        forwardingGstPercent: 5,
        discount: 125.50
      }
    },
    {
      name: 'Fixture 4: Forwarding Charges & Distinct Forwarding GST',
      invoice: {
        products: [
          { productName: 'Standard Hardcover', qty: 4, unitPrice: 499, gstPercent: 0 }
        ],
        forwardingCharges: 150,
        forwardingGstPercent: 18,
        discount: 0
      }
    },
    {
      name: 'Fixture 5: Zero GST Rate on Books',
      invoice: {
        products: [
          { productName: 'Spiritual Book Vol 1', qty: 10, unitPrice: 100, gstPercent: 0 },
          { productName: 'Spiritual Book Vol 2', qty: 5, unitPrice: 120, gstPercent: 0 }
        ],
        forwardingCharges: 0,
        discount: 0
      }
    },
    {
      name: 'Fixture 6: Mixed GST Rates (0%, 5%, 12%, 18%)',
      invoice: {
        products: [
          { productName: 'Book (Exempt)', qty: 1, unitPrice: 100, gstPercent: 0 },
          { productName: 'Incense (5%)', qty: 2, unitPrice: 50, gstPercent: 5 },
          { productName: 'Brass Lamp (12%)', qty: 1, unitPrice: 400, gstPercent: 12 },
          { productName: 'Audio CD (18%)', qty: 1, unitPrice: 200, gstPercent: 18 }
        ],
        forwardingCharges: 80,
        forwardingGstPercent: 5,
        discount: 50
      }
    },
    {
      name: 'Fixture 7: Pre-stored taxableAmount, sgstAmount, cgstAmount fields',
      invoice: {
        products: [
          {
            productName: 'Stored Item',
            bundles: 5,
            unitPrice: 100,
            taxableAmount: 500,
            gstPercent: 5,
            sgstAmount: 12.5,
            cgstAmount: 12.5,
            total: 525
          }
        ],
        forwardingCharges: 50,
        discount: 25
      }
    }
  ];

  fixtures.forEach((f) => {
    test(`Parity Check - ${f.name}`, () => {
      const pageResult = websiteInvoiceCalculation(f.invoice);
      const pdfResult = calculateInvoiceTotals(f.invoice);

      expect(pdfResult.taxableSubtotal.toFixed(2)).toBe(pageResult.taxableSubtotal);
      expect(pdfResult.totalQty).toBe(pageResult.totalQty);
      expect(pdfResult.cgstLabel).toBe(pageResult.cgstLabel);
      expect(pdfResult.sgstLabel).toBe(pageResult.sgstLabel);
      expect(pdfResult.totalCGST.toFixed(2)).toBe(pageResult.totalCGST);
      expect(pdfResult.totalSGST.toFixed(2)).toBe(pageResult.totalSGST);
      expect(pdfResult.discount.toFixed(2)).toBe(pageResult.discount);

      const pdfRoundOff = (pdfResult.roundOffDiff >= 0 ? '+' : '') + pdfResult.roundOffDiff.toFixed(2);
      expect(pdfRoundOff).toBe(pageResult.roundOff);

      expect(pdfResult.roundedGrandTotal.toFixed(2)).toBe(pageResult.grandTotal);
      expect(pdfResult.grandTotalInWords).toBe(pageResult.amountInWords);
      expect(pdfResult.taxInWords).toBe(pageResult.taxAmountInWords);
    });
  });
});
