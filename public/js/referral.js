// API_URL is already defined in config.js

document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadReferralDetails();
    loadWithdrawalSettings();
});

function checkAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!token || !user) {
        alert("Please login to view referral dashboard");
        window.location.href = "/login.html";
        return;
    }

    document.getElementById("userName").textContent = `Hello, ${user.name}`;

    if (user.role === "admin") {
        const adminLink = document.getElementById("adminLink");
        if (adminLink) adminLink.style.display = "block";
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/";
        });
    }

    updateCartCount();
}

async function loadWithdrawalSettings() {
    const token = localStorage.getItem("token");
    
    try {
        const res = await fetch(`${window.API_URL}/referral/withdrawal-settings`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (res.ok) {
            const data = await res.json();
            const minAmount = data.minimumWithdrawalAmount || 100;
            
            // Update UI elements
            document.getElementById("minWithdrawalAmount").textContent = minAmount;
            document.getElementById("withdrawAmount").min = minAmount;
            document.getElementById("withdrawAmount").placeholder = `Enter amount (minimum ₹${minAmount})`;
        }
    } catch (err) {
        console.error("Error loading withdrawal settings:", err);
        // Keep default values if loading fails
    }
}

function updateCartCount() {
    const cart = typeof getCart === 'function' ? getCart() : JSON.parse(localStorage.getItem("cart") || "[]");
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountEl = document.getElementById("cartCount");
    if (cartCountEl) cartCountEl.textContent = count;
}

let allReferrals = [];
let currentFilter = 'all';

async function loadReferralDetails() {
    const token = localStorage.getItem("token");

    try {
        const res = await fetch(`${window.API_URL}/referral/details`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (!res.ok) {
            throw new Error("Failed to load referral details");
        }

        const data = await res.json();

        // Update referral code
        document.getElementById("refCode").textContent = data.referralCode || "Not generated";
        
        // Update wallet balance with proper formatting
        const walletAmount = parseFloat(data.wallet || 0).toFixed(2);
        document.getElementById("wallet").textContent = walletAmount;

        // Update referral count
        const referralCount = data.referrals || 0;
        document.getElementById("referralCount").textContent = referralCount;

        // Generate referral link
        const link = `${window.location.origin}/signup.html?ref=${data.referralCode}`;
        document.getElementById("refLink").value = link;

        // Update tree level and children count
        document.getElementById("treeLevel").textContent = data.treePlacement?.treeLevel || 0;
        document.getElementById("treeChildrenCount").textContent = data.treePlacement?.treeChildrenCount || 0;

        // Update commission breakdown
        const commissionBreakdown = data.commissionBreakdown || {};
        document.getElementById("directCommission").textContent = parseFloat(commissionBreakdown.directCommission || 0).toFixed(2);
        document.getElementById("treeCommission").textContent = parseFloat(commissionBreakdown.treeCommission || 0).toFixed(2);
        document.getElementById("directPercentage").textContent = commissionBreakdown.directPercentage || 0;
        document.getElementById("treePercentage").textContent = commissionBreakdown.treePercentage || 0;

        // Update tree position info
        document.getElementById("userTreeLevel").textContent = data.treePlacement?.treeLevel || 0;
        document.getElementById("directTreeChildren").textContent = data.treePlacement?.treeChildrenCount || 0;
        
        if (data.treePlacement?.treeParent) {
            document.getElementById("treeParentInfo").textContent = 
                `${data.treePlacement.treeParent.name} (${data.treePlacement.treeParent.referralCode})`;
        } else {
            document.getElementById("treeParentInfo").textContent = "None (Root Level)";
        }

        // Load referrals
        loadReferrals(data);

    } catch (err) {
        console.error("Error loading referral details:", err);
        alert("Error loading referral details. Please try again.");
    }
}

function loadReferrals(data) {
    const loading = document.getElementById("referralsLoading");
    const content = document.getElementById("referralsContent");
    const noReferrals = document.getElementById("noReferrals");
    const tableBody = document.getElementById("referralsTableBody");

    loading.style.display = "none";
    content.style.display = "block";

    // Get direct referrals
    allReferrals = data.directReferrals?.users || [];

    if (allReferrals.length === 0) {
        noReferrals.style.display = "block";
        tableBody.parentElement.parentElement.style.display = "none";
        document.getElementById("countAll").textContent = "0";
        document.getElementById("countDirect").textContent = "0";
        document.getElementById("countSpillover").textContent = "0";
        return;
    }

    // Count placement types
    const directCount = allReferrals.filter(r => r.placementType === 'direct').length;
    const spilloverCount = allReferrals.filter(r => r.placementType === 'spillover').length;

    document.getElementById("countAll").textContent = allReferrals.length;
    document.getElementById("countDirect").textContent = directCount;
    document.getElementById("countSpillover").textContent = spilloverCount;

    // Display referrals
    displayReferrals();
}

function displayReferrals() {
    const tableBody = document.getElementById("referralsTableBody");
    tableBody.innerHTML = "";

    // Filter referrals based on current filter
    let filteredReferrals = allReferrals;
    if (currentFilter !== 'all') {
        filteredReferrals = allReferrals.filter(r => r.placementType === currentFilter);
    }

    filteredReferrals.forEach(ref => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid #f0f0f0";
        
        const placementColor = ref.placementType === 'direct' ? '#667eea' : '#f5576c';
        const placementText = ref.placementType === 'direct' ? 'Direct' : 'Spillover';
        const placementIcon = ref.placementType === 'direct' ? '⭐' : '🔄';
        
        const joinedDate = new Date(ref.joinedDate).toLocaleDateString();

        row.innerHTML = `
            <td style="padding: 12px; font-size: 14px; font-weight: 500;">${ref.name}</td>
            <td style="padding: 12px; font-size: 14px; color: #666;">${ref.email}</td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: #667eea; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                    L${ref.treeLevel}
                </span>
            </td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: ${placementColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                    ${placementIcon} ${placementText}
                </span>
            </td>
            <td style="padding: 12px; text-align: center; font-size: 13px; color: #666;">${joinedDate}</td>
        `;
        tableBody.appendChild(row);
    });
}

function filterReferrals(type) {
    currentFilter = type;
    
    // Update button states
    document.getElementById("filterAll").classList.remove("active");
    document.getElementById("filterDirect").classList.remove("active");
    document.getElementById("filterSpillover").classList.remove("active");
    
    if (type === 'all') {
        document.getElementById("filterAll").classList.add("active");
    } else if (type === 'direct') {
        document.getElementById("filterDirect").classList.add("active");
    } else if (type === 'spillover') {
        document.getElementById("filterSpillover").classList.add("active");
    }
    
    displayReferrals();
}

function copyLink() {
    const box = document.getElementById("refLink");
    box.select();
    box.setSelectionRange(0, 99999); // For mobile devices

    try {
        navigator.clipboard.writeText(box.value);
        alert("✅ Referral link copied to clipboard!");
    } catch (err) {
        // Fallback for older browsers
        document.execCommand("copy");
        alert("✅ Referral link copied!");
    }
}

async function requestWithdraw(event) {
    event.preventDefault();

    const token = localStorage.getItem("token");
    const msg = document.getElementById("withdrawMsg");

    const amount = Number(document.getElementById("withdrawAmount").value);
    const upi = document.getElementById("withdrawUpi").value.trim();
    const bankName = document.getElementById("withdrawBankName").value.trim();
    const bank = document.getElementById("withdrawBank").value.trim();
    const ifsc = document.getElementById("withdrawIfsc").value.trim();

    // Hide previous message
    msg.style.display = "none";
    msg.className = "message";

    // Get minimum withdrawal amount from UI
    const minAmount = parseInt(document.getElementById("withdrawAmount").min) || 100;
    
    // Validation
    if (!amount || amount < minAmount) {
        msg.textContent = `❌ Minimum withdrawal amount is ₹${minAmount}`;
        msg.className = "message error";
        msg.style.display = "block";
        return;
    }

    if (!upi && (!bank || !ifsc)) {
        msg.textContent = "❌ Provide either UPI ID or Bank Account + IFSC";
        msg.className = "message error";
        msg.style.display = "block";
        return;
    }

    if (bank && !bankName) {
        msg.textContent = "❌ Please enter bank name when providing bank account details";
        msg.className = "message error";
        msg.style.display = "block";
        return;
    }

    try {
        const res = await fetch(`${window.API_URL}/referral/withdraw`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ amount, upi, bankName, bank, ifsc })
        });

        const data = await res.json();

        if (!res.ok) {
            msg.textContent = "❌ " + (data.error || "Withdrawal failed");
            msg.className = "message error";
            msg.style.display = "block";
            return;
        }

        // Success
        msg.textContent = "✅ Withdrawal request submitted successfully! We'll process it within 2-3 business days.";
        msg.className = "message success";
        msg.style.display = "block";

        // Clear form
        document.getElementById("withdrawAmount").value = "";
        document.getElementById("withdrawUpi").value = "";
        document.getElementById("withdrawBankName").value = "";
        document.getElementById("withdrawBank").value = "";
        document.getElementById("withdrawIfsc").value = "";

        // Reload details to update wallet balance
        setTimeout(() => {
            loadReferralDetails();
        }, 1000);

    } catch (err) {
        console.error("Withdrawal error:", err);
        msg.textContent = "❌ Error submitting withdrawal request. Please try again.";
        msg.className = "message error";
        msg.style.display = "block";
    }
}

