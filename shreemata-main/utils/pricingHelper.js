/**
 * Pricing Helper Utility
 * Computes customer display pricing for books with offer/discount support.
 */

function getBookDisplayPricing(book) {
  if (!book || typeof book !== 'object') {
    return {
      hasOffer: false,
      mrp: 0,
      sellingPrice: 0,
      discountAmount: 0,
      discountPercentage: 0
    };
  }

  const rawPhysical = (book.physicalPrice !== undefined && book.physicalPrice !== null && !isNaN(Number(book.physicalPrice)))
    ? Number(book.physicalPrice)
    : ((book.price !== undefined && book.price !== null && !isNaN(Number(book.price))) ? Number(book.price) : 0);

  const rawSelling = (book.sellingPrice !== undefined && book.sellingPrice !== null && !isNaN(Number(book.sellingPrice)))
    ? Number(book.sellingPrice)
    : ((book.price !== undefined && book.price !== null && !isNaN(Number(book.price))) ? Number(book.price) : 0);

  const mrp = Math.max(0, rawPhysical);
  const sellingPrice = Math.max(0, rawSelling);
  const isEnabled = book.discountEnabled === true || book.discountEnabled === 'true';

  const hasOffer = isEnabled && mrp > sellingPrice && sellingPrice > 0;

  if (hasOffer) {
    const discountAmount = Number((mrp - sellingPrice).toFixed(2));
    const discountPercentage = Math.round((discountAmount / mrp) * 100);
    return {
      hasOffer: true,
      mrp,
      sellingPrice,
      discountAmount,
      discountPercentage
    };
  }

  const finalPrice = sellingPrice > 0 ? sellingPrice : mrp;
  return {
    hasOffer: false,
    mrp: finalPrice,
    sellingPrice: finalPrice,
    discountAmount: 0,
    discountPercentage: 0
  };
}

module.exports = { getBookDisplayPricing };
