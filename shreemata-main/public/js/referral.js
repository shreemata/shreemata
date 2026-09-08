/**
 * SHREE MATA — PREMIUM REFERRAL & REWARDS CONTROLLER
 * Handles Referral Details, Referral Sharing, Tree Metrics,
 * Lazy-loaded Referrals Table, Secure Withdrawals, and Modals.
 */

// Global State & Cache
let cachedReferralDetails = null;
let allReferrals = [];
let currentReferralFilter = 'all';
let isWithdrawalDataLoaded = false;
let isWithdrawalHistoryLoaded = false;
let hasCheckedBankChangeStatus = false;

document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadReferralDetails();
    initModalsAndEvents();
});

// ── 1. AUTHENTICATION & HEADER SYNC ──
function checkAuth() {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;

    if (!token || !user) {
        showToast("Please log in to view your referral dashboard", "info");
        setTimeout(() => {
            window.location.href = "/login.html";
        }, 800);
        return;
    }

    const userName = document.getElementById("userName");
    if (userName) userName.textContent = user.name || "Account";

    const sidebarUserName = document.getElementById("sidebarUserName");
    if (sidebarUserName) sidebarUserName.textContent = user.name || "User";

    const dropdownUserName = document.getElementById("dropdownUserName");
    if (dropdownUserName) dropdownUserName.textContent = user.name || "User";

    if (user.role === "admin") {
        const adminLink = document.getElementById("adminLink");
        if (adminLink) adminLink.style.display = "flex";
        const drawerAdminLink = document.getElementById("drawerAdminLink");
        if (drawerAdminLink) drawerAdminLink.style.display = "flex";
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
    const drawerLogoutBtn = document.getElementById("drawerLogoutBtn");
    if (drawerLogoutBtn) {
        drawerLogoutBtn.addEventListener("click", handleLogout);
    }

    updateCartCount();
}

function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
}

function updateCartCount() {
    try {
        const cart = typeof getCart === 'function' ? getCart() : JSON.parse(localStorage.getItem("cart") || "[]");
        const count = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
        const cartCountEl = document.getElementById("cartCount");
        if (cartCountEl) cartCountEl.textContent = count;
    } catch (e) {
        console.warn("Could not update cart count:", e);
    }
}

// ── 2. LOAD REFERRAL DETAILS (CORE OVERVIEW) ──
async function loadReferralDetails() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/referral/details`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (!res.ok) {
            if (res.status === 401) {
                showToast("Your session has expired. Please sign in again.", "error");
                return;
            }
            throw new Error("Unable to load your referral information.");
        }

        const data = await res.json();
        cachedReferralDetails = data;

        // Populate Referral Code
        const refCodeEl = document.getElementById("refCode");
        if (refCodeEl) {
            refCodeEl.textContent = data.referralCode || "Not Generated";
        }

        // Populate Production-Aware Referral Link (strictly clean domain without localhost in prod)
        const refLinkEl = document.getElementById("refLink");
        if (refLinkEl) {
            const origin = window.location.origin;
            refLinkEl.value = `${origin}/signup.html?ref=${data.referralCode || ''}`;
        }

        // Populate Available Balance
        const walletEl = document.getElementById("wallet");
        if (walletEl) {
            const walletAmount = parseFloat(data.wallet || 0).toFixed(2);
            walletEl.textContent = walletAmount;
        }

        // Populate Total Referrals
        const refCountEl = document.getElementById("referralCount");
        if (refCountEl) {
            refCountEl.textContent = data.referrals || 0;
        }

        // Populate Tree Level & Children Count
        const treeLevelEl = document.getElementById("treeLevel");
        if (treeLevelEl) {
            treeLevelEl.textContent = data.treePlacement?.treeLevel || 0;
        }

        const treeChildrenCountEl = document.getElementById("treeChildrenCount");
        if (treeChildrenCountEl) {
            treeChildrenCountEl.textContent = data.treePlacement?.treeChildrenCount || 0;
        }

        // Populate Commission Breakdown
        const commissionBreakdown = data.commissionBreakdown || {};
        const directCommEl = document.getElementById("directCommission");
        if (directCommEl) {
            directCommEl.textContent = parseFloat(commissionBreakdown.directCommission || 0).toFixed(2);
        }

        const treeCommEl = document.getElementById("treeCommission");
        if (treeCommEl) {
            treeCommEl.textContent = parseFloat(commissionBreakdown.treeCommission || 0).toFixed(2);
        }

        const directPctEl = document.getElementById("directPercentage");
        if (directPctEl) {
            directPctEl.textContent = commissionBreakdown.directPercentage || 0;
        }

        const treePctEl = document.getElementById("treePercentage");
        if (treePctEl) {
            treePctEl.textContent = commissionBreakdown.treePercentage || 0;
        }

        // Populate Tree Position Info
        const userTreeLevelEl = document.getElementById("userTreeLevel");
        if (userTreeLevelEl) {
            userTreeLevelEl.textContent = data.treePlacement?.treeLevel || 0;
        }

        const directTreeChildrenEl = document.getElementById("directTreeChildren");
        if (directTreeChildrenEl) {
            directTreeChildrenEl.textContent = data.treePlacement?.treeChildrenCount || 0;
        }

        const treeParentInfoEl = document.getElementById("treeParentInfo");
        if (treeParentInfoEl) {
            if (data.treePlacement?.treeParent) {
                treeParentInfoEl.textContent = `${data.treePlacement.treeParent.name} (${data.treePlacement.treeParent.referralCode})`;
            } else {
                treeParentInfoEl.textContent = "None (Root Level)";
            }
        }

        // Populate referrals list from cached data
        loadReferrals(data);

    } catch (err) {
        console.error("Error loading referral details:", err);
        showToast("Unable to load referral information. Please refresh.", "error");
    }
}

// ── 3. REFERRALS LIST & FILTERING ──
function loadReferrals(data) {
    const loading = document.getElementById("referralsLoading");
    const content = document.getElementById("referralsContent");
    const noReferrals = document.getElementById("noReferrals");
    const tableBody = document.getElementById("referralsTableBody");

    if (loading) loading.style.display = "none";
    if (content) content.style.display = "block";

    // Direct referrals from API
    allReferrals = data?.directReferrals?.users || [];

    const countAllEl = document.getElementById("countAll");
    const countDirectEl = document.getElementById("countDirect");
    const countSpilloverEl = document.getElementById("countSpillover");

    if (allReferrals.length === 0) {
        if (noReferrals) noReferrals.style.display = "block";
        if (tableBody && tableBody.parentElement) {
            tableBody.parentElement.style.display = "none";
        }
        if (countAllEl) countAllEl.textContent = "0";
        if (countDirectEl) countDirectEl.textContent = "0";
        if (countSpilloverEl) countSpilloverEl.textContent = "0";
        return;
    }

    if (noReferrals) noReferrals.style.display = "none";
    if (tableBody && tableBody.parentElement) {
        tableBody.parentElement.style.display = "table";
    }

    const directCount = allReferrals.filter(r => r.placementType === 'direct').length;
    const spilloverCount = allReferrals.filter(r => r.placementType === 'spillover').length;

    if (countAllEl) countAllEl.textContent = allReferrals.length;
    if (countDirectEl) countDirectEl.textContent = directCount;
    if (countSpilloverEl) countSpilloverEl.textContent = spilloverCount;

    displayReferrals();
}

function displayReferrals() {
    const tableBody = document.getElementById("referralsTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    let filtered = allReferrals;
    if (currentReferralFilter !== 'all') {
        filtered = allReferrals.filter(r => r.placementType === currentReferralFilter);
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 24px; color: var(--sm-muted);">
                    No ${currentReferralFilter} referrals found.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(ref => {
        const row = document.createElement("tr");
        const isDirect = ref.placementType === 'direct';
        const placementBadgeClass = isDirect ? 'badge-placement direct' : 'badge-placement spillover';
        const placementIcon = isDirect ? '⭐' : '🔄';
        const placementText = isDirect ? 'Direct' : 'Spillover';
        const joinedDate = ref.joinedDate ? new Date(ref.joinedDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }) : '—';

        row.innerHTML = `
            <td style="font-weight: 600; color: var(--sm-ink);">${escapeHtml(ref.name || 'User')}</td>
            <td style="color: var(--sm-muted); font-size: 13.5px;">${escapeHtml(ref.email || '—')}</td>
            <td style="text-align: center;">
                <span class="badge-level">L${ref.treeLevel ?? 1}</span>
            </td>
            <td style="text-align: center;">
                <span class="${placementBadgeClass}">
                    ${placementIcon} ${placementText}
                </span>
            </td>
            <td style="text-align: center; font-size: 13px; color: var(--sm-muted);">${joinedDate}</td>
        `;
        tableBody.appendChild(row);
    });
}

function filterReferrals(type) {
    currentReferralFilter = type;

    const filterAll = document.getElementById("filterAll");
    const filterDirect = document.getElementById("filterDirect");
    const filterSpillover = document.getElementById("filterSpillover");

    if (filterAll) filterAll.classList.remove("active");
    if (filterDirect) filterDirect.classList.remove("active");
    if (filterSpillover) filterSpillover.classList.remove("active");

    if (type === 'all' && filterAll) filterAll.classList.add("active");
    else if (type === 'direct' && filterDirect) filterDirect.classList.add("active");
    else if (type === 'spillover' && filterSpillover) filterSpillover.classList.add("active");

    displayReferrals();
}
window.filterReferrals = filterReferrals;

// ── 4. COPY & SHARE INTERACTIONS ──
function copyCode() {
    const refCodeEl = document.getElementById("refCode");
    const code = refCodeEl ? refCodeEl.textContent.trim() : "";

    if (!code || code === "LOADING..." || code === "Not Generated") {
        showToast("Referral code not available yet", "error");
        return;
    }

    const copyBtn = document.getElementById("copyCodeBtn");

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(() => {
            showCopySuccess(copyBtn, "✓ Copied", "Referral code copied to clipboard!");
        }).catch(() => {
            fallbackCopy(code, copyBtn, "✓ Copied", "Referral code copied!");
        });
    } else {
        fallbackCopy(code, copyBtn, "✓ Copied", "Referral code copied!");
    }
}
window.copyCode = copyCode;

function copyLink() {
    const refLinkInput = document.getElementById("refLink");
    const link = refLinkInput ? refLinkInput.value.trim() : "";

    if (!link) {
        showToast("Referral link not available yet", "error");
        return;
    }

    const copyBtn = document.getElementById("copyLinkBtn");

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(link).then(() => {
            showCopySuccess(copyBtn, "✓ Link Copied", "Referral link copied to clipboard!");
        }).catch(() => {
            fallbackCopy(link, copyBtn, "✓ Link Copied", "Referral link copied!");
        });
    } else {
        fallbackCopy(link, copyBtn, "✓ Link Copied", "Referral link copied!");
    }
}
window.copyLink = copyLink;

function fallbackCopy(text, btnEl, successText, toastMsg) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showCopySuccess(btnEl, successText, toastMsg);
    } catch (e) {
        console.error("Copy failed:", e);
        showToast("Could not copy automatically. Please copy manually.", "error");
    }
}

function showCopySuccess(btnEl, successText, toastMsg) {
    if (btnEl) {
        const originalHTML = btnEl.innerHTML;
        btnEl.classList.add("copied");
        btnEl.innerHTML = `<span>${successText}</span>`;
        setTimeout(() => {
            btnEl.classList.remove("copied");
            btnEl.innerHTML = originalHTML;
        }, 2200);
    }
    showToast(toastMsg, "success");
}

function shareViaWhatsApp(event) {
    if (event) event.preventDefault();
    const link = document.getElementById("refLink")?.value || "";
    const code = document.getElementById("refCode")?.textContent || "";
    const text = encodeURIComponent(
        `📚 Join Shree Mata with my referral code: *${code}* to get authentic textbooks, combo bundles, and exclusive rewards!\n\nSign up here: ${link}`
    );
    const whatsappUrl = `https://api.whatsapp.com/send?text=${text}`;
    window.open(whatsappUrl, '_blank');
}
window.shareViaWhatsApp = shareViaWhatsApp;

function shareViaWebAPI() {
    const link = document.getElementById("refLink")?.value || "";
    const code = document.getElementById("refCode")?.textContent || "";

    if (navigator.share) {
        navigator.share({
            title: "Join Shree Mata - Educational Textbooks & Rewards",
            text: `Join Shree Mata using referral code ${code} for authentic Karnataka state syllabus and CBSE curriculum books!`,
            url: link
        }).catch(err => {
            if (err.name !== 'AbortError') {
                copyLink();
            }
        });
    } else {
        copyLink();
    }
}
window.shareViaWebAPI = shareViaWebAPI;

// ── 5. SECTION SWITCHING (SIDEBAR & MOBILE TABS) ──
function switchReferralSection(sectionId, btnEl) {
    // Update active state on sidebar
    document.querySelectorAll(".referral-menu button").forEach(btn => btn.classList.remove("active"));
    // Update active state on mobile tabs
    document.querySelectorAll(".referral-tab-btn").forEach(btn => btn.classList.remove("active"));

    if (btnEl) {
        btnEl.classList.add("active");
    }

    // Sync corresponding button
    const sectionMap = {
        'overview': { sidebarIdx: 0, targetId: 'sectionCode' },
        'code': { sidebarIdx: 1, targetId: 'sectionCode' },
        'network': { sidebarIdx: 2, targetId: 'sectionNetwork' },
        'commission': { sidebarIdx: 3, targetId: 'sectionCommission' },
        'referrals': { sidebarIdx: 4, targetId: 'sectionReferrals' },
        'withdrawals': { sidebarIdx: 5, targetId: 'sectionWithdrawals' }
    };

    const target = sectionMap[sectionId];
    if (target) {
        const sidebarButtons = document.querySelectorAll(".referral-menu button");
        if (sidebarButtons[target.sidebarIdx]) {
            sidebarButtons[target.sidebarIdx].classList.add("active");
        }

        const targetEl = document.getElementById(target.targetId);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Lazy load withdrawals if needed
    if (sectionId === 'withdrawals' && !isWithdrawalDataLoaded) {
        loadWithdrawalData();
    }
}
window.switchReferralSection = switchReferralSection;

// ── 6. SECURE WITHDRAWAL SYSTEM ──
async function loadWithdrawalData() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/referral/withdrawal-settings`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (!res.ok) {
            throw new Error("Failed to load withdrawal settings");
        }

        const data = await res.json();
        isWithdrawalDataLoaded = true;

        // Update balance from API response
        const currentBalance = parseFloat(data.walletBalance || 0);
        const walletBalance = document.getElementById("walletBalance");
        if (walletBalance) walletBalance.textContent = `₹${currentBalance.toFixed(2)}`;

        const minWithdrawal = document.getElementById("minWithdrawal");
        if (minWithdrawal) minWithdrawal.textContent = `₹${data.minimumWithdrawalAmount}`;

        const minWithdrawalInfo = document.getElementById("minWithdrawalInfo");
        if (minWithdrawalInfo) minWithdrawalInfo.textContent = data.minimumWithdrawalAmount;

        // Configure withdrawal amount input
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
                }
            } else if (currentBalance < data.minimumWithdrawalAmount) {
                withdrawalAmountInput.placeholder = `Minimum ₹${data.minimumWithdrawalAmount} required (Balance: ₹${currentBalance.toFixed(2)})`;
                withdrawalAmountInput.disabled = true;
                if (withdrawalSubmitBtn) {
                    withdrawalSubmitBtn.disabled = true;
                    withdrawalSubmitBtn.textContent = "💰 Insufficient Balance";
                }
            } else {
                withdrawalAmountInput.placeholder = `Enter amount (min ₹${data.minimumWithdrawalAmount}, max ₹${currentBalance.toFixed(2)})`;
                withdrawalAmountInput.disabled = false;
                if (withdrawalSubmitBtn) {
                    withdrawalSubmitBtn.disabled = false;
                    withdrawalSubmitBtn.textContent = "💰 Submit Withdrawal Request";
                }
            }
        }

        if (data.bankDetailsSetup) {
            document.getElementById("bankSetupSection").style.display = "none";
            document.getElementById("withdrawalFormSection").style.display = "block";

            displayMaskedBankDetails(data.maskedBankDetails);

            if (data.maskedBankDetails) {
                const dailyLimit = document.getElementById("dailyLimit");
                const monthlyLimit = document.getElementById("monthlyLimit");
                if (dailyLimit) dailyLimit.textContent = `₹${data.maskedBankDetails.dailyLimit || 5000}`;
                if (monthlyLimit) monthlyLimit.textContent = `₹${data.maskedBankDetails.monthlyLimit || 50000}`;

                const dailyLimitInfo = document.getElementById("dailyLimitInfo");
                const monthlyLimitInfo = document.getElementById("monthlyLimitInfo");
                if (dailyLimitInfo) dailyLimitInfo.textContent = data.maskedBankDetails.dailyLimit || 5000;
                if (monthlyLimitInfo) monthlyLimitInfo.textContent = data.maskedBankDetails.monthlyLimit || 50000;
            }

            if (!isWithdrawalHistoryLoaded) {
                loadWithdrawalHistory();
            }
        } else {
            document.getElementById("bankSetupSection").style.display = "block";
            document.getElementById("withdrawalFormSection").style.display = "none";
        }

    } catch (err) {
        console.error("Error loading withdrawal data:", err);
        showWithdrawMessage("Unable to load withdrawal information: " + err.message, "error");
    }
}
window.loadWithdrawalData = loadWithdrawalData;

function switchWithdrawalMode(mode) {
    const savedBtn = document.getElementById("useSavedModeBtn");
    const diffBtn = document.getElementById("enterDifferentModeBtn");
    const savedPanel = document.getElementById("useSavedDetailsPanel");
    const diffPanel = document.getElementById("enterDifferentDetailsPanel");

    if (mode === 'different') {
        if (savedBtn) savedBtn.classList.remove("active");
        if (diffBtn) diffBtn.classList.add("active");
        if (savedPanel) savedPanel.style.display = "none";
        if (diffPanel) diffPanel.style.display = "block";

        const diffForm = document.getElementById("differentBankDetailsForm");
        if (diffForm) diffForm.reset();
    } else {
        if (savedBtn) savedBtn.classList.add("active");
        if (diffBtn) diffBtn.classList.remove("active");
        if (savedPanel) savedPanel.style.display = "block";
        if (diffPanel) diffPanel.style.display = "none";
    }
}
window.switchWithdrawalMode = switchWithdrawalMode;

function displayMaskedBankDetails(bankDetails) {
    if (!bankDetails) return;

    let html = '<div style="display: grid; gap: 6px;">';

    if (bankDetails.accountNumber) {
        const bankNameText = bankDetails.bankName ? ` (${bankDetails.bankName})` : '';
        html += `<div><strong>🏦 Account:</strong> ${escapeHtml(bankDetails.accountNumber)}${escapeHtml(bankNameText)}</div>`;
        if (bankDetails.ifscCode) {
            html += `<div><strong>🔢 IFSC Code:</strong> ${escapeHtml(bankDetails.ifscCode)}</div>`;
        }
    }

    if (bankDetails.upiId) {
        html += `<div><strong>📱 UPI ID:</strong> ${escapeHtml(bankDetails.upiId)}</div>`;
    }

    if (bankDetails.accountHolderName) {
        html += `<div><strong>👤 Holder:</strong> ${escapeHtml(bankDetails.accountHolderName)}</div>`;
    }

    if (bankDetails.setupDate) {
        html += `<div style="font-size: 12px; color: var(--sm-muted);"><strong>📅 Saved on:</strong> ${new Date(bankDetails.setupDate).toLocaleDateString()}</div>`;
    }
    html += '</div>';

    const container = document.getElementById("maskedBankDetails");
    if (container) container.innerHTML = html;
}

async function setupBankDetails(e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
        showToast("Please login to save payment details", "error");
        return;
    }

    const isDiffForm = e.target && e.target.id === "differentBankDetailsForm";

    const accountHolderName = (document.getElementById(isDiffForm ? "diffAccountHolderName" : "accountHolderName")?.value || "").trim();
    const accountNumber = (document.getElementById(isDiffForm ? "diffAccountNumber" : "accountNumber")?.value || "").trim();
    const ifscCode = (document.getElementById(isDiffForm ? "diffIfscCode" : "ifscCode")?.value || "").trim();
    const bankName = (document.getElementById(isDiffForm ? "diffBankName" : "bankName")?.value || "").trim();
    const upiId = (document.getElementById(isDiffForm ? "diffUpiId" : "upiId")?.value || "").trim();

    if (!accountHolderName) {
        showWithdrawMessage("Account holder name is required", "error");
        return;
    }

    if (!upiId && (!accountNumber || !ifscCode || !bankName)) {
        showWithdrawMessage("Please provide either UPI ID or complete bank details (Account Number, IFSC, Bank Name)", "error");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : "Save Details";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
    }

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
            throw new Error(data.error || "Failed to save bank details");
        }

        showToast("Payment details saved successfully!", "success");
        switchWithdrawalMode('saved');
        await loadWithdrawalData();

    } catch (err) {
        console.error("Bank setup error:", err);
        showWithdrawMessage("Error saving payment details: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

async function deleteSavedBankDetails() {
    const confirmMessage = "This will remove your saved bank/UPI details. You will need to enter them again on your next withdrawal request.\n\nAre you sure you want to proceed?";
    if (!confirm(confirmMessage)) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const deleteBtn = document.getElementById("deleteSavedBankBtn");
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Deleting...";
    }

    try {
        const res = await fetch(`${window.API_URL}/referral/bank-details`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Failed to delete saved bank details");
        }

        const formFields = [
            "accountHolderName", "accountNumber", "ifscCode", "bankName", "upiId",
            "diffAccountHolderName", "diffAccountNumber", "diffIfscCode", "diffBankName", "diffUpiId"
        ];
        formFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        switchWithdrawalMode('saved');
        await loadWithdrawalData();
        showToast("Saved payment details removed successfully", "success");

    } catch (err) {
        console.error("Error deleting bank details:", err);
        showToast("Error removing bank details: " + err.message, "error");
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = "🗑️ Delete";
        }
    }
}
window.deleteSavedBankDetails = deleteSavedBankDetails;

async function submitWithdrawal(e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
        showToast("Login required to submit withdrawal", "error");
        return;
    }

    const amountInput = document.getElementById("withdrawalAmount");
    const amount = parseFloat(amountInput?.value || 0);

    const minWithdrawalElement = document.getElementById("minWithdrawalInfo");
    const minWithdrawalAmount = minWithdrawalElement ? parseFloat(minWithdrawalElement.textContent) : 100;

    let availableBalance = 0;
    try {
        const balanceRes = await fetch(`${window.API_URL}/referral/withdrawal-settings`, {
            headers: { "Authorization": "Bearer " + token }
        });
        const balanceData = await balanceRes.json();
        availableBalance = parseFloat(balanceData.walletBalance || 0);
    } catch (error) {
        showWithdrawMessage("Unable to verify balance. Please try again.", "error");
        return;
    }

    if (!amount || amount <= 0) {
        showWithdrawMessage("Please enter a valid withdrawal amount", "error");
        return;
    }

    if (availableBalance <= 0) {
        showWithdrawMessage("No balance available for withdrawal", "error");
        return;
    }

    if (amount < minWithdrawalAmount) {
        showWithdrawMessage(`Minimum withdrawal amount is ₹${minWithdrawalAmount}`, "error");
        return;
    }

    if (amount > availableBalance) {
        showWithdrawMessage(`Insufficient balance. Available: ₹${availableBalance.toFixed(2)}`, "error");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Request...";

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

        showToast(`Withdrawal request of ₹${amount} submitted successfully!`, "success");
        if (amountInput) amountInput.value = "";

        await loadWithdrawalData();
        await loadReferralDetails();
        loadWithdrawalHistory();

    } catch (err) {
        console.error("Withdrawal error:", err);
        showWithdrawMessage("Error: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "💰 Submit Withdrawal Request";
        }
    }
}

async function loadWithdrawalHistory() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/users/profile`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        isWithdrawalHistoryLoaded = true;

        if (res.ok && data.user && data.user.withdrawals) {
            const withdrawals = data.user.withdrawals.slice(-5).reverse();
            const historyList = document.getElementById("withdrawalHistoryList");
            if (!historyList) return;

            if (withdrawals.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state-box" style="padding: 24px; background: var(--sm-surface-warm); border-radius: var(--radius-md);">
                        <div style="font-size: 28px; margin-bottom: 6px;">📋</div>
                        <div class="empty-state-title" style="font-size: 14.5px;">No withdrawal requests yet</div>
                        <p class="empty-state-desc" style="font-size: 13px; margin-bottom: 0;">Your recent withdrawal submissions will appear here.</p>
                    </div>
                `;
                return;
            }

            historyList.innerHTML = `
                <div class="ref-table-responsive">
                    <table class="ref-table">
                        <thead>
                            <tr>
                                <th>Amount</th>
                                <th>Date Requested</th>
                                <th style="text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${withdrawals.map(w => {
                                const status = (w.status || 'pending').toLowerCase();
                                const statusClass = status === 'approved' || status === 'paid' ? 'status-pill approved' :
                                                    status === 'rejected' ? 'status-pill rejected' : 'status-pill pending';
                                const statusIcon = status === 'approved' || status === 'paid' ? '✅' :
                                                   status === 'rejected' ? '❌' : '⏳';
                                const dateStr = new Date(w.requestedAt || w.date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                });

                                return `
                                    <tr>
                                        <td style="font-weight: 700; font-size: 15px; color: var(--sm-ink);">₹${w.amount}</td>
                                        <td style="color: var(--sm-muted); font-size: 13.5px;">${dateStr}</td>
                                        <td style="text-align: center;">
                                            <span class="${statusClass}">
                                                ${statusIcon} ${status}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

    } catch (err) {
        console.error("Error loading withdrawal history:", err);
    }
}

function showWithdrawMessage(message, type = "info") {
    const msg = document.getElementById("withdrawMsg");
    if (!msg) return;

    msg.textContent = message;
    msg.style.display = "block";
    msg.style.background = type === 'error' ? 'var(--sm-danger-bg)' : 'var(--sm-success-bg)';
    msg.style.color = type === 'error' ? 'var(--sm-danger)' : 'var(--sm-success)';
    msg.style.border = `1px solid ${type === 'error' ? 'var(--sm-danger-border)' : 'var(--sm-success-border)'}`;

    setTimeout(() => {
        msg.style.display = "none";
    }, 5000);
}

// ── 7. BANK CHANGE REQUEST MODAL & API ──
function openBankChangePopup() {
    checkBankChangeStatus();
    const modal = document.getElementById("bankChangeModal");
    if (modal) modal.style.display = "flex";
}
window.openBankChangePopup = openBankChangePopup;

function closeBankChangePopup() {
    const modal = document.getElementById("bankChangeModal");
    if (modal) modal.style.display = "none";
    const form = document.getElementById("bankChangePopupForm");
    if (form) form.reset();
}
window.closeBankChangePopup = closeBankChangePopup;

async function checkBankChangeStatus() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/referral/bank-change-status`, {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        hasCheckedBankChangeStatus = true;
        const statusDiv = document.getElementById("bankChangeStatusDisplay");
        const statusContent = document.getElementById("bankChangeStatusContent");

        if (statusDiv && statusContent && data.hasRequest) {
            statusDiv.style.display = "block";

            if (data.status === 'pending') {
                statusContent.innerHTML = `
                    <div style="color: var(--sm-warning);">
                        <h4 style="margin: 0 0 6px 0; color: var(--sm-ink);">⏳ Bank Change Request Pending</h4>
                        <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Submitted:</strong> ${data.requestedAt ? new Date(data.requestedAt).toLocaleString() : 'Recently'}</p>
                        <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Reason:</strong> ${escapeHtml(data.reason || 'Not specified')}</p>
                        <small style="color: var(--sm-muted);">You cannot submit another request while one is pending review.</small>
                    </div>
                `;
            } else if (data.status === 'approved') {
                statusContent.innerHTML = `
                    <div style="color: var(--sm-success);">
                        <h4 style="margin: 0 0 6px 0; color: var(--sm-success);">✅ Request Approved</h4>
                        <p style="margin: 0 0 6px 0; font-size: 13px;">Your payout details have been updated successfully.</p>
                    </div>
                `;
            } else if (data.status === 'rejected') {
                statusContent.innerHTML = `
                    <div style="color: var(--sm-danger);">
                        <h4 style="margin: 0 0 6px 0; color: var(--sm-danger);">❌ Request Rejected</h4>
                        <p style="margin: 0; font-size: 13px;">${escapeHtml(data.adminNotes || 'Request could not be processed.')}</p>
                    </div>
                `;
            }
        } else if (statusDiv) {
            statusDiv.style.display = "none";
        }

    } catch (err) {
        console.error("Error checking bank change status:", err);
    }
}
window.checkBankChangeStatus = checkBankChangeStatus;

async function submitBankChangeRequestPopup(e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
        showToast("Login required", "error");
        return;
    }

    const accountHolderName = (document.getElementById("popupAccountHolderName")?.value || "").trim();
    const accountNumber = (document.getElementById("popupAccountNumber")?.value || "").trim();
    const ifscCode = (document.getElementById("popupIfscCode")?.value || "").trim();
    const bankName = (document.getElementById("popupBankName")?.value || "").trim();
    const upiId = (document.getElementById("popupUpiId")?.value || "").trim();
    const reason = (document.getElementById("popupChangeReason")?.value || "").trim();

    if (!accountHolderName) {
        showToast("Account holder name is required", "error");
        return;
    }

    if (!reason || reason.length < 10) {
        showToast("Please provide a reason of at least 10 characters", "error");
        return;
    }

    if (!upiId && (!accountNumber || !ifscCode || !bankName)) {
        showToast("Please provide either complete bank details or UPI ID", "error");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
    }

    try {
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

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to submit bank change request");
        }

        showToast("Bank change request submitted for admin approval", "success");
        closeBankChangePopup();
        checkBankChangeStatus();

    } catch (err) {
        console.error("Bank change request error:", err);
        showToast("Error: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "📤 Submit Request";
        }
    }
}

// ── 8. EVENT LISTENERS & MODAL INITIALIZATION ──
function initModalsAndEvents() {
    const bankDetailsForm = document.getElementById("bankDetailsForm");
    if (bankDetailsForm) {
        bankDetailsForm.addEventListener("submit", setupBankDetails);
    }

    const differentBankDetailsForm = document.getElementById("differentBankDetailsForm");
    if (differentBankDetailsForm) {
        differentBankDetailsForm.addEventListener("submit", setupBankDetails);
    }

    const withdrawalForm = document.getElementById("withdrawalForm");
    if (withdrawalForm) {
        withdrawalForm.addEventListener("submit", submitWithdrawal);
    }

    const bankChangePopupForm = document.getElementById("bankChangePopupForm");
    if (bankChangePopupForm) {
        bankChangePopupForm.addEventListener("submit", submitBankChangeRequestPopup);
    }

    // Modal backdrop click to close
    const bankModal = document.getElementById("bankChangeModal");
    if (bankModal) {
        bankModal.addEventListener("click", (e) => {
            if (e.target === bankModal) closeBankChangePopup();
        });
    }

    // Escape key closes open modals
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeBankChangePopup();
        }
    });
}

// ── 9. TOAST NOTIFICATION UTILITY ──
function showToast(message, type = "info") {
    let container = document.getElementById("refToastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "refToastContainer";
        container.className = "ref-toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "ref-toast";

    const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 300);
    }, 3500);
}
window.showToast = showToast;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}