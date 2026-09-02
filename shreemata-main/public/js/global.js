// Load and update cart count
function updateCartCount() {
    let cart = typeof getCart === 'function' ? getCart() : JSON.parse(localStorage.getItem("cart") || "[]");
    const countEl = document.getElementById("cartCount");

    if (countEl) {
        countEl.textContent = cart.length;
    }
}

// Handle authentication UI
function updateNavbarAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    const authLinks = document.getElementById("authLinks");
    const userLinks = document.getElementById("userLinks");
    const userName = document.getElementById("userName");
    const referralLink = document.getElementById("referralLink");

    if (token && user) {
        // Hide login/signup
        if (authLinks) authLinks.style.display = "none";

        // Show username + logout
        if (userLinks) userLinks.style.display = "inline-block";

        if (userName) userName.textContent = user.name;

        // ⭐ Show referral button
        if (referralLink) referralLink.style.display = "inline-block";

    } else {
        // Show login/signup links
        if (authLinks) authLinks.style.display = "inline-block";

        // Hide user section
        if (userLinks) userLinks.style.display = "none";

        // Hide referral button
        if (referralLink) referralLink.style.display = "none";
    }
}

// Run on page load
document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();
    updateNavbarAuth();
});
