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

        if (user.role === "admin") {
            document.getElementById("adminLink").style.display = "block";
        }
    }
}

/* -----------------------------------
   EVENT LISTENERS
----------------------------------- */
function setupEventListeners() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    // Pickup (Book-stall) buttons
    const buyPickupBtn = document.getElementById("buyPickupBtn");
    if (buyPickupBtn) buyPickupBtn.addEventListener("click", () => handlePurchase("pickup"));

    const cartPickupBtn = document.getElementById("cartPickupBtn");
    if (cartPickupBtn) cartPickupBtn.addEventListener("click", () => addToCart("pickup"));

    // Courier buttons
    const buyCourierBtn = document.getElementById("buyCourierBtn");
    if (buyCourierBtn) buyCourierBtn.addEventListener("click", () => handlePurchase("courier"));

    const cartCourierBtn = document.getElementById("cartCourierBtn");
    if (cartCourierBtn) cartCourierBtn.addEventListener("click", () => addToCart("courier"));

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

    if (!bookId) return showError();

    try {
        const res = await fetch(`${API}/books/${bookId}`);
        const data = await res.json();

        if (!res.ok) throw new Error("Book not found");

        document.getElementById("loadingSpinner").style.display = "none";
        document.getElementById("bookDetails").style.display = "block";

        displayBookDetails(data.book);

    } catch (err) {
        console.error("Error loading book:", err);
        showError();
    }
}

/* -----------------------------------
   DISPLAY BOOK DETAILS
----------------------------------- */
function displayBookDetails(book) {
    // Store book globally for addToCart
    window.currentBook = book;
    
    document.getElementById("bookTitle").textContent = book.title;
    document.getElementById("bookAuthor").textContent = book.author;
    
    // Calculate pricing
    const basePrice = parseFloat(book.price);
    const weight = book.weight || 0.5;
    const courierCharge = calculateCourierCharge(weight);
    
    // Display pickup price (same as base price)
    document.getElementById("pickupPrice").textContent = `₹${basePrice.toFixed(2)}`;
    
    // Display courier price (base price + courier charge)
    const courierTotalPrice = basePrice + courierCharge;
    document.getElementById("courierPrice").textContent = `₹${courierTotalPrice.toFixed(2)}`;
    
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

    // Display weight and courier charge
    if (document.getElementById("bookWeight")) {
        document.getElementById("bookWeight").textContent = `${weight.toFixed(2)} kg`;
    }
    if (document.getElementById("bookCourierCharge")) {
        document.getElementById("bookCourierCharge").textContent = `₹${courierCharge.toFixed(2)}`;
    }

    const cover = document.getElementById("bookCover");
    cover.src = book.cover_image || "https://via.placeholder.com/400x600?text=No+Cover";
    cover.onerror = () => (cover.src = "https://via.placeholder.com/400x600?text=No+Cover");

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

/* -----------------------------------
   Calculate Courier Charge
----------------------------------- */
function calculateCourierCharge(totalWeight) {
    if (totalWeight <= 0) return 0;
    
    // Use the new shipping calculator if available
    if (window.shippingCalculator) {
        const shippingResult = window.shippingCalculator.calculateShipping(totalWeight, 0);
        return shippingResult.cost;
    }
    
    // Fallback to old calculation
    const charge = Math.ceil(totalWeight) * 25;
    return Math.min(charge, 100);
}

/* -----------------------------------
   Proceed to Payment with Address
----------------------------------- */
async function proceedToPayment() {
    const token = localStorage.getItem("token");
    const deliveryMethod = currentBook?.selectedDeliveryMethod || "courier";

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

    // Calculate pricing based on delivery method
    const bookWeight = currentBook.weight || 0.5;
    const itemsTotal = currentBook.price;
    let courierCharge = 0;
    let totalAmount = itemsTotal;
    let confirmMsg = "";

    if (deliveryMethod === "pickup") {
        confirmMsg = `Order Summary (Book-stall Pickup):\n\nBook: ${currentBook.title}\nPrice: ₹${itemsTotal.toFixed(2)}\nDelivery: Pickup at store (FREE)\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
    } else {
        courierCharge = calculateCourierCharge(bookWeight);
        totalAmount = itemsTotal + courierCharge;
        confirmMsg = `Order Summary (Courier Delivery):\n\nBook: ${currentBook.title}\nPrice: ₹${itemsTotal.toFixed(2)}\nWeight: ${bookWeight.toFixed(2)} kg\nCourier Charge: ₹${courierCharge.toFixed(2)}\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
    }
    
    if (!confirm(confirmMsg)) {
        return;
    }

    const items = [{
        id: currentBook._id,
        title: currentBook.title,
        author: currentBook.author,
        price: currentBook.price,
        quantity: 1,
        coverImage: currentBook.cover_image,
        type: 'book',
        weight: bookWeight
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

                    alert("Payment successful! Thank you for your purchase. Check your email for order confirmation.");
                    window.location.href = "/orders.html";

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
   ADD TO CART
----------------------------------- */
function addToCart(deliveryMethod = "courier") {
    const bookId = new URLSearchParams(window.location.search).get("id");

    const cart = getCart();

    // Check if book with same delivery method already exists
    const existingItemIndex = cart.findIndex(item => 
        item.id === bookId && item.deliveryMethod === deliveryMethod
    );

    if (existingItemIndex !== -1) {
        // If exists, increase quantity
        cart[existingItemIndex].quantity += 1;
        saveCart(cart);
        return alert(`Book quantity updated in cart (${deliveryMethod === 'pickup' ? 'Pickup' : 'Courier'})!`);
    }

    // Use stored book data
    const book = window.currentBook;
    if (!book) {
        return alert("Book data not loaded. Please refresh the page.");
    }

    // Calculate price based on delivery method
    const basePrice = parseFloat(book.price);
    const weight = book.weight || 0.5;
    const courierCharge = deliveryMethod === "courier" ? calculateCourierCharge(weight) : 0;
    const totalPrice = basePrice + courierCharge;

    cart.push({
        id: bookId,
        title: book.title,
        author: book.author,
        price: totalPrice,
        basePrice: basePrice,
        courierCharge: courierCharge,
        coverImage: book.cover_image,
        quantity: 1,
        weight: book.weight || 0.5,
        type: 'book',
        deliveryMethod: deliveryMethod
    });

    saveCart(cart);
    const methodText = deliveryMethod === 'pickup' ? 'Book-stall Pickup' : 'Courier Delivery';
    alert(`Book added to cart for ${methodText}!`);
}

/* -----------------------------------
   SHOW ERROR 
----------------------------------- */
function showError() {
    document.getElementById("loadingSpinner").style.display = "none";
    document.getElementById("errorState").style.display = "block";
}
