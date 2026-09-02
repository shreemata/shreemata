// public/js/admin-vip-cards.js

const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

// Security check
if (!token || !user || user.role !== 'admin') {
    alert("Unauthorized: Admin access only");
    window.location.href = "/index.html";
}

let allVipCards = [];

// DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    // Render Navigation
    if (typeof initAdminNavigation === 'function') {
        initAdminNavigation('vip-cards');
    }
    
    // Load VIP cards and users
    loadVipCards();
    loadUsersDropdown();
});

// Fetch VIP Cards
async function loadVipCards() {
    try {
        const response = await fetch(`${API_URL}/admin/vip-cards`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 403) {
                alert("Unauthorized admin access denied.");
                window.location.href = "/index.html";
                return;
            }
            throw new Error("Failed to fetch VIP cards");
        }

        const data = await response.json();
        allVipCards = data.cards || [];
        renderCardsTable(allVipCards);

    } catch (error) {
        console.error("Error loading VIP cards:", error);
        document.getElementById("loadingSpinner").innerHTML = `
            <p style="color: #ef4444; font-weight: bold;">Error loading dashboard data. Please refresh.</p>
        `;
    }
}

// Render the HTML Table
function renderCardsTable(cards) {
    const tbody = document.getElementById("vipCardsTableBody");
    tbody.innerHTML = "";

    document.getElementById("loadingSpinner").style.display = "none";
    document.getElementById("dashboardContent").style.display = "block";

    if (cards.length === 0) {
        document.getElementById("vipCardsTable").style.display = "none";
        document.getElementById("noCardsMessage").style.display = "block";
        return;
    }

    document.getElementById("vipCardsTable").style.display = "table";
    document.getElementById("noCardsMessage").style.display = "none";

    cards.forEach((card, index) => {
        const tr = document.createElement("tr");
        
        const issueDate = card.issueDate ? new Date(card.issueDate).toLocaleDateString() : '-';
        const expiryDate = card.expiryDate ? new Date(card.expiryDate).toLocaleDateString() : '-';
        
        const holderName = card.userId ? card.userId.name : 'Unknown User';
        const holderEmail = card.userId ? card.userId.email : '-';
        
        let tierClass = 'tier-platinum';
        if (card.cardTier === 'Gold') tierClass = 'tier-gold';
        if (card.cardTier === 'Diamond') tierClass = 'tier-diamond';
        if (card.cardTier === 'VIP') tierClass = 'tier-vip';

        let statusClass = 'badge-active';
        if (card.status === 'Revoked') statusClass = 'badge-revoked';
        if (card.status === 'Expired') statusClass = 'badge-expired';

        // Action button based on status
        let actionBtn = '';
        if (card.status === 'Active') {
            actionBtn = `<button class="btn btn-danger" onclick="updateCardStatus('${card._id}', 'Revoked')" style="padding: 6px 12px; font-size: 12px;">Revoke</button>`;
        } else if (card.status === 'Revoked') {
            actionBtn = `<button class="btn" onclick="updateCardStatus('${card._id}', 'Active')" style="padding: 6px 12px; font-size: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">Activate</button>`;
        }

        tr.innerHTML = `
            <td><strong>${index + 1}</strong></td>
            <td><strong style="color: #4f46e5; font-family: monospace; font-size: 14px; letter-spacing: 0.5px;">${escapeHtml(card.cardNumber)}</strong></td>
            <td><strong>${escapeHtml(holderName)}</strong></td>
            <td>${escapeHtml(holderEmail)}</td>
            <td><span class="tier-badge ${tierClass}">${escapeHtml(card.cardTier)}</span></td>
            <td>${issueDate}</td>
            <td>${expiryDate}</td>
            <td>
                <span class="badge ${statusClass}">
                    ${card.status}
                </span>
            </td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Filter table entries
function filterCards() {
    const query = document.getElementById("searchInput").value.toLowerCase().trim();
    if (!query) {
        renderCardsTable(allVipCards);
        return;
    }

    const filtered = allVipCards.filter(card => {
        const holderName = card.userId ? card.userId.name : '';
        const holderEmail = card.userId ? card.userId.email : '';
        return card.cardNumber.toLowerCase().includes(query) ||
               holderName.toLowerCase().includes(query) ||
               holderEmail.toLowerCase().includes(query);
    });

    renderCardsTable(filtered);
}

// Fetch users for dropdown select selection
async function loadUsersDropdown() {
    try {
        const response = await fetch(`${API_URL}/admin/users?limit=200`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error("Failed to fetch users");

        const data = await response.json();
        const users = data.users || [];
        const userSelect = document.getElementById("userSelect");
        
        userSelect.innerHTML = '<option value="" disabled selected>-- Select a Customer --</option>';
        
        users.forEach(user => {
            const option = document.createElement("option");
            option.value = user._id;
            option.textContent = `${user.name} (${user.email})`;
            userSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Error loading users for select dropdown:", error);
        document.getElementById("userSelect").innerHTML = '<option value="" disabled>Error loading users</option>';
    }
}

// Open modal
function openIssueModal() {
    document.getElementById("issueCardForm").reset();
    document.getElementById("issueCardModal").classList.add("show");
}

// Close modal
function closeIssueModal() {
    document.getElementById("issueCardModal").classList.remove("show");
}

// Handle Form Submission (Issue Card)
async function handleIssueCard(event) {
    event.preventDefault();
    
    const userId = document.getElementById("userSelect").value;
    const cardTier = document.getElementById("tierSelect").value;
    const expiryMonths = document.getElementById("expirySelect").value;
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Issuing...';
    
    try {
        const response = await fetch(`${API_URL}/admin/vip-cards/issue`, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ userId, cardTier, expiryMonths })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || "Failed to issue card");
        }
        
        closeIssueModal();
        showAlert("✅ VIP Membership Card issued successfully!", "success");
        loadVipCards(); // Reload cards
        
    } catch (error) {
        console.error("Error issuing VIP card:", error);
        showAlert(`❌ Error: ${error.message}`, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Issue Card';
    }
}

// Update Card Status (e.g. Revoked or Active)
async function updateCardStatus(cardId, status) {
    const actionText = status === 'Revoked' ? 'revoke' : 'activate';
    if (!confirm(`Are you sure you want to ${actionText} this VIP Card?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/vip-cards/${cardId}/status`, {
            method: 'PUT',
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || "Failed to update card status");
        }
        
        showAlert(`✅ VIP Card status successfully set to ${status}!`, "success");
        loadVipCards(); // Reload cards
        
    } catch (error) {
        console.error("Error updating VIP card status:", error);
        showAlert(`❌ Error: ${error.message}`, "error");
    }
}

// Alert Notification helper
function showAlert(message, type = 'success') {
    // Check if showAlert is already defined on index page
    const alertDiv = document.createElement("div");
    alertDiv.style.cssText = `
        position: fixed;
        bottom: 25px;
        right: 25px;
        padding: 16px 24px;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
        transform: translateY(100px);
        opacity: 0;
    `;
    
    if (type === 'success') {
        alertDiv.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else {
        alertDiv.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    }
    
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    // Animate in
    setTimeout(() => {
        alertDiv.style.transform = 'translateY(0)';
        alertDiv.style.opacity = '1';
    }, 10);
    
    // Animate out
    setTimeout(() => {
        alertDiv.style.transform = 'translateY(100px)';
        alertDiv.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(alertDiv);
        }, 300);
    }, 4000);
}

// Escape helper
function escapeHtml(string) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(string).replace(/[&<>"']/g, function(m) { return map[m]; });
}
