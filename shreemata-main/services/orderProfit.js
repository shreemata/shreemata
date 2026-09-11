const Book = require('../models/Book');
const Bundle = require('../models/Bundle');

/**
 * Calculates internal profit per unit for a product based on actual selling price.
 * 
 * Rules:
 * 1. If profitConfigured is false or profitValue is missing/invalid, returns 0.
 * 2. Fixed profit mode: min(configuredProfit, actualUnitPrice). Profit base can never exceed revenue.
 * 3. Percentage profit mode: min(actualUnitPrice, actualUnitPrice * (profitValue / 100)).
 * 4. Bound 0 <= unitProfit <= actualUnitPrice.
 * 
 * @param {Object} product - Product document or object (Book or Bundle)
 * @param {Number} actualUnitPrice - Actual eligible sale unit price paid
 * @returns {Object} { profitTypeSnapshot, profitValueSnapshot, unitProfitSnapshot, profitConfigured }
 */
function calculateProductUnitProfit(product, actualUnitPrice = 0) {
  const validUnitPrice = Math.max(0, Number(actualUnitPrice) || 0);

  if (!product || !product.profitConfigured) {
    return {
      profitTypeSnapshot: (product && product.profitType) || 'fixed',
      profitValueSnapshot: (product && typeof product.profitValue === 'number') ? product.profitValue : 0,
      unitProfitSnapshot: 0,
      profitConfigured: false
    };
  }

  const profitType = product.profitType === 'percentage' ? 'percentage' : 'fixed';
  const profitValue = Math.max(0, Number(product.profitValue) || 0);

  let unitProfit = 0;

  if (profitType === 'fixed') {
    // Profit cannot exceed actual unit selling price (safety rule for discounted sales)
    unitProfit = Math.min(profitValue, validUnitPrice);
  } else {
    // Percentage mode against actual selling price paid
    const calculated = (validUnitPrice * profitValue) / 100;
    unitProfit = Math.min(validUnitPrice, calculated);
  }

  // Paise rounding for financial precision
  unitProfit = Number(Math.max(0, unitProfit).toFixed(2));

  return {
    profitTypeSnapshot: profitType,
    profitValueSnapshot: profitValue,
    unitProfitSnapshot: unitProfit,
    profitConfigured: true
  };
}

/**
 * Builds profit snapshot array for order items.
 * Performs lookup for Book or Bundle if product data is not attached.
 * 
 * Snapshot fields per item:
 * - profitTypeSnapshot
 * - profitValueSnapshot
 * - unitProfitSnapshot
 * - lineProfitSnapshot (= unitProfitSnapshot * quantity)
 * 
 * @param {Array} items - Array of order items
 * @returns {Promise<Array>} Decorated items array with profit snapshot fields
 */
async function buildOrderProfitSnapshot(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const snapshotItems = [];

  for (const item of items) {
    const itemCopy = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    
    // Check if snapshot already exists and is complete (write-once guarantee)
    if (typeof itemCopy.unitProfitSnapshot === 'number' && typeof itemCopy.lineProfitSnapshot === 'number' && itemCopy.unitProfitSnapshot >= 0) {
      snapshotItems.push(itemCopy);
      continue;
    }

    const itemPrice = Math.max(0, Number(itemCopy.price) || 0);
    const quantity = Math.max(1, Number(itemCopy.quantity) || 1);
    let productDoc = null;

    try {
      if (itemCopy.type === 'bundle') {
        productDoc = await Bundle.findById(itemCopy.id);
      } else {
        productDoc = await Book.findById(itemCopy.id);
      }
    } catch (err) {
      console.error(`Error loading product ${itemCopy.id} for profit snapshot:`, err.message);
    }

    const profitData = calculateProductUnitProfit(productDoc, itemPrice);

    itemCopy.profitTypeSnapshot = profitData.profitTypeSnapshot;
    itemCopy.profitValueSnapshot = profitData.profitValueSnapshot;
    itemCopy.unitProfitSnapshot = profitData.unitProfitSnapshot;
    itemCopy.lineProfitSnapshot = Number((profitData.unitProfitSnapshot * quantity).toFixed(2));

    if (productDoc) {
      if (typeof itemCopy.cashbackAmount !== 'number') itemCopy.cashbackAmount = productDoc.cashbackAmount || 0;
      if (typeof itemCopy.cashbackPercentage !== 'number') itemCopy.cashbackPercentage = productDoc.cashbackPercentage || 0;
    }

    snapshotItems.push(itemCopy);
  }

  return snapshotItems;
}

/**
 * Calculates top-level orderProfitTotal from snapshot items.
 * Excludes shipping/courier charges.
 * 
 * @param {Array} snapshotItems - Items with lineProfitSnapshot
 * @returns {Number} Total line profit
 */
function calculateOrderProfitTotal(snapshotItems = []) {
  if (!Array.isArray(snapshotItems) || snapshotItems.length === 0) return 0;

  const total = snapshotItems.reduce((sum, item) => {
    const lineProfit = Number(item.lineProfitSnapshot) || 0;
    return sum + lineProfit;
  }, 0);

  return Number(total.toFixed(2));
}

module.exports = {
  calculateProductUnitProfit,
  buildOrderProfitSnapshot,
  calculateOrderProfitTotal
};
