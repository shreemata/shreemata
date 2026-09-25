let API_URL = "";

const origin = window.location.origin;

console.log('🔧 Config.js loading - origin:', origin);

// If not localhost → hosted mode
if (!origin.includes("localhost")) {
    // Use main domain with /api path
    API_URL = origin + "/api";
}
// Local development
else {
    API_URL = "http://localhost:3000/api";
}

console.log("🔧 API_URL Loaded:", API_URL);

// Prevent multiple assignments
if (window.API_URL && window.API_URL !== API_URL) {
    console.warn('⚠️ API_URL already exists with different value:', window.API_URL, 'vs', API_URL);
}

window.API_URL = API_URL;
window.RAZORPAY_KEY = window.RAZORPAY_KEY || "rzp_live_TYHRMUCCtwZWzQ";

// Global HTML sanitization helper function
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function escapehtml(str) {
    return escapeHtml(str);
}
window.escapeHtml = escapeHtml;
window.escapehtml = escapehtml;

// Centralized Store Details for Pickup & Order Communications
window.STORE_DETAILS = {
    name: 'Shree Mata Publication Center',
    branch: 'Main Branch',
    city: 'Hubballi',
    state: 'Karnataka',
    address: 'Main Branch, Hubballi, Karnataka',
    phone: '+91 9886086278'
};

// Customer-facing book offer & discount display pricing helper
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

window.getBookDisplayPricing = getBookDisplayPricing;
