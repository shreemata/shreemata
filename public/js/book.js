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

    // Buy buttons
    const buyPickupBtn = document.getElementById("buyPickupBtn");
    if (buyPickupBtn) buyPickupBtn.addEventListener("click", () => handlePurchase("pickup"));

    const buyCourierBtn = document.getElementById("buyCourierBtn");
    if (buyCourierBtn) buyCourierBtn.addEventListener("click", () => handlePurchase("courier"));

    // Single Add to Cart button
    const addToCartBtn = document.getElementById("addToCartBtn");
    if (addToCartBtn) addToCartBtn.addEventListener("click", () => handleAddToCart());

    // Quantity selector buttons
    const decreaseQtyBtn = document.getElementById("decreaseQty");
    const increaseQtyBtn = document.getElementById("increaseQty");
    const quantityInput = document.getElementById("quantity");

    if (decreaseQtyBtn) {
        decreaseQtyBtn.addEventListener("click", () => {
            const currentQty = parseInt(quantityInput.value) || 1;
            if (currentQty > 1) {
                quantityInput.value = currentQty - 1;
                updatePricesForQuantity();
            }
        });
    }

    if (increaseQtyBtn) {
        increaseQtyBtn.addEventListener("click", () => {
            const currentQty = parseInt(quantityInput.value) || 1;
            if (currentQty < 99) {
                quantityInput.value = currentQty + 1;
                updatePricesForQuantity();
            }
        });
    }

    // Handle direct input changes
    if (quantityInput) {
        quantityInput.addEventListener("change", () => {
            let qty = parseInt(quantityInput.value) || 1;
            if (qty < 1) qty = 1;
            if (qty > 99) qty = 99;
            quantityInput.value = qty;
            updatePricesForQuantity();
        });
    }

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
   UPDATE PRICES FOR QUANTITY
----------------------------------- */
function updatePricesForQuantity() {
    const quantity = parseInt(document.getElementById("quantity").value) || 1;
    const book = window.currentBook;
    
    if (!book) return;
    
    const basePrice = parseFloat(book.price);
    const weight = book.weight || 0.5;
    
    // Calculate total prices for the quantity
    const totalBasePrice = basePrice * quantity;
    const totalWeight = weight * quantity;
    
    // Update pickup price (no courier charge)
    document.getElementById("pickupPrice").textContent = `₹${totalBasePrice.toFixed(2)}`;
    
    // Calculate and update courier price
    calculateCourierCharge(totalWeight).then(courierCharge => {
        const totalCourierPrice = totalBasePrice + courierCharge;
        document.getElementById("courierPrice").textContent = `₹${totalCourierPrice.toFixed(2)}`;
        
        // Update weight and courier charge display
        if (document.getElementById("bookWeight")) {
            document.getElementById("bookWeight").textContent = `${totalWeight.toFixed(2)} kg`;
        }
        if (document.getElementById("bookCourierCharge")) {
            document.getElementById("bookCourierCharge").textContent = `₹${courierCharge.toFixed(2)}`;
        }
    }).catch(error => {
        console.error('Error calculating courier charge:', error);
        // Fallback: show base price for courier too
        document.getElementById("courierPrice").textContent = `₹${totalBasePrice.toFixed(2)}`;
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

        await displayBookDetails(data.book);

    } catch (err) {
        console.error("Error loading book:", err);
        showError();
    }
}

/* -----------------------------------
   DISPLAY BOOK DETAILS
----------------------------------- */
async function displayBookDetails(book) {
    // Store book globally for addToCart
    window.currentBook = book;
    
    document.getElementById("bookTitle").textContent = book.title;
    document.getElementById("bookAuthor").textContent = book.author;
    
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
    const quantity = parseInt(document.getElementById("quantity").value) || 1;
    
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
    const bookWeight = currentBook.weight || 0.5;
    const totalWeight = bookWeight * quantity;
    const itemsTotal = currentBook.price * quantity;
    let courierCharge = 0;
    let totalAmount = itemsTotal;
    let confirmMsg = "";

    if (deliveryMethod === "pickup") {
        confirmMsg = `Order Summary (Book-stall Pickup):\n\nBook: ${currentBook.title}\nQuantity: ${quantity}\nPrice: ₹${itemsTotal.toFixed(2)}\nDelivery: Pickup at store (FREE)\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
    } else {
        courierCharge = await calculateCourierCharge(totalWeight);
        totalAmount = itemsTotal + courierCharge;
        confirmMsg = `Order Summary (Courier Delivery):\n\nBook: ${currentBook.title}\nQuantity: ${quantity}\nPrice: ₹${itemsTotal.toFixed(2)}\nWeight: ${totalWeight.toFixed(2)} kg\nCourier Charge: ₹${courierCharge.toFixed(2)}\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\n\nProceed to payment?`;
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
                totalWeight: totalWeight
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
            description: `${currentBook.title} (Qty: ${quantity})`,
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
                            totalWeight: totalWeight
                        })
                    });

                    const verifyData = await verifyRes.json();

                    if (!verifyRes.ok) {
                        alert(verifyData.error || "Payment verification failed");
                        if (buyBtn) {
                            buyBtn.disabled = false;
                            buyBtn.textContent = deliveryMethod === "pickup" ? "🏪 Buy through Store" : "🚚 Buy by Courier";
                        }
                        return;
                    }

                    // ✅ Payment verification successful!
                    console.log("✅ Payment verified successfully!");
                    
                    // Show success popup
                    if (confirm("🎉 Order Confirmed!\n\nYour payment has been processed successfully and your book order has been placed.\n\nWould you like to view your order in your account page?")) {
                        // Redirect to account page orders section
                        window.location.href = "/account.html?section=orders";
                    } else {
                        // Redirect to home
                        window.location.href = "/";
                    }

                } catch (err) {
                    console.error("Verification error:", err);
                    alert("Payment succeeded but verification failed. Contact support.");
                    if (buyBtn) {
                        buyBtn.disabled = false;
                        buyBtn.textContent = deliveryMethod === "pickup" ? "🏪 Buy through Store" : "🚚 Buy by Courier";
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
    const quantity = parseInt(document.getElementById("quantity").value) || 1;

    const cart = getCart();

    // Check if book with same delivery method already exists
    const existingItemIndex = cart.findIndex(item => 
        item.id === bookId && item.deliveryMethod === deliveryMethod
    );

    if (existingItemIndex !== -1) {
        // If exists, increase quantity by the selected amount
        cart[existingItemIndex].quantity += quantity;
        saveCart(cart);
        updateCartCount(); // Update cart count
        
        // Show success message with cart count
        const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        return alert(`✅ Book quantity updated in cart!\n\nAdded ${quantity} more. Cart now has ${cartCount} item${cartCount > 1 ? 's' : ''} (${deliveryMethod === 'pickup' ? 'Pickup' : 'Courier'}).`);
    }

    // Use stored book data
    const book = window.currentBook;
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
    alert(`✅ "${book.title}" (Qty: ${quantity}) added to cart!\n\nCart now has ${cartCount} item${cartCount > 1 ? 's' : ''} for ${methodText}.`);
}

/* -----------------------------------
   SHOW ERROR 
----------------------------------- */
function showError() {
    document.getElementById("loadingSpinner").style.display = "none";
    document.getElementById("errorState").style.display = "block";
}
