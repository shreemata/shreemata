// Load dynamic API URL
const API = window.API_URL;

document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadBookDetails();
    setupEventListeners();
});

/* -----------------------------------
   AUTH CHECK
----------------------------------- */
function checkAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (token && user) {
        document.getElementById("authLinks").style.display = "none";
        document.getElementById("userLinks").style.display = "flex";
        document.getElementById("userName").textContent = `Hello, ${user.name}`;

        // Show cart icon for logged in users
        const cartIcon = document.getElementById("cartIcon");
        if (cartIcon) {
            cartIcon.style.display = "block";
            updateCartCount();
        }

        if (user.role === "admin") {
            document.getElementById("adminLink").style.display = "block";
        }
    } else {
        // Hide cart icon for non-logged in users
        const cartIcon = document.getElementById("cartIcon");
        if (cartIcon) {
            cartIcon.style.display = "none";
        }
    }
}

/* -----------------------------------
   EVENT LISTENERS
----------------------------------- */
function setupEventListeners() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    // Quantity selector event listeners
    const decreaseBtn = document.getElementById("decreaseQty");
    const increaseBtn = document.getElementById("increaseQty");
    const quantityInput = document.getElementById("bookQuantity");

    if (decreaseBtn) decreaseBtn.addEventListener("click", () => updateQuantity(-1));
    if (increaseBtn) increaseBtn.addEventListener("click", () => updateQuantity(1));
    if (quantityInput) quantityInput.addEventListener("change", () => updateQuantityFromInput());

    // Buy buttons
    const buyPickupBtn = document.getElementById("buyPickupBtn");
    if (buyPickupBtn) buyPickupBtn.addEventListener("click", () => handlePurchase("pickup"));

    const buyCourierBtn = document.getElementById("buyCourierBtn");
    if (buyCourierBtn) buyCourierBtn.addEventListener("click", () => handlePurchase("courier"));

    // Single Add to Cart button
    const addToCartBtn = document.getElementById("addToCartBtn");
    if (addToCartBtn) addToCartBtn.addEventListener("click", () => handleAddToCart());

    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");

    searchBtn.addEventListener("click", () => {
        const term = searchInput.value.trim();
        if (term) window.location.href = `/?search=${encodeURIComponent(term)}`;
    });

    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const term = searchInput.value.trim();
            if (term) window.location.href = `/?search=${encodeURIComponent(term)}`;
        }
    });

    // Setup billing address form submission - wait for DOM to be ready
    setupBillingAddressForm();
}

/* -----------------------------------
   QUANTITY MANAGEMENT
----------------------------------- */
function updateQuantity(change) {
    const quantityInput = document.getElementById("bookQuantity");
    let currentQty = parseInt(quantityInput.value) || 1;
    
    currentQty += change;
    
    // Ensure quantity is within bounds
    if (currentQty < 1) currentQty = 1;
    if (currentQty > 10) currentQty = 10;
    
    // Check stock limits if book has limited stock
    const book = window.currentBook;
    if (book && book.trackStock && book.stockStatus === 'limited_stock') {
        const availableStock = book.stockQuantity || 0;
        if (currentQty > availableStock) {
            currentQty = availableStock;
            alert(`⚠️ Only ${availableStock} copies are available.`);
        }
    }
    
    quantityInput.value = currentQty;
    updatePricing();
}

function updateQuantityFromInput() {
    const quantityInput = document.getElementById("bookQuantity");
    let qty = parseInt(quantityInput.value) || 1;
    
    // Ensure quantity is within bounds
    if (qty < 1) qty = 1;
    if (qty > 10) qty = 10;
    
    // Check stock limits if book has limited stock
    const book = window.currentBook;
    if (book && book.trackStock && book.stockStatus === 'limited_stock') {
        const availableStock = book.stockQuantity || 0;
        if (qty > availableStock) {
            qty = availableStock;
            alert(`⚠️ Only ${availableStock} copies are available.`);
        }
    }
    
    quantityInput.value = qty;
    updatePricing();
}

async function updatePricing() {
    if (!window.currentBook) return;
    
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    const basePrice = parseFloat(window.currentBook.price);
    const weight = window.currentBook.weight || 0.5;
    
    // Calculate total weight and courier charge
    const totalWeight = weight * quantity;
    let courierCharge = 0;
    
    try {
        courierCharge = await calculateCourierCharge(totalWeight);
        courierCharge = isNaN(courierCharge) ? 0 : parseFloat(courierCharge);
    } catch (error) {
        console.error('Error calculating courier charge:', error);
        courierCharge = 0;
    }
    
    // Update pricing displays
    const pickupTotal = basePrice * quantity;
    const courierTotal = pickupTotal + courierCharge;
    
    document.getElementById("pickupPrice").textContent = `₹${pickupTotal.toFixed(2)}`;
    document.getElementById("courierPrice").textContent = `₹${courierTotal.toFixed(2)}`;
    
    // Update weight and courier charge displays
    document.getElementById("totalWeight").textContent = `${totalWeight.toFixed(2)} kg`;
    document.getElementById("totalCourierCharge").textContent = `₹${courierCharge.toFixed(2)}`;
    
    // Update the weight info in the right side as well
    if (document.getElementById("bookWeight")) {
        document.getElementById("bookWeight").textContent = `${totalWeight.toFixed(2)} kg`;
    }
    if (document.getElementById("bookCourierCharge")) {
        document.getElementById("bookCourierCharge").textContent = `₹${courierCharge.toFixed(2)}`;
    }
}

/* -----------------------------------
   LOGOUT
----------------------------------- */
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
}

/* -----------------------------------
   LOAD BOOK DETAILS
----------------------------------- */
async function loadBookDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get("id");
    const fromBundle = urlParams.get("fromBundle"); // Check if coming from bundle

    if (!bookId) return showError();

    try {
        const res = await fetch(`${API}/books/${bookId}`);
        const data = await res.json();

        if (!res.ok) throw new Error("Book not found");

        document.getElementById("loadingSpinner").style.display = "none";
        document.getElementById("bookDetails").style.display = "block";

        await displayBookDetails(data.book, fromBundle === 'true');

    } catch (err) {
        console.error("Error loading book:", err);
        showError();
    }
}

/* -----------------------------------
   DISPLAY BOOK DETAILS
----------------------------------- */
async function displayBookDetails(book, hidePrice = false) {
    // Store book globally for addToCart
    window.currentBook = book;
    
    document.getElementById("bookTitle").textContent = book.title;
    document.getElementById("bookAuthor").textContent = book.author;
    
    // Display description
    document.getElementById("bookDescription").textContent =
        book.description || "No description available.";
    
    // Display cover image - ALWAYS show this
    const cover = document.getElementById("bookCover");
    cover.src = book.cover_image || "https://via.placeholder.com/400x600?text=No+Cover";
    cover.onerror = () => (cover.src = "https://via.placeholder.com/400x600?text=No+Cover");

    // Display preview images - ALWAYS show this
    const previewGrid = document.getElementById("previewImages");
    const noPreview = document.getElementById("noPreview");

    if (book.preview_images?.length) {
        previewGrid.innerHTML = "";
        
        // Store preview images globally for lightbox
        window.previewImages = book.preview_images;
        
        book.preview_images.forEach((imgURL, index) => {
            const img = document.createElement("img");
            img.src = imgURL;
            img.alt = `Preview ${index + 1}`;
            img.classList.add("preview-image");
            img.onerror = () => (img.src = "https://via.placeholder.com/400x600?text=Unavailable");
            
            // Add click event to open lightbox
            img.addEventListener("click", () => openLightbox(index));
            
            previewGrid.appendChild(img);
        });
    } else {
        noPreview.style.display = "block";
    }
    
    // Hide pricing section if coming from bundle
    if (hidePrice) {
        const pricingSection = document.querySelector(".pricing-section");
        if (pricingSection) {
            pricingSection.style.display = "none";
        }
        
        // Hide all purchase buttons
        const buyPickupBtn = document.getElementById("buyPickupBtn");
        const buyCourierBtn = document.getElementById("buyCourierBtn");
        const addToCartBtn = document.getElementById("addToCartBtn");
        
        if (buyPickupBtn) buyPickupBtn.style.display = "none";
        if (buyCourierBtn) buyCourierBtn.style.display = "none";
        if (addToCartBtn) addToCartBtn.style.display = "none";
        
        // Add a notice that this book is part of a bundle
        const bookInfo = document.querySelector(".book-info");
        if (bookInfo) {
            const bundleNotice = document.createElement("div");
            bundleNotice.style.cssText = "background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;";
            bundleNotice.innerHTML = `
                <p style="margin: 0; font-weight: 600;">📦 This book is part of a bundle</p>
                <p style="margin: 5px 0 0 0; font-size: 14px;">Individual purchase is not available. Please purchase the complete bundle.</p>
            `;
            bookInfo.insertBefore(bundleNotice, bookInfo.firstChild);
        }
        
        return; // Skip the rest of the function (pricing logic)
    }
    
    // Check stock status and disable buttons if out of stock
    const isOutOfStock = book.trackStock && book.stockStatus === 'out_of_stock';
    const isLimitedStock = book.trackStock && book.stockStatus === 'limited_stock';
    
    // Get all purchase buttons
    const buyPickupBtn = document.getElementById("buyPickupBtn");
    const buyCourierBtn = document.getElementById("buyCourierBtn");
    const addToCartBtn = document.getElementById("addToCartBtn");
    
    if (isOutOfStock) {
        // Disable all purchase buttons and update their text
        if (buyPickupBtn) {
            buyPickupBtn.disabled = true;
            buyPickupBtn.textContent = "❌ Out of Stock";
            buyPickupBtn.style.background = "#dc3545";
            buyPickupBtn.style.cursor = "not-allowed";
        }
        
        if (buyCourierBtn) {
            buyCourierBtn.disabled = true;
            buyCourierBtn.textContent = "❌ Out of Stock";
            buyCourierBtn.style.background = "#dc3545";
            buyCourierBtn.style.cursor = "not-allowed";
        }
        
        if (addToCartBtn) {
            addToCartBtn.disabled = true;
            addToCartBtn.textContent = "❌ Out of Stock";
            addToCartBtn.style.background = "#dc3545";
            addToCartBtn.style.cursor = "not-allowed";
        }
        
        // Add out of stock notice
        const pricingSection = document.querySelector(".pricing-section");
        const stockNotice = document.createElement("div");
        stockNotice.style.cssText = "background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 15px 20px; border-radius: 12px; font-size: 18px; margin: 15px 0; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;";
        stockNotice.innerHTML = `<span style="font-size: 28px;">❌</span><span>This book is currently out of stock</span>`;
        pricingSection.parentNode.insertBefore(stockNotice, pricingSection.nextSibling);
        
    } else if (isLimitedStock) {
        // Show limited stock warning
        const pricingSection = document.querySelector(".pricing-section");
        const stockNotice = document.createElement("div");
        stockNotice.style.cssText = "background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 15px 20px; border-radius: 12px; font-size: 18px; margin: 15px 0; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;";
        const remainingStock = book.stockQuantity || 0;
        stockNotice.innerHTML = `<span style="font-size: 28px;">⚠️</span><span>Limited Stock - Only ${remainingStock} left!</span>`;
        pricingSection.parentNode.insertBefore(stockNotice, pricingSection.nextSibling);
        
        // Update quantity selector max value to available stock
        const quantityInput = document.getElementById("bookQuantity");
        if (quantityInput && remainingStock > 0) {
            quantityInput.max = remainingStock;
            if (parseInt(quantityInput.value) > remainingStock) {
                quantityInput.value = remainingStock;
            }
        }
    }
    
    // Calculate pricing
    const basePrice = parseFloat(book.price);
    const weight = book.weight || 0.5;
    let courierCharge = 0; // Declare outside try block
    
    try {
        courierCharge = await calculateCourierCharge(weight);
        
        // Ensure courierCharge is a valid number
        const validCourierCharge = isNaN(courierCharge) ? 0 : parseFloat(courierCharge);
        courierCharge = validCourierCharge; // Update the outer variable
        
        // Display pickup price (same as base price)
        document.getElementById("pickupPrice").textContent = `₹${basePrice.toFixed(2)}`;
        
        // Display courier price (base price + courier charge)
        const courierTotalPrice = basePrice + validCourierCharge;
        document.getElementById("courierPrice").textContent = `₹${courierTotalPrice.toFixed(2)}`;
        
    } catch (error) {
        console.error('Error calculating courier charge:', error);
        courierCharge = 0; // Set fallback value
        
        // Fallback to showing base price for both options
        document.getElementById("pickupPrice").textContent = `₹${basePrice.toFixed(2)}`;
        document.getElementById("courierPrice").textContent = `₹${basePrice.toFixed(2)}`;
    }
    
    document.getElementById("bookDescription").textContent =
        book.description || "No description available.";
    
    // Display reward points if available - BIG and PROMINENT
    if (book.rewardPoints && book.rewardPoints > 0) {
        const pricingSection = document.querySelector(".pricing-section");
        const pointsBadge = document.createElement("div");
        pointsBadge.style.cssText = "background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 15px 20px; border-radius: 12px; font-size: 18px; margin: 15px 0; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;";
        pointsBadge.innerHTML = `<span style="font-size: 28px;">🎁</span><span>Earn ${book.rewardPoints} Points with this purchase!</span>`;
        pricingSection.parentNode.insertBefore(pointsBadge, pricingSection.nextSibling);
    }

    // Display cashback if available - BIG and PROMINENT
    let cashbackAmount = 0;
    if (book.cashbackAmount > 0) {
        cashbackAmount = book.cashbackAmount;
    } else if (book.cashbackPercentage > 0) {
        cashbackAmount = (basePrice * book.cashbackPercentage) / 100;
    }
    
    if (cashbackAmount > 0) {
        const pricingSection = document.querySelector(".pricing-section");
        const cashbackBadge = document.createElement("div");
        cashbackBadge.style.cssText = "background: linear-gradient(135deg, #ff6f61 0%, #ff9800 100%); color: white; padding: 15px 20px; border-radius: 12px; font-size: 18px; margin: 15px 0; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(255, 111, 97, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;";
        cashbackBadge.innerHTML = `<span style="font-size: 28px;">💰</span><span>Get ₹${cashbackAmount.toFixed(0)} Cashback instantly!</span>`;
        pricingSection.parentNode.insertBefore(cashbackBadge, pricingSection.nextSibling);
    }

    // Display weight and courier charge
    if (document.getElementById("bookWeight")) {
        document.getElementById("bookWeight").textContent = `${weight.toFixed(2)} kg`;
    }
    if (document.getElementById("bookCourierCharge")) {
        document.getElementById("bookCourierCharge").textContent = `₹${courierCharge.toFixed(2)}`;
    }
}

/* -----------------------------------
   IMAGE LIGHTBOX FUNCTIONS
----------------------------------- */
let currentImageIndex = 0;

function openLightbox(index) {
    currentImageIndex = index;
    const lightbox = document.getElementById("imageLightbox");
    const lightboxImage = document.getElementById("lightboxImage");
    const lightboxCaption = document.getElementById("lightboxCaption");
    
    if (window.previewImages && window.previewImages.length > 0) {
        lightboxImage.src = window.previewImages[currentImageIndex];
        lightboxCaption.textContent = `Page ${currentImageIndex + 1} of ${window.previewImages.length}`;
        lightbox.style.display = "flex";
        
        // Prevent body scroll when lightbox is open
        document.body.style.overflow = "hidden";
    }
}

function closeLightbox() {
    const lightbox = document.getElementById("imageLightbox");
    lightbox.style.display = "none";
    
    // Restore body scroll
    document.body.style.overflow = "auto";
}

function nextImage() {
    if (window.previewImages && window.previewImages.length > 0) {
        currentImageIndex = (currentImageIndex + 1) % window.previewImages.length;
        const lightboxImage = document.getElementById("lightboxImage");
        const lightboxCaption = document.getElementById("lightboxCaption");
        
        lightboxImage.src = window.previewImages[currentImageIndex];
        lightboxCaption.textContent = `Page ${currentImageIndex + 1} of ${window.previewImages.length}`;
    }
}

function previousImage() {
    if (window.previewImages && window.previewImages.length > 0) {
        currentImageIndex = (currentImageIndex - 1 + window.previewImages.length) % window.previewImages.length;
        const lightboxImage = document.getElementById("lightboxImage");
        const lightboxCaption = document.getElementById("lightboxCaption");
        
        lightboxImage.src = window.previewImages[currentImageIndex];
        lightboxCaption.textContent = `Page ${currentImageIndex + 1} of ${window.previewImages.length}`;
    }
}

// Keyboard navigation for lightbox
document.addEventListener("keydown", (e) => {
    const lightbox = document.getElementById("imageLightbox");
    if (lightbox && lightbox.style.display === "flex") {
        if (e.key === "Escape") {
            closeLightbox();
        } else if (e.key === "ArrowRight") {
            nextImage();
        } else if (e.key === "ArrowLeft") {
            previousImage();
        }
    }
});

/* -----------------------------------
   BUY NOW → Show Address Modal
----------------------------------- */

/* -----------------------------------
   BUY NOW → Show Address Modal
----------------------------------- */
let userAddress = null;
let currentBook = null;

async function handlePurchase(deliveryMethod = "courier") {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!token || !user) {
        const id = new URLSearchParams(window.location.search).get("id");
        localStorage.setItem("redirectAfterLogin", `/book.html?id=${id}`);
        return window.location.href = "/login.html";
    }

    // Check stock status before proceeding
    const book = window.currentBook;
    if (book && book.trackStock && book.stockStatus === 'out_of_stock') {
        alert("❌ This book is currently out of stock and cannot be purchased.");
        return;
    }
    
    // Check if requested quantity is available for limited stock
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    if (book && book.trackStock && book.stockStatus === 'limited_stock') {
        const availableStock = book.stockQuantity || 0;
        if (quantity > availableStock) {
            alert(`❌ Only ${availableStock} copies are available. Please reduce the quantity.`);
            return;
        }
    }

    // Store delivery method globally for later use
    window.selectedDeliveryMethod = deliveryMethod;
    
    // Show billing address collection modal first (for all payment methods)
    showBillingAddressModal();
}

function showPaymentMethodModal() {
    console.log("showPaymentMethodModal called");
    const modal = document.getElementById("paymentMethodModal");
    console.log("Payment method modal element:", modal);
    if (modal) {
        modal.style.display = "block";
        console.log("Payment method modal should now be visible");
    } else {
        console.error("Payment method modal not found!");
    }
}

function closePaymentMethodModal() {
    document.getElementById("paymentMethodModal").style.display = "none";
}

// Payment method handlers
function proceedWithOnlinePayment() {
    closePaymentMethodModal();
    // Continue with existing Razorpay flow
    proceedWithRazorpayPayment();
}

function proceedWithChequePayment() {
    closePaymentMethodModal();
    // Redirect to Google Form for cheque payment
    redirectToChequePaymentForm();
}

function proceedWithAccountTransfer() {
    closePaymentMethodModal();
    // Redirect to Google Form for account transfer
    redirectToAccountTransferForm();
}

async function proceedWithRazorpayPayment() {
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const bookId = new URLSearchParams(window.location.search).get("id");

    try {
        // Fetch book details
        const res = await fetch(`${API}/books/${bookId}`);
        const data = await res.json();
        currentBook = data.book;

        // Store delivery method for later use
        currentBook.selectedDeliveryMethod = deliveryMethod;

        if (deliveryMethod === "pickup") {
            // For pickup, proceed directly to payment without address
            await proceedToPayment();
        } else {
            // For courier, show address modal
            await showAddressModal();
        }
    } catch (err) {
        console.error("Error:", err);
        alert("Error loading book details");
    }
}

function redirectToChequePaymentForm() {
    // Check authentication first
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    
    if (!token || !user) {
        alert("Please log in to place an order.");
        window.location.href = "/login.html";
        return;
    }
    
    const bookId = new URLSearchParams(window.location.search).get("id");
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    
    // Get book details from the page (should be loaded already)
    const book = window.currentBook;
    if (!book) {
        alert("Book data not loaded. Please refresh the page and try again.");
        return;
    }
    
    // Calculate total amount
    const basePrice = parseFloat(book.price) * quantity;
    const weight = (book.weight || 0.5) * quantity;
    
    // Create order in pending state first
    createPendingOrder('cheque', deliveryMethod, basePrice, weight, bookId, quantity);
}

function redirectToAccountTransferForm() {
    // Check authentication first
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    
    if (!token || !user) {
        alert("Please log in to place an order.");
        window.location.href = "/login.html";
        return;
    }
    
    const bookId = new URLSearchParams(window.location.search).get("id");
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    
    // Get book details from the page (should be loaded already)
    const book = window.currentBook;
    if (!book) {
        alert("Book data not loaded. Please refresh the page and try again.");
        return;
    }
    
    // Calculate total amount
    const basePrice = parseFloat(book.price) * quantity;
    const weight = (book.weight || 0.5) * quantity;
    
    // Create order in pending state first
    createPendingOrder('transfer', deliveryMethod, basePrice, weight, bookId, quantity);
}

async function createPendingOrder(paymentType, deliveryMethod, basePrice, weight, bookId, quantity) {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    
    // Double-check authentication
    if (!token || !user) {
        alert("Authentication required. Please log in to place an order.");
        window.location.href = "/login.html";
        return;
    }
    
    try {
        // Calculate courier charge if needed
        let courierCharge = 0;
        if (deliveryMethod === "courier") {
            courierCharge = await calculateCourierCharge(weight);
        }
        
        const totalAmount = basePrice + courierCharge;
        
        console.log("Creating pending order with:", {
            paymentType,
            deliveryMethod,
            basePrice,
            courierCharge,
            totalAmount,
            bookId,
            quantity
        });
        
        // Create pending order
        const orderRes = await fetch(`${API}/orders/create-pending`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                bookId: bookId,
                quantity: quantity,
                deliveryMethod: deliveryMethod,
                paymentType: paymentType, // 'cheque' or 'transfer'
                basePrice: basePrice,
                courierCharge: courierCharge,
                totalAmount: totalAmount,
                status: 'pending_payment_verification'
            })
        });

        const orderData = await orderRes.json();

        if (!orderRes.ok) {
            console.error("Order creation failed:", orderRes.status, orderData);
            
            if (orderRes.status === 401) {
                alert("Your session has expired. Please log in again.");
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                window.location.href = "/login.html";
                return;
            }
            
            throw new Error(orderData.error || `Failed to create order (${orderRes.status})`);
        }

        console.log("Order created successfully:", orderData);

        // Show confirmation and redirect to upload page
        alert(`Order created! Order ID: ${orderData.orderId}\n\nYou will now be redirected to upload payment details.`);
        
        // Redirect to payment upload page with order details
        window.location.href = `/payment-upload.html?orderId=${orderData.orderId}&amount=${totalAmount}&type=${paymentType}`;

    } catch (err) {
        console.error("Error creating pending order:", err);
        
        if (err.message.includes("Unauthorized")) {
            alert("Authentication failed. Please log in again.");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/login.html";
        } else {
            alert(`Error creating order: ${err.message}\n\nPlease try again or contact support.`);
        }
    }
}

async function showAddressModal() {
    const token = localStorage.getItem("token");

    try {
        // Fetch user address
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        
        if (data.user && data.user.address) {
            userAddress = data.user.address;
            
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
        }

        // Show modal
        document.getElementById("addressModal").style.display = "block";

    } catch (err) {
        console.error("Error loading address:", err);
        alert("Error loading address. Please try again.");
    }
}

function closeAddressModal() {
    document.getElementById("addressModal").style.display = "none";
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

        alert("Address updated successfully!");
        toggleAddressForm();

    } catch (err) {
        console.error("Address update error:", err);
        alert("Error updating address");
    }
}

/* -----------------------------------
   Calculate Courier Charge (Dynamic)
----------------------------------- */
async function calculateCourierCharge(totalWeight) {
    if (totalWeight <= 0) return 0;
    
    // Use dynamic shipping calculator
    if (window.dynamicShipping) {
        try {
            const charge = await window.dynamicShipping.calculateShippingCharge(totalWeight);
            return isNaN(charge) ? 0 : parseFloat(charge);
        } catch (error) {
            console.error('Error calculating dynamic shipping:', error);
        }
    }
    
    // Fallback to hardcoded calculation
    const charge = Math.ceil(totalWeight / 100);
    const finalCharge = Math.max(charge, 50);
    return isNaN(finalCharge) ? 0 : finalCharge;
}

/* -----------------------------------
   Proceed to Payment with Address
----------------------------------- */
async function proceedToPayment() {
    const token = localStorage.getItem("token");
    const deliveryMethod = currentBook?.selectedDeliveryMethod || "courier";
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    
    // Get the appropriate button based on delivery method
    const buyBtn = deliveryMethod === "pickup" 
        ? document.getElementById("buyPickupBtn")
        : document.getElementById("buyCourierBtn");

    // Validate address only for courier delivery
    if (deliveryMethod === "courier") {
        if (!userAddress || !userAddress.street || !userAddress.taluk || !userAddress.district || !userAddress.state || !userAddress.pincode || !userAddress.phone) {
            const proceed = confirm("You haven't set a delivery address. Do you want to proceed anyway?");
            if (!proceed) {
                return;
            }
            userAddress = null;
        }
    }

    if (!currentBook) {
        alert("Book details not loaded");
        return;
    }

    // Close modal if open
    closeAddressModal();

    // Calculate pricing based on delivery method and quantity
    const bookWeight = (currentBook.weight || 0.5) * quantity;
    const itemsTotal = currentBook.price * quantity;
    let courierCharge = 0;
    let totalAmount = itemsTotal;
    let confirmMsg = "";

    if (deliveryMethod === "pickup") {
        confirmMsg = `Order Summary (Book-stall Pickup):\n\nBook: ${currentBook.title}\nQuantity: ${quantity}\nPrice: ₹${itemsTotal.toFixed(2)}\nDelivery: Pickup at store (FREE)\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
    } else {
        courierCharge = await calculateCourierCharge(bookWeight);
        totalAmount = itemsTotal + courierCharge;
        confirmMsg = `Order Summary (Courier Delivery):\n\nBook: ${currentBook.title}\nQuantity: ${quantity}\nPrice: ₹${itemsTotal.toFixed(2)}\nWeight: ${bookWeight.toFixed(2)} kg\nCourier Charge: ₹${courierCharge.toFixed(2)}\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
    }
    
    if (!confirm(confirmMsg)) {
        return;
    }

    const items = [{
        id: currentBook._id,
        title: currentBook.title,
        author: currentBook.author,
        price: currentBook.price,
        quantity: quantity,
        coverImage: currentBook.cover_image,
        type: 'book',
        weight: currentBook.weight || 0.5
    }];

    try {
        if (buyBtn) {
            buyBtn.disabled = true;
            buyBtn.textContent = "Processing...";
        }

        // 1️⃣ Create backend Razorpay order with delivery method and address
        const orderRes = await fetch(`${API}/payments/create-order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: totalAmount,
                items: items,
                deliveryAddress: deliveryMethod === "courier" ? userAddress : null,
                deliveryMethod: deliveryMethod,
                courierCharge: courierCharge,
                totalWeight: bookWeight
            })
        });

        const orderData = await orderRes.json();

        if (!orderRes.ok || !orderData.order) {
            throw new Error(orderData.error || "Failed to create order");
        }

        // 2️⃣ Razorpay Checkout
        const RZP_KEY = window.RAZORPAY_KEY || "rzp_live_RqJ96DOclW0PuU";

        const options = {
            key: RZP_KEY,
            amount: orderData.order.amount,
            currency: "INR",
            name: "Shree Mata",
            description: currentBook.title,
            order_id: orderData.order.id,

            handler: async function (response) {
                try {
                    // 3️⃣ Verify payment on backend
                    const verifyRes = await fetch(`${API}/payments/verify`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            items: items,
                            totalAmount: totalAmount,
                            deliveryAddress: deliveryMethod === "courier" ? userAddress : null,
                            deliveryMethod: deliveryMethod,
                            courierCharge: courierCharge,
                            totalWeight: bookWeight
                        })
                    });

                    const verifyData = await verifyRes.json();

                    if (!verifyRes.ok) {
                        alert(verifyData.error || "Payment verification failed");
                        if (buyBtn) {
                            buyBtn.disabled = false;
                            buyBtn.textContent = "Buy Now";
                        }
                        return;
                    }

                    // ✅ Payment verification successful!
                    console.log("✅ Payment verified successfully!");
                    
                    // Show success popup with order details
                    const orderData = {
                        orderId: response.razorpay_payment_id,
                        items: quantity,
                        amount: totalAmount,
                        deliveryMethod: deliveryMethod === 'pickup' ? 'Store Pickup' : 'Courier Delivery',
                        paymentMethod: 'Online Payment'
                    };
                    
                    console.log("📋 Order data for popup:", orderData);
                    
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

                } catch (err) {
                    console.error("Verification error:", err);
                    alert("Payment succeeded but verification failed. Contact support.");
                    if (buyBtn) {
                        buyBtn.disabled = false;
                        buyBtn.textContent = "Buy Now";
                    }
                }
            },
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

        alert("Payment cancelled. No order was placed.");

        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.textContent = "Buy Now";
        }

        // OPTIONAL: Do not keep half-created pending orders visible
        // Just stay on the same page without redirecting.
    }
},


            prefill: {
                name: (JSON.parse(localStorage.getItem("user") || "{}")).name || "",
                email: (JSON.parse(localStorage.getItem("user") || "{}")).email || ""
            },

            theme: { color: "#3399cc" }
        };

        const rzp = new Razorpay(options);
        rzp.open();

    } catch (err) {
        console.error("Payment Error:", err);
        alert(err.message || "Payment failed. Try again.");
        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.textContent = "Buy Now";
        }
    }
}

/* -----------------------------------
   HANDLE ADD TO CART (SIMPLE)
----------------------------------- */
async function handleAddToCart() {
    // Simply add to cart with pickup method (no charges)
    await addToCart("pickup");
}

/* -----------------------------------
   UPDATE CART COUNT
----------------------------------- */
function updateCartCount() {
    const cartIcon = document.getElementById("cartIcon");
    const cartCount = document.getElementById("cartCount");
    
    if (!cartIcon) return;

    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    if (cartCount) {
        // If there's a cartCount span, update it
        cartCount.textContent = totalItems;
    } else {
        // Otherwise update the cart icon text
        if (totalItems > 0) {
            cartIcon.innerHTML = `🛒 Cart (${totalItems})`;
        } else {
            cartIcon.innerHTML = `🛒 Cart`;
        }
    }
}

/* -----------------------------------
   ADD TO CART
----------------------------------- */
async function addToCart(deliveryMethod = "courier") {
    const bookId = new URLSearchParams(window.location.search).get("id");

    // Check stock status before adding to cart
    const book = window.currentBook;
    if (book && book.trackStock && book.stockStatus === 'out_of_stock') {
        alert("❌ This book is currently out of stock and cannot be added to cart.");
        return;
    }
    
    // Check if requested quantity is available for limited stock
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    if (book && book.trackStock && book.stockStatus === 'limited_stock') {
        const availableStock = book.stockQuantity || 0;
        if (quantity > availableStock) {
            alert(`❌ Only ${availableStock} copies are available. Please reduce the quantity.`);
            return;
        }
    }

    const cart = getCart();

    // Check if book with same delivery method already exists
    const existingItemIndex = cart.findIndex(item => 
        item.id === bookId && item.deliveryMethod === deliveryMethod
    );

    if (existingItemIndex !== -1) {
        // If exists, check if increasing quantity would exceed stock
        const newQuantity = cart[existingItemIndex].quantity + 1;
        if (book && book.trackStock && book.stockStatus === 'limited_stock') {
            const availableStock = book.stockQuantity || 0;
            if (newQuantity > availableStock) {
                alert(`❌ Cannot add more. Only ${availableStock} copies are available and you already have ${cart[existingItemIndex].quantity} in cart.`);
                return;
            }
        }
        
        // If stock check passes, increase quantity
        cart[existingItemIndex].quantity = newQuantity;
        saveCart(cart);
        updateCartCount(); // Update cart count
        
        // Show success message with cart count
        const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        return alert(`✅ Book quantity updated in cart!\n\nCart now has ${cartCount} item${cartCount > 1 ? 's' : ''} (${deliveryMethod === 'pickup' ? 'Pickup' : 'Courier'}).`);
    }

    // Use stored book data
    if (!book) {
        return alert("Book data not loaded. Please refresh the page.");
    }

    // Calculate price based on delivery method
    const basePrice = parseFloat(book.price);
    const weight = book.weight || 0.5;
    const courierCharge = deliveryMethod === "courier" ? await calculateCourierCharge(weight) : 0;
    const totalPrice = basePrice + courierCharge;

    cart.push({
        id: bookId,
        title: book.title,
        author: book.author,
        price: totalPrice,
        basePrice: basePrice,
        courierCharge: courierCharge,
        coverImage: book.cover_image,
        quantity: quantity,
        weight: book.weight || 0.5,
        type: 'book',
        deliveryMethod: deliveryMethod
    });

    saveCart(cart);
    updateCartCount(); // Update cart count
    
    // Show success message with cart count
    const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const methodText = deliveryMethod === 'pickup' ? 'Book-stall Pickup' : 'Courier Delivery';
    alert(`✅ "${book.title}" added to cart!\n\nCart now has ${cartCount} item${cartCount > 1 ? 's' : ''} for ${methodText}.`);
}

/* -----------------------------------
   SHOW ERROR 
----------------------------------- */
function showError() {
    document.getElementById("loadingSpinner").style.display = "none";
    document.getElementById("errorState").style.display = "block";
}

/* -----------------------------------
   BILLING ADDRESS MODAL FUNCTIONS
----------------------------------- */

// Billing Address Modal Functions
async function showBillingAddressModal() {
    console.log("showBillingAddressModal called for book page");
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!token || !user) {
        const id = new URLSearchParams(window.location.search).get("id");
        localStorage.setItem("redirectAfterLogin", `/book.html?id=${id}`);
        return window.location.href = "/login.html";
    }

    // Show/hide delivery address section based on delivery method
    const deliverySection = document.getElementById("deliveryAddressSection");
    const modalTitle = document.getElementById("billingModalTitle");
    
    console.log("Selected delivery method:", window.selectedDeliveryMethod);
    console.log("Delivery section element:", deliverySection);
    console.log("Modal title element:", modalTitle);
    
    if (window.selectedDeliveryMethod === "courier") {
        console.log("Showing delivery address section for courier");
        if (deliverySection) deliverySection.style.display = "block";
        if (modalTitle) modalTitle.textContent = "📋 Billing & Delivery Details";
    } else {
        console.log("Hiding delivery address section for pickup");
        if (deliverySection) deliverySection.style.display = "none";
        if (modalTitle) modalTitle.textContent = "📋 Billing Details (Store Pickup)";
    }

    try {
        // Fetch user data from server
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        
        if (data.user) {
            const userData = data.user;
            
            // Pre-fill billing address with user data
            document.getElementById("billingName").value = userData.name || "";
            document.getElementById("billingPhone").value = userData.phone || "";
            document.getElementById("billingEmail").value = userData.email || "";
            
            // Pre-fill address fields
            if (userData.address) {
                document.getElementById("billingAddress1").value = userData.address.homeAddress1 || userData.address.street || "";
                document.getElementById("billingAddress2").value = userData.address.homeAddress2 || "";
                document.getElementById("billingTaluk").value = userData.address.taluk || "";
                document.getElementById("billingDistrict").value = userData.address.district || "";
                document.getElementById("billingState").value = userData.address.state || "";
                document.getElementById("billingPincode").value = userData.address.pincode || "";
                
                // Pre-fill delivery address with same data initially
                document.getElementById("deliveryName").value = userData.name || "";
                document.getElementById("deliveryPhone").value = userData.address.phone || userData.phone || "";
                document.getElementById("deliveryAddress1").value = userData.address.homeAddress1 || userData.address.street || "";
                document.getElementById("deliveryAddress2").value = userData.address.homeAddress2 || "";
                document.getElementById("deliveryTaluk").value = userData.address.taluk || "";
                document.getElementById("deliveryDistrict").value = userData.address.district || "";
                document.getElementById("deliveryState").value = userData.address.state || "";
                document.getElementById("deliveryPincode").value = userData.address.pincode || "";
            }
        }

        // Show modal
        const modal = document.getElementById("billingAddressModal");
        console.log("Billing address modal element:", modal);
        if (modal) {
            modal.style.display = "block";
            console.log("Billing address modal should now be visible");
        } else {
            console.error("Billing address modal not found!");
        }

    } catch (err) {
        console.error("Error loading user data:", err);
        // Show modal anyway with empty fields
        const modal = document.getElementById("billingAddressModal");
        if (modal) {
            modal.style.display = "block";
            console.log("Billing address modal shown with empty fields");
        } else {
            console.error("Billing address modal not found in catch block!");
        }
    }
}

function closeBillingAddressModal() {
    document.getElementById("billingAddressModal").style.display = "none";
}

function toggleDeliveryAddress() {
    const checkbox = document.getElementById("usePermanentAddress");
    const deliveryFields = document.getElementById("deliveryAddressFields");
    
    if (checkbox.checked) {
        // Copy billing address to delivery address
        document.getElementById("deliveryName").value = document.getElementById("billingName").value;
        document.getElementById("deliveryPhone").value = document.getElementById("billingPhone").value;
        document.getElementById("deliveryAddress1").value = document.getElementById("billingAddress1").value;
        document.getElementById("deliveryAddress2").value = document.getElementById("billingAddress2").value;
        document.getElementById("deliveryTaluk").value = document.getElementById("billingTaluk").value;
        document.getElementById("deliveryDistrict").value = document.getElementById("billingDistrict").value;
        document.getElementById("deliveryState").value = document.getElementById("billingState").value;
        document.getElementById("deliveryPincode").value = document.getElementById("billingPincode").value;
        
        // Hide delivery fields
        deliveryFields.style.display = "none";
    } else {
        // Show delivery fields
        deliveryFields.style.display = "block";
    }
}

// Updated payment method handlers to use collected addresses
function proceedWithOnlinePayment() {
    closePaymentMethodModal();
    // Continue with Razorpay flow using collected addresses
    proceedWithRazorpayPaymentWithAddresses();
}

function proceedWithChequePayment() {
    closePaymentMethodModal();
    // Redirect to cheque payment form with addresses
    redirectToChequePaymentFormWithAddresses();
}

function proceedWithAccountTransfer() {
    closePaymentMethodModal();
    // Redirect to account transfer form with addresses
    redirectToAccountTransferFormWithAddresses();
}

// New functions for handling addresses
async function proceedWithRazorpayPaymentWithAddresses() {
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const bookId = new URLSearchParams(window.location.search).get("id");

    if (!window.billingAddress) {
        alert("Billing address not collected. Please try again.");
        return;
    }

    try {
        // Fetch book details
        const res = await fetch(`${API}/books/${bookId}`);
        const data = await res.json();

        if (!res.ok) throw new Error("Book not found");

        const book = data.book;
        const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;

        // Calculate pricing
        const basePrice = parseFloat(book.price) * quantity;
        const weight = (book.weight || 0.5) * quantity;
        let courierCharge = 0;
        let totalAmount = basePrice;

        if (deliveryMethod === "courier") {
            courierCharge = await calculateCourierCharge(weight);
            courierCharge = isNaN(courierCharge) ? 0 : parseFloat(courierCharge);
            totalAmount = basePrice + courierCharge;
        }

        const items = [{
            id: book._id,
            title: book.title,
            price: book.price,
            quantity: quantity,
            coverImage: book.cover_image,
            type: 'book',
            weight: book.weight || 0.5
        }];

        // Prepare delivery address for courier
        let deliveryAddress = null;
        if (deliveryMethod === "courier") {
            const addressToUse = window.deliveryAddress || window.billingAddress;
            deliveryAddress = {
                homeAddress1: addressToUse.address1,
                homeAddress2: addressToUse.address2,
                streetName: "",
                landmark: "",
                village: "",
                taluk: addressToUse.taluk,
                district: addressToUse.district,
                state: addressToUse.state,
                pincode: addressToUse.pincode,
                phone: addressToUse.phone,
                street: addressToUse.address1
            };
        }

        // Create backend Razorpay order with addresses
        const orderRes = await fetch(`${API}/payments/create-order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                amount: totalAmount,
                items: items,
                deliveryAddress: deliveryAddress,
                billingAddress: window.billingAddress,
                deliveryMethod: deliveryMethod,
                courierCharge: courierCharge,
                totalWeight: weight
            })
        });

        const orderData = await orderRes.json();

        if (!orderRes.ok || !orderData.order) {
            throw new Error(orderData.error || "Failed to create order");
        }

        // Razorpay Checkout
        const RZP_KEY = window.RAZORPAY_KEY || "rzp_live_RqJ96DOclW0PuU";
        
        const options = {
            key: RZP_KEY,
            amount: orderData.order.amount,
            currency: "INR",
            name: "Shree Mata",
            description: `Book: ${book.title}`,
            order_id: orderData.order.id,
            handler: async function(response) {
                try {
                    // Verify payment on backend
                    const verifyRes = await fetch(`${API}/payments/verify`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${localStorage.getItem("token")}`
                        },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    });

                    const verifyData = await verifyRes.json();

                    if (verifyRes.ok && verifyData.success) {
                        // Show success popup
                        const orderData = {
                            orderId: response.razorpay_payment_id,
                            items: 1,
                            amount: totalAmount,
                            deliveryMethod: deliveryMethod === 'pickup' ? 'Store Pickup' : 'Courier Delivery',
                            paymentMethod: 'Online Payment'
                        };
                        
                        showSuccessPopup(orderData);
                    } else {
                        throw new Error(verifyData.error || "Payment verification failed");
                    }
                } catch (err) {
                    console.error("Payment verification error:", err);
                    alert("Payment verification failed. Please contact support.");
                }
            },
            prefill: {
                name: window.billingAddress.name,
                email: window.billingAddress.email,
                contact: window.billingAddress.phone
            },
            theme: {
                color: "#667eea"
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();

    } catch (err) {
        console.error("Payment error:", err);
        alert("Error processing payment: " + err.message);
    }
}

function redirectToChequePaymentFormWithAddresses() {
    const bookId = new URLSearchParams(window.location.search).get("id");
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    
    if (!window.currentBook || !window.billingAddress) {
        alert("Book data or billing address not loaded. Please try again.");
        return;
    }
    
    // Calculate total amount
    const basePrice = parseFloat(window.currentBook.price) * quantity;
    const weight = (window.currentBook.weight || 0.5) * quantity;
    
    // Create order with addresses
    createBookPendingOrderWithAddresses('cheque', deliveryMethod, basePrice, weight, bookId, quantity);
}

function redirectToAccountTransferFormWithAddresses() {
    const bookId = new URLSearchParams(window.location.search).get("id");
    const deliveryMethod = window.selectedDeliveryMethod || "courier";
    const quantity = parseInt(document.getElementById("bookQuantity").value) || 1;
    
    if (!window.currentBook || !window.billingAddress) {
        alert("Book data or billing address not loaded. Please try again.");
        return;
    }
    
    // Calculate total amount
    const basePrice = parseFloat(window.currentBook.price) * quantity;
    const weight = (window.currentBook.weight || 0.5) * quantity;
    
    // Create order with addresses
    createBookPendingOrderWithAddresses('transfer', deliveryMethod, basePrice, weight, bookId, quantity);
}

async function createBookPendingOrderWithAddresses(paymentType, deliveryMethod, basePrice, weight, bookId, quantity) {
    const token = localStorage.getItem("token");
    
    if (!window.billingAddress) {
        alert("Billing address not collected. Please try again.");
        return;
    }
    
    try {
        // Calculate courier charge if needed
        let courierCharge = 0;
        if (deliveryMethod === "courier") {
            courierCharge = await calculateCourierCharge(weight);
            courierCharge = isNaN(courierCharge) ? 0 : parseFloat(courierCharge);
        }
        
        const totalAmount = basePrice + courierCharge;
        
        // Prepare delivery address
        let deliveryAddress = null;
        if (deliveryMethod === "courier") {
            const addressToUse = window.deliveryAddress || window.billingAddress;
            deliveryAddress = {
                homeAddress1: addressToUse.address1,
                homeAddress2: addressToUse.address2,
                taluk: addressToUse.taluk,
                district: addressToUse.district,
                state: addressToUse.state,
                pincode: addressToUse.pincode,
                phone: addressToUse.phone,
                street: addressToUse.address1
            };
        }
        
        const requestData = {
            bookId: bookId,
            quantity: quantity,
            deliveryMethod: deliveryMethod,
            paymentType: paymentType,
            basePrice: basePrice,
            courierCharge: courierCharge,
            totalAmount: totalAmount,
            itemType: 'book',
            billingAddress: window.billingAddress,
            deliveryAddress: deliveryAddress
        };
        
        // Create pending order for book
        const orderRes = await fetch(`${API}/orders/create-pending`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });

        const orderData = await orderRes.json();

        if (!orderRes.ok) {
            throw new Error(orderData.error || `Server error: ${orderRes.status}`);
        }

        // Show confirmation and redirect to upload page
        alert(`Book order created! Order ID: ${orderData.orderId}\n\nYou will now be redirected to upload payment details.`);
        
        // Redirect to payment upload page with order details
        window.location.href = `/payment-upload.html?orderId=${orderData.orderId}&amount=${totalAmount}&type=${paymentType}`;

    } catch (err) {
        console.error("Error creating pending book order:", err);
        alert("Error creating order: " + err.message + "\n\nPlease try again or contact support.");
    }
}

// Courier charge calculation function
async function calculateCourierCharge(weight) {
    try {
        // Use the global shipping calculator if available
        if (window.shippingCalculator) {
            const shippingResult = window.shippingCalculator.calculateShipping(weight, 0);
            return shippingResult.cost || 0;
        }
        
        // Fallback calculation if shipping calculator not available
        const baseCharge = 50;
        const ratePerKg = 25;
        return baseCharge + (weight * ratePerKg);
    } catch (error) {
        console.error('Error calculating courier charge:', error);
        // Fallback calculation
        const baseCharge = 50;
        const ratePerKg = 25;
        return baseCharge + (weight * ratePerKg);
    }
}

// Setup billing address form submission
function setupBillingAddressForm() {
    console.log("setupBillingAddressForm called");
    // Use a timeout to ensure DOM is ready
    setTimeout(() => {
        console.log("Looking for billing address form...");
        const billingForm = document.getElementById("billingAddressForm");
        console.log("Billing form found:", !!billingForm);
        if (billingForm) {
            billingForm.addEventListener("submit", function(e) {
                e.preventDefault();
                
                console.log("Form submitted, processing...");
                
                // Validate billing address
                const billingData = {
                    name: document.getElementById("billingName").value.trim(),
                    phone: document.getElementById("billingPhone").value.trim(),
                    email: document.getElementById("billingEmail").value.trim(),
                    address1: document.getElementById("billingAddress1").value.trim(),
                    address2: document.getElementById("billingAddress2").value.trim(),
                    taluk: document.getElementById("billingTaluk").value.trim(),
                    district: document.getElementById("billingDistrict").value.trim(),
                    state: document.getElementById("billingState").value.trim(),
                    pincode: document.getElementById("billingPincode").value.trim()
                };
                
                // Validate required billing fields
                if (!billingData.name || !billingData.phone || !billingData.email || 
                    !billingData.address1 || !billingData.taluk || !billingData.district || 
                    !billingData.state || !billingData.pincode) {
                    alert("Please fill in all required billing fields (marked with *)");
                    return;
                }
                
                // Validate formats
                if (!/^\d{6}$/.test(billingData.pincode)) {
                    alert("Please enter a valid 6-digit pincode for billing address");
                    return;
                }
                
                if (!/^\d{10}$/.test(billingData.phone)) {
                    alert("Please enter a valid 10-digit phone number for billing");
                    return;
                }
                
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingData.email)) {
                    alert("Please enter a valid email address");
                    return;
                }
                
                // Validate delivery address if courier delivery
                let deliveryData = null;
                if (window.selectedDeliveryMethod === "courier") {
                    const usePermanent = document.getElementById("usePermanentAddress").checked;
                    
                    if (usePermanent) {
                        // Use billing address for delivery
                        deliveryData = {
                            name: billingData.name,
                            phone: billingData.phone,
                            address1: billingData.address1,
                            address2: billingData.address2,
                            taluk: billingData.taluk,
                            district: billingData.district,
                            state: billingData.state,
                            pincode: billingData.pincode
                        };
                    } else {
                        // Use separate delivery address
                        deliveryData = {
                            name: document.getElementById("deliveryName").value.trim(),
                            phone: document.getElementById("deliveryPhone").value.trim(),
                            address1: document.getElementById("deliveryAddress1").value.trim(),
                            address2: document.getElementById("deliveryAddress2").value.trim(),
                            taluk: document.getElementById("deliveryTaluk").value.trim(),
                            district: document.getElementById("deliveryDistrict").value.trim(),
                            state: document.getElementById("deliveryState").value.trim(),
                            pincode: document.getElementById("deliveryPincode").value.trim()
                        };
                        
                        // Validate delivery fields
                        if (!deliveryData.name || !deliveryData.phone || !deliveryData.address1 || 
                            !deliveryData.taluk || !deliveryData.district || !deliveryData.state || 
                            !deliveryData.pincode) {
                            alert("Please fill in all required delivery fields or use permanent address");
                            return;
                        }
                        
                        if (!/^\d{6}$/.test(deliveryData.pincode)) {
                            alert("Please enter a valid 6-digit pincode for delivery address");
                            return;
                        }
                        
                        if (!/^\d{10}$/.test(deliveryData.phone)) {
                            alert("Please enter a valid 10-digit phone number for delivery");
                            return;
                        }
                    }
                }
                
                // Store addresses globally for later use
                window.billingAddress = billingData;
                window.deliveryAddress = deliveryData;
                
                console.log("Billing address stored:", window.billingAddress);
                console.log("Delivery address stored:", window.deliveryAddress);
                console.log("Selected delivery method:", window.selectedDeliveryMethod);
                
                // Close billing modal and show payment method modal
                closeBillingAddressModal();
                
                // Add a small delay to ensure modal transition
                setTimeout(() => {
                    showPaymentMethodModal();
                }, 100);
            });
        } else {
            console.error("Billing address form not found!");
        }
    }, 500);
}