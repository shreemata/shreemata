const mongoose = require('mongoose');

/**
 * Shared validator for courier delivery addresses.
 * Enforces: name, phone (10 digits), address line, city, state, pincode (6 digits).
 */

function validateCourierAddress(deliveryAddress, user = {}) {
  const safeUser = user || {};
  if (!deliveryAddress || typeof deliveryAddress !== 'object') {
    return {
      isValid: false,
      error: "Complete delivery address is required for courier delivery",
      message: "Please provide a complete delivery address (name, phone, address line, city, state, pincode) before proceeding with payment",
      missingFields: ['name', 'phone', 'addressLine', 'city', 'state', 'pincode'],
      requiresAddressSetup: true
    };
  }

  const name = String(deliveryAddress.name || deliveryAddress.fullName || safeUser.name || "").trim();
  const phone = String(deliveryAddress.phone || "").trim();
  const addressLine = String(deliveryAddress.addressLine || deliveryAddress.homeAddress1 || deliveryAddress.street || "").trim();
  const city = String(deliveryAddress.city || deliveryAddress.taluk || deliveryAddress.district || "").trim();
  const state = String(deliveryAddress.state || "").trim();
  const pincode = String(deliveryAddress.pincode || "").trim();

  const missing = [];
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');
  if (!addressLine) missing.push('addressLine');
  if (!city) missing.push('city');
  if (!state) missing.push('state');
  if (!pincode) missing.push('pincode');

  if (missing.length > 0) {
    return {
      isValid: false,
      error: "All delivery address fields must be filled for courier delivery",
      message: `Please complete required delivery fields: ${missing.join(', ')}`,
      missingFields: missing,
      requiresAddressSetup: true
    };
  }

  // Phone validation: exactly 10 digits
  if (!/^\d{10}$/.test(phone)) {
    return {
      isValid: false,
      error: "Invalid phone number",
      message: "Please enter a valid 10-digit mobile number for delivery",
      field: 'phone',
      requiresAddressSetup: true
    };
  }

  // Pincode validation: exactly 6 digits
  if (!/^\d{6}$/.test(pincode)) {
    return {
      isValid: false,
      error: "Invalid pincode",
      message: "Please enter a valid 6-digit pincode for delivery",
      field: 'pincode',
      requiresAddressSetup: true
    };
  }

  return {
    isValid: true,
    sanitizedAddress: {
      name,
      phone,
      street: addressLine,
      addressLine,
      homeAddress1: addressLine,
      homeAddress2: String(deliveryAddress.homeAddress2 || deliveryAddress.address2 || "").trim(),
      city,
      taluk: String(deliveryAddress.taluk || city).trim(),
      district: String(deliveryAddress.district || city).trim(),
      state,
      pincode
    }
  };
}

/**
 * Checks whether a Book entity (Mongoose document or plain object) represents a digital item
 * by checking both legacy/existing fields and the new isDigital field.
 */
function isBookEntityDigital(book) {
  if (!book || typeof book !== 'object') return false;
  return Boolean(
    book.isDigital === true ||
    book.isDigitalAvailable === true ||
    book.digitalContent?.available === true ||
    (typeof book.pdfUrl === 'string' && book.pdfUrl.trim().length > 0) ||
    (typeof book.digitalPrice === 'number' && book.digitalPrice > 0) ||
    (typeof book.hasDigitalContent === 'function' ? book.hasDigitalContent() : false)
  );
}

/**
 * Checks whether a Bundle entity represents a digital bundle
 * by checking both legacy/existing fields and the new isDigital field.
 */
function isBundleEntityDigital(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  if (
    bundle.isDigital === true ||
    bundle.isDigitalAvailable === true ||
    bundle.digitalContent?.available === true
  ) {
    return true;
  }
  if (Array.isArray(bundle.books) && bundle.books.length > 0) {
    return bundle.books.every(b => isBookEntityDigital(b));
  }
  return false;
}

/**
 * Look up an item in Book, Bundle, or Note collections by ID.
 * Returns { found: true, entity, kind, isDigital } or { found: false, error }.
 * Never trusts client item.type or item.isDigital shortcuts.
 */
async function getAuthoritativeItemDetails(item) {
  if (!item || typeof item !== 'object') {
    return { found: false, error: 'Invalid item data' };
  }

  const rawId = item.id || item._id || item.bookId || item.bundleId || item.noteId;
  const itemId = String(rawId || '').trim();
  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { found: false, error: `Invalid item ID: ${rawId}` };
  }

  const Book = mongoose.models.Book || require('../models/Book');
  const Bundle = mongoose.models.Bundle || require('../models/Bundle');
  let Note = null;
  try {
    Note = mongoose.models.Note || require('../models/Note');
  } catch (e) {
    Note = null;
  }

  const requestedType = String(item.type || item.itemType || '').toLowerCase();

  // If client explicitly indicated bundle, try Bundle first
  if (requestedType === 'bundle' || item.isBundle || item.bundleId) {
    const bundleDoc = await Bundle.findById(itemId).populate('books').lean().catch(() => null);
    if (bundleDoc) {
      return {
        found: true,
        entity: bundleDoc,
        kind: 'bundle',
        isDigital: isBundleEntityDigital(bundleDoc)
      };
    }
  }

  // Look in Book collection
  const bookDoc = await Book.findById(itemId).lean().catch(() => null);
  if (bookDoc) {
    return {
      found: true,
      entity: bookDoc,
      kind: 'book',
      isDigital: isBookEntityDigital(bookDoc)
    };
  }

  // Look in Bundle collection (if not checked first)
  if (requestedType !== 'bundle' && !item.isBundle && !item.bundleId) {
    const bundleDoc = await Bundle.findById(itemId).populate('books').lean().catch(() => null);
    if (bundleDoc) {
      return {
        found: true,
        entity: bundleDoc,
        kind: 'bundle',
        isDigital: isBundleEntityDigital(bundleDoc)
      };
    }
  }

  // Look in Note collection (study materials, digital notes, PDFs, videos)
  if (Note) {
    const noteDoc = await Note.findById(itemId).lean().catch(() => null);
    if (noteDoc) {
      return {
        found: true,
        entity: noteDoc,
        kind: 'note',
        isDigital: true // All Note documents are digital study materials
      };
    }
  }

  return { found: false, error: `Item not found with ID ${itemId}` };
}

/**
 * Authoritatively determines on the server whether an order contains exclusively digital items
 * by looking up the actual Book, Bundle, and Note records from the database.
 * NEVER trusts client-supplied isDigital or isDigitalOnly flags in req.body.
 */
async function isServerOrderDigitalOnly(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return false;
  }

  for (const item of rawItems) {
    const details = await getAuthoritativeItemDetails(item);
    if (!details.found || !details.isDigital) {
      return false; // Missing, unknown, or physical -> order requires delivery address
    }
  }

  // All items verified digital against database records
  return true;
}

module.exports = {
  validateCourierAddress,
  isServerOrderDigitalOnly,
  isBookEntityDigital,
  isBundleEntityDigital,
  getAuthoritativeItemDetails
};
