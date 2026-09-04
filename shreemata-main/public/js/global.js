// Load and update cart count (Compatibility wrapper)
function updateCartCount() {
    if (typeof window.updateGlobalCartCount === "function") {
        return window.updateGlobalCartCount();
    }
    let cart = typeof getCart === 'function' ? getCart() : JSON.parse(localStorage.getItem("cart") || "[]");
    const countEl = document.getElementById("cartCount");

    if (countEl) {
        const totalItems = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
        countEl.textContent = totalItems;
    }
}

// Handle authentication UI (Compatibility wrapper)
function updateNavbarAuth() {
    if (typeof window.updateGlobalNavbarAuth === "function") {
        return window.updateGlobalNavbarAuth();
    }
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    const authLinks = document.getElementById("authLinks");
    const userLinks = document.getElementById("userLinks");
    const userName = document.getElementById("userName");
    const referralLink = document.getElementById("referralLink");
    const adminLink = document.getElementById("adminLink");

    if (token && user) {
        if (authLinks) authLinks.style.display = "none";
        if (userLinks) userLinks.style.display = "inline-flex";
        if (userName) userName.textContent = user.name || "Account";
        if (referralLink) referralLink.style.display = "inline-flex";
        if (adminLink) adminLink.style.display = user.role === "admin" ? "inline-flex" : "none";
    } else {
        if (authLinks) authLinks.style.display = "flex";
        if (userLinks) userLinks.style.display = "none";
        if (referralLink) referralLink.style.display = "none";
        if (adminLink) adminLink.style.display = "none";
    }
}

// Safe initialization (only if global-nav.js is not present)
document.addEventListener("DOMContentLoaded", () => {
    if (!window.__SM_GLOBAL_NAV_CONTROLLER) {
        updateCartCount();
        updateNavbarAuth();
    }
});
