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
    
    // Check for URL parameters to show specific section
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    if (section) {
        showSection(section);
    } else {
        // Default to profile section
        showSection('profile');
    }
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
    // List of all possible sections
    const sections = ["profileSection", "editSection", "addressSection", "storeSection", "ordersSection", "pointsSection"];
    
    // Hide all sections that exist
    sections.forEach(sectionId => {
        const element = document.getElementById(sectionId);
        if (element) {
            element.style.display = "none";
        }
    });

    // Show the requested section if it exists
    const targetSection = document.getElementById(section + "Section");
    if (targetSection) {
        targetSection.style.display = "block";
    }
    
    // Update active button states
    const menuButtons = document.querySelectorAll('.account-menu button');
    menuButtons.forEach(button => {
        button.classList.remove('active');
        
        // Check if this button corresponds to the active section
        const buttonText = button.textContent.toLowerCase();
        if (
            (section === 'profile' && buttonText.includes('profile') && !buttonText.includes('edit')) ||
            (section === 'edit' && buttonText.includes('edit')) ||
            (section === 'address' && buttonText.includes('address')) ||
            (section === 'store' && buttonText.includes('store')) ||
            (section === 'orders' && buttonText.includes('order')) ||
            (section === 'points' && buttonText.includes('points'))
        ) {
            button.classList.add('active');
        }
    });
    
    // Reload points when section is shown
    if (section === 'points') {
        loadPoints();
    }
    
    // Load withdrawal data when section is shown (if withdrawal section exists)
    if (section === 'withdrawal') {
        loadWithdrawalData();
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

            // Prepare tracking information display
            let trackingDisplay = '';
            if (order.trackingInfo && (order.trackingInfo.trackingId || order.trackingInfo.trackingWebsite)) {
                const trackingInfo = order.trackingInfo;
                trackingDisplay = `
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #2196F3;">
                        <h4 style="margin: 0 0 10px 0; color: #2196F3; font-size: 16px;">📦 Tracking Information</h4>
                        ${trackingInfo.trackingId ? `
                            <p style="margin: 5px 0;"><strong>Tracking ID:</strong> 
                                <span style="font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${trackingInfo.trackingId}</span>
                            </p>
                        ` : ''}
                        ${trackingInfo.trackingWebsite ? `
                            <p style="margin: 5px 0;"><strong>Courier Website:</strong> 
                                <a href="${trackingInfo.trackingWebsite}" target="_blank" style="color: #2196F3; text-decoration: none;">
                                    ${trackingInfo.trackingWebsite} 🔗
                                </a>
                            </p>
                        ` : ''}
                        ${trackingInfo.trackingUrl ? `
                            <div style="margin-top: 10px;">
                                <a href="${trackingInfo.trackingUrl}" target="_blank" 
                                   style="display: inline-block; background: #2196F3; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                                    🔍 Track Your Order
                                </a>
                            </div>
                        ` : ''}
                        ${trackingInfo.updatedAt ? `
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">
                                Updated: ${new Date(trackingInfo.updatedAt).toLocaleString('en-IN')}
                            </p>
                        ` : ''}
                    </div>
                `;
            }

            div.innerHTML = `
                <h3>Order #${order._id.slice(-8)}</h3>
                <p><strong>Items:</strong> ${itemsList}</p>
                <p><strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}</p>
                <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                <p><strong>Payment Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${order.status}</span></p>
                <p><strong>Delivery Status:</strong> <span style="color: ${deliveryColor}; font-weight: 600;">${deliveryStatus}</span></p>
                ${trackingDisplay}
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
            
            // Display detailed address fields
            document.getElementById("displayHomeAddress1").textContent = addr.homeAddress1 || addr.street || "Not set";
            document.getElementById("displayHomeAddress2").textContent = addr.homeAddress2 || "-";
            document.getElementById("displayStreetName").textContent = addr.streetName || "-";
            document.getElementById("displayLandmark").textContent = addr.landmark || "-";
            document.getElementById("displayVillage").textContent = addr.village || "-";
            document.getElementById("displayTaluk").textContent = addr.taluk || "Not set";
            document.getElementById("displayDistrict").textContent = addr.district || "Not set";
            document.getElementById("displayState").textContent = addr.state || "Not set";
            document.getElementById("displayPincode").textContent = addr.pincode || "Not set";
            document.getElementById("displayPhone").textContent = addr.phone || "Not set";
            
            // Pre-fill form fields for editing
            document.getElementById("homeAddress1").value = addr.homeAddress1 || addr.street || "";
            document.getElementById("homeAddress2").value = addr.homeAddress2 || "";
            document.getElementById("streetName").value = addr.streetName || "";
            document.getElementById("landmark").value = addr.landmark || "";
            document.getElementById("village").value = addr.village || "";
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
        homeAddress1: document.getElementById("homeAddress1").value.trim(),
        homeAddress2: document.getElementById("homeAddress2").value.trim(),
        streetName: document.getElementById("streetName").value.trim(),
        landmark: document.getElementById("landmark").value.trim(),
        village: document.getElementById("village").value.trim(),
        taluk: document.getElementById("taluk").value.trim(),
        district: document.getElementById("district").value.trim(),
        state: document.getElementById("state").value.trim(),
        pincode: document.getElementById("pincode").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        // Create legacy street field for backward compatibility
        street: document.getElementById("homeAddress1").value.trim()
    };

    console.log('🔍 Frontend: Address data being sent:', JSON.stringify(address, null, 2));

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
/* ---
--------------------------------------
   WITHDRAWAL FUNCTIONS
----------------------------------------- */

// Load withdrawal data and determine which section to show
async function loadWithdrawalData() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API}/referral/withdrawal-settings`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || "Failed to load withdrawal settings");
        }

        // Update wallet balance
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        document.getElementById("walletBalance").textContent = `₹${user.wallet || 0}`;
        document.getElementById("minWithdrawal").textContent = `₹${data.minimumWithdrawalAmount}`;

        if (data.bankDetailsSetup) {
            // Show withdrawal form section
            document.getElementById("bankSetupSection").style.display = "none";
            document.getElementById("withdrawalFormSection").style.display = "block";
            
            // Display masked bank details
            displayMaskedBankDetails(data.maskedBankDetails);
            
            // Update limits
            if (data.maskedBankDetails) {
                document.getElementById("dailyLimit").textContent = `₹${data.maskedBankDetails.dailyLimit}`;
                document.getElementById("monthlyLimit").textContent = `₹${data.maskedBankDetails.monthlyLimit}`;
            }
            
            // Load withdrawal history
            loadWithdrawalHistory();
        } else {
            // Show bank setup section
            document.getElementById("bankSetupSection").style.display = "block";
            document.getElementById("withdrawalFormSection").style.display = "none";
        }

    } catch (err) {
        console.error("Error loading withdrawal data:", err);
        alert("Error loading withdrawal data: " + err.message);
    }
}

// Display masked bank details
function displayMaskedBankDetails(bankDetails) {
    if (!bankDetails) return;
    
    let html = '<div style="display: grid; gap: 8px;">';
    
    if (bankDetails.accountNumber) {
        html += `<div><strong>Account:</strong> ${bankDetails.accountNumber}</div>`;
        html += `<div><strong>Bank:</strong> ${bankDetails.bankName}</div>`;
        html += `<div><strong>IFSC:</strong> ${bankDetails.ifscCode}</div>`;
    }
    
    if (bankDetails.upiId) {
        html += `<div><strong>UPI ID:</strong> ${bankDetails.upiId}</div>`;
    }
    
    html += `<div><strong>Account Holder:</strong> ${bankDetails.accountHolderName}</div>`;
    html += `<div><strong>Setup Date:</strong> ${new Date(bankDetails.setupDate).toLocaleDateString()}</div>`;
    html += '</div>';
    
    document.getElementById("maskedBankDetails").innerHTML = html;
}

// Setup bank details (one-time)
async function setupBankDetails(e) {
    e.preventDefault();
    
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const accountHolderName = document.getElementById("accountHolderName").value.trim();
    const accountNumber = document.getElementById("accountNumber").value.trim();
    const ifscCode = document.getElementById("ifscCode").value.trim();
    const bankName = document.getElementById("bankName").value.trim();
    const upiId = document.getElementById("upiId").value.trim();

    // Validation
    if (!accountHolderName) {
        alert("Account holder name is required");
        return;
    }

    if (!upiId && (!accountNumber || !ifscCode || !bankName)) {
        alert("Please provide either UPI ID or complete bank details (Account Number, IFSC, Bank Name)");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Setting up...";

    try {
        const res = await fetch(`${API}/referral/setup-bank-details`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                accountHolderName,
                accountNumber: accountNumber || null,
                ifscCode: ifscCode || null,
                bankName: bankName || null,
                upiId: upiId || null
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to setup bank details");
        }

        // Show success popup
        alert("✅ Bank details setup successfully!\n\nYour bank details are now locked for security. You can now make withdrawal requests using only the amount.");
        
        // Reload withdrawal data to show withdrawal form
        loadWithdrawalData();

    } catch (err) {
        console.error("Bank setup error:", err);
        alert("Error: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "🔒 Setup Bank Details (One-Time)";
    }
}

// Submit withdrawal request
async function submitWithdrawal(e) {
    e.preventDefault();
    
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const amount = parseFloat(document.getElementById("withdrawalAmount").value);
    
    if (!amount || amount <= 0) {
        alert("Please enter a valid withdrawal amount");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    try {
        const res = await fetch(`${API}/referral/withdraw`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ amount })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to submit withdrawal request");
        }

        // Show success popup
        alert(`✅ Withdrawal request submitted successfully!\n\nAmount: ₹${amount}\nStatus: Pending Admin Approval\n\nYou will receive an email confirmation shortly.`);
        
        // Clear form and reload data
        document.getElementById("withdrawalAmount").value = "";
        
        // Update wallet balance in localStorage
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        user.wallet = data.remainingBalance;
        localStorage.setItem("user", JSON.stringify(user));
        
        // Reload withdrawal data
        loadWithdrawalData();

    } catch (err) {
        console.error("Withdrawal error:", err);
        alert("Error: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "💰 Submit Withdrawal Request";
    }
}

// Load withdrawal history
async function loadWithdrawalHistory() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (res.ok && data.user && data.user.withdrawals) {
            const withdrawals = data.user.withdrawals.slice(-5).reverse(); // Last 5 withdrawals
            
            const historyList = document.getElementById("withdrawalHistoryList");
            
            if (withdrawals.length === 0) {
                historyList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No withdrawal history yet.</p>';
                return;
            }
            
            historyList.innerHTML = withdrawals.map(w => {
                const statusColor = w.status === 'approved' ? '#28a745' : 
                                  w.status === 'pending' ? '#ffc107' : '#dc3545';
                
                return `
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: bold; font-size: 16px;">₹${w.amount}</div>
                                <div style="font-size: 12px; color: #666;">${new Date(w.requestedAt || w.date).toLocaleDateString()}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: ${statusColor}; font-weight: bold; text-transform: capitalize;">${w.status}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

    } catch (err) {
        console.error("Error loading withdrawal history:", err);
    }
}

// Add event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    // Add withdrawal form event listeners
    const bankDetailsForm = document.getElementById("bankDetailsForm");
    if (bankDetailsForm) {
        bankDetailsForm.addEventListener("submit", setupBankDetails);
    }
    
    const withdrawalForm = document.getElementById("withdrawalForm");
    if (withdrawalForm) {
        withdrawalForm.addEventListener("submit", submitWithdrawal);
    }
});