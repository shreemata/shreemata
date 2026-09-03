const API = window.API_URL;

// Global HTML sanitization helper function
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function escapehtml(str) {
    return escapeHtml(str);
}
window.escapeHtml = escapeHtml;
window.escapehtml = escapehtml;

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
async function loadProfile() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            const user = data.user;
            
            // Save updated user to localStorage
            localStorage.setItem("user", JSON.stringify(user));

            document.getElementById("accName").textContent = user.name;
            document.getElementById("accEmail").textContent = user.email;

            document.getElementById("editName").value = user.name;
            document.getElementById("editEmail").value = user.email;

            // Render MasterCard if assigned
            const masterCardContainer = document.getElementById("masterCardContainer");
            if (user.masterCard && user.masterCard.isAssigned) {
                document.getElementById("accCardNumber").textContent = user.masterCard.cardNumber;
                document.getElementById("accCardHolder").textContent = user.name;
                document.getElementById("accCardEarnings").textContent = (user.masterCard.accumulatedCommission || 0).toFixed(2);
                
                const accCardWalletEl = document.getElementById("accCardWallet");
                if (accCardWalletEl) {
                    accCardWalletEl.textContent = (user.wallet || 0).toFixed(2);
                }
                
                const issuedDate = user.masterCard.issuedAt 
                    ? new Date(user.masterCard.issuedAt).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit' })
                    : '';
                document.getElementById("accCardIssued").textContent = issuedDate;
                
                if (masterCardContainer) {
                    masterCardContainer.style.display = "block";
                }
            } else {
                if (masterCardContainer) {
                    masterCardContainer.style.display = "none";
                }
            }
        } else {
            // Fallback to local storage if API call fails
            const user = JSON.parse(localStorage.getItem("user") || "{}");
            if (user.name) {
                document.getElementById("accName").textContent = user.name;
                document.getElementById("accEmail").textContent = user.email;
                document.getElementById("editName").value = user.name;
                document.getElementById("editEmail").value = user.email;
            }
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

/* -----------------------------------------
   CHANGE PAGE SECTIONS
----------------------------------------- */
function showSection(section) {
    // List of all possible sections
    const sections = ["profileSection", "editSection", "addressSection", "storeSection", "ordersSection", "walletSection", "pointsSection"];
    
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
    
    // Load section-specific data
    if (section === 'wallet') {
        // Simple fallback wallet loading
        setTimeout(() => {
            if (typeof loadWalletData === 'function') {
                loadWalletData();
            } else {
                console.error('loadWalletData function is not defined, using fallback');
                // Simple fallback: load basic wallet info from localStorage
                const user = JSON.parse(localStorage.getItem("user") || "{}");
                const walletBalance = user.walletBalance || 0;
                
                if (document.getElementById("walletBalance")) {
                    document.getElementById("walletBalance").textContent = `₹${walletBalance.toFixed(2)}`;
                }
                if (document.getElementById("totalCashbackEarned")) {
                    document.getElementById("totalCashbackEarned").textContent = "Loading...";
                }
                if (document.getElementById("totalReferralEarnings")) {
                    document.getElementById("totalReferralEarnings").textContent = `₹${walletBalance.toFixed(2)}`;
                }
                if (document.getElementById("walletHistoryList")) {
                    document.getElementById("walletHistoryList").innerHTML = "<p>Loading transaction history...</p>";
                }
                if (document.getElementById("minWithdrawal")) {
                    document.getElementById("minWithdrawal").textContent = "₹100";
                }
            }
        }, 100);
    } else if (section === 'points') {
        loadPoints();
    } else if (section === 'orders') {
        loadOrders();
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
            (section === 'wallet' && buttonText.includes('wallet')) ||
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
                               order.status === 'pending' ? '#ffc107' : 
                               order.status === 'pending_payment_verification' ? '#ff9800' : '#dc3545';
            
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

            // UTR/Payment Details Section
            let paymentDetailsDisplay = '';
            if (order.paymentType && ['check', 'transfer'].includes(order.paymentType)) {
                const paymentDetails = order.paymentDetails || {};
                const paymentTypeText = order.paymentType === 'check' ? 'Check Payment' : 'Bank Transfer';
                
                paymentDetailsDisplay = `
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ff9800;">
                        <h4 style="margin: 0 0 10px 0; color: #e65100; font-size: 16px;">💳 ${paymentTypeText}</h4>
                        
                        ${paymentDetails.utrNumber ? `
                            <p style="margin: 5px 0;"><strong>UTR Number:</strong> 
                                <span style="font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${paymentDetails.utrNumber}</span>
                            </p>
                        ` : `
                            <p style="margin: 5px 0; color: #ff9800;"><strong>UTR Number:</strong> Not provided yet</p>
                        `}
                        
                        ${paymentDetails.checkNumber ? `
                            <p style="margin: 5px 0;"><strong>Check Number:</strong> ${paymentDetails.checkNumber}</p>
                        ` : ''}
                        
                        ${paymentDetails.bankName ? `
                            <p style="margin: 5px 0;"><strong>Bank:</strong> ${paymentDetails.bankName}</p>
                        ` : ''}
                        
                        <p style="margin: 5px 0;"><strong>Status:</strong> 
                            <span style="color: ${paymentDetails.status === 'verified' ? '#28a745' : '#ff9800'}; font-weight: 600;">
                                ${paymentDetails.status || 'awaiting_upload'}
                            </span>
                        </p>
                        
                        ${!paymentDetails.utrNumber || paymentDetails.status === 'awaiting_utr' ? `
                            <div style="margin-top: 15px;">
                                <button onclick="showUTRModal('${order._id}')" 
                                        style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                                    📝 ${paymentDetails.utrNumber ? 'Update UTR' : 'Add UTR Number'}
                                </button>
                                <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">
                                    Add UTR number after your ${paymentTypeText.toLowerCase()} is processed
                                </p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            const isBillable = order.status !== 'cancelled' && order.status !== 'failed';
            const invoiceBtn = isBillable ? `
                <div style="margin-top: 15px;">
                    <a href="/invoice.html?orderId=${order._id}" target="_blank" 
                       style="display: inline-block; background: #667eea; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">
                        📄 Download Bill / Invoice
                    </a>
                </div>
            ` : '';

            div.innerHTML = `
                <h3>Order #${order._id.slice(-8)}</h3>
                <p><strong>Items:</strong> ${itemsList}</p>
                <p><strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}</p>
                <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                <p><strong>Payment Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${order.status}</span></p>
                <p><strong>Delivery Status:</strong> <span style="color: ${deliveryColor}; font-weight: 600;">${deliveryStatus}</span></p>
                ${paymentDetailsDisplay}
                ${trackingDisplay}
                ${order.deliveryAddress && order.deliveryAddress.street ? `
                    <p><strong>Delivery Address:</strong> ${order.deliveryAddress.street}, ${order.deliveryAddress.taluk || order.deliveryAddress.city}, ${order.deliveryAddress.district || ''}</p>
                ` : ''}
                ${invoiceBtn}
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

        // Update basic points display with null checks
        const pointsWalletEl = document.getElementById("pointsWallet");
        const totalPointsEarnedEl = document.getElementById("totalPointsEarned");
        const virtualReferralsCreatedEl = document.getElementById("virtualReferralsCreated");
        
        if (pointsWalletEl) pointsWalletEl.textContent = balanceData.pointsWallet || 0;
        if (totalPointsEarnedEl) totalPointsEarnedEl.textContent = balanceData.totalPointsEarned || 0;
        if (virtualReferralsCreatedEl) virtualReferralsCreatedEl.textContent = balanceData.virtualReferralsCreated || 0;

        // Update virtual tree cost displays
        const virtualTreeCost = balanceData.settings?.virtualTree?.cost || 100;
        const virtualTreeCostEl = document.getElementById("virtualTreeCost");
        const virtualTreeCostBtnEl = document.getElementById("virtualTreeCostBtn");
        
        if (virtualTreeCostEl) virtualTreeCostEl.textContent = virtualTreeCost;
        if (virtualTreeCostBtnEl) virtualTreeCostBtnEl.textContent = virtualTreeCost;

        // Enable/disable redeem button and hide section if max virtual trees reached
        const redeemBtn = document.getElementById("redeemBtn");
        const redeemSection = document.querySelector(".redeem-section");
        
        if (redeemBtn && redeemSection) {
            if (balanceData.capabilities?.maxVirtualTreesReached) {
                // Hide the entire redeem section when max virtual trees reached
                redeemSection.style.display = "none";
            } else {
                // Show the redeem section
                redeemSection.style.display = "block";
                
                if (balanceData.capabilities?.canCreateVirtual) {
                    redeemBtn.disabled = false;
                    redeemBtn.innerHTML = `🎁 Redeem ${virtualTreeCost} Points for Virtual Referral`;
                } else {
                    redeemBtn.disabled = true;
                    const needed = virtualTreeCost - balanceData.pointsWallet;
                    redeemBtn.innerHTML = `Need ${needed} more points`;
                }
            }
        }

        // Update cash conversion section
        const cashSettings = balanceData.settings?.cashConversion;
        if (cashSettings && cashSettings.enabled) {
            const conversionRate = `${cashSettings.pointsPerConversion} Points = ₹${cashSettings.cashPerConversion}`;
            const perPointValue = (cashSettings.cashPerConversion / cashSettings.pointsPerConversion).toFixed(2);
            
            // Update conversion rate display with null checks
            const conversionRateDisplayEl = document.getElementById("conversionRateDisplay");
            const perPointValueEl = document.getElementById("perPointValue");
            const conversionIncrementEl = document.getElementById("conversionIncrement");
            
            if (conversionRateDisplayEl) conversionRateDisplayEl.textContent = conversionRate;
            if (perPointValueEl) perPointValueEl.textContent = perPointValue;
            if (conversionIncrementEl) conversionIncrementEl.textContent = cashSettings.pointsPerConversion;

            // Calculate available points for conversion (after virtual trees)
            const pointsAfterVirtuals = balanceData.pointsWallet - (balanceData.capabilities?.possibleVirtualTrees * virtualTreeCost);
            const availableForConversion = Math.max(0, Math.floor(pointsAfterVirtuals / cashSettings.pointsPerConversion) * cashSettings.pointsPerConversion);
            const maxCashPossible = (availableForConversion / cashSettings.pointsPerConversion) * cashSettings.cashPerConversion;
            
            const availableForConversionEl = document.getElementById("availableForConversion");
            const maxCashPossibleEl = document.getElementById("maxCashPossible");
            
            if (availableForConversionEl) availableForConversionEl.textContent = `${availableForConversion} points`;
            if (maxCashPossibleEl) maxCashPossibleEl.textContent = maxCashPossible.toFixed(2);
            
            // Update conversion form
            const pointsInput = document.getElementById("pointsToConvert");
            const convertBtn = document.getElementById("convertBtn");
            const conversionPreview = document.getElementById("conversionPreview");
            
            if (pointsInput && convertBtn) {
                pointsInput.max = availableForConversion;
                pointsInput.step = cashSettings.pointsPerConversion;
                
                if (availableForConversion >= cashSettings.pointsPerConversion) {
                    convertBtn.disabled = false;
                    pointsInput.disabled = false;
                    pointsInput.placeholder = `Enter points (multiples of ${cashSettings.pointsPerConversion})`;
                } else {
                    convertBtn.disabled = true;
                    pointsInput.disabled = true;
                    pointsInput.placeholder = `Need ${cashSettings.pointsPerConversion - availableForConversion} more points`;
                }

                // Update cash calculation on input change
                pointsInput.oninput = function() {
                    const points = parseInt(this.value) || 0;
                    const cash = (points / cashSettings.pointsPerConversion) * cashSettings.cashPerConversion;
                    
                    // Show/hide preview with null checks
                    if (points > 0) {
                        const previewPointsEl = document.getElementById("previewPoints");
                        const previewCashEl = document.getElementById("previewCash");
                        
                        if (previewPointsEl) previewPointsEl.textContent = points;
                        if (previewCashEl) previewCashEl.textContent = cash.toFixed(2);
                        if (conversionPreview) conversionPreview.style.display = "block";
                    } else {
                        if (conversionPreview) conversionPreview.style.display = "none";
                    }
                    
                    // Enable/disable convert button
                    const isValid = points > 0 && points <= availableForConversion && points % cashSettings.pointsPerConversion === 0;
                    convertBtn.disabled = !isValid;
                    
                    if (points > availableForConversion) {
                        convertBtn.textContent = "❌ Not enough points";
                    } else if (points > 0 && points % cashSettings.pointsPerConversion !== 0) {
                        convertBtn.textContent = `❌ Use multiples of ${cashSettings.pointsPerConversion}`;
                    } else if (isValid) {
                        convertBtn.textContent = "💸 Convert to Cash";
                    } else {
                        convertBtn.textContent = "💸 Convert to Cash";
                    }
                };
            }
        } else {
            // Hide conversion section if disabled
            const conversionSection = document.querySelector(".cash-conversion-section");
            if (conversionSection) {
                conversionSection.style.display = "none";
            }
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
            
            let typeColor = '#666';
            let sign = '';
            let typeIcon = '📝';
            
            switch(tx.type) {
                case 'earned':
                    typeColor = '#28a745';
                    sign = '+';
                    typeIcon = '💰';
                    break;
                case 'redeemed':
                    typeColor = '#dc3545';
                    sign = '-';
                    typeIcon = '🌳';
                    break;
                case 'manual_converted_to_cash':
                    typeColor = '#ff9800';
                    sign = '-';
                    typeIcon = '💸';
                    break;
                case 'auto_converted_to_cash':
                    typeColor = '#17a2b8';
                    sign = '-';
                    typeIcon = '🔄';
                    break;
            }
            
            div.innerHTML = `
                <div class="transaction-row" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; margin-bottom: 10px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div>
                        <p style="font-weight: 600; margin: 0 0 5px 0;">${typeIcon} ${tx.description}</p>
                        <p style="font-size: 0.9em; color: #666; margin: 0;">${new Date(tx.createdAt).toLocaleString()}</p>
                        ${tx.cashAmount ? `<p style="font-size: 0.9em; color: #28a745; margin: 5px 0 0 0;">💰 Received: ₹${tx.cashAmount}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <p style="color: ${typeColor}; font-weight: 600; font-size: 1.2em;">${sign}${Math.abs(tx.points)}</p>
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
   LOAD WALLET DATA
----------------------------------------- */
async function loadWalletData() {
    console.log("loadWalletData function called");
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("No token found");
        return;
    }

    try {
        // Load user profile to get wallet balance from MongoDB
        const profileRes = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!profileRes.ok) {
            throw new Error(`Profile fetch failed: ${profileRes.status}`);
        }
        
        const profileData = await profileRes.json();
        console.log("Profile data received:", profileData);
        
        // Update localStorage with fresh user data
        if (profileData.user) {
            localStorage.setItem("user", JSON.stringify(profileData.user));
            console.log("Updated user data in localStorage");
        }

        // Set wallet balance in UI
        const walletBalance = Number(profileData.user?.wallet || 0);
        const walletBalanceEl = document.getElementById("walletBalance");
        if (walletBalanceEl) {
            walletBalanceEl.textContent = `₹${walletBalance.toFixed(2)}`;
        }
        
        // Save Bank Details state globally for withdrawals
        window.userBankDetails = profileData.maskedBankDetails || (profileData.user?.bankDetails?.isSetup ? profileData.user.bankDetails : null);
        window.isBankDetailsSetup = Boolean(profileData.bankDetailsSetup !== undefined ? profileData.bankDetailsSetup : profileData.user?.bankDetails?.isSetup);

        // Update payment destination UI for general wallet withdrawal
        updateGeneralBankDetailsUI();

        // Render withdrawal requests & statuses
        renderWithdrawalHistory(profileData.withdrawals || profileData.user?.withdrawals || []);

        // Load commission transactions including cashback from MongoDB
        console.log("Fetching transactions from:", `${API}/commission/transactions`);
        const transactionsRes = await fetch(`${API}/commission/transactions`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        console.log("Transactions response status:", transactionsRes.status);
        if (!transactionsRes.ok) {
            throw new Error(`Transactions fetch failed: ${transactionsRes.status}`);
        }
        
        const transactionsData = await transactionsRes.json();
        console.log("Transactions data received:", transactionsData);
        
        let totalCashback = 0;
        let totalReferralEarnings = 0;
        
        if (transactionsData.transactions && transactionsData.transactions.length > 0) {
            console.log("Found", transactionsData.transactions.length, "transactions");
            transactionsData.transactions.forEach(tx => {
                console.log("Processing transaction:", tx.type, tx.amount, tx.description);
                if (tx.type === 'cashback') {
                    totalCashback += tx.amount;
                    console.log("Added cashback:", tx.amount, "Total so far:", totalCashback);
                } else if (tx.type === 'referral_commission' || tx.type === 'direct_commission' || tx.type === 'level_commission') {
                    totalReferralEarnings += tx.amount;
                    console.log("Added referral earning:", tx.amount, "Total so far:", totalReferralEarnings);
                }
            });
            
            // Display transaction history
            displayWalletHistory(transactionsData.transactions);
        } else {
            console.log("No transactions found");
            // No transactions yet
            document.getElementById("walletHistoryList").innerHTML = "<p style='text-align: center; color: #666; padding: 20px;'>No transactions yet. Start shopping to earn cashback!</p>";
        }
        
        document.getElementById("totalCashbackEarned").textContent = `₹${totalCashback.toFixed(2)}`;
        document.getElementById("totalReferralEarnings").textContent = `₹${totalReferralEarnings.toFixed(2)}`;
        
        console.log("Totals calculated - Cashback:", totalCashback, "Referral:", totalReferralEarnings);

        // Load VIP Master Cards Milestones
        try {
            const vipRes = await fetch(`${API}/users/profile/vip-mastercards`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (vipRes.ok) {
                const vipData = await vipRes.json();
                if (vipData.bankDetailsSetup !== undefined) {
                    window.isBankDetailsSetup = Boolean(vipData.bankDetailsSetup);
                }
                if (vipData.maskedBankDetails) {
                    window.userBankDetails = vipData.maskedBankDetails;
                }
                if (vipData.withdrawals && vipData.withdrawals.length > 0) {
                    renderWithdrawalHistory(vipData.withdrawals);
                }
                const vipSection = document.getElementById("vipMasterCardsSection");
                const vipList = document.getElementById("vipMasterCardsList");
                
                if (vipSection && vipList) {
                    if (vipData.cards && vipData.cards.length > 0) {
                        vipSection.style.display = "block";
                        vipList.innerHTML = "";
                        
                        // Sort cards by tier descending to render ONLY the single highest tier card
                        const sortedCards = [...vipData.cards].sort((a, b) => (Number(b.tier) || 0) - (Number(a.tier) || 0));
                        const card = sortedCards[0];
                        
                        const nextMilestone = (Math.floor(vipData.cumulativeTotal / 100) + 1) * 100;
                        const progressPercent = Math.min(100, Math.max(0, (vipData.cumulativeTotal % 100)));
                        
                        const cardHtml = `
                            <div style="background: #181410; color: #f0e6d2; border-radius: 16px; padding: 24px; position: relative; overflow: hidden; box-shadow: 0 8px 25px rgba(24, 20, 16, 0.45); font-family: 'Courier New', Courier, monospace; letter-spacing: 1px; min-height: 220px; display: flex; flex-direction: column; justify-content: space-between; border: 1.5px solid #d4af37;">
                                <!-- Card Header -->
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div style="width: 32px; height: 32px; border-radius: 50%; background: #d4af37; color: #181410; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; border: 1.5px solid #f0e6d2;">👑</div>
                                        <span style="font-weight: bold; font-size: 0.95rem; color: #d4af37; font-family: system-ui, sans-serif;">SHREE MATA</span>
                                    </div>
                                    <span style="font-style: italic; font-weight: 700; color: rgba(240, 230, 210, 0.7); font-size: 0.75rem; font-family: system-ui, sans-serif; letter-spacing: 0.5px;">VIP MASTER CARD</span>
                                </div>
                                
                                <!-- Card Number -->
                                <div style="font-size: 1.5rem; font-weight: bold; color: #f0e6d2; margin: 15px 0 10px 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); text-align: center; letter-spacing: 2px;">
                                    ${escapeHtml(card.cardNumber)}
                                </div>
                                
                                <!-- Cardholder & Tier Info -->
                                <div style="display: flex; justify-content: space-between; align-items: flex-end; font-family: system-ui, sans-serif; font-size: 0.75rem; color: #a8a29e; letter-spacing: 0;">
                                    <div>
                                        <div style="font-size: 0.55rem; text-transform: uppercase; color: #78716c; margin-bottom: 2px;">Cardholder</div>
                                        <div style="font-weight: 700; color: #f0e6d2; font-size: 0.85rem;">${escapeHtml(profileData.user?.name || '')}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 0.55rem; text-transform: uppercase; color: #78716c; margin-bottom: 2px;">Tier</div>
                                        <div style="font-weight: 800; color: #d4af37; font-size: 0.85rem;">CARD ${String(card.tier).padStart(2, '0')}</div>
                                    </div>
                                </div>

                                <!-- Progress Bar toward Next Milestone (always shown on the active card) -->
                                <div style="margin-top: 15px; font-family: system-ui, sans-serif; font-size: 0.75rem;">
                                    <div style="display: flex; justify-content: space-between; color: #a8a29e; margin-bottom: 4px;">
                                        <span>Next Milestone Progress:</span>
                                        <span style="font-weight: 700; color: #d4af37;">₹${vipData.cumulativeTotal.toFixed(2)} / ₹${nextMilestone}</span>
                                    </div>
                                    <div style="background: rgba(240, 230, 210, 0.15); height: 6px; border-radius: 3px; overflow: hidden; border: 0.5px solid rgba(212, 175, 55, 0.3);">
                                        <div style="background: linear-gradient(90deg, #d4af37 0%, #f0e6d2 100%); width: ${progressPercent}%; height: 100%; border-radius: 3px;"></div>
                                    </div>
                                </div>

                                <!-- Wallet Balance at the bottom -->
                                <div style="margin-top: 12px; padding-top: 10px; border-top: 1.5px dashed rgba(212, 175, 55, 0.2); display: flex; justify-content: space-between; align-items: center; font-family: system-ui, sans-serif; font-size: 0.75rem;">
                                    <span style="color: #a8a29e;">Shared Commission Wallet:</span>
                                    <span style="font-weight: bold; color: #d4af37; font-size: 0.9rem;">₹${walletBalance.toFixed(2)}</span>
                                </div>

                                <!-- VIP Master Card Withdrawal Button -->
                                <button type="button" onclick="openVipWithdrawModal('${escapeHtml(card.cardNumber)}', ${Number(card.tier || 1)})" style="margin-top: 14px; width: 100%; padding: 11px; background: linear-gradient(135deg, #d4af37 0%, #aa820a 100%); color: #181410; border: none; border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 14px rgba(212, 175, 55, 0.25); font-family: system-ui, sans-serif; transition: all 0.2s;">
                                    <span>💸 Withdraw from VIP Card</span>
                                </button>
                            </div>
                        `;
                        vipList.innerHTML = cardHtml;
                    } else {
                        vipSection.style.display = "none";
                    }
                }
            }
        } catch (vipErr) {
            console.error("Error loading user VIP Master Cards:", vipErr);
        }

        // Load withdrawal settings from MongoDB
        const settingsRes = await fetch(`${API}/commission/settings`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            console.log("Settings data received:", settingsData);
            if (settingsData.settings) {
                document.getElementById("minWithdrawal").textContent = `₹${settingsData.settings.minimumWithdrawalAmount || 100}`;
            } else {
                document.getElementById("minWithdrawal").textContent = "₹100";
            }
        } else {
            console.warn("Settings fetch failed, using default");
            document.getElementById("minWithdrawal").textContent = "₹100";
        }

    } catch (err) {
        console.error("Error loading wallet data:", err);
        
        // Show error message - no localStorage fallback for hosted website
        document.getElementById("walletBalance").textContent = "Error loading";
        document.getElementById("totalCashbackEarned").textContent = "Error loading";
        document.getElementById("totalReferralEarnings").textContent = "Error loading";
        document.getElementById("minWithdrawal").textContent = "₹100";
        document.getElementById("walletHistoryList").innerHTML = `
            <p style='color: #dc3545; text-align: center; padding: 20px;'>
                Error loading wallet data from server.<br>
                Please check your internet connection and refresh the page.<br>
                <small>Error: ${err.message}</small>
            </p>
        `;
    }
}

/* -----------------------------------------
   DISPLAY WALLET HISTORY
----------------------------------------- */
function displayWalletHistory(transactions) {
    const historyList = document.getElementById("walletHistoryList");
    historyList.innerHTML = "";

    if (!transactions || transactions.length === 0) {
        historyList.innerHTML = "<p style='color: #666; text-align: center; padding: 20px;'>No transactions yet.</p>";
        return;
    }

    // Sort transactions by date (newest first)
    const sortedTransactions = transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sortedTransactions.forEach(tx => {
        const date = new Date(tx.createdAt).toLocaleDateString();
        const time = new Date(tx.createdAt).toLocaleTimeString();
        
        let typeDisplay = '';
        let typeColor = '';
        let sign = '+';
        
        switch (tx.type) {
            case 'cashback':
                typeDisplay = '💰 Cashback';
                typeColor = '#ff6f61';
                break;
            case 'direct_commission':
                typeDisplay = '⭐ Direct Commission (Cashback)';
                typeColor = '#28a745';
                break;
            case 'referral_commission':
                typeDisplay = '👥 Referral Commission';
                typeColor = '#20c997';
                break;
            case 'level_commission':
                typeDisplay = '🏆 Level Commission';
                typeColor = '#17a2b8';
                break;
            case 'withdrawal':
                typeDisplay = '💸 Withdrawal';
                typeColor = '#dc3545';
                sign = '-';
                break;
            case 'vip_master_card_withdrawal':
                typeDisplay = '👑 VIP Master Card Withdrawal';
                typeColor = '#d4af37';
                sign = '-';
                break;
            case 'refund':
                typeDisplay = '💰 Refund: Rejected Withdrawal';
                typeColor = '#10b981';
                sign = '+';
                break;
            default:
                typeDisplay = tx.type;
                typeColor = '#6c757d';
        }

        const div = document.createElement("div");
        div.className = "transaction-row";
        div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 20px; margin-bottom: 15px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 4px solid " + typeColor + ";";
        
        div.innerHTML = `
            <div>
                <p style="font-weight: 600; color: ${typeColor}; margin: 0 0 5px 0;">${typeDisplay}</p>
                <p style="font-size: 0.9em; color: #666; margin: 0;">${tx.description || 'Transaction'}</p>
                <p style="font-size: 0.8em; color: #999; margin: 5px 0 0 0;">${date} at ${time}</p>
            </div>
            <div style="text-align: right;">
                <p style="color: ${typeColor}; font-weight: 600; font-size: 1.2em;">${sign}₹${tx.amount.toFixed(2)}</p>
                <p style="font-size: 0.9em; color: #666;">Status: ${tx.status}</p>
            </div>
        `;
        historyList.appendChild(div);
    });
}

/* -----------------------------------------
   RENDER WITHDRAWAL REQUESTS & PAYOUT STATUS
----------------------------------------- */
function renderWithdrawalHistory(withdrawals) {
    const listEl = document.getElementById("withdrawalRequestsList");
    if (!listEl) return;
    
    if (!withdrawals || withdrawals.length === 0) {
        listEl.innerHTML = "<p style='color: #a8a29e; font-size: 13px; margin: 0; padding: 10px 0;'>No withdrawal requests submitted yet.</p>";
        return;
    }

    const sorted = [...withdrawals].sort((a, b) => new Date(b.requestedAt || b.date || 0) - new Date(a.requestedAt || a.date || 0));
    listEl.innerHTML = "";

    sorted.forEach(w => {
        const dateStr = new Date(w.requestedAt || w.date).toLocaleString();
        const isVip = (w.source === 'vip_master_card');
        const sourceLabel = isVip ? `👑 VIP Master Card (${escapeHtml(w.cardNumber || 'VIP Card')})` : `💼 Commission Wallet`;
        
        let destinationText = 'Destination not specified';
        if (w.upi) {
            destinationText = `📱 UPI: ${escapeHtml(w.upi)}`;
        } else if (w.bank) {
            const maskedAcc = w.bank.length > 4 ? 'XXXX' + w.bank.slice(-4) : w.bank;
            destinationText = `🏦 ${escapeHtml(w.bankName || 'Bank')}: ${escapeHtml(maskedAcc)} (IFSC: ${escapeHtml(w.ifsc || 'N/A')})`;
        }

        let statusHtml = '';
        if (w.status === 'approved') {
            statusHtml = `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">✅ Approved — Paid</span>`;
        } else if (w.status === 'rejected') {
            statusHtml = `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">❌ Rejected — Refunded to Wallet</span>`;
        } else {
            statusHtml = `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">⏳ Pending Admin Approval</span>`;
        }

        const div = document.createElement("div");
        div.style.cssText = "background: #181410; border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
        div.innerHTML = `
            <div>
                <div style="font-weight: 700; color: #f0e6d2; font-size: 14px; margin-bottom: 3px;">${sourceLabel}</div>
                <div style="color: #d4af37; font-size: 12px; font-family: monospace; margin-bottom: 4px;">${destinationText}</div>
                <div style="color: #78716c; font-size: 11px;">Requested on ${dateStr}</div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                <div style="font-size: 16px; font-weight: 800; color: #f0e6d2;">₹${Number(w.amount).toFixed(2)}</div>
                <div>${statusHtml}</div>
            </div>
        `;
        listEl.appendChild(div);
    });
}

/* -----------------------------------------
   VIP MASTER CARD WITHDRAWAL MODAL & LOGIC
----------------------------------------- */
let currentVipWithdrawState = {
    cardNumber: '',
    cardTier: 1,
    availableBalance: 0,
    minAmount: 500,
    minReserve: 50
};

function openVipWithdrawModal(cardNumber, cardTier) {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const balanceText = document.getElementById("walletBalance")?.textContent || "0";
    const parsedBalance = parseFloat(balanceText.replace(/[^\d.]/g, '')) || (user.wallet || 0);

    currentVipWithdrawState.cardNumber = cardNumber || user.masterCard?.cardNumber || 'VIP Master Card';
    currentVipWithdrawState.cardTier = cardTier || 1;
    currentVipWithdrawState.availableBalance = parsedBalance;
    currentVipWithdrawState.minAmount = 500;
    currentVipWithdrawState.minReserve = 50;

    const modal = document.getElementById("vipWithdrawModal");
    if (!modal) return;

    // Set UI labels
    const tierDisplay = String(currentVipWithdrawState.cardTier).padStart(2, '0');
    document.getElementById("vipModalCardInfo").textContent = `Card: ${currentVipWithdrawState.cardNumber} (Tier ${tierDisplay})`;
    document.getElementById("vipModalAvailableBalance").textContent = `₹${currentVipWithdrawState.availableBalance.toFixed(2)}`;
    
    const maxWithdrawable = Math.max(0, currentVipWithdrawState.availableBalance - 50);
    document.getElementById("vipModalMaxWithdrawable").textContent = `₹${maxWithdrawable.toFixed(2)}`;

    // Payment destination toggle (Saved vs New)
    const savedBankSec = document.getElementById("vipSavedBankSection");
    const newBankSec = document.getElementById("vipNewBankSection");
    const maskedBankEl = document.getElementById("vipMaskedBankInfo");

    const isSetup = window.isBankDetailsSetup || (user.bankDetails && user.bankDetails.isSetup);
    const bankData = window.userBankDetails || user.bankDetails;

    if (isSetup && bankData && (bankData.accountNumber || bankData.upiId)) {
        if (savedBankSec) savedBankSec.style.display = "block";
        if (newBankSec) newBankSec.style.display = "none";

        let detailsHtml = '';
        if (bankData.upiId) {
            const maskedUpi = bankData.upiId.replace(/(.{2}).*(@.*)/, '$1****$2');
            detailsHtml += `<div>📱 <strong>UPI ID:</strong> ${escapeHtml(maskedUpi)}</div>`;
        }
        if (bankData.accountNumber) {
            const maskedAcc = bankData.accountNumber.startsWith('XXXX') ? bankData.accountNumber : ('XXXX' + bankData.accountNumber.slice(-4));
            detailsHtml += `<div>🏦 <strong>Bank:</strong> ${escapeHtml(bankData.bankName || 'Bank')} (${escapeHtml(maskedAcc)}) - IFSC: ${escapeHtml(bankData.ifscCode || 'N/A')}</div>`;
        }
        if (bankData.accountHolderName) {
            detailsHtml += `<div>👤 <strong>Holder:</strong> ${escapeHtml(bankData.accountHolderName)}</div>`;
        }
        if (maskedBankEl) maskedBankEl.innerHTML = detailsHtml || 'Saved payment account';
    } else {
        if (savedBankSec) savedBankSec.style.display = "none";
        if (newBankSec) {
            newBankSec.style.display = "block";
            const holderInput = document.getElementById("vipAccountHolderName");
            if (holderInput && !holderInput.value) {
                holderInput.value = user.name || '';
            }
        }
    }

    // Reset input
    const input = document.getElementById("vipWithdrawAmountInput");
    if (input) {
        input.value = "";
    }

    const previewBox = document.getElementById("vipWithdrawPreviewBox");
    if (previewBox) {
        previewBox.style.display = "none";
    }

    modal.style.display = "flex";
}

function closeVipWithdrawModal() {
    const modal = document.getElementById("vipWithdrawModal");
    if (modal) {
        modal.style.display = "none";
    }
}

function setVipWithdrawPreset(preset) {
    const input = document.getElementById("vipWithdrawAmountInput");
    if (!input) return;

    if (preset === 'max') {
        const maxWithdrawable = Math.max(0, currentVipWithdrawState.availableBalance - 50);
        input.value = maxWithdrawable > 0 ? maxWithdrawable : 0;
    } else {
        input.value = preset;
    }
    updateVipWithdrawPreview();
}

function updateVipWithdrawPreview() {
    const input = document.getElementById("vipWithdrawAmountInput");
    const previewBox = document.getElementById("vipWithdrawPreviewBox");
    const requestedEl = document.getElementById("vipPreviewRequested");
    const remainingEl = document.getElementById("vipPreviewRemaining");
    const msgEl = document.getElementById("vipPreviewValidationMsg");
    const submitBtn = document.getElementById("vipSubmitWithdrawBtn");

    if (!input || !previewBox || !requestedEl || !remainingEl || !msgEl) return;

    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) {
        previewBox.style.display = "none";
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    previewBox.style.display = "block";
    requestedEl.textContent = `₹${val.toFixed(2)}`;

    const remaining = currentVipWithdrawState.availableBalance - val;
    remainingEl.textContent = `₹${remaining.toFixed(2)}`;

    // Validation rule checks
    if (val < 500) {
        remainingEl.style.color = "#ef4444";
        msgEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">❌ Minimum withdrawal amount allowed is ₹500.</span>`;
    } else if (val > currentVipWithdrawState.availableBalance) {
        remainingEl.style.color = "#ef4444";
        msgEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">❌ Insufficient balance. Available is ₹${currentVipWithdrawState.availableBalance.toFixed(2)}.</span>`;
    } else if (remaining < 50) {
        remainingEl.style.color = "#ef4444";
        msgEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">❌ A mandatory minimum balance of ₹50 must remain on the card after withdrawal.</span>`;
    } else {
        remainingEl.style.color = "#10b981";
        msgEl.innerHTML = `<span style="color: #10b981; font-weight: 600;">✅ Valid withdrawal request. ₹${remaining.toFixed(2)} reserve balance will remain.</span>`;
    }
}

async function submitVipWithdrawal() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Please log in to proceed.");
        return;
    }

    const input = document.getElementById("vipWithdrawAmountInput");
    const amount = parseFloat(input ? input.value : 0);

    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid withdrawal amount.");
        return;
    }

    if (amount < 500) {
        alert("Minimum withdrawal amount allowed for VIP Master Card is ₹500.");
        return;
    }

    const available = currentVipWithdrawState.availableBalance;
    if (amount > available) {
        alert(`Insufficient balance. Your available VIP balance is ₹${available.toFixed(2)}.`);
        return;
    }

    if ((available - amount) < 50) {
        const maxWithdrawable = Math.max(0, available - 50);
        alert(`A mandatory minimum balance of ₹50 must remain in your VIP Master Card balance after withdrawal.\n\nAvailable Balance: ₹${available.toFixed(2)}\nMaximum Withdrawable: ₹${maxWithdrawable.toFixed(2)}`);
        return;
    }

    // Prepare payload
    const payload = {
        amount,
        cardNumber: currentVipWithdrawState.cardNumber,
        cardTier: currentVipWithdrawState.cardTier
    };

    // If bank details not setup, validate and collect from input fields
    const isSetup = window.isBankDetailsSetup;
    if (!isSetup) {
        const holder = document.getElementById("vipAccountHolderName")?.value?.trim();
        const accNum = document.getElementById("vipAccountNumber")?.value?.trim();
        const ifsc = document.getElementById("vipIfscCode")?.value?.trim()?.toUpperCase();
        const bank = document.getElementById("vipBankName")?.value?.trim();
        const upi = document.getElementById("vipUpiId")?.value?.trim()?.toLowerCase();

        if (!holder) {
            alert("Please enter the Account Holder Name.");
            return;
        }

        const hasUpi = Boolean(upi);
        const hasBank = Boolean(accNum && ifsc && bank);

        if (!hasUpi && !hasBank) {
            alert("Please provide either your UPI ID or complete Bank Details (Account Number, Bank Name, and IFSC Code).");
            return;
        }

        payload.accountHolderName = holder;
        payload.accountNumber = accNum || null;
        payload.bankName = bank || null;
        payload.ifscCode = ifsc || null;
        payload.upiId = upi || null;
    }

    const submitBtn = document.getElementById("vipSubmitWithdrawBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Submitting...</span>`;
    }

    try {
        const res = await fetch(`${API}/commission/vip-withdraw`, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            const withdrawnAmount = Number(data.withdrawalAmount || amount);
            const remainingBal = data.remainingBalance !== undefined ? Number(data.remainingBalance) : Math.max(0, available - withdrawnAmount);
            const successMsg = `Successfully withdrawn ₹${withdrawnAmount.toFixed(2)} from your VIP Master Card.`;

            // 1. Instantly update local state and localStorage
            const localUser = JSON.parse(localStorage.getItem("user") || "{}");
            localUser.wallet = remainingBal;
            if (!isSetup && payload.accountHolderName) {
                localUser.bankDetails = {
                    accountHolderName: payload.accountHolderName,
                    accountNumber: payload.accountNumber,
                    bankName: payload.bankName,
                    ifscCode: payload.ifscCode,
                    upiId: payload.upiId,
                    isSetup: true
                };
                window.isBankDetailsSetup = true;
                window.userBankDetails = localUser.bankDetails;
            }
            localStorage.setItem("user", JSON.stringify(localUser));

            currentVipWithdrawState.availableBalance = remainingBal;

            // 2. Instantly update UI DOM balance elements
            const walletBalEl = document.getElementById("walletBalance");
            if (walletBalEl) walletBalEl.textContent = `₹${remainingBal.toFixed(2)}`;
            
            const accCardWalletEl = document.getElementById("accCardWallet");
            if (accCardWalletEl) accCardWalletEl.textContent = remainingBal.toFixed(2);
            
            const modalAvailEl = document.getElementById("vipModalAvailableBalance");
            if (modalAvailEl) modalAvailEl.textContent = `₹${remainingBal.toFixed(2)}`;
            
            const modalMaxEl = document.getElementById("vipModalMaxWithdrawable");
            if (modalMaxEl) modalMaxEl.textContent = `₹${Math.max(0, remainingBal - 50).toFixed(2)}`;

            // 3. Close modal and display prominent success message
            closeVipWithdrawModal();
            showVipToast(`🎉 ${successMsg} Remaining Balance: ₹${remainingBal.toFixed(2)}`, 'success');
            alert(`✅ ${successMsg}\n\n• Amount Withdrawn: ₹${withdrawnAmount.toFixed(2)}\n• Remaining VIP Card Balance: ₹${remainingBal.toFixed(2)}\n• Card Number: ${data.cardNumber || currentVipWithdrawState.cardNumber}\n• Status: Pending Admin Approval`);

            // 4. Background re-sync
            loadWalletData();
            loadProfile();
        } else {
            alert(data.error || "Failed to submit VIP withdrawal request.");
        }
    } catch (err) {
        console.error("Error requesting VIP withdrawal:", err);
        alert("Network error processing VIP withdrawal. Please try again.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>💸 Submit Request</span>`;
        }
    }
}

// Prominent VIP Toast notification helper
function showVipToast(message, type = 'success') {
    let toast = document.getElementById("vipNotificationToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "vipNotificationToast";
        toast.style.cssText = "position: fixed; top: 25px; right: 25px; z-index: 99999; background: #1e1914; border: 1.5px solid #d4af37; color: #f0e6d2; padding: 16px 22px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); display: flex; align-items: center; gap: 12px; font-family: system-ui, sans-serif; font-size: 14px; font-weight: 600; opacity: 0; transform: translateY(-15px); transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none;";
        document.body.appendChild(toast);
    }

    toast.innerHTML = `<span style="font-size: 20px;">${type === 'success' ? '👑' : '⚠️'}</span><span>${message}</span>`;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-15px)";
    }, 4500);
}

/* -----------------------------------------
   GENERAL WALLET PAYMENT DESTINATION UI
----------------------------------------- */
function updateGeneralBankDetailsUI() {
    const savedSec = document.getElementById("generalSavedBankSection");
    const newSec = document.getElementById("generalNewBankSection");
    const maskedInfo = document.getElementById("generalMaskedBankInfo");

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const isSetup = window.isBankDetailsSetup || (user.bankDetails && user.bankDetails.isSetup);
    const bankData = window.userBankDetails || user.bankDetails;

    if (isSetup && bankData && (bankData.accountNumber || bankData.upiId)) {
        if (savedSec) savedSec.style.display = "block";
        if (newSec) newSec.style.display = "none";

        let detailsHtml = '';
        if (bankData.upiId) {
            const maskedUpi = bankData.upiId.replace(/(.{2}).*(@.*)/, '$1****$2');
            detailsHtml += `<div>📱 <strong>UPI ID:</strong> ${escapeHtml(maskedUpi)}</div>`;
        }
        if (bankData.accountNumber) {
            const maskedAcc = bankData.accountNumber.startsWith('XXXX') ? bankData.accountNumber : ('XXXX' + bankData.accountNumber.slice(-4));
            detailsHtml += `<div>🏦 <strong>Bank:</strong> ${escapeHtml(bankData.bankName || 'Bank')} (${escapeHtml(maskedAcc)}) - IFSC: ${escapeHtml(bankData.ifscCode || 'N/A')}</div>`;
        }
        if (bankData.accountHolderName) {
            detailsHtml += `<div>👤 <strong>Holder:</strong> ${escapeHtml(bankData.accountHolderName)}</div>`;
        }
        if (maskedInfo) maskedInfo.innerHTML = detailsHtml || 'Saved payment destination';
    } else {
        if (savedSec) savedSec.style.display = "none";
        if (newSec) {
            newSec.style.display = "block";
            const holderInput = document.getElementById("generalAccountHolderName");
            if (holderInput && !holderInput.value) {
                holderInput.value = user.name || '';
            }
        }
    }
}

/* -----------------------------------------
   REQUEST WITHDRAWAL (REGULAR WALLET)
----------------------------------------- */
async function requestWithdrawal() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const amountInput = document.getElementById("withdrawalAmount");
    const amount = parseFloat(amountInput ? amountInput.value : 0);
    if (!amount || amount <= 0) {
        alert("Please enter a valid amount");
        return;
    }

    // Prepare payload
    const payload = { amount };

    // If payment details are not set up, validate & capture from input fields
    const isSetup = window.isBankDetailsSetup;
    if (!isSetup) {
        const holder = document.getElementById("generalAccountHolderName")?.value?.trim();
        const accNum = document.getElementById("generalAccountNumber")?.value?.trim();
        const ifsc = document.getElementById("generalIfscCode")?.value?.trim()?.toUpperCase();
        const bank = document.getElementById("generalBankName")?.value?.trim();
        const upi = document.getElementById("generalUpiId")?.value?.trim()?.toLowerCase();

        if (!holder) {
            alert("Please enter the Account Holder Name.");
            return;
        }

        const hasUpi = Boolean(upi);
        const hasBank = Boolean(accNum && ifsc && bank);

        if (!hasUpi && !hasBank) {
            alert("Please provide either your UPI ID or complete Bank Details (Account Number, Bank Name, and IFSC Code).");
            return;
        }

        payload.accountHolderName = holder;
        payload.accountNumber = accNum || null;
        payload.bankName = bank || null;
        payload.ifscCode = ifsc || null;
        payload.upiId = upi || null;
    }

    const submitBtn = document.getElementById("generalWithdrawSubmitBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Submitting...";
    }

    try {
        const res = await fetch(`${API}/commission/withdraw`, {
            method: 'POST',
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (res.ok) {
            // Update local user and bank details state
            const localUser = JSON.parse(localStorage.getItem("user") || "{}");
            localUser.wallet = Number(data.remainingBalance !== undefined ? data.remainingBalance : (localUser.wallet - amount));
            if (!isSetup && payload.accountHolderName) {
                localUser.bankDetails = {
                    accountHolderName: payload.accountHolderName,
                    accountNumber: payload.accountNumber,
                    bankName: payload.bankName,
                    ifscCode: payload.ifscCode,
                    upiId: payload.upiId,
                    isSetup: true
                };
                window.isBankDetailsSetup = true;
                window.userBankDetails = localUser.bankDetails;
            }
            localStorage.setItem("user", JSON.stringify(localUser));

            showVipToast(`🎉 Withdrawal request of ₹${amount.toFixed(2)} submitted successfully!`, 'success');
            alert(`✅ Withdrawal request submitted successfully!\n\n• Amount: ₹${amount.toFixed(2)}\n• Remaining Balance: ₹${localUser.wallet.toFixed(2)}\n• Status: Pending Admin Approval\n\nProcessed within 24-48 hours directly to your registered destination.`);
            
            if (amountInput) amountInput.value = "";
            loadWalletData(); // Reload wallet data & history
            loadProfile();
        } else {
            alert(data.error || "Error processing withdrawal request");
        }
    } catch (err) {
        console.error("Error requesting withdrawal:", err);
        alert("Error processing withdrawal request. Please try again.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Request Withdrawal";
        }
    }
}

/* -----------------------------------------
   CONVERT POINTS TO CASH (MANUAL)
----------------------------------------- */
async function convertPointsToCash() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const pointsInput = document.getElementById("pointsToConvert");
    if (!pointsInput) {
        console.error("Points input element not found");
        return;
    }

    const pointsToConvert = parseInt(pointsInput.value);
    
    if (!pointsToConvert || pointsToConvert <= 0) {
        alert("Please enter a valid number of points to convert");
        return;
    }

    if (!confirm(`Are you sure you want to convert ${pointsToConvert} points to cash?\n\nThis action cannot be undone.`)) {
        return;
    }

    const convertBtn = document.getElementById("convertBtn");
    if (!convertBtn) {
        console.error("Convert button element not found");
        return;
    }

    const originalText = convertBtn.textContent;
    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";

    try {
        const res = await fetch(`${API}/points/convert-to-cash`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ pointsToConvert })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to convert points");
        }

        alert(`✅ Success!\n\nConverted: ${data.result.pointsConverted} points\nReceived: ₹${data.result.cashReceived}\nRemaining Points: ${data.result.remainingPoints}\nNew Cash Balance: ₹${data.result.newCashBalance}`);
        
        // Clear the input and reset UI with null checks
        const pointsInputClear = document.getElementById("pointsToConvert");
        const conversionPreviewClear = document.getElementById("conversionPreview");
        
        if (pointsInputClear) pointsInputClear.value = "";
        if (conversionPreviewClear) conversionPreviewClear.style.display = "none";
        loadPoints(); // Reload points display

    } catch (err) {
        console.error("Convert points error:", err);
        alert("Error: " + err.message);
    } finally {
        if (convertBtn) {
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
        }
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

// Debug: Check if loadWalletData function is defined
console.log("loadWalletData function defined:", typeof loadWalletData);

/* -----------------------------------------
   UTR MODAL FUNCTIONS
----------------------------------------- */
let currentOrderId = null;

function showUTRModal(orderId) {
    currentOrderId = orderId;
    document.getElementById('utrModal').style.display = 'block';
    
    // Clear previous values
    document.getElementById('utrNumber').value = '';
    document.getElementById('transferDate').value = '';
    
    // Set today as default date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transferDate').value = today;
}

function closeUTRModal() {
    document.getElementById('utrModal').style.display = 'none';
    currentOrderId = null;
}

// Handle UTR form submission
document.addEventListener("DOMContentLoaded", () => {
    const utrForm = document.getElementById("utrForm");
    if (utrForm) {
        utrForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            if (!currentOrderId) {
                alert("No order selected");
                return;
            }
            
            const token = localStorage.getItem("token");
            if (!token) {
                alert("Login required");
                return;
            }
            
            const utrNumber = document.getElementById("utrNumber").value.trim();
            const transferDate = document.getElementById("transferDate").value;
            
            if (!utrNumber) {
                alert("Please enter UTR number");
                return;
            }
            
            // Validate UTR format (basic validation)
            if (utrNumber.length < 8) {
                alert("UTR number should be at least 8 characters long");
                return;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";
            
            try {
                const res = await fetch(`${API}/orders/update-utr/${currentOrderId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        utrNumber,
                        transferDate
                    })
                });
                
                const data = await res.json();
                
                if (!res.ok) {
                    throw new Error(data.error || "Failed to update UTR");
                }
                
                alert("✅ UTR number updated successfully!\n\nYour payment will be verified by our admin team within 1-2 business days.");
                closeUTRModal();
                
                // Reload orders to show updated information
                loadOrders();
                
            } catch (err) {
                console.error("UTR update error:", err);
                alert("Error updating UTR: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('utrModal');
        if (e.target === modal) {
            closeUTRModal();
        }
    });
});

/* -----------------------------------------
   UPI QR CODE SCANNER & AUTO-FILL
----------------------------------------- */
function extractUpiFromQrString(qrText) {
    if (!qrText) return '';
    qrText = qrText.trim();
    
    // Case 1: Standard UPI URI (e.g. upi://pay?pa=username@bank&pn=Name...)
    if (qrText.toLowerCase().includes('pa=')) {
        try {
            const urlObj = new URL(qrText.includes('://') ? qrText : 'upi://pay?' + qrText);
            const pa = urlObj.searchParams.get('pa');
            if (pa) return decodeURIComponent(pa).trim();
        } catch (e) {
            const match = qrText.match(/[?&]pa=([^&]+)/i);
            if (match && match[1]) return decodeURIComponent(match[1]).trim();
        }
    }
    
    // Case 2: Direct UPI ID matching (e.g. username@okhdfcbank, 9876543210@paytm, user.name@upi)
    const directMatch = qrText.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/);
    if (directMatch) {
        return directMatch[0].trim();
    }
    
    return qrText.trim();
}

function decodeQrCodeImage(file, callback) {
    if (!file) return;
    if (typeof jsQR === 'undefined') {
        callback(new Error("QR Scanner library is loading or unavailable. Please check your network connection."));
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0, img.width, img.height);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert"
                });
                
                if (!code || !code.data) {
                    code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "attemptBoth"
                    });
                }
                
                if (code && code.data) {
                    const upiId = extractUpiFromQrString(code.data);
                    callback(null, upiId, code.data);
                } else {
                    callback(new Error("No valid QR code detected in the image. Please ensure the QR is clear and visible."));
                }
            } catch (err) {
                callback(err);
            }
        };
        img.onerror = function() {
            callback(new Error("Failed to load image file. Please upload a valid image (PNG/JPG/WebP)."));
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        callback(new Error("Failed to read image file."));
    };
    reader.readAsDataURL(file);
}

function handleVipQrUpload(event) {
    const file = event.target.files && event.target.files[0];
    const statusEl = document.getElementById("vipQrScanStatus");
    const upiInput = document.getElementById("vipUpiId");
    
    if (!file) return;
    
    if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#fbbf24";
        statusEl.innerHTML = `<span>⏳ Decoding QR code image...</span>`;
    }
    
    decodeQrCodeImage(file, (err, upiId, rawData) => {
        event.target.value = '';
        
        if (err || !upiId) {
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "#ef4444";
                statusEl.innerHTML = `<span>❌ ${escapeHtml(err ? err.message : 'Could not extract UPI ID from QR.')}</span>`;
            }
            return;
        }
        
        if (upiInput) {
            upiInput.value = upiId;
            upiInput.style.borderColor = "#10b981";
            upiInput.focus();
        }
        
        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#10b981";
            statusEl.innerHTML = `<span>✅ Extracted UPI ID: <strong>${escapeHtml(upiId)}</strong></span>`;
        }
    });
}

function handleGeneralQrUpload(event) {
    const file = event.target.files && event.target.files[0];
    const statusEl = document.getElementById("generalQrScanStatus");
    const upiInput = document.getElementById("generalUpiId");
    
    if (!file) return;
    
    if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#fbbf24";
        statusEl.innerHTML = `<span>⏳ Decoding QR code image...</span>`;
    }
    
    decodeQrCodeImage(file, (err, upiId, rawData) => {
        event.target.value = '';
        
        if (err || !upiId) {
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "#ef4444";
                statusEl.innerHTML = `<span>❌ ${escapeHtml(err ? err.message : 'Could not extract UPI ID from QR.')}</span>`;
            }
            return;
        }
        
        if (upiInput) {
            upiInput.value = upiId;
            upiInput.style.borderColor = "#10b981";
            upiInput.focus();
        }
        
        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#10b981";
            statusEl.innerHTML = `<span>✅ Extracted UPI ID: <strong>${escapeHtml(upiId)}</strong></span>`;
        }
    });
}

window.extractUpiFromQrString = extractUpiFromQrString;
window.decodeQrCodeImage = decodeQrCodeImage;
window.handleVipQrUpload = handleVipQrUpload;
window.handleGeneralQrUpload = handleGeneralQrUpload;