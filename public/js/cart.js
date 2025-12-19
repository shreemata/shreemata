// cart.js - full working version with Razorpay checkout integration

document.addEventListener("DOMContentLoaded", () => {
    loadCart();
    setupCartActions();
    checkAuth();
    setupMobileFeatures();
});

/* ------------------------------
    Load Cart Items
------------------------------ */
async function loadCart() {
    // Show loading state
    const loading = document.getElementById("cartLoading");
    const empty = document.getElementById("emptyCart");
    const cartLayout = document.getElementById("cartLayout");
    
    if (loading) {
        loading.style.display = "block";
        if (empty) empty.style.display = "none";
        if (cartLayout) cartLayout.style.display = "none";
    }

    // Migrate old cart format if exists
    if (typeof migrateOldCart === 'function') {
        migrateOldCart();
    }
    
    let cart = getCart();

    const container = document.getElementById("cartContainer");
    const summary = document.getElementById("cartSummary");

    if (!container || !summary || !empty || !cartLayout) return;

    container.innerHTML = "";

    // Hide loading state
    if (loading) loading.style.display = "none";

    if (cart.length === 0) {
        empty.style.display = "block";
        cartLayout.style.display = "none";
        return;
    }

    empty.style.display = "none";
    cartLayout.style.display = "grid";

    // Fetch book weights from API
    await fetchBookWeights(cart);

    let total = 0;
    let totalWeight = 0;
    let totalPoints = 0;

    cart.forEach(item => {
        total += item.price * item.quantity;
        const itemWeight = (item.weight || 0.5) * item.quantity;
        totalWeight += itemWeight;
        totalPoints += (item.rewardPoints || 0) * item.quantity;

        const row = document.createElement("div");
        row.className = "cart-item";

        // Replace old placeholder URLs with inline SVG
        let imageUrl = item.coverImage;
        if (!imageUrl || imageUrl.includes('via.placeholder.com')) {
            imageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="250" height="300"%3E%3Crect fill="%23ddd" width="250" height="300"/%3E%3Ctext fill="%23999" font-family="Arial" font-size="20" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E' + (item.isBundle ? 'Bundle' : 'Book') + '%3C/text%3E%3C/svg%3E';
        }

        // Calculate points for this item
        const itemPoints = (item.rewardPoints || 0) * item.quantity;
        const pointsBadge = itemPoints > 0 
            ? `<div class="points-badge">🎁 +${itemPoints} Points</div>`
            : '';

        const bundleBadge = item.isBundle 
            ? `<span class="bundle-badge">Bundle</span>`
            : '';

        row.innerHTML = `
            <img src="${imageUrl}" class="cart-img" alt="${item.title}">

            <div class="cart-info">
                <h3>${item.title}${bundleBadge}</h3>
                <p>by ${item.author}</p>
                <p class="cart-price">₹${(item.price || 0).toFixed(2)}</p>
                <div class="weight-info">📦 ${(item.weight || 0.5).toFixed(2)} kg × ${item.quantity} = ${(itemWeight).toFixed(2)} kg</div>
                ${pointsBadge}
                
                <div class="cart-qty">
                    <button class="qty-btn" data-id="${item.id || item.bundleId}" data-action="minus">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" data-id="${item.id || item.bundleId}" data-action="plus">+</button>
                </div>

                <button class="remove-btn" data-id="${item.id || item.bundleId}">
                    🗑️ Remove
                </button>
            </div>
        `;

        container.appendChild(row);
    });

    // Calculate courier charge
    const courierCharge = calculateCourierCharge(totalWeight);
    const grandTotal = total + courierCharge;

    // Update cart summary with breakdown
    const cartTotalEl = document.getElementById("cartTotal");
    const pointsDisplay = totalPoints > 0 
        ? `<div class="points-summary">
               <div class="points-summary-content">
                   <span style="font-size: 24px;">🎁</span>
                   <span class="points-summary-title">You'll earn ${totalPoints} Points!</span>
               </div>
               <div class="points-summary-note">
                   Redeem 100 points for a virtual referral
               </div>
           </div>`
        : '';
    
    cartTotalEl.innerHTML = `
        <div class="summary-row">
            <span>Subtotal (${cart.length} items)</span>
            <span>₹${total.toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <span>📦 Shipping (${totalWeight.toFixed(2)} kg)</span>
            <span>₹${courierCharge.toFixed(2)}</span>
        </div>
        ${pointsDisplay}
        <div class="summary-row">
            <span>Total Amount</span>
            <span>₹${grandTotal.toFixed(2)}</span>
        </div>
    `;

    // Store courier info for checkout
    localStorage.setItem("courierInfo", JSON.stringify({
        totalWeight,
        courierCharge,
        grandTotal
    }));
}

/* ------------------------------
    Fetch Book Weights from API
------------------------------ */
async function fetchBookWeights(cart) {
    const API = window.API_URL || '';
    
    for (let item of cart) {
        // Fetch weight and reward points for individual books
        if (item.id && !item.isBundle) {
            try {
                const res = await fetch(`${API}/books/${item.id}`);
                const data = await res.json();
                if (data.book) {
                    if (data.book.weight) {
                        item.weight = data.book.weight;
                    }
                    if (data.book.rewardPoints !== undefined) {
                        item.rewardPoints = data.book.rewardPoints;
                    }
                }
            } catch (err) {
                console.error("Error fetching book data:", err);
                item.weight = item.weight || 0.5; // Default fallback
                item.rewardPoints = item.rewardPoints || 0;
            }
        }
        
        // Fetch weight and reward points for bundles
        if (item.bundleId && item.isBundle) {
            try {
                const res = await fetch(`${API}/bundles/${item.bundleId}`);
                const data = await res.json();
                if (data.bundle) {
                    if (data.bundle.weight) {
                        item.weight = data.bundle.weight;
                    } else if (data.bundle.books) {
                        // Calculate from books if weight not stored
                        item.weight = data.bundle.books.reduce((sum, book) => sum + (book.weight || 0.5), 0);
                    }
                    if (data.bundle.rewardPoints !== undefined) {
                        item.rewardPoints = data.bundle.rewardPoints;
                    }
                }
            } catch (err) {
                console.error("Error fetching bundle data:", err);
                // Fallback: estimate based on number of books if available
                if (item.books && item.books.length) {
                    item.weight = item.books.length * 0.5;
                } else {
                    item.weight = item.weight || 2; // Default bundle weight
                }
                item.rewardPoints = item.rewardPoints || 0;
            }
        }
        
        // Final fallback if still no weight or points
        if (!item.weight) {
            item.weight = item.isBundle ? 2 : 0.5;
        }
        if (item.rewardPoints === undefined) {
            item.rewardPoints = 0;
        }
    }
    
    // Update cart in localStorage with weights and points
    saveCart(cart);
}

/* ------------------------------
    Calculate Courier Charge
------------------------------ */
function calculateCourierCharge(totalWeight) {
    if (totalWeight <= 0) return 0;
    
    // ₹25 per kg (rounded up), max ₹100
    const charge = Math.ceil(totalWeight) * 25;
    return Math.min(charge, 100);
}

/* ------------------------------
    Cart Button Actions
------------------------------ */
function setupCartActions() {
    document.addEventListener("click", function (e) {

        // Quantity buttons
        if (e.target.classList.contains("qty-btn")) {
            const id = e.target.dataset.id;
            const action = e.target.dataset.action;
            updateQuantity(id, action);
        }

        // Remove button
        if (e.target.classList.contains("remove-btn")) {
            const id = e.target.dataset.id;
            removeFromCart(id);
        }

        // Checkout button
        if (e.target.id === "checkoutBtn") {
            checkout();
        }
    });
}

/* ------------------------------
    Update Quantity
------------------------------ */
async function updateQuantity(itemId, action) {
    let cart = getCart();

    const item = cart.find(i => i.id === itemId || i.bundleId === itemId);
    if (!item) return;

    if (action === "plus") item.quantity++;
    if (action === "minus" && item.quantity > 1) item.quantity--;

    saveCart(cart);
    await loadCart();
}

/* ------------------------------
    Remove Item
------------------------------ */
async function removeFromCart(itemId) {
    let cart = getCart();

    cart = cart.filter(item => item.id !== itemId && item.bundleId !== itemId);

    saveCart(cart);
    await loadCart();
}

/* ------------------------------
    Checkout Button (Check Offers First)
------------------------------ */
let currentOffer = null;

async function checkout() {
    const token = localStorage.getItem("token");
    const API = window.API_URL || '';

    if (!API) {
        alert("API configuration error. Please refresh the page.");
        return;
    }

    // If not logged in → redirect to login page
    if (!token) {
        localStorage.setItem("redirectAfterLogin", "/cart.html");
        window.location.href = "/login.html";
        return;
    }

    const cart = getCart();
    if (cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }

    // Calculate cart total (without courier charge for offer calculation)
    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Check for applicable offers (on items only, not courier)
    await checkApplicableOffers(cartTotal);
}

/* ------------------------------
    Check Applicable Offers
------------------------------ */
async function checkApplicableOffers(cartTotal) {
    const API = window.API_URL || window.location.origin + '/api';

    console.log("=== Checking Offers ===");
    console.log("API URL:", API);
    console.log("Cart Total:", cartTotal);

    try {
        const res = await fetch(`${API}/notifications/check-offers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartTotal })
        });

        console.log("Response status:", res.status);
        const data = await res.json();
        console.log("Response data:", data);

        if (data.applicableOffer) {
            console.log("✅ Offer found! Showing popup...");
            currentOffer = data;
            showOfferModal(data);
        } else {
            console.log("ℹ️ No applicable offer found. Going to address...");
            // No offer applicable, go directly to address
            currentOffer = null;
            await showAddressModal();
        }
    } catch (err) {
        console.error("❌ Error checking offers:", err);
        // Continue to address even if offer check fails
        currentOffer = null;
        await showAddressModal();
    }
}

/* ------------------------------
    Show Offer Modal
------------------------------ */
function showOfferModal(offerData) {
    console.log("=== Showing Offer Modal ===");
    console.log("Offer Data:", offerData);
    
    try {
        // Get courier info
        const courierInfo = JSON.parse(localStorage.getItem("courierInfo") || "{}");
        const courierCharge = courierInfo.courierCharge || 0;
        
        // Calculate final amount with courier
        const finalWithCourier = offerData.discountedAmount + courierCharge;
        
        document.getElementById("offerTitle").textContent = offerData.applicableOffer.title;
        document.getElementById("offerMessage").textContent = offerData.applicableOffer.message;
        document.getElementById("offerOriginalAmount").textContent = offerData.originalAmount.toFixed(2);
        document.getElementById("offerDiscount").textContent = offerData.savings.toFixed(2);
        
        // Update the final amount display to include courier charge breakdown
        const finalAmountEl = document.getElementById("offerFinalAmount");
        if (courierCharge > 0) {
            finalAmountEl.innerHTML = `
                ${offerData.discountedAmount.toFixed(2)}
                <div style="font-size: 14px; font-weight: normal; color: #666; margin-top: 5px;">
                    + ₹${courierCharge.toFixed(2)} courier charge
                </div>
                <div style="font-size: 18px; font-weight: 700; color: #28a745; margin-top: 5px;">
                    = ₹${finalWithCourier.toFixed(2)}
                </div>
            `;
        } else {
            finalAmountEl.textContent = offerData.discountedAmount.toFixed(2);
        }
        
        document.getElementById("offerModal").style.display = "block";
        console.log("✅ Offer modal displayed");
    } catch (error) {
        console.error("❌ Error showing offer modal:", error);
    }
}

function closeOfferModal() {
    document.getElementById("offerModal").style.display = "none";
    currentOffer = null;
}

async function acceptOfferAndContinue() {
    document.getElementById("offerModal").style.display = "none";
    await showAddressModal();
}

/* ------------------------------
    Show Address Modal
------------------------------ */
let userAddress = null;

async function showAddressModal() {
    const token = localStorage.getItem("token");
    const API = window.API_URL || '';

    try {
        // Fetch user address
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        
        if (data.user && data.user.address) {
            userAddress = data.user.address;
            
            document.getElementById("modalStreet").textContent = userAddress.street || "Not set";
            document.getElementById("modalTaluk").textContent = userAddress.taluk || "Not set";
            document.getElementById("modalDistrict").textContent = userAddress.district || "Not set";
            document.getElementById("modalState").textContent = userAddress.state || "Not set";
            document.getElementById("modalPincode").textContent = userAddress.pincode || "Not set";
            document.getElementById("modalPhone").textContent = userAddress.phone || "Not set";

            // Pre-fill edit form
            document.getElementById("editStreet").value = userAddress.street || "";
            document.getElementById("editTaluk").value = userAddress.taluk || "";
            document.getElementById("editDistrict").value = userAddress.district || "";
            document.getElementById("editState").value = userAddress.state || "";
            document.getElementById("editPincode").value = userAddress.pincode || "";
            document.getElementById("editPhone").value = userAddress.phone || "";
        }

        // Show modal with animation
        const modal = document.getElementById("addressModal");
        modal.style.display = "flex";
        setTimeout(() => modal.classList.add("show"), 10);

    } catch (err) {
        console.error("Error loading address:", err);
        alert("Error loading address. Please try again.");
    }
}

function closeAddressModal() {
    const modal = document.getElementById("addressModal");
    modal.classList.remove("show");
    setTimeout(() => modal.style.display = "none", 300);
    
    // Reset form visibility
    document.getElementById("addressEditForm").style.display = "none";
    document.getElementById("addressDisplay").style.display = "block";
}

function toggleAddressForm() {
    const form = document.getElementById("addressEditForm");
    const display = document.getElementById("addressDisplay");
    
    if (form.style.display === "none") {
        form.style.display = "block";
        display.style.display = "none";
    } else {
        form.style.display = "none";
        display.style.display = "block";
    }
}

// Handle address form submission
document.addEventListener("DOMContentLoaded", () => {
    const addressForm = document.getElementById("addressEditForm");
    if (addressForm) {
        addressForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await saveAddressFromModal();
        });
    }
});

async function saveAddressFromModal() {
    const token = localStorage.getItem("token");
    const API = window.API_URL || '';

    const address = {
        street: document.getElementById("editStreet").value.trim(),
        taluk: document.getElementById("editTaluk").value.trim(),
        district: document.getElementById("editDistrict").value.trim(),
        state: document.getElementById("editState").value.trim(),
        pincode: document.getElementById("editPincode").value.trim(),
        phone: document.getElementById("editPhone").value.trim()
    };

    try {
        const res = await fetch(`${API}/users/update-address`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ address })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Failed to update address");
            return;
        }

        userAddress = address;
        
        // Update display
        document.getElementById("modalStreet").textContent = address.street;
        document.getElementById("modalTaluk").textContent = address.taluk;
        document.getElementById("modalDistrict").textContent = address.district;
        document.getElementById("modalState").textContent = address.state;
        document.getElementById("modalPincode").textContent = address.pincode;
        document.getElementById("modalPhone").textContent = address.phone;

        alert("Address updated successfully!");
        toggleAddressForm();

    } catch (err) {
        console.error("Address update error:", err);
        alert("Error updating address");
    }
}

/* ------------------------------
    Proceed to Payment (with Address)
------------------------------ */
async function proceedToPayment() {
    const token = localStorage.getItem("token");
    const API = window.API_URL || '';

    // 🚨 MANDATORY ADDRESS VALIDATION
    if (!userAddress || !userAddress.street || !userAddress.taluk || !userAddress.district || !userAddress.state || !userAddress.pincode || !userAddress.phone) {
        alert("❌ Delivery address is required!\n\nPlease set your complete delivery address before proceeding with payment.\n\nYou will be redirected to your account page to set the address.");
        
        // Redirect to account page to set address
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    // Validate address fields are not empty
    const requiredFields = ['street', 'taluk', 'district', 'state', 'pincode', 'phone'];
    const emptyFields = requiredFields.filter(field => 
        !userAddress[field] || userAddress[field].toString().trim() === ''
    );

    if (emptyFields.length > 0) {
        alert(`❌ Please complete your delivery address!\n\nMissing: ${emptyFields.join(', ')}\n\nYou will be redirected to your account page to complete the address.`);
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    // Validate phone number format (Indian mobile numbers)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(userAddress.phone)) {
        alert("❌ Please enter a valid 10-digit Indian mobile number in your delivery address.");
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    // Validate pincode format
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(userAddress.pincode)) {
        alert("❌ Please enter a valid 6-digit pincode in your delivery address.");
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    console.log("✅ Address validation passed", userAddress);

    const cart = getCart();
    if (cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }

    // Close modal
    closeAddressModal();

    // Get courier info
    const courierInfo = JSON.parse(localStorage.getItem("courierInfo") || "{}");
    const courierCharge = courierInfo.courierCharge || 0;
    const totalWeight = courierInfo.totalWeight || 0;

    // calculate items total (in rupees)
    let itemsTotal = 0;
    cart.forEach(item => itemsTotal += item.price * item.quantity);
    
    // Add courier charge to total
    let total = itemsTotal + courierCharge;
    // Round to 2 decimals to avoid floating issues
    total = Math.round((total + Number.EPSILON) * 100) / 100;

    // UI feedback
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = "Processing...";
    }

    try {
        console.log("Creating order with:", { total, itemsCount: cart.length, hasAddress: !!userAddress });
        console.log("Cart items:", cart);
        console.log("Delivery address:", userAddress);
        
        // Clean up cart items for order creation
        const orderItems = cart.map(item => {
            if (item.isBundle || item.bundleId) {
                // Bundle item
                return {
                    id: item.bundleId,
                    title: item.title,
                    author: "Bundle",
                    price: item.price,
                    quantity: item.quantity,
                    coverImage: item.coverImage,
                    type: "bundle"
                };
            } else {
                // Regular book item
                return {
                    id: item.id,
                    title: item.title,
                    author: item.author || "Unknown",
                    price: item.price,
                    quantity: item.quantity,
                    coverImage: item.coverImage,
                    type: "book"
                };
            }
        });
        
        console.log("Cleaned order items:", orderItems);
        
        // Determine final amount (with offer if applicable)
        let finalAmount = total;
        let appliedOffer = null;
        
        if (currentOffer && currentOffer.applicableOffer) {
            // Offer applies to items only, then add courier charge
            finalAmount = currentOffer.discountedAmount + courierCharge;
            appliedOffer = {
                offerId: currentOffer.applicableOffer._id,
                offerTitle: currentOffer.applicableOffer.title,
                discountType: currentOffer.applicableOffer.offerDetails.discountType,
                discountValue: currentOffer.applicableOffer.offerDetails.discountValue,
                originalAmount: currentOffer.originalAmount,
                discountedAmount: currentOffer.discountedAmount,
                savings: currentOffer.savings
            };
            console.log("Applying offer:", appliedOffer);
            console.log("Final amount with courier:", finalAmount);
        }
        
        // 1) Create order on backend with address, offer, and courier info
        const createRes = await fetch(`${API}/payments/create-order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ 
                amount: finalAmount, 
                items: orderItems,
                deliveryAddress: userAddress,
                appliedOffer: appliedOffer,
                courierCharge: courierCharge,
                totalWeight: totalWeight
            })
        });

        const createData = await createRes.json();
        console.log("Create order response:", createData);

        if (!createRes.ok || !createData.order) {
            console.error("Create order failed:", createData);
            throw new Error(createData.error || createData.details || "Failed to create payment order");
        }

        const rzpOrder = createData.order; // contains id and amount (in paise)
        // Some Razorpay SDK fields expect amount in paise - rzpOrder.amount is already in paise

        // 2) Open Razorpay checkout
        // Fallback key - replace with your test key or expose via config
        const RZP_KEY = window.RAZORPAY_KEY || "rzp_live_RqJ96DOclW0PuU";

        const options = {
            key: RZP_KEY,
            amount: rzpOrder.amount, // amount in paise
            currency: rzpOrder.currency || "INR",
            name: "BookStore",
            description: "Purchase from BookStore",
            order_id: rzpOrder.id,
            handler: async function (response) {
                console.log("🔍 Razorpay payment handler called");
                console.log("   Payment ID:", response.razorpay_payment_id);
                console.log("   Order ID:", response.razorpay_order_id);
                
                try {
                    // 3) Verify payment on backend
                    console.log("🔍 Calling verify endpoint:", `${API}/payments/verify`);
                    const verifyRes = await fetch(`${API}/payments/verify`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + token
                        },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            items: orderItems,
                            totalAmount: total,
                            deliveryAddress: userAddress
                        })
                    });

                    console.log("🔍 Verify response status:", verifyRes.status);
                    const verifyData = await verifyRes.json();
                    console.log("🔍 Verify response data:", verifyData);

                    if (!verifyRes.ok) {
                        const msg = verifyData.error || "Payment verification failed";
                        alert(msg);
                        console.error("❌ Verify failed:", verifyData);
                        if (checkoutBtn) {
                            checkoutBtn.disabled = false;
                            checkoutBtn.textContent = "Checkout";
                        }
                        return;
                    }

if (!response.razorpay_payment_id) {
    alert("Payment failed or cancelled. Order not placed.");
    return;
}


                } catch (err) {
                    console.error("Error during payment verification:", err);
                    alert("Payment succeeded but verification failed. We'll investigate.");
                    if (checkoutBtn) {
                        checkoutBtn.disabled = false;
                        checkoutBtn.textContent = "Checkout";
                    }
                }
            },
            // if the user closes the popup without paying
            modal: {
                ondismiss: async function () {
                    console.log("Payment popup closed. No charge made.");

                    // Cancel the order in the backend
                    try {
                        const cancelRes = await fetch(`${API}/payments/cancel`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": "Bearer " + token
                            },
                            body: JSON.stringify({
                                razorpay_order_id: rzpOrder.id
                            })
                        });

                        if (cancelRes.ok) {
                            console.log("✅ Order cancelled successfully");
                        } else {
                            console.log("⚠️ Could not cancel order (may have already been processed)");
                        }
                    } catch (err) {
                        console.error("Error cancelling order:", err);
                    }

                    // Do NOT redirect, do NOT clear cart.
                    alert("Payment was cancelled. The order has NOT been placed.");

                    if (checkoutBtn) {
                        checkoutBtn.disabled = false;
                        checkoutBtn.textContent = "Checkout";
                    }
                }
            },
            prefill: {
                // You can prefill with logged-in user details if you store them
                name: (JSON.parse(localStorage.getItem("user") || "null") || {}).name || "",
                email: (JSON.parse(localStorage.getItem("user") || "null") || {}).email || ""
            },
            theme: {
                color: "#1e90ff"
            }
        };

        // open checkout
        const rzp = new Razorpay(options);
        rzp.open();

    } catch (err) {
        console.error("Checkout error:", err);
        alert(err.message || "Error initiating payment");
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = "Checkout";
        }
    }
}

/* ------------------------------
    Auth Check for Navbar
------------------------------ */
function checkAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (token && user) {
        const authLinks = document.getElementById("authLinks");
        const userLinks = document.getElementById("userLinks");

        if (authLinks) authLinks.style.display = "none";
        if (userLinks) userLinks.style.display = "flex";

        const userNameEl = document.getElementById("userName");
        if (userNameEl) userNameEl.textContent = `Hello, ${user.name}`;

        const accountLink = document.getElementById('accountLink');
        if (accountLink) accountLink.style.display = 'block';
    }
    
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.reload();
        });
    }
}
