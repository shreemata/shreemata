/**
 * Shared Payment Verification Helper.
 * Checks whether an order's payment has been verified.
 * 
 * Verifies real payment fields:
 * - order.paymentStatus ('completed' or 'verified')
 * - order.paymentDetails.status ('verified')
 * - order.status ('completed' or 'verified' for backward compatibility)
 * 
 * @param {Object} order - Order document
 * @returns {Boolean} True if payment is verified, false otherwise
 */
function isPaymentVerified(order) {
  if (!order) return false;

  const paymentStatus = String(order.paymentStatus || '').toLowerCase().trim();
  const paymentDetailsStatus = String(order.paymentDetails?.status || '').toLowerCase().trim();
  const legacyStatus = String(order.status || '').toLowerCase().trim();

  if (paymentStatus === 'completed' || paymentStatus === 'verified') return true;
  if (paymentDetailsStatus === 'verified') return true;

  const hasLegacyPaymentEvidence =
    Boolean(order.paymentDetails?.razorpayPaymentId) ||
    Boolean(order.paymentDetails?.paymentId) ||
    Boolean(order.paymentDetails?.utrNumber);

  if (
    hasLegacyPaymentEvidence &&
    (legacyStatus === 'completed' || legacyStatus === 'verified')
  ) {
    return true;
  }

  return false;
}

module.exports = {
  isPaymentVerified
};
