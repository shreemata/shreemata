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
    if (typeof updateAllCartBadges === 'function') {
        updateAllCartBadges();
    }
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

    // Initial cart badge update on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateAllCartBadges);
    } else {
        updateAllCartBadges();
    }
}

/**
 * Update all cart badges across headers and navigation
 */
function updateAllCartBadges() {
    try {
        const cart = getCart();
        const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

        // Update all badges with id cartCount or class cart-count-badge
        const countElements = document.querySelectorAll('#cartCount, .cart-count-badge, [data-cart-count]');
        countElements.forEach(el => {
            el.textContent = totalItems;
        });

        // Update cartIcon or cartLink icons if they don't contain a child badge
        const cartIcons = document.querySelectorAll('#cartIcon, .cart-icon');
        cartIcons.forEach(icon => {
            if (!icon.querySelector('#cartCount') && !icon.querySelector('.cart-count-badge')) {
                if (totalItems > 0) {
                    icon.innerHTML = `🛒 Cart (${totalItems})`;
                } else {
                    icon.innerHTML = `🛒 Cart`;
                }
            }
        });

        const cartLink = document.getElementById('cartLink');
        if (cartLink && (window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '')) {
            cartLink.style.display = 'inline-flex';
        }
    } catch (e) {
        console.warn('[Cart] Error updating cart badges:', e);
    }
}

/**
 * Unified Cart Popup / Toast Notification
 * Shows a beautiful toast popup matching the site design when an item is added to cart
 */
function showCartNotification(options) {
    if (typeof options === 'string') {
        options = { message: options };
    }
    const {
        title = 'Added to Cart',
        message = 'Item successfully added to your cart.',
        count = null,
        type = 'success',
        duration = 4000
    } = (options || {});

    let displayCount = count;
    if (displayCount === null || displayCount === undefined) {
        try {
            const cart = getCart();
            displayCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        } catch (e) {
            displayCount = 1;
        }
    }

    // Remove existing notification toast if present
    const existing = document.getElementById('cartNotificationToast');
    if (existing) existing.remove();

    // Ensure animation style is injected
    if (!document.getElementById('cartToastStyles')) {
        const style = document.createElement('style');
        style.id = 'cartToastStyles';
        style.textContent = `
            @keyframes cartToastSlideIn {
                from { opacity: 0; transform: translateY(-24px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes cartToastFadeOut {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(-16px) scale(0.96); }
            }
            .cart-popup-toast {
                position: fixed !important;
                top: 24px !important;
                right: 24px !important;
                max-width: 440px !important;
                min-width: 320px !important;
                background: #ffffff !important;
                color: #1e293b !important;
                border-radius: 14px !important;
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
                border: 1px solid rgba(0, 0, 0, 0.08) !important;
                padding: 16px 20px !important;
                display: flex !important;
                align-items: center !important;
                gap: 14px !important;
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                animation: cartToastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
                box-sizing: border-box !important;
            }
        `;
        document.head.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.id = 'cartNotificationToast';
    toast.className = 'cart-popup-toast';
    toast.setAttribute('role', 'alert');

    const iconBg = type === 'error' ? '#fee2e2' : (type === 'warning' ? '#fef3c7' : '#dcfce7');
    const iconColor = type === 'error' ? '#dc2626' : (type === 'warning' ? '#d97706' : '#16a34a');
    const iconSymbol = type === 'error' ? '✕' : (type === 'warning' ? '⚠️' : '🛒');

    toast.innerHTML = `
        <div style="width: 42px; height: 42px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; font-weight: bold;">
            ${iconSymbol}
        </div>
        <div style="flex: 1; min-width: 0;">
            <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">${title}</div>
            <div style="font-size: 13.5px; color: #475569; line-height: 1.4; word-break: break-word;">${message}</div>
            ${displayCount !== null ? `<div style="font-size: 12px; font-weight: 600; color: #2563eb; margin-top: 4px;">Cart count: ${displayCount} item${displayCount === 1 ? '' : 's'}</div>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <a href="/cart.html" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; white-space: nowrap; transition: transform 0.15s ease;">
                View Cart
            </a>
            <button type="button" aria-label="Close" style="background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 4px; line-height: 1; border-radius: 4px;">
                ✕
            </button>
        </div>
    `;

    const closeBtn = toast.querySelector('button');
    if (closeBtn) {
        closeBtn.onclick = () => {
            toast.style.animation = 'cartToastFadeOut 0.25s ease forwards';
            setTimeout(() => toast.remove(), 250);
        };
    }

    document.body.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'cartToastFadeOut 0.25s ease forwards';
                setTimeout(() => toast.remove(), 250);
            }
        }, duration);
    }
}

// Global exports
if (typeof window !== 'undefined') {
    window.showCartNotification = showCartNotification;
    window.showCartToast = showCartNotification;
    window.updateAllCartBadges = updateAllCartBadges;
}
