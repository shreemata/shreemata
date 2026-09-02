// Admin Bank Requests Management
let currentFilter = 'pending';
let allRequests = [];

document.addEventListener("DOMContentLoaded", () => {
    checkAdminAuth();
    loadBankRequests();
});

function checkAdminAuth() {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!token || !user || user.role !== "admin") {
        alert("Admin access required");
        window.location.href = "/login.html";
        return;
    }

    document.getElementById("userName").textContent = `Hello, ${user.name}`;

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/";
        });
    }
}

async function loadBankRequests(status = 'pending') {
    const token = localStorage.getItem("token");
    
    try {
        console.log('🔍 Admin: Loading bank requests with status:', status);
        console.log('🔍 Admin: API URL:', window.API_URL);
        console.log('🔍 Admin: Token exists:', !!token);
        
        document.getElementById("loading").style.display = "block";
        document.getElementById("requests-container").style.display = "none";
        document.getElementById("no-requests").style.display = "none";

        const url = `${window.API_URL}/referral/admin/bank-change-requests?status=${status}&limit=50`;
        console.log('🔍 Admin: Fetching from URL:', url);
        
        const res = await fetch(url, {
            headers: { "Authorization": "Bearer " + token }
        });

        console.log('🔍 Admin: Response status:', res.status);
        console.log('🔍 Admin: Response ok:', res.ok);

        if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Admin: Error response:', errorText);
            throw new Error(`Failed to load bank requests: ${res.status} - ${errorText}`);
        }

        const data = await res.json();
        console.log('🔍 Admin: Received data:', data);
        allRequests = data.requests || [];
        console.log('🔍 Admin: All requests:', allRequests);

        // Update counts
        await updateRequestCounts();

        document.getElementById("loading").style.display = "none";

        if (allRequests.length === 0) {
            console.log('🔍 Admin: No requests found, showing no-requests div');
            document.getElementById("no-requests").style.display = "block";
            return;
        }

        console.log('🔍 Admin: Displaying', allRequests.length, 'requests');
        displayRequests(allRequests);

    } catch (err) {
        console.error("❌ Admin: Error loading bank requests:", err);
        document.getElementById("loading").style.display = "none";
        alert("Error loading bank requests: " + err.message);
    }
}

async function updateRequestCounts() {
    const token = localStorage.getItem("token");
    
    try {
        // Get counts for all statuses
        const statuses = ['pending', 'approved', 'rejected'];
        
        for (const status of statuses) {
            const res = await fetch(`${window.API_URL}/referral/admin/bank-change-requests?status=${status}&limit=1`, {
                headers: { "Authorization": "Bearer " + token }
            });
            
            if (res.ok) {
                const data = await res.json();
                document.getElementById(`count-${status}`).textContent = data.pagination.totalRequests || 0;
            }
        }
    } catch (err) {
        console.error("Error updating counts:", err);
    }
}

function displayRequests(requests) {
    const container = document.getElementById("requests-container");
    container.style.display = "block";
    container.innerHTML = "";

    requests.forEach(request => {
        const requestCard = createRequestCard(request);
        container.appendChild(requestCard);
    });
}

function createRequestCard(request) {
    const card = document.createElement("div");
    card.className = "request-card";
    
    const statusClass = `status-${request.changeRequest.status}`;
    const statusIcon = request.changeRequest.status === 'pending' ? '⏳' : 
                     request.changeRequest.status === 'approved' ? '✅' : '❌';
    
    const requestDate = new Date(request.changeRequest.requestedAt).toLocaleString();
    const processedDate = request.changeRequest.processedAt ? 
        new Date(request.changeRequest.processedAt).toLocaleString() : null;

    card.innerHTML = `
        <div class="request-header">
            <div class="user-info-card">
                <div class="user-name">${request.name}</div>
                <div class="user-email">${request.email}</div>
                <div class="user-ref-code">REF: ${request.referralCode}</div>
            </div>
            <div class="status-badge ${statusClass}">
                ${statusIcon} ${request.changeRequest.status}
            </div>
        </div>

        <div class="bank-details-section">
            <div class="bank-details-box current-details">
                <div class="bank-details-title">
                    🏦 Current Bank Details
                </div>
                ${formatBankDetails(request.currentBankDetails)}
            </div>
            
            <div class="bank-details-box new-details">
                <div class="bank-details-title">
                    🔄 Requested New Details
                </div>
                ${formatBankDetails(request.changeRequest.newBankDetails)}
            </div>
        </div>

        <div class="reason-section">
            <div class="reason-title">📝 Reason for Change:</div>
            <div class="reason-text">${request.changeRequest.reason}</div>
        </div>

        ${request.changeRequest.status === 'pending' ? `
            <div class="admin-notes-section">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">
                    Admin Notes (Optional):
                </label>
                <textarea 
                    id="notes-${request.userId}" 
                    class="admin-notes-input" 
                    placeholder="Add any notes about this request..."
                ></textarea>
            </div>
            
            <div class="action-buttons">
                <button class="btn btn-approve" onclick="processRequest('${request.userId}', 'approve')">
                    ✅ Approve Request
                </button>
                <button class="btn btn-reject" onclick="processRequest('${request.userId}', 'reject')">
                    ❌ Reject Request
                </button>
            </div>
        ` : ''}

        ${request.changeRequest.adminNotes ? `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #2196f3;">
                <div style="font-weight: bold; color: #1976d2; margin-bottom: 8px;">📝 Admin Notes:</div>
                <div style="color: #1976d2;">${request.changeRequest.adminNotes}</div>
            </div>
        ` : ''}

        <div class="request-meta">
            <span>📅 Requested: ${requestDate}</span>
            ${processedDate ? `<span>✅ Processed: ${processedDate}</span>` : ''}
        </div>
    `;

    return card;
}

function formatBankDetails(details) {
    if (!details) return '<div style="color: #999; font-style: italic;">No details available</div>';
    
    let html = '';
    
    if (details.accountHolderName) {
        html += `<div class="bank-detail-item">
            <span class="bank-detail-label">👤 Account Holder:</span>
            ${details.accountHolderName}
        </div>`;
    }
    
    if (details.accountNumber) {
        html += `<div class="bank-detail-item">
            <span class="bank-detail-label">🏦 Account Number:</span>
            ${details.accountNumber}
        </div>`;
    }
    
    if (details.bankName) {
        html += `<div class="bank-detail-item">
            <span class="bank-detail-label">🏛️ Bank Name:</span>
            ${details.bankName}
        </div>`;
    }
    
    if (details.ifscCode) {
        html += `<div class="bank-detail-item">
            <span class="bank-detail-label">🔢 IFSC Code:</span>
            ${details.ifscCode}
        </div>`;
    }
    
    if (details.upiId) {
        html += `<div class="bank-detail-item">
            <span class="bank-detail-label">📱 UPI ID:</span>
            ${details.upiId}
        </div>`;
    }
    
    return html || '<div style="color: #999; font-style: italic;">No details provided</div>';
}

function filterRequests(status) {
    currentFilter = status;
    
    // Update tab states
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(`tab-${status}`).classList.add('active');
    
    // Load requests for the selected status
    loadBankRequests(status);
}

async function processRequest(userId, action) {
    const token = localStorage.getItem("token");
    
    console.log('🔄 Admin: Processing request', { userId, action });
    
    if (!confirm(`Are you sure you want to ${action} this bank detail change request?`)) {
        return;
    }
    
    const adminNotes = document.getElementById(`notes-${userId}`)?.value.trim() || '';
    console.log('🔄 Admin: Admin notes:', adminNotes);
    
    try {
        const url = `${window.API_URL}/referral/admin/process-bank-change/${userId}`;
        console.log('🔄 Admin: Sending request to:', url);
        
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({
                action,
                adminNotes
            })
        });

        console.log('🔄 Admin: Response status:', res.status);
        const data = await res.json();
        console.log('🔄 Admin: Response data:', data);

        if (!res.ok) {
            throw new Error(data.error || `Failed to ${action} request`);
        }

        // Show success message
        alert(`✅ Request ${action}d successfully!\n\nThe user has been notified via email.`);
        
        // Add a small delay to ensure database update completes
        setTimeout(async () => {
            console.log('🔄 Admin: Reloading all requests...');
            
            // Reload both the current filter and update counts
            await Promise.all([
                loadBankRequests(currentFilter),
                updateRequestCounts()
            ]);
            
            console.log('✅ Admin: Data reloaded successfully');
        }, 1000);

    } catch (err) {
        console.error(`❌ Admin: Error ${action}ing request:`, err);
        alert(`Error: ${err.message}`);
    }
}

// Auto-refresh every 30 seconds for pending requests
setInterval(() => {
    if (currentFilter === 'pending') {
        updateRequestCounts();
    }
}, 30000);