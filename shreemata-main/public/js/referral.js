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
    // This function now calls the new secure withdrawal system
    loadWithdrawalData();
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

// Load withdrawal data and determine which section to show
async function loadWithdrawalData() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/referral/withdrawal-settings`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || "Failed to load withdrawal settings");
        }

        // Update wallet balance from API response (not localStorage)
        const currentBalance = parseFloat(data.walletBalance || 0);
        const walletBalance = document.getElementById("walletBalance");
        if (walletBalance) walletBalance.textContent = `₹${currentBalance}`;
        
        const minWithdrawal = document.getElementById("minWithdrawal");
        if (minWithdrawal) minWithdrawal.textContent = `₹${data.minimumWithdrawalAmount}`;
        
        // Update withdrawal information tile
        const minWithdrawalInfo = document.getElementById("minWithdrawalInfo");
        if (minWithdrawalInfo) minWithdrawalInfo.textContent = data.minimumWithdrawalAmount;
        
        // Update the withdrawal form input minimum value
        const withdrawalAmountInput = document.getElementById("withdrawalAmount");
        const withdrawalSubmitBtn = document.querySelector('#withdrawalForm button[type="submit"]');
        
        if (withdrawalAmountInput) {
            withdrawalAmountInput.min = data.minimumWithdrawalAmount;
            withdrawalAmountInput.max = currentBalance;
            
            if (currentBalance <= 0) {
                withdrawalAmountInput.placeholder = "No balance available for withdrawal";
                withdrawalAmountInput.disabled = true;
                if (withdrawalSubmitBtn) {
                    withdrawalSubmitBtn.disabled = true;
                    withdrawalSubmitBtn.textContent = "💰 No Balance Available";
                    withdrawalSubmitBtn.style.opacity = "0.6";
                    withdrawalSubmitBtn.style.cursor = "not-allowed";
                }
            } else if (currentBalance < data.minimumWithdrawalAmount) {
                withdrawalAmountInput.placeholder = `Minimum ₹${data.minimumWithdrawalAmount} required (Balance: ₹${currentBalance.toFixed(2)})`;
                withdrawalAmountInput.disabled = true;
                if (withdrawalSubmitBtn) {
                    withdrawalSubmitBtn.disabled = true;
                    withdrawalSubmitBtn.textContent = "💰 Insufficient Balance";
                    withdrawalSubmitBtn.style.opacity = "0.6";
                    withdrawalSubmitBtn.style.cursor = "not-allowed";
                }
            } else {
                withdrawalAmountInput.placeholder = `Enter amount to withdraw (min ₹${data.minimumWithdrawalAmount}, max ₹${currentBalance.toFixed(2)})`;
                withdrawalAmountInput.disabled = false;
                if (withdrawalSubmitBtn) {
                    withdrawalSubmitBtn.disabled = false;
                    withdrawalSubmitBtn.textContent = "💰 Submit Withdrawal Request";
                    withdrawalSubmitBtn.style.opacity = "1";
                    withdrawalSubmitBtn.style.cursor = "pointer";
                }
            }
        }

        if (data.bankDetailsSetup) {
            // Show withdrawal form section
            document.getElementById("bankSetupSection").style.display = "none";
            document.getElementById("withdrawalFormSection").style.display = "block";
            
            // Display masked bank details
            displayMaskedBankDetails(data.maskedBankDetails);
            
            // Update limits
            if (data.maskedBankDetails) {
                const dailyLimit = document.getElementById("dailyLimit");
                const monthlyLimit = document.getElementById("monthlyLimit");
                if (dailyLimit) dailyLimit.textContent = `₹${data.maskedBankDetails.dailyLimit}`;
                if (monthlyLimit) monthlyLimit.textContent = `₹${data.maskedBankDetails.monthlyLimit}`;
                
                // Update withdrawal information tile limits
                const dailyLimitInfo = document.getElementById("dailyLimitInfo");
                const monthlyLimitInfo = document.getElementById("monthlyLimitInfo");
                if (dailyLimitInfo) dailyLimitInfo.textContent = data.maskedBankDetails.dailyLimit;
                if (monthlyLimitInfo) monthlyLimitInfo.textContent = data.maskedBankDetails.monthlyLimit;
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
        showWithdrawMessage("Error loading withdrawal data: " + err.message, "error");
    }
}

// Display masked bank details
function displayMaskedBankDetails(bankDetails) {
    if (!bankDetails) return;
    
    let html = '<div style="display: grid; gap: 10px;">';
    
    if (bankDetails.accountNumber) {
        html += `<div><strong>🏦 Account:</strong> ${bankDetails.accountNumber}</div>`;
        html += `<div><strong>🏛️ Bank:</strong> ${bankDetails.bankName}</div>`;
        html += `<div><strong>🔢 IFSC:</strong> ${bankDetails.ifscCode}</div>`;
    }
    
    if (bankDetails.upiId) {
        html += `<div><strong>📱 UPI ID:</strong> ${bankDetails.upiId}</div>`;
    }
    
    html += `<div><strong>👤 Account Holder:</strong> ${bankDetails.accountHolderName}</div>`;
    html += `<div><strong>📅 Setup Date:</strong> ${new Date(bankDetails.setupDate).toLocaleDateString()}</div>`;
    html += '</div>';
    
    document.getElementById("maskedBankDetails").innerHTML = html;
}

// Setup bank details (one-time)
async function setupBankDetails(e) {
    e.preventDefault();
    
    const token = localStorage.getItem("token");
    if (!token) {
        showWithdrawMessage("Login required", "error");
        return;
    }

    const accountHolderName = document.getElementById("accountHolderName").value.trim();
    const accountNumber = document.getElementById("accountNumber").value.trim();
    const ifscCode = document.getElementById("ifscCode").value.trim();
    const bankName = document.getElementById("bankName").value.trim();
    const upiId = document.getElementById("upiId").value.trim();

    // Validation
    if (!accountHolderName) {
        showWithdrawMessage("Account holder name is required", "error");
        return;
    }

    if (!upiId && (!accountNumber || !ifscCode || !bankName)) {
        showWithdrawMessage("Please provide either UPI ID or complete bank details (Account Number, IFSC, Bank Name)", "error");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Setting up...";

    try {
        const res = await fetch(`${window.API_URL}/referral/setup-bank-details`, {
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
        alert("✅ Bank Details Setup Successful!\n\n🔒 Your bank details are now securely saved and locked for your protection.\n\n💰 You can now make withdrawal requests using only the amount.\n\n📧 A confirmation email has been sent to you.");
        
        // Reload withdrawal data to show withdrawal form
        loadWithdrawalData();

    } catch (err) {
        console.error("Bank setup error:", err);
        showWithdrawMessage("Error: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "🔒 Setup Bank Details (One-Time Only)";
    }
}

// Submit withdrawal request
async function submitWithdrawal(e) {
    e.preventDefault();
    
    const token = localStorage.getItem("token");
    if (!token) {
        showWithdrawMessage("Login required", "error");
        return;
    }

    const amount = parseFloat(document.getElementById("withdrawalAmount").value);
    
    // Get the actual minimum withdrawal amount from the loaded settings
    const minWithdrawalElement = document.getElementById("minWithdrawalInfo");
    const minWithdrawalAmount = minWithdrawalElement ? parseFloat(minWithdrawalElement.textContent) : 100;
    
    // Get user's current wallet balance from API (not localStorage)
    let availableBalance = 0;
    try {
        const balanceRes = await fetch(`${window.API_URL}/referral/withdrawal-settings`, {
            headers: { "Authorization": "Bearer " + token }
        });
        const balanceData = await balanceRes.json();
        availableBalance = parseFloat(balanceData.walletBalance || 0);
        console.log('Current wallet balance from API:', availableBalance);
    } catch (error) {
        console.error('Error fetching current balance:', error);
        showWithdrawMessage("Error checking balance. Please try again.", "error");
        return;
    }
    
    if (!amount || amount <= 0) {
        showWithdrawMessage("Please enter a valid withdrawal amount", "error");
        return;
    }
    
    if (availableBalance <= 0) {
        showWithdrawMessage("You don't have any balance available for withdrawal", "error");
        return;
    }
    
    if (amount < minWithdrawalAmount) {
        showWithdrawMessage(`Minimum withdrawal amount is ₹${minWithdrawalAmount}`, "error");
        return;
    }
    
    if (amount > availableBalance) {
        showWithdrawMessage(`Insufficient balance. Your available balance is ₹${availableBalance.toFixed(2)}`, "error");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    try {
        const res = await fetch(`${window.API_URL}/referral/withdraw`, {
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
        alert(`✅ Withdrawal Request Submitted!\n\nAmount: ₹${amount}\nStatus: Pending Admin Approval\n\n📧 You will receive an email confirmation shortly.\n⏱️ Processing time: 2-3 business days`);
        
        // Clear form and reload data
        document.getElementById("withdrawalAmount").value = "";
        
        // Update wallet balance in localStorage
        const updatedUser = JSON.parse(localStorage.getItem("user") || "{}");
        updatedUser.wallet = data.remainingBalance;
        localStorage.setItem("user", JSON.stringify(updatedUser));
        
        // Reload withdrawal data and referral details
        loadWithdrawalData();
        loadReferralDetails();

    } catch (err) {
        console.error("Withdrawal error:", err);
        showWithdrawMessage("Error: " + err.message, "error");
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
        const res = await fetch(`${window.API_URL}/users/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (res.ok && data.user && data.user.withdrawals) {
            const withdrawals = data.user.withdrawals.slice(-5).reverse(); // Last 5 withdrawals
            
            const historyList = document.getElementById("withdrawalHistoryList");
            
            if (withdrawals.length === 0) {
                historyList.innerHTML = '<div style="text-align: center; padding: 30px; color: #666; background: #f8f9fa; border-radius: 12px;"><p style="margin: 0; font-size: 16px;">📋 No withdrawal history yet</p><p style="margin: 5px 0 0 0; font-size: 14px;">Your withdrawal requests will appear here</p></div>';
                return;
            }
            
            historyList.innerHTML = withdrawals.map(w => {
                const statusColor = w.status === 'approved' ? '#28a745' : 
                                  w.status === 'pending' ? '#ffc107' : '#dc3545';
                const statusIcon = w.status === 'approved' ? '✅' : 
                                 w.status === 'pending' ? '⏳' : '❌';
                
                return `
                    <div style="border: 2px solid #e9ecef; padding: 20px; border-radius: 12px; margin-bottom: 15px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: bold; font-size: 20px; color: #333;">₹${w.amount}</div>
                                <div style="font-size: 13px; color: #666; margin-top: 5px;">📅 ${new Date(w.requestedAt || w.date).toLocaleDateString()}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: ${statusColor}; font-weight: bold; text-transform: capitalize; font-size: 16px;">
                                    ${statusIcon} ${w.status}
                                </div>
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

// Show withdrawal message
function showWithdrawMessage(message, type = "info") {
    const msg = document.getElementById("withdrawMsg");
    if (!msg) return;
    
    msg.textContent = message;
    msg.className = `message ${type}`;
    msg.style.display = "block";
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        msg.style.display = "none";
    }, 5000);
}

// Legacy function for backward compatibility (will be removed)
async function requestWithdraw(event) {
    event.preventDefault();
    showWithdrawMessage("⚠️ Please use the new secure withdrawal system above", "error");
}

// Add event listeners for withdrawal forms
document.addEventListener("DOMContentLoaded", () => {
    // Bank details form
    const bankDetailsForm = document.getElementById("bankDetailsForm");
    if (bankDetailsForm) {
        bankDetailsForm.addEventListener("submit", setupBankDetails);
    }
    
    // Withdrawal form
    const withdrawalForm = document.getElementById("withdrawalForm");
    if (withdrawalForm) {
        withdrawalForm.addEventListener("submit", submitWithdrawal);
    }
});

// Bank Change Request Functions
function openBankChangePopup() {
    // First check if there's already a pending request
    checkBankChangeStatus();
    document.getElementById("bankChangeModal").style.display = "flex";
}

function closeBankChangePopup() {
    document.getElementById("bankChangeModal").style.display = "none";
    document.getElementById("bankChangePopupForm").reset();
}

async function checkBankChangeStatus() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/referral/bank-change-status`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        const statusDiv = document.getElementById("bankChangeStatusDisplay");
        const statusContent = document.getElementById("bankChangeStatusContent");

        if (data.hasRequest) {
            statusDiv.style.display = "block";
            
            if (data.status === 'pending') {
                statusContent.innerHTML = `
                    <div style="color: #856404;">
                        <p style="margin: 0 0 10px 0;"><strong>Status:</strong> ⏳ Waiting for admin approval</p>
                        <p style="margin: 0 0 10px 0;"><strong>Submitted:</strong> ${data.requestedAt ? new Date(data.requestedAt).toLocaleString() : 'Recently'}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Reason:</strong> ${data.reason || 'Not specified'}</p>
                        <p style="margin: 0; font-size: 14px; font-style: italic;">You cannot submit another request while one is pending.</p>
                    </div>
                `;
                
                // Disable the request button
                const requestBtn = document.querySelector('button[onclick="openBankChangePopup()"]');
                if (requestBtn) {
                    requestBtn.disabled = true;
                    requestBtn.textContent = "⏳ Request Pending";
                    requestBtn.style.opacity = "0.6";
                    requestBtn.style.cursor = "not-allowed";
                }
                
                // Close popup if open
                closeBankChangePopup();
                return;
                
            } else if (data.status === 'approved') {
                statusContent.innerHTML = `
                    <div style="color: #155724;">
                        <p style="margin: 0 0 10px 0;"><strong>Status:</strong> ✅ Request Approved</p>
                        <p style="margin: 0 0 10px 0;"><strong>Approved:</strong> ${new Date(data.processedAt).toLocaleString()}</p>
                        ${data.adminNotes ? `<p style="margin: 0 0 10px 0;"><strong>Admin Notes:</strong> ${data.adminNotes}</p>` : ''}
                        <p style="margin: 0; font-size: 14px;">Your bank details have been updated successfully.</p>
                    </div>
                `;
            } else if (data.status === 'rejected') {
                statusContent.innerHTML = `
                    <div style="color: #721c24;">
                        <p style="margin: 0 0 10px 0;"><strong>Status:</strong> ❌ Request Rejected</p>
                        <p style="margin: 0 0 10px 0;"><strong>Rejected:</strong> ${new Date(data.processedAt).toLocaleString()}</p>
                        ${data.adminNotes ? `<p style="margin: 0 0 10px 0;"><strong>Reason:</strong> ${data.adminNotes}</p>` : ''}
                        <p style="margin: 0; font-size: 14px;">You can submit a new request if needed.</p>
                    </div>
                `;
            }
        } else {
            statusDiv.style.display = "none";
        }

    } catch (err) {
        console.error("Error checking bank change status:", err);
    }
}

async function submitBankChangeRequestPopup(e) {
    e.preventDefault();
    
    console.log('🔄 Popup: Bank change form submitted');
    
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Login required");
        return;
    }

    const accountHolderName = document.getElementById("popupAccountHolderName").value.trim();
    const accountNumber = document.getElementById("popupAccountNumber").value.trim();
    const ifscCode = document.getElementById("popupIfscCode").value.trim();
    const bankName = document.getElementById("popupBankName").value.trim();
    const upiId = document.getElementById("popupUpiId").value.trim();
    const reason = document.getElementById("popupChangeReason").value.trim();

    console.log('🔄 Popup: Form data:', { accountHolderName, accountNumber, ifscCode, bankName, upiId, reason });

    // Validation
    if (!accountHolderName) {
        alert("Account holder name is required");
        return;
    }

    if (!reason || reason.length < 10) {
        alert("Please provide a detailed reason for the change (minimum 10 characters)");
        return;
    }

    if (!upiId && (!accountNumber || !ifscCode || !bankName)) {
        alert("Please provide either UPI ID or complete bank details (Account Number, IFSC, Bank Name)");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
        console.log('🔄 Popup: Sending request...');
        
        const res = await fetch(`${window.API_URL}/referral/request-bank-change`, {
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
                upiId: upiId || null,
                reason
            })
        });

        console.log('🔄 Popup: Response status:', res.status);
        const data = await res.json();
        console.log('🔄 Popup: Response data:', data);

        if (!res.ok) {
            throw new Error(data.error || "Failed to submit bank change request");
        }

        // Show success message
        alert(`✅ Bank Change Request Submitted Successfully!\n\n📋 Your request has been sent to admin for approval.\n⏱️ Processing time: 2-3 business days\n📧 You will receive email updates about your request status.`);
        
        // Close popup and refresh status
        closeBankChangePopup();
        checkBankChangeStatus();
        
        // Refresh the page data
        setTimeout(() => {
            loadWithdrawalData();
        }, 1000);

    } catch (err) {
        console.error("❌ Popup: Bank change request error:", err);
        alert("Error: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "📤 Submit Request";
    }
}

// Add event listener for bank change form
document.addEventListener("DOMContentLoaded", () => {
    // Bank change popup form
    const bankChangePopupForm = document.getElementById("bankChangePopupForm");
    if (bankChangePopupForm) {
        bankChangePopupForm.addEventListener("submit", submitBankChangeRequestPopup);
    }
    
    // Check bank change status on page load
    checkBankChangeStatus();
});