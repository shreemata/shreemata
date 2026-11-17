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
 * Authoritatively determines on the server whether an order contains exclusively digital items
 * by looking up the actual Book, Bundle, and Note records from the database.
 * NEVER trusts client-supplied isDigital or isDigitalOnly flags in req.body.
 */
async function isServerOrderDigitalOnly(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return false;
  }

  const Book = mongoose.models.Book || require('../models/Book');
  const Bundle = mongoose.models.Bundle || require('../models/Bundle');
  let Note = null;
  try {
    Note = mongoose.models.Note || require('../models/Note');
  } catch (e) {
    Note = null;
  }

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const rawId = item.id || item._id || item.bookId || item.bundleId || item.noteId;
    const itemId = String(rawId || '').trim();
    const itemType = String(item.type || item.itemType || '').toLowerCase();

    // Check Note / digital section items
    if (itemType === 'note' || itemType === 'notes' || itemType === 'pdf') {
      if (Note && itemId && mongoose.Types.ObjectId.isValid(itemId)) {
        const noteDoc = await Note.findById(itemId).lean().catch(() => null);
        if (noteDoc) continue; // Verified note in DB
      }
      // If note or pdf item type specified without Note model, verify it doesn't match a physical book
      if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
        const bookDoc = await Book.findById(itemId).lean().catch(() => null);
        if (bookDoc && !isBookEntityDigital(bookDoc)) {
          return false; // Physical book masquerading as note/pdf
        }
      }
      continue;
    }

    // Check Bundle items
    if (itemType === 'bundle' || item.isBundle || item.bundleId) {
      if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
        return false; // Missing or malformed ID -> safe fallback to physical
      }
      const bundleDoc = await Bundle.findById(itemId).populate('books').lean().catch(() => null);
      if (!bundleDoc) {
        return false; // Not found -> safe fallback to physical
      }
      if (!isBundleEntityDigital(bundleDoc)) {
        return false; // Physical bundle -> order requires delivery address
      }
      continue;
    }

    // Default: Book item
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return false; // Missing or malformed ID -> safe fallback to physical
    }

    const bookDoc = await Book.findById(itemId).lean().catch(() => null);
    if (!bookDoc) {
      // Check if it exists in Note collection
      if (Note) {
        const noteDoc = await Note.findById(itemId).lean().catch(() => null);
        if (noteDoc) continue; // Verified note
      }
      return false; // Not found -> safe fallback to physical
    }

    // Authoritative check on DB document:
    if (!isBookEntityDigital(bookDoc)) {
      return false; // Physical book in database -> order requires delivery address!
    }
  }

  // All items verified digital against database records
  return true;
}

module.exports = {
  validateCourierAddress,
  isServerOrderDigitalOnly,
  isBookEntityDigital,
  isBundleEntityDigital
};
