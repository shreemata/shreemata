// utils/deliveryAddressValidator.js
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

module.exports = {
  validateCourierAddress
};
