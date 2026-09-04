document.addEventListener("DOMContentLoaded", () => {
    loadWithdrawals();
    setupEventListeners();
});

let allWithdrawals = [];
let filteredWithdrawals = [];
let currentVipPage = 1;
const vipRowsPerPage = 10;

function setupEventListeners() {
    // Real-time search
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    
    // Date change listeners
    document.getElementById('fromDate').addEventListener('change', applyFilters);
    document.getElementById('toDate').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);

    // Pagination buttons
    document.getElementById('vipPrevPageBtn')?.addEventListener('click', () => {
        if (currentVipPage > 1) {
            currentVipPage--;
            displayWithdrawals();
        }
    });

    document.getElementById('vipNextPageBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredWithdrawals.length / vipRowsPerPage) || 1;
        if (currentVipPage < totalPages) {
            currentVipPage++;
            displayWithdrawals();
        }
    });
}

async function loadWithdrawals() {
    const token = localStorage.getItem("token");

    try {
        const res = await fetch("/api/admin/withdrawals", {
            headers: { "Authorization": "Bearer " + token }
        });

        const data = await res.json();
        allWithdrawals = data;
        filteredWithdrawals = [...data];
        
        updateStatistics();
        displayWithdrawals();
        
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        alert('Error loading withdrawal data');
    }
}

function updateStatistics() {
    const pending = allWithdrawals.filter(item => item.status === 'pending');
    const approved = allWithdrawals.filter(item => item.status === 'approved');
    
    const pendingAmount = pending.reduce((sum, item) => sum + (item.amount || 0), 0);
    const approvedAmount = approved.reduce((sum, item) => sum + (item.amount || 0), 0);
    
    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('pendingAmount').textContent = pendingAmount.toLocaleString();
    document.getElementById('approvedCount').textContent = approved.length;
    document.getElementById('approvedAmount').textContent = approvedAmount.toLocaleString();
}

function displayWithdrawals() {
    const tbody = document.getElementById("withdrawTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Reset master checkbox and bulk delete button
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateSelectedCount();

    const totalPages = Math.ceil(filteredWithdrawals.length / vipRowsPerPage) || 1;
    if (currentVipPage > totalPages) currentVipPage = totalPages;
    if (currentVipPage < 1) currentVipPage = 1;

    const start = (currentVipPage - 1) * vipRowsPerPage;
    const paginatedItems = filteredWithdrawals.slice(start, start + vipRowsPerPage);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #888; padding: 20px;">No withdrawal requests found.</td></tr>`;
    } else {
        paginatedItems.forEach((item, index) => {
            const tr = document.createElement("tr");
            const originalIndex = allWithdrawals.indexOf(item);
            const displayIndex = start + index + 1;
            
            // Calculate total earnings for display
            const totalEarnings = item.purchaseEarnings ? item.purchaseEarnings.totalEarnings : 0;

            const scannerImage = item.scannerImage || item.qrCodeData || (item.paymentDetails && item.paymentDetails.scannerImage) || null;
            const scannerHtml = scannerImage 
                ? `<a href="${scannerImage}" target="_blank" class="scanner-preview-link" title="Click to view full scanner">
                     <img src="${scannerImage}" alt="User Scanner" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #d4af37;" />
                   </a>`
                : `<span class="text-muted" style="color: #888; font-size: 11px;">No Scanner</span>`;

            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="row-checkbox" data-user-id="${item.userId}" data-withdraw-id="${item.withdrawId}" data-status="${item.status}" onchange="updateSelectedCount()" style="cursor: pointer; width: 16px; height: 16px;">
                </td>
                <td>${displayIndex}</td>
                <td>
                    ${item.name}
                    <br><small style="color: #28a745; font-weight: 600; font-size: 11px;">💰 Earned: ₹${totalEarnings}</small>
                </td>
                <td>${item.email}</td>
                <td>₹${item.amount}</td>
                <td>${scannerHtml}</td>
                <td>${new Date(item.date).toLocaleString()}</td>
                <td>
                    <span class="status-badge status-${item.status}">${item.status}</span>
                </td>
                <td>
                    <button class="view-btn" onclick="viewUserDetails(${originalIndex})">👁️ View</button>
                </td>
                <td>
                    ${item.status === "pending" ? `
                        <button class="approve-btn" onclick="approve('${item.userId}','${item.withdrawId}')">✅ Approve</button>
                        <button class="reject-btn" onclick="rejectWithdraw('${item.userId}','${item.withdrawId}')">❌ Reject</button>
                        <button class="delete-action-btn" onclick="deleteSingleWithdrawal('${item.userId}','${item.withdrawId}','${item.status}')">🗑️ Delete</button>
                    ` : `
                        <button class="delete-action-btn" onclick="deleteSingleWithdrawal('${item.userId}','${item.withdrawId}','${item.status}')">🗑️ Delete</button>
                    `}
                </td>
            `;

            tbody.appendChild(tr);
        });
    }
    
    // Store data globally for modal access
    window.withdrawalsData = allWithdrawals;
    window.allVipWithdrawals = allWithdrawals;

    // Update pagination controls
    const indicator = document.getElementById('vipPageIndicator');
    const prevBtn = document.getElementById('vipPrevPageBtn');
    const nextBtn = document.getElementById('vipNextPageBtn');
    if (indicator) indicator.innerText = `Page ${currentVipPage} of ${totalPages} (${filteredWithdrawals.length} records)`;
    if (prevBtn) prevBtn.disabled = currentVipPage === 1;
    if (nextBtn) nextBtn.disabled = currentVipPage >= totalPages;
}

function applyFilters() {
    currentVipPage = 1;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    filteredWithdrawals = allWithdrawals.filter(item => {
        // Search filter
        const matchesSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) ||
            item.email.toLowerCase().includes(searchTerm);
        
        // Date filter
        const itemDate = new Date(item.date);
        const matchesFromDate = !fromDate || itemDate >= new Date(fromDate);
        const matchesToDate = !toDate || itemDate <= new Date(toDate + 'T23:59:59');
        
        // Status filter
        const matchesStatus = !statusFilter || item.status === statusFilter;
        
        return matchesSearch && matchesFromDate && matchesToDate && matchesStatus;
    });
    
    displayWithdrawals();
}

function resetFilters() {
    currentVipPage = 1;
    document.getElementById('searchInput').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    document.getElementById('statusFilter').value = '';
    
    filteredWithdrawals = [...allWithdrawals];
    displayWithdrawals();
}

async function approve(userId, withdrawId) {
    const token = localStorage.getItem("token");

    await fetch("/api/admin/withdrawals/approve", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ userId, withdrawId })
    });

    alert("Withdrawal approved!");
    loadWithdrawals();
}

async function rejectWithdraw(userId, withdrawId) {
    const token = localStorage.getItem("token");

    await fetch("/api/admin/withdrawals/reject", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ userId, withdrawId })
    });

    alert("Withdrawal rejected & refunded!");
    loadWithdrawals();
}

// Toggle select all checkboxes
function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
    updateSelectedCount();
}

// Update selected count and bulk delete button visibility
function updateSelectedCount() {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    const bulkBtn = document.getElementById('bulkDeleteBtn');
    const countSpan = document.getElementById('selectedCount');
    const selectAll = document.getElementById('selectAllCheckbox');

    if (countSpan) countSpan.textContent = selected.length;
    if (bulkBtn) {
        bulkBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
    }

    const allCheckboxes = document.querySelectorAll('.row-checkbox');
    if (selectAll && allCheckboxes.length > 0) {
        selectAll.checked = (selected.length === allCheckboxes.length);
    }
}

// Delete single withdrawal request
async function deleteSingleWithdrawal(userId, withdrawId, status) {
    const token = localStorage.getItem("token");
    if (!token) return;

    let confirmMsg = "Are you sure you want to permanently delete this withdrawal request?";
    if (status === "pending") {
        confirmMsg = "⚠️ This is a PENDING withdrawal request.\n\nDeleting it will remove the request and automatically refund the withdrawal amount back to the user's wallet.\n\nAre you sure you want to proceed?";
    }

    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`/api/admin/withdrawals/${userId}/${withdrawId}`, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            }
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message || "Withdrawal request deleted successfully!");
            loadWithdrawals();
        } else {
            alert(data.error || "Failed to delete withdrawal request");
        }
    } catch (err) {
        console.error("Error deleting withdrawal request:", err);
        alert("Error deleting withdrawal request");
    }
}

// Bulk delete selected withdrawals
async function deleteSelectedWithdrawals() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const selected = Array.from(document.querySelectorAll('.row-checkbox:checked'));
    if (selected.length === 0) {
        alert("Please select at least one withdrawal request to delete.");
        return;
    }

    const hasPending = selected.some(cb => cb.dataset.status === "pending");
    let confirmMsg = `Are you sure you want to delete ${selected.length} selected withdrawal request(s)?`;
    if (hasPending) {
        confirmMsg = `⚠️ You have selected ${selected.length} request(s), including PENDING requests.\n\nDeleting pending requests will automatically refund the amounts to the respective users' wallets.\n\nAre you sure you want to proceed?`;
    }

    if (!confirm(confirmMsg)) return;

    const items = selected.map(cb => ({
        userId: cb.dataset.userId,
        withdrawId: cb.dataset.withdrawId
    }));

    try {
        const res = await fetch("/api/admin/withdrawals/bulk-delete", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ items })
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message || `Deleted ${data.deletedCount || items.length} request(s) successfully!`);
            const selectAll = document.getElementById('selectAllCheckbox');
            if (selectAll) selectAll.checked = false;
            loadWithdrawals();
        } else {
            alert(data.error || "Failed to delete selected requests");
        }
    } catch (err) {
        console.error("Error bulk deleting requests:", err);
        alert("Error deleting selected requests");
    }
}

// Clear withdrawals by status
async function clearWithdrawals(status = 'all') {
    const token = localStorage.getItem("token");
    if (!token) return;

    let confirmMsg = `Are you sure you want to clear ALL withdrawal requests from the list?`;
    if (status === 'rejected') {
        confirmMsg = `Are you sure you want to clear all REJECTED withdrawal requests?`;
    } else if (status === 'approved') {
        confirmMsg = `Are you sure you want to clear all APPROVED withdrawal requests?`;
    }

    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch("/api/admin/withdrawals/clear-all", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message || "Withdrawal requests cleared successfully!");
            const selectAll = document.getElementById('selectAllCheckbox');
            if (selectAll) selectAll.checked = false;
            loadWithdrawals();
        } else {
            alert(data.error || "Failed to clear withdrawal requests");
        }
    } catch (err) {
        console.error("Error clearing withdrawals:", err);
        alert("Error clearing withdrawal requests");
    }
}

function viewUserDetails(index) {
    try {
        const item = window.withdrawalsData[index];
        
        // Populate modal with user details
        document.getElementById('modalUserName').textContent = item.name || 'N/A';
        document.getElementById('modalUserEmail').textContent = item.email || 'N/A';
        document.getElementById('modalAmount').textContent = `₹${item.amount || 0}`;
        document.getElementById('modalDateTime').textContent = new Date(item.date).toLocaleString() || 'N/A';
        
        // Purchase Earnings Information
        if (item.purchaseEarnings) {
            document.getElementById('modalDirectCommission').textContent = `₹${item.purchaseEarnings.directCommission || 0}`;
            document.getElementById('modalTreeCommission').textContent = `₹${item.purchaseEarnings.treeCommission || 0}`;
            document.getElementById('modalTotalEarnings').textContent = `₹${item.purchaseEarnings.totalEarnings || 0}`;
            document.getElementById('modalCurrentWallet').textContent = `₹${item.purchaseEarnings.currentWallet || 0}`;
        } else {
            document.getElementById('modalDirectCommission').textContent = '₹0';
            document.getElementById('modalTreeCommission').textContent = '₹0';
            document.getElementById('modalTotalEarnings').textContent = '₹0';
            document.getElementById('modalCurrentWallet').textContent = '₹0';
        }
        
        // UPI Details
        const upiElement = document.getElementById('modalUpi');
        const upiCopyBtn = upiElement.nextElementSibling;
        const upiVal = item.upi || item.upiId || '';

        if (upiVal) {
            upiElement.textContent = upiVal;
            upiCopyBtn.style.display = 'inline-block';
        } else {
            upiElement.textContent = 'Not provided';
            upiCopyBtn.style.display = 'none';
        }

        // QR Code Display Container & Fallback Note
        const qrContainerEl = document.getElementById('adminQrContainer');
        const qrImageEl = document.getElementById('adminQrImage');
        const qrOpenLink = document.getElementById('adminQrOpenLink');
        const noQrNoteEl = document.getElementById('adminNoQrNote');

        // Reset elements first to prevent previous image lingering
        if (qrImageEl) qrImageEl.src = '';
        if (qrOpenLink) qrOpenLink.href = '#';

        const scannerSrc = item.scannerImageUrl || item.scannerImage || item.qrCodeData || item.qrCode || item.paymentProof || (item.paymentDetails && (item.paymentDetails.scannerImageUrl || item.paymentDetails.scannerImage)) || null;

        if (scannerSrc) {
            if (qrImageEl) qrImageEl.src = scannerSrc;
            if (qrOpenLink) qrOpenLink.href = scannerSrc;
            if (qrContainerEl) qrContainerEl.style.display = 'block';
            if (noQrNoteEl) noQrNoteEl.style.display = 'none';
        } else {
            if (qrContainerEl) qrContainerEl.style.display = 'none';
            if (noQrNoteEl) noQrNoteEl.style.display = 'block';
        }
        
        // Bank Details
        document.getElementById('modalBankName').textContent = item.bankName || 'Not provided';
        
        const bankElement = document.getElementById('modalBankAccount');
        const bankCopyBtn = bankElement.nextElementSibling;
        if (item.bank) {
            bankElement.textContent = item.bank;
            bankCopyBtn.style.display = 'inline-block';
        } else {
            bankElement.textContent = 'Not provided';
            bankCopyBtn.style.display = 'none';
        }
        
        const ifscElement = document.getElementById('modalIfsc');
        const ifscCopyBtn = ifscElement.nextElementSibling;
        if (item.ifsc) {
            ifscElement.textContent = item.ifsc;
            ifscCopyBtn.style.display = 'inline-block';
        } else {
            ifscElement.textContent = 'Not provided';
            ifscCopyBtn.style.display = 'none';
        }
        
        // Show modal
        document.getElementById('userDetailsModal').style.display = 'flex';
    } catch (error) {
        console.error('Error parsing user details:', error);
        alert('Error loading user details');
    }
}

function closeModal() {
    const qrContainerEl = document.getElementById('adminQrContainer');
    const qrImageEl = document.getElementById('adminQrImage');
    const qrOpenLink = document.getElementById('adminQrOpenLink');
    const noQrNoteEl = document.getElementById('adminNoQrNote');

    if (qrImageEl) qrImageEl.src = '';
    if (qrOpenLink) qrOpenLink.href = '#';
    if (qrContainerEl) qrContainerEl.style.display = 'none';
    if (noQrNoteEl) noQrNoteEl.style.display = 'none';

    document.getElementById('userDetailsModal').style.display = 'none';
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess();
        }).catch(() => {
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopySuccess();
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        alert('Failed to copy to clipboard');
    }
    
    document.body.removeChild(textArea);
}

function showCopySuccess() {
    // Create temporary success message
    const successMsg = document.createElement('div');
    successMsg.textContent = '✅ Copied to clipboard!';
    successMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
        document.body.removeChild(successMsg);
    }, 2000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('userDetailsModal');
    if (event.target === modal) {
        closeModal();
    }
}
