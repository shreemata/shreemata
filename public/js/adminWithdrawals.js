document.addEventListener("DOMContentLoaded", () => {
    loadWithdrawals();
    setupEventListeners();
});

let allWithdrawals = [];
let filteredWithdrawals = [];

function setupEventListeners() {
    // Real-time search
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    
    // Date change listeners
    document.getElementById('fromDate').addEventListener('change', applyFilters);
    document.getElementById('toDate').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
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
    tbody.innerHTML = "";

    filteredWithdrawals.forEach((item, index) => {
        const tr = document.createElement("tr");
        const originalIndex = allWithdrawals.indexOf(item);
        
        // Calculate total earnings for display
        const totalEarnings = item.purchaseEarnings ? item.purchaseEarnings.totalEarnings : 0;

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>
                ${item.name}
                <br><small style="color: #28a745; font-weight: 600; font-size: 11px;">💰 Earned: ₹${totalEarnings}</small>
            </td>
            <td>${item.email}</td>
            <td>₹${item.amount}</td>
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
                ` : "—"}
            </td>
        `;

        tbody.appendChild(tr);
    });
    
    // Store data globally for modal access
    window.withdrawalsData = allWithdrawals;
}

function applyFilters() {
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
        if (item.upi) {
            upiElement.textContent = item.upi;
            upiCopyBtn.style.display = 'inline-block';
        } else {
            upiElement.textContent = 'Not provided';
            upiCopyBtn.style.display = 'none';
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
