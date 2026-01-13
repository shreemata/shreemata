// cart.js - full working version with Razorpay checkout integration

document.addEventListener("DOMContentLoaded", () => {
    loadCart();
    setupCartActions();
    checkAuth();
    setupMobileFeatures();
    loadStoreDetails(); // Load store details for pickup option
    
    // Set up delivery method listeners after a short delay to ensure HTML is loaded
    setTimeout(() => {
        setupDeliveryMethodListeners();
        // Also update cart summary to ensure delivery charges are calculated
        setTimeout(() => {
            updateCartSummary();
        }, 1000);
    }, 500);
});

/* ------------------------------
    Load Store Details for Pickup
------------------------------ */
async function loadStoreDetails() {
    console.log('🔍 Loading store details...');
    
    // Default fallback values
    const defaultStoreDetails = {
        storeAddress: 'Main Road, Your City',
        storeHours: 'Mon-Sat 10AM-8PM, Sun 11AM-6PM',
        storePhone: '+91 9449171605',
        pickupInstructions: "We'll call you when your order is ready for pickup!",
        storeMapLink: ''
    };
    
    try {
        const API = window.API_URL || '';
        console.log('🔍 API URL:', API);
        console.log('🔍 Fetching from:', `${API}/store-details`);
        
        const response = await fetch(`${API}/store-details`);
        console.log('🔍 Response status:', response.status);
        
        if (response.ok) {
            const storeDetails = await response.json();
            console.log('🏪 Store details received:', storeDetails);
            
            // Update store details in the pickup section
            const addressEl = document.getElementById('storeAddressDisplay');
            const hoursEl = document.getElementById('storeHoursDisplay');
            const phoneEl = document.getElementById('storePhoneDisplay');
            const instructionsEl = document.getElementById('pickupInstructionsDisplay');
            
            if (addressEl) addressEl.textContent = storeDetails.storeAddress || defaultStoreDetails.storeAddress;
            if (hoursEl) hoursEl.textContent = storeDetails.storeHours || defaultStoreDetails.storeHours;
            if (phoneEl) phoneEl.textContent = storeDetails.storePhone || defaultStoreDetails.storePhone;
            if (instructionsEl) instructionsEl.textContent = storeDetails.pickupInstructions || defaultStoreDetails.pickupInstructions;
            
            // Handle map link
            const mapLinkContainer = document.getElementById('mapLinkContainer');
            const mapLinkButton = document.getElementById('mapLinkButton');
            
            if (mapLinkContainer && mapLinkButton) {
                if (storeDetails.storeMapLink && storeDetails.storeMapLink.trim()) {
                    mapLinkButton.href = storeDetails.storeMapLink;
                    mapLinkContainer.style.display = 'block';
                } else {
                    mapLinkContainer.style.display = 'none';
                }
            }
            
            console.log('✅ Store details loaded successfully');
        } else {
            console.warn('⚠️ Failed to load store details, response not ok:', response.status);
            loadDefaultStoreDetails(defaultStoreDetails);
        }
    } catch (error) {
        console.error('❌ Error loading store details:', error);
        loadDefaultStoreDetails(defaultStoreDetails);
    }
}

function loadDefaultStoreDetails(defaultStoreDetails) {
    console.log('🔄 Loading default store details...');
    
    const addressEl = document.getElementById('storeAddressDisplay');
    const hoursEl = document.getElementById('storeHoursDisplay');
    const phoneEl = document.getElementById('storePhoneDisplay');
    const instructionsEl = document.getElementById('pickupInstructionsDisplay');
    const mapLinkContainer = document.getElementById('mapLinkContainer');
    
    if (addressEl) addressEl.textContent = defaultStoreDetails.storeAddress;
    if (hoursEl) hoursEl.textContent = defaultStoreDetails.storeHours;
    if (phoneEl) phoneEl.textContent = defaultStoreDetails.storePhone;
    if (instructionsEl) instructionsEl.textContent = defaultStoreDetails.pickupInstructions;
    if (mapLinkContainer) mapLinkContainer.style.display = 'none';
    
    console.log('✅ Default store details loaded');
}

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
    let totalCashback = 0;

    cart.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;
        total += itemPrice * item.quantity;
        const itemWeight = (parseFloat(item.weight) || 0.5) * item.quantity;
        totalWeight += itemWeight;
        totalPoints += (parseInt(item.rewardPoints) || 0) * item.quantity;
        
        // Calculate cashback for this item
        let itemCashback = 0;
        const cashbackAmount = parseFloat(item.cashbackAmount) || 0;
        const cashbackPercentage = parseFloat(item.cashbackPercentage) || 0;
        
        if (cashbackAmount > 0) {
            itemCashback = cashbackAmount * item.quantity;
        } else if (cashbackPercentage > 0) {
            itemCashback = (itemPrice * cashbackPercentage / 100) * item.quantity;
        }
        totalCashback += itemCashback;

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
                <p class="cart-price">₹${(parseFloat(item.price) || 0).toFixed(2)}</p>
                <div class="weight-info">📦 ${(parseFloat(item.weight) || 0.5).toFixed(2)} kg × ${item.quantity} = ${itemWeight.toFixed(2)} kg</div>
                ${pointsBadge}
                
                <div class="cart-qty">
                    <button class="qty-btn" data-id="${item.id || item.bundleId}" data-action="minus">-</button>
                    <input type="number" class="qty-input" data-id="${item.id || item.bundleId}" value="${item.quantity}" min="1" max="99">
                    <button class="qty-btn" data-id="${item.id || item.bundleId}" data-action="plus">+</button>
                </div>

                <button class="remove-btn" data-id="${item.id || item.bundleId}">
                    🗑️ Remove
                </button>
            </div>
        `;

        container.appendChild(row);
    });

    // Calculate shipping using the dynamic shipping calculator
    let shippingResult = { cost: 50, isFree: false }; // Default fallback
    
    if (window.dynamicShipping) {
        try {
            const dynamicResult = await window.dynamicShipping.calculateCartShipping(cart);
            shippingResult = {
                cost: dynamicResult.shippingCost,
                isFree: dynamicResult.shippingCost === 0,
                breakdown: {
                    calculation: dynamicResult.breakdown
                }
            };
        } catch (error) {
            console.error('Error calculating dynamic cart shipping (loadCart):', error);
        }
    } else if (window.shippingCalculator) {
        shippingResult = window.shippingCalculator.calculateCartShipping(cart);
    }
    
    // Update delivery method display with actual shipping costs
    updateDeliveryChargeDisplay(shippingResult.cost);
    
    // Get selected delivery method
    const deliveryMethod = getSelectedDeliveryMethod();
    let courierCharge = deliveryMethod === 'pickup' ? 0 : shippingResult.cost;
    
    console.log('📦 Shipping calculation:', {
        deliveryMethod,
        originalShippingCost: shippingResult.cost,
        finalCourierCharge: courierCharge,
        isPickup: deliveryMethod === 'pickup'
    });
    
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
    
    // Shipping info display based on delivery method
    let shippingInfo, shippingDetails;
    
    if (deliveryMethod === 'pickup') {
        shippingInfo = `<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>`;
        shippingDetails = `<small style="color: #28a745; display: block; margin-top: 2px;">Store pickup - No delivery charge!</small>`;
    } else {
        shippingInfo = shippingResult.isFree 
            ? `<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>`
            : `<span>₹${courierCharge.toFixed(2)}</span>`;
        shippingDetails = shippingResult.breakdown 
            ? `<small style="color: #666; display: block; margin-top: 2px;">${shippingResult.breakdown.calculation || shippingResult.breakdown.reason || ''}</small>`
            : '';
    }
    
    cartTotalEl.innerHTML = `
        <div class="summary-row">
            <span>Subtotal (${cart.length} items)</span>
            <span>₹${total.toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <div>
                <span>${deliveryMethod === 'pickup' ? '🏪 Store Pickup' : '📦 Shipping'} (${totalWeight.toFixed(2)} kg)</span>
                ${shippingDetails}
            </div>
            ${shippingInfo}
        </div>
        ${pointsDisplay}
        ${cashbackDisplay}
        <div class="summary-row total-row" style="border-top: 2px solid #eee; padding-top: 10px; margin-top: 10px; font-weight: 700; font-size: 18px;">
            <span>Total Amount</span>
            <span>₹${grandTotal.toFixed(2)}</span>
        </div>
    `;

    // Store courier info for checkout
    localStorage.setItem("courierInfo", JSON.stringify({
        totalWeight,
        courierCharge,
        grandTotal,
        deliveryMethod
    }));
}

/* ------------------------------
    Update Cart Totals Only (without reloading items)
------------------------------ */
async function updateCartTotals() {
    const cart = getCart();
    if (cart.length === 0) return;

    let total = 0;
    let totalWeight = 0;
    let totalPoints = 0;
    let totalCashback = 0;

    cart.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;
        total += itemPrice * item.quantity;
        const itemWeight = (parseFloat(item.weight) || 0.5) * item.quantity;
        totalWeight += itemWeight;
        totalPoints += (parseInt(item.rewardPoints) || 0) * item.quantity;
        
        // Calculate cashback for this item
        let itemCashback = 0;
        const cashbackAmount = parseFloat(item.cashbackAmount) || 0;
        const cashbackPercentage = parseFloat(item.cashbackPercentage) || 0;
        
        if (cashbackAmount > 0) {
            itemCashback = cashbackAmount * item.quantity;
        } else if (cashbackPercentage > 0) {
            itemCashback = (itemPrice * cashbackPercentage / 100) * item.quantity;
        }
        totalCashback += itemCashback;
    });

    // Calculate shipping using the dynamic shipping calculator
    let shippingResult = { cost: 50, isFree: false }; // Default fallback
    
    if (window.dynamicShipping) {
        try {
            const dynamicResult = await window.dynamicShipping.calculateCartShipping(cart);
            shippingResult = {
                cost: dynamicResult.shippingCost,
                isFree: dynamicResult.shippingCost === 0,
                breakdown: {
                    calculation: dynamicResult.breakdown
                }
            };
        } catch (error) {
            console.error('Error calculating dynamic cart shipping (updateCartTotals):', error);
        }
    } else if (window.shippingCalculator) {
        shippingResult = window.shippingCalculator.calculateCartShipping(cart);
    }
    
    // Update delivery method display with actual shipping costs
    updateDeliveryChargeDisplay(shippingResult.cost);
    
    // Get selected delivery method
    const deliveryMethod = getSelectedDeliveryMethod();
    let courierCharge = deliveryMethod === 'pickup' ? 0 : shippingResult.cost;
    
    console.log('📦 Shipping calculation (totals only):', {
        deliveryMethod,
        originalShippingCost: shippingResult.cost,
        finalCourierCharge: courierCharge,
        isPickup: deliveryMethod === 'pickup'
    });
    
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
    
    // Shipping info display based on delivery method
    let shippingInfo, shippingDetails;
    
    if (deliveryMethod === 'pickup') {
        shippingInfo = `<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>`;
        shippingDetails = `<small style="color: #28a745; display: block; margin-top: 2px;">Store pickup - No delivery charge!</small>`;
    } else {
        shippingInfo = shippingResult.isFree 
            ? `<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>`
            : `<span>₹${courierCharge.toFixed(2)}</span>`;
        shippingDetails = shippingResult.breakdown 
            ? `<small style="color: #666; display: block; margin-top: 2px;">${shippingResult.breakdown.calculation || shippingResult.breakdown.reason || ''}</small>`
            : '';
    }
    
    const cashbackDisplay = totalCashback > 0 
        ? `<div class="cashback-summary">
               <div class="cashback-summary-content">
                   <span style="font-size: 24px;">💰</span>
                   <span class="cashback-summary-title">You'll get ₹${totalCashback.toFixed(0)} Cashback!</span>
               </div>
               <div class="cashback-summary-note">
                   Instant cashback to your wallet
               </div>
           </div>`
        : '';
    
    if (cartTotalEl) {
        cartTotalEl.innerHTML = `
            <div class="summary-row">
                <span>Subtotal (${cart.length} items)</span>
                <span>₹${total.toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <div>
                    <span>${deliveryMethod === 'pickup' ? '🏪 Store Pickup' : '📦 Shipping'} (${totalWeight.toFixed(2)} kg)</span>
                    ${shippingDetails}
                </div>
                ${shippingInfo}
            </div>
            ${pointsDisplay}
            ${cashbackDisplay}
            <div class="summary-row total-row" style="border-top: 2px solid #eee; padding-top: 10px; margin-top: 10px; font-weight: 700; font-size: 18px;">
                <span>Total Amount</span>
                <span>₹${grandTotal.toFixed(2)}</span>
            </div>
        `;
    }

    // Store courier info for checkout
    localStorage.setItem("courierInfo", JSON.stringify({
        totalWeight,
        courierCharge,
        grandTotal,
        deliveryMethod
    }));
}

/* ------------------------------
    Delivery Method Functions
------------------------------ */
function getSelectedDeliveryMethod() {
    const selectedMethod = document.querySelector('input[name="deliveryMethod"]:checked');
    const method = selectedMethod ? selectedMethod.value : 'home';
    console.log('🚚 Selected delivery method:', method);
    return method;
}

let deliveryListenersSetup = false; // Flag to prevent duplicate listeners

function setupDeliveryMethodListeners() {
    // Prevent setting up listeners multiple times
    if (deliveryListenersSetup) {
        console.log('🚚 Delivery listeners already set up, skipping...');
        return;
    }
    
    const deliveryOptions = document.querySelectorAll('input[name="deliveryMethod"]');
    const storeInfo = document.getElementById('storeInfo');
    
    if (deliveryOptions.length === 0) {
        console.log('🚚 No delivery options found, will retry later...');
        return;
    }
    
    console.log('🚚 Setting up delivery method listeners...');
    
    deliveryOptions.forEach(option => {
        option.addEventListener('change', async () => {
            console.log('🚚 Delivery method changed to:', option.value);
            
            // Show/hide store info based on selection
            if (option.value === 'pickup' && option.checked) {
                if (storeInfo) storeInfo.style.display = 'block';
            } else if (option.value === 'home' && option.checked) {
                if (storeInfo) storeInfo.style.display = 'none';
            }
            
            // Update only totals, don't reload entire cart
            await updateCartTotals();
        });
    });
    
    deliveryListenersSetup = true;
    console.log('✅ Delivery method listeners set up successfully');
}

function updateDeliveryChargeDisplay(shippingCost) {
    // Update the delivery method display with actual shipping costs
    const homeDeliveryCharge = document.getElementById('homeDeliveryCharge');
    const pickupSavings = document.getElementById('pickupSavings');
    const homeDeliveryChargeDisplay = document.getElementById('homeDeliveryChargeDisplay');
    const pickupSavingsDisplay = document.getElementById('pickupSavingsDisplay');
    
    if (homeDeliveryCharge && pickupSavings) {
        homeDeliveryCharge.textContent = shippingCost.toFixed(0);
        pickupSavings.textContent = shippingCost.toFixed(0);
        
        // Update display based on whether shipping is free
        if (shippingCost === 0) {
            if (homeDeliveryChargeDisplay) {
                homeDeliveryChargeDisplay.innerHTML = '<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>';
            }
            if (pickupSavingsDisplay) {
                pickupSavingsDisplay.innerHTML = '<span style="color: #28a745; font-weight: 600;">FREE</span>';
            }
        } else {
            if (homeDeliveryChargeDisplay) {
                homeDeliveryChargeDisplay.innerHTML = `+ ₹<span id="homeDeliveryCharge">${shippingCost.toFixed(0)}</span>`;
            }
            if (pickupSavingsDisplay) {
                pickupSavingsDisplay.innerHTML = `FREE (Save ₹<span id="pickupSavings">${shippingCost.toFixed(0)}</span>!)`;
            }
        }
    }
}

function updateDeliveryMethodDisplay() {
    const selectedMethod = document.querySelector('input[name="deliveryMethod"]:checked');
    const storeInfo = document.getElementById('storeInfo');
    
    if (!selectedMethod) return;
    
    console.log('🚚 Delivery method changed to:', selectedMethod.value);
    
    // Show/hide store info based on selection
    if (selectedMethod.value === 'pickup' && storeInfo) {
        storeInfo.style.display = 'block';
    } else if (selectedMethod.value === 'home' && storeInfo) {
        storeInfo.style.display = 'none';
    }
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
    Calculate Courier Charge (Dynamic)
------------------------------ */
async function calculateCourierCharge(totalWeight) {
    if (totalWeight <= 0) return 0;
    
    // Use dynamic shipping calculator
    if (window.dynamicShipping) {
        try {
            return await window.dynamicShipping.calculateShippingCharge(totalWeight);
        } catch (error) {
            console.error('Error calculating dynamic shipping:', error);
        }
    }
    
    // Fallback to hardcoded calculation
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
            e.preventDefault(); // Prevent any default behavior
            const id = e.target.dataset.id;
            const action = e.target.dataset.action;
            
            if (id && action) {
                updateQuantity(id, action);
            }
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

    // Add event listener for quantity input changes
    document.addEventListener("change", function (e) {
        if (e.target.classList.contains("qty-input")) {
            const id = e.target.dataset.id;
            const newQuantity = parseInt(e.target.value);
            updateQuantityDirect(id, newQuantity);
        }
    });

    // Add event listener for real-time quantity input changes (as user types)
    let inputTimeout;
    document.addEventListener("input", function (e) {
        if (e.target.classList.contains("qty-input")) {
            const id = e.target.dataset.id;
            const newQuantity = parseInt(e.target.value);
            
            // Clear previous timeout
            clearTimeout(inputTimeout);
            
            // Only update if it's a valid number, with a small delay to avoid too many updates
            if (!isNaN(newQuantity) && newQuantity > 0) {
                inputTimeout = setTimeout(() => {
                    updateQuantityDirect(id, newQuantity);
                }, 300); // 300ms delay
            }
        }
    });

    // Add event listener for quantity input blur (when user clicks away)
    document.addEventListener("blur", function (e) {
        if (e.target.classList.contains("qty-input")) {
            const id = e.target.dataset.id;
            const newQuantity = parseInt(e.target.value);
            updateQuantityDirect(id, newQuantity);
        }
    }, true);

    // Add event listener for Enter key on quantity input
    document.addEventListener("keypress", function (e) {
        if (e.target.classList.contains("qty-input") && e.key === "Enter") {
            e.target.blur(); // This will trigger the blur event above
        }
    });

    // Add event listener for delivery method changes
    document.addEventListener("change", function (e) {
        if (e.target.name === "deliveryMethod") {
            updateDeliveryMethodDisplay();
            updateCartSummary(); // Update prices when delivery method changes
        }
    });
}

/* ------------------------------
    Handle Quantity Click (Fallback)
------------------------------ */
/* ------------------------------
    Update Quantity
------------------------------ */
async function updateQuantity(itemId, action) {
    let cart = getCart();

    const item = cart.find(i => i.id === itemId || i.bundleId === itemId);
    if (!item) {
        return;
    }

    if (action === "plus") item.quantity++;
    if (action === "minus" && item.quantity > 1) item.quantity--;

    saveCart(cart);
    
    // Update display in real-time without full reload
    await updateCartDisplayRealTime();
}

/* ------------------------------
    Update Quantity Direct Input
------------------------------ */
async function updateQuantityDirect(itemId, newQuantity) {
    let cart = getCart();

    const item = cart.find(i => i.id === itemId || i.bundleId === itemId);
    if (!item) return;

    // Validate quantity
    if (isNaN(newQuantity) || newQuantity < 1) {
        newQuantity = 1;
    } else if (newQuantity > 99) {
        newQuantity = 99;
    }

    // Only update if quantity actually changed
    if (item.quantity !== newQuantity) {
        item.quantity = newQuantity;
        saveCart(cart);
        
        // Update the input field to show corrected value
        const inputField = document.querySelector(`.qty-input[data-id="${itemId}"]`);
        if (inputField) {
            inputField.value = newQuantity;
        }
        
        // Update display in real-time without full reload
        await updateCartDisplayRealTime();
    }
}

/* ------------------------------
    Update Cart Display Real-Time
------------------------------ */
async function updateCartDisplayRealTime() {
    const cart = getCart();
    
    if (cart.length === 0) {
        // If cart is empty, reload to show empty state
        await loadCart();
        return;
    }

    // Update individual item displays
    cart.forEach(item => {
        const itemId = item.id || item.bundleId;
        const itemWeight = (item.weight || 0.5) * item.quantity;
        
        // Update quantity input field
        const quantityInput = document.querySelector(`.qty-input[data-id="${itemId}"]`);
        if (quantityInput) {
            quantityInput.value = item.quantity;
        }
        
        // Update weight display
        const weightDisplay = document.querySelector(`[data-id="${itemId}"]`)?.closest('.cart-item')?.querySelector('.weight-info');
        if (weightDisplay) {
            weightDisplay.innerHTML = `📦 ${(item.weight || 0.5).toFixed(2)} kg × ${item.quantity} = ${itemWeight.toFixed(2)} kg`;
        }
        
        // Update points display if exists
        const itemPoints = (item.rewardPoints || 0) * item.quantity;
        const pointsBadge = document.querySelector(`[data-id="${itemId}"]`)?.closest('.cart-item')?.querySelector('.points-badge');
        if (pointsBadge && itemPoints > 0) {
            pointsBadge.innerHTML = `🎁 +${itemPoints} Points`;
        }
    });

    // Update cart summary and totals
    await updateCartSummary();
}

/* ------------------------------
    Update Cart Summary
------------------------------ */
async function updateCartSummary() {
    const cart = getCart();
    let total = 0;
    let totalWeight = 0;
    let totalPoints = 0;
    let totalCashback = 0;

    // Calculate totals
    cart.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;
        total += itemPrice * item.quantity;
        const itemWeight = (parseFloat(item.weight) || 0.5) * item.quantity;
        totalWeight += itemWeight;
        totalPoints += (parseInt(item.rewardPoints) || 0) * item.quantity;
        
        // Calculate cashback for this item
        let itemCashback = 0;
        const cashbackAmount = parseFloat(item.cashbackAmount) || 0;
        const cashbackPercentage = parseFloat(item.cashbackPercentage) || 0;
        
        if (cashbackAmount > 0) {
            itemCashback = cashbackAmount * item.quantity;
        } else if (cashbackPercentage > 0) {
            itemCashback = (itemPrice * cashbackPercentage / 100) * item.quantity;
        }
        totalCashback += itemCashback;
    });

    // Calculate courier charge for the selected method
    let courierCharge = 0;
    const selectedDeliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked')?.value;
    
    // Always calculate home delivery cost for pickup savings display
    let homeDeliveryCost = 0;
    try {
        homeDeliveryCost = await calculateCourierCharge(totalWeight);
        
        // Ensure minimum charge for pickup savings display (if there are items)
        if (cart.length > 0 && homeDeliveryCost < 25) {
            homeDeliveryCost = 25; // Minimum ₹25 shipping charge
        }
    } catch (error) {
        console.error('Error calculating courier charge:', error);
        // Fallback minimum charge if there are items
        homeDeliveryCost = cart.length > 0 ? 25 : 0;
    }
    
    // Set actual courier charge based on selected method
    if (selectedDeliveryMethod === 'home') {
        courierCharge = homeDeliveryCost;
    } else {
        courierCharge = 0; // Free for pickup
    }

    // Update delivery method displays - always show what home delivery would cost
    // Find elements again in case they were recreated
    const homeDeliveryChargeElement = document.getElementById('homeDeliveryCharge');
    const pickupSavingsElement = document.getElementById('pickupSavings');
    
    if (homeDeliveryChargeElement) {
        homeDeliveryChargeElement.textContent = homeDeliveryCost.toFixed(0);
    }
    if (pickupSavingsElement) {
        pickupSavingsElement.textContent = homeDeliveryCost.toFixed(0);
    }
    
    // Also update the display containers if they exist
    const homeDeliveryChargeDisplay = document.getElementById('homeDeliveryChargeDisplay');
    const pickupSavingsDisplay = document.getElementById('pickupSavingsDisplay');
    
    if (homeDeliveryCost === 0) {
        if (homeDeliveryChargeDisplay) {
            homeDeliveryChargeDisplay.innerHTML = '<span style="color: #28a745; font-weight: 600;">FREE 🎉</span>';
        }
        if (pickupSavingsDisplay) {
            pickupSavingsDisplay.innerHTML = '<span style="color: #28a745; font-weight: 600;">FREE</span>';
        }
    } else {
        if (homeDeliveryChargeDisplay) {
            homeDeliveryChargeDisplay.innerHTML = `+ ₹<span id="homeDeliveryCharge">${homeDeliveryCost.toFixed(0)}</span>`;
        }
        if (pickupSavingsDisplay) {
            pickupSavingsDisplay.innerHTML = `FREE (Save ₹<span id="pickupSavings">${homeDeliveryCost.toFixed(0)}</span>!)`;
        }
    }

    // Calculate final total
    const finalTotal = total + courierCharge;

    // Update cart total display
    const cartTotalElement = document.getElementById('cartTotal');
    if (cartTotalElement) {
        cartTotalElement.innerHTML = `
            <div class="summary-row">
                <span>Items Total:</span>
                <span>₹${total.toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <span>Delivery Charge:</span>
                <span>₹${courierCharge.toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <span>Total Amount:</span>
                <span>₹${finalTotal.toFixed(2)}</span>
            </div>
        `;
    }

    // Update points summary if exists
    if (totalPoints > 0) {
        let pointsSummary = document.querySelector('.points-summary');
        if (!pointsSummary) {
            pointsSummary = document.createElement('div');
            pointsSummary.className = 'points-summary';
            cartTotalElement.parentNode.insertBefore(pointsSummary, cartTotalElement);
        }
        pointsSummary.innerHTML = `
            <div class="points-summary-content">
                <span style="font-size: 24px;">🎁</span>
                <span class="points-summary-title">Earn ${totalPoints} Points</span>
            </div>
            <div class="points-summary-note">Points will be added to your account after order delivery</div>
        `;
    } else {
        // Remove points summary if no points
        const pointsSummary = document.querySelector('.points-summary');
        if (pointsSummary) {
            pointsSummary.remove();
        }
    }

    // Update cashback summary if exists
    if (totalCashback > 0) {
        let cashbackSummary = document.querySelector('.cashback-summary');
        if (!cashbackSummary) {
            cashbackSummary = document.createElement('div');
            cashbackSummary.className = 'cashback-summary';
            cartTotalElement.parentNode.insertBefore(cashbackSummary, cartTotalElement);
        }
        cashbackSummary.innerHTML = `
            <div class="cashback-summary-content">
                <span style="font-size: 24px;">💰</span>
                <span class="cashback-summary-title">₹${totalCashback.toFixed(0)} Cashback</span>
            </div>
            <div class="cashback-summary-note">Cashback will be credited to your wallet instantly</div>
        `;
    } else {
        // Remove cashback summary if no cashback
        const cashbackSummary = document.querySelector('.cashback-summary');
        if (cashbackSummary) {
            cashbackSummary.remove();
        }
    }
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

/* -----------------------------------
   RESET CHECKOUT BUTTON
----------------------------------- */
function resetCheckoutButton() {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = "🔒 Secure Checkout";
    }
}

// Reset checkout button when page becomes visible again
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        const checkoutBtn = document.getElementById("checkoutBtn");
        if (checkoutBtn && checkoutBtn.disabled && checkoutBtn.textContent === "Processing...") {
            // If button has been processing for more than 5 seconds, reset it
            setTimeout(() => {
                if (checkoutBtn.disabled && checkoutBtn.textContent === "Processing...") {
                    resetCheckoutButton();
                    console.log("⚠️ Checkout button reset on page visibility change");
                }
            }, 1000);
        }
    }
});

// Also reset on window focus
window.addEventListener('focus', () => {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn && checkoutBtn.disabled && checkoutBtn.textContent === "Processing...") {
        setTimeout(() => {
            if (checkoutBtn.disabled && checkoutBtn.textContent === "Processing...") {
                resetCheckoutButton();
                console.log("⚠️ Checkout button reset on window focus");
            }
        }, 1000);
    }
});

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
    const cartTotal = cart.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * item.quantity), 0);

    // Check for applicable offers first, then show payment method selection
    await checkApplicableOffersForCart(cartTotal);
}

/* ------------------------------
    Check Applicable Offers for Cart
------------------------------ */
async function checkApplicableOffersForCart(cartTotal) {
    const API = window.API_URL || window.location.origin + '/api';

    console.log("=== Checking Offers for Cart ===");
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
            showOfferModalForCart(data);
        } else {
            console.log("ℹ️ No applicable offer found. Going to payment method selection...");
            // No offer applicable, go directly to payment method selection
            currentOffer = null;
            showCartPaymentMethodModal();
        }
    } catch (err) {
        console.error("❌ Error checking offers:", err);
        // Continue to payment method selection even if offer check fails
        currentOffer = null;
        showCartPaymentMethodModal();
    }
}

/* ------------------------------
    Show Offer Modal for Cart
------------------------------ */
function showOfferModalForCart(offerData) {
    console.log("=== Showing Offer Modal for Cart ===");
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

async function acceptOfferAndContinueToPayment() {
    document.getElementById("offerModal").style.display = "none";
    showCartPaymentMethodModal();
}

/* ------------------------------
    Cart Payment Method Selection
------------------------------ */
function showCartPaymentMethodModal() {
    document.getElementById("cartPaymentMethodModal").style.display = "block";
}

function closeCartPaymentMethodModal() {
    document.getElementById("cartPaymentMethodModal").style.display = "none";
}

// Payment method handlers for cart
function proceedWithCartOnlinePayment() {
    closeCartPaymentMethodModal();
    // Continue with existing Razorpay flow
    showAddressModal();
}

function proceedWithCartCheckPayment() {
    closeCartPaymentMethodModal();
    // Use the new integrated check payment system
    createCartOrderWithCheckPayment();
}

function proceedWithCartAccountTransfer() {
    closeCartPaymentMethodModal();
    // Create combined pending order for bank transfer
    createCartPendingOrder('transfer');
}

/* ------------------------------
    Create Cart Order with Check Payment (New Integrated System)
------------------------------ */
async function createCartOrderWithCheckPayment() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const cart = getCart();
    const API = window.API_URL || '';
    
    if (!API) {
        alert("API configuration error. Please refresh the page.");
        return;
    }
    
    if (cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }
    
    // Get delivery method and courier info
    const deliveryMethod = getSelectedDeliveryMethod();
    const courierInfo = JSON.parse(localStorage.getItem("courierInfo") || "{}");
    const courierCharge = courierInfo.courierCharge || 0;
    const totalWeight = courierInfo.totalWeight || 0;
    
    // Calculate totals from cart items
    let itemsTotal = 0;
    cart.forEach(item => {
        if (item.isBundle || item.bundleId) {
            const itemPrice = item.basePrice || (item.price - (item.courierCharge || 0));
            itemsTotal += itemPrice;
        } else {
            itemsTotal += item.price * item.quantity;
        }
    });
    
    const totalAmount = itemsTotal + courierCharge;
    
    // Get delivery address
    const deliveryAddress = JSON.parse(localStorage.getItem("deliveryAddress") || "{}");
    
    // Prepare cart items for the new payment system
    const orderItems = cart.map(item => ({
        id: item.id || item.bundleId,
        title: item.title,
        author: item.author || 'Unknown',
        price: item.isBundle ? (item.basePrice || item.price) : item.price,
        quantity: item.quantity,
        coverImage: item.coverImage,
        type: item.isBundle ? 'bundle' : 'book',
        isDigital: false
    }));
    
    console.log('Creating check payment order:', {
        totalAmount,
        itemCount: orderItems.length,
        deliveryMethod,
        courierCharge
    });
    
    try {
        // Use the new integrated payment system
        const orderRes = await fetch(`${API}/payments/create-order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: totalAmount,
                items: orderItems,
                deliveryAddress: deliveryAddress,
                appliedOffer: currentOffer, // Include any applied offer
                courierCharge: courierCharge,
                totalWeight: totalWeight,
                deliveryMethod: deliveryMethod,
                paymentMethod: 'check' // This triggers the check payment flow
            })
        });

        const orderData = await orderRes.json();
        
        console.log('Check payment order response:', orderData);

        if (!orderRes.ok) {
            throw new Error(orderData.error || "Failed to create check payment order");
        }

        if (orderData.success && orderData.orderType === 'check') {
            // Clear cart after successful order creation
            clearCart();
            
            // Show success message
            alert(`✅ Order created successfully!\n\nOrder ID: ${orderData.order._id}\nTotal Amount: ₹${totalAmount.toFixed(2)}\nItems: ${orderItems.length}\n\nYou will now be redirected to submit your check payment details.`);
            
            // Debug: Log the Google Form URL
            console.log('Google Form URL:', orderData.googleFormUrl);
            
            // Try Google Form first, fallback to simple form if blocked
            if (orderData.googleFormUrl) {
                console.log('Opening Google Form...');
                
                // Try to open Google Form
                const formWindow = window.open(orderData.googleFormUrl, '_blank');
                
                // Check if popup was blocked
                if (!formWindow || formWindow.closed || typeof formWindow.closed == 'undefined') {
                    // Popup blocked - redirect to Google Form instead
                    if (confirm('⚠️ Popup blocked! Would you like to go to the Google Form now?\n\nClick OK to continue to the form, or Cancel to use our simple form.')) {
                        window.location.href = orderData.googleFormUrl;
                        return; // Don't redirect to orders page
                    } else {
                        // Use simple form as fallback
                        const simpleFormUrl = `/simple-check-payment-form.html?orderId=${orderData.order._id}&amount=${totalAmount}&userName=${encodeURIComponent(user.name || '')}&userEmail=${encodeURIComponent(user.email || '')}&phone=${encodeURIComponent(user.phone || '')}`;
                        window.location.href = simpleFormUrl;
                        return;
                    }
                } else {
                    // Google Form opened successfully
                    console.log('✅ Google Form opened successfully');
                }
            } else {
                // No Google Form URL - use simple form
                const simpleFormUrl = `/simple-check-payment-form.html?orderId=${orderData.order._id}&amount=${totalAmount}&userName=${encodeURIComponent(user.name || '')}&userEmail=${encodeURIComponent(user.email || '')}&phone=${encodeURIComponent(user.phone || '')}`;
                window.location.href = simpleFormUrl;
                return;
            }
            
            // Redirect to orders page after delay
            setTimeout(() => {
                window.location.href = '/account.html?section=orders';
            }, 3000);
        } else {
            throw new Error("Unexpected response format");
        }

    } catch (err) {
        console.error("Error creating check payment order:", err);
        alert("❌ Error creating order: " + err.message + "\n\nPlease try again or contact support.");
    }
}

/* ------------------------------
    Clear Cart
------------------------------ */
function clearCart() {
    localStorage.removeItem("cart");
    console.log("🛒 Cart cleared");
}

/* ------------------------------
    Create Cart Pending Order (Combined)
------------------------------ */
async function createCartPendingOrder(paymentType) {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const cart = getCart();
    const API = window.API_URL || '';
    
    if (!API) {
        alert("API configuration error. Please refresh the page.");
        return;
    }
    
    if (cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }
    
    // Get delivery method and courier info
    const deliveryMethod = getSelectedDeliveryMethod();
    const courierInfo = JSON.parse(localStorage.getItem("courierInfo") || "{}");
    const courierCharge = courierInfo.courierCharge || 0;
    const totalWeight = courierInfo.totalWeight || 0;
    
    // Calculate totals from cart items (use base price for bundles)
    let itemsTotal = 0;
    cart.forEach(item => {
        if (item.isBundle || item.bundleId) {
            // For bundles, use basePrice if available, otherwise calculate from bundlePrice
            const itemPrice = item.basePrice || (item.price - (item.courierCharge || 0));
            itemsTotal += itemPrice;
        } else {
            // For books, use the price directly
            itemsTotal += item.price * item.quantity;
        }
    });
    
    const totalAmount = itemsTotal + courierCharge;
    
    console.log('Creating cart pending order:', {
        paymentType,
        deliveryMethod,
        itemsTotal,
        courierCharge,
        totalAmount,
        itemCount: cart.length,
        cartItems: cart
    });
    
    // Prepare cart items for backend (normalize the structure)
    const normalizedCartItems = cart.map(item => {
        if (item.isBundle || item.bundleId) {
            return {
                bundleId: item.bundleId,
                isBundle: true,
                title: item.title,
                quantity: item.quantity,
                price: item.basePrice || (item.price - (item.courierCharge || 0)), // Remove courier charge from price
                weight: item.weight,
                deliveryMethod: item.deliveryMethod,
                coverImage: item.coverImage
            };
        } else {
            return {
                id: item.id,
                title: item.title,
                author: item.author,
                quantity: item.quantity,
                price: item.price,
                weight: item.weight,
                deliveryMethod: item.deliveryMethod,
                coverImage: item.coverImage
            };
        }
    });
    
    console.log('Normalized cart items:', normalizedCartItems);
    
    try {
        // Create combined pending order for all cart items
        const orderRes = await fetch(`${API}/orders/create-cart-pending`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                cartItems: normalizedCartItems,
                deliveryMethod: deliveryMethod,
                paymentType: paymentType, // 'check' or 'transfer'
                itemsTotal: itemsTotal,
                courierCharge: courierCharge,
                totalAmount: totalAmount,
                totalWeight: totalWeight
            })
        });

        const orderData = await orderRes.json();
        
        console.log('Order creation response:', orderData);

        if (!orderRes.ok) {
            throw new Error(orderData.error || "Failed to create cart order");
        }

        // Clear cart after successful order creation
        clearCart();
        
        // Show confirmation and redirect to upload page
        const paymentTypeText = paymentType === 'check' ? 'Check Payment' : 'Bank Transfer';
        alert(`Cart order created successfully!\n\nOrder ID: ${orderData.orderId}\nTotal Amount: ₹${totalAmount.toFixed(2)}\nItems: ${cart.length}\n\nYou will now be redirected to upload ${paymentTypeText.toLowerCase()} details.`);
        
        // Redirect to payment upload page with order details
        window.location.href = `/payment-upload.html?orderId=${orderData.orderId}&amount=${totalAmount}&type=${paymentType}`;

    } catch (err) {
        console.error("Error creating cart pending order:", err);
        alert("Error creating order: " + err.message + "\n\nPlease try again or contact support.");
    }
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
    showCartPaymentMethodModal();
}

/* ------------------------------
    Show Address Modal
------------------------------ */
let userAddress = null;

async function showAddressModal() {
    const token = localStorage.getItem("token");
    const API = window.API_URL || '';

    console.log('🔍 showAddressModal called, loading fresh address data...');

    try {
        // Always fetch fresh user address from server
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        console.log('📡 Profile response:', data);
        
        if (data.user && data.user.address) {
            userAddress = data.user.address;
            console.log('✅ Address loaded from server:', userAddress);
            
            // Display detailed address fields
            document.getElementById("modalHomeAddress1").textContent = userAddress.homeAddress1 || userAddress.street || "Not set";
            document.getElementById("modalHomeAddress2").textContent = userAddress.homeAddress2 || "-";
            document.getElementById("modalStreetName").textContent = userAddress.streetName || "-";
            document.getElementById("modalLandmark").textContent = userAddress.landmark || "-";
            document.getElementById("modalVillage").textContent = userAddress.village || "-";
            document.getElementById("modalTaluk").textContent = userAddress.taluk || "Not set";
            document.getElementById("modalDistrict").textContent = userAddress.district || "Not set";
            document.getElementById("modalState").textContent = userAddress.state || "Not set";
            document.getElementById("modalPincode").textContent = userAddress.pincode || "Not set";
            document.getElementById("modalPhone").textContent = userAddress.phone || "Not set";

            // Pre-fill edit form
            document.getElementById("editHomeAddress1").value = userAddress.homeAddress1 || userAddress.street || "";
            document.getElementById("editHomeAddress2").value = userAddress.homeAddress2 || "";
            document.getElementById("editStreetName").value = userAddress.streetName || "";
            document.getElementById("editLandmark").value = userAddress.landmark || "";
            document.getElementById("editVillage").value = userAddress.village || "";
            document.getElementById("editTaluk").value = userAddress.taluk || "";
            document.getElementById("editDistrict").value = userAddress.district || "";
            document.getElementById("editState").value = userAddress.state || "";
            document.getElementById("editPincode").value = userAddress.pincode || "";
            document.getElementById("editPhone").value = userAddress.phone || "";
        } else {
            console.log('⚠️ No address found in user profile');
            userAddress = null;
            
            // Set display to "Not set"
            document.getElementById("modalHomeAddress1").textContent = "Not set";
            document.getElementById("modalHomeAddress2").textContent = "-";
            document.getElementById("modalStreetName").textContent = "-";
            document.getElementById("modalLandmark").textContent = "-";
            document.getElementById("modalVillage").textContent = "-";
            document.getElementById("modalTaluk").textContent = "Not set";
            document.getElementById("modalDistrict").textContent = "Not set";
            document.getElementById("modalState").textContent = "Not set";
            document.getElementById("modalPincode").textContent = "Not set";
            document.getElementById("modalPhone").textContent = "Not set";

            // Clear edit form
            document.getElementById("editHomeAddress1").value = "";
            document.getElementById("editHomeAddress2").value = "";
            document.getElementById("editStreetName").value = "";
            document.getElementById("editLandmark").value = "";
            document.getElementById("editVillage").value = "";
            document.getElementById("editTaluk").value = "";
            document.getElementById("editDistrict").value = "";
            document.getElementById("editState").value = "";
            document.getElementById("editPincode").value = "";
            document.getElementById("editPhone").value = "";
        }

        // Show modal with animation
        const modal = document.getElementById("addressModal");
        modal.style.display = "flex";
        setTimeout(() => modal.classList.add("show"), 10);

    } catch (err) {
        console.error("❌ Error loading address:", err);
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
        homeAddress1: document.getElementById("editHomeAddress1").value.trim(),
        homeAddress2: document.getElementById("editHomeAddress2").value.trim(),
        streetName: document.getElementById("editStreetName").value.trim(),
        landmark: document.getElementById("editLandmark").value.trim(),
        village: document.getElementById("editVillage").value.trim(),
        taluk: document.getElementById("editTaluk").value.trim(),
        district: document.getElementById("editDistrict").value.trim(),
        state: document.getElementById("editState").value.trim(),
        pincode: document.getElementById("editPincode").value.trim(),
        phone: document.getElementById("editPhone").value.trim(),
        // Create legacy street field for backward compatibility
        street: document.getElementById("editHomeAddress1").value.trim()
    };

    console.log('🔍 Frontend: Preparing to send address data');
    console.log('📦 Address object:', JSON.stringify(address, null, 2));
    
    // Check if required fields are empty
    const requiredFields = ['homeAddress1', 'taluk', 'district', 'state', 'pincode', 'phone'];
    const emptyFields = requiredFields.filter(key => !address[key]);
    if (emptyFields.length > 0) {
        console.log('❌ Frontend: Empty required fields detected:', emptyFields);
        alert(`Please fill in all required fields: ${emptyFields.join(', ')}`);
        return;
    }

    console.log('✅ Frontend: All required fields have values, sending request');

    try {
        const requestBody = { address };
        console.log('📤 Frontend: Request body:', JSON.stringify(requestBody, null, 2));
        
        const res = await fetch(`${API}/users/update-address`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(requestBody)
        });

        console.log('📡 Frontend: Response status:', res.status);
        const data = await res.json();
        console.log('📡 Frontend: Response data:', data);

        if (!res.ok) {
            console.log('❌ Frontend: Request failed with error:', data.error);
            alert(data.error || "Failed to update address");
            return;
        }

        console.log('✅ Frontend: Address updated successfully');
        userAddress = address;
        
        // Update display with the saved address
        document.getElementById("modalHomeAddress1").textContent = address.homeAddress1;
        document.getElementById("modalHomeAddress2").textContent = address.homeAddress2 || "-";
        document.getElementById("modalStreetName").textContent = address.streetName || "-";
        document.getElementById("modalLandmark").textContent = address.landmark || "-";
        document.getElementById("modalVillage").textContent = address.village || "-";
        document.getElementById("modalTaluk").textContent = address.taluk;
        document.getElementById("modalDistrict").textContent = address.district;
        document.getElementById("modalState").textContent = address.state;
        document.getElementById("modalPincode").textContent = address.pincode;
        document.getElementById("modalPhone").textContent = address.phone;

        console.log('✅ Address display updated');
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

    console.log('🔍 proceedToPayment called');
    console.log('📍 Current userAddress:', userAddress);

    // If userAddress is not set, try to load it from server first
    if (!userAddress) {
        console.log('⚠️ userAddress not set, loading from server...');
        try {
            const res = await fetch(`${API}/users/profile`, {
                headers: { "Authorization": "Bearer " + token }
            });
            const data = await res.json();
            if (data.user && data.user.address) {
                userAddress = data.user.address;
                console.log('✅ Loaded address from server:', userAddress);
            }
        } catch (err) {
            console.error('❌ Error loading address from server:', err);
        }
    }

    // 🚨 MANDATORY ADDRESS VALIDATION
    if (!userAddress || !userAddress.street || !userAddress.taluk || !userAddress.district || !userAddress.state || !userAddress.pincode || !userAddress.phone) {
        console.log('❌ Address validation failed - missing userAddress or required fields');
        console.log('   userAddress:', userAddress);
        
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

    console.log('🔍 Address field validation:');
    requiredFields.forEach(field => {
        const value = userAddress[field];
        const isEmpty = !value || value.toString().trim() === '';
        console.log(`   ${field}: "${value}" ${isEmpty ? '❌ EMPTY' : '✅ OK'}`);
    });

    if (emptyFields.length > 0) {
        console.log('❌ Empty fields detected:', emptyFields);
        alert(`❌ Please complete your delivery address!\n\nMissing: ${emptyFields.join(', ')}\n\nYou will be redirected to your account page to complete the address.`);
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    // Validate phone number format (Indian mobile numbers)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(userAddress.phone)) {
        console.log('❌ Invalid phone format:', userAddress.phone);
        alert("❌ Please enter a valid 10-digit Indian mobile number in your delivery address.");
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    // Validate pincode format
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(userAddress.pincode)) {
        console.log('❌ Invalid pincode format:', userAddress.pincode);
        alert("❌ Please enter a valid 6-digit pincode in your delivery address.");
        window.location.href = "/account.html?tab=address&redirect=cart";
        return;
    }

    console.log('✅ Address validation passed, proceeding to payment');
    console.log('📍 userAddress being sent to server:', JSON.stringify(userAddress, null, 2));

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
    cart.forEach(item => itemsTotal += (parseFloat(item.price) || 0) * item.quantity);
    
    // Add courier charge to total
    let total = itemsTotal + courierCharge;
    // Round to 2 decimals to avoid floating issues
    total = Math.round((total + Number.EPSILON) * 100) / 100;

    // UI feedback
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = "Processing...";
        
        // Safety timeout to reset button after 30 seconds
        setTimeout(() => {
            if (checkoutBtn.disabled && checkoutBtn.textContent === "Processing...") {
                resetCheckoutButton();
                console.log("⚠️ Checkout button reset by timeout");
            }
        }, 30000);
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
        
        // Get delivery method
        const deliveryMethod = getSelectedDeliveryMethod();
        
        // 1) Create order on backend with address, offer, courier info, and delivery method
        const requestPayload = { 
            amount: finalAmount, 
            items: orderItems,
            deliveryAddress: userAddress,
            appliedOffer: appliedOffer,
            courierCharge: courierCharge,
            totalWeight: totalWeight,
            deliveryMethod: deliveryMethod
        };
        
        console.log('📤 Sending create-order request with payload:');
        console.log('   Amount:', finalAmount);
        console.log('   Items count:', orderItems.length);
        console.log('   DeliveryAddress:', JSON.stringify(userAddress, null, 2));
        console.log('   CourierCharge:', courierCharge);
        console.log('   TotalWeight:', totalWeight);
        console.log('   DeliveryMethod:', deliveryMethod);
        
        const createRes = await fetch(`${API}/payments/create-order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(requestPayload)
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
            name: "Shree Mata",
            description: "Purchase from Shree Mata",
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
                        resetCheckoutButton();
                        return;
                    }

                    // ✅ Payment verification successful!
                    console.log("✅ Payment verified successfully!");
                    
                    // Get cart data BEFORE clearing it
                    const cart = getCart();
                    const orderData = {
                        orderId: response.razorpay_payment_id,
                        items: cart.length,
                        amount: (rzpOrder.amount / 100), // Convert from paise to rupees
                        deliveryMethod: deliveryMethod === 'pickup' ? 'Store Pickup' : 'Courier Delivery',
                        paymentMethod: 'Online Payment'
                    };
                    
                    console.log("📋 Order data for popup:", orderData);
                    
                    // Reset checkout button
                    resetCheckoutButton();
                    
                    // Clear cart AFTER getting the data
                    clearCart();
                    
                    // Show success popup with order details
                    console.log("🎉 Calling showSuccessPopup with data:", orderData);
                    
                    // Check if showSuccessPopup function exists
                    if (typeof showSuccessPopup === 'function') {
                        console.log("✅ showSuccessPopup function found, calling it...");
                        showSuccessPopup(orderData);
                    } else {
                        console.error("❌ showSuccessPopup function not found!");
                        // Fallback to alert
                        alert("🎉 Order Confirmed!\n\nYour payment has been processed successfully and your order has been placed.");
                        window.location.href = "/account.html?section=orders";
                    }
                    
                    return; // Exit the handler

if (!response.razorpay_payment_id) {
    alert("Payment failed or cancelled. Order not placed.");
    return;
}


                } catch (err) {
                    console.error("Error during payment verification:", err);
                    alert("Payment succeeded but verification failed. We'll investigate.");
                    resetCheckoutButton();
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

                    resetCheckoutButton();
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
        resetCheckoutButton();
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
/* ------------------------------
    Setup Mobile Features
------------------------------ */
function setupMobileFeatures() {
    // Add any mobile-specific functionality here
    // For now, just a placeholder function to prevent the error
    console.log('Mobile features initialized');
}