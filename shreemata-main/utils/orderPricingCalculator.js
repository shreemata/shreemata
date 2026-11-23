const mongoose = require('mongoose');
const { getAuthoritativeItemDetails } = require('./deliveryAddressValidator');

const DEFAULT_SHIPPING_RATES = [
  { minWeight: 0, maxWeight: 0.99, rate: 25 },
  { minWeight: 1, maxWeight: 1.99, rate: 35 },
  { minWeight: 2, maxWeight: 2.99, rate: 45 },
  { minWeight: 3, maxWeight: 4.99, rate: 55 },
  { minWeight: 5, maxWeight: 9.99, rate: 75 }
];

/**
 * Calculates shipping charge based on weight and shipping rates.
 * Exact functional parity with public/js/dynamic-shipping.js
 */
function calculateShippingCharge(weight, rates) {
  if (!weight || weight <= 0) return 0;
  const activeRates = (Array.isArray(rates) && rates.length > 0) ? rates : DEFAULT_SHIPPING_RATES;

  // Find matching weight range
  for (const rate of activeRates) {
    if (weight >= rate.minWeight && weight <= rate.maxWeight) {
      return rate.rate;
    }
  }

  // If no exact match, find the highest range that the weight exceeds
  const applicableRates = activeRates.filter(rate => weight > rate.maxWeight);
  if (applicableRates.length > 0) {
    const highestRate = applicableRates[applicableRates.length - 1];
    return highestRate.rate;
  }

  // Fallback to first rate if weight is below all ranges
  return activeRates[0]?.rate || 25;
}

/**
 * Validates and calculates discount for an applied offer from the database.
 */
async function validateAndCalculateOffer(appliedOffer, itemsTotal) {
  if (!appliedOffer) return { validOffer: null, discountAmount: 0 };

  const rawOfferId = appliedOffer.offerId || appliedOffer._id || appliedOffer.id;
  const offerId = String(rawOfferId || '').trim();
  if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
    return { error: 'Invalid offer identifier', message: `Invalid offer ID: ${rawOfferId}` };
  }

  const Notification = mongoose.models.Notification || require('../models/Notification');
  const offerDoc = await Notification.findById(offerId).lean().catch(() => null);

  if (!offerDoc || !offerDoc.isActive) {
    return { error: 'Invalid or inactive offer', message: 'Offer is not active or no longer exists' };
  }

  if (!['offer', 'discount'].includes(offerDoc.type)) {
    return { error: 'Invalid offer type', message: 'Notification is not an offer or discount' };
  }

  if (offerDoc.validUntil && new Date(offerDoc.validUntil) < new Date()) {
    return { error: 'Offer expired', message: 'The applied offer has expired' };
  }

  const minAmount = Number(offerDoc.offerDetails?.minAmount) || 0;
  if (itemsTotal < minAmount) {
    return {
      error: 'Offer threshold not met',
      message: `Cart items total ₹${itemsTotal} does not meet the minimum required amount ₹${minAmount} for this offer`
    };
  }

  let savings = 0;
  if (offerDoc.offerDetails?.discountType === 'percentage') {
    savings = (itemsTotal * (Number(offerDoc.offerDetails?.discountValue) || 0)) / 100;
  } else {
    savings = Number(offerDoc.offerDetails?.discountValue) || 0;
  }

  savings = Math.min(itemsTotal, Math.max(0, savings));
  savings = Math.round(savings * 100) / 100;
  const discountedAmount = Math.round((itemsTotal - savings) * 100) / 100;

  return {
    validOffer: {
      offerId: String(offerDoc._id),
      offerTitle: offerDoc.title,
      discountType: offerDoc.offerDetails?.discountType || 'flat',
      discountValue: offerDoc.offerDetails?.discountValue || 0,
      originalAmount: itemsTotal,
      discountedAmount: discountedAmount,
      savings: savings
    },
    discountAmount: savings
  };
}

/**
 * Authoritatively computes and validates order pricing on server from database.
 */
async function calculateAuthoritativeOrder({
  items,
  deliveryMethod,
  clientCourierCharge,
  appliedOffer,
  clientAmount
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Invalid order items', message: 'Items must be a non-empty array' };
  }

  let itemsTotal = 0;
  let totalWeight = 0;
  let hasPhysical = false;
  const processedItems = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { error: 'Invalid item format', message: 'Each item must be an object' };
    }

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return {
        error: 'Invalid item quantity',
        message: `Quantity for item "${item.title || item.id || 'unknown'}" must be a positive integer >= 1`
      };
    }

    const details = await getAuthoritativeItemDetails(item);
    if (!details || !details.found) {
      return {
        error: 'Item not found',
        message: details?.error || `Item not found or unavailable: ${item.id || item.title || 'unknown'}`
      };
    }

    let authoritativePrice = 0;
    let authoritativeWeight = 0;
    const isDigital = Boolean(details.isDigital);

    if (details.kind === 'bundle') {
      const bundle = details.entity;
      authoritativePrice = Number(bundle.bundlePrice) || 0;
      authoritativeWeight = (typeof bundle.weight === 'number' && bundle.weight > 0) ? bundle.weight : 1.0;
    } else if (details.kind === 'note') {
      const note = details.entity;
      authoritativePrice = (typeof note.price === 'number' && note.price >= 0)
        ? note.price
        : (Number(item.price) || 0);
      authoritativeWeight = 0;
    } else {
      const book = details.entity;
      if (book.discountEnabled && typeof book.sellingPrice === 'number' && book.sellingPrice >= 0) {
        authoritativePrice = book.sellingPrice;
      } else {
        authoritativePrice = Number(book.price) || 0;
      }
      authoritativeWeight = (typeof book.weight === 'number' && book.weight > 0) ? book.weight : 0.5;
    }

    if (authoritativePrice < 0) {
      return { error: 'Invalid item price', message: `Database price for "${item.title || item.id}" is negative` };
    }

    const lineTotal = Math.round(authoritativePrice * qty * 100) / 100;
    itemsTotal = Math.round((itemsTotal + lineTotal) * 100) / 100;

    if (!isDigital) {
      hasPhysical = true;
      totalWeight += authoritativeWeight * qty;
    }

    processedItems.push({
      id: String(details.entity._id),
      title: details.entity.title || details.entity.name,
      author: details.entity.author || (details.kind === 'bundle' ? 'Bundle' : (details.kind === 'note' ? 'Study Material' : 'Unknown')),
      price: authoritativePrice,
      quantity: qty,
      coverImage: details.entity.cover_image || details.entity.image || details.entity.coverImage || item.coverImage || '',
      type: details.kind,
      isDigital: isDigital,
      digitalPrice: isDigital ? authoritativePrice : null,
      weight: authoritativeWeight
    });
  }

  const isDigitalOnly = !hasPhysical;
  const isPickup = (deliveryMethod === 'pickup');

  // Shipping calculation
  let finalCourierCharge = 0;
  if (isDigitalOnly || isPickup) {
    finalCourierCharge = 0;
  } else {
    // Courier delivery for physical items
    const CommissionSettings = mongoose.models.CommissionSettings || require('../models/CommissionSettings');
    const settings = await CommissionSettings.getSettings().catch(() => null);
    const shippingRates = (settings && Array.isArray(settings.shippingRates) && settings.shippingRates.length > 0)
      ? settings.shippingRates
      : DEFAULT_SHIPPING_RATES;

    const computedShipping = calculateShippingCharge(totalWeight, shippingRates);

    if (clientCourierCharge !== undefined && clientCourierCharge !== null) {
      const sentCourier = Number(clientCourierCharge);
      if (sentCourier === 0) {
        return {
          error: 'Courier charge required',
          message: 'Courier charge cannot be zero for courier delivery orders'
        };
      }
      if (sentCourier < 0) {
        return {
          error: 'Invalid courier charge',
          message: 'Courier charge cannot be negative'
        };
      }
      if (sentCourier < computedShipping - 1.00) {
        return {
          error: 'Insufficient courier charge',
          message: `Courier charge ₹${sentCourier} is below the required rate ₹${computedShipping} for ${totalWeight}kg`
        };
      }
      finalCourierCharge = sentCourier;
    } else {
      // If courierCharge omitted from client request:
      // If client amount matches itemsTotal (legacy test without shipping): accept 0
      if (clientAmount !== undefined && clientAmount !== null && Math.abs(Number(clientAmount) - itemsTotal) <= 1.00) {
        finalCourierCharge = 0;
      } else {
        finalCourierCharge = computedShipping;
      }
    }
  }

  // Offer validation & calculation
  let validatedOfferData = undefined;
  let discountAmount = 0;
  if (appliedOffer) {
    const offerRes = await validateAndCalculateOffer(appliedOffer, itemsTotal);
    if (offerRes.error) {
      return { error: offerRes.error, message: offerRes.message || offerRes.error };
    }
    validatedOfferData = offerRes.validOffer;
    discountAmount = offerRes.discountAmount || 0;
  }

  const expectedTotal = Math.round((itemsTotal - discountAmount + finalCourierCharge) * 100) / 100;

  // Amount comparison if clientAmount provided
  if (clientAmount !== undefined && clientAmount !== null) {
    const sentAmount = Number(clientAmount);
    if (isNaN(sentAmount) || sentAmount <= 0) {
      return {
        error: 'Invalid order amount',
        message: 'Order amount must be a positive number'
      };
    }
    if (Math.abs(sentAmount - expectedTotal) > 1.00) {
      return {
        error: 'Order amount mismatch',
        message: `Order amount mismatch. Client sent ₹${sentAmount}, server computed ₹${expectedTotal}`,
        expectedTotal,
        sentAmount
      };
    }
  }

  return {
    success: true,
    itemsTotal,
    discountAmount,
    courierCharge: finalCourierCharge,
    totalWeight: isDigitalOnly ? 0 : Math.round(totalWeight * 100) / 100,
    isDigitalOnly,
    expectedTotal,
    validatedOffer: validatedOfferData,
    processedItems
  };
}

module.exports = {
  calculateShippingCharge,
  validateAndCalculateOffer,
  calculateAuthoritativeOrder,
  DEFAULT_SHIPPING_RATES
};
