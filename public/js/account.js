const API = window.API_URL;

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    // ❌ If no token → user not logged in
    if (!token || !user) {
        window.location.href = "/login.html";
        return;
    }

    loadProfile();
    loadOrders();
    loadAddress();
    loadPoints();
    loadStoreDetailsForAccount(); // Load store details

    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("addressForm").addEventListener("submit", saveAddress);
});

/* -----------------------------------------
   LOAD PROFILE
----------------------------------------- */
function loadProfile() {
    const user = JSON.parse(localStorage.getItem("user"));

    document.getElementById("accName").textContent = user.name;
    document.getElementById("accEmail").textContent = user.email;

    document.getElementById("editName").value = user.name;
    document.getElementById("editEmail").value = user.email;
}

/* -----------------------------------------
   CHANGE PAGE SECTIONS
----------------------------------------- */
function showSection(section) {
    document.getElementById("profileSection").style.display = "none";
    document.getElementById("editSection").style.display = "none";
    document.getElementById("addressSection").style.display = "none";
    document.getElementById("ordersSection").style.display = "none";
    document.getElementById("pointsSection").style.display = "none";

    document.getElementById(section + "Section").style.display = "block";
    
    // Reload points when section is shown
    if (section === 'points') {
        loadPoints();
    }
}

/* -----------------------------------------
   LOAD ORDERS (SAFE)
----------------------------------------- */
async function loadOrders() {
    const token = localStorage.getItem("token");

    if (!token) {
        document.getElementById("ordersList").innerHTML = "<p>Please login to view orders.</p>";
        return;
    }

    try {
        const res = await fetch(`${API}/orders`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        const container = document.getElementById("ordersList");
        container.innerHTML = "";

        if (!data.orders || data.orders.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 10px;">📦</div>
                    <p>No orders yet. Start shopping!</p>
                </div>
            `;
            return;
        }

        data.orders.forEach(order => {
            const div = document.createElement("div");
            div.classList.add("order-card");
            
            const itemsList = order.items.map(item => {
                const qty = item.quantity > 1 ? ` (x${item.quantity})` : '';
                return `${item.title}${qty}`;
            }).join(', ');
            
            const statusColor = order.status === 'completed' ? '#28a745' : 
                               order.status === 'pending' ? '#ffc107' : '#dc3545';
            
            const deliveryStatus = order.deliveryStatus || 'pending';
            const deliveryColor = deliveryStatus === 'delivered' ? '#28a745' : 
                                 deliveryStatus === 'shipped' ? '#2196F3' : '#ffc107';

            div.innerHTML = `
                <h3>Order #${order._id.slice(-8)}</h3>
                <p><strong>Items:</strong> ${itemsList}</p>
                <p><strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}</p>
                <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                <p><strong>Payment Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${order.status}</span></p>
                <p><strong>Delivery Status:</strong> <span style="color: ${deliveryColor}; font-weight: 600;">${deliveryStatus}</span></p>
                ${order.deliveryAddress && order.deliveryAddress.street ? `
                    <p><strong>Delivery Address:</strong> ${order.deliveryAddress.street}, ${order.deliveryAddress.taluk || order.deliveryAddress.city}, ${order.deliveryAddress.district || ''}</p>
                ` : ''}
            `;
            container.appendChild(div);
        });
    } 
    catch (error) {
        console.error("Order load error:", error);
        document.getElementById("ordersList").innerHTML = "<p style='color: #dc3545;'>Error loading orders. Please try again.</p>";
    }
}

/* -----------------------------------------
   LOGOUT
----------------------------------------- */
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
}

// ----------------------------
// EDIT PROFILE SUBMIT
// ----------------------------

document.getElementById("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        window.location.href = "/login.html";
        return;
    }

    const name = document.getElementById("editName").value.trim();
    const email = document.getElementById("editEmail").value.trim();

    try {
        const res = await fetch(`${API}/users/update`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ name, email })
        });

        const data = await res.json();
        console.log("Update response:", data);

        if (!res.ok) {
            alert(data.error || "Update failed");
            return;
        }

        // ✔ Save updated user to localStorage
        localStorage.setItem("user", JSON.stringify(data.user));

        // ✔ Refresh name & email inside account page
        loadProfile();

        // ✔ Update navbar username
        const navUser = document.getElementById("userName");
        if (navUser) navUser.textContent = `Hello, ${data.user.name}`;

        alert("Profile updated successfully!");
        showSection("profile");

    } catch (err) {
        console.error("Profile update error:", err);
        alert("Profile update error");
    }
});


/* -----------------------------------------
   LOAD ADDRESS
----------------------------------------- */
async function loadAddress() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (data.user && data.user.address) {
            const addr = data.user.address;
            
            document.getElementById("displayStreet").textContent = addr.street || "Not set";
            document.getElementById("displayTaluk").textContent = addr.taluk || "Not set";
            document.getElementById("displayDistrict").textContent = addr.district || "Not set";
            document.getElementById("displayState").textContent = addr.state || "Not set";
            document.getElementById("displayPincode").textContent = addr.pincode || "Not set";
            document.getElementById("displayPhone").textContent = addr.phone || "Not set";

            // Pre-fill form
            document.getElementById("street").value = addr.street || "";
            document.getElementById("taluk").value = addr.taluk || "";
            document.getElementById("district").value = addr.district || "";
            document.getElementById("state").value = addr.state || "";
            document.getElementById("pincode").value = addr.pincode || "";
            document.getElementById("phone").value = addr.phone || "";
        }
    } catch (err) {
        console.error("Error loading address:", err);
    }
}

/* -----------------------------------------
   TOGGLE ADDRESS EDIT FORM
----------------------------------------- */
function toggleAddressEdit() {
    const form = document.getElementById("addressForm");
    const display = document.getElementById("addressDisplay");
    
    if (form.style.display === "none") {
        form.style.display = "block";
        display.style.display = "none";
    } else {
        form.style.display = "none";
        display.style.display = "block";
    }
}

/* -----------------------------------------
   SAVE ADDRESS
----------------------------------------- */
async function saveAddress(e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const address = {
        street: document.getElementById("street").value.trim(),
        taluk: document.getElementById("taluk").value.trim(),
        district: document.getElementById("district").value.trim(),
        state: document.getElementById("state").value.trim(),
        pincode: document.getElementById("pincode").value.trim(),
        phone: document.getElementById("phone").value.trim()
    };

    try {
        const res = await fetch(`${API}/users/update-address`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ address })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Failed to update address");
            return;
        }

        alert("Address updated successfully!");
        loadAddress();
        toggleAddressEdit();

    } catch (err) {
        console.error("Address update error:", err);
        alert("Error updating address");
    }
}

/* -----------------------------------------
   LOAD POINTS
----------------------------------------- */
async function loadPoints() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        // Load points balance
        const balanceRes = await fetch(`${API}/points/balance`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const balanceData = await balanceRes.json();

        document.getElementById("pointsWallet").textContent = balanceData.pointsWallet || 0;
        document.getElementById("totalPointsEarned").textContent = balanceData.totalPointsEarned || 0;
        document.getElementById("virtualReferralsCreated").textContent = balanceData.virtualReferralsCreated || 0;

        // Enable/disable redeem button
        const redeemBtn = document.getElementById("redeemBtn");
        if (balanceData.canCreateVirtual) {
            redeemBtn.disabled = false;
            redeemBtn.textContent = "Redeem 100 Points for Virtual Referral";
        } else {
            redeemBtn.disabled = true;
            redeemBtn.textContent = `Need ${100 - balanceData.pointsWallet} more points`;
        }

        // Load points history
        const historyRes = await fetch(`${API}/points/history?page=1&limit=10`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const historyData = await historyRes.json();

        const historyList = document.getElementById("pointsHistoryList");
        historyList.innerHTML = "";

        if (!historyData.transactions || historyData.transactions.length === 0) {
            historyList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <p>No points transactions yet.</p>
                </div>
            `;
            return;
        }

        historyData.transactions.forEach(tx => {
            const div = document.createElement("div");
            div.classList.add("points-transaction");
            
            const typeColor = tx.type === 'earned' ? '#28a745' : '#dc3545';
            const sign = tx.type === 'earned' ? '+' : '';
            
            div.innerHTML = `
                <div class="transaction-row">
                    <div>
                        <p style="font-weight: 600;">${tx.description}</p>
                        <p style="font-size: 0.9em; color: #666;">${new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="color: ${typeColor}; font-weight: 600; font-size: 1.2em;">${sign}${tx.points}</p>
                        <p style="font-size: 0.9em; color: #666;">Balance: ${tx.balanceAfter}</p>
                    </div>
                </div>
            `;
            historyList.appendChild(div);
        });

    } catch (err) {
        console.error("Error loading points:", err);
        document.getElementById("pointsHistoryList").innerHTML = "<p style='color: #dc3545;'>Error loading points. Please try again.</p>";
    }
}

/* -----------------------------------------
   REDEEM VIRTUAL REFERRAL
----------------------------------------- */
async function redeemVirtualReferral() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    if (!confirm("Are you sure you want to redeem 100 points for a virtual referral?")) {
        return;
    }

    try {
        const res = await fetch(`${API}/points/redeem-virtual`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Failed to redeem points");
            return;
        }

        alert(`Success! Virtual referral created: ${data.virtualUser.name}\nRemaining points: ${data.remainingPoints}`);
        loadPoints(); // Reload points display

    } catch (err) {
        console.error("Redeem error:", err);
        alert("Error redeeming points");
    }
}
/* ------------------------------
    Load Store Details for Account Page
------------------------------ */
async function loadStoreDetailsForAccount() {
    console.log('🔍 Loading store details for account page...');
    
    // Default fallback values
    const defaultStoreDetails = {
        storeName: 'Shree Mata',
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
            
            // Update store details in the account page
            const storeNameEl = document.getElementById('accountStoreName');
            const storeAddressEl = document.getElementById('accountStoreAddress');
            const storeHoursEl = document.getElementById('accountStoreHours');
            const storePhoneEl = document.getElementById('accountStorePhone');
            const storePhoneLinkEl = document.getElementById('accountStorePhoneLink');
            const pickupInstructionsEl = document.getElementById('accountPickupInstructions');
            
            if (storeNameEl) storeNameEl.textContent = storeDetails.storeName || defaultStoreDetails.storeName;
            if (storeAddressEl) storeAddressEl.textContent = storeDetails.storeAddress || defaultStoreDetails.storeAddress;
            if (storeHoursEl) storeHoursEl.textContent = storeDetails.storeHours || defaultStoreDetails.storeHours;
            if (storePhoneEl) storePhoneEl.textContent = storeDetails.storePhone || defaultStoreDetails.storePhone;
            if (storePhoneLinkEl) storePhoneLinkEl.href = `tel:${storeDetails.storePhone || defaultStoreDetails.storePhone}`;
            if (pickupInstructionsEl) pickupInstructionsEl.textContent = storeDetails.pickupInstructions || defaultStoreDetails.pickupInstructions;
            
            // Handle map link
            const mapLinkContainer = document.getElementById('accountMapLinkContainer');
            const mapLinkButton = document.getElementById('accountMapLinkButton');
            
            if (mapLinkContainer && mapLinkButton) {
                if (storeDetails.storeMapLink && storeDetails.storeMapLink.trim()) {
                    mapLinkButton.href = storeDetails.storeMapLink;
                    mapLinkContainer.style.display = 'block';
                } else {
                    mapLinkContainer.style.display = 'none';
                }
            }
            
            console.log('✅ Store details loaded successfully for account page');
        } else {
            console.warn('⚠️ Failed to load store details for account page, response not ok:', response.status);
            loadDefaultStoreDetailsForAccount(defaultStoreDetails);
        }
    } catch (error) {
        console.error('❌ Error loading store details for account page:', error);
        loadDefaultStoreDetailsForAccount(defaultStoreDetails);
    }
}

function loadDefaultStoreDetailsForAccount(defaultStoreDetails) {
    console.log('🔄 Loading default store details for account page...');
    
    const storeNameEl = document.getElementById('accountStoreName');
    const storeAddressEl = document.getElementById('accountStoreAddress');
    const storeHoursEl = document.getElementById('accountStoreHours');
    const storePhoneEl = document.getElementById('accountStorePhone');
    const storePhoneLinkEl = document.getElementById('accountStorePhoneLink');
    const pickupInstructionsEl = document.getElementById('accountPickupInstructions');
    const mapLinkContainer = document.getElementById('accountMapLinkContainer');
    
    if (storeNameEl) storeNameEl.textContent = defaultStoreDetails.storeName;
    if (storeAddressEl) storeAddressEl.textContent = defaultStoreDetails.storeAddress;
    if (storeHoursEl) storeHoursEl.textContent = defaultStoreDetails.storeHours;
    if (storePhoneEl) storePhoneEl.textContent = defaultStoreDetails.storePhone;
    if (storePhoneLinkEl) storePhoneLinkEl.href = `tel:${defaultStoreDetails.storePhone}`;
    if (pickupInstructionsEl) pickupInstructionsEl.textContent = defaultStoreDetails.pickupInstructions;
    if (mapLinkContainer) mapLinkContainer.style.display = 'none';
    
    console.log('✅ Default store details loaded for account page');
}