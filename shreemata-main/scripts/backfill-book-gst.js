/**
 * scripts/backfill-book-gst.js
 * 
 * One-time backfill script to correct existing Invoices in MongoDB:
 * Sets 0% GST (and ₹0 SGST/CGST) for any invoice line item corresponding
 * to an order item with `type === 'book'`.
 * 
 * Items of type 'bundle' or other types are left untouched.
 * 
 * Usage: node scripts/backfill-book-gst.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/mongo');
const Order = require('../models/Order');
const { Invoice } = require('../routes/invoices');

async function runBackfill() {
  console.log('====================================================');
  console.log('🔄 STARTING INVOICE BOOK GST (0%) BACKFILL SCRIPT');
  console.log('====================================================\n');

  await connectDB();
  // Wait for connection to establish
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log('🔍 Fetching all invoices from database...');
  const invoices = await Invoice.find({});
  const totalInvoices = invoices.length;
  console.log(`📊 Found ${totalInvoices} total invoice(s) in database.\n`);

  let scannedCount = 0;
  let correctedCount = 0;
  let skippedNoOrderCount = 0;
  const correctedInvoiceList = [];

  for (const invoice of invoices) {
    scannedCount++;
    const invNum = invoice.invoiceNumber || invoice._id.toString();

    if (!invoice.orderId) {
      // Manual invoice or invoice created without linked order
      skippedNoOrderCount++;
      continue;
    }

    const order = await Order.findById(invoice.orderId);
    if (!order || !order.items || order.items.length === 0) {
      skippedNoOrderCount++;
      continue;
    }

    let invoiceModified = false;
    const modifiedLinesInfo = [];

    // Cross-reference each product in invoice against order items
    (invoice.products || []).forEach((prod, index) => {
      // Find matching order item by exact title or index fallback
      let orderItem = order.items.find(
        (it) => it.title && it.title.trim().toLowerCase() === (prod.productName || '').trim().toLowerCase()
      );
      if (!orderItem && order.items[index]) {
        orderItem = order.items[index];
      }

      if (!orderItem) return;

      // Check if order item is strictly a book
      if (orderItem.type === 'book') {
        const currentGst = Number(prod.gstPercent) || 0;
        const currentSgst = Number(prod.sgstAmount) || 0;
        const currentCgst = Number(prod.cgstAmount) || 0;
        const qty = Number(prod.bundles) || 1;
        const unitPrice = Number(prod.unitPrice) || 0;
        const expectedTaxable = unitPrice * qty;
        const currentTotal = Number(prod.total) || 0;

        // If invoice line has non-zero tax or total differs from taxable amount, correct it
        if (currentGst !== 0 || currentSgst !== 0 || currentCgst !== 0 || currentTotal !== expectedTaxable) {
          modifiedLinesInfo.push({
            productName: prod.productName,
            oldGst: currentGst,
            oldSgst: currentSgst,
            oldCgst: currentCgst,
            oldTotal: currentTotal,
            newGst: 0,
            newSgst: 0,
            newCgst: 0,
            newTotal: expectedTaxable
          });

          prod.gstPercent = 0;
          prod.sgstAmount = 0;
          prod.cgstAmount = 0;
          prod.taxableAmount = expectedTaxable;
          prod.total = expectedTaxable;
          invoiceModified = true;
        }
      }
      // If orderItem.type !== 'book' (e.g. 'bundle'), leave completely untouched!
    });

    if (invoiceModified) {
      await invoice.save();
      correctedCount++;
      correctedInvoiceList.push({
        invoiceNumber: invNum,
        orderId: invoice.orderId,
        linesCorrected: modifiedLinesInfo
      });
      console.log(`✅ Corrected Invoice: ${invNum} (Order: ${invoice.orderId})`);
      modifiedLinesInfo.forEach((l) => {
        console.log(`   - Product: "${l.productName}" | GST: ${l.oldGst}% -> ${l.newGst}% | Total: ₹${l.oldTotal} -> ₹${l.newTotal}`);
      });
    }
  }

  console.log('\n====================================================');
  console.log('📈 BACKFILL EXECUTION SUMMARY');
  console.log('====================================================');
  console.log(`• Total Invoices Scanned:   ${scannedCount}`);
  console.log(`• Invoices Corrected:       ${correctedCount}`);
  console.log(`• Invoices Unchanged:       ${scannedCount - correctedCount}`);
  console.log(`• Invoices without Order:   ${skippedNoOrderCount}`);
  console.log('----------------------------------------------------');

  if (correctedInvoiceList.length > 0) {
    console.log('📋 List of Corrected Invoices:');
    correctedInvoiceList.forEach((item, idx) => {
      console.log(`  ${idx + 1}. Invoice Number: ${item.invoiceNumber} | Linked Order ID: ${item.orderId}`);
    });
  } else {
    console.log('✨ All existing book invoice lines already have 0% GST (no modifications required).');
  }

  console.log('====================================================\n');
  await mongoose.disconnect();
  process.exit(0);
}

runBackfill().catch((err) => {
  console.error('❌ Error executing backfill script:', err);
  process.exit(1);
});
