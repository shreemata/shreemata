// cartUtils.js - Utility functions for user-specific cart management

/**
 * Get the cart key for the current user
 * Returns user-specific key if logged in, or guest cart key if not
 */
function getCartKey() {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    
    // Try both _id and id (MongoDB uses _id, but some systems use id)
    const userId = user?._id || user?.id;
    
    if (user && userId) {
        const key = `cart_${userId}`;
        console.log(`[Cart] ✅ Using user cart: ${key} (User: ${user.name})`);
        return key;
    }
    console.log("[Cart] 👤 Using guest cart: cart_guest");
    return "cart_guest";
}

/**
 * Get cart for current user
 */
function getCart() {
    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey) || "[]");
    console.log(`[Cart] Retrieved ${cart.length} items from ${cartKey}`);
    return cart;
}

/**
 * Save cart for current user
 */
function saveCart(cart) {
    const cartKey = getCartKey();
    localStorage.setItem(cartKey, JSON.stringify(cart));
    console.log(`[Cart] Saved ${cart.length} items to ${cartKey}`);
}

/**
 * Clear cart for current user
 */
function clearCart() {
    const cartKey = getCartKey();
    localStorage.removeItem(cartKey);
}

/**
 * Migrate guest cart to user cart after login
 * Call this after successful login/signup
 */
function migrateGuestCartToUser() {
    const guestCart = JSON.parse(localStorage.getItem("cart_guest") || "[]");
    
    if (guestCart.length > 0) {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        if (user && user._id) {
            const userCartKey = `cart_${user._id}`;
            const existingUserCart = JSON.parse(localStorage.getItem(userCartKey) || "[]");
            
            // Merge guest cart with user cart (avoid duplicates)
            const mergedCart = [...existingUserCart];
            
            guestCart.forEach(guestItem => {
                const itemId = guestItem.id || guestItem.bundleId;
                const exists = mergedCart.find(item => 
                    (item.id === itemId) || (item.bundleId === itemId)
                );
                
                if (!exists) {
                    mergedCart.push(guestItem);
                }
            });
            
            localStorage.setItem(userCartKey, JSON.stringify(mergedCart));
            localStorage.removeItem("cart_guest"); // Clear guest cart
            
            console.log("Guest cart migrated to user cart");
        }
    }
}

/**
 * Clean up old cart format (for backward compatibility)
 * Migrates old "cart" key to new user-specific format
 */
function migrateOldCart() {
    const oldCart = localStorage.getItem("cart");
    if (oldCart) {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        if (user && user._id) {
            const userCartKey = `cart_${user._id}`;
            if (!localStorage.getItem(userCartKey)) {
                localStorage.setItem(userCartKey, oldCart);
            }
        } else {
            // Move to guest cart
            if (!localStorage.getItem("cart_guest")) {
                localStorage.setItem("cart_guest", oldCart);
            }
        }
        localStorage.removeItem("cart"); // Remove old format
        console.log("Old cart format migrated");
    }
}

/**
 * Force cleanup of old cart format
 * This ensures the old "cart" key is completely removed
 */
function forceCleanupOldCart() {
    // Always remove the old "cart" key to prevent conflicts
    if (localStorage.getItem("cart")) {
        console.log("[Cart] Removing old 'cart' key to prevent conflicts");
        localStorage.removeItem("cart");
    }
}

// Auto-run migration and cleanup when script loads
if (typeof window !== 'undefined') {
    migrateOldCart();
    forceCleanupOldCart();
    
    // Also run cleanup periodically to catch any stray writes
    setInterval(forceCleanupOldCart, 1000);
}
