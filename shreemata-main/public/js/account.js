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

// In-memory session cache for Account page display data
const accountDataCache = {
    profile: null,
    wallet: null,
    vipCards: null,
    orders: null,
    points: null,
    address: null,
    store: null
};
window.accountDataCache = accountDataCache;

// On-demand deferred loader for jsQR library
let jsQrLoadPromise = null;
function ensureJsQrLoaded() {
    if (typeof jsQR !== 'undefined') {
        return Promise.resolve();
    }
    if (jsQrLoadPromise) {
        return jsQrLoadPromise;
    }
    jsQrLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
        script.onload = () => resolve();
        script.onerror = () => {
            jsQrLoadPromise = null;
            reject(new Error('Failed to load QR scanner library'));
        };
        document.head.appendChild(script);
    });
    return jsQrLoadPromise;
}
window.ensureJsQrLoaded = ensureJsQrLoaded;

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    // ❌ If no token → user not logged in
    if (!token || !user) {
        window.location.href = "/login.html";
        return;
    }

    // Populate user greeting immediately from cached user session
    if (user.name) {
        const accNameEl = document.getElementById("accName");
        const accEmailEl = document.getElementById("accEmail");
        const sbUser = document.getElementById("sidebarUserName");
        const pName = document.getElementById("profileDisplayName");
        const pEmail = document.getElementById("profileDisplayEmail");
        if (accNameEl) accNameEl.textContent = user.name;
        if (accEmailEl) accEmailEl.textContent = user.email || "";
        if (sbUser) sbUser.textContent = user.name;
        if (pName) pName.textContent = user.name;
        if (pEmail) pEmail.textContent = user.email || "—";
    }

    // Load initial critical profile data
    loadProfile();

    document.getElementById("logoutBtn")?.addEventListener("click", logout);
    document.getElementById("addressForm")?.addEventListener("submit", saveAddress);
    
    // Check for URL parameters to show specific section
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    if (section && section !== 'profile') {
        showSection(section);
    } else {
        showSection('profile');
    }
});

/* -----------------------------------------
   LOAD PROFILE
----------------------------------------- */
async function loadProfile(force = false) {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!force && accountDataCache.profile) {
        renderProfileFromData(accountDataCache.profile);
        return accountDataCache.profile;
    }

    try {
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            accountDataCache.profile = data;
            const user = data.user;
            
            // Save updated user to localStorage
            localStorage.setItem("user", JSON.stringify(user));

            renderProfileFromData(data);
            return data;
        } else {
            // Fallback to local storage if API call fails
            const user = JSON.parse(localStorage.getItem("user") || "{}");
            if (user.name) {
                const accNameEl = document.getElementById("accName");
                const accEmailEl = document.getElementById("accEmail");
                const editNameEl = document.getElementById("editName");
                const editEmailEl = document.getElementById("editEmail");
                if (accNameEl) accNameEl.textContent = user.name;
                if (accEmailEl) accEmailEl.textContent = user.email || "";
                if (editNameEl) editNameEl.value = user.name;
                if (editEmailEl) editEmailEl.value = user.email || "";
            }
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

function renderProfileFromData(data) {
    if (!data || !data.user) return;
    const user = data.user;
    const accNameEl = document.getElementById("accName");
    const accEmailEl = document.getElementById("accEmail");
    const editNameEl = document.getElementById("editName");
    const editEmailEl = document.getElementById("editEmail");
    const sbUser = document.getElementById("sidebarUserName");
    const pName = document.getElementById("profileDisplayName");
    const pEmail = document.getElementById("profileDisplayEmail");

    if (accNameEl) accNameEl.textContent = user.name;
    if (accEmailEl) accEmailEl.textContent = user.email || "";
    if (editNameEl) editNameEl.value = user.name;
    if (editEmailEl) editEmailEl.value = user.email || "";
    if (sbUser) sbUser.textContent = user.name;
    if (pName) pName.textContent = user.name;
    if (pEmail) pEmail.textContent = user.email || "—";

    // Render MasterCard if assigned
    const masterCardContainer = document.getElementById("masterCardContainer");
    if (user.masterCard && user.masterCard.isAssigned) {
        const cardNumEl = document.getElementById("accCardNumber");
        const cardHolderEl = document.getElementById("accCardHolder");
        const cardEarningsEl = document.getElementById("accCardEarnings");
        const accCardWalletEl = document.getElementById("accCardWallet");
        const cardIssuedEl = document.getElementById("accCardIssued");

        if (cardNumEl) cardNumEl.textContent = user.masterCard.cardNumber || "SMC-10001";
        if (cardHolderEl) cardHolderEl.textContent = user.name;
        if (cardEarningsEl) cardEarningsEl.textContent = (user.masterCard.accumulatedCommission || 0).toFixed(2);
        if (accCardWalletEl) accCardWalletEl.textContent = (user.wallet || 0).toFixed(2);
        
        const issuedDate = user.masterCard.issuedAt 
            ? new Date(user.masterCard.issuedAt).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit' })
            : '';
        if (cardIssuedEl) cardIssuedEl.textContent = issuedDate;
        
        if (masterCardContainer) {
            masterCardContainer.style.display = "block";
        }
    } else {
        if (masterCardContainer) {
            masterCardContainer.style.display = "none";
        }
    }
}

/* -----------------------------------------
   CHANGE PAGE SECTIONS (LAZY LOAD ON DEMAND)
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
    
    // Load section-specific data on-demand (only once or using session cache)
    if (section === 'profile') {
        loadProfile();
    } else if (section === 'edit') {
        loadProfile();
    } else if (section === 'address') {
        loadAddress();
    } else if (section === 'store') {
        loadStoreDetailsForAccount();
    } else if (section === 'wallet') {
        loadWalletData();
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
}

/* -----------------------------------------
   LOAD ORDERS (SAFE & CACHED)
----------------------------------------- */
async function loadOrders(force = false) {
    const token = localStorage.getItem("token");
    const container = document.getElementById("ordersList");

    if (!token) {
        if (container) container.innerHTML = "<p>Please login to view orders.</p>";
        return;
    }

    if (!force && accountDataCache.orders) {
        if (typeof renderAccountOrders === 'function') {
            window.allAccountOrders = accountDataCache.orders;
            renderAccountOrders(accountDataCache.orders);
        } else {
            renderOrdersFallback(accountDataCache.orders);
        }
        return;
    }

    try {
        const res = await fetch(`${API}/orders`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        accountDataCache.orders = data.orders || [];

        if (typeof renderAccountOrders === 'function') {
            window.allAccountOrders = accountDataCache.orders;
            renderAccountOrders(accountDataCache.orders);
        } else {
            renderOrdersFallback(accountDataCache.orders);
        }
    } 
    catch (error) {
        console.error("Order load error:", error);
        if (container) container.innerHTML = "<p style='color: #dc3545;'>Error loading orders. Please try again.</p>";
    }
}

function renderOrdersFallback(orders) {
    const container = document.getElementById("ordersList");
    if (!container) return;
    container.innerHTML = "";

    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #999;">
                <div style="font-size: 48px; margin-bottom: 10px;">📦</div>
                <p>No orders yet. Start shopping!</p>
            </div>
        `;
        return;
    }

    orders.forEach(order => {
        const div = document.createElement("div");
        div.classList.add("order-card");
        
        const itemsList = (order.items || []).map(item => {
            const qty = item.quantity > 1 ? ` (x${item.quantity})` : '';
            return `${item.title}${qty}`;
        }).join(', ');
        
        const statusColor = order.status === 'completed' ? '#28a745' : 
                           order.status === 'pending' ? '#ffc107' : 
                           order.status === 'pending_payment_verification' ? '#ff9800' : '#dc3545';
        
        const deliveryStatus = order.deliveryStatus || 'pending';
        const deliveryColor = deliveryStatus === 'delivered' ? '#28a745' : 
                             deliveryStatus === 'shipped' ? '#2196F3' : '#ffc107';

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
            <h3>Order #${(order._id || '').slice(-8)}</h3>
            <p><strong>Items:</strong> ${escapeHtml(itemsList)}</p>
            <p><strong>Total Amount:</strong> ₹${Number(order.totalAmount || 0).toFixed(2)}</p>
            <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p><strong>Payment Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${order.status}</span></p>
            <p><strong>Delivery Status:</strong> <span style="color: ${deliveryColor}; font-weight: 600;">${deliveryStatus}</span></p>
            ${trackingDisplay}
            ${order.deliveryAddress && (order.deliveryAddress.homeAddress1 || order.deliveryAddress.street) ? `
                <p><strong>Delivery Address:</strong> ${escapeHtml(order.deliveryAddress.homeAddress1 || order.deliveryAddress.street)}, ${escapeHtml(order.deliveryAddress.taluk || order.deliveryAddress.city || '')}, ${escapeHtml(order.deliveryAddress.district || '')}</p>
            ` : ''}
            ${invoiceBtn}
        `;
        container.appendChild(div);
    });
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

document.getElementById("editForm")?.addEventListener("submit", async (e) => {
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

        // ✔ Save updated user to localStorage & invalidate cache
        localStorage.setItem("user", JSON.stringify(data.user));
        accountDataCache.profile = null;

        // ✔ Refresh name & email inside account page
        loadProfile(true);

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
   LOAD ADDRESS (SAFE & CACHED)
----------------------------------------- */
async function loadAddress(force = false) {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!force && accountDataCache.address) {
        renderAddressFromData(accountDataCache.address);
        return;
    }

    if (!force && accountDataCache.profile?.user?.address) {
        renderAddressFromData(accountDataCache.profile.user.address);
        return;
    }

    try {
        const res = await fetch(`${API}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (data.user) {
            accountDataCache.profile = data;
            if (data.user.address) {
                accountDataCache.address = data.user.address;
                renderAddressFromData(data.user.address);
            }
        }
    } catch (err) {
        console.error("Error loading address:", err);
    }
}

function renderAddressFromData(addr) {
    if (!addr) return;
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "-"; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };

    setTxt("displayHomeAddress1", addr.homeAddress1 || addr.street || "Not set");
    setTxt("displayHomeAddress2", addr.homeAddress2 || "-");
    setTxt("displayStreetName", addr.streetName || "-");
    setTxt("displayLandmark", addr.landmark || "-");
    setTxt("displayVillage", addr.village || "-");
    setTxt("displayTaluk", addr.taluk || "Not set");
    setTxt("displayDistrict", addr.district || "Not set");
    setTxt("displayState", addr.state || "Not set");
    setTxt("displayPincode", addr.pincode || "Not set");
    setTxt("displayPhone", addr.phone || "Not set");
    
    setVal("homeAddress1", addr.homeAddress1 || addr.street || "");
    setVal("homeAddress2", addr.homeAddress2 || "");
    setVal("streetName", addr.streetName || "");
    setVal("landmark", addr.landmark || "");
    setVal("village", addr.village || "");
    setVal("taluk", addr.taluk || "");
    setVal("district", addr.district || "");
    setVal("state", addr.state || "");
    setVal("pincode", addr.pincode || "");
    setVal("phone", addr.phone || "");
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
        accountDataCache.address = null;
        loadAddress(true);
        toggleAddressEdit();

    } catch (err) {
        console.error("Address update error:", err);
        alert("Error updating address");
    }
}

/* -----------------------------------------
   LOAD POINTS (PARALLEL & CACHED)
----------------------------------------- */
async function loadPoints(force = false) {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!force && accountDataCache.points) {
        renderPointsFromCache(accountDataCache.points);
        return;
    }

    try {
        const [balanceResult, historyResult] = await Promise.allSettled([
            fetch(`${API}/points/balance`, { headers: { "Authorization": `Bearer ${token}` } }),
            fetch(`${API}/points/history?page=1&limit=10`, { headers: { "Authorization": `Bearer ${token}` } })
        ]);

        let balanceData = {};
        let historyData = { transactions: [] };

        if (balanceResult.status === "fulfilled" && balanceResult.value.ok) {
            balanceData = await balanceResult.value.json();
        }
        if (historyResult.status === "fulfilled" && historyResult.value.ok) {
            historyData = await historyResult.value.json();
        }

        accountDataCache.points = { balanceData, historyData };
        renderPointsFromCache(accountDataCache.points);

    } catch (err) {
        console.error("Error loading points:", err);
        const historyList = document.getElementById("pointsHistoryList");
        if (historyList) {
            historyList.innerHTML = "<p style='color: #dc3545;'>Error loading points. Please try again.</p>";
        }
    }
}

function renderPointsFromCache(cached) {
    if (!cached) return;
    const { balanceData, historyData } = cached;

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
            redeemSection.style.display = "none";
        } else {
            redeemSection.style.display = "block";
            
            if (balanceData.capabilities?.canCreateVirtual) {
                redeemBtn.disabled = false;
                redeemBtn.innerHTML = `🎁 Redeem ${virtualTreeCost} Points for Virtual Referral`;
            } else {
                redeemBtn.disabled = true;
                const needed = virtualTreeCost - (balanceData.pointsWallet || 0);
                redeemBtn.innerHTML = `Need ${needed} more points`;
            }
        }
    }

    // Update cash conversion section
    const cashSettings = balanceData.settings?.cashConversion;
    if (cashSettings && cashSettings.enabled) {
        const conversionRate = `${cashSettings.pointsPerConversion} Points = ₹${cashSettings.cashPerConversion}`;
        const perPointValue = (cashSettings.cashPerConversion / cashSettings.pointsPerConversion).toFixed(2);
        
        const conversionRateDisplayEl = document.getElementById("conversionRateDisplay");
        const perPointValueEl = document.getElementById("perPointValue");
        const conversionIncrementEl = document.getElementById("conversionIncrement");
        
        if (conversionRateDisplayEl) conversionRateDisplayEl.textContent = conversionRate;
        if (perPointValueEl) perPointValueEl.textContent = perPointValue;
        if (conversionIncrementEl) conversionIncrementEl.textContent = cashSettings.pointsPerConversion;

        const pointsAfterVirtuals = (balanceData.pointsWallet || 0) - ((balanceData.capabilities?.possibleVirtualTrees || 0) * virtualTreeCost);
        const availableForConversion = Math.max(0, Math.floor(pointsAfterVirtuals / cashSettings.pointsPerConversion) * cashSettings.pointsPerConversion);
        const maxCashPossible = (availableForConversion / cashSettings.pointsPerConversion) * cashSettings.cashPerConversion;
        
        const availableForConversionEl = document.getElementById("availableForConversion");
        const maxCashPossibleEl = document.getElementById("maxCashPossible");
        
        if (availableForConversionEl) availableForConversionEl.textContent = `${availableForConversion} points`;
        if (maxCashPossibleEl) maxCashPossibleEl.textContent = maxCashPossible.toFixed(2);
        
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

            pointsInput.oninput = function() {
                const points = parseInt(this.value) || 0;
                const cash = (points / cashSettings.pointsPerConversion) * cashSettings.cashPerConversion;
                
                if (points > 0) {
                    const previewPointsEl = document.getElementById("previewPoints");
                    const previewCashEl = document.getElementById("previewCash");
                    
                    if (previewPointsEl) previewPointsEl.textContent = points;
                    if (previewCashEl) previewCashEl.textContent = cash.toFixed(2);
                    if (conversionPreview) conversionPreview.style.display = "block";
                } else {
                    if (conversionPreview) conversionPreview.style.display = "none";
                }
                
                const isValid = points > 0 && points <= availableForConversion && points % cashSettings.pointsPerConversion === 0;
                convertBtn.disabled = !isValid;
                
                if (points > availableForConversion) {
                    convertBtn.textContent = "❌ Not enough points";
                } else if (points > 0 && points % cashSettings.pointsPerConversion !== 0) {
                    convertBtn.textContent = `❌ Use multiples of ${cashSettings.pointsPerConversion}`;
                } else {
                    convertBtn.textContent = "💸 Convert to Cash";
                }
            };
        }
    } else {
        const conversionSection = document.querySelector(".cash-conversion-section");
        if (conversionSection) conversionSection.style.display = "none";
    }

    // Render points history
    const historyList = document.getElementById("pointsHistoryList");
    if (!historyList) return;
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
                    <p style="font-weight: 600; margin: 0 0 5px 0;">${typeIcon} ${escapeHtml(tx.description)}</p>
                    <p style="font-size: 0.9em; color: #666; margin: 0;">${new Date(tx.createdAt).toLocaleString()}</p>
                    ${tx.cashAmount ? `<p style="font-size: 0.9em; color: #28a745; margin: 5px 0 0 0;">💰 Received: ₹${Number(tx.cashAmount).toFixed(2)}</p>` : ''}
                </div>
                <div style="text-align: right;">
                    <p style="color: ${typeColor}; font-weight: 600; font-size: 1.2em;">${sign}${Math.abs(tx.points)}</p>
                    <p style="font-size: 0.9em; color: #666;">Balance: ${tx.balanceAfter}</p>
                </div>
            </div>
        `;
        historyList.appendChild(div);
    });
}

/* -----------------------------------------
   LOAD WALLET DATA (PARALLEL & CACHED)
----------------------------------------- */
async function loadWalletData(force = false) {
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("No token found");
        return;
    }

    if (!force && accountDataCache.wallet) {
        renderWalletFromCache(accountDataCache.wallet);
        return;
    }

    // Set skeleton loading state only if needed
    const balEl = document.getElementById("walletBalance");
    const cbEl = document.getElementById("totalCashbackEarned");
    const refEl = document.getElementById("totalReferralEarnings");

    if (balEl && !balEl.querySelector(".sm-skeleton-text")) balEl.innerHTML = `<span class="sm-skeleton-text">—</span>`;
    if (cbEl && !cbEl.querySelector(".sm-skeleton-text")) cbEl.innerHTML = `<span class="sm-skeleton-text">—</span>`;
    if (refEl && !refEl.querySelector(".sm-skeleton-text")) refEl.innerHTML = `<span class="sm-skeleton-text">—</span>`;

    try {
        // Fetch all independent endpoints concurrently using Promise.allSettled
        const [profileResult, txResult, vipResult, settingsResult] = await Promise.allSettled([
            fetch(`${API}/users/profile`, { headers: { "Authorization": `Bearer ${token}` } }),
            fetch(`${API}/commission/transactions`, { headers: { "Authorization": `Bearer ${token}` } }),
            fetch(`${API}/users/profile/vip-mastercards`, { headers: { "Authorization": `Bearer ${token}` } }),
            fetch(`${API}/commission/settings`, { headers: { "Authorization": `Bearer ${token}` } })
        ]);

        let profileData = null;
        let transactionsData = null;
        let vipData = null;
        let settingsData = null;

        // 1. Handle Profile Result
        if (profileResult.status === "fulfilled" && profileResult.value.ok) {
            profileData = await profileResult.value.json();
            if (profileData.user) {
                localStorage.setItem("user", JSON.stringify(profileData.user));
            }
            const walletBalance = Number(profileData.user?.wallet || 0);
            if (balEl) balEl.textContent = `₹${walletBalance.toFixed(2)}`;

            window.userBankDetails = profileData.maskedBankDetails || (profileData.user?.bankDetails?.isSetup ? profileData.user.bankDetails : null);
            window.isBankDetailsSetup = Boolean(profileData.bankDetailsSetup !== undefined ? profileData.bankDetailsSetup : profileData.user?.bankDetails?.isSetup);

            updateGeneralBankDetailsUI();
            renderWithdrawalHistory(profileData.withdrawals || profileData.user?.withdrawals || []);
        } else if (balEl && balEl.querySelector(".sm-skeleton-text")) {
            balEl.textContent = "—";
        }

        // 2. Handle Transactions Result
        if (txResult.status === "fulfilled" && txResult.value.ok) {
            transactionsData = await txResult.value.json();
            window.allWalletTransactions = transactionsData.transactions || [];
            window.hiddenTxSet = new Set(transactionsData.hiddenTransactions ? transactionsData.hiddenTransactions.map(String) : []);
            window.isUserAdmin = Boolean(transactionsData.isAdmin);

            let totalCashback = 0;
            let totalReferralEarnings = 0;

            if (transactionsData.transactions && transactionsData.transactions.length > 0) {
                transactionsData.transactions.forEach(tx => {
                    if (tx.type === 'cashback') {
                        totalCashback += tx.amount;
                    } else if (tx.type === 'referral_commission' || tx.type === 'direct_commission' || tx.type === 'level_commission') {
                        totalReferralEarnings += tx.amount;
                    }
                });
                displayWalletHistory(transactionsData.transactions);
            } else {
                displayWalletHistory([]);
            }

            if (cbEl) cbEl.textContent = `₹${totalCashback.toFixed(2)}`;
            if (refEl) refEl.textContent = `₹${totalReferralEarnings.toFixed(2)}`;
        } else {
            if (cbEl && cbEl.querySelector(".sm-skeleton-text")) cbEl.textContent = "—";
            if (refEl && refEl.querySelector(".sm-skeleton-text")) refEl.textContent = "—";
        }

        // 3. Handle VIP MasterCards Result
        if (vipResult.status === "fulfilled" && vipResult.value.ok) {
            vipData = await vipResult.value.json();
            if (vipData.bankDetailsSetup !== undefined) {
                window.isBankDetailsSetup = Boolean(vipData.bankDetailsSetup);
            }
            if (vipData.maskedBankDetails) {
                window.userBankDetails = vipData.maskedBankDetails;
            }
            if (vipData.withdrawals && vipData.withdrawals.length > 0) {
                renderWithdrawalHistory(vipData.withdrawals);
            }
            renderVipCardsUI(vipData, profileData?.user);
        }

        // 4. Handle Settings Result
        if (settingsResult.status === "fulfilled" && settingsResult.value.ok) {
            settingsData = await settingsResult.value.json();
            if (settingsData.settings) {
                const minWEl = document.getElementById("minWithdrawal");
                if (minWEl) minWEl.textContent = `₹${settingsData.settings.minimumWithdrawalAmount || 100}`;
            }
        }

        // Cache the combined wallet bundle
        accountDataCache.wallet = { profileData, transactionsData, vipData, settingsData };

    } catch (err) {
        console.error("Error loading wallet data:", err);
        if (balEl && balEl.querySelector(".sm-skeleton-text")) balEl.textContent = "—";
        if (cbEl && cbEl.querySelector(".sm-skeleton-text")) cbEl.textContent = "—";
        if (refEl && refEl.querySelector(".sm-skeleton-text")) refEl.textContent = "—";
    }
}

function renderVipCardsUI(vipData, user) {
    const vipSection = document.getElementById("vipMasterCardsSection");
    const vipList = document.getElementById("vipMasterCardsList");
    if (!vipSection || !vipList) return;

    if (vipData && vipData.cards && vipData.cards.length > 0) {
        vipSection.style.display = "block";
        vipList.innerHTML = "";
        
        // Sort cards by tier descending to render ONLY the single highest tier card
        const sortedCards = [...vipData.cards].sort((a, b) => (Number(b.tier) || 0) - (Number(a.tier) || 0));
        const card = sortedCards[0];
        
        const cumulative = Number(vipData.cumulativeTotal || 0);
        const nextMilestone = (Math.floor(cumulative / 100) + 1) * 100;
        const progressPercent = Math.min(100, Math.max(0, (cumulative % 100)));
        const walletBalance = Number(vipData.walletBalance || user?.wallet || 0);
        
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
                        <div style="font-weight: 700; color: #f0e6d2; font-size: 0.85rem;">${escapeHtml(user?.name || '')}</div>
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
                        <span style="font-weight: 700; color: #d4af37;">₹${cumulative.toFixed(2)} / ₹${nextMilestone}</span>
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

function renderWalletFromCache(cached) {
    if (!cached) return;
    const { profileData, transactionsData, vipData, settingsData } = cached;
    
    if (profileData && profileData.user) {
        const walletBalance = Number(profileData.user.wallet || 0);
        const balEl = document.getElementById("walletBalance");
        if (balEl) balEl.textContent = `₹${walletBalance.toFixed(2)}`;

        window.userBankDetails = profileData.maskedBankDetails || (profileData.user.bankDetails?.isSetup ? profileData.user.bankDetails : null);
        window.isBankDetailsSetup = Boolean(profileData.bankDetailsSetup !== undefined ? profileData.bankDetailsSetup : profileData.user.bankDetails?.isSetup);

        updateGeneralBankDetailsUI();
        renderWithdrawalHistory(profileData.withdrawals || profileData.user.withdrawals || []);
    }

    if (transactionsData) {
        window.allWalletTransactions = transactionsData.transactions || [];
        window.hiddenTxSet = new Set(transactionsData.hiddenTransactions ? transactionsData.hiddenTransactions.map(String) : []);
        window.isUserAdmin = Boolean(transactionsData.isAdmin);

        let totalCashback = 0;
        let totalReferralEarnings = 0;
        if (transactionsData.transactions && transactionsData.transactions.length > 0) {
            transactionsData.transactions.forEach(tx => {
                if (tx.type === 'cashback') totalCashback += tx.amount;
                else if (tx.type === 'referral_commission' || tx.type === 'direct_commission' || tx.type === 'level_commission') totalReferralEarnings += tx.amount;
            });
            displayWalletHistory(transactionsData.transactions);
        } else {
            displayWalletHistory([]);
        }

        const cbEl = document.getElementById("totalCashbackEarned");
        const refEl = document.getElementById("totalReferralEarnings");
        if (cbEl) cbEl.textContent = `₹${totalCashback.toFixed(2)}`;
        if (refEl) refEl.textContent = `₹${totalReferralEarnings.toFixed(2)}`;
    }

    if (vipData) {
        renderVipCardsUI(vipData, profileData?.user);
    }

    if (settingsData && settingsData.settings) {
        const minWEl = document.getElementById("minWithdrawal");
        if (minWEl) minWEl.textContent = `₹${settingsData.settings.minimumWithdrawalAmount || 100}`;
    }
}

/* -----------------------------------------
   TRANSACTION HISTORY & 3-DOT ACTION SYSTEM
----------------------------------------- */
window.allWalletTransactions = [];
window.hiddenTxSet = new Set();
window.isUserAdmin = false;
window.showingHiddenTransactions = false;
window.pendingHideTxId = null;
window.pendingAdminDeleteTxId = null;

function getTxTypeMeta(type) {
    switch (type) {
        case 'cashback':
            return { display: '💰 Cashback', color: '#ff6f61', sign: '+' };
        case 'direct_commission':
            return { display: '⭐ Direct Commission (Cashback)', color: '#28a745', sign: '+' };
        case 'referral_commission':
            return { display: '👥 Referral Commission', color: '#20c997', sign: '+' };
        case 'level_commission':
            return { display: '🏆 Level Commission', color: '#17a2b8', sign: '+' };
        case 'withdrawal':
            return { display: '💸 Withdrawal', color: '#dc3545', sign: '-' };
        case 'vip_master_card_withdrawal':
            return { display: '👑 VIP Master Card Withdrawal', color: '#d4af37', sign: '-' };
        case 'refund':
            return { display: '💰 Refund: Rejected Withdrawal', color: '#10b981', sign: '+' };
        default:
            return { display: type || 'Transaction', color: '#6c757d', sign: '+' };
    }
}

function displayWalletHistory(transactions) {
    if (transactions) {
        window.allWalletTransactions = transactions;
    }
    const allList = window.allWalletTransactions || [];
    const historyList = document.getElementById("walletHistoryList");
    if (!historyList) return;

    // Count hidden transactions
    const hiddenCount = allList.filter(tx => window.hiddenTxSet.has(String(tx._id))).length;
    
    // Toggle button UI
    const toggleBtn = document.getElementById("toggleHiddenTxBtn");
    const countBadge = document.getElementById("hiddenTxCountBadge");
    const toggleIcon = document.getElementById("toggleHiddenTxIcon");
    const toggleText = document.getElementById("toggleHiddenTxText");

    if (toggleBtn) {
        if (hiddenCount > 0) {
            toggleBtn.style.display = "inline-flex";
            if (countBadge) countBadge.textContent = hiddenCount;
            if (window.showingHiddenTransactions) {
                if (toggleIcon) toggleIcon.textContent = "🙈";
                if (toggleText) toggleText.textContent = "Hide Hidden";
            } else {
                if (toggleIcon) toggleIcon.textContent = "👁️";
                if (toggleText) toggleText.textContent = "Show Hidden";
            }
        } else {
            toggleBtn.style.display = "none";
            window.showingHiddenTransactions = false;
        }
    }

    // Determine list to render
    let displayList = [];
    if (window.showingHiddenTransactions) {
        displayList = [...allList];
    } else {
        displayList = allList.filter(tx => !window.hiddenTxSet.has(String(tx._id)));
    }

    historyList.innerHTML = "";

    if (displayList.length === 0) {
        if (window.showingHiddenTransactions) {
            historyList.innerHTML = "<p style='color: var(--sm-muted); text-align: center; padding: 24px;'>No transactions found.</p>";
        } else if (hiddenCount > 0) {
            historyList.innerHTML = "<p style='color: var(--sm-muted); text-align: center; padding: 24px;'>All transactions are currently hidden. Click <strong>Show Hidden</strong> above to view and restore them.</p>";
        } else {
            historyList.innerHTML = "<p style='color: var(--sm-muted); text-align: center; padding: 24px;'>No transactions yet. Start shopping to earn cashback!</p>";
        }
        return;
    }

    // Sort transactions by date (newest first)
    const sortedTransactions = [...displayList].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sortedTransactions.forEach(tx => {
        const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent';
        const time = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const meta = getTxTypeMeta(tx.type);
        const isHidden = window.hiddenTxSet.has(String(tx._id));

        const div = document.createElement("div");
        div.className = `tx-row-item ${isHidden ? 'is-hidden-item' : ''}`;
        div.id = `txCard_${escapeHtml(String(tx._id))}`;
        div.style.borderLeft = `4px solid ${meta.color}`;
        
        div.innerHTML = `
            <div class="tx-left-col">
                <div class="tx-type-tag" style="color: ${meta.color};">
                    <span>${meta.display}</span>
                    ${isHidden ? '<span class="tx-hidden-badge">👁️ Hidden</span>' : ''}
                </div>
                <p class="tx-desc-text">${escapeHtml(tx.description || 'Transaction')}</p>
                <p class="tx-date-text">${date} ${time ? 'at ' + time : ''}</p>
            </div>
            <div class="tx-right-col">
                <div class="tx-amount-block">
                    <p class="tx-amount" style="color: ${meta.color};">${meta.sign}₹${Number(tx.amount || 0).toFixed(2)}</p>
                    <p class="tx-status">Status: ${escapeHtml(tx.status || 'completed')}</p>
                </div>
                <div class="tx-action-wrap">
                    <button type="button" class="tx-action-trigger" onclick="toggleTxActionMenu(event, '${escapeHtml(String(tx._id))}')" aria-label="Transaction actions" title="Actions">
                        ⋮
                    </button>
                    <div class="tx-dropdown-menu" id="txMenu_${escapeHtml(String(tx._id))}">
                        <button type="button" class="tx-dropdown-item" onclick="openTxDetailsModal('${escapeHtml(String(tx._id))}')">
                            <span>📄</span> <span>View Details</span>
                        </button>
                        ${isHidden ? `
                            <button type="button" class="tx-dropdown-item restore" onclick="restoreTransaction('${escapeHtml(String(tx._id))}')">
                                <span>🔄</span> <span>Restore to History</span>
                            </button>
                        ` : `
                            <button type="button" class="tx-dropdown-item danger" onclick="openHideTxConfirmModal('${escapeHtml(String(tx._id))}')">
                                <span>👁️‍🗨️</span> <span>Hide from History</span>
                            </button>
                        `}
                        ${window.isUserAdmin ? `
                            <div class="tx-dropdown-divider"></div>
                            <button type="button" class="tx-dropdown-item danger" onclick="openAdminDeleteTxConfirmModal('${escapeHtml(String(tx._id))}')">
                                <span>🗑️</span> <span>Delete Permanently</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        historyList.appendChild(div);
    });
}

/* -----------------------------------------
   TRANSACTION 3-DOT MENU & MODAL HANDLERS
----------------------------------------- */
function toggleTxActionMenu(e, txId) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const targetMenu = document.getElementById(`txMenu_${txId}`);
    const allMenus = document.querySelectorAll('.tx-dropdown-menu');
    const allTriggers = document.querySelectorAll('.tx-action-trigger');

    const isOpen = targetMenu ? targetMenu.classList.contains('open') : false;

    // Close all menus
    allMenus.forEach(menu => menu.classList.remove('open'));
    allTriggers.forEach(trig => trig.classList.remove('active'));

    // Toggle target if it was closed
    if (targetMenu && !isOpen) {
        targetMenu.classList.add('open');
        const trigger = targetMenu.parentElement ? targetMenu.parentElement.querySelector('.tx-action-trigger') : null;
        if (trigger) trigger.classList.add('active');
    }
}

// Global click-outside listener to close any open 3-dot dropdown menus
document.addEventListener('click', function(e) {
    if (!e.target.closest('.tx-action-wrap')) {
        document.querySelectorAll('.tx-dropdown-menu').forEach(menu => menu.classList.remove('open'));
        document.querySelectorAll('.tx-action-trigger').forEach(trig => trig.classList.remove('active'));
    }
});

function findTxById(txId) {
    return (window.allWalletTransactions || []).find(tx => String(tx._id) === String(txId));
}

function openTxDetailsModal(txId) {
    // Close dropdowns
    document.querySelectorAll('.tx-dropdown-menu').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('.tx-action-trigger').forEach(trig => trig.classList.remove('active'));

    const tx = findTxById(txId);
    if (!tx) {
        showTxToast("Transaction details not found", "danger");
        return;
    }

    const meta = getTxTypeMeta(tx.type);
    const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
    const isHidden = window.hiddenTxSet.has(String(tx._id));

    const modalBody = document.getElementById("txDetailsModalBody");
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="tx-details-grid">
            <div class="tx-details-cell full">
                <div class="tx-details-label">Description</div>
                <div class="tx-details-val" style="font-size: 15px;">${escapeHtml(tx.description || 'Transaction')}</div>
            </div>
            <div class="tx-details-cell">
                <div class="tx-details-label">Amount</div>
                <div class="tx-details-val" style="color: ${meta.color}; font-size: 16px; font-variant-numeric: tabular-nums;">${meta.sign}₹${Number(tx.amount || 0).toFixed(2)}</div>
            </div>
            <div class="tx-details-cell">
                <div class="tx-details-label">Category / Type</div>
                <div class="tx-details-val">${escapeHtml(meta.display)}</div>
            </div>
            <div class="tx-details-cell">
                <div class="tx-details-label">Status</div>
                <div class="tx-details-val" style="text-transform: capitalize;">${escapeHtml(tx.status || 'completed')}</div>
            </div>
            <div class="tx-details-cell">
                <div class="tx-details-label">Visibility State</div>
                <div class="tx-details-val">${isHidden ? '👁️ Hidden from main history' : '✅ Active in history'}</div>
            </div>
            <div class="tx-details-cell full">
                <div class="tx-details-label">Date & Time</div>
                <div class="tx-details-val">${dateStr}</div>
            </div>
            <div class="tx-details-cell full">
                <div class="tx-details-label">Transaction Reference ID</div>
                <div class="tx-details-val" style="font-family: monospace; font-size: 12.5px; color: var(--sm-muted);">${escapeHtml(String(tx._id))}</div>
            </div>
            ${tx.orderId ? `
                <div class="tx-details-cell full">
                    <div class="tx-details-label">Associated Order</div>
                    <div class="tx-details-val" style="font-family: monospace;">#${escapeHtml(String(tx.orderId).slice(-8).toUpperCase())}</div>
                </div>
            ` : ''}
            ${tx.balanceAfter !== undefined && tx.balanceAfter !== null ? `
                <div class="tx-details-cell full">
                    <div class="tx-details-label">Wallet Balance After Transaction</div>
                    <div class="tx-details-val" style="font-variant-numeric: tabular-nums;">₹${Number(tx.balanceAfter).toFixed(2)}</div>
                </div>
            ` : ''}
        </div>
    `;

    const modal = document.getElementById("txDetailsModal");
    if (modal) modal.style.display = "flex";
}

function closeTxDetailsModal() {
    const modal = document.getElementById("txDetailsModal");
    if (modal) modal.style.display = "none";
}

function openHideTxConfirmModal(txId) {
    // Close dropdowns
    document.querySelectorAll('.tx-dropdown-menu').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('.tx-action-trigger').forEach(trig => trig.classList.remove('active'));

    const tx = findTxById(txId);
    if (!tx) return;

    window.pendingHideTxId = txId;
    const meta = getTxTypeMeta(tx.type);
    const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    const preview = document.getElementById("txHidePreviewCard");
    if (preview) {
        preview.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: ${meta.color};">${escapeHtml(meta.display)}</strong>
                <span style="font-weight: 700; color: ${meta.color}; font-variant-numeric: tabular-nums;">${meta.sign}₹${Number(tx.amount || 0).toFixed(2)}</span>
            </div>
            <div style="color: var(--sm-body); font-size: 13px; margin-bottom: 2px;">${escapeHtml(tx.description || '')}</div>
            <div style="color: var(--sm-muted); font-size: 11.5px;">${dateStr}</div>
        `;
    }

    const modal = document.getElementById("txHideConfirmModal");
    if (modal) modal.style.display = "flex";
}

function closeTxHideConfirmModal() {
    const modal = document.getElementById("txHideConfirmModal");
    if (modal) modal.style.display = "none";
    window.pendingHideTxId = null;
}

async function submitHideTransaction() {
    const txId = window.pendingHideTxId;
    if (!txId || window.isHidingTx) return;
    window.isHidingTx = true;

    const confirmBtn = document.getElementById("confirmHideTxBtn");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Hiding...";
        confirmBtn.style.opacity = "0.7";
    }

    const authToken = localStorage.getItem("token");
    if (!authToken) {
        showTxToast("Session expired. Please log in again.", "danger");
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Hide Transaction";
            confirmBtn.style.opacity = "1";
        }
        window.isHidingTx = false;
        return;
    }

    try {
        const res = await fetch(`${API}/commission/transactions/hide`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ transactionId: txId })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            const errorMsg = data.error || data.message || `Failed to hide transaction (${res.status})`;
            showTxToast(errorMsg, "danger");
            return;
        }

        // Add to local hidden set
        window.hiddenTxSet.add(String(txId));
        accountDataCache.wallet = null;

        closeTxHideConfirmModal();
        showTxToast("Transaction hidden from history", "info");

        // Smooth DOM removal without full page reload
        const cardEl = document.getElementById(`txCard_${txId}`);
        if (cardEl) {
            if (!window.showingHiddenTransactions) {
                cardEl.classList.add('fade-out');
                setTimeout(() => {
                    displayWalletHistory(window.allWalletTransactions);
                }, 350);
            } else {
                displayWalletHistory(window.allWalletTransactions);
            }
        } else {
            displayWalletHistory(window.allWalletTransactions);
        }
    } catch (err) {
        console.error("Error hiding transaction:", err);
        showTxToast(err.message || "Failed to hide transaction. Please try again.", "danger");
    } finally {
        window.isHidingTx = false;
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Hide Transaction";
            confirmBtn.style.opacity = "1";
        }
    }
}

function toggleShowHiddenTransactions() {
    window.showingHiddenTransactions = !window.showingHiddenTransactions;
    displayWalletHistory(window.allWalletTransactions);
}

async function restoreTransaction(txId) {
    // Close dropdowns
    document.querySelectorAll('.tx-dropdown-menu').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('.tx-action-trigger').forEach(trig => trig.classList.remove('active'));

    const authToken = localStorage.getItem("token");
    if (!authToken) {
        showTxToast("Session expired. Please log in again.", "danger");
        return;
    }

    try {
        const res = await fetch(`${API}/commission/transactions/restore`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ transactionId: txId })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            const errorMsg = data.error || data.message || `Failed to restore transaction (${res.status})`;
            showTxToast(errorMsg, "danger");
            return;
        }

        window.hiddenTxSet.delete(String(txId));
        accountDataCache.wallet = null;
        showTxToast("Transaction restored to history", "success");
        displayWalletHistory(window.allWalletTransactions);
    } catch (err) {
        console.error("Error restoring transaction:", err);
        showTxToast(err.message || "Failed to restore transaction. Please try again.", "danger");
    }
}

function openAdminDeleteTxConfirmModal(txId) {
    if (!window.isUserAdmin) return;

    // Close dropdowns
    document.querySelectorAll('.tx-dropdown-menu').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('.tx-action-trigger').forEach(trig => trig.classList.remove('active'));

    const tx = findTxById(txId);
    if (!tx) return;

    window.pendingAdminDeleteTxId = txId;
    const meta = getTxTypeMeta(tx.type);
    const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    const preview = document.getElementById("txAdminDeletePreviewCard");
    if (preview) {
        preview.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: var(--sm-danger);">${escapeHtml(meta.display)}</strong>
                <span style="font-weight: 700; color: var(--sm-danger); font-variant-numeric: tabular-nums;">${meta.sign}₹${Number(tx.amount || 0).toFixed(2)}</span>
            </div>
            <div style="color: var(--sm-body); font-size: 13px; margin-bottom: 2px;">${escapeHtml(tx.description || '')}</div>
            <div style="color: var(--sm-muted); font-size: 11.5px;">${dateStr} • ID: ${escapeHtml(String(tx._id))}</div>
        `;
    }

    const modal = document.getElementById("txAdminDeleteModal");
    if (modal) modal.style.display = "flex";
}

function closeTxAdminDeleteModal() {
    if (window.isDeletingTx) return; // Prevent closing while in-flight
    const modal = document.getElementById("txAdminDeleteModal");
    if (modal) modal.style.display = "none";
    window.pendingAdminDeleteTxId = null;
}

async function submitAdminPermanentDelete() {
    const txId = window.pendingAdminDeleteTxId;
    if (!txId || window.isDeletingTx) return;
    window.isDeletingTx = true;

    const confirmBtn = document.getElementById("confirmAdminDeleteTxBtn");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Deleting...";
        confirmBtn.style.opacity = "0.7";
    }

    const authToken = localStorage.getItem("token");
    if (!authToken) {
        showTxToast("Session expired. Please log in again.", "danger");
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Delete Permanently";
            confirmBtn.style.opacity = "1";
        }
        window.isDeletingTx = false;
        return;
    }

    const tx = findTxById(txId);

    try {
        const res = await fetch(`${API}/commission/transactions/${encodeURIComponent(txId)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                recordId: tx?.recordId || txId,
                sourceType: tx?.sourceType || 'auto'
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            const errorMsg = data.error || data.message || `Failed to delete transaction (${res.status})`;
            showTxToast(errorMsg, "danger");
            // Keep modal open and re-enable button
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Delete Permanently";
                confirmBtn.style.opacity = "1";
            }
            return;
        }

        // Remove from local list
        window.allWalletTransactions = (window.allWalletTransactions || []).filter(t => String(t._id) !== String(txId));
        window.hiddenTxSet.delete(String(txId));
        accountDataCache.wallet = null;

        window.isDeletingTx = false;
        closeTxAdminDeleteModal();
        showTxToast("Transaction deleted successfully", "success");

        const cardEl = document.getElementById(`txCard_${txId}`);
        if (cardEl) {
            cardEl.classList.add('fade-out');
            setTimeout(() => {
                displayWalletHistory(window.allWalletTransactions);
            }, 350);
        } else {
            displayWalletHistory(window.allWalletTransactions);
        }
    } catch (err) {
        console.error("Error permanently deleting transaction:", err);
        showTxToast(err.message || "Failed to delete transaction. Please try again.", "danger");
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Delete Permanently";
            confirmBtn.style.opacity = "1";
        }
    } finally {
        window.isDeletingTx = false;
    }
}

function showTxToast(message, type = 'info') {
    const container = document.getElementById("txToastContainer");
    if (!container || !message) return;

    // Prevent duplicate stacking of identical active toast messages
    const existingToasts = container.querySelectorAll('.tx-toast');
    for (const existing of existingToasts) {
        if (existing.dataset.toastMsg === message && existing.classList.contains('show')) {
            return; // Already showing identical message
        }
    }

    const toast = document.createElement("div");
    toast.className = `tx-toast ${type}`;
    toast.dataset.toastMsg = message;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }, 3500);
}

/* -----------------------------------------
   RENDER WITHDRAWAL REQUESTS & PAYOUT STATUS (WITH PAGINATION)
----------------------------------------- */
let currentVipPage = 1;
const vipRowsPerPage = 5;

function renderWithdrawalHistory(withdrawals) {
    window.allVipWithdrawals = withdrawals || [];
    renderVipWithdrawalTable(window.allVipWithdrawals);
}

function renderVipWithdrawalTable(withdrawalsList) {
    const listEl = document.getElementById("withdrawalRequestsList");
    const tbody = document.getElementById('vipWithdrawalsTableBody');
    if (!listEl && !tbody) return;
    
    if (!withdrawalsList || withdrawalsList.length === 0) {
        if (listEl) listEl.innerHTML = "<p style='color: #a8a29e; font-size: 13px; margin: 0; padding: 10px 0;'>No withdrawal requests submitted yet.</p>";
        if (tbody) tbody.innerHTML = "<tr><td colspan='4' style='text-align: center; color: #888;'>No withdrawal requests found.</td></tr>";
        const pageIndicator = document.getElementById('vipPageIndicator');
        const prevBtn = document.getElementById('vipPrevPageBtn');
        const nextBtn = document.getElementById('vipNextPageBtn');
        if (pageIndicator) pageIndicator.innerText = "Page 1 of 1";
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const sorted = [...withdrawalsList].sort((a, b) => new Date(b.requestedAt || b.date || b.createdAt || 0) - new Date(a.requestedAt || a.date || a.createdAt || 0));

    const totalPages = Math.ceil(sorted.length / vipRowsPerPage) || 1;
    if (currentVipPage > totalPages) currentVipPage = totalPages;
    if (currentVipPage < 1) currentVipPage = 1;

    const start = (currentVipPage - 1) * vipRowsPerPage;
    const paginatedItems = sorted.slice(start, start + vipRowsPerPage);

    if (tbody) {
        tbody.innerHTML = paginatedItems.map(item => `
            <tr>
                <td>₹${Number(item.amount || 0).toFixed(2)}</td>
                <td>${escapeHtml(item.upiId || item.upi || (item.bank ? item.bankName + ' (' + item.bank.slice(-4) + ')' : 'Bank Transfer'))}</td>
                <td>${new Date(item.requestedAt || item.date || item.createdAt).toLocaleString()}</td>
                <td><span class="badge ${item.status}">${item.status}</span></td>
            </tr>
        `).join('');
    }

    if (listEl) {
        listEl.innerHTML = "";
        paginatedItems.forEach(w => {
            const dateStr = new Date(w.requestedAt || w.date || w.createdAt).toLocaleString();
            const isVip = (w.source === 'vip_master_card');
            const sourceLabel = isVip ? `👑 VIP Master Card (${escapeHtml(w.cardNumber || 'VIP Card')})` : `💼 Commission Wallet`;
            
            let destinationText = 'Destination not specified';
            if (w.upi || w.upiId) {
                destinationText = `📱 UPI: ${escapeHtml(w.upi || w.upiId)}`;
            } else if (w.bank) {
                const maskedAcc = w.bank.length > 4 ? 'XXXX' + w.bank.slice(-4) : w.bank;
                destinationText = `🏦 ${escapeHtml(w.bankName || 'Bank')}: ${escapeHtml(maskedAcc)} (IFSC: ${escapeHtml(w.ifsc || 'N/A')})`;
            }

            let statusHtml = '';
            let actionBtnHtml = '';
            if (w.status === 'approved') {
                statusHtml = `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">✅ Approved — Paid</span>`;
                actionBtnHtml = `<button type="button" onclick="cancelUserWithdrawal('${w._id || w.id}')" style="background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; padding: 2px 7px; font-size: 10px; cursor: pointer; transition: all 0.2s;">🗑️ Remove</button>`;
            } else if (w.status === 'rejected') {
                statusHtml = `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">❌ Rejected — Refunded</span>`;
                actionBtnHtml = `<button type="button" onclick="cancelUserWithdrawal('${w._id || w.id}')" style="background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; padding: 2px 7px; font-size: 10px; cursor: pointer; transition: all 0.2s;">🗑️ Remove</button>`;
            } else {
                statusHtml = `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">⏳ Pending Approval</span>`;
                actionBtnHtml = `<button type="button" onclick="cancelUserWithdrawal('${w._id || w.id}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-weight: 600; transition: all 0.2s;">❌ Cancel & Refund</button>`;
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
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                        ${statusHtml}
                        ${actionBtnHtml}
                    </div>
                </div>
            `;
            listEl.appendChild(div);
        });
    }

    // Update pagination indicators
    const pageIndicator = document.getElementById('vipPageIndicator');
    const prevBtn = document.getElementById('vipPrevPageBtn');
    const nextBtn = document.getElementById('vipNextPageBtn');

    if (pageIndicator) pageIndicator.innerText = `Page ${currentVipPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentVipPage === 1;
    if (nextBtn) nextBtn.disabled = currentVipPage >= totalPages;
}

async function cancelUserWithdrawal(withdrawId) {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!confirm("Are you sure you want to remove/cancel this withdrawal request?")) return;

    try {
        const res = await fetch(`${API}/commission/withdraw/cancel/${withdrawId}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const data = await res.json();
        if (res.ok) {
            showVipToast(data.message || "Withdrawal request removed", "success");
            accountDataCache.wallet = null;
            accountDataCache.profile = null;
            loadWalletData(true);
            loadProfile(true);
        } else {
            alert(data.error || "Failed to remove withdrawal request");
        }
    } catch (err) {
        console.error("Error cancelling withdrawal:", err);
        alert("Error removing withdrawal request");
    }
}
window.cancelUserWithdrawal = cancelUserWithdrawal;

// Event listeners for pagination buttons
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('vipPrevPageBtn')?.addEventListener('click', () => {
        if (currentVipPage > 1) {
            currentVipPage--;
            renderVipWithdrawalTable(window.allVipWithdrawals || []);
        }
    });

    document.getElementById('vipNextPageBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil((window.allVipWithdrawals || []).length / vipRowsPerPage) || 1;
        if (currentVipPage < totalPages) {
            currentVipPage++;
            renderVipWithdrawalTable(window.allVipWithdrawals || []);
        }
    });
});

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
    const savedContainer = document.getElementById("savedPaymentContainer") || document.getElementById("vipSavedBankSection");
    const formContainer = document.getElementById("paymentFormContainer") || document.getElementById("vipNewBankSection");
    const detailsTextEl = document.getElementById("savedPaymentDetailsText") || document.getElementById("vipMaskedBankInfo");

    // Reset attached QR state
    removeVipScannerFile();

    const isSetup = window.isBankDetailsSetup || (user.bankDetails && user.bankDetails.isSetup);
    const bankData = window.userBankDetails || user.bankDetails;

    if (isSetup && bankData && (bankData.accountNumber || bankData.upiId)) {
        if (savedContainer) savedContainer.style.display = "block";
        if (formContainer) formContainer.style.display = "none";

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
        if (detailsTextEl) detailsTextEl.innerHTML = detailsHtml || 'Saved payment account';
    } else {
        if (savedContainer) savedContainer.style.display = "none";
        if (formContainer) {
            formContainer.style.display = "block";
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

    // If bank details not setup or user clicked change payment details, validate and collect from form
    const formContainer = document.getElementById("paymentFormContainer") || document.getElementById("vipNewBankSection");
    const isFormVisible = formContainer && formContainer.style.display !== 'none';
    const isSetup = window.isBankDetailsSetup && !isFormVisible;

    if (isFormVisible || !isSetup) {
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
        if (currentAttachedQrData) {
            payload.qrCodeData = currentAttachedQrData;
            payload.scannerImage = currentAttachedQrData;
            payload.scannerImageUrl = currentAttachedQrData;
            payload.paymentProof = currentAttachedQrData;
        }
    }

    const submitBtn = document.getElementById("vipSubmitWithdrawBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Submitting...</span>`;
    }

    // If a scanner file is selected, upload to Cloudinary first
    if (selectedVipScannerFile) {
        if (submitBtn) submitBtn.innerHTML = `<span>📤 Uploading Scanner...</span>`;
        try {
            if (window.cloudinaryUpload && typeof window.cloudinaryUpload.uploadToCloudinary === 'function') {
                const uploadedUrl = await window.cloudinaryUpload.uploadToCloudinary(selectedVipScannerFile);
                if (uploadedUrl) {
                    payload.scannerImageUrl = uploadedUrl;
                    payload.scannerImage = uploadedUrl;
                    payload.qrCodeData = uploadedUrl;
                    payload.paymentProof = uploadedUrl;
                }
            }
        } catch (uploadErr) {
            console.warn("Cloudinary direct upload failed, continuing with fallback:", uploadErr);
        }
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
            removeVipScannerFile();
            closeVipWithdrawModal();
            showVipToast(`🎉 ${successMsg} Remaining Balance: ₹${remainingBal.toFixed(2)}`, 'success');
            alert(`✅ ${successMsg}\n\n• Amount Withdrawn: ₹${withdrawnAmount.toFixed(2)}\n• Remaining VIP Card Balance: ₹${remainingBal.toFixed(2)}\n• Card Number: ${data.cardNumber || currentVipWithdrawState.cardNumber}\n• Status: Pending Admin Approval`);

            // 4. Background re-sync
            accountDataCache.wallet = null;
            accountDataCache.profile = null;
            accountDataCache.vipCards = null;
            loadWalletData(true);
            loadProfile(true);
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

    if (typeof currentGeneralQrData !== 'undefined' && currentGeneralQrData) {
        payload.scannerImage = currentGeneralQrData;
        payload.scannerImageUrl = currentGeneralQrData;
        payload.qrCodeData = currentGeneralQrData;
        payload.paymentProof = currentGeneralQrData;
    }

    const submitBtn = document.getElementById("generalWithdrawSubmitBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Submitting...";
    }

    // If a scanner file is selected, upload to Cloudinary first
    if (selectedGeneralScannerFile) {
        if (submitBtn) submitBtn.textContent = "📤 Uploading Scanner...";
        try {
            if (window.cloudinaryUpload && typeof window.cloudinaryUpload.uploadToCloudinary === 'function') {
                const uploadedUrl = await window.cloudinaryUpload.uploadToCloudinary(selectedGeneralScannerFile);
                if (uploadedUrl) {
                    payload.scannerImageUrl = uploadedUrl;
                    payload.scannerImage = uploadedUrl;
                    payload.qrCodeData = uploadedUrl;
                    payload.paymentProof = uploadedUrl;
                }
            }
        } catch (uploadErr) {
            console.warn("Cloudinary direct upload failed, continuing with fallback:", uploadErr);
        }
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
            removeGeneralScannerFile();
            accountDataCache.wallet = null;
            accountDataCache.profile = null;
            loadWalletData(true); // Reload wallet data & history
            loadProfile(true);
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
        accountDataCache.points = null;
        accountDataCache.wallet = null;
        accountDataCache.profile = null;
        loadPoints(true); // Reload points display
        loadWalletData(true);
        loadProfile(true);

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
        accountDataCache.points = null;
        accountDataCache.profile = null;
        loadPoints(true); // Reload points display
        loadProfile(true);

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
        
        accountDataCache.wallet = null;
        accountDataCache.profile = null;
        // Reload withdrawal data to show withdrawal form
        loadWithdrawalData();
        loadWalletData(true);
        loadProfile(true);

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
        
        accountDataCache.wallet = null;
        accountDataCache.profile = null;
        // Reload withdrawal data
        loadWithdrawalData();
        loadWalletData(true);
        loadProfile(true);

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

async function decodeQrCodeImage(file, callback) {
    if (!file) return;
    try {
        await ensureJsQrLoaded();
    } catch (loadErr) {
        callback(new Error("QR Scanner library could not be loaded. Please check your network connection."));
        return;
    }
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

let selectedGeneralScannerFile = null;
let selectedVipScannerFile = null;
let currentGeneralQrData = '';
let currentAttachedQrData = '';

function handleGeneralScannerFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    selectedGeneralScannerFile = file;
    const previewContainer = document.getElementById("generalScannerPreviewContainer");
    const thumb = document.getElementById("generalScannerThumb");
    const nameEl = document.getElementById("generalScannerFileName");
    const statusEl = document.getElementById("generalQrScanStatus");

    if (nameEl) nameEl.textContent = file.name || 'Image selected';

    const reader = new FileReader();
    reader.onload = function(e) {
        currentGeneralQrData = e.target.result;
        if (thumb) thumb.src = e.target.result;
        if (previewContainer) previewContainer.style.display = "flex";
    };
    reader.readAsDataURL(file);

    if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#fbbf24";
        statusEl.innerHTML = `<span>⏳ Checking QR code...</span>`;
    }

    decodeQrCodeImage(file, (err, upiId, rawData) => {
        if (err || !upiId) {
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "#a8a29e";
                statusEl.innerHTML = `<span>📷 Scanner image ready for upload</span>`;
            }
            return;
        }

        const upiInput = document.getElementById("generalUpiId");
        if (upiInput && !upiInput.value) {
            upiInput.value = upiId;
            upiInput.style.borderColor = "#10b981";
        }

        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#10b981";
            statusEl.innerHTML = `<span>✅ Extracted UPI ID: <strong>${escapeHtml(upiId)}</strong></span>`;
        }
    });
}

function removeGeneralScannerFile() {
    selectedGeneralScannerFile = null;
    currentGeneralQrData = '';
    const fileInput = document.getElementById("generalScannerFileInput");
    if (fileInput) fileInput.value = "";
    const previewContainer = document.getElementById("generalScannerPreviewContainer");
    if (previewContainer) previewContainer.style.display = "none";
    const thumb = document.getElementById("generalScannerThumb");
    if (thumb) thumb.src = "";
    const statusEl = document.getElementById("generalQrScanStatus");
    if (statusEl) statusEl.style.display = "none";
}

function handleVipScannerFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    selectedVipScannerFile = file;
    const previewContainer = document.getElementById("vipScannerPreviewContainer");
    const thumb = document.getElementById("vipScannerThumb");
    const nameEl = document.getElementById("vipScannerFileName");
    const statusEl = document.getElementById("vipQrScanStatus");

    if (nameEl) nameEl.textContent = file.name || 'Image selected';

    const reader = new FileReader();
    reader.onload = function(e) {
        currentAttachedQrData = e.target.result;
        if (thumb) thumb.src = e.target.result;
        if (previewContainer) previewContainer.style.display = "flex";
    };
    reader.readAsDataURL(file);

    if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#fbbf24";
        statusEl.innerHTML = `<span>⏳ Checking QR code...</span>`;
    }

    decodeQrCodeImage(file, (err, upiId, rawData) => {
        if (err || !upiId) {
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "#a8a29e";
                statusEl.innerHTML = `<span>📷 Scanner image ready for upload</span>`;
            }
            return;
        }

        const upiInput = document.getElementById("vipUpiId");
        if (upiInput && !upiInput.value) {
            upiInput.value = upiId;
            upiInput.style.borderColor = "#10b981";
        }

        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#10b981";
            statusEl.innerHTML = `<span>✅ Extracted UPI ID: <strong>${escapeHtml(upiId)}</strong></span>`;
        }
    });
}

function removeVipScannerFile() {
    selectedVipScannerFile = null;
    currentAttachedQrData = '';
    const fileInput = document.getElementById("vipScannerFileInput");
    if (fileInput) fileInput.value = "";
    const previewContainer = document.getElementById("vipScannerPreviewContainer");
    if (previewContainer) previewContainer.style.display = "none";
    const thumb = document.getElementById("vipScannerThumb");
    if (thumb) thumb.src = "";
    const statusEl = document.getElementById("vipQrScanStatus");
    if (statusEl) statusEl.style.display = "none";
}

document.addEventListener('DOMContentLoaded', () => {
    // Toggle between saved view and edit form
    const changeBtn = document.getElementById('changePaymentBtn');
    if (changeBtn) {
        changeBtn.addEventListener('click', () => {
            const savedCont = document.getElementById('savedPaymentContainer') || document.getElementById('vipSavedBankSection');
            const formCont = document.getElementById('paymentFormContainer') || document.getElementById('vipNewBankSection');
            if (savedCont) savedCont.style.display = 'none';
            if (formCont) formCont.style.display = 'block';
        });
    }
});

window.extractUpiFromQrString = extractUpiFromQrString;
window.decodeQrCodeImage = decodeQrCodeImage;
window.handleGeneralScannerFileSelected = handleGeneralScannerFileSelected;
window.removeGeneralScannerFile = removeGeneralScannerFile;
window.handleVipScannerFileSelected = handleVipScannerFileSelected;
window.removeVipScannerFile = removeVipScannerFile;
window.handleVipQrUpload = handleVipScannerFileSelected;
window.handleGeneralQrUpload = handleGeneralScannerFileSelected;