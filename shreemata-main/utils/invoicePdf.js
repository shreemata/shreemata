/**
 * Server-Side Tax Invoice PDF Generator
 * Built with PDFKit and QRCode
 * Bundles OFL Licensed Noto Sans, Noto Sans Kannada, Noto Sans Devanagari
 * Strictly faithful to public/customer-invoice.html
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Path to bundled fonts
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONTS_DIR, 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'NotoSans-Bold.ttf');
const FONT_KANNADA = path.join(FONTS_DIR, 'NotoSansKannada-Regular.woff');
const FONT_DEVANAGARI = path.join(FONTS_DIR, 'NotoSansDevanagari-Regular.woff');

// Path to logo
const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'shiva.png');
const LOGO_FALLBACK = path.join(__dirname, '..', 'public', 'images', 'logo.png');

class InvoiceValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'InvoiceValidationError';
    this.field = field;
    this.statusCode = 422;
  }
}

// Indian number & currency formatter (e.g. 1,23,456.78)
function formatIndianCurrency(num) {
  const n = Number(num) || 0;
  const isNegative = n < 0;
  const parts = Math.abs(n).toFixed(2).split('.');
  let intPart = parts[0];
  const decPart = parts[1];

  if (intPart.length > 3) {
    const last3 = intPart.substring(intPart.length - 3);
    const other = intPart.substring(0, intPart.length - 3);
    intPart = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (isNegative ? '-' : '') + intPart + '.' + decPart;
}

// Convert numbers to Indian Words (Identical to customer-invoice.html)
function numberToWords(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function convertLessThanThousand(v) {
    if (v === 0) return '';
    if (v < 10) return ones[v];
    if (v < 20) return teens[v - 10];
    if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 ? ' ' + ones[v % 10] : '');
    return ones[Math.floor(v / 100)] + ' Hundred' + (v % 100 ? ' ' + convertLessThanThousand(v % 100) : '');
  }

  if (n < 1000) return convertLessThanThousand(n);
  if (n < 100000) {
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    return convertLessThanThousand(thousands) + ' Thousand' + (remainder ? ' ' + convertLessThanThousand(remainder) : '');
  }
  if (n < 10000000) {
    const lakhs = Math.floor(n / 100000);
    const remainder = n % 100000;
    return convertLessThanThousand(lakhs) + ' Lakh' + (remainder ? ' ' + numberToWords(remainder) : '');
  }
  const crores = Math.floor(n / 10000000);
  const remainder = n % 10000000;
  return convertLessThanThousand(crores) + ' Crore' + (remainder ? ' ' + numberToWords(remainder) : '');
}

/**
 * Shared calculation function: Reuses the EXACT same arithmetic, rounding,
 * and order of operations as public/customer-invoice.html
 */
function calculateInvoiceTotals(invoice) {
  const productsList = (invoice && invoice.products && Array.isArray(invoice.products))
    ? invoice.products
    : [];

  let taxableSubtotal = 0;
  let totalQty = 0;
  let totalSGST = 0;
  let totalCGST = 0;
  let activeGstRate = 0;

  const items = [];

  productsList.forEach((product, index) => {
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

    items.push({
      si: index + 1,
      name: product.productName || 'N/A',
      hsn: product.hsnCode || '-',
      gst: gstPercent,
      qty: qty,
      rate: unitPrice,
      uom: 'BND',
      amount: taxableAmt
    });
  });

  // Forwarding / courier charges line item
  const forwarding = parseFloat(invoice && invoice.forwardingCharges) || 0;
  if (forwarding > 0) {
    const nextIndex = items.length + 1;
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

    items.push({
      si: nextIndex,
      name: 'Forwarding / Courier Charges',
      hsn: '996511',
      gst: fwdGstPercent,
      qty: 1,
      rate: forwarding,
      uom: 'LS',
      amount: forwarding
    });
  }

  // Discounts
  const discount = parseFloat(invoice && invoice.discount) || 0;

  // Grand Total & Rounding
  const rawGrandTotal = taxableSubtotal + totalSGST + totalCGST - discount;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOffDiff = roundedGrandTotal - rawGrandTotal;

  // Tax Breakdown Rates
  const halfGstRate = activeGstRate > 0 ? (activeGstRate / 2).toFixed(1).replace('.0', '') : '0';
  const cgstLabel = `OUT CGST @${halfGstRate}%`;
  const sgstLabel = `OUT SGST @${halfGstRate}%`;

  // Total Amount in Words & Total Tax in Words
  const grandTotalInWords = numberToWords(roundedGrandTotal) + ' Rupees Only';
  const totalTaxAmount = Math.round(totalSGST + totalCGST);
  const taxInWords = numberToWords(totalTaxAmount) + ' Rupees Only';

  return {
    items,
    taxableSubtotal,
    totalQty,
    totalSGST,
    totalCGST,
    activeGstRate,
    halfGstRate,
    cgstLabel,
    sgstLabel,
    discount,
    rawGrandTotal,
    roundedGrandTotal,
    roundOffDiff,
    totalTaxAmount,
    grandTotalInWords,
    taxInWords
  };
}

/**
 * Validate legally required invoice fields (No silent fallbacks)
 */
function validateInvoiceData(invoice) {
  if (!invoice) {
    throw new InvoiceValidationError('Missing invoice data', 'invoice');
  }

  // 1. invoiceNumber
  const invNo = (invoice.documentNumbers && invoice.documentNumbers.tax_invoice) || invoice.invoiceNumber;
  if (!invNo || typeof invNo !== 'string' || !invNo.trim()) {
    throw new InvoiceValidationError('Missing required field: invoiceNumber', 'invoiceNumber');
  }

  // 2. invoiceDate
  if (!invoice.invoiceDate || isNaN(new Date(invoice.invoiceDate).getTime())) {
    throw new InvoiceValidationError('Missing required field: invoiceDate', 'invoiceDate');
  }

  // 3. buyer name (customerName)
  if (!invoice.customerName || typeof invoice.customerName !== 'string' || !invoice.customerName.trim()) {
    throw new InvoiceValidationError('Missing required field: customerName', 'customerName');
  }

  // 4. items (products)
  if (!invoice.products || !Array.isArray(invoice.products) || invoice.products.length === 0) {
    throw new InvoiceValidationError('Missing required field: products', 'products');
  }

  // Validate item pricing numbers (no silent fallbacks for corrupted or NaN values)
  for (const p of invoice.products) {
    if (p.unitPrice === undefined || p.unitPrice === null || isNaN(Number(p.unitPrice))) {
      throw new InvoiceValidationError('Missing or invalid required field: totals', 'totals');
    }
    if (p.taxableAmount !== undefined && p.taxableAmount !== null && isNaN(Number(p.taxableAmount))) {
      throw new InvoiceValidationError('Missing or invalid required field: totals', 'totals');
    }
  }

  // 5. totals
  const totals = calculateInvoiceTotals(invoice);
  if (isNaN(totals.taxableSubtotal) || isNaN(totals.roundedGrandTotal) || totals.roundedGrandTotal < 0) {
    throw new InvoiceValidationError('Missing or invalid required field: totals', 'totals');
  }

  return totals;
}

/**
 * Split text into script runs for mixed-script rendering on the same line
 */
function splitIntoRuns(text, isBold = false) {
  if (!text) return [];
  const str = String(text);
  const runs = [];
  let currentScript = null;
  let currentText = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const cp = ch.codePointAt(0);

    let script = 'latin';
    if (cp >= 0x0C80 && cp <= 0x0CFF) {
      script = 'kannada';
    } else if (cp >= 0x0900 && cp <= 0x097F) {
      script = 'devanagari';
    } else {
      script = 'latin';
    }

    if (script !== currentScript) {
      if (currentText.length > 0) {
        runs.push({
          text: currentText,
          font: currentScript === 'kannada' ? 'NotoSansKannada'
              : currentScript === 'devanagari' ? 'NotoSansDevanagari'
              : (isBold ? 'NotoSans-Bold' : 'NotoSans')
        });
      }
      currentScript = script;
      currentText = ch;
    } else {
      currentText += ch;
    }
  }

  if (currentText.length > 0) {
    runs.push({
      text: currentText,
      font: currentScript === 'kannada' ? 'NotoSansKannada'
          : currentScript === 'devanagari' ? 'NotoSansDevanagari'
          : (isBold ? 'NotoSans-Bold' : 'NotoSans')
    });
  }
  return runs;
}

/**
 * Render mixed-script text seamlessly on the same line/box
 */
function renderMixedText(doc, text, x, y, options = {}) {
  const isBold = options.isBold || false;
  const runs = splitIntoRuns(text, isBold);
  if (runs.length === 0) return;

  const width = options.width;
  const align = options.align || 'left';
  const fontSize = options.fontSize || doc._fontSize;
  const fillColor = options.fillColor || doc._fillColor;

  if (x !== undefined && y !== undefined) {
    doc.x = x;
    doc.y = y;
  }

  doc.fontSize(fontSize);
  doc.fillColor(fillColor);

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const isLast = (i === runs.length - 1);
    doc.font(run.font);

    const textOpts = {
      continued: !isLast,
      width: width,
      align: align,
      lineBreak: options.lineBreak !== undefined ? options.lineBreak : true
    };
    if (options.height !== undefined && isLast) {
      textOpts.height = options.height;
    }

    doc.text(run.text, textOpts);
  }
}

/**
 * Accurately measure height needed for multi-line text
 */
function measureTextHeight(doc, text, width, fontSize = 7.5, isBold = false) {
  if (!text) return 0;
  doc.fontSize(fontSize);
  const runs = splitIntoRuns(text, isBold);
  const primaryFont = runs.length > 0 ? runs[0].font : (isBold ? 'NotoSans-Bold' : 'NotoSans');
  doc.font(primaryFont);
  return Math.ceil(doc.heightOfString(text, { width }));
}

/**
 * Generate PDF buffer for an Invoice document
 * @param {Object} invoice - Stored invoice document
 * @param {Object} [options] - Optional parameters (req, host, protocol)
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, options = {}) {
  // Validate legally required fields first (throws 422 if invalid)
  const totals = validateInvoiceData(invoice);

  return new Promise(async (resolve, reject) => {
    try {
      const invoiceNumber = (invoice.documentNumbers && invoice.documentNumbers.tax_invoice) || invoice.invoiceNumber;

      const doc = new PDFDocument({
        size: 'A4',
        margin: 28,
        bufferPages: true,
        info: {
          Title: 'Tax Invoice ' + invoiceNumber,
          Author: 'Shree Mata Publication',
          Subject: 'Official GST Tax Invoice'
        }
      });

      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      // Register bundled OFL fonts
      if (fs.existsSync(FONT_REGULAR)) doc.registerFont('NotoSans', FONT_REGULAR);
      if (fs.existsSync(FONT_BOLD)) doc.registerFont('NotoSans-Bold', FONT_BOLD);
      if (fs.existsSync(FONT_KANNADA)) doc.registerFont('NotoSansKannada', FONT_KANNADA);
      if (fs.existsSync(FONT_DEVANAGARI)) doc.registerFont('NotoSansDevanagari', FONT_DEVANAGARI);

      // Pre-generate QR code buffer for dispatch status tracking
      let protocol = 'https';
      let host = 'shreemata.com';
      if (options.req) {
        protocol = options.req.headers['x-forwarded-proto'] || options.req.protocol || 'http';
        host = options.req.get ? options.req.get('host') : (options.req.headers['host'] || host);
      } else if (options.host) {
        host = options.host;
        protocol = options.protocol || 'https';
      }
      const trackingUrl = `${protocol}://${host}/track-order.html`;

      let qrBuffer = null;
      try {
        qrBuffer = await QRCode.toBuffer(trackingUrl, {
          type: 'png',
          width: 140,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch (qrErr) {
        console.warn('QR code generation warning:', qrErr.message);
      }

      // Metadata matching customer-invoice.html
      const stateName = (invoice.state || 'Karnataka').trim();
      const placeOfSupply = stateName.toLowerCase().includes('karnataka') ? '29-Karnataka' : stateName;

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 28;
      const contentWidth = pageWidth - (margin * 2); // 539.28

      const invDateObj = new Date(invoice.invoiceDate);
      const formattedDate = String(invDateObj.getDate()).padStart(2, '0') + '-' +
                            String(invDateObj.getMonth() + 1).padStart(2, '0') + '-' +
                            invDateObj.getFullYear();

      const customerName = invoice.customerName.trim();
      const phoneNumber = invoice.phoneNumber || '-';
      const customerGSTN = invoice.gstNumber || '-';
      const billingAddress = invoice.billingAddress || '-';
      const billingLocParts = [invoice.district, invoice.state, invoice.pinCode ? `PIN: ${invoice.pinCode}` : ''].filter(Boolean);
      const billingLocation = billingLocParts.join(', ') || '-';

      const shipName = (invoice.shipToName && invoice.shipToName.trim()) || customerName;
      const shipPhone = invoice.shippingPhone || phoneNumber;
      const shipGSTN = invoice.gstNumber || '-';
      const shipAddress = invoice.shippingAddress || billingAddress;
      const shipDistrict = invoice.shippingDistrict || invoice.district || '';
      const shipPin = invoice.shippingPinCode || invoice.pinCode || '';
      const shipLocParts = [shipDistrict, invoice.state, shipPin ? `PIN: ${shipPin}` : ''].filter(Boolean);
      const shippingLocation = shipLocParts.join(', ') || '-';

      const transportParts = [invoice.transportationName, invoice.vehicleNo].filter(Boolean);
      const ewayText = transportParts.join(' / ') || '-';
      const representative = invoice.sentBy || invoice.receivedBy || '-';

      // Column widths for items table
      const colWidths = {
        si: 26,
        desc: 215,
        hsn: 52,
        gst: 40,
        qty: 36,
        rate: 56,
        uom: 32,
        amount: 82.28
      };

      function drawTableHeaders(y) {
        doc.rect(margin, y, contentWidth, 20).fillAndStroke('#f3f4f6', '#333333');
        doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827');

        let x = margin;
        doc.text('SI No.', x, y + 6, { width: colWidths.si, align: 'center' }); x += colWidths.si;
        doc.text('Description of Goods', x + 4, y + 6, { width: colWidths.desc - 8, align: 'left' }); x += colWidths.desc;
        doc.text('HSN/SAC', x, y + 6, { width: colWidths.hsn, align: 'center' }); x += colWidths.hsn;
        doc.text('GST %', x, y + 6, { width: colWidths.gst, align: 'center' }); x += colWidths.gst;
        doc.text('Qty', x, y + 6, { width: colWidths.qty, align: 'center' }); x += colWidths.qty;
        doc.text('Rate (\u20B9)', x, y + 6, { width: colWidths.rate, align: 'right' }); x += colWidths.rate;
        doc.text('UOM', x, y + 6, { width: colWidths.uom, align: 'center' }); x += colWidths.uom;
        doc.text('Amount (\u20B9)', x - 4, y + 6, { width: colWidths.amount, align: 'right' });

        return y + 20;
      }

      // Draw top header and buyer/consignee boxes on page 1
      function drawHeader(yTop) {
        let y = yTop;

        // Outer border
        doc.rect(margin, margin, contentWidth, pageHeight - (margin * 2)).lineWidth(0.8).stroke('#333333');

        // 1. Top Title & Company Info Block
        let logoFile = null;
        if (fs.existsSync(LOGO_PATH)) logoFile = LOGO_PATH;
        else if (fs.existsSync(LOGO_FALLBACK)) logoFile = LOGO_FALLBACK;

        if (logoFile) {
          try {
            doc.image(logoFile, margin + 8, y + 4, { width: 48, height: 48 });
          } catch (e) {
            console.warn('Logo draw warning:', e.message);
          }
        }

        // Title Box (Right)
        doc.rect(margin + contentWidth - 140, y + 6, 132, 24).fillAndStroke('#f3f4f6', '#333333');
        doc.fillColor('#000000').font('NotoSans-Bold').fontSize(12).text('TAX INVOICE', margin + contentWidth - 140, y + 12, { width: 132, align: 'center' });

        // Company Details (Center)
        const compLeft = margin + 64;
        doc.fillColor('#990000').font('NotoSans-Bold').fontSize(14).text('SHREE MATA', compLeft, y + 4);
        doc.fillColor('#333333').font('NotoSans').fontSize(8)
          .text('Nekar Bhavan, Opp. K.H. Patil College, Vidyanagar, Hubballi, Karnataka - 580031', compLeft, y + 21, { width: 320 })
          .text('Phone: 9886086278 | Email: shree.mata.hbl@gmail.com | Website: www.shreemata.com', compLeft, y + 32, { width: 320 });

        y += 56;

        // Tax details band
        doc.rect(margin, y, contentWidth, 20).fillAndStroke('#fafafa', '#d1d5db');
        doc.fillColor('#111827').font('NotoSans').fontSize(7.5);
        const taxY = y + 5;
        doc.text('GSTIN/UIN: 29GZTPP0335K1ZL', margin + 8, taxY);
        doc.text('PAN No: GZTPP0335K', margin + 160, taxY);
        doc.text('State: 29-Karnataka', margin + 310, taxY);
        doc.text('CIN: -', margin + 450, taxY);

        y += 20;

        // 2. Invoice Meta Row
        doc.rect(margin, y, contentWidth, 38).lineWidth(0.5).stroke('#d1d5db');
        const metaLeftX = margin + 8;
        const metaLeftValX = margin + 80;
        doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#374151');
        doc.text('Invoice No:', metaLeftX, y + 5);
        doc.text('Invoice Date:', metaLeftX, y + 16);
        doc.text('Representative:', metaLeftX, y + 27);

        doc.font('NotoSans-Bold').fillColor('#111827');
        doc.text(invoiceNumber, metaLeftValX, y + 5);
        doc.font('NotoSans').fillColor('#374151');
        doc.text(formattedDate, metaLeftValX, y + 16);
        renderMixedText(doc, representative, metaLeftValX, y + 27, { width: 180, fontSize: 7.5, fillColor: '#374151' });

        const metaRightX = margin + 280;
        const metaRightValX = margin + 370;
        doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#374151');
        doc.text('Place of Supply:', metaRightX, y + 5);
        doc.text('Reverse Charge:', metaRightX, y + 16);
        doc.text('Payment Terms:', metaRightX, y + 27);

        doc.font('NotoSans-Bold').fillColor('#111827');
        doc.text(placeOfSupply, metaRightValX, y + 5);
        doc.font('NotoSans').fillColor('#374151');
        doc.text('No', metaRightValX, y + 16);
        doc.text('Immediate / 15 Days', metaRightValX, y + 27);

        y += 38;

        // 3. Buyer & Consignee Boxes with dynamic heights for long names and addresses
        const halfWidth = contentWidth / 2;
        const buyerAddrW = halfWidth - 16;

        const bNameH = measureTextHeight(doc, customerName, buyerAddrW, 8, true);
        const bAddrH = measureTextHeight(doc, billingAddress, buyerAddrW, 7, false);
        const bLocH = measureTextHeight(doc, billingLocation, buyerAddrW, 7, false);
        const bTotalH = 20 + bNameH + 3 + bAddrH + 3 + bLocH + 3 + 14;

        const sNameH = measureTextHeight(doc, shipName, buyerAddrW, 8, true);
        const sAddrH = measureTextHeight(doc, shipAddress, buyerAddrW, 7, false);
        const sLocH = measureTextHeight(doc, shippingLocation, buyerAddrW, 7, false);
        const sTotalH = 20 + sNameH + 3 + sAddrH + 3 + sLocH + 3 + 14;

        const partyBoxHeight = Math.max(82, Math.ceil(Math.max(bTotalH, sTotalH)) + 8);

        // Buyer Box (Left)
        doc.rect(margin, y, halfWidth, partyBoxHeight).lineWidth(0.5).stroke('#d1d5db');
        doc.rect(margin, y, halfWidth, 16).fillAndStroke('#f3f4f6', '#d1d5db');
        doc.font('NotoSans-Bold').fontSize(8).fillColor('#111827').text('Buyer (Bill to)', margin + 8, y + 4);

        let bCurY = y + 20;
        renderMixedText(doc, customerName, margin + 8, bCurY, { width: buyerAddrW, fontSize: 8, isBold: true, fillColor: '#111827' });
        bCurY += bNameH + 3;

        renderMixedText(doc, billingAddress, margin + 8, bCurY, { width: buyerAddrW, fontSize: 7, isBold: false, fillColor: '#374151' });
        bCurY += bAddrH + 3;

        renderMixedText(doc, billingLocation, margin + 8, bCurY, { width: buyerAddrW, fontSize: 7, isBold: false, fillColor: '#374151' });
        bCurY += bLocH + 3;

        doc.font('NotoSans').fontSize(7).fillColor('#374151')
          .text(`GSTIN: ${customerGSTN}   |   Phone: ${phoneNumber}`, margin + 8, bCurY, { width: buyerAddrW });

        // Consignee Box (Right)
        doc.rect(margin + halfWidth, y, halfWidth, partyBoxHeight).lineWidth(0.5).stroke('#d1d5db');
        doc.rect(margin + halfWidth, y, halfWidth, 16).fillAndStroke('#f3f4f6', '#d1d5db');
        doc.font('NotoSans-Bold').fontSize(8).fillColor('#111827').text('Consignee (Ship to)', margin + halfWidth + 8, y + 4);

        let sCurY = y + 20;
        renderMixedText(doc, shipName, margin + halfWidth + 8, sCurY, { width: buyerAddrW, fontSize: 8, isBold: true, fillColor: '#111827' });
        sCurY += sNameH + 3;

        renderMixedText(doc, shipAddress, margin + halfWidth + 8, sCurY, { width: buyerAddrW, fontSize: 7, isBold: false, fillColor: '#374151' });
        sCurY += sAddrH + 3;

        renderMixedText(doc, shippingLocation, margin + halfWidth + 8, sCurY, { width: buyerAddrW, fontSize: 7, isBold: false, fillColor: '#374151' });
        sCurY += sLocH + 3;

        doc.font('NotoSans').fontSize(7).fillColor('#374151')
          .text(`GSTIN: ${shipGSTN}   |   Phone: ${shipPhone}`, margin + halfWidth + 8, sCurY, { width: buyerAddrW });

        y += partyBoxHeight;

        // 4. IRN & E-Way Row
        doc.rect(margin, y, contentWidth, 16).lineWidth(0.5).stroke('#d1d5db');
        doc.font('NotoSans').fontSize(7).fillColor('#374151');
        doc.text('IRN: -', margin + 8, y + 4);
        doc.text('Ack No: -', margin + 110, y + 4);
        doc.text('Ack Date: -', margin + 210, y + 4);
        doc.font('NotoSans-Bold').text('E-Way/Vehicle: ', margin + 295, y + 4);
        renderMixedText(doc, ewayText, margin + 360, y + 4, { width: contentWidth - 365, fontSize: 6.5, fillColor: '#374151' });

        y += 16;
        return y;
      }

      // Start rendering page 1
      let currentY = drawHeader(margin);
      currentY = drawTableHeaders(currentY);

      // Render Item Rows with dynamic height wrapping
      const items = totals.items;
      const footerRequiredHeight = 245; // Subtotal (18) + Totals (84) + Terms/Bank (70) + Sign (58) + 15
      const itemRowBottomLimit = pageHeight - margin - 25;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const nameH = measureTextHeight(doc, item.name, colWidths.desc - 8, 7.5, true);
        const rowHeight = Math.max(18, nameH + 8);

        // Check if item fits on current page
        if (currentY + rowHeight > itemRowBottomLimit) {
          doc.addPage();
          doc.rect(margin, margin, contentWidth, pageHeight - (margin * 2)).lineWidth(0.8).stroke('#333333');
          doc.font('NotoSans-Bold').fontSize(8.5).fillColor('#333333').text(`Tax Invoice ${invoiceNumber} (Continued)`, margin + 8, margin + 8);
          currentY = margin + 22;
          currentY = drawTableHeaders(currentY);
        }

        // Draw row borders
        doc.rect(margin, currentY, contentWidth, rowHeight).lineWidth(0.4).stroke('#e5e7eb');

        let x = margin;
        doc.font('NotoSans').fontSize(7.5).fillColor('#374151');
        doc.text(String(item.si), x, currentY + 5, { width: colWidths.si, align: 'center' }); x += colWidths.si;

        // Render item description with mixed-script wrapping
        renderMixedText(doc, item.name, x + 4, currentY + 5, {
          width: colWidths.desc - 8,
          fontSize: 7.5,
          isBold: true,
          fillColor: '#111827'
        });
        x += colWidths.desc;

        doc.font('NotoSans').fillColor('#374151');
        doc.text(item.hsn, x, currentY + 5, { width: colWidths.hsn, align: 'center' }); x += colWidths.hsn;
        doc.text(item.gst + '%', x, currentY + 5, { width: colWidths.gst, align: 'center' }); x += colWidths.gst;
        doc.text(String(item.qty), x, currentY + 5, { width: colWidths.qty, align: 'center' }); x += colWidths.qty;
        doc.text(formatIndianCurrency(item.rate), x, currentY + 5, { width: colWidths.rate, align: 'right' }); x += colWidths.rate;
        doc.text(item.uom, x, currentY + 5, { width: colWidths.uom, align: 'center' }); x += colWidths.uom;
        doc.font('NotoSans-Bold').text(formatIndianCurrency(item.amount), x - 4, currentY + 5, { width: colWidths.amount, align: 'right' });

        currentY += rowHeight;
      }

      // Check if subtotal and complete footer block fit together on current page
      if (currentY + footerRequiredHeight > pageHeight - margin - 15) {
        doc.addPage();
        doc.rect(margin, margin, contentWidth, pageHeight - (margin * 2)).lineWidth(0.8).stroke('#333333');
        doc.font('NotoSans-Bold').fontSize(8.5).fillColor('#333333').text(`Tax Invoice ${invoiceNumber} (Continued)`, margin + 8, margin + 8);
        currentY = margin + 22;
        currentY = drawTableHeaders(currentY);
      }

      // Sub-Total Row
      doc.rect(margin, currentY, contentWidth, 18).fillAndStroke('#fafafa', '#333333');
      doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827');
      doc.text('Sub-Total:', margin + 8, currentY + 5, { width: colWidths.si + colWidths.desc + colWidths.hsn + colWidths.gst - 16, align: 'right' });

      const subQtyX = margin + colWidths.si + colWidths.desc + colWidths.hsn + colWidths.gst;
      doc.text(String(totals.totalQty), subQtyX, currentY + 5, { width: colWidths.qty, align: 'center' });
      doc.text(formatIndianCurrency(totals.taxableSubtotal), margin + contentWidth - colWidths.amount - 4, currentY + 5, { width: colWidths.amount, align: 'right' });
      currentY += 18;

      // 6. Totals Section (Left: Words; Right: Summary Rows)
      const totalsHeight = 84;
      doc.rect(margin, currentY, contentWidth, totalsHeight).lineWidth(0.5).stroke('#d1d5db');

      // Left Box: Words
      const totalsLeftWidth = 320;
      doc.font('NotoSans-Bold').fontSize(7).fillColor('#4b5563').text('Total Amount (in Words):', margin + 8, currentY + 6);
      doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827').text(totals.grandTotalInWords, margin + 8, currentY + 17, { width: totalsLeftWidth - 16 });

      doc.font('NotoSans-Bold').fontSize(7).fillColor('#4b5563').text('Total Tax Amount (in Words):', margin + 8, currentY + 44);
      doc.font('NotoSans').fontSize(7.5).fillColor('#374151').text(totals.taxInWords, margin + 8, currentY + 55, { width: totalsLeftWidth - 16 });

      // Right Box: Tax Breakdown & Grand Total
      const totalsRightX = margin + totalsLeftWidth;
      const totalsRightWidth = contentWidth - totalsLeftWidth;
      doc.rect(totalsRightX, currentY, totalsRightWidth, totalsHeight).lineWidth(0.5).stroke('#d1d5db');

      let summaryY = currentY + 4;
      function drawSummaryLine(label, value, isBold = false) {
        doc.font(isBold ? 'NotoSans-Bold' : 'NotoSans').fontSize(7.5).fillColor('#374151');
        doc.text(label, totalsRightX + 8, summaryY, { width: 110, align: 'left' });
        doc.text(value, totalsRightX + totalsRightWidth - 90, summaryY, { width: 82, align: 'right' });
        summaryY += 11;
      }

      drawSummaryLine('Taxable Amount', formatIndianCurrency(totals.taxableSubtotal));

      // Strictly render OUT CGST & OUT SGST matching customer-invoice.html (No IGST branch)
      drawSummaryLine(totals.cgstLabel, formatIndianCurrency(totals.totalCGST));
      drawSummaryLine(totals.sgstLabel, formatIndianCurrency(totals.totalSGST));

      if (totals.discount > 0) {
        drawSummaryLine('Discount', '-\u20B9' + formatIndianCurrency(totals.discount));
      }

      const roundSign = totals.roundOffDiff >= 0 ? '+' : '';
      drawSummaryLine('Rounded Off', roundSign + totals.roundOffDiff.toFixed(2));

      // Grand Total Highlight
      doc.rect(totalsRightX, currentY + totalsHeight - 19, totalsRightWidth, 19).fillAndStroke('#fef3c7', '#d97706');
      doc.font('NotoSans-Bold').fontSize(8.5).fillColor('#92400e');
      doc.text('Grand Total', totalsRightX + 8, currentY + totalsHeight - 14);
      doc.text('\u20B9 ' + formatIndianCurrency(totals.roundedGrandTotal), totalsRightX + totalsRightWidth - 90, currentY + totalsHeight - 14, { width: 82, align: 'right' });

      currentY += totalsHeight;

      // 7. Terms & Bank Details Block (Identical to customer-invoice.html)
      const termsHeight = 70;
      doc.rect(margin, currentY, contentWidth, termsHeight).lineWidth(0.5).stroke('#d1d5db');

      // Left: Terms (Rendered sequentially with exact line height spacing to avoid any overlaps)
      const termsWidth = 320;
      doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827').text('Terms & Conditions:', margin + 8, currentY + 5);
      
      const termsList = [
        '1. Goods once sold will not be taken back, until and unless approved by the manufacturer.',
        '2. Shree Mata is not responsible for the performance and warranty of products. Warranty if any, is provided only by the manufacturer.',
        '3. Physically damaged, tampered or water-logged items do not qualify for any warranty.',
        '4. Jurisdiction for any dispute will be exclusively in Hubballi, Karnataka.'
      ];

      doc.font('NotoSans').fontSize(6).fillColor('#4b5563');
      const termsX = margin + 8;
      const termsW = termsWidth - 16;
      let curTermY = currentY + 16;
      for (const t of termsList) {
        doc.text(t, termsX, curTermY, { width: termsW });
        curTermY = doc.y + 2.5;
      }

      // Right: Bank Details
      const bankX = margin + termsWidth;
      const bankWidth = contentWidth - termsWidth;
      doc.rect(bankX, currentY, bankWidth, termsHeight).lineWidth(0.5).stroke('#d1d5db');
      doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827').text("Company's Bank Details:", bankX + 8, currentY + 5);
      
      doc.font('NotoSans').fontSize(7).fillColor('#374151');
      doc.text("A/c Holder's Name: ", bankX + 8, currentY + 18, { continued: true }).font('NotoSans-Bold').text('Shree Mata');
      doc.font('NotoSans').text("Bank Name: ", bankX + 8, currentY + 30, { continued: true }).text(invoice.bankName || 'IDFC FIRST');
      doc.font('NotoSans').text("A/c No: ", bankX + 8, currentY + 42, { continued: true }).font('NotoSans-Bold').text(invoice.accountNumber || '10198316912');
      doc.font('NotoSans').text("Branch & IFSC: ", bankX + 8, currentY + 54, { continued: true }).text(`${invoice.branch || 'HUBBALLI'} & ${invoice.ifscCode || 'IDFB0080281'}`);

      currentY += termsHeight;

      // 8. Signatures Block & QR Code
      const signHeight = 58;
      doc.rect(margin, currentY, contentWidth, signHeight).lineWidth(0.5).stroke('#d1d5db');

      // Left: Receiver
      const signColWidth = contentWidth / 3;
      doc.font('NotoSans').fontSize(7).fillColor('#374151');
      doc.text('Received the goods in Good condition', margin + 8, currentY + 8, { width: signColWidth - 16 });
      doc.text('----------------------------------------------------', margin + 8, currentY + 32);
      doc.text("Receiver's Seal, Signature, Date & Time", margin + 8, currentY + 43);

      // Center: QR Code
      const qrCenterX = margin + signColWidth + (signColWidth / 2) - 22;
      if (qrBuffer) {
        doc.image(qrBuffer, qrCenterX, currentY + 4, { width: 44, height: 44 });
      }
      doc.font('NotoSans').fontSize(6).fillColor('#6b7280')
        .text('Scan to check dispatch status', margin + signColWidth, currentY + 49, { width: signColWidth, align: 'center' });

      // Right: Authorised Signatory & Digital Signature
      const signRightX = margin + (signColWidth * 2);
      doc.font('NotoSans-Bold').fontSize(7.5).fillColor('#111827').text('For SHREE MATA', signRightX, currentY + 6, { width: signColWidth - 8, align: 'right' });
      
      // Digital sign badge (clean single-line layout)
      const badgeWidth = 130;
      const badgeHeight = 24;
      const badgeX = signRightX + signColWidth - badgeWidth - 6;
      const badgeY = currentY + 16;
      doc.rect(badgeX, badgeY, badgeWidth, badgeHeight).fillAndStroke('#ecfdf5', '#10b981');

      // Crisp vector checkmark watermark
      doc.save();
      doc.strokeColor('#059669').lineWidth(1.5).lineCap('round').lineJoin('round');
      doc.moveTo(badgeX + 6, badgeY + 12).lineTo(badgeX + 10, badgeY + 16).lineTo(badgeX + 16, badgeY + 7).stroke();
      doc.restore();

      // Digital sign caption
      const now = new Date();
      const digitalTimestamp = now.getFullYear() + '.' +
        String(now.getMonth() + 1).padStart(2, '0') + '.' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');

      doc.font('NotoSans-Bold').fontSize(6).fillColor('#065f46')
        .text('Digitally signed by SHREE MATA', badgeX + 20, badgeY + 4, { width: badgeWidth - 22, align: 'left', lineBreak: false });
      doc.font('NotoSans').fontSize(5.5).fillColor('#047857')
        .text(digitalTimestamp, badgeX + 20, badgeY + 13, { width: badgeWidth - 22, align: 'left', lineBreak: false });

      doc.font('NotoSans').fontSize(6.5).fillColor('#4b5563')
        .text('Authorised Signatory', signRightX, currentY + 44, { width: signColWidth - 8, align: 'right' });

      // 9. Add footer note on all buffered pages
      const range = doc.bufferedPageRange();
      for (let p = range.start; p < range.start + range.count; p++) {
        doc.switchToPage(p);
        const pageNo = p + 1;
        const totalPages = range.count;
        doc.rect(margin, pageHeight - margin - 15, contentWidth, 15).fillAndStroke('#fafafa', '#d1d5db');
        doc.font('NotoSans').fontSize(6.5).fillColor('#6b7280')
          .text(`This is a Computer Generated Tax Invoice | Page ${pageNo} of ${totalPages}`, margin, pageHeight - margin - 11, { width: contentWidth, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateInvoicePdf,
  calculateInvoiceTotals,
  validateInvoiceData,
  numberToWords,
  formatIndianCurrency,
  InvoiceValidationError
};
