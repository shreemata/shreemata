// API_URL is already defined in config.js

let currentPage = 1;
let currentTab = 'all';
let currentFilters = {
    startDate: null,
    endDate: null
};
let paginationData = null;

document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadCommissions();
});

function checkAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!token || !user) {
        alert("Please login to view commission history");
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

function updateCartCount() {
    const cart = typeof getCart === 'function' ? getCart() : JSON.parse(localStorage.getItem("cart") || "[]");
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountEl = document.getElementById("cartCount");
    if (cartCountEl) cartCountEl.textContent = count;
}

async function loadCommissions() {
    const token = localStorage.getItem("token");
    const loading = document.getElementById("loadingCommissions");
    const content = document.getElementById("commissionsContent");
    const noCommissions = document.getElementById("noCommissions");

    try {
        // Build query parameters
        const params = new URLSearchParams({
            page: currentPage,
            limit: 20
        });

        if (currentTab !== 'all') {
            params.append('type', currentTab);
        }

        if (currentFilters.startDate) {
            params.append('startDate', currentFilters.startDate);
        }

        if (currentFilters.endDate) {
            params.append('endDate', currentFilters.endDate);
        }

        const res = await fetch(`${window.API_URL}/referral/commissions?${params.toString()}`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (!res.ok) {
            throw new Error("Failed to load commissions");
        }

        const data = await res.json();

        loading.style.display = "none";

        // Update summary
        document.getElementById("totalEarnings").textContent = parseFloat(data.summary.totalCommission || 0).toFixed(2);
        document.getElementById("totalCount").textContent = data.summary.directCommissionCount + data.summary.treeCommissionCount;
        document.getElementById("directTotal").textContent = parseFloat(data.summary.totalDirectCommission || 0).toFixed(2);
        document.getElementById("directCount").textContent = data.summary.directCommissionCount;
        document.getElementById("treeTotal").textContent = parseFloat(data.summary.totalTreeCommission || 0).toFixed(2);
        document.getElementById("treeCount").textContent = data.summary.treeCommissionCount;

        // Check if there are any commissions
        if (!data.commissions || data.commissions.length === 0) {
            content.style.display = "none";
            noCommissions.style.display = "block";
            return;
        }

        content.style.display = "block";
        noCommissions.style.display = "none";

        // Store pagination data
        paginationData = data.pagination;

        // Display commissions
        displayCommissions(data.commissions);

        // Update pagination
        updatePagination();

    } catch (err) {
        console.error("Error loading commissions:", err);
        loading.innerHTML = `
            <div style="color: #dc3545;">
                <div style="font-size: 48px; margin-bottom: 10px;">❌</div>
                <p>Error loading commission history. Please try again.</p>
            </div>
        `;
    }
}

function displayCommissions(commissions) {
    const tableBody = document.getElementById("commissionsTableBody");
    tableBody.innerHTML = "";

    commissions.forEach(commission => {
        const row = document.createElement("tr");
        
        const date = new Date(commission.date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const typeClass = commission.commissionType === 'direct' ? 'type-direct' : 'type-tree';
        const typeText = commission.commissionType === 'direct' ? 'Direct' : 'Tree';
        const typeIcon = commission.commissionType === 'direct' ? '⭐' : '🌳';

        const levelText = commission.commissionType === 'direct' ? 'L1' : `L${commission.level}`;
        const rateText = `${commission.percentage}%`;

        const purchaserName = commission.purchaser?.name || 'Unknown';
        const purchaserEmail = commission.purchaser?.email || '';

        const orderAmount = parseFloat(commission.orderAmount || 0).toFixed(2);
        const commissionAmount = parseFloat(commission.amount || 0).toFixed(2);
        const orderId = commission.orderId ? commission.orderId.toString().slice(-8) : 'N/A';

        row.innerHTML = `
            <td>${date}</td>
            <td>
                <span class="type-badge ${typeClass}">
                    ${typeIcon} ${typeText}
                </span>
            </td>
            <td class="amount-positive">₹${commissionAmount}</td>
            <td>
                <span style="background: #667eea; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                    ${levelText}
                </span>
            </td>
            <td style="font-weight: 600; color: #667eea;">${rateText}</td>
            <td>
                <div style="font-weight: 500;">${purchaserName}</div>
                <div style="font-size: 12px; color: #999;">${purchaserEmail}</div>
            </td>
            <td style="color: #666;">₹${orderAmount}</td>
            <td style="font-family: monospace; font-size: 12px; color: #999;">#${orderId}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

function updatePagination() {
    if (!paginationData) return;

    document.getElementById("currentPage").textContent = paginationData.currentPage;
    document.getElementById("totalPages").textContent = paginationData.totalPages;

    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    prevBtn.disabled = !paginationData.hasPrevPage;
    nextBtn.disabled = !paginationData.hasNextPage;
}

function previousPage() {
    if (paginationData && paginationData.hasPrevPage) {
        currentPage--;
        loadCommissions();
    }
}

function nextPage() {
    if (paginationData && paginationData.hasNextPage) {
        currentPage++;
        loadCommissions();
    }
}

function switchTab(tab) {
    currentTab = tab;
    currentPage = 1; // Reset to first page when switching tabs

    // Update tab button states
    document.getElementById("tabAll").classList.remove("active");
    document.getElementById("tabDirect").classList.remove("active");
    document.getElementById("tabTree").classList.remove("active");

    if (tab === 'all') {
        document.getElementById("tabAll").classList.add("active");
    } else if (tab === 'direct') {
        document.getElementById("tabDirect").classList.add("active");
    } else if (tab === 'tree') {
        document.getElementById("tabTree").classList.add("active");
    }

    loadCommissions();
}

function applyFilters() {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    currentFilters.startDate = startDate || null;
    currentFilters.endDate = endDate || null;
    currentPage = 1; // Reset to first page when applying filters

    loadCommissions();
}

function clearFilters() {
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";
    
    currentFilters.startDate = null;
    currentFilters.endDate = null;
    currentPage = 1;

    loadCommissions();
}
